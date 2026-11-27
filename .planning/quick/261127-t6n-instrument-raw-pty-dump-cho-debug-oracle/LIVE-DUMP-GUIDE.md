# Live PTY dump guide — Oracle SQLcl trong TaskMate

Mục đích: lấy raw PTY bytes từ persistent SQLcl session trên máy có SSH + Oracle thật, rồi gửi dump về để chốt nguyên nhân và fix một lần.

## Điều kiện

- Máy có Oracle target, có SSH tới host chạy `sqlcl`, saved profile trong TaskMate đã chọn.
- Dùng build TaskMate có instrumentation `TASKMATE_SQLCL_DUMP=1` (commit `261127-t6n` trở đi).

## Cách build/copy binary

### Nếu build trên máy này rồi copy sang máy Oracle

```bash
cd /Users/tranducquan/Working/Personal/task-management
cargo build --manifest-path src-tauri/Cargo.toml
```

Binary: `src-tauri/target/debug/personal-task-workload-planner` (macOS app bundle nếu dùng `npm run tauri build`).

Copy toàn bộ app bundle sang máy Oracle. Không copy secrets.

### Nếu build ngay trên máy Oracle

Clone/copy repo, rồi:

```bash
npm ci
cargo build --manifest-path src-tauri/Cargo.toml
```

## Chạy và lấy dump

1. Trước khi mở app, set env trong shell nơi launch app:

```bash
export TASKMATE_SQLCL_DUMP=1
# Optional: chỉ định path dump
# export TASKMATE_SQLCL_DUMP_PATH="$HOME/sqlcl-pty-debug.log"
```

2. Launch app từ shell đó:

```bash
npm run tauri dev
# hoặc chạy app bundle đã build
```

3. Vào TaskMate → cấu hình SSH + Oracle profile như thường. Chọn profile có Oracle thật.

4. Trong AI chat/tool Oracle, gọi lần lượt:
   - `list_schemas`
   - `query` đơn giản: `SELECT 1 AS ok FROM DUAL`

5. Đóng app để flush file. Lấy dump:

```bash
# mặc định macOS
cat "$HOME/Library/Application Support/com.personal.taskplanner/sqlcl-pty-debug.log"
# nếu đã set TASKMATE_SQLCL_DUMP_PATH
cat "$TASKMATE_SQLCL_DUMP_PATH"
```

6. Gửi nội dung dump về đây. **Kiểm tra lại trước khi gửi**: dump đã escape control bytes và redact theo keyword `password|token|secret|...`, nhưng vẫn nên mở file và xóa tay bất kỳ giá trị nhạy cảm nào (connection string, SID/service name, user, hostname).

## Dump có ý nghĩa gì

- `START_AFTER_EXEC`: marker thời điểm SQLcl vừa được exec trên PTY.
- `PGID_READ`: từng chunk đọc được khi scan dòng `TASKMATE_PGID:<n>`. Nhìn ở đây xem có banner/ORA-/SP2- nào đứng trước PGID không, PGID có `\r\n` hay ANSI escape không.
- `SCRIPT_LINE` / `SCRIPT_PARTIAL` / `SCRIPT_EOF`: output của query. Xem marker `TASKMATE_SQLCL_DONE_...` có xuất hiện không, hay channel trả EOF/partial.
- Nếu file rỗng: env chưa được set trước khi launch app, hoặc app dùng process khác không kế thừa env.

## Lưu ý bảo mật

- Dump chỉ bật bằng env var; mặc định tắt.
- File nằm local, bounded 64 KiB.
- Không commit file dump vào repo. Không gửi file dump lên service bên ngoài trước khi kiểm tra/redact tay.
