---
status: investigating
trigger: "SSH exec command trả stdout đầy đủ/hợp lệ, stderr rỗng nhưng exitStatus -1, finishReason error; SSH Remote Explorer browse file báo 'git command failed with exit code -1'. Các fix gần đây a17ad361/c306fc2f trên src-tauri/src/tool_cancel.rs chưa giải quyết."
created: 2026-11-23
updated: 2026-11-23
---

# Debug: SSH exec exitStatus -1 dù stdout hợp lệ

## Symptoms

- expected: Lệnh SSH exec (git for-each-ref/branch list) với stdout đầy đủ, stderr rỗng phải trả exitStatus 0, finishReason complete; SSH Remote Explorer browse file không báo lỗi.
- actual: Devtool log lệnh ssh exec: `{"stdout": "...danh sách branch đầy đủ...", "stderr": "", "exitStatus": -1, "finishReason": "error"}`. SSH Remote Explorer browse file SSH Remote báo "git command failed with exit code -1".
- error: `exitStatus: -1` với `finishReason: "error"` dù stdout chứa kết quả đúng và stderr rỗng.
- timeline: Fix gần nhất `a17ad361 fix(261123-et1): borrow-safe wakeup check in wait_close loop` và `c306fc2f fix(261123-et1): convert ssh2 error before wakeup timeout check` đều đụng vào `src-tauri/src/tool_cancel.rs`, chưa hết lỗi.
- repro: Chạy SSH exec command trả output lớn (danh sách branch) qua workbench tool → log devtool thấy exitStatus -1.

## Current Focus

bug_class: Bohrbug (deterministic — mọi lệnh có stderr rỗng đều dính)

root_cause: `run_cancellable_remote_command` trong `src-tauri/src/tool_cancel.rs` dùng `if let (Some(...), Some(...)) = (stdout_exit.take(), stderr_error.take())`. `Option::take()` nằm trong scrutinee của `if let` ĐƯỢC GỌI DÙ pattern mismatch. Hai thread reader gửi `ReaderExited` và `StderrExited` ở hai thời điểm khác nhau → thông điệp đầu tiên đến khiOption kia còn `None` → mismatch → `.take()` nuốt giá trị đó. Vòng lặp tiếp theo nhận thông điệp thứ hai → mismatch tiếp → nuốt nốt. Cả hai Option về `None`, sender drop, `rx.recv_timeout()` trả `Disconnected` → nhánh fallback trả `exit_status: -1`, `finish_reason: "error"` với stdout/stderr đã tích lũy đầy đủ. Khớp chính xác cả hai repro (stdout hợp lệ, stderr rỗng, -1/error).

next_action: apply fix + regression test + targeted cargo test.

evidence_so_far:
- Repro 1 (git): stdout danh sách branch hoàn chỉnh, stderr rỗng, exitStatus -1, finishReason error.
- Repro 2 (sqlcl, Database Explorer expand schema): stdout JSON 45 rows đầy đủ, stderr rỗng, exitStatus -1, finishReason error — trên UI báo "sqlcl không trả về dữ liệu". Cùng cơ chế, khác caller.
- `Disconnected` branch (tool_cancel.rs:598-609) trả CHÍNH XÁC `{stdout accumulated, stderr accumulated, exit_status: -1, finish_reason: "error"}` — duy nhất khớp toàn bộ triệu chứng.
- Verified Rust semantics: `rustc /tmp/take_semantics.rs` → `mismatch; stdout_exit now = None`. `.take()` consumes on pattern mismatch.
- `channel.exit_status()` trong ssh2 0.9.6 luôn `Ok(...)` (libssh2 khởi tạo exit_status = 0 bằng CALLOC, chỉ ghi từ packet exit-status). Không thể tự sinh -1. Loại trừ giả thuyết wait_close/exit_status.
- finish_reason "error" loại trừ nhánh cancelled; stderr rỗng loại trừ errors-based finish_reason — chứng minh phải đi nhánh Disconnected.
- 4 commit gần đây (81378439, 7ddb93e7, c306fc2f, a17ad361) đều sửa ở tầng wait_close/wakeup, không đụng tới result-pairing — giải thích tại sao chưa hết lỗi.

## Investigation

### Root cause — CONFIRMED

`run_cancellable_remote_command` (`src-tauri/src/tool_cancel.rs`) ghép kết quả của 2 reader thread bằng:

```rust
if let (Some(...), Some(...)) = (stdout_exit.take(), stderr_error.take()) { ... }
```

`Option::take()` nằm trong scrutinee của `if let` — nó chạy BẤT KỂ pattern khớp hay không. Hai reader gửi `ReaderExited` và `StderrExited` ở 2 thời điểm riêng biệt. Thông điệp đầu tiên đến khi slot kia còn `None` → mismatch → `.take()` nuốt giá trị. Thông điệp thứ hai đến → mismatch tiếp → nuốt nốt. Cả 2 slot về `None`, sender drop, `recv_timeout` trả `Disconnected` → nhánh fallback trả `exit_status: -1`, `finish_reason: "error"` với stdout/stderr đã tích lũy đầy đủ.

Chứng minh bằng `rustc /tmp/take_semantics.rs`: `mismatch; stdout_exit now = None`.

Loại trừ:
- `channel.exit_status()` trong ssh2 0.9.6 luôn trả `Ok(...)` (`libssh2_channel_get_exit_status` đọc field đã được CALLOC = 0). Không tự sinh -1.
- `finish_reason: "error"` + stderr rỗng → không phải nhánh cancelled hay errors-based; chỉ có nhánh `Disconnected` khớp.
- 4 commit gần đây sửa ở tầng wait_close/wakeup, không đụng result-pairing → giải thích tại sao chưa hết lỗi.

