---
phase: quick
plan: 261128-lg4
subsystem: tooling
tags: [telegram, node, watcher, supervisor, node:test, zero-dependency]
requires:
  - phase: quick-261128-l70
    provides: Telegram bridge inbox/outbox contract and config convention
provides:
  - "watcher 3 mode: watch/inbox-once/archive với outbox gate và id validation"
  - "supervisor chạy bridge + watcher, forward signal, kill sibling"
  - "npm scripts telegram:control / inbox-once / archive"
  - "instruction mẫu + luồng 4 bước cho session điều phối"
affects: [telegram-bridge, coordinator-session]
tech-stack:
  added: []
  patterns: [node-builtins-only, DI factories, signal-gated archive]
key-files:
  created:
    - scripts/telegram-watcher.mjs
    - scripts/telegram-watcher.test.mjs
    - scripts/telegram-control.mjs
  modified:
    - scripts/TELEGRAM_BRIDGE.md
    - package.json
key-decisions:
  - "Không spawn claude: watcher chỉ in INBOX <name>; session điều phối do người mở tiêu thụ inbox"
  - "Archive chỉ cho phép khi outbox tồn tại; --force là lựa chọn rõ ràng của session"
  - "id archive là update_id dạng /^\\d+$/, chặn path traversal"
  - "Log/stdout chỉ tên file inbox + trạng thái, không token/chat ID/text"
patterns-established:
  - "Watcher factory nhận inject sleep/signal/log/onSignal cho node:test"
  - "Supervisor spawn argv array, shell:false, sibling kill on exit"
requirements-completed: []
duration: 2min
completed: 2026-11-28
---

# Quick 261128-lg4: Claude watcher lightweight cho Telegram bridge Summary

**Signal-only watcher, outbox-gated archive, và supervisor chạy bridge + watcher dưới session điều phối — không spawn Claude, không dependency mới**

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-28T08:31:35Z
- **Completed:** 2026-11-28T08:33:40Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `telegram-watcher.mjs`: 3 mode `watch` / `inbox-once` / `archive <id>`; dedupe theo tên file, restart báo lại file còn tồn tại, archive kiểm tra outbox trước khi rename vào `archive/`, `--force` cho phép bỏ qua có chủ đích.
- `telegram-control.mjs`: spawn bridge + watcher bằng `process.execPath` với argv array, `shell: false`; forward SIGINT/SIGTERM, kill sibling khi con exit bất thường, log chỉ trạng thái.
- 10 test `node:test` DI: tín hiệu/dedupe, abort, inbox read, outbox gate, traversal, log hygiene, supervisor cleanup — không Claude thật, không network.
- `package.json` thêm 3 script; `TELEGRAM_BRIDGE.md` có instruction mẫu tiếng Việt và luồng xử lý 4 bước.

## Task Commits

1. **Task 1: Watcher 3 mode** - `5613a8cc` (feat)
2. **Task 2: node:test DI** - `473d2e3f` (test)
3. **Task 3: Supervisor + npm script + docs** - `e5cda661` (feat)

**Plan metadata:** không commit theo yêu cầu Additional Instruction (SUMMARY ghi nhận nhưng không stage).

## Files Created/Modified

- `scripts/telegram-watcher.mjs` - watch/inbox-once/archive, validate id, log sạch
- `scripts/telegram-watcher.test.mjs` - 10 DI tests cho watcher + supervisor
- `scripts/telegram-control.mjs` - supervisor spawn 2 child, signal forwarding, sibling kill
- `scripts/TELEGRAM_BRIDGE.md` - instruction session điều phối + luồng 4 bước + `--force`
- `package.json` - 3 script `telegram:*`

## Decisions Made

- Watcher không đọc nội dung inbox ở chế độ watch — chỉ in `INBOX <name>`; nội dung chỉ đọc qua `inbox-once` do session điều phối gọi.
- Archive chặn mất dữ liệu bằng outbox gate; `--force` được ghi rõ trong docs là lựa chọn có ý thức khi không phản hồi.
- Không sửa `scripts/telegram-bridge.mjs` / `.test.mjs`; tái dùng hợp đồng inbox/outbox hiện có.

## Deviations from Plan

- Test traversal ban đầu giả định thư mục `archive/` tồn tại sau khi validate thất bại; thực tế validate từ chối trước khi mkdir. Sửa assertion thành `readdir(...).catch(() => [])` — lỗi test, không phải lỗi production, không đổi hành vi script.

**Total deviations:** 1 test-only adjustment. **Impact:** không đổi scope, không ảnh hưởng production code.

## Issues Encountered

None. `node --test` xanh 10/10 trong ~60ms; `node --check` cả 2 script sạch; grep gate không tìm thấy `shell: true` / `execSync` / `exec(` / `spawn('claude'`; `git diff --stat` đúng 5 file trong `files_modified`.

## Known Stubs

None.

## Threat Flags

None — các mitigation T-lg4-01..04 đều nằm trong phạm vi plan: text chỉ in dạng JSON cho `inbox-once`, id validate trước join path, log sạch, forward/kill child. Không endpoint, auth hay schema mới.

## User Setup Required

Không có cấu hình mới. Cần token thật + chat whitelist để UAT tay (bước 5 verification là tùy chọn). Session điều phối phải do người mở; nếu chưa mở thì không ai tiêu thụ inbox.

## Self-Check: PASSED

- Cả 3 file mới tồn tại trên disk.
- 3 commit `5613a8cc`, `473d2e3f`, `e5cda661` có trong `git log`.
- `node --test scripts/telegram-watcher.test.mjs`: 10 pass / 0 fail.
- Diff scope đúng 5 file; bridge files nguyên vẹn.

## Next Phase Readiness

Sẵn sàng UAT tay với token thật: chạy `npm run telegram:control` trong session điều phối, gửi lệnh whitelist, `npm run telegram:inbox-once`, ghi outbox, `npm run telegram:archive -- <id>`, Ctrl+C kiểm tra không orphan process.

---
*Plan: 261128-lg4*
*Completed: 2026-11-28*
