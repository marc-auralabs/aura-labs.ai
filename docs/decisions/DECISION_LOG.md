# AURA Decision Log

A running log of architectural and implementation decisions made during development. Significant decisions may be promoted to full ADRs (Architecture Decision Records) in this directory.

**Format:** Each entry captures the decision, the reasoning, alternatives considered, and the date. Entries are prepended (newest first).

**When to log:** Any decision that affects how the system works, why a particular approach was chosen over alternatives, or that a future developer (or AI session) would need to understand to maintain the codebase.

---

## 2026-02-24

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
