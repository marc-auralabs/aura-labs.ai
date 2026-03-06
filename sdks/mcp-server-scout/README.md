# AURA Scout MCP Server

MCP (Model Context Protocol) server that exposes AURA Scout procurement capabilities to Claude and other LLM clients.

## What is this?

This MCP server allows Claude Desktop, Claude Code, and other MCP-compatible clients to perform procurement tasks through natural language. Instead of manually searching for products, comparing prices, and placing orders, you can simply tell Claude what you need.

**Example conversation:**
```
You: I need to order 50 ergonomic keyboards for the engineering team. Budget is around $5000.

Claude: I'll search for that. [calls scout_search]

Claude: I found 3 offers:
1. TechSupply Co - $4,250 (50x ErgoKey Pro @ $85 each) - 5 day delivery
2. Office Depot - $4,750 (50x Logitech Ergo K860 @ $95 each) - 3 day delivery
3. Amazon Business - $4,500 (50x Microsoft Ergonomic @ $90 each) - 2 day delivery

Which would you like to proceed with?

You: Let's go with Office Depot for the faster delivery.

Claude: [calls scout_select_offer, then scout_checkout]

Claude: Done! Order confirmed with Office Depot. Order #ORD-123456, delivery expected in 3 days.
```

## Installation

### For Claude Desktop

1. Install the package globally:
   ```bash
   npm install -g @aura-labs/mcp-server-scout
   ```

2. Add to your Claude Desktop config (`~/.claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "scout": {
         "command": "mcp-server-scout",
         "env": {
           "AURA_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop.

### For Claude Code

Add to your project's `.mcp.json`:
```json
{
  "servers": {
    "scout": {
      "command": "npx",
      "args": ["@aura-labs/mcp-server-scout"],
      "env": {
        "AURA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### For Development

```bash
cd sdks/mcp-server-scout
npm install
AURA_API_KEY=your-key npm start
```

## Available Tools

### `scout_search`
Start a procurement search with natural language intent.

**Parameters:**
- `intent` (required): Natural language description of what you want
- `max_budget` (optional): Maximum budget in USD
- `currency` (optional): Currency code (default: USD)
- `delivery_by` (optional): Required delivery date (ISO 8601)

**Example:**
```json
{
  "intent": "I need 100 reams of copy paper, A4 size, 80gsm",
  "max_budget": 500,
  "delivery_by": "2026-02-20"
}
```

### `scout_get_offers`
Get current offers for a session.

**Parameters:**
- `session_id` (required): Session ID from scout_search

### `scout_select_offer`
Select an offer to proceed with.

**Parameters:**
- `session_id` (required): Session ID
- `offer_id` (required): ID of the offer to select

### `scout_get_session`
Get session status and details.

**Parameters:**
- `session_id` (required): Session ID

### `scout_checkout`
Complete the transaction.

**Parameters:**
- `session_id` (required): Session ID with a selected offer

### `scout_list_sessions`
List all active sessions in this conversation.

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `AURA_CORE_URL` | AURA Core API URL. Override to use a custom Core instance (e.g., local development or staging). | `https://aura-labsai-production.up.railway.app` |

**Example: Use a custom Core URL**
```bash
AURA_CORE_URL=http://localhost:3000 npm start
```

## How it Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude/LLM     │────▶│  MCP Server     │────▶│  AURA Core      │
│                 │     │  (this package) │     │                 │
│  "I need..."    │◀────│                 │◀────│  Offers from    │
│                 │     │  Tool responses │     │  Beacons        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. User expresses intent to Claude
2. Claude calls MCP tools to interact with AURA
3. MCP server translates to Core API calls
4. Core broadcasts to Beacons (vendors)
5. Beacons respond with offers
6. User selects, Claude completes transaction

## License

BSL-1.1 - See LICENSE for details.
