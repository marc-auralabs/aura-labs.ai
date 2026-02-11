# AURA Platform Roadmap

This document outlines the development roadmap for the AURA platform, including Scout client integrations, Core infrastructure, and future revenue initiatives.

---

## Current Phase: Foundation (Q1 2025)

### ✅ Completed
- Core API with session management
- TAP (Trust Anchor Protocol) v1 specification
- Beacon SDK (TypeScript)
- Scout SDK (TypeScript)
- Developer Portal with Supabase auth
- Scout-It! iOS demo app

### 🔄 In Progress
- Password recovery flow for developer portal
- Developer documentation improvements

---

## Phase 2: Scout Distribution Channels

### Priority 1: Communication Platforms

#### Discord Bot
**Status:** Planned
**Effort:** Medium
**Value:** High (B2B teams use Discord)

- Slash commands for procurement requests
- Rich embeds for offer comparison
- Button interactions for approval flow
- Channel-based approval workflows
- DM support for individual users

#### Slack App
**Status:** Planned
**Effort:** Medium
**Value:** High (Enterprise B2B)

- Similar functionality to Discord bot
- Slack App Directory distribution
- Workflow Builder integration
- Enterprise Grid support

### Priority 2: AI/LLM Integrations

#### MCP Server for Claude
**Status:** Planned
**Effort:** Low-Medium
**Value:** High (Developer ecosystem)

- Model Context Protocol server implementation
- Works with Claude Code, Claude Desktop
- Natural language → Scout session creation
- Real-time offer retrieval in conversation

#### ChatGPT Custom GPT
**Status:** Planned
**Effort:** Low
**Value:** Medium (Requires Plus subscription)

- GPT Action calling Scout API
- Conversational procurement flow
- GPT Store distribution

### Priority 3: Browser Integration

#### Chrome Extension
**Status:** Planned
**Effort:** Medium-High
**Value:** High (Intercept at point of intent)

- Detect shopping/procurement queries on Google, Amazon
- "Get competing quotes" overlay
- Quick session creation from product pages
- Side panel for offer comparison

---

## Phase 3: Revenue Infrastructure

### SEM Demand Aggregation Network
**Status:** Future Consideration
**Effort:** High
**Value:** Potentially transformative

#### Concept
Core acts as a demand aggregation layer that:
1. Maintains registry of active Beacons by market category
2. Bids on SEM keywords on behalf of Beacon network
3. Routes high-intent traffic to Scout sessions
4. Multiple Beacons compete for each transaction
5. AURA takes transaction fee from winning Beacon

#### Components Required
- **Category Registry**: Map Beacons to market categories/keywords
- **SEM Bidding Engine**: Automated Google Ads management per category
- **Landing Page System**: Scout interfaces optimized for ad traffic
- **Attribution Tracking**: Ad click → Session → Conversion pipeline
- **Beacon Billing**: Charge winners for delivered transactions

#### Economics Model
```
Google CPC: $X for category keyword
     ↓
Scout landing captures intent
     ↓
N Beacons compete → Transaction completes
     ↓
AURA takes Y% from winning Beacon
     ↓
Net margin: (Y% × order value) - CPC
```

#### Strategic Considerations
- Requires sufficient Beacon density per category
- Ad spend risk during ramp-up
- Google's response to aggregator model
- Could become primary revenue driver at scale

---

## Phase 4: Platform Expansion

### Additional Scout Surfaces
- Telegram Bot
- Microsoft Teams App
- WhatsApp Business integration
- Email add-ons (Gmail, Outlook)
- Raycast extension (developer productivity)

### Beacon Ecosystem
- Shopify app for easy Beacon onboarding
- WooCommerce plugin
- BigCommerce integration
- API connectors for major ERPs

### Core Infrastructure
- Multi-region deployment
- Enhanced reputation system
- Dispute resolution framework
- Analytics dashboard for Beacons

---

## Version History

| Date | Change |
|------|--------|
| 2025-02-09 | Initial roadmap created |

