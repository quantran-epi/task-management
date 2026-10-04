# Quick Task 261004-o1d: Fix Docs Editor Paste Autosave and Wiki-Link Autocomplete Summary

Fixed stale body closure bug during paste autosave and added interactive `[[` wiki-link autocomplete popup in `DocEditorPane`.

## Key Changes

1. **Paste Autosave Stale Closure Fix**:
   - Added `latestValuesRef` tracking `{ title, body, tags }` across renders and async operations in `DocEditorPane.tsx`.
   - Updated `handlePaste`: only calls `triggerAutoSave` if extracted `title` or `tags` actually changed, and passes `latestValuesRef.current.body`.
   - If only body changed, let `handleBodyChange` manage debounced saving without stale overwrite.

2. **Wiki-Link `[[` Autocomplete Popup**:
   - Detects trigger token `/(?:^|[^\\])\[\[([^\]\r\n]*)$/` on typing / cursor position in textarea.
   - Queries matching documents (`db.notes`), tasks (`db.tasks`), and projects (`db.projects`) from IndexedDB up to 8 items max.
   - Renders a floating popup with icons and badges (`📄 Tài liệu`, `✅ Tác vụ`, `📁 Dự án`).
   - Supports keyboard navigation: `ArrowUp`, `ArrowDown`, `Enter`, `Tab`, and `Escape`.
   - On candidate selection, formats and splices `[[type:id|Title]]` into the body at the trigger index, restores cursor position & focus, and triggers autosave.

3. **Unit Tests**:
   - Created `tests/components/notes/DocEditorPane.test.tsx` verifying:
     - Initial render of title and body.
     - Paste event handling without stale body overwriting during autosave.
     - Triggering `[[` and listing matching entities.
     - Clicking candidate to insert `[[type:id|Title]]` and saving.
     - Keyboard navigation (`ArrowDown`, `Enter`, `Escape`).

## Verification

- `npx tsc --noEmit`: Passed with 0 errors.
- `npx vitest run tests/components/notes/DocEditorPane.test.tsx`: 5/5 passed.
- `npx vitest run tests/components/notes/NoteDetailModal.test.tsx`: 3/3 passed.

## Self-Check: PASSED
- `src/components/notes/DocEditorPane.tsx`: FOUND
- `tests/components/notes/DocEditorPane.test.tsx`: FOUND
