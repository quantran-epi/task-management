# Quick Task: Cấu hình Model per user, default 10 lượt chat/ngày, fix defaultScope khi grant user mới

## 1. Yêu cầu & Phạm vi
- Chỉ triển khai phần Telegram AI Gateway / Tele Chat:
  1. Cấu hình AI model theo từng user trong Whitelist (tùy chọn `aiModel?: string`). Nếu user có `aiModel` thì dùng model đó; nếu không cấu hình (hoặc chuỗi rỗng) thì fallback về `aiConfig.defaultModel` hiện tại.
  2. User mới mặc định 10 lượt chat/ngày (thay vì 30 như trước). Áp dụng cho:
     - `recordPendingTelegramUser` (user mới đăng ký vào hàng chờ).
     - UI Thêm người dùng mới trên `TelegramMonitorView` (initial values `dailyLimit: 10`).
     - Lệnh approve pending user hoặc approve mặc định.
  3. Sửa lỗi `defaultScope` hiện không được áp dụng khi grant / approve quyền user mới:
     - Trong `recordPendingTelegramUser`: lấy `defaultScope` từ `getTelegramSettings(db)` thay vì hardcode `'full'`.
     - Trong `approvePendingUser`: nếu user đang pending và chưa có scope hoặc cần grant, đảm bảo áp dụng đúng `dataScope` kế thừa từ `settings.defaultScope` khi chưa được chỉ định cụ thể.
     - Trong `useTelegramPendingUsers.quickApprove` và `handleSaveUser` / `TelegramAdminWizard.approve_user`: đảm bảo scope được cập nhật đúng theo `settings.defaultScope`.
- **Tuyệt đối không sửa**: `AIChatDrawer.tsx`, `AIChatDrawer.test.tsx` hoặc bất kỳ file nào thuộc AI Chat Drawer (tránh conflict Phase 25).

---

## 2. Các file sẽ chỉnh sửa
1. `src/services/telegram/telegramTypes.ts`:
   - Thêm `aiModel?: string | undefined` vào `TelegramWhitelistUser`.
2. `src/validation/backupSchemas.ts`:
   - Thêm `aiModel: z.string().optional()` vào `BackupTelegramWhitelistUserSchema`.
3. `src/services/telegram/telegramSettingsService.ts`:
   - Cập nhật `upsertWhitelistUser`: hỗ trợ lưu & lấy `aiModel`. Đổi default `dailyLimit` từ 30 thành 10 khi tạo mới.
   - Cập nhật `recordPendingTelegramUser`:
     - Lấy `settings = await getTelegramSettings(db)`.
     - `dataScope: settings.defaultScope || 'full'`.
     - `dailyLimit: 10`.
   - Cập nhật `approvePendingUser`: nếu không truyền `overrides.dataScope`, kế thừa `dataScope` từ existing hoặc `settings.defaultScope`.
4. `src/services/telegram/telegramHeadlessWorker.ts`:
   - Tại vị trí chuẩn bị model AI (`askGroundedAssistant`, `runAiOrchestratorLoop`, `routeIntent`):
     - Xác định model hiệu dụng: `const effectiveModel = (user.aiModel && user.aiModel.trim()) ? user.aiModel.trim() : aiConfig.defaultModel;`.
     - Truyền `effectiveModel` vào `routeIntent`, `askGroundedAssistant`, và `runAiOrchestratorLoop`.
5. `src/views/TelegramMonitorView.tsx`:
   - Thêm trường chọn / nhập `aiModel` vào Modal Whitelist (cho phép chọn từ danh sách model đã load hoặc nhập model name tuỳ ý, hoặc để trống = Mặc định hệ thống).
   - Hiển thị model của user trên bảng Whitelist (cột AI Model hoặc tag bên cạnh tên).
   - Khi bấm "Thêm người dùng", đặt `dailyLimit: 10` và `dataScope: defaultScope`.
   - Khi bấm "Tuỳ chỉnh & Duyệt", nạp `dataScope: p.dataScope || defaultScope` và `dailyLimit: p.dailyLimit || 10`.
6. `tests/telegram/telegramSettingsService.test.ts` & `tests/telegram/telegramPendingUsers.test.ts`:
   - Cập nhật / bổ sung test cases kiểm tra:
     - User mới có `dailyLimit = 10`.
     - User mới kế thừa `defaultScope` từ `telegramSettings`.
     - User có thể lưu và tải `aiModel`.

---

## 3. Kế hoạch công việc (3 Tasks)

### Task 1: Mở rộng kiểu dữ liệu & Service logic (Model per user, 10 lượt chat/ngày, fix defaultScope)
- **Files**:
  - `src/services/telegram/telegramTypes.ts`
  - `src/validation/backupSchemas.ts`
  - `src/services/telegram/telegramSettingsService.ts`
- **Chi tiết**:
  - `TelegramWhitelistUser`: thêm `aiModel?: string | undefined`.
  - `BackupTelegramWhitelistUserSchema`: thêm `aiModel: z.string().optional()`.
  - `recordPendingTelegramUser`: đọc `settings = await getTelegramSettings(db)`. Đặt `dataScope: settings.defaultScope || 'full'` và `dailyLimit: 10`.
  - `upsertWhitelistUser`: xử lý `aiModel: user.aiModel !== undefined ? user.aiModel : existing?.aiModel`. Đặt default `dailyLimit: 10`.
  - `approvePendingUser`: đọc `settings = await getTelegramSettings(db)` nếu cần fallback scope.
- **Verify**: `npx vitest run tests/telegram/telegramSettingsService.test.ts`

### Task 2: Áp dụng effectiveModel trong Telegram Worker loop
- **Files**:
  - `src/services/telegram/telegramHeadlessWorker.ts`
- **Chi tiết**:
  - Tính toán `effectiveModel = (user.aiModel && user.aiModel.trim()) || aiConfig.defaultModel`.
  - Dùng `effectiveModel` cho `routeIntent`, `askGroundedAssistant`, và `runAiOrchestratorLoop`.
- **Verify**: `npx vitest run tests/telegram/telegramAdminMutation.test.ts`

### Task 3: Cập nhật giao diện TelegramMonitorView & Targeted Tests
- **Files**:
  - `src/views/TelegramMonitorView.tsx`
  - `tests/telegram/telegramSettingsService.test.ts`
  - `tests/telegram/telegramPendingUsers.test.ts`
- **Chi tiết**:
  - Cập nhật Form modal whitelist: thêm input/select `aiModel` (placeholder: "Mặc định (theo cài đặt AI chung)").
  - Cập nhật default values khi thêm user: `dailyLimit: 10`, `dataScope: defaultScope`.
  - Thêm hiển thị thông tin Model trong bảng danh sách user Whitelist.
  - Viết unit tests chứng minh:
    1. User mới tạo mặc định `dailyLimit` là 10.
    2. User mới tạo tự động nhận `defaultScope` đã cấu hình trong `telegramSettings`.
    3. `aiModel` được lưu và trả về chính xác trong whitelist user record.
- **Verify**: `npx vitest run tests/telegram/telegramSettingsService.test.ts tests/telegram/telegramPendingUsers.test.ts tests/telegram/telegramAdminMutation.test.ts`
