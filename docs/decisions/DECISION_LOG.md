# AURA Decision Log

A running log of architectural and implementation decisions made during development. Significant decisions may be promoted to full ADRs (Architecture Decision Records) in this directory.

**Format:** Each entry captures the decision, the reasoning, alternatives considered, and the date. Entries are prepended (newest first).

**When to log:** Any decision that affects how the system works, why a particular approach was chosen over alternatives, or that a future developer (or AI session) would need to understand to maintain the codebase.

---

## 2026-03-06

### DEC-015: Policy Agents Are the Operator Layer — No Human Admin Endpoints

**Context:** During security remediation, the question arose of how to secure the unprotected `/admin/reset-database` endpoint. The obvious fix — add an API key or env-gate it — leads to a deeper question: what is AURA's admin model? Who (or what) operates the platform?

**Decision:** Policy agents are the operator layer. There are no human-facing mutation endpoints in production. The platform is designed to be hands-free: self-diagnosing and self-healing.

This establishes a two-tier policy architecture:

**Tier 1 — Operational Policy: Observe, Alert, Act.** This is the reactive layer, already implemented in policy-svc (DEC-013). Policy agents monitor baselines, detect anomalies, dispatch alerts, and auto-remediate within safety gates. If a beacon goes dark, the heartbeat monitor detects it and can suspend it. If transaction failure rates spike, the transaction health monitor alerts and can pause the affected flow. This is the platform's immune system.

**Tier 2 — Governance Policy: Create, Enforce, Modify.** This is the proactive layer, not yet built. Governance is three distinct functions:

- **Create** — introducing new rules. A governance agent (or a human, initially) defines a new policy with scope, thresholds, and consequences. Example: "Beacons must respond to matched sessions within 60 seconds or lose priority in future matching." The rule doesn't exist until something creates it. The system needs a structured way to introduce policies — what entity types they apply to, what triggers evaluation, what happens on violation, and what the escalation path is.