### Fix — APPLIED

Thêm `take_reader_pair(&mut Option<A>, &mut Option<B>)`: chỉ `.take()` khi CẢ HAI slot đều `Some`. Thay thế scrutinee. Thêm 2 regression test (runtime helper + source guard). Cập nhật source guard cũ.

Files: `src-tauri/src/tool_cancel.rs` (+41/-3).

### Verification

- `cargo test --lib tool_cancel::tests` → 16/16 PASS (kể cả 2 test mới).
- `cargo check --lib` → exit 0.
- `cargo test --lib` → 35 pass / 2 fail — 2 fail là `ai_proxy` IPv6 localhost (`http://[::1]:...`), pre-existing, không liên quan đến tool_cancel.

## Resolution

status: resolved
root_cause: "Result-pairing dùng Option::take() trong if-let scrutinee → nuốt completion của reader đầu tiên khi reader thứ hai chưa xong → mọi lệnh rơi vào nhánh Disconnected trả exit -1/error dù stdout đầy đủ."
fix: "Thay bằng take_reader_pair() chỉ consume khi cả hai slot có giá trị; thêm 2 regression test."
verification: "16/16 tool_cancel tests pass; cargo check clean; 2 ai_proxy IPv6 failures pre-existing/unrelated."
cycles: 1 investigation + 1 fix

## Regression analysis — tại sao trước đây browse được

Câu hỏi: tại sao SSH tool này trước đây không lỗi? Trả lời: KHÔNG phải timing/ordering — là **thay đổi code**. Bug được introduce bởi commit `79fe6f95 fix(tool-cancel): drain stderr concurrently with stdout` (2026-11-22 22:17, Duc Quan Tran).

### Trước `79fe6f95` — single reader, early return

`src-tauri/src/tool_cancel.rs` ở `79fe6f95^` có MỘT reader thread. Thread này đọc stdout tới EOF, rồi đọc stderr trên cùng thread (`channel.stderr()`), rồi gửi đúng MỘT `Chunk::ReaderExited{exit_status, cancelled, error}`.

Vòng lặp command thread xử lý trực tiếp trong nhánh `Ok(Chunk::ReaderExited{..})`:

```rust
// ONLY exit path: the reader thread has actually exited ...
Ok(Chunk::ReaderExited { exit_status, cancelled: was_cancelled, error }) => {
    stdout_coalescer.flush();
    stderr_coalescer.flush();
    let finish_reason = if was_cancelled || cancelled.load(Ordering::SeqCst) {
        "cancelled"
    } else if error.is_some() {
        "error"
    } else {
        "complete"
    };
    break ToolExecOutput { stdout: ..., stderr: ..., exit_status, finish_reason };
}
```

Chỉ 1 thông điệp hoàn tất → resolve ngay tại chỗ → KHÔNG có join của 2 slot → KHÔNG có `.take()` trong scrutinee → không thể dính bug. Mọi lệnh trả đúng exit_status thật từ `channel.exit_status().unwrap_or(0)`.

### Sau `79fe6f95` — hai reader, join bằng `.take()` (bug)

Commit đổi sang 2 reader thread (clone channel cho stderr) để tránh deadlock khi stderr đầy SSH window. Thêm `Chunk::StderrExited`, `stdout_exit`, `stderr_error`, và vòng lặp resolve chỉ sau khi cả 2 có giá trị — nhưng dùng:

```rust
if let (Some((exit_status, was_cancelled, stdout_error)), Some(stderr_error)) =
    (stdout_exit.take(), stderr_error.take())
{ ... }
```

Từ đây mọi lệnh, bất kể timing, đều rơi vào `Disconnected` → -1/error. (Xác nhận bởi `git diff 79fe6f95^ 79fe6f95`: dòng 189-190 thêm đúng pattern này; trước đó không có.)

### Timing có đóng vai trò không?

Không phải nguyên nhân, nhưng giải thích tại sao triệu chứng chỉ thành lỗi thấy được ở git/sqlcl:

- Với bug join, KHÔNG có thứ tự gửi nào cứu được. Dù `StderrExited` tới trước hay `ReaderExited` tới trước, thông điệp đầu bị `.take()` nuốt khi slot kia còn `None`; thông điệp sau bị nuốt ở vòng lặp tiếp. Luôn `Disconnected`.
- Điều làm thay đổi trải nghiệm là lớp caller + thời điểm phát hiện: trước `79fe6f95` (18/11 → 22/11 22:17), browse git chạy đúng. Commit `79fe6f95` và ngay sau đó `4c19629a`/`e85f1eae` (22/11 22:55–23:07) tích hợp Database Explorer/sqlcl cùng branch — nên cả hai repro xuất hiện cùng lúc trên bản build đó. Bốn fix sáng 23/11 (`81378439`, `7ddb93e7`, `c306fc2f`, `a17ad361`) chỉ đụng tầng wait_close/wakeup và diagnosis, không đụng join → bug vẫn còn.

### Kết luận cho sếp

Browse SSH từng chạy vì code cũ dùng MỘT reader + resolve ngay khi nhận `ReaderExited`. Regression xuất hiện ngày 22/11 khi tách thành 2 reader để chống stderr deadlock; chỗ join hai kết quả dùng `.take()` sai chỗ. Fix hiện tại khôi phục đúng hành vi "chỉ resolve khi cả 2 reader xong" mà không nuốt kết quả. Không cần sửa thêm code cho câu hỏi này.
