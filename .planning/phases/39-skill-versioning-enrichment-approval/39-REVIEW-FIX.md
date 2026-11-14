---
phase: 39-skill-versioning-enrichment-approval
fixed_at: 2026-11-14T08:20:00Z
review_path: .planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md
iteration: 6
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-14T08:20:00Z
**Source review:** `.planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md`
**Iteration:** 6

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `neutralizeDelimiters` enumerates separators, so `/`, `(`, `,`, `.`, space-only and no-separator shapes survive

**Files modified:** `src/services/ai/untrustedData.ts` (new), `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `2110830b`
**Applied fix:** Restructured the pattern by SHAPE instead of widening the separator enumeration for a sixth time:

- BRACKETED branch: `\[…]` must close its `]` at end of line. Self-delimiting, so there is no separator list to be incomplete.
- BARE branch: keeps the tail requirement (separator, stray `]`, or end of line) because that is the branch that collides with prose.

The control moved to `src/services/ai/untrustedData.ts` — a zero-import module — so the DB tool layer (`aiTools.ts`) can apply the identical boundary without importing the prompt-assembly graph (which pulls Dexie at module load). `teamPrompts.ts` re-exports `wrapUntrusted`, so every existing call site is unchanged.

The CR-01 table is reorganised by shape and now covers the six shapes that defeated the enumeration (`/`, `(`, `,`, `.`, space-only, no separator) plus every separator the earlier rounds covered and the end-to-end forged-boundary-then-instruction shape from the review. The prose table is unchanged and still asserts byte-identical survival, so the two tables pin the pattern in both directions.

Verified by reverting to the round-5 regex: the new table fails on `slash` with `expected '…' to contain '[redacted-tag]'`. Restored.

**Status: requires human verification** — this is a logic change to a security control; the tests prove the shape coverage but the trade (a sentence quoting both bracketed tags is now redacted) is a judgement call the reviewer already endorsed.

### WR-03: `\p{Default_Ignorable_Code_Point}` is not a superset of `\p{Cf}`

**Files modified:** `src/services/ai/untrustedData.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `3dae04ee`
**Applied fix:** Fold is now `[\p{Cf}\p{Default_Ignorable_Code_Point}]` — the union. The five regressed code points (U+070F, U+0600, U+FFF9, U+13430, U+110BD) are rows in the CR-04 table so a future "complete set" swap cannot drop them silently. Verified by reverting to the round-5 fold: the table fails on `syriac abbreviation mark U+070F`.

### WR-01: `get_linked_context` still returns five raw free-text fields

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `1ffb273e`
**Applied fix:** `stickyNotes[].title`, `item.reminderNote`, `item.reminders[].note`, `item.documentLinks[]`, `crName` and `systemName` now go through the same `wrapField` boundary. The WR-03 test seeds a distinct marker per field and asserts every one is wrapped with its own marker, so a raw copy of one field cannot hide behind another's wrapper. A second test covers the CR and system branches.

### WR-02: The allowlist is not enforced at dispatch, and three advertised tools return raw text

**Files modified:** `src/services/ai/aiOrchestratorLoop.ts`, `src/services/ai/aiTools.ts`, `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/ai/aiTools.test.ts`
**Commit:** `bf994a4c`
**Applied fix:** Option (a) from the review, at the boundary the review named:

1. The loop derives `advertisedToolNames` from the turn's own `tools` payload and refuses any local DB tool not in it, before dispatch. The refusal is returned as the tool result so every `tool_call` still gets a `tool` message and the model can correct itself. Scoped to DB tools on purpose — dynamic MCP tools keep their own, more specific gate inside `mcpClient` (disabled server, read-only mode), and the mutation gate still runs first so a mutation refusal keeps its own message.
2. `query_tasks`, `query_change_requests` and `query_notes` now wrap their free text through one `wrapField` helper, so the two read paths agree again.

The stale comment claiming the bypass was closed is replaced by the mechanism that actually closes it.

## Skipped Issues

None.

---

_Fixed: 2026-11-14T08:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 6_
