# Quick Task Summary: AI Inline Selection Context & Chat Mention

## Outcome
Hoàn thành tính năng AI Inline Selection & Mention Context theo yêu cầu:
1. **Phân giải Context phân cấp (DOM & Dexie DB)**:
   - Module `src/utils/selectionContext.ts`: tự động truy ngược từ phần tử DOM được bôi đen qua `data-ai-context-type` và `data-ai-context-id`.
   - Phân giải quan hệ cha-con từ IndexedDB: Document/Note -> Task -> Project. Tạo breadcrumb chuẩn: `Dự án "X" > Tác vụ "Y" > Tài liệu "Z"`.
2. **Gắn data context vào các view cốt lõi**:
   - `DocEditorPane`: `data-ai-context-type="doc"` kèm `doc.id`.
   - `TaskDrawer`: `data-ai-context-type="task"` kèm `task.id`.
   - `ProjectDetailModal`: `data-ai-context-type="project"` kèm `project.id`.
   - `EntityNotesSection` & `NoteDetailModal`: `data-ai-context-type="note"` kèm `note.id`.
   - `TaskTable`: `data-ai-context-type="task"` trên từng row.
3. **Floating Inline Toolbar (`InlineAISelectionBar.tsx`)**:
   - Tự động hiển thị khi người dùng bôi đen văn bản (> 2 ký tự) bên ngoài các ô nhập liệu.
   - Thao tác nhanh:
     - **Giải thích**: giải thích nhanh đoạn trích dẫn.
     - **Tóm tắt**: tóm lược các ý chính.
     - **Viết lại**: sửa câu từ/ngữ pháp.
     - **Hỏi...**: mở input inline stream câu trả lời trực tiếp ngay tại vị trí con trỏ chuột.
     - **Hỏi Chat Drawer**: tự động mở `AIChatDrawer`, chuyển `activeScope` tương ứng với entity và điền trích dẫn kèm metadata breadcrumb.
4. **Kiểm thử & Xác thực**:
   - Unit test `src/utils/selectionContext.test.ts` pass 100%.
   - Typecheck và production build thành công (`npm run build`).
