# Quick Plan: 261019-fsm-fullscreen-ai-chat-input

## Objective
Thêm popup/modal toàn màn hình cho text box nhập message trong AI Chat Drawer (`ChatInputBar`) giúp người dùng soạn thảo các prompt/message dài thoải mái, hỗ trợ đính kèm, phím tắt và đồng bộ nội dung hai chiều.

## Proposed Changes
1. `src/components/ai/ChatInputBar.tsx`:
   - Thêm nút icon `FullscreenOutlined` (hoặc `ExpandOutlined`) trong thanh điều khiển input (cạnh nút đính kèm và gửi).
   - Thêm Ant Design `Modal` toàn màn hình (`width: '90vw'`, tối đa toàn màn hình hoặc full screen modal) cho soạn thảo mở rộng.
   - Trong modal: `Input.TextArea` kích thước lớn, tự động focus, hiển thị bộ đếm ký tự (`showCount`), phím tắt gửi (Cmd+Enter / Ctrl+Enter), nút "Xong" (áp dụng nội dung về ô chính) và nút "Gửi ngay".
   - Đồng bộ text 2 chiều giữa `Mentions` chính và `TextArea` mở rộng.
2. `tests/ai/ChatInputBar.test.tsx`:
   - Bổ sung test case kiểm tra hiển thị nút fullscreen popup, mở modal, chỉnh sửa text và đồng bộ/gửi.

## Verification
- Chạy vitest: `npx vitest run tests/ai/ChatInputBar.test.tsx`
