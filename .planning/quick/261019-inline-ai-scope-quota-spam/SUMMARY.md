---
status: complete
date: 2026-10-19
---

# Quick Task Summary: inline-ai-scope-quota-spam

- Giới hạn InlineAISelectionBar: chỉ kích hoạt popup khi text được chọn nằm trong vùng có `data-ai-context-type="doc"` hoặc `"note"`. Bỏ qua vùng `task`, `project` hoặc text ngoài trang.
- Thêm kiểm soát spam over-quota trong Telegram Bot:
  - Thêm trường `overQuotaAttempts` trong `TelegramWhitelistUser`.
  - Tăng dần đếm attempt khi user gửi tin nhắn khi hết quota.
  - Phản hồi cảnh báo spam tăng dần (lần 1: hết hạn mức, lần 2-3: cảnh báo spam, lần 4+: ngưng phản hồi và drop log).
  - Không ghi log vào `telegramSessionLogs` khi overQuotaAttempts > 3 để chống flood/rác DB.
- Cập nhật hiển thị Tag cảnh báo spam trên giao diện quản trị Telegram Whitelist.
- Bổ sung unit tests cho toàn bộ luồng, 30/30 tests passed, `npm run build` thành công.
