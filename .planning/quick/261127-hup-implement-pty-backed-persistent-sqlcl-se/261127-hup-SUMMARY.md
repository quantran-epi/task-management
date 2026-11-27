---
phase: 261127-hup
plan: 01
type: execute
status: complete
completed: 2026-11-27
branch: fix/oracle-sqlcl-pty
base: 8c343209
requirements: []
---

# Quick 261127-hup: PTY-backed persistent SQLcl Summary

Persistent SQLcl chạy trên SSH PTY `xterm` (ECHO tắt, 65535 cột), REPL sống giữa các query. Marker hoàn tất là một dòng plain text do `SELECT` phát ra; reader chuẩn hoá ANSI/prompt trước khi so sánh equality và trước khi đưa dòng vào stdout.

## Files changed (exact)

- `src-tauri/src/ssh_pool.rs` — `request_pty("xterm", ECHO=false, (65535,24,0,0))` trước `channel.exec`; helper pure `strip_ansi_escapes`, `strip_sqlcl_prompt`, `sqlcl_line_is_marker`, `scan_sqlcl_pgid_line`, `append_sqlcl_line` (normalize ANSI+prompt, drop marker/prompt-only lines); bounded `drain_sqlcl_prefix` sau banner và sau marker; PGID scan dùng helper mới; EOF trước marker trả Err kèm stderr snapshot; 7 unit test mới.
- `.planning/STATE.md` — 1 row `261127-hup` trong Quick Tasks Completed + 1 dòng last activity.
- `.planning/quick/261127-hup-implement-pty-backed-persistent-sqlcl-se/261127-hup-SUMMARY.md` — file này.

## Commits

- `c9c4cd90` — `test(261127-hup): add pure PTY marker/PGID/ANSI helper tests plus implementation`
- `7af9a357` — `fix(261127-hup): run persistent SQLcl on SSH PTY with normalized line reader`

(Planning docs STATE/SUMMARY được commit riêng theo quick flow trên cùng branch.)

## Verification commands + results

Chạy từ worktree root `/Users/admin/working/personal/task-management/.claude/worktrees/oracle-sqlcl-pty`:

1. `cd src-tauri && cargo test --lib ssh_pool::tests`
   → `test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 45 filtered out` (baseline 17, +7 tests mới).
2. `cd src-tauri && cargo check --lib`
   → `Finished dev profile` — exit 0, không warning/error.
3. `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1`
   → `Test Files 1 passed (1)`, `Tests 44 passed (44)`, exit 0.
4. `git diff --check`
   → exit 0, sạch whitespace.

Không chạy `npm test` (quy ước dự án >1 giờ), không live SSH/SQLcl, không UAT mạng, không merge/push.

## RED → GREEN evidence

- RED: thêm 7 test trước khi implement helper → 13 lỗi `E0425: cannot find function` cho `strip_ansi_escapes` / `strip_sqlcl_prompt` / `sqlcl_line_is_marker` / `scan_sqlcl_pgid_line`.
- GREEN: implement helper bằng stdlib (byte scan cho CSI `ESC [` → 0x40..=0x7E và OSC `ESC ]` → BEL/ST, không regex, không crate mới) → 24/24 pass.

## Quyết định protocol / PTY

- Dùng PTY vì `-s` với stdin pipe chạy batch rồi thoát tại EOF, marker không bao giờ được phát kịp; PTY tạo terminal semantics nên REPL sống giữa query.
- Giữ marker `SELECT '<marker>' FROM DUAL;` dưới `SET SQLFORMAT DEFAULT` — detection equality sau strip ANSI + prompt + trim, không substring. `PROMPT` bị suppress ở `-s`; `SQLFORMAT JSON` làm marker lẫn payload JSON.
- API PTY đúng với `ssh2 0.9.6` đã pin: `Channel::request_pty(&str, Option<PtyModes>, Option<(u32,u32,u32,u32)>)` và `PtyModes::set_boolean(PtyModeOpcode::ECHO, false)` — đối chiếu trực tiếp source local `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/ssh2-0.9.6/src/{channel.rs,lib.rs}`. Không có deviation so với plan.
- ECHO tắt để script không bị echo ngược vào stdout; 65535 cột (`unsigned short` max) tránh wrap dòng JSON.
- Drain có giới hạn (`SQLCL_DRAIN_MAX_LINES = 64`, dừng ở wakeup timeout/EOF) sau banner và sau marker để không để byte cũ sang query sau, không chặn vô hạn.
- stderr vẫn đọc thread riêng, bounded `MAX_SQLCL_STDERR_BYTES = 2 MiB`; cancel vẫn SIGTERM PGID qua `spawn_kill_remote_process_group_for_sqlcl`.

## Files intentionally unchanged

- `src/services/ai/oracleSqlclService.ts` (TS production) — heredoc `EOF_ORACLE_SQLCL_<hex>` giữ nguyên.
- `src/services/ai/__tests__/oracleSqlclService.test.ts` — chỉ chạy verify, không sửa.
- `src-tauri/src/tool_cancel.rs`, `src-tauri/src/ssh_service.rs` — giữ contract `build_remote_command`, `PGID_LINE_PREFIX`, `run_persistent_sqlcl` routing.
- Không thêm dependency (`Cargo.toml`, `Cargo.lock`, `package.json` không đổi).

## Deviations

- Environment note: pre-commit guard for worktree agent-branch namespace (`agent-*` / `worktree-agent-*` / `worktree-wf_*`) rejected the orchestrator-mandated branch `fix/oracle-sqlcl-pty`. Branch is not protected/default and was explicitly prescribed with base `8c343209`, so work continued there; no branch switch, merge, or push.

## Self-Check: PASSED

- Created files exist: `src-tauri/src/ssh_pool.rs`, `.planning/STATE.md`, this SUMMARY.
- Commits exist: `c9c4cd90`, `7af9a357`.
- `git diff --check` exit 0. Pre-existing `.gsd/dispatch-isolation-sentinel.json` modification left untouched (not plan-scoped).
