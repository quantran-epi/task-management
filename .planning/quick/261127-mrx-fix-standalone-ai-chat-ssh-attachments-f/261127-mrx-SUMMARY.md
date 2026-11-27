---
phase: quick
plan: 261127-mrx
subsystem: ai
tags: [standalone-chat, system-prompt, referenced-files, vitest]
requires:
  - phase: quick-261127-jvm
    provides: "SSH file picker attaching remote paths into turn references tab"
provides:
  - "buildReferencedFilesPrompt pure helper: one <referenced_files> block from attached paths"
  - "buildStandaloneSystemPrompt pure helper: standalone prompt with optional referenced_files suffix"
  - "Standalone AI chat now sees attached file paths in its system prompt; ordinary chat unchanged"
affects:
  - "TaskMate Chat standalone AI surface, SSH FS attachment flow"
actuals:
  tokens: 2400
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Pure prompt-builder helpers exported from the component module and imported directly in node-environment Vitest tests"
key-files:
  created:
    - src/components/ai/__tests__/referencedFilesPrompt.test.ts
  modified:
    - src/components/ai/AIChatDrawer.tsx
key-decisions:
  - "Block referenced_files là nguồn duy nhất từ allFiles cho cả hai nhánh prompt, dựng qua helper thuần; không đọc nội dung file, không đổi attachedPaths/attachmentScope/runtime"
patterns-established:
  - "Pure prompt builder helper + node-env targeted test, no component render"
requirements-completed: [STANDALONE-ATTACHED-PATHS]
coverage:
  - id: D1
    description: "Standalone system prompt carries one referenced_files block with exact attached paths when attachments exist, and none when empty"
    requirement: STANDALONE-ATTACHED-PATHS
    verification:
      - kind: unit
        ref: src/components/ai/__tests__/referencedFilesPrompt.test.ts#buildStandaloneSystemPrompt
        status: pass
    human_judgment: false
  - id: D2
    description: "Ordinary chat prompt keeps its existing referenced_files position and content"
    requirement: STANDALONE-ATTACHED-PATHS
    verification:
      - kind: unit
        ref: src/components/ai/__tests__/referencedFilesHint.test.ts#REFERENCED_FILES_HINT
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-11-27
status: complete
---

# Quick 261127-mrx: Standalone AI chat gửi đường dẫn file đính kèm trong system prompt Summary

**Standalone AI chat hiện nhận block `<referenced_files>` chứa nguyên đường dẫn file đã chọn qua SSH picker, dùng chung helper với nhánh ordinary, không đọc nội dung file**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-11-27T16:29:14+07:00
- **Completed:** 2026-11-27T16:30:03+07:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Thêm `buildReferencedFilesPrompt(paths)` và `buildStandaloneSystemPrompt(params)` là helper thuần, export từ `src/components/ai/AIChatDrawer.tsx`.
- Nhánh standalone giờ nối block từ `allFiles` sau `STANDALONE_ANALYSIS_PROMPT_SEGMENT`; rỗng thì trả đúng prompt cũ.
- Ordinary chat dùng cùng block được dựng một lần, giữ nguyên vị trí và nội dung.
- Thêm `src/components/ai/__tests__/referencedFilesPrompt.test.ts` với 4 case, gồm fixture path có dấu cách.

## Task Commits

1. **Task 1: Đưa referenced_files vào standalone prompt qua helper dùng chung** - `b6cd87a5` (feat)
2. **Task 2: Test có mục tiêu cho block referenced_files trên standalone** - `45842bec` (test)

## Files Created/Modified
- `src/components/ai/AIChatDrawer.tsx` - thêm hai helper thuần, wire referencedFilesBlock vào cả hai nhánh prompt
- `src/components/ai/__tests__/referencedFilesPrompt.test.ts` - 4 case kiểm tra block và prompt standalone

## Decisions Made
- Dùng một block `<referenced_files>` duy nhất từ `allFiles` cho cả hai nhánh; helper thuần không db/SSH/đọc file; `attachedPaths`, `attachmentScope`, tool list và runtime giữ nguyên.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. Injection scan từ hook chỉ khớp chuỗi `![alt](data:...)` trong prompt mermaid có sẵn, không phải lệnh hay nội dung đáng ngờ.

## User Setup Required
None - no external service configuration required.

## Verification
- `npx vitest run src/components/ai/__tests__/referencedFilesPrompt.test.ts src/components/ai/__tests__/referencedFilesHint.test.ts --bail=1` — 2 files / 6 tests passed.
- `npx vitest run src/components/ai/__tests__/referencedFilesHint.test.ts --bail=1` — 1 file / 2 tests passed (Task 1 gate).
- `npx tsc --noEmit --pretty false` — exit 0.
- `git diff --check` — sạch. Không chạy full `npm test`.

## Next Phase Readiness
Sẵn sàng cho UAT trên standalone chat: chọn file qua SSH picker rồi hỏi agent về file đó; agent phải thấy đường dẫn chính xác. Không blocker.

---
*Plan: 261127-mrx*
*Completed: 2026-11-27*
