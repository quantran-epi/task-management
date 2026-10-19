# Quick Task Summary: 261019-adm - Telegram Admin Commands with Multi-step Conversation

## Overview
Đã triển khai tính năng phân quyền Quản trị viên (Admin) cho người dùng Telegram bot và hỗ trợ tập lệnh quản trị với cơ chế hội thoại đa bước (multi-step conversation / conversational wizard).

## Changes Made
1. **Model & Types (`src/services/telegram/telegramTypes.ts`)**:
   - Thêm trường `isAdmin?: boolean | undefined` vào `TelegramWhitelistUser`.
2. **Settings Service (`src/services/telegram/telegramSettingsService.ts`)**:
   - Cập nhật hàm `upsertWhitelistUser` để lưu giữ và cập nhật thuộc tính `isAdmin`.
3. **Conversational Wizard Store & Command Engine (`src/services/telegram/telegramAdminWizard.ts`)**:
   - Quản lý in-memory conversation state (`AdminWizardState`) theo `chatId` của admin (auto-expire 10 phút).
   - Tập lệnh hỗ trợ:
     - `/admin`, `/adminhelp`: Menu trợ giúp và bảng điều khiển lệnh.
     - `/list_users`: Liệt kê tất cả người dùng trong Whitelist kèm trạng thái, role `👑 [Admin]`, quota và dataScope.
     - `/list_pending`: Liệt kê danh sách người dùng đang chờ phê duyệt kèm thời gian yêu cầu.
     - `/approve_user`: Wizard 1 bước hỏi Chat ID -> Duyệt người dùng (`status: 'active'`) và tự động gửi tin nhắn chào mừng cho người dùng đó.
     - `/adjust_quota`: Wizard 2 bước hỏi Chat ID -> hỏi hạn mức mới (hỗ trợ nhập số trực tiếp như `50`, hoặc số tăng giảm tương đối như `+10`, `-5`) -> Cập nhật `dailyLimit`.
     - `/block_user`: Wizard 1 bước hỏi Chat ID -> Chuyển sang trạng thái `blocked` (chặn tự khóa chính tài khoản admin).
     - `/cancel`: Hủy flow lệnh đa bước đang dở dang.
4. **Headless Worker Pipeline (`src/services/telegram/telegramHeadlessWorker.ts`)**:
   - Thêm interceptor ở `Step 0` trước khi tính quota tin nhắn: chuyển lệnh đến `handleAdminCommand`.
   - Nếu lệnh được xử lý bởi admin engine, phản hồi kết quả và không trừ hạn mức chat hàng ngày, không gọi AI LLM.
   - Gửi thông báo trực tiếp đến người dùng vừa được phê duyệt qua `sendTelegramDirectMessage`.
5. **Whitelist Management UI (`src/views/TelegramMonitorView.tsx`)**:
   - Hiển thị huy hiệu `👑 Admin` cạnh tên người dùng trong bảng Whitelist.
   - Thêm Checkbox `👑 Phân quyền Quản trị viên (Admin)` trong modal thêm/chỉnh sửa người dùng Whitelist.
6. **Tests**:
   - Tạo bộ test mới `tests/telegram/telegramAdminWizard.test.ts` (5 test suites đầy đủ cho các flow admin, multi-step, cancel, adjust quota, block user).
   - Bổ sung test tích hợp trong `tests/telegram/telegramHeadlessWorker.test.ts`.

## Verification
- `npm run test -- tests/telegram`: 5/5 test files passed, 37/37 tests passed.
- `npm run build`: TypeScript checking và Vite production build hoàn tất thành công.
