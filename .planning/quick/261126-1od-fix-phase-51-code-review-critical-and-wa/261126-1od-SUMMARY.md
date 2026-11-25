---
phase: 51-quick-review-fixes
plan: 261126-1od
subsystem: ai
tags: [standalone-chat, tool-capability, system-prompt, tdd, phase51]

requires:
  - phase: 51-taskmate-chat-standalone
    provides: "Standalone Tauri chat shell and isStandaloneChat flag"
provides:
  - "Pure standaloneCapability option on getToolsForTurnWithRemote"
  - "Standalone tool payload with no TaskMate DB mutation tools"
  - "Standalone system prompt without mutation-capability claims"
affects: [phase51, ai-chat, chatTurnTools, AIChatDrawer]

tech-stack:
  added: []
  patterns:
    - "Capability option on pure payload builder instead of allowedToolNames (would strip MCP)"
    - "TDD RED before GREEN, scoped Vitest paths only"

key-files:
  created: []
  modified:
    - src/services/ai/chatTurnTools.ts
    - tests/ai/chatTurnTools.test.ts
    - src/components/ai/AIChatDrawer.tsx
    - tests/phase51/groundingSuppression.test.tsx

key-decisions:
  - "standaloneCapability filters only builtin AI_DATABASE_TOOLS by a fixed six-name allowlist; dynamic MCP tools stay untouched"
  - "SSH/Oracle addenda come from getGatedAddenda (config readiness), not the legacy disabled-name set"
  - "Legacy prompt and tool payload remain byte-identical when standalone is false"
  - "Standalone prompt keeps role/date, NEVER GUESS, diagram and analysis-mode retrieval rules; drops TaskMate entity and mutation rules"

patterns-established:
  - "standaloneCapability: true at the drawer turn builder is the single source of standalone tool narrowing"

requirements-completed: []

duration: 3 min
completed: 2026-11-25
---

# Phase 51 Quick 261126-1od: CR-01 / WR-03 Summary

**Standalone chat tool payload now excludes all TaskMate DB mutation tools while preserving knowledge, artifact and dynamic read tools; the matching system prompt no longer claims mutation powers.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-25T18:16:00Z
- **Completed:** 2026-11-25T18:19:16Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Thêm `standaloneCapability?: boolean` thuần túy vào `RemoteTurnToolOptions`; khi bật, payload chỉ giữ 6 builtin knowledge/artifact tool cộng dynamic MCP/Graphiti và SSH/Oracle gated bởi cấu hình.
- Không dùng `allowedToolNames` (bộ lọc này cũng cắt MCP) và không sửa chữ ký `getToolsForTurn` hay catalog read-only.
- `AIChatDrawer` truyền cờ theo `isStandaloneChat`; standalone prompt mô tả đúng năng lực thực gửi, legacy prompt giữ nguyên.
- `groundingSuppression.test.tsx` capture `toolsSent` và chặn 6 tên mutation tool nêu trong CR-01; legacy capture vẫn giữ đầy đủ tool cũ.

## Task Commits

1. **Task 1 RED (test)** - `b6d9af2a`
2. **Task 1 GREEN (feat)** - `f12361e0`
3. **Task 2 RED (test)** - `5ef274be`
4. **Task 2 GREEN (feat)** - `0ed5efa7`

## Files Created/Modified

- `src/services/ai/chatTurnTools.ts` - pure standalone capability option and fixed builtin allowlist.
- `tests/ai/chatTurnTools.test.ts` - RED/GREEN tests for standalone, legacy and option isolation.
- `src/components/ai/AIChatDrawer.tsx` - passes the flag and branches the system prompt.
- `tests/phase51/groundingSuppression.test.tsx` - captures `toolsSent`, asserts tool and prompt boundaries.

## Decisions Made

- Dùng allowlist cố định trên builtin thay vì `allowedToolNames`, vì option sau lọc cả dynamic MCP tool.
- Lấy SSH/Oracle qua `getGatedAddenda` để readiness là điều kiện duy nhất; legacy disabled-name set chỉ áp cho nhánh cũ.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. RED observed before GREEN for both tasks.

## User Setup Required

None.

## Next Phase Readiness

CR-01 và WR-03 đóng; các warning WR-01/02/04/05/06 vẫn do plan/quick khác xử lý. Chưa push; nhánh `pre-v1.6-baseline`.

## Verification

- `npx vitest run tests/ai/chatTurnTools.test.ts --bail=1`: 22/22 pass.
- `npx vitest run tests/phase51/groundingSuppression.test.tsx --bail=1`: 7/7 pass.
- `npx vitest run tests/phase51 --bail=1`: 7 files, 32/32 pass.
- `npx tsc --noEmit`: clean.

## Self-Check: PASSED

- 4 scoped files exist; 4 commits present on `pre-v1.6-baseline`.
- Out-of-scope files (`standaloneCopy.test.tsx`, quick `261126-1kz`, `.planning/config.json`, debug/review artifacts) untouched.

---
*Phase: 51-quick-review-fixes*
*Completed: 2026-11-25*
