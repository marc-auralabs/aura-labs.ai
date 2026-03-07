# Proposed: Repository Structure Reorganisation

> **Status:** DRAFT — awaiting review before any files are moved.
> **Date:** 2026-03-07
> **Context:** Post-versioning audit revealed structural issues that would
> confuse a new developer joining the project.

---

## Problems with Current Structure

### 1. `core/` vs `aura-core/` naming collision

A new developer sees two directories that sound like the same thing:

```
/core/                  ← mock implementation (3 files)
/aura-core/             ← real backend (4 microservices, database, migrations)
```

They'd have to open both and read the code to know which is production.
The mock is useful for local development but its current name doesn't
communicate that.

**Proposed fix:** Rename `core/` → `mock/` (or `dev/mock-core/`). The name
should immediately tell a developer this isn't the real thing.

### 2. Root directory clutter

The repo root currently has 11 HTML files, 4 PNG files, configuration files,
documentation, and the demo script all mixed together:

```
/                       ← 30+ files at root level
├── index.html          ← marketing homepage
├── developers.html     ← marketing page
├── developer-login.html
├── developer-signup.html
├── forgot-password.html
├── reset-password.html
├── how-it-works.html
├── architecture.html
├── aura_pitch_deck.html
├── hidden.html         ← gitignored
├── hidden_content_updated.html  ← gitignored duplicate
├── auratransparent.png
├── auratransparent25.png
├── auratransparentfinal.png
├── auratransparentfinal_noname.png
├── demo.sh
├── package.json
├── README.md
├── CHANGELOG.md
└── ... (config files)
```

A developer opening this repo sees marketing assets before they see code.
The `portal/` directory exists but only has one file in it.

**Constraint discovered:** The HTML files cannot simply be moved into a
subdirectory. Nearly every page uses relative paths to link to other pages,
to `docs/`, `portal/`, `examples/`, and `schemas/`. The login, signup, and
password reset pages also have hardcoded redirects like
`window.location.href = 'portal/'` and
`window.location.origin + '/portal/'`. Moving these files would break all
of those references and require rewriting every page.

**Proposed fix (revised):**

- **HTML files stay at root** — moving them is too risky for the benefit.
- **Root PNGs** → move to `brand/` (which already exists for this purpose).
  No HTML file references these by relative path — they're only used as
  standalone assets.
- **`demo.sh`** → move to `scripts/` (no HTML dependency).
- **Future consideration:** If the site grows, introduce a build step or
  a shared `config.js` with base paths, then consolidate into `site/`.
  Not worth doing now.

### 3. `scouts/` and `beacons/` vs `sdks/`

Three directory names that overlap in concept:

```
/scouts/simple-scout/   ← a reference implementation
/beacons/simple-beacon/ ← a reference implementation
/sdks/scout-js/         ← the production SDK
/sdks/beacon-js/        ← the production SDK
```

The distinction is: `sdks/` contains the libraries developers import, while
`scouts/` and `beacons/` contain runnable example agents. But the naming
doesn't make this clear — "scouts" could mean either.

**Proposed fix (Option A — rename):**

```
/sdks/                  ← libraries (unchanged)
/examples/agents/       ← runnable reference implementations
  ├── simple-scout/
  └── simple-beacon/
```

This makes the relationship explicit: SDKs are libraries, examples are
runnable programs that use those libraries.

**Proposed fix (Option B — keep but add README clarity):**

Leave the directories where they are but add a clear top-level README
section explaining what each directory contains. Less disruptive, but
the naming confusion persists.

### 4. Empty `tools/` directory

An empty directory that adds noise.

**Proposed fix:** Delete it, or if there's a future plan for it, add a
placeholder README explaining what will go here.

### 5. `aura_pitch_deck.html` at root

An HTML-rendered pitch deck sitting alongside `package.json`. This is
a marketing/investor asset.

**Proposed fix:** Move to `site/` with the other HTML pages, or into
a `marketing/` directory if we want to separate investor-facing content
from developer-facing content.

---

## Proposed Directory Tree (After Restructure)

