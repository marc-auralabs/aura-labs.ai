/**
 * AURA Intent Service
 *
 * Parses natural language intent into structured commerce objects.
 * Uses tiered LLM approach: Granite (via Replicate) → Fallback LLM → Ask for clarification
 */

import Fastify from 'fastify';
import Replicate from 'replicate';

const config = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  replicateToken: process.env.REPLICATE_API_TOKEN,
  fallbackApiKey: process.env.FALLBACK_LLM_API_KEY,
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.85'),
};

const app = Fastify({ logger: true });

// Initialize Replicate client for Granite
const replicate = config.replicateToken
  ? new Replicate({ auth: config.replicateToken })
  : null;

// =============================================================================
// Health Check
// =============================================================================

app.get('/health', async () => ({
  status: 'healthy',
  service: 'intent-svc',
  timestamp: new Date().toISOString(),
  granite: replicate ? 'configured' : 'not_configured',
}));

// =============================================================================
// Intent Parsing Endpoint
// =============================================================================

app.post('/parse', async (request, reply) => {
  const { intent, context } = request.body || {};

  if (!intent) {
    reply.code(400);
    return { error: 'missing_intent', message: 'Please provide an intent string' };
  }

  try {
    // Tier 1: Try Granite via Replicate
    const result = await parseWithGranite(intent, context);

    if (result.confidence >= config.confidenceThreshold) {
      return {
        status: 'parsed',
        tier: 'granite',
        ...result,
      };
    }

    // Tier 2: Try fallback LLM (if configured)
    if (config.fallbackApiKey) {
      const fallbackResult = await parseWithFallback(intent, context);
      if (fallbackResult.confidence >= config.confidenceThreshold) {
        return {
          status: 'parsed',
          tier: 'fallback',
          ...fallbackResult,
        };
      }
    }

    // Tier 3: Need clarification
    return {
      status: 'needs_clarification',
      tier: 'clarification',
      parsed: result.parsed,
      confidence: result.confidence,
      clarification: {
        message: generateClarificationMessage(intent, result),
        suggestions: result.ambiguities || [],
      },
    };

  } catch (error) {
    app.log.error({ error: error.message }, 'Intent parsing failed');
    reply.code(500);
    return { error: 'parsing_failed', message: error.message };
  }
});

// =============================================================================
// Granite Parsing (Tier 1)
// =============================================================================

async function parseWithGranite(intent, context) {
  if (!replicate) {
    // No Replicate configured - return low confidence placeholder
    return {
      parsed: extractBasicIntent(intent),
      confidence: 0.3,
      ambiguities: ['LLM not configured - using basic extraction'],
    };
  }

  const systemPrompt = `You are an intent extraction system for a commerce protocol.
Extract structured data from the user's commerce intent.
Always respond with valid JSON matching this schema:

{
  "product": {
    "description": "string",
    "category": "string or null",
    "quantity": "number or null",
    "specifications": {}
  },
  "pricing": {
    "target": "number or null",
    "maximum": "number or null",
    "currency": "USD",
    "unit": "per_item or total"
  },
  "delivery": {
    "within_days": "number or null",
    "location": "string or null",
    "method_preference": "string or null"
  },
  "protocols_inferred": {
    "negotiation": ["direct", "negotiated", "auction", "rfq"],
    "payment": ["card", "invoice", "escrow"] or null,
    "fulfillment": ["digital", "shipped", "pickup"] or null
  },
  "confidence": 0.0 to 1.0,
  "ambiguities": ["list of unclear aspects"]
}`;

  try {
    const output = await replicate.run(
      'ibm-granite/granite-3.0-8b-instruct', // Adjust model as needed
      {
        input: {
          prompt: `${systemPrompt}\n\nUser intent: "${intent}"\n\nExtracted JSON:`,
          max_tokens: 500,
          temperature: 0.1, // Low temperature for determinism
        },
      }
    );

    // Parse the model output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        parsed,
        confidence: parsed.confidence || 0.5,
        ambiguities: parsed.ambiguities || [],
      };
    }

    throw new Error('No valid JSON in model output');

  } catch (error) {
    app.log.warn({ error: error.message }, 'Granite parsing failed, falling back');
    return {
      parsed: extractBasicIntent(intent),
      confidence: 0.3,
      ambiguities: ['Granite parsing failed: ' + error.message],
    };
  }
}

// =============================================================================
// Fallback LLM Parsing (Tier 2)
// =============================================================================

async function parseWithFallback(intent, context) {
  // TODO: Implement fallback to Claude/GPT API
  // For now, return slightly improved basic extraction
  const basic = extractBasicIntent(intent);
  return {
    parsed: basic,
    confidence: 0.5,
    ambiguities: ['Fallback LLM not implemented'],
  };
}

// =============================================================================
// Basic Extraction (No LLM)
// =============================================================================

function extractBasicIntent(intent) {
  const lower = intent.toLowerCase();

  // Extract quantity
  const quantityMatch = intent.match(/(\d+)\s*(units?|items?|pieces?)?/i);
  const quantity = quantityMatch ? parseInt(quantityMatch[1]) : null;

  // Extract price
  const priceMatch = intent.match(/\$?(\d+(?:\.\d{2})?)/g);
  const prices = priceMatch ? priceMatch.map(p => parseFloat(p.replace('$', ''))) : [];

  // Extract time
  const timeMatch = intent.match(/(\d+)\s*(days?|weeks?|hours?)/i);
  let withinDays = null;
  if (timeMatch) {
    const num = parseInt(timeMatch[1]);
    const unit = timeMatch[2].toLowerCase();
    if (unit.startsWith('week')) withinDays = num * 7;
    else if (unit.startsWith('day')) withinDays = num;
    else if (unit.startsWith('hour')) withinDays = 1;
  }

  // Infer negotiation preference
  const negotiation = [];
  if (lower.includes('auction')) negotiation.push('auction');
  if (lower.includes('quote') || lower.includes('rfq')) negotiation.push('rfq');
  if (lower.includes('negotiate') || lower.includes('prefer')) negotiation.push('negotiated');
  if (negotiation.length === 0) negotiation.push('direct');

  return {
    product: {
      description: intent,
      category: null,
      quantity,
      specifications: {},
    },
    pricing: {
      target: prices.length > 1 ? Math.min(...prices) : null,
      maximum: prices.length > 0 ? Math.max(...prices) : null,
      currency: 'USD',
      unit: 'per_item',
    },
    delivery: {
      within_days: withinDays,
      location: null,
      method_preference: null,
    },
    protocols_inferred: {
      negotiation,
      payment: null,
      fulfillment: null,
    },
  };
}

// =============================================================================
// Clarification Generation
// =============================================================================

function generateClarificationMessage(intent, result) {
  const missing = [];

  if (!result.parsed.product?.quantity) {
    missing.push('How many do you need?');
  }
  if (!result.parsed.pricing?.maximum) {
    missing.push("What's your budget range?");
  }
  if (!result.parsed.delivery?.within_days) {
    missing.push('When do you need it by?');
  }

  if (missing.length === 0) {
    return "I understand your request. Let me find options for you.";
  }

  return `I understand you're looking for something. To find the best options:\n- ${missing.join('\n- ')}\n\nOr just tell me more and I'll figure it out.`;
}

// =============================================================================
// Start Server
// =============================================================================

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`Intent Service running on http://${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
