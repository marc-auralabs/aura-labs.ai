# AURA Labs — Asset Registry

> Master inventory of all documentation, code, tests, scripts, and web properties
> in the AURA Labs repository. Use this registry when auditing for consistency
> after code changes (see `.claude/skills/change-audit/SKILL.md`).
>
> Last audited: 2026-03-07 (sensitivity classification + API versioning sweep)

---

## Sensitivity Classification

Every asset in this repository falls into one of four sensitivity levels.
These classifications determine who can see the file, whether it can be
shared externally, and how it should be handled if the repo is ever made
public or access is widened.

| Level | Label | Meaning | Examples |
|-------|-------|---------|---------|
| **S0** | **Public** | Safe to publish openly. No competitive, financial, or infrastructure detail. | Marketing HTML, open-source code, public API docs |
| **S1** | **Internal** | General project files. No secrets, but not intended for public distribution. | Source code, test files, architecture docs, tutorials |
| **S2** | **Confidential** | Contains infrastructure detail, competitive positioning, or internal strategy. Limit distribution. | Database schema, security audit reports, protocol specs, deployment guides |
| **S3** | **Restricted** | Contains financials, investor terms, valuation, team compensation, or material non-public information. Never share without explicit approval. | Investor decks, fundraising strategy, financial projections, patent filings |

### Gitignored Sensitive Files (not tracked, present locally)

These files exist on disk but are excluded from version control by `.gitignore`.
They must never be committed, shared in PRs, or uploaded to external services.

| File | Sensitivity | Content | Gitignore Rule |
|------|------------|---------|----------------|
| `CLAUDE_PROJECT_CONTEXT.md` | **S3 Restricted** | Full competitive analysis, fundraising strategy (£500K-£750K), 18-month financial projections, burn rate, team salaries, patent strategy, investor feedback, board advisor details | `CLAUDE_PROJECT_CONTEXT.md` |
| `aura_investor_deck_daphhni.pptx` | **S3 Restricted** | Investor pitch deck with valuation, financial projections, proprietary business strategy | `*investor*` |
| `supabase-schema.sql` | **S2 Confidential** | Database schema with RLS policies, auth functions, table structure. No hardcoded secrets but reveals system architecture. | `supabase-schema.sql` |
| `SUPABASE_SETUP.md` | **S2 Confidential** | Database setup instructions with Supabase project ID and dashboard URL. No API keys. | `SUPABASE_SETUP.md` |
| `hidden.html` | **S2 Confidential** | Architecture visualisation showing internal domain structure (Scout/Core/Beacon) | `hidden.html` |
| `hidden_content_updated.html` | **S2 Confidential** | Duplicate of `hidden.html` — candidate for deletion | `hidden_content_updated.html` |

### Sensitivity by Asset Category

| Category | Default Level | Notes |
|----------|--------------|-------|
| Core API source | **S1 Internal** | Production code — proprietary but no secrets |
| SDK source | **S1 Internal** | Published SDKs — will become S0 if open-sourced |
| Chrome extension | **S1 Internal** | Client code — will become S0 when published to Chrome Web Store |
| Test files | **S1 Internal** | May contain mock data patterns that reveal API structure |
| Shell scripts & demos | **S1 Internal** | Contain production URLs but no credentials |
| API documentation | **S0 Public** | Intended for external developers |
| Tutorials | **S0 Public** | Intended for external developers |
| Architecture docs | **S2 Confidential** | Reveal internal design decisions and system structure |
| Protocol specification | **S1 Internal** | Will become S0 if protocol is published as open standard |
| Security docs | **S2 Confidential** | Vulnerability reports, remediation details, OWASP findings |
| Decision log | **S1 Internal** | Architectural reasoning — useful context, low risk |
| Marketing HTML | **S0 Public** | Public-facing web pages |
| Brand assets | **S0 Public** | Logos and fonts for public use |
| Config & CI | **S1 Internal** | Build pipeline — no secrets (secrets in CI environment variables) |
| JSON schemas | **S0 Public** | Protocol schemas intended for external consumption |
| `.env.example` files | **S0 Public** | Template values only, no real credentials |

### Audit Status

Last sensitivity audit: 2026-03-07. Findings:

- No API keys, passwords, tokens, or connection strings found in any tracked file
- All sensitive documents properly excluded via `.gitignore`
- `.gitignore` has 100+ rules across categories: secrets, proprietary docs, infrastructure
- `.env.example` files contain only placeholder values (`your-api-key-here`)
- Supabase keys use runtime generation (`gen_random_bytes`), not hardcoding
- Recommendation: delete `hidden_content_updated.html` (duplicate of `hidden.html`)

---

