# Quick Task: AI Inline Selection Context & Chat Mention

## Objective
Cho phép người dùng khi bôi đen văn bản bất kỳ:
1. Tự động nhận diện ngữ cảnh xuất phát (Document, Note, Task, Project) kèm cấu trúc cha-con (Breadcrumb context).
2. Hiển thị Inline Toolbar trực quan: Hỏi nhanh AI, Giải thích, Tóm tắt, Viết lại ngay tại chỗ.
3. Hỗ trợ nút "Đưa vào Chat Drawer": mở AI Chat Drawer, tự động switch scope chuẩn, và điền đoạn trích dẫn kèm metadata breadcrumb.

## Tasks
1. [x] Khởi tạo quick task plan
2. [ ] Xây dựng `src/utils/selectionContext.ts` để đọc DOM & phân giải hierarchy từ DB
3. [ ] Xây dựng `src/components/ai/InlineAISelectionBar.tsx`
4. [ ] Gắn `data-ai-context-*` vào `DocEditorPane`, `TaskDrawer`, `NoteEditor/NoteDetail`, `EntityNotesSection`
5. [ ] Mở rộng `AIChatContext` và tích hợp `InlineAISelectionBar` vào `AppShell`
6. [ ] Unit test và kiểm tra build
