# Quick Task: 261019-adm - Telegram Admin Commands with Multi-step Conversation

## Objective
Cho phép đánh dấu người dùng Telegram là Admin (vai trò quản trị). Khi admin chat với bot, cung cấp tập lệnh đặc biệt (quản lý user, danh sách user chờ duyệt, duyệt user, tăng/giảm quota, khoá user) qua cơ chế hội thoại đa bước (multi-step conversation / conversational wizard):
- Admin gõ lệnh (ví dụ `/list_pending`, `/list_users`, `/approve_user`, `/adjust_quota`, `/block_user`, `/cancel`)
- Bot phản hồi câu hỏi (ví dụ "Muốn approve user nào? Vui lòng nhập Chat ID hoặc /cancel để hủy")
- Admin nhập Chat ID hoặc giá trị
- Bot xử lý, phản hồi kết quả và thông báo người dùng tương ứng nếu được duyệt
- Hỗ trợ đánh dấu Admin trực tiếp trên UI Whitelist (tag Admin, toggle switch/checkbox Admin).

## Architecture & Implementation Plan
1. **Model & Types (`src/services/telegram/telegramTypes.ts`)**:
   - Mở rộng `TelegramWhitelistUser`: thêm trường `isAdmin?: boolean | undefined;`
2. **Session / Wizard Store (`src/services/telegram/telegramAdminWizard.ts`)**:
   - Lưu trữ in-memory `adminConversationStates: Map<string, AdminWizardState>` theo `chatId`.
   - Các action hỗ trợ:
     - `list_pending`: hiển thị danh sách user pending (chatId, tên, ngày yêu cầu)
     - `list_users`: hiển thị danh sách tất cả whitelist users (chatId, name, status, role, quota)
     - `approve_user`: bước 1 hỏi chatId -> bước 2 xác nhận duyệt (status='active') + gửi tin nhắn chào mừng cho user đó
     - `adjust_quota`: bước 1 hỏi chatId -> bước 2 hỏi số quota mới hoặc delta (+10, -5, 50) -> cập nhật dailyLimit
     - `block_user`: bước 1 hỏi chatId -> cập nhật status='blocked'
     - `/cancel`: huỷ phiên lệnh đa bước đang chờ
3. **Headless Worker integration (`src/services/telegram/telegramHeadlessWorker.ts`)**:
   - Trước khi check quota thông thường, kiểm tra nếu `user.isAdmin`:
     - Nếu user đang có pending wizard state, bắt input để thực thi step tiếp theo và kết thúc/tiếp tục wizard.
     - Nếu message bắt đầu bằng `/admin`, `/list_users`, `/list_pending`, `/approve_user`, `/adjust_quota`, `/block_user`, `/cancel` -> xử lý trực tiếp, không gọi AI LLM, không trừ quota.
4. **UI Whitelist Management (`src/views/TelegramMonitorView.tsx`)**:
   - Thêm cột / Tag `Admin` trên bảng Whitelist.
   - Thêm checkbox / switch `Quản trị viên (Admin)` trong Modal thêm/chỉnh sửa người dùng Whitelist.
5. **Testing**:
   - Viết unit tests kiểm tra:
     - Non-admin gõ admin commands bị từ chối / không thực thi.
     - Admin gõ `/list_pending`, `/list_users` nhận phản hồi đúng.
     - Admin chạy multi-step `/approve_user`, `/adjust_quota`, `/block_user`, `/cancel`.
     - Chỉnh sửa user thành Admin và lưu vào DB.