## 1. Core API Source

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `aura-core/services/core-api/src/index.js` | Core API server — all business routes | Yes (route defs inside `/v1` plugin) |
| `aura-core/services/core-api/src/lib/agent-auth.js` | Ed25519 agent authentication | No |
| `aura-core/services/core-api/src/lib/beacon-matcher.js` | Intent-to-beacon matching | No |
| `aura-core/services/core-api/src/lib/intent-parser.js` | NLP intent parsing | No |
| `aura-core/services/core-api/src/lib/webhook-dispatcher.js` | Webhook delivery | No |
| `aura-core/services/core-api/src/routes/dev.js` | Dev-only routes | Yes |
| `aura-core/database/migrate.js` | Database migrations | No |

## 2. Other Core Services

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `aura-core/services/core-worker/src/index.js` | Background worker | No |
| `aura-core/services/intent-svc/src/index.js` | Intent service | No |
| `aura-core/services/policy-svc/src/index.js` | Policy agent service | No |
| `aura-core/services/policy-svc/src/lib/*.js` | Policy agent modules | No |
| `aura-core/services/policy-svc/src/agents/*.js` | Monitoring agents | No |

## 3. SDKs

### Beacon JS SDK
| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `sdks/beacon-js/src/client.js` | HTTP client (has `API_VERSION`) | Yes (transport layer) |
| `sdks/beacon-js/src/index.js` | SDK entry point | Yes (relative paths to client) |
| `sdks/beacon-js/src/activity.js` | Activity/telemetry logging | No |
| `sdks/beacon-js/src/errors.js` | Error types | No |
| `sdks/beacon-js/bin/beacon-cli.js` | CLI tool | Yes (uses SDK) |
| `sdks/beacon-js/examples/*.js` | Usage examples (5 files) | Yes (via SDK) |
| `sdks/beacon-js/README.md` | SDK documentation | Yes (endpoint references) |

### Scout JS SDK
| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `sdks/scout-js/src/client.js` | HTTP client (has `API_VERSION`) | Yes (transport layer) |
| `sdks/scout-js/src/index.js` | SDK entry point | Yes (relative paths to client) |
| `sdks/scout-js/src/session.js` | Session management | No |
| `sdks/scout-js/src/activity.js` | Activity/telemetry logging | No |
| `sdks/scout-js/src/key-manager.js` | Ed25519 key management | No |
| `sdks/scout-js/src/errors.js` | Error types | No |
| `sdks/scout-js/src/ap2/mandates.js` | AP2 mandate support | No |
| `sdks/scout-js/src/mcp/client.js` | MCP client | No |
| `sdks/scout-js/src/tap/visa.js` | TAP/Visa integration | No |
| `sdks/scout-js/bin/scout-cli.js` | CLI tool | Yes (uses SDK) |
| `sdks/scout-js/examples/*.js` | Usage examples (2 files) | Yes (via SDK) |
| `sdks/scout-js/README.md` | SDK documentation | Yes (endpoint references) |

### MCP Server Scout
| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `sdks/mcp-server-scout/src/index.js` | MCP server (has `API_VERSION`) | Yes (transport layer) |
| `sdks/mcp-server-scout/README.md` | MCP server documentation | Yes |

## 4. Chrome Extension

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `apps/scout-chrome-ext/src/lib/aura-client.js` | HTTP client (has `API_VERSION`) | Yes (transport layer) |
| `apps/scout-chrome-ext/src/lib/session-manager.js` | Session state management | No |
| `apps/scout-chrome-ext/src/lib/crypto-manager.js` | Ed25519 key management | No |
| `apps/scout-chrome-ext/src/lib/ap2-mandates.js` | AP2 mandate support | No |
| `apps/scout-chrome-ext/src/lib/tap-signer.js` | TAP signing | No |
| `apps/scout-chrome-ext/src/lib/storage.js` | Chrome storage wrapper | No |
| `apps/scout-chrome-ext/src/background/service-worker.js` | Background service worker | No |
| `apps/scout-chrome-ext/src/content/extractor.js` | Page content extraction | No |
| `apps/scout-chrome-ext/src/popup/popup.js` | Popup UI logic | No |
| `apps/scout-chrome-ext/src/sidepanel/sidepanel.js` | Side panel UI logic | No |
| `apps/scout-chrome-ext/src/shared/constants.js` | Shared constants | Yes (`CORE_API_URL`) |
| `apps/scout-chrome-ext/src/shared/errors.js` | Error types | No |
| `apps/scout-chrome-ext/manifest.json` | Extension manifest | No |

## 5. Simple Agent Implementations

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `scouts/simple-scout/simple-scout.js` | Reference Scout implementation | Yes (via SDK) |
| `beacons/simple-beacon/simple-beacon.js` | Reference Beacon implementation | Yes (via SDK) |
| `core/src/mock-aura-core.js` | Mock Core API for local dev | Yes (route defs) |
| `core/src/client-management/client-manager.js` | Client management module | No |

