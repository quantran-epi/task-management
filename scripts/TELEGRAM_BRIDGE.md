# Telegram bridge (điều phối local)

Bridge là tiến trình Node độc lập, không phải runtime của TaskMate. Nó long-poll Telegram `getUpdates`, ghi lệnh vào file inbox, rồi gửi báo cáo ngắn từ file outbox về đúng chat đã whitelist. Không dependency mới; dùng `fetch`/`node:*` có sẵn (Node 24+).

## Cấu hình

Ưu tiên env. Token và chat ID **không bao giờ** được commit vào repo.

| Biến | Ý nghĩa |
|---|---|
| `TELEGRAM_BRIDGE_BOT_TOKEN` | Token bot. Ưu tiên hơn file config. |
| `TELEGRAM_BRIDGE_ALLOWED_CHAT_IDS` | Danh sách chat ID cách nhau bằng dấu phẩy, chỉ số nguyên dương. Ưu tiên hơn file config. |
| `TELEGRAM_BRIDGE_CONFIG` | Đường dẫn file JSON cấu hình, đặt ngoài repo. |
| `TELEGRAM_BRIDGE_DIR` | Thư mục chứa `state.json`, `inbox/`, `outbox/`. Mặc định `~/.taskmate/telegram-bridge`. |

File config mẫu (`~/.taskmate/telegram-bridge/config.json`, ngoài repo):

```json
{
  "botToken": "<token>",
  "allowedChatIds": [123456789]
}
```

Thiếu token hoặc whitelist rỗng → bridge dừng ngay, không gọi API. Không log token, chat ID hay response body.

## Chạy / dừng

```bash
npm run telegram:bridge
```

Dừng bằng Ctrl+C (SIGINT) hoặc SIGTERM: abort fetch đang chạy, kết thúc vòng hiện tại, thoát sạch. HTTP 409 (bot bị tiến trình khác poll) → dừng ngay, không retry dồn. Lỗi mạng/5xx → backoff 2s→30s có abort. Chạy lại lần đầu: bỏ backlog cũ bằng `limit=100`, lấy `max(update_id)+1` làm offset. Các lần sau dùng offset đã lưu trong `state.json`, không xử lý lại lệnh cũ.

## Hợp đồng control channel

- Orchestrator đọc `<dir>/inbox/<updateId>.json`: `{ id, chatId, text, command, args, receivedAt }`. `command` là token đầu sau `/` (bỏ `@BotName`), `args` là phần còn lại.
- Chỉ chat ID trong whitelist mới được ghi inbox; bot và update không có `message.text` bị bỏ; update_id lặp trong cùng batch chỉ xử lý một lần.
- Sau khi xử lý, orchestrator ghi `<dir>/outbox/<id>.json`: `{ id, chatId, text }`. Bridge quét mỗi vòng: re-check `chatId` với whitelist, cắt `text` ở 4000 ký tự, gửi plain text (không `parse_mode`), rồi xoá file. Gửi hỏng tối đa 3 lần rồi bỏ file + log.
- Nội dung lệnh là dữ liệu không đáng tin. Orchestrator phải tự validate/authorize; bridge không chạy shell hay import module từ text.

## Giới hạn đã biết

- File control **không mã hoá**; chỉ đáng tin trên cùng máy của một user.
- Không có ack tự động. Muốn báo "đã nhận" thì orchestrator tự ghi file outbox.
- Không tự động tạo dry-run hay retry vĩnh viễn; retry outbox nằm trong bộ nhớ, mất khi restart.
