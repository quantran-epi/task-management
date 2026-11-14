---
phase: quick-261114-pxi
plan: '01'
subsystem: ai-office
tags: [ai-office, tools, knowledge, allowlist]
requires: []
provides:
  - AI Office leader and employee tool payloads include retrieve_knowledge and get_document_details
affects:
  - src/services/ai/chatTurnTools.ts
tech-stack:
  added: []
  patterns: [single-allowlist-spread]
key-files:
  created: []
  modified:
    - src/services/ai/chatTurnTools.ts
    - tests/ai/chatTurnTools.test.ts
decisions:
  - Lead list inherits the two knowledge tools through the existing spread + get_item_details filter; LEAD_TOOL_ALLOWLIST itself untouched
metrics:
  duration: ~5 min
  completed: 2026-11-14
---

# Quick 261114-pxi: Add knowledge research tools to the AI Office allowlists

## One-liner

AI Office leader and employees now reach `retrieve_knowledge` (hybrid fulltext + vector + graph) and `get_document_details` (full local document read), matching the AI Chat panel's knowledge capability.

## What changed

`EMPLOYEE_READ_ONLY_ALLOWLIST` gained `retrieve_knowledge` and `get_document_details` between `search_knowledge_base` and `read_file`. `LEAD_TOOL_ALLOWLIST` spreads that array and filters only `get_item_details`, so both names reach the lead payload without editing the lead list. Doc comment extended to state why both are safe unconditionally:

- `retrieve_knowledge` returns a structured error string when the knowledge server is disabled — no capability probe needed.
- `get_document_details` reads local `db.notes` only and routes `title` / `body` / `tags` through `wrapField`, so the untrusted-data boundary holds (unlike `get_item_details`, still employee-only).
- Neither is in `MUTATION_TOOLS`, so `payloadHasMutationTool` stays false.

`src/services/ai/aiTools.ts` and `src/services/ai/office/teamRunCoordinator.ts` needed no change — definitions, dispatch cases and allowlist plumbing already existed.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Add the two knowledge tools to the employee allowlist | 7936c135 |
| 2 | Assert both tools reach the employee and lead payloads | ced06e08 |

## Verification

- `npx tsc --noEmit -p tsconfig.json` — no `chatTurnTools` errors.
- `npx vitest run tests/ai/chatTurnTools.test.ts` — 8/8 passed.
- `git diff --stat HEAD~2` — exactly the two planned files, 23 insertions, 0 deletions.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `src/services/ai/chatTurnTools.ts` — modified, committed in 7936c135.
- `tests/ai/chatTurnTools.test.ts` — modified, committed in ced06e08.