```
aura-labs/
├── .claude/                    # Claude skills & project config
├── .github/                    # CI/CD workflows
├── .githooks/                  # Git hooks
│
├── aura-core/                  # Backend services (unchanged)
│   ├── database/
│   ├── migrations/
│   └── services/
│       ├── core-api/
│       ├── core-worker/
│       ├── intent-svc/
│       └── policy-svc/
│
├── sdks/                       # Production SDKs (unchanged)
│   ├── beacon-js/
│   ├── scout-js/
│   └── mcp-server-scout/
│
├── apps/                       # Client applications (unchanged)
│   ├── scout-chrome-ext/
│   └── scout-it-ios/
│
├── examples/                   # Runnable examples & reference agents
│   ├── agents/
│   │   ├── simple-scout/       ← moved from /scouts/simple-scout/
│   │   └── simple-beacon/      ← moved from /beacons/simple-beacon/
│   ├── e2e-demo.js
│   └── README.md
│
├── mock/                       # Local development mocks
│   ├── mock-aura-core.js       ← moved from /core/src/mock-aura-core.js
│   ├── client-manager.js       ← moved from /core/src/client-management/
│   ├── package.json
│   └── README.md
│
├── [root HTML files]           # Stay at root (relative path dependencies)
│   ├── index.html
│   ├── developers.html
│   ├── developer-login.html
│   ├── developer-signup.html
│   ├── forgot-password.html
│   ├── reset-password.html
│   ├── how-it-works.html
│   ├── architecture.html
│   ├── aura_pitch_deck.html
│   └── portal/
│       └── index.html
│
├── brand/                      # Brand assets (absorb root PNGs)
│   ├── logos.html
│   ├── auratransparent.png     ← moved from root
│   ├── auratransparentfinal.png
│   └── auratransparentfinal_noname.png
│
├── fonts/                      # Typography (unchanged)
│
├── schemas/                    # Protocol schemas (unchanged)
│
├── scripts/                    # Automation & demo scripts
│   ├── demo.sh                 ← moved from root
│   ├── test-flow.sh
│   ├── run-beacons.sh
│   └── security-tests.sh
│
├── docs/                       # Documentation (unchanged internally)
│   ├── ASSET_REGISTRY.md
│   ├── api/
│   ├── architecture/
│   ├── beacon/
│   ├── decisions/
│   ├── getting-started/
│   ├── integration-guides/
│   ├── protocol/
│   ├── scout/
│   ├── security/
│   └── tutorials/
│
├── README.md                   # Project overview
├── CHANGELOG.md                # Release history
├── CONTRIBUTING.md              # Contribution guide
├── SECURITY.md                 # Security policy
├── ROADMAP.md                  # Product roadmap
├── package.json                # Root package config
├── .gitignore
└── .env.example                # (if needed at root)
```

---

## What Changes and What Doesn't

### Moved (5 changes)

| From | To | Reason |
|------|----|--------|
| `core/` | `mock/` | Clarify it's not production code |
| `scouts/simple-scout/` | `examples/agents/simple-scout/` | Group with examples, not a top-level concept |
| `beacons/simple-beacon/` | `examples/agents/simple-beacon/` | Same |
| Root PNG files (4) | `brand/` | Already have a brand directory |
| `demo.sh` | `scripts/demo.sh` | Already have a scripts directory |

### Deleted

| Item | Reason |
|------|--------|
| `tools/` | Empty directory, adds noise |

### NOT moved (revised from original proposal)

| Item | Reason to keep in place |
|------|------------------------|
| Root HTML files (11) | Every page uses relative paths to `docs/`, `portal/`, `examples/`, `schemas/`. Login/signup/portal pages have hardcoded `window.location.origin + '/portal/'` redirects. Moving breaks all of this. |

### Unchanged

Everything else stays exactly where it is: `aura-core/`, `sdks/`, `apps/`,
`docs/`, `schemas/`, `brand/`, `fonts/`, `.github/`, `.claude/`, and all
root config/doc files.

---

## Impact Assessment

### What breaks

- **`demo.sh` path in README/docs** — any reference to `./demo.sh` needs
  updating to `./scripts/demo.sh`
- **Import paths in examples** — `simple-scout` and `simple-beacon` may
  import from `../../sdks/...` — verify relative depth before moving
- **CI pipeline** — if `.github/workflows/ci.yml` references file paths
  for the moved directories, those need updating

### What doesn't break

- All SDK imports (unchanged locations)
- Core API (unchanged)
- Chrome extension (unchanged)
- All test files (unchanged)
- **Public site / HTML pages** — all stay at root, zero breakage
- Documentation content (unchanged, though some links to moved files
  would need updating)

### Migration approach

If approved:

1. Create new directories (`site/`, `mock/`, `examples/agents/`)
2. `git mv` files to preserve history
3. Update any import paths or references
4. Run the change-audit skill to catch anything missed
5. Delete empty leftover directories
6. Update ASSET_REGISTRY.md with new paths
7. Single commit with clear message

---

## Decision Required

This is a structural change that touches git history for moved files.
It's worth doing before the team grows, but it's a one-time disruption.

Alternatives:

- **Do nothing:** Accept the current structure. Add a root README section
  explaining the directory layout. Least disruptive but doesn't fix the
  underlying confusion.

- **Partial cleanup:** Just do the safe moves (PNGs → `brand/`,
  `demo.sh` → `scripts/`, delete empty `tools/`). Skip the directory
  renames. Lower risk, partial improvement.

- **Recommended restructure (this proposal):** Move the 5 items listed
  above, delete `tools/`, leave HTML at root. Balances cleanup with
  zero risk to the public site.

### Separate concern: hardcoded Supabase credentials in HTML

The login, signup, and portal pages contain hardcoded Supabase URL and
publishable API key directly in the HTML source. These are publishable
keys (not secrets), but they're duplicated across 5 files. This should
be addressed separately from the restructure — extract into a shared
`config.js` so there's a single source of truth. See security audit
notes for details.