## 6. Test Files

### Core API Tests
| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `aura-core/services/core-api/src/tests/setup.js` | Test setup (has `API_PREFIX`) | Yes |
| `aura-core/services/core-api/src/tests/security.test.js` | Security integration tests | Yes |
| `aura-core/services/core-api/src/tests/transaction-endpoints.test.js` | Transaction tests | Yes |
| `aura-core/services/core-api/src/tests/beacon-matcher.test.js` | Matcher unit tests | No |
| `aura-core/services/core-api/src/tests/intent-parser.test.js` | Parser unit tests | No |
| `aura-core/services/core-api/src/lib/agent-auth.test.js` | Auth signing unit tests | Yes (internal signing strings) |

### SDK Tests
| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `sdks/beacon-js/src/tests/integration-hooks.test.js` | Beacon SDK integration tests | Yes (mock paths) |
| `sdks/scout-js/src/tests/*.test.js` | Scout SDK tests (5 files) | Yes (some mock paths) |
| `sdks/scout-js/src/key-manager.test.js` | Key manager unit tests | Yes (mock fixtures) |

### Chrome Extension Tests
| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `apps/scout-chrome-ext/test/aura-client.test.js` | Client URL assertions | Yes |
| `apps/scout-chrome-ext/test/ap2-mandates.test.js` | AP2 mandate tests | No |
| `apps/scout-chrome-ext/test/crypto-manager.test.js` | Crypto tests | No |
| `apps/scout-chrome-ext/test/session-manager.test.js` | Session tests | No |
| `apps/scout-chrome-ext/test/tap-signer.test.js` | TAP tests | No |

## 7. Scripts & Demos

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `demo.sh` | Production end-to-end demo | Yes (curl calls) |
| `scripts/test-flow.sh` | Quick integration test flow | Yes (curl calls) |
| `scripts/run-beacons.sh` | Beacon registration + polling | Yes (curl calls) |
| `scripts/security-tests.sh` | Security test suite | Yes (curl calls) |
| `examples/e2e-demo.js` | JS-based e2e demo | Yes (via SDK) |

## 8. API & Developer Documentation

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `docs/api/README.md` | **Primary API reference** | Yes — all endpoints |
| `docs/getting-started/README.md` | Getting started guide | Yes |
| `docs/QUICKSTART.md` | Quickstart guide | Yes |
| `docs/beacon/README.md` | Beacon documentation | Yes |
| `docs/scout/README.md` | Scout documentation | Yes |
| `docs/faq.md` | FAQ | Possibly |

## 9. Tutorials

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `docs/tutorials/beacon-basics.md` | Beacon getting started | Yes |
| `docs/tutorials/beacon-pricing.md` | Pricing strategies | Possibly |
| `docs/tutorials/beacon-multistore.md` | Multi-store setup | Possibly |
| `docs/tutorials/beacon-transactions.md` | Transaction lifecycle | Yes |
| `docs/tutorials/beacon-inventory.md` | Inventory management | Possibly |
| `docs/tutorials/beacon-analytics.md` | Analytics setup | Possibly |
| `docs/tutorials/beacon-observability.md` | Observability | Possibly |
| `docs/tutorials/scout-basics.md` | Scout getting started | Yes |
| `docs/tutorials/scout-consent.md` | Consent management | Possibly |
| `docs/tutorials/scout-preferences.md` | Preference handling | Possibly |
| `docs/tutorials/scout-negotiation.md` | Negotiation flows | Yes |
| `docs/tutorials/integration-react.md` | React integration | Yes |
| `docs/tutorials/integration-shopify.md` | Shopify integration | Yes |
| `docs/tutorials/integration-woocommerce.md` | WooCommerce integration | Yes |
| `docs/tutorials/integration-mobile.md` | Mobile integration | Yes |
| `docs/tutorials/best-practices-security.md` | Security best practices | Possibly |
| `docs/tutorials/best-practices-errors.md` | Error handling | Possibly |
| `docs/tutorials/best-practices-performance.md` | Performance tuning | Possibly |
| `docs/tutorials/best-practices-testing.md` | Testing guide | Possibly |

## 10. Architecture & Protocol Documentation

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `docs/ARCHITECTURE.md` | Architecture overview | No |
| `docs/architecture/README.md` | Architecture index | No |
| `docs/architecture/COMPONENT_REGISTRY.md` | Component registry | No |
| `docs/architecture/DEPLOYMENT.md` | Deployment guide | No |
| `docs/architecture/NEUTRAL_BROKER.md` | Broker architecture | No |
| `docs/architecture/PROTOCOL_INTEGRATION.md` | Protocol integration | Possibly |
| `docs/architecture/PROTOCOL_NEGOTIATION.md` | Negotiation protocol | Yes |
| `docs/architecture/flows.html` | **Flow diagrams** | Yes — all endpoint flows |
| `docs/protocol/README.md` | Protocol overview | No |
| `docs/protocol/PROTOCOL_SPECIFICATION.md` | **Full protocol spec** | Yes — all endpoints |
| `docs/protocol/REPUTATION_SPECIFICATION.md` | Reputation system | No |

