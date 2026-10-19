# Quick Task: inline-ai-scope-and-quota-spam-warning

## Plan
1. Giới hạn inline AI selection popup chỉ kích hoạt khi bôi đen trong document hoặc note container.
2. Thêm cơ chế đếm overQuotaAttempts và cảnh báo spam khi user cố gửi tin nhắn sau khi hết dailyLimit.
3. Khi vượt ngưỡng spam (> 3 lần), chặn ghi log rác vào DB để bảo vệ IndexedDB.
4. Hiển thị thông tin spam over quota trên bảng Whitelist của Telegram Monitor.
5. Cập nhật unit tests và chạy full build.
