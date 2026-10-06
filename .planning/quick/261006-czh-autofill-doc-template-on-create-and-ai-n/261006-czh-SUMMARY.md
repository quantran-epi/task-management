# Quick Task 261006-czh: Autofill Doc Template on Create and AI Normalize Action Summary

**Plan:** 261006-czh
**Tasks Completed:** 2/2
**Status:** complete

## Key Changes

1. **Quick Note Creation Fix & Template Autofill (`src/views/NotesView.tsx`, `src/components/notes/DocFolderTree.tsx`, `src/components/notes/DocListPane.tsx`)**:
   - Fixed `handleCreateDocument`: when user is in the `quick_notes` view without a target folder, note is created with `type: 'quick_note'`, title `'Ghi chú nhanh mới'`, and empty body (`''`), so it immediately renders in the quick notes list.
   - When creating a document (`type: 'document'`), note body is autofilled with `RECOMMENDED_DOC_TEMPLATE` (sections: H1 title, inline hashtags, Tóm tắt, Phạm vi, Thuật ngữ, Quy tắc, Luồng xử lý, Trạng thái & mã lỗi, Ví dụ, Ngoại lệ, Nguồn).
   - Dynamic CTA button in `DocFolderTree` and empty-state button/description in `DocListPane` now show `Tạo ghi chú nhanh` / `Chưa có ghi chú nhanh nào` when in `quick_notes` filter.

2. **AI Normalize Review Modal & DocEditorPane Integration (`src/components/notes/NormalizeDocModal.tsx`, `src/components/notes/DocEditorPane.tsx`)**:
   - Created `NormalizeDocModal` supporting:
     - Streaming AI generation using `streamChatCompletion` with `AI_KNOWLEDGE_DOC_PROMPT`.
     - Graceful validation/warning when NineRouter API key is missing.
     - AbortController cancellation on modal close or "Hủy" click.
     - 3 preview modes: "So sánh 2 cột" (split side-by-side original vs proposal), "Xem trước kết quả" (safe markdown preview via `renderSafeMarkdown`), and "Chỉnh sửa kết quả" (editable textarea).
     - "Chấp nhận" applies proposed markdown to document body, triggers auto-save, and displays success notification.
   - Added `AI Chuẩn hóa` button with robot icon in `DocEditorPane` toolbar to trigger normalization modal.

3. **Targeted Tests (`tests/views/NotesView.test.tsx`, `tests/components/notes/DocEditorPane.test.tsx`, `tests/components/notes/NormalizeDocModal.test.tsx`)**:
   - Verified quick note creation in `quick_notes` view.
   - Verified new document creation populates `RECOMMENDED_DOC_TEMPLATE`.
   - Verified `NormalizeDocModal` API key warning, streaming completion, onApply, and onClose behavior.
   - Verified `DocEditorPane` toolbar button opens `NormalizeDocModal`.
   - Strictly ran only target tests as required.

## Verification
Executed:
```bash
npm test -- tests/views/NotesView.test.tsx tests/components/notes/DocEditorPane.test.tsx tests/components/notes/NormalizeDocModal.test.tsx
```
Result: 3 test files passed, 17/17 tests passing.

## Commits
- `e22af26`: feat(quick-261006-czh): fix quick_note creation type and autofill new documents with RECOMMENDED_DOC_TEMPLATE
- `a87511a`: feat(quick-261006-czh): implement NormalizeDocModal and add AI Chuẩn hóa action to DocEditorPane
