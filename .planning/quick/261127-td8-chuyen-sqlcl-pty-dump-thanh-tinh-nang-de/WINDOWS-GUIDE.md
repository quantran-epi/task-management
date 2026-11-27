# Windows live debug guide — SQLcl PTY log

Không cần `tauri dev`, không cần env var, không cần spawn process hay đọc filesystem từ script. Dùng app installer thật và nút export trong UI.

## 1. Build installer Windows (từ bất kỳ máy, dùng GitHub Actions)

Repo đã có workflow `.github/workflows/windows-installers.yml` chạy trên `windows-latest`, trigger khi push `pre-v1.6-baseline`.

```bash
# trên máy này, sau khi commit xong
git push origin pre-v1.6-baseline
```

Vào GitHub → Actions → **Build Windows Installers** → chạy/latest run → tải artifact `taskmate-windows-nsis` (file `.exe`). Nếu muốn chủ động: tab Actions → workflow → **Run workflow** chọn branch `pre-v1.6-baseline`.

## 2. Cài và chạy trên máy Windows có Oracle thật

1. Copy file installer `.exe` sang máy Windows, chạy cài đặt.
2. Mở TaskMate. Vào **Settings → Remote SSH**.
3. Cấu hình đúng SSH profile + Oracle profile có DB thật.
4. Trong AI chat, gọi lần lượt:
   - `list_schemas`
   - `query`: `SELECT 1 AS ok FROM DUAL`
5. Quay lại **Settings → Remote SSH** → bấm **Xuất nhật ký PTY SQLcl** → chọn nơi lưu file `sqlcl-pty-debug.log` trong hộp thoại Save As của Windows.
6. Mở file, kiểm tra/redact tay connection string, user, hostname, rồi gửi nội dung về đây.

## 3. Ý nghĩa nội dung log

- `START_AFTER_EXEC`: thời điểm SQLcl vừa được exec trên PTY.
- `PGID_READ`: từng chunk đọc khi scan `TASKMATE_PGID:<n>`. Nhìn xem có banner/ORA-/SP2- đứng trước PGID, PGID có `\r\n` hay ANSI escape không.
- `SCRIPT_LINE` / `SCRIPT_PARTIAL` / `SCRIPT_EOF`: output query. Nhìn xem marker `TASKMATE_SQLCL_DONE_...` có in ra hay channel trả EOF/partial.

## 4. Ghi chú

- Trace nằm trong bộ nhớ process, tối đa 64 KiB, không ghi file tự động. Tắt app là mất.
- Nút export dùng native Save As dialog (`save_file_dialog` / `saveFileWithPicker`) của Tauri trên Windows; app không cần spawn process ngoài hay đọc filesystem tùy ý.
- Nếu file rỗng: chưa có SQLcl tool call nào chạy trong process hiện tại, hoặc repro không đi qua tool Oracle.