- **Enforce** — applying rules in real time. This is not after-the-fact detection (that's operational). Enforcement is active gating: a beacon attempting to submit an offer above a governance-defined ceiling is rejected at submission time, not flagged after the fact. Enforcement agents sit in the request path or validate state transitions before they commit. They are the difference between "we noticed a violation" and "we prevented a violation."

- **Modify** — changing rules based on outcomes. The £10,000 offer ceiling made sense at launch, but three months of data shows the actual fraud boundary is at £3,500. A governance agent proposes the adjustment based on observed patterns. The modification flows through an approval mechanism (another agent, a quorum, or human review during early operation) and takes effect with a full audit trail showing what changed, why, what data supported the change, and how to revert. Rules are never silently changed.

The key distinction from Tier 1: operational agents react to what happened; governance agents decide what should happen. Operational policy is the immune system. Governance policy is the brain.

**Implications:**

1. The `/admin/reset-database` endpoint is removed entirely. It was scaffolding. There is no replacement.
2. No human-facing mutation endpoints exist in production. Observation endpoints (reading state, metrics, logs) are permitted for dashboards and debugging.
3. Any production action (suspend a beacon, expire a session, adjust a threshold, modify a market rule) flows through a policy agent with full audit trail, safety gates, and revert capability.
4. The policy-svc admin API (`/alerts`, `/baselines`, `/config`) remains as read-only observation. If those need to become writable (e.g., adjusting a policy config), the write goes through a governance agent, not a direct API call.
5. Future operator console is a visibility tool, not a control tool. Humans observe; agents act. If a human needs to intervene, they assign a policy agent to the task.

**Reasoning:** This mirrors how mature payment networks operate — rules engines, not human operators, make real-time decisions. The difference is that traditional platforms have humans writing the rules and machines executing them. AURA's governance tier eventually enables agents to propose rule modifications (within constraints) based on observed outcomes. This is the path from "automated operations" to "autonomous operations." Marc's experience building robot-driven platforms confirms this pattern: the governance layer is where platform intelligence lives.

**Alternatives:** Human admin API with API key auth (rejected: creates a human-in-the-loop dependency that doesn't scale and contradicts the autonomous platform thesis), environment-gated admin endpoints (rejected: fragile, env vars get misconfigured, doesn't address the fundamental question of who operates the platform), separate admin service with RBAC (rejected: over-engineering a human control plane we don't want).

**Status:** Active. The principle is effective immediately. Tier 1 (operational) is implemented. Tier 2 (governance) is future work — build after operational agents are baselined against real traffic.

### DEC-014: Protocol Resilience & Chaos Engineering — Two-Tier Adversarial Testing

**Context:** With the policy agent framework (DEC-013) providing detection and alerting, the question arose: how do we prove the protocol actually works under adversarial conditions? Netflix's Simian Army popularised service-level chaos engineering (kill processes, drop connections, starve resources). But AURA is not just a service — it's a multi-agent protocol where participants are autonomous, potentially adversarial, and communicate asynchronously. Service resilience is necessary but insufficient. The protocol itself must be resilient at the message level and against deliberate manipulation.

**Decision:** Commit to a two-tier resilience architecture, to be implemented after policy agents are baselined against real traffic:

**Tier 1 — Message-Level Protocol Resilience.** The protocol must handle the messy reality of distributed messaging without external enforcement. This is the foundational layer, analogous to how payment network protocols handle authorization reversals, partial authorizations, timeouts, and duplicate detection. Specific scenarios the protocol must survive gracefully: (a) Dropped messages — an offer submission that never reaches Core, a session notification that never reaches a Beacon. (b) Duplicate delivery — the same offer arriving twice due to retry logic, same session broadcast hitting a Beacon multiple times. (c) Out-of-order arrival — a fulfillment update arriving before the commit acknowledgement, a cancel crossing paths with an accept. (d) Mid-process abandonment — a Scout disconnecting mid-negotiation, a Beacon going silent after accepting an offer. (e) Partial state — two offers arriving for a session that should only have one, a transaction referencing a negotiation that was already cancelled. Idempotency keys (already in schema) are the start, but the protocol needs explicit state machine semantics with defined behavior for every invalid transition.

**Tier 2 — Adversarial Agent Chaos.** Purpose-built chaos agents that actively try to break the protocol, running continuously (not just during pentest windows). These are the red team. Examples: rogue Beacons submitting phantom offers they can't fulfill, Scouts spamming sessions to overwhelm the matching layer, agents that accept deals then ghost on payment/fulfillment, agents that replay signed mandates, agents that gradually drift pricing to test whether anomaly detection catches slow manipulation vs sudden spikes, agents that flood with junk intents to crowd out legitimate activity. The policy agents (DEC-013) become the scoreboard — if a chaos agent acts and the corresponding policy agent doesn't detect it, that's a failing test.

**Reasoning:** Payment networks have dealt with adversarial participants for decades (chargebacks, friendly fraud, merchant collusion, acquirer manipulation). Those networks enforce trust through legal contracts and financial penalties. AURA must enforce it through protocol mechanics because there are no contracts between autonomous agents. Tier 1 must exist before Tier 2 — you can't test adversarial behavior against a protocol that doesn't handle basic message-level failures. The policy agent framework provides the detection layer; the chaos framework provides the adversarial testing layer. Together they form a closed loop: detect → alert → verify detection works → harden.

**Constraints:** Chaos agents must only run in staging or with explicit flags. All chaos activity must self-identify in audit logs so it can be filtered from real data. A kill switch must immediately halt all chaos and revert injected state. Tier 1 (message resilience) is a prerequisite for Tier 2 (adversarial chaos).

**Alternatives:** Manual penetration testing only (rejected: too infrequent, doesn't catch regression), relying on legal/contractual enforcement like traditional payment networks (rejected: not applicable to autonomous agents with no legal identity yet), building Tier 2 before Tier 1 (rejected: adversarial testing is meaningless if the protocol can't handle a dropped message).

**Status:** Future — build after policy agents are baselined. Tier 1 (protocol state machine hardening) is the next logical step after policy-svc is deployed and collecting data.

### DEC-013: Policy Agents Architecture — Independent Observer Layer
**Context:** With the observability instrumentation in place (DEC-011), we need agents that consume the event stream, learn what normal looks like over time, and detect/respond to anomalies. Marc's prior experience at Access Worldpay used 23 policy robots before launching a single transactional robot — establishing the principle that the observer layer must exist before the transactional layer can be trusted.
**Decision:** Build a policy agent framework as a separate service layer. Key architectural constraints: (1) Starts inside Railway alongside core-api for simplicity, but designed from day one for independent deployment so it can observe and report even if the platform goes down. (2) Statistical baselines first (moving averages, percentiles, standard deviations) for anomaly detection, with LLM-assisted reasoning added as a second phase for interpretation and recommendations. (3) Auto-remediation for high-severity anomalies (pause misbehaving Beacons, rate-limit), with alerts and recommendations for lower severity. The policy agents are not Scouts or Beacons — they are a separate class of agent that observes and enforces platform health.
**Reasoning:** Independent audit and recoverability requires separation of concerns — if the policy agents share a failure domain with the platform, they can't report on platform failures. Statistical baselines are deterministic and explainable, making them the right foundation before adding LLM interpretation. Auto-remediation at the highest severity tier is necessary because human operators can't respond fast enough to cascading failures or active abuse.
**Alternatives:** Policy enforcement purely inside Core API middleware (rejected: can't observe Core itself, shares failure domain), external SaaS observability only like Datadog (rejected: doesn't understand AURA's domain semantics — a generic APM tool doesn't know that a Beacon's acceptance rate dropping is a business signal), LLM-first approach (rejected: statistical baselines are more reliable, explainable, and cheaper for the detection layer).

### DEC-012: Event Ingestion via Railway Log Explorer (Phase 1)
**Context:** The observability instrumentation (DEC-011) emits structured events, but there was no place to actually view them. Evaluated options: Kafka streams, external log aggregators, custom dashboards.
**Decision:** Phase 1 uses Railway's built-in Log Explorer and Observability Dashboard. Fastify/pino already writes structured JSON to stdout, Railway parses and indexes it automatically. Queryable via `@attribute:value` syntax (e.g., `@event:offer.submitted`). Railway supports custom dashboard widgets with filtered log panels and configurable alerts with webhook delivery. No new infrastructure needed for phase 1.
**Reasoning:** Kafka is massive overkill for current scale. Railway already captures stdout and indexes structured JSON — the data is flowing, we just need to look at it. Railway's dashboard supports filtered log panels and alerts, covering the immediate need. When the policy agent layer (DEC-013) needs a dedicated event stream, we can add Redis Streams (already planned in the stack) without changing the instrumentation.
**Alternatives:** Kafka (rejected: operational overhead disproportionate to current scale), Datadog/Elastic via log drain (viable for phase 2 but unnecessary now), custom event store (premature, build when needed).

### DEC-011: SDK-Side Activity Logger for Beacon/Scout Observability
**Context:** Observability audit of the AURA platform revealed 2.5/10 maturity. Authentication was strong (Ed25519, 8/10) but everything else was missing: no distributed tracing, no metrics, no structured logging (except webhook dispatcher), no correlation IDs. The user's background in payments/finserv requires actions to be trackable, attributable, and authenticated (CIA triad) with visibility for agent operators, agents themselves, and Core operators.
**Decision:** Implement a three-layer observability system: (1) SDK-side `ActivityLogger` in both Beacon and Scout SDKs that records every lifecycle event (registration, polling, sessions, offers, fulfillment) as structured events with timestamps, durations, and correlation IDs. Exposed via `beacon.activity` / `scout.activity`. (2) HTTP-level correlation via `X-Request-ID` headers on every SDK request, echoed by Core API. (3) Core API request ID middleware that injects `requestId` into all pino log context and audit_log entries. The activity logger supports real-time event subscriptions, queryable event history, running counters, and pluggable external loggers.
**Reasoning:** SDK-side logging means the agent operator sees what their agent is doing regardless of Core availability. Correlation IDs tie SDK events to Core logs for end-to-end tracing. The `logger` config option (accepts any object with `.info()` / `.error()`) means merchants can plug into their own logging stack without us prescribing one. In-memory event buffer with configurable max size keeps it lightweight.
**Alternatives:** OpenTelemetry full instrumentation (too heavy for current stage, adds significant dependencies), Core-only logging (operators can't see what their SDK is doing), external APM agent (coupling to a specific vendor too early).

---

## 2026-03-03

### DEC-010: Beacon Merchant Integration Hooks (Pre-Shopify Plugin)
**Context:** The Beacon SDK could register with Core and submit offers, but had no mechanism for merchants to enforce business rules before offers leave the SDK. A Beacon could commit to 1,000 units when only 10 are in stock, agree to a price below cost, or promise delivery times the merchant can't fulfil. Additionally, there was no way for Beacons to track transaction lifecycle post-commit (fulfillment, payment). These gaps needed closing before shipping a Shopify plugin, where real merchant systems (inventory, pricing, logistics) must be consulted before any autonomous commitment.
**Decision:** Implement a three-phase integration layer: (1) SDK-side pre-offer middleware (`beforeOffer`, `registerPolicies`) that validates and optionally modifies offers before they hit the network, (2) Core API transaction lifecycle endpoints (`GET /transactions/:id`, `PUT fulfillment`, `PUT payment`) with auto-status-transitions and webhook dispatch, (3) Scout SDK post-transaction tracking (`refresh`, `waitForFulfillment`). Critically, the `beforeOffer` middleware and policy enforcement run entirely in the SDK — Core doesn't need to know about merchant-internal rules, reducing coupling.
**Reasoning:** SDK-side validation means policies are enforced even if Core is unreachable or the network is compromised. The middleware pattern (`async (session, offer) => modifiedOffer`) is composable — merchants chain validators for inventory, pricing, compliance, etc. Fire-and-forget webhooks avoid blocking the commit response while still notifying merchants of state changes. Auto-transitions (delivered → fulfilled, charged+delivered → completed) reduce the API surface merchants need to manage.
**Alternatives:** Server-side policy enforcement in Core (rejected: requires merchants to expose internal systems to a third party, higher coupling), polling-only for transaction status (rejected: webhooks are more efficient for real-time merchant systems), single monolithic transaction endpoint (rejected: fulfillment and payment are independent concerns with different actors).
**Chain of events:** User identified pre-Shopify plugin gaps → reviewed Beacon architecture docs and code → gap analysis showed missing inventory hooks, price floors, fulfillment tracking, and Scout-Beacon post-transaction relationship → 3-phase plan written → implemented across Beacon SDK (6 new methods), Core API (3 new endpoints + webhook dispatcher), and Scout SDK (Transaction enhancements) → 113 tests passing (66 Core + 30 agent-auth + 17 Beacon SDK integration) → deployed to Railway → full lifecycle verified via demo.sh.

---

## 2026-02-24

### DEC-009: Universal Agent Identity via Ed25519 Cryptographic Keys
**Context:** User testing of the Chrome extension revealed a fundamental UX problem: end users were forced through a developer portal flow (create account → generate API key → paste into extension) just to use a Scout. The developer portal exists for third-party developers, not end users. More broadly, the security model was fragmented — the SDK required an API key, the iOS app used a local TAP agent ID with no registration, and the Chrome extension had a broken hybrid. The user identified threats including weaponised Scouts (mass-negotiating to distort prices), data scraping via fake buyers, and the need for behavioural enforcement via revocation.
**Decision:** Implement a universal cryptographic identity system where every agent (Scout or Beacon) generates a local Ed25519 root key pair, registers with AURA Core via `POST /agents/register` with proof-of-possession signature, and signs all subsequent requests. No bearer tokens — identity is proven by signing, not by presenting a shared secret. Core stores the public key and can revoke it to instantly cut off a bad actor. The same flow applies across all client types (SDK, Chrome extension, future iOS). Legacy `apiKey` + `scoutId` patterns remain functional for backward compatibility.
**Reasoning:** Cryptographic identity solves multiple problems simultaneously: zero-config onboarding (keys generate locally in ~1 second), request integrity (signatures prevent tampering), agent accountability (public keys are registered and revocable), and future identity binding (root keys will eventually bind to verified entities — selfie for consumers, email + payment method for businesses — closing the re-registration evasion loop after revocation). The key hierarchy design (root → signing, encryption, session, idempotency keys) is extensible; MVP implements root + signing only.
**Alternatives:** OAuth/OIDC for agent auth (over-engineered for machine-to-machine, adds external dependency), API keys for everyone (shared secrets are weaker than asymmetric signing, no proof-of-possession), client certificates (complex lifecycle management, poor DX), no auth with rate limiting only (insufficient against sophisticated actors operating within rate bounds).
**Chain of events:** User tested Chrome extension → discovered API key UX was broken for end users → identified this as architectural not cosmetic → described threat model (weaponised Scouts, data scraping, market manipulation) → specified root key hierarchy with future identity binding → plan written covering Core API, SDK, and Chrome extension changes → implemented across all three layers (114 tests passing).

### DEC-008: Decision Logging via Cowork Skill
**Context:** Decisions made during development sessions were getting lost during context compaction and across session boundaries. Code diffs survived but the reasoning behind choices did not.
**Decision:** Created a Cowork skill (`decision-logger`) that proactively triggers when decisions are made during sessions. The skill writes to `docs/decisions/DECISION_LOG.md` (committed to git) and updates `CLAUDE_PROJECT_CONTEXT.md` section 12 for significant decisions. Also established a mandatory decision logging protocol in the project context document (section 13.1).
**Reasoning:** Instructions in project context alone are fragile since they depend on Claude following them consistently. A skill provides a structured, repeatable process with the correct format, auto-incrementing DEC numbers, and a checklist of required fields. The skill also triggers proactively and at session wrap-up to catch missed decisions.
**Alternatives:** Relied solely on instructions in CLAUDE_PROJECT_CONTEXT.md (fragile, no enforcement), used an external tool like Linear or Notion (over-engineered for this, adds dependencies), manual logging by user (burden on user, inconsistent format).

### DEC-007: Chrome Extension Architecture Direction
**Context:** Planning the Chrome extension as a Scout client for comparison shopping.
**Decision:** The Chrome extension will follow the iOS app's pattern: zero client-side NLP for MVP. Raw intent plus user-set constraints are sent to Core. Core handles all semantic processing via Granite. The extension uses the same 4 API endpoints as the iOS app (POST /sessions, GET /sessions/{id}, POST /sessions/{id}/approve, POST /checkout). Ed25519 signing via tweetnacl.js, key storage in Chrome's storage.local API.
**Reasoning:** ADR-001 allocates 20% NLP to Scouts, but the iOS app ships with 0% and works fine. Keeping the extension simple for MVP reduces scope and lets us ship faster. Client-side extraction can be added in v2.
**Alternatives:** Could have built NLP into the extension using a lightweight model or regex extraction per ADR-001. Deferred to keep MVP lean.

### DEC-006: Mock Beacons Sufficient for Chrome Extension MVP
**Context:** Five mock beacons exist (electronics, cloud, travel, office supplies, widgets) with category matching, dynamic pricing, and structured offer responses.
**Decision:** No enhancements needed to mock beacons for the Chrome extension demo. Current inventory diversity and response patterns are sufficient.
**Reasoning:** The extension just needs to send intent to Core and display offers. The beacons already handle matching, pricing, and structured responses. Polling interval may matter for demo UX but is acceptable for MVP.

### DEC-005: Entropy-Based Password Validation (No Complexity Rules)
**Context:** Adding a password field to the developer signup form. Needed a strength validation approach.
**Decision:** Use Shannon entropy (length * log2(character pool size)) with a 50-bit minimum. No complexity requirements (no forced uppercase, numbers, or symbols). Real-time visual entropy meter with color-coded strength ratings.
**Reasoning:** Password length contributes more to security than character complexity. A 24-character lowercase passphrase (~112 bits) is vastly stronger than a 6-character complex password (~37 bits). Entropy measurement respects this reality. 50-bit minimum blocks truly weak passwords while allowing passphrases.
**Alternatives:** Traditional complexity rules (rejected as security theater), minimum length only (too blunt), zxcvbn library (heavier dependency than needed).

### DEC-004: RPC Function for Signup Profile Creation (Bypass RLS)
**Context:** After Supabase pause/reset, the `on_auth_user_created` trigger on `auth.users` crashed signups with "Database error saving new user." Multiple fix attempts failed: SECURITY DEFINER on the trigger function, checking for orphaned records in auth.identities, recreating the function.
**Decision:** Remove the auth trigger entirely. Create a `create_developer_profile` RPC function with SECURITY DEFINER that the signup JavaScript calls directly after auth user creation. The existing `on_profile_created` trigger on `developer_profiles` then fires `generate_sandbox_key()` to create the API key.
**Reasoning:** The auth trigger was unreliable across Supabase pause/reset cycles. The RPC approach is explicit (called from JS, not implicit via trigger), debuggable, and SECURITY DEFINER bypasses RLS which was blocking the direct table insert from the client. The profile creation trigger chain (RPC -> insert -> trigger -> API key) is clean and testable.
**Alternatives:** Fix the auth trigger (attempted, failed repeatedly), add permissive RLS insert policy (security concern), use Supabase Edge Functions (over-engineered for this).
**Chain of events:** Auth trigger failed -> tried SECURITY DEFINER on trigger function -> still failed -> dropped trigger, signup worked -> but profile/API key not created -> direct JS insert blocked by RLS -> RPC with SECURITY DEFINER solved it.

### DEC-003: Idempotent Supabase Schema
**Context:** Supabase paused due to inactivity, wiping custom tables but preserving auth. Re-running schema failed with "policy already exists" errors.
**Decision:** Add `DROP POLICY IF EXISTS` before every `CREATE POLICY`, and `DROP TRIGGER IF EXISTS` before trigger creation. Also added cleanup of legacy functions/triggers at the top of the schema file.
**Reasoning:** Schema must be safely re-runnable after any Supabase reset. Idempotent scripts prevent manual intervention.
