---
phase: quick
plan: 261005-jfa
subsystem: ai
tags: [ai, chat, autocomplete, mentions, file-picker]
requires: []
provides:
  - remove-file-autocomplete
affects:
  - ChatInputBar
tech-stack:
  added: []
  patterns: [direct-file-picker]
key-files:
  created: []
  modified:
    - src/components/ai/ChatInputBar.tsx
    - tests/ai/ChatInputBar.test.tsx
decisions:
  - Wire /file command and cmd-file option directly to handlePickFile instead of inserting @file text
status: complete
metrics:
  duration: 5m
  completed_date: "2026-10-05"
---

# Quick Task 261005-jfa: Remove @file Autocomplete in Chat Input Bar Summary

Remove local file autocomplete suggestions and path completion in `ChatInputBar` while preserving the paperclip file attachment button and direct `/file` picker invocation.

## Key Changes

1. **`src/components/ai/ChatInputBar.tsx`**:
   - Removed `fileSuggestions` state and the `useEffect` invoking Tauri `complete_local_path`.
   - Removed `isFileMode` branch in `options` calculation and removed `fileHintOption` (`Tham chiếu tập tin máy tính... (@file)`).
   - Removed `handleSelect` directory navigation logic for `option.isDir` and `option.key === 'mention-file-entry'`.
   - Wired `option.key === 'cmd-file'` directly to `handlePickFile()`.
   - Updated `/file` command description in `COMMANDS` to `Đính kèm tập tin từ máy tính`.
   - Updated placeholder to `'Hỏi AI... (@, #, /)'`.
   - Removed unused `FolderOutlined` icon import while keeping `PaperClipOutlined` and `FileTextOutlined`.

2. **`tests/ai/ChatInputBar.test.tsx`**:
   - Added test verifying default placeholder no longer references `@file`.
   - Added test verifying typing `@` displays tasks and `@doc:` hint without displaying file autocomplete hints.
   - Added test verifying typing `@file` does not trigger path completion or web sandbox warning.
   - Added test verifying paperclip button invokes `select_local_file` in Tauri app.
   - Added test verifying submitting `/file` command triggers file picker directly.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm test -- tests/ai/ChatInputBar.test.tsx src/services/ai/__tests__/fileReference.test.ts`: Passed (26/26 tests).
- `npm run build`: Typecheck and Vite build succeeded with zero errors.

## Self-Check: PASSED
- Modified file exists: `src/components/ai/ChatInputBar.tsx` (FOUND)
- Modified file exists: `tests/ai/ChatInputBar.test.tsx` (FOUND)
- Commit exists: `e864620` (FOUND)
