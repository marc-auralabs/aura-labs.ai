# OWASP Top 10 (2025) — Code-Level Checklist

This is one of several applicable secure coding frameworks. Others include
CWE/SANS Top 25 (updated annually, more granular), OWASP ASVS (verifiable
requirements at three levels of rigour), NIST SSDF SP 800-218 (SDLC-wide
security framework), and SEI CERT Coding Standards (language-specific).

If the organisation follows a different framework, use that instead and
treat this checklist as supplementary reference.

---

## A01: Broken Access Control

Remains the #1 risk. Now includes SSRF (previously its own category).

**Mitigations:**
- Default to deny. All routes/endpoints require explicit authorisation.
- Enforce access control server-side. Never rely on client-side guards.
- Validate that the authenticated user owns or has access to the requested
  resource (IDOR prevention).
- Rate-limit API access, especially sensitive operations.
- Log access control failures and alert on repeated attempts.
- Invalidate sessions and tokens on logout and after a timeout.
- Validate and sanitise all user-supplied URLs to prevent SSRF. Block
  requests to internal/private IP ranges (127.x, 10.x, 172.16-31.x,
  192.168.x, 169.254.x, ::1). Disable HTTP redirects or validate the
  redirect target. Use an allowlist of permitted domains where possible.

**Test Expectations:**
- Unauthenticated users get 401/403 on protected endpoints.
- User A cannot access User B's resources.
- Non-admin users cannot reach admin endpoints.
- Requests to internal IPs and localhost are blocked (SSRF).
- URLs with unexpected schemes (file://, gopher://) are rejected.

---

## A02: Security Misconfiguration

Moved from #5 (2021) to #2, reflecting how prevalent misconfiguration is.

**Mitigations:**
- Disable debug mode, stack traces, and verbose errors in production.
- Remove default accounts and passwords.
- Set restrictive CORS policies (not `*` in production).
- Disable unnecessary HTTP methods (TRACE, OPTIONS if unused).
- Set security headers: X-Content-Type-Options, X-Frame-Options,
  Strict-Transport-Security, Referrer-Policy, Content-Security-Policy.
- Keep dependencies updated. Use `npm audit`, `pip-audit`, `snyk`,
  `dependabot`, or equivalent.
- Remove unused features, components, documentation, and sample files.
- Automate configuration verification in CI/CD pipelines.

**Test Expectations:**
- Production config returns no stack traces on errors.
- Security headers are present in responses.
- CORS is not set to `*` in production configuration.
- Default credentials do not work.

---

## A03: Software Supply Chain Failures

New in 2025. Expands the former "Vulnerable and Outdated Components" to
cover the entire software supply chain — dependencies, build systems,
distribution infrastructure, and transitive dependency risks.

**Mitigations:**
- Pin dependency versions in lock files. Review updates before merging.
- Run vulnerability scanners in CI: `npm audit`, `pip-audit`,
  `cargo audit`, `sbt dependencyCheck`.
- Verify package integrity — check signatures, checksums, and provenance.
- Monitor for typosquatting and dependency confusion attacks.
- Maintain a Software Bill of Materials (SBOM) for production systems.
- Prefer actively maintained libraries with recent commits and security
  response processes.
- Remove unused dependencies.
- Restrict build pipeline permissions. Apply least privilege to CI/CD
  service accounts.
- Validate that build artefacts match source — reproducible builds where
  feasible.

**Test Expectations:**
- CI pipeline includes dependency vulnerability scanning.
- No critical or high CVEs in direct dependencies.
- Lock files are committed and reviewed.
- Build pipeline uses pinned tool versions, not `latest`.

---

## A04: Cryptographic Failures

Formerly "Sensitive Data Exposure" — renamed to focus on root cause.

**Mitigations:**
- Classify data: identify PII, credentials, financial data, health data.
- Encrypt sensitive data at rest (AES-256-GCM or per organisational
  standard — ask before assuming).
- Enforce TLS 1.2+ for data in transit. Disable older protocols.
- Never use MD5 or SHA-1 for security purposes.
- Use strong password hashing: argon2id > bcrypt > scrypt.
- Never commit secrets to version control.
- Rotate keys and credentials on a defined schedule.
- Use a secrets manager or HSM for key storage — not application config.

**Test Expectations:**
- Sensitive fields are not present in API responses unless explicitly
  required.
- Password storage uses a proper hash algorithm (verify hash format).
- Endpoints reject plain HTTP connections if TLS is required.
- No secrets in source code or configuration files.

---

## A05: Injection

Dropped from #3 (2021) to #5 but remains one of the most exploitable
weaknesses and continues to surface in high-profile breaches.

**Mitigations:**
- Use parameterised queries / prepared statements for all database access.
- Use ORM methods instead of raw queries when possible.
- Validate input: type, length, range, format. Allowlist expected patterns.
- Escape special characters for the target interpreter context.
- Never pass user input directly to shell commands.
- Use Content-Security-Policy headers to mitigate XSS.
- For APIs: validate request bodies against schemas.

**Test Expectations:**
- SQL injection payloads are rejected or neutralised.
- XSS payloads are escaped or rejected.
- Command injection attempts are blocked.
- All tests should confirm the input is either rejected at the boundary
  or safely escaped — not silently accepted.

---

## A06: Insecure Design

Addresses flaws in architecture or logic rather than implementation
mistakes — weak password-reset flows, missing threat modelling, absent
authorisation steps.

**Mitigations:**
- Use threat modelling during design (STRIDE, attack trees).
- Apply the principle of least privilege at every layer.
- Establish trust boundaries — clearly define where untrusted data enters.
- Implement rate limiting and resource quotas from the start.
- Use well-known, proven architectural patterns.
- Perform design-stage reviews before implementation.

**Test Expectations:**
- Rate limiting works on sensitive operations.
- Error messages do not leak implementation details.
- The system fails safely (auth failure = deny, not allow).

---

## A07: Authentication Failures

Renamed from "Identification and Authentication Failures." Remains a
major enabler of account takeover and unauthorised access.

**Mitigations:**
- Enforce password complexity or use passkeys/MFA.
- Use bcrypt/argon2id with appropriate work factors.
- Implement account lockout or progressive delays after failed attempts.
- Generate session IDs with cryptographically secure randomness.
- Invalidate session tokens on logout.
- Never expose session IDs in URLs.
- Implement credential stuffing protections.

**Test Expectations:**
- Brute-force login attempts trigger lockout/throttling.
- Session tokens change after login (session fixation prevention).
- Expired sessions return 401.

---

## A08: Data Integrity Failures

Covers insecure CI/CD, unsigned updates, and untrusted deserialisation.

**Mitigations:**
- Verify digital signatures on software updates and packages.
- Ensure CI/CD pipelines have proper access controls and audit logs.
- Never deserialise untrusted data without validation. Prefer safe
  formats (JSON) over risky ones (pickle, Java serialisation, YAML
  with `!!python`).
- Use Subresource Integrity (SRI) for external scripts and stylesheets.

**Test Expectations:**
- Deserialisation of malformed or unexpected data does not crash or
  execute arbitrary code.
- API endpoints reject tampered payloads (e.g., modified JWT without
  valid signature).

---

## A09: Security Logging & Alerting Failures

Renamed from "Security Logging and Monitoring Failures" to emphasise
that logging without alerting is insufficient.

**Mitigations:**
- Log authentication events (success and failure), access control
  failures, input validation failures, and application errors.
- Include timestamp, source IP, user identity, and event type in logs.
- Never log passwords, tokens, or sensitive PII.
- Protect log files from tampering (append-only, centralised logging).
- Set up alerts for anomalous patterns — logging alone is not enough.
- Define incident response procedures tied to alert thresholds.

**Test Expectations:**
- Failed login attempts produce log entries.
- Log output does not contain passwords or tokens.
- Alert thresholds trigger on repeated access control failures.

---

## A10: Mishandling of Exceptional Conditions

New in 2025. Covers improper error handling, logical errors, failing
open, and other scenarios where systems behave unsafely under abnormal
conditions. 50% of OWASP survey respondents ranked this their #1
emerging concern.

**Mitigations:**
- Define secure failure modes: fail closed, deny access on error.
- Use consistent error-handling frameworks across the codebase.
- Log error details internally; return generic messages externally.
- Never leak stack traces, keys, or internal paths in error responses.
- Handle null/nil references explicitly — do not rely on default
  behaviour.
- Test behaviour under resource exhaustion, timeouts, and malformed
  input.
- Design for graceful degradation — partial failure should not cascade
  into total system failure.

**Test Expectations:**
- Error responses do not contain stack traces, secrets, or internal
  paths.
- The system denies access (fails closed) when an authorisation check
  encounters an error.
- Timeout and resource exhaustion scenarios do not crash the application
  or leave it in an inconsistent state.
- Null/empty inputs to every public function are handled explicitly.
