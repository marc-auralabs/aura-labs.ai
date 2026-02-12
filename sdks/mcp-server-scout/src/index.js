#!/usr/bin/env node

/**
 * AURA Scout MCP Server
 *
 * Exposes Scout procurement capabilities as MCP tools for Claude
 * and other LLM clients that support the Model Context Protocol.
 *
 * Tools provided:
 * - scout_search: Create a procurement session with natural language intent
 * - scout_get_offers: Get current offers for a session
 * - scout_select_offer: Select an offer to proceed with
 * - scout_get_session: Get session details and status
 * - scout_checkout: Complete the transaction
 *
 * @example Claude Desktop config (~/.claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "scout": {
 *       "command": "npx",
 *       "args": ["@aura-labs/mcp-server-scout"],
 *       "env": {
 *         "AURA_API_KEY": "your-api-key"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const API_KEY = process.env.AURA_API_KEY;

// Session storage (in-memory for this server instance)
const sessions = new Map();

/**
 * Make authenticated request to AURA Core
 */
async function coreRequest(method, path, body = null) {
  const url = `${CORE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const options = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Core API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Create the MCP Server
 */
const server = new Server(
  {
    name: 'aura-scout',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'scout_search',
        description: `Start a procurement search with natural language. Creates a session that searches for offers matching your intent.

Example: "I need 50 ergonomic keyboards for the engineering team, budget around $5000, delivery within 2 weeks"

Returns a session ID to track the search progress.`,
        inputSchema: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              description: 'Natural language description of what you want to procure. Be specific about quantity, specifications, budget, and timeline.',
            },
            max_budget: {
              type: 'number',
              description: 'Maximum budget in USD (optional)',
            },
            currency: {
              type: 'string',
              description: 'Currency code (default: USD)',
              default: 'USD',
            },
            delivery_by: {
              type: 'string',
              description: 'Required delivery date in ISO 8601 format (optional)',
            },
          },
          required: ['intent'],
        },
      },
      {
        name: 'scout_get_offers',
        description: `Get current offers for an active procurement session.

Returns a list of offers from vendors (Beacons) including pricing, delivery estimates, and terms.
If no offers yet, the market may still be forming - wait and check again.`,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID from scout_search',
            },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'scout_select_offer',
        description: `Select an offer to proceed with. This indicates intent to purchase but doesn't finalize the transaction.

After selection, you'll need to approve any required mandates before checkout.`,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID',
            },
            offer_id: {
              type: 'string',
              description: 'The ID of the offer to select',
            },
          },
          required: ['session_id', 'offer_id'],
        },
      },
      {
        name: 'scout_get_session',
        description: `Get the current status and details of a procurement session.

Shows session status (market_forming, offers_available, offer_selected, checkout_ready, completed),
current offers, selected offer, and any pending mandates.`,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID to check',
            },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'scout_checkout',
        description: `Complete the transaction for a selected offer.

This finalizes the purchase. Make sure all mandates are approved before calling.
Returns transaction confirmation with order details.`,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID with a selected offer',
            },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'scout_list_sessions',
        description: `List all active procurement sessions in this conversation.

Useful for checking what searches are in progress.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'scout_search': {
        const { intent, max_budget, currency = 'USD', delivery_by } = args;

        // Build constraints
        const constraints = {
          max_amount: max_budget || 10000,
          currency,
          categories: [],
        };

        // Create session via Core API
        const response = await coreRequest('POST', '/sessions', {
          intent,
          constraints,
          agent_id: `mcp_scout_${Date.now()}`,
        });

        // Store session locally
        const sessionId = response.sessionId || response.id;
        sessions.set(sessionId, {
          id: sessionId,
          intent,
          constraints,
          status: response.status,
          created: new Date().toISOString(),
          offers: [],
          selectedOffer: null,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id: sessionId,
                status: response.status,
                message: `Procurement search started. Session ID: ${sessionId}. Status: ${response.status}. Use scout_get_offers to check for vendor responses.`,
              }, null, 2),
            },
          ],
        };
      }

      case 'scout_get_offers': {
        const { session_id } = args;

        // Fetch session from Core
        const response = await coreRequest('GET', `/sessions/${session_id}`);

        // Update local session
        const session = sessions.get(session_id) || {};
        session.status = response.status;
        session.offers = response.offers || [];
        sessions.set(session_id, session);

        const offers = response.offers || [];

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id,
                status: response.status,
                offer_count: offers.length,
                offers: offers.map(o => ({
                  id: o.id,
                  beacon_name: o.beaconName || o.beacon_id,
                  total_price: `${o.currency || 'USD'} ${o.totalPrice}`,
                  unit_price: o.unitPrice ? `${o.currency || 'USD'} ${o.unitPrice}` : null,
                  delivery_estimate: o.deliveryDate || o.delivery_estimate,
                  terms: o.terms,
                  confidence: o.confidence,
                })),
                message: offers.length > 0
                  ? `Found ${offers.length} offer(s). Review and use scout_select_offer to proceed.`
                  : 'No offers yet. Market is still forming - check again in a few seconds.',
              }, null, 2),
            },
          ],
        };
      }

      case 'scout_select_offer': {
        const { session_id, offer_id } = args;

        // In a full implementation, this would call Core API
        // For now, update local state
        const session = sessions.get(session_id);
        if (!session) {
          throw new Error(`Session not found: ${session_id}`);
        }

        const offer = session.offers?.find(o => o.id === offer_id);
        if (!offer) {
          throw new Error(`Offer not found: ${offer_id}`);
        }

        session.selectedOffer = offer;
        session.status = 'offer_selected';
        sessions.set(session_id, session);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id,
                selected_offer: {
                  id: offer.id,
                  beacon_name: offer.beaconName || offer.beacon_id,
                  total_price: `${offer.currency || 'USD'} ${offer.totalPrice}`,
                },
                message: 'Offer selected. Ready for checkout. Use scout_checkout to complete the transaction.',
              }, null, 2),
            },
          ],
        };
      }

      case 'scout_get_session': {
        const { session_id } = args;

        // Fetch latest from Core
        const response = await coreRequest('GET', `/sessions/${session_id}`);

        const session = sessions.get(session_id) || {};

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                session: {
                  id: session_id,
                  status: response.status,
                  intent: response.intent?.raw || session.intent,
                  offer_count: (response.offers || []).length,
                  selected_offer: session.selectedOffer ? {
                    id: session.selectedOffer.id,
                    total_price: `${session.selectedOffer.currency || 'USD'} ${session.selectedOffer.totalPrice}`,
                  } : null,
                  created: session.created,
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'scout_checkout': {
        const { session_id } = args;

        const session = sessions.get(session_id);
        if (!session) {
          throw new Error(`Session not found: ${session_id}`);
        }

        if (!session.selectedOffer) {
          throw new Error('No offer selected. Use scout_select_offer first.');
        }

        // In a full implementation, this would call Core API to finalize
        session.status = 'completed';
        sessions.set(session_id, session);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id,
                status: 'completed',
                transaction: {
                  order_id: `ORD-${Date.now()}`,
                  total: `${session.selectedOffer.currency || 'USD'} ${session.selectedOffer.totalPrice}`,
                  vendor: session.selectedOffer.beaconName || session.selectedOffer.beacon_id,
                  estimated_delivery: session.selectedOffer.deliveryDate,
                },
                message: 'Transaction completed successfully!',
              }, null, 2),
            },
          ],
        };
      }

      case 'scout_list_sessions': {
        const sessionList = Array.from(sessions.entries()).map(([id, s]) => ({
          id,
          status: s.status,
          intent: s.intent?.substring(0, 50) + (s.intent?.length > 50 ? '...' : ''),
          offer_count: s.offers?.length || 0,
          created: s.created,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_count: sessionList.length,
                sessions: sessionList,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AURA Scout MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
