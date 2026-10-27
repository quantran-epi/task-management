---
phase: quick
plan: 261027-fzh
subsystem: ai
tags: [mcp, retrieval, pagination, termination]
key-files:
  created: []
  modified:
    - src/services/ai/mcpRetrievalRunner.ts
    - src/services/ai/mcpEvidence.ts
    - tests/ai/mcpRetrievalRunner.test.ts
    - tests/ai/mcpEvidence.test.ts
requirements: [FZH-NOVELTY-TERMINATION, FZH-CURSOR-PAGINATION]
metrics:
  duration: 12m
  tasks: 2
  files: 4
---

# Quick 261027-fzh: MCP retrieval runs until evidence exhausted

MCP retrieval now terminates on evidence exhaustion with a 12-turn safety valve, and cursor-only tools paginate past page 1.

## Tasks

**1. Novelty-based termination with explicit safety-valve reporting** — commit `f89d479`
- Renamed `MAX_RETRIEVAL_TURNS` (4) to `MAX_RETRIEVAL_TURNS_SAFETY_VALVE` (12).
- Added `stopReason`, `knownRecordIds`, `consecutiveZeroNoveltyTurns` loop state.
- Per-turn novelty diff via `normalizeMcpEvidence(items).records`; 2 consecutive zero-novelty turns stop the loop (`novelty_exhausted`, no warning).
- `finish()` reports `partial` when `pagesCapped`, `turn_cap`, or `watchdog`; otherwise `complete`.
- Unused safety valve (natural loop exhaustion) sets `turn_cap` + explicit Vietnamese warning.
- Planner-done / no-executable-call stops remain `final` → `complete`.

**2. Structural cursor pagination** — commit `7d4223b`
- `PaginationHint.nextOffset` now optional; added `nextCursor?: string | number`.
- `extractPaginationHint` reads `nextCursor` / `next_cursor` / `nextPageToken` / `next_page_token`; `cursor` / `page_token` only with `has_more`/`truncated` true.
- Root first, then one level of plain-object children; offset checks unchanged and still take priority.
- `applyPaginationArg` accepts `string | number`.
- Page loop resolves `next = hint.nextCursor ?? hint.nextOffset`, breaks if `undefined`, breaks on a repeated value (`lastApplied` guard); `MAX_PAGES_PER_CALL` untouched.

## Verification

- `npx vitest run tests/ai/mcpEvidence.test.ts tests/ai/mcpRetrievalRunner.test.ts` — 25 passed (2 files).
- `npx tsc --noEmit` — clean (exit 0).
- `MAX_RETRIEVAL_TURNS` no longer appears alone; `nextCursor` present in both `mcpEvidence.ts` and the runner page loop.
- Only the four planned files changed.

## Deviations from Plan

None — plan executed as written.

## Known Stubs

None.
