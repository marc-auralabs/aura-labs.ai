---
name: decision-logger
description: >
  Log architectural and implementation decisions to the project's decision log.
  Use this skill whenever a decision is reached during a session, whether it's an
  architectural choice, technology selection, debugging conclusion, approach chosen
  over alternatives, or any "why" that would be lost without documentation.
  Trigger proactively when you notice a decision has been made (e.g., "let's go with
  RPC instead of triggers", "we'll use entropy not complexity rules"), even if the
  user doesn't explicitly say "log this." Also trigger when the user says things like
  "document this decision", "log that", "record this choice", "add this to the
  decision log", or "why did we do that" (to check existing decisions). Trigger at
  session wrap-up to catch any unlogged decisions. This skill is essential for
  preserving the reasoning behind changes across conversation compaction and session
  boundaries.
---

# Decision Logger

This skill captures the reasoning behind decisions so it survives context compaction, session boundaries, and handoffs between Claude instances. Code diffs show *what* changed; this skill preserves *why*.

## When to log a decision

A "decision" is any choice where alternatives existed and reasoning drove the selection. Not every code change is a decision. Here's the distinction:

**Log these** (decisions with reasoning):
- "We chose RPC over auth triggers because triggers are unreliable after Supabase resets"
- "Chrome extension will talk directly to Core API, not through MCP"
- "Using entropy-based password validation instead of complexity rules"
- "Deferring client-side NLP to v2, shipping with zero extraction for MVP"

**Don't log these** (routine implementation):
- "Added a CSS class for the button"
- "Fixed a typo in the README"
- "Updated the package version"

When in doubt, ask: "Would a future developer (or Claude session) need to know *why* this was done this way?" If yes, log it.

## How to log a decision

### Step 1: Read the current decision log

Read `docs/decisions/DECISION_LOG.md` in the project root to find the last DEC number. The next decision should increment from there. If the file doesn't exist, start at DEC-001.

### Step 2: Determine the decision details

Capture these elements (gather from the conversation context):

- **Title**: Short, descriptive name (e.g., "RPC over auth trigger for signup")
- **Context**: What problem or question led to this decision? What were we trying to solve?
- **Decision**: What was chosen? Be specific about the approach.
- **Reasoning**: Why this approach over the alternatives? What evidence, debugging, or discussion led here?
- **Alternatives considered**: What else was on the table? Why were they rejected?
- **Chain of events** (optional): If the decision emerged from debugging or iterative problem-solving, capture the sequence. This is especially valuable when the "obvious" first approach failed.

### Step 3: Write the entry

Insert the new entry under the current date heading in `docs/decisions/DECISION_LOG.md`. Entries are ordered newest-first within each date section. Use this format:

```markdown
### DEC-NNN: [Title]
**Context:** [What problem or question prompted this decision]
**Decision:** [What was chosen, specifically]
**Reasoning:** [Why this approach. Include evidence from debugging, testing, or discussion]
**Alternatives:** [What else was considered and why it was rejected]
```

Add the optional **Chain of events** field when the decision emerged from iterative debugging:

```markdown
**Chain of events:** [First tried X -> failed because Y -> then tried Z -> that also failed -> finally W worked because...]
```

If the date section doesn't exist yet, create it. Format: `## YYYY-MM-DD`

### Step 4: Update the project context (if significant)

For decisions that affect multiple components, set architectural precedent, or are hard to reverse, also add a row to the Key Decisions Log table (section 12) in `CLAUDE_PROJECT_CONTEXT.md`:

```markdown
| YYYY-MM | [Short description] | [One-line rationale]. See DEC-NNN. |
```

Not every decision needs to go here. Reserve it for ones that a new Claude session loading the project context would need to know about upfront.

### Step 5: Consider ADR promotion

If the decision is architecturally significant (affects the system's fundamental structure, is expensive to reverse, or establishes a pattern other decisions will follow), suggest promoting it to a full Architecture Decision Record at `docs/decisions/ADR-NNN-[TITLE].md`. Don't create the ADR automatically; suggest it to the user and let them decide.

## Batch logging at session end

When a session is wrapping up (user says goodbye, conversation is getting long, or you sense compaction may be approaching), review the conversation for any unlogged decisions. Present them to the user as a quick list: "I noticed we made these decisions that aren't logged yet: [list]. Should I log them?"

## Checking existing decisions

When someone asks "why did we do X?" or "what was the reasoning for Y?", search `docs/decisions/DECISION_LOG.md` and any ADR files in `docs/decisions/` to find relevant entries. Present the decision with its full context and reasoning.

## Important notes

- `CLAUDE_PROJECT_CONTEXT.md` is gitignored. It exists locally for Claude session context but isn't committed. Update it anyway since it's loaded into every session.
- `docs/decisions/DECISION_LOG.md` IS committed to git. It's the durable record.
- When reading the log to find the next DEC number, scan for the highest existing number, don't assume they're sequential (some may have been removed or renumbered).
- Keep entries concise but complete. A future reader should understand the decision without needing the full conversation transcript.