## 11. Security Documentation

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `docs/security/CRITICAL_FIXES_GUIDE.md` | Archived security fixes guide | Yes (historical) |
| `docs/security/SECURITY_AUDIT_REPORT.md` | Archived audit report | Yes (historical) |
| `SECURITY.md` | Security policy | No |

## 12. Decision Log

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `docs/decisions/DECISION_LOG.md` | All architectural decisions | Yes (DEC-007, 009, 010, 016) |
| `docs/decisions/ADR-001-NLP-DISTRIBUTION.md` | NLP distribution ADR | No |

## 13. Web Properties (Public Site)

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `index.html` | Marketing homepage | No |
| `portal/index.html` | Developer portal | No |
| `developers.html` | Developer marketing page | No |
| `developer-signup.html` | Signup form | No |
| `developer-login.html` | Login form | No |
| `forgot-password.html` | Password reset | No |
| `reset-password.html` | Password reset | No |
| `architecture.html` | Architecture page | No |
| `how-it-works.html` | How it works page | No |
| `aura_pitch_deck.html` | Pitch deck | No |
| `hidden.html` | Hidden content | No |
| `hidden_content_updated.html` | Hidden content v2 | No |
| `brand/logos.html` | Brand assets | No |

## 14. HTML UI Files

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `apps/scout-chrome-ext/src/popup/popup.html` | Extension popup | No |
| `apps/scout-chrome-ext/src/sidepanel/sidepanel.html` | Extension side panel | No |
| `apps/scout-it-ios/brand-logos.html` | iOS app brand assets | No |

## 15. Configuration & Infrastructure

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `.github/workflows/ci.yml` | CI pipeline | Possibly (health checks) |
| `package.json` (root + 11 others) | Package configs | No |
| `schemas/**/*.json` | JSON schemas (5 files) | No |
| `apps/scout-it-ios/scout-it-site/vercel.json` | Vercel config | No |

## 16. Component READMEs

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `aura-core/README.md` | Core API README | Yes (endpoint list) |
| `core/README.md` | Core module README | No |
| `scouts/README.md` | Scouts overview | No |
| `scouts/simple-scout/README.md` | Simple Scout README | No |
| `beacons/README.md` | Beacons overview | No |
| `beacons/simple-beacon/README.md` | Simple Beacon README | No |
| `examples/README.md` | Examples overview | No |
| `schemas/README.md` | Schemas overview | No |
| `docs/README.md` | Docs index | No |
| `docs/integration-guides/README.md` | Integration guides index | Possibly |

## 17. Project Context & Meta

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `CHANGELOG.md` | Release history | Yes (historical) |
| `ROADMAP.md` | Product roadmap | No |
| `CONTRIBUTING.md` | Contribution guide | No |
| `CLAUDE_PROJECT_CONTEXT.md` | Claude project context | No |
| `SUPABASE_SETUP.md` | Database setup | No |

## 18. Claude Skills (Project-Level)

| File | Purpose | Contains API Paths |
|------|---------|-------------------|
| `.claude/skills/decision-logger/SKILL.md` | Decision logging skill | No |
| `.claude/skills/senior-engineer/SKILL.md` | Code quality skill | No |
| `.claude/skills/senior-engineer/references/owasp-checklist.md` | OWASP reference | No |
| `.claude/skills/stack-node-scala-swift/SKILL.md` | Language patterns skill | No |
| `.claude/skills/change-audit/SKILL.md` | **This audit skill** | No |

---

## Audit Checklist Quick Reference

When making changes that affect API paths, schemas, or interfaces, sweep these files in order of priority:

1. **CRITICAL** — `demo.sh`, `scripts/*.sh`, SDK `client.js` files, Chrome ext `aura-client.js`
2. **HIGH** — `docs/api/README.md`, `docs/architecture/flows.html`, `docs/protocol/PROTOCOL_SPECIFICATION.md`, all test files with URL assertions
3. **MEDIUM** — `docs/beacon/README.md`, `docs/scout/README.md`, `docs/tutorials/*.md`, `aura-core/README.md`, `sdks/*/README.md`
4. **LOW** — `docs/architecture/PROTOCOL_NEGOTIATION.md`, `docs/decisions/DECISION_LOG.md`, `CHANGELOG.md` (Unreleased section only)
