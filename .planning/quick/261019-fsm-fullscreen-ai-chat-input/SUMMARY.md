---
slug: 261019-fsm-fullscreen-ai-chat-input
description: Thêm popup toàn màn hình cho text box nhập message trong AI chat drawer
status: complete
date: 2026-10-19
---

# Quick Task Summary: 261019-fsm-fullscreen-ai-chat-input

## Outcome
Đã thêm tính năng mở rộng ô nhập liệu thành popup / modal lớn toàn màn hình trong `ChatInputBar` của AI Chat Drawer:
- Icon `FullscreenOutlined` đặt cạnh thanh công cụ nhập.
- Modal lớn (`80vw`, tối đa 1200px) với `Input.TextArea` 16 dòng, đếm ký tự (`showCount`), phím tắt Cmd+Enter/Ctrl+Enter.
- Hỗ trợ "Xong (Lưu vào ô chat)" để đồng bộ text ngược lại ô Mentions hoặc "Gửi ngay".
- Bổ sung 2 test cases kiểm tra mở modal, chỉnh sửa, lưu đồng bộ và gửi trực tiếp. Tất cả test passed 100%.
