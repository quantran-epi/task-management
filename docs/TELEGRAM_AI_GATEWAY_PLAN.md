# Telegram AI Gateway - Kế hoạch triển khai

## 1. Mục tiêu
Tích hợp Telegram Bot chạy dạng **Headless Listener** ngay trong ứng dụng Tauri TaskMate:
- Nhận tin nhắn từ Telegram, xử lý qua pipeline AI (LLM + Context RAG) sẵn có.
- Trả lời trực tiếp về Telegram cho người dùng.
- Có màn hình **Live Monitor & Quản lý Whitelist / Scope / Rate Limit** riêng biệt trên TaskMate, không ảnh hưởng đến luồng chat cá nhân của app.

---

## 2. Kiến trúc hệ thống
```
[User Telegram]
       │ (1. Chat message)
       ▼
[Tauri Rust Backend] (Long-Polling via getUpdates)
       │ (2. app.emit("telegram-inbound"))
       ▼
[Headless Telegram Worker (React/Frontend)]
       │
       ├── (3. Auth & Rate Limit check)
       │     ├── Không trong Whitelist ➔ Phản hồi kèm Chat ID & Bỏ qua
       │     └── Hết Quota trong ngày ➔ Thông báo hết hạn mức
       │
       ├── (4. Context Resolver theo Data Scope)
       │     ├── "full": Task + Milestone + Knowledge Docs
       │     ├── "knowledge_only": Chỉ BM25/Knowledge Docs
       │     ├── "tasks_only": Chỉ Task/Projects
       │     └── "pure_llm": Không kèm dữ liệu cá nhân
       │
       ├── (5. Gọi AI Engine) ➔ Tái dùng AI Chat Service hiện có
       │
       └── (6. Gửi kết quả ngược lại) ➔ invoke("send_telegram_reply")
       │
       ▼
[Tauri Rust Backend] (POST sendMessage) ➔ [User Telegram]

* Song song: Toàn bộ log và trạng thái được push lên [Telegram Live Monitor UI].
```

---

## 3. Data Model (IndexedDB)

### 3.1. `telegram_settings`
- `bot_token`: Token lấy từ `@BotFather`.
- `is_enabled`: Bật / tắt listener (device-local, mặc định `false`, không sync sang máy khác).
- `auto_start_on_launch`: Tự động chạy polling khi mở TaskMate trên thiết bị này (mặc định `false`).
- `default_scope`: Scope mặc định khi tạo mới user.

### 3.2. `telegram_whitelist`
- `chat_id` (string, PK): Telegram Chat ID.
- `name` (string): Tên gợi nhớ người dùng.
- `status`: `'active' | 'blocked'`.
- `data_scope`: `'full' | 'knowledge_only' | 'tasks_only' | 'pure_llm'`.
- `daily_limit`: Số request tối đa/ngày (e.g. 30).
- `used_today`: Số request đã dùng trong ngày.
- `last_active_date`: Ngày dùng gần nhất (`YYYY-MM-DD`, dùng để reset quota).

### 3.3. `telegram_session_logs`
- `id` (UUID): ID tin nhắn log.
- `chat_id`: Khách tương tác.
- `user_message`: Nội dung hỏi.
- `ai_response`: Nội dung bot trả lời.
- `data_scope_used`: Scope dữ liệu đã inject.
- `token_count`: Ước tính token sử dụng.
- `created_at`: Thời gian chat.

---

## 4. Các module cần phát triển

### Module 1: Tauri Rust Backend (`src-tauri`)
- Cấu hình tắt throttle Webview khi minimize: `--disable-background-timer-throttling`.
- Task chạy ngầm (`tokio::spawn`): Long-polling Telegram `getUpdates` với `CancellationToken`.
- Bắt lỗi 409 Conflict (khi bật đồng thời ở thiết bị khác) ➔ Tự ngắt polling và bắn event `telegram-conflict-detected` vào Webview.
- Event emitter: Bắn tin nhắn vào Webview (`telegram-inbound`), trạng thái (`telegram-status-changed`).
- Commands:
  - `start_telegram_polling(token)` / `stop_telegram_polling()`
  - `get_telegram_status() -> bool`
  - `send_telegram_reply(chat_id, text, reply_to_message_id)`
  - `send_telegram_action(chat_id, action: "typing")`

### Module 2: Headless Telegram Worker (`src/features/telegram`)
- Listener lắng nghe event `telegram-inbound`.
- Logic kiểm tra Whitelist và Quota ngày.
- Bộ điều phối Context Injection lọc theo `data_scope`.
- Gọi hàm AI Chat Stream/Non-stream hiện có, thu thập câu trả lời.
- Cắt tin nhắn nếu vượt giới hạn 4096 ký tự của Telegram và gọi lệnh gửi.

### Module 3: Giao diện quản trị & Giám sát (`src/pages/TelegramMonitor`)
- **Header & Controls:**
  - Badge trạng thái Realtime: Running / Stopped / Conflict (409).
  - Switch Bật/Tắt Bot nhanh và Checkbox tự khởi động cùng app.
  - Tự động ngắt switch và cảnh báo khi bắt được `telegram-conflict-detected`.
- **Tab 1: Live Monitor**
  - Danh sách hội thoại theo `chat_id` (real-time stream).
  - Chi tiết luồng xử lý: Câu hỏi ➔ Scope áp dụng ➔ Token dùng ➔ Câu trả lời.
- **Tab 2: Whitelist & Phân quyền**
  - Bảng quản lý `chat_id`, tên, hạn mức request/ngày, chọn Scope dữ liệu.
  - Hàng chờ phê duyệt: Hiển thị các `chat_id` lạ vừa chat để 1-click thêm vào whitelist.
- **Tab 3: Cấu hình Bot**
  - Nhập Bot Token, nút kiểm tra kết nối, công tắc Bật/Tắt Bot.

---

## 5. Lộ trình thực hiện (Roadmap)
1. **P1 - Backend Rust:** Thêm polling & command gửi nhận Telegram trong Tauri (~1h).
2. **P2 - Storage & Config:** Tạo schema Dexie/IndexedDB cho Settings, Whitelist, Logs (~1h).
3. **P3 - Headless Worker:** Viết worker nhận tin, check whitelist/scope, inject context, gọi AI (~1.5h).
4. **P4 - UI Monitor & Whitelist:** Làm giao diện quản trị Ant Design và log viewer (~1.5h).
5. **P5 - Testing & Hardening:** Test chạy ngầm khi minimize, rate-limit reset, tin nhắn dài (>4096 char) (~1h).
