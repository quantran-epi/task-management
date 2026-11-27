---
status: investigating
trigger: "các tool oracle vẫn bị lỗi, các fix gần đây về cái này không hiệu quả"
created: 2026-11-27
updated: 2026-11-27
---

# Debug Session: oracle-sqlcl-tools-broken

## Symptoms

- Expected: `list_schemas` trả danh sách schema, `query` trả columns/rows đúng như trước; tool đã từng chạy tốt.
- Actual: `list_schemas` → `Không nhận dạng được PGID của phiên SQLcl.`; `query` → `Phiên SQLcl kết thúc trước khi có marker.`
- Timeline: hỏng sau khi thêm "persistence sqlcl gì đó"; trước đây mỗi lần gọi tool spawn SQLcl một lần.
- Reproduction: gọi tools Oracle từ trong TaskMate.
- Error messages: xem `trigger` và Actual ở trên.

## Current Focus

- hypothesis: Xác nhận — lỗi nằm ở giao thức persistent-SQLcl-over-PTY (xem Resolution), không phải ở parser helper đã fix.
- next_action: root cause report complete; cần live repro để chốt nhánh cuối.

## Evidence

- [CODE] `src-tauri/src/ssh_service.rs:515-525` — mọi SQLcl heredoc từ TS đều đi qua `parse_sqlcl_command` → `run_persistent_sqlcl`. Đây là path tool trong TaskMate (không phải CLI rời).
- [CODE] `src-tauri/src/ssh_pool.rs:261-273` + `:646-676` — `list_schemas` báo `Không nhận dạng được PGID...` khi `read_sqlcl_pgid` hết 10 outcome mà không có dòng `TASKMATE_PGID:<n>` hoàn chỉnh. PGID do `build_remote_command` (`tool_cancel.rs:312-319`) `echo` từ `setsid sh -c`.
- [CODE] `src-tauri/src/ssh_pool.rs:363-405` — `query` báo `Phiên SQLcl kết thúc trước khi có marker.` khi `reader.read_line` trả `Ok(0)` (EOF) trước khi `sqlcl_line_is_marker` khớp marker `SELECT '<marker>' FROM DUAL`.
- [CODE] `ssh_service.rs:176-179` + `ssh_pool.rs:211` — socket Wakeup 250ms; mỗi `read_line` timeout là một poll tick.
- [HISTORY] persistence bắt đầu `41949863` (vra: pool SSH + persistent SQLcl, bỏ spawn mỗi lần). Chuỗi fix sau đó: `dbf6beba` (dsx: PROMPT→SQL JSON marker), `bbe75d3c` (eos: plain-line marker), `c9c4cd90`/`7af9a357` (hup: chuyển sang PTY xterm ECHO-off), `a094e622`/`76faf6ad`/`636b6f62` (j35: bounded diagnostics + idle 60s + drain), `533c14d3`/`5d43d2e4` (mmz: giữ partial PGID byte qua wakeup). Merge vào baseline: `1d9ee64c`, `d2727e58`. HEAD hiện tại chứa toàn bộ fix.
- [GAP] TẤT CẢ summary quick (dsx/eos/hup/j35/mmz) đều ghi rõ "không live SSH/SQLcl, không UAT mạng"; test chỉ chạy helper thuần túy với scripted outcomes. `.planning/STATE.md` cột Verified của dsx..mmz = `—` (riêng vra = `Verified`). Không fix nào đo lại hành vi PTY thực tế.
- [CODE] `ssh_pool.rs:80-103` (`PoolKey`) key theo config+secret+timeout class; `SqlclSessionRegistry` giữ session theo `SqlclKey` (bin/conn/env). Session tồn tại giữa các tool call, khác hẳn chế độ "mỗi lần spawn một SQLcl" trước đây.

## Resolution

root_cause: "Chuyển từ spawn-SQLcl-mỗi-tool sang persistent SQLcl trên SSH PTY (41949863, rồi PTY ở 7af9a357) đưa vào giao thức mới: PGID tự parse từ dòng `echo TASKMATE_PGID:$$`, hoàn tất query bằng marker `SELECT '<marker>' FROM DUAL`, reader sống giữa các call. Hai symptom là hai failure point của giao thức đó — `read_sqlcl_pgid` hết 10 poll tick 250ms không thấy dòng PGID hoàn chỉnh (`Không nhận dạng được PGID...`), và `run_script` gặp EOF trước marker (`Phiên SQLcl kết thúc trước khi có marker.`). Chuỗi fix dsx→eos→hup→j35→mmz chỉ chỉnh parser/diagnostic helper thuần túy, test bằng scripted outcomes, không có live PTY verification nào; vì vậy unit test xanh nhưng trạng thái remote/PTY thực vẫn không khớp và tool vẫn lỗi."
fix: "not applied — goal find_root_cause_only."
confidence: "medium-high cho cơ chế (code + history chốt rõ); chưa live-proven vì không có credentials SSH/DB trong môi trường này."
blind_spot: "Không được suy luận từ stderr rỗng: PTY thường gộp stderr vào stdout nên `channel.stderr()` (`ssh_pool.rs:279-303`) có thể luôn rỗng. ORA-/SP2- nằm trong stdout tail (`ssh_pool.rs:494-508`). Chưa dump raw PTY bytes từ session thực."
next_step_for_orchestrator: "Một debug run có credential: dump ~2 KiB raw PTY bytes ngay sau `channel.exec` và trong `run_script`, rồi gọi `list_schemas` + `query` liên tiếp."

## Audited Findings (xác nhận bằng code)

- PGID scan chỉ 10 lần `read_line` (`ssh_pool.rs:261-273`); mỗi dòng banner/MOTD không khớp bị xóa buffer (`ssh_pool.rs:663-664`); `drain_sqlcl_prefix` chạy SAU scan (`ssh_pool.rs:277`). Bất kỳ output nào lấn trước `TASKMATE_PGID:` ăn quota → error `Không nhận dạng được PGID...`.
- `health_check` chỉ check TTL (`ssh_pool.rs:419-441`), không check liveness. `run_persistent_sqlcl` tái dùng channel cũ (`ssh_pool.rs:811-829`); EOF branch không kill remote triệt để (`ssh_pool.rs:363-374,840-847`). Channel chết → `Ok(0)` → error `Phiên SQLcl kết thúc trước khi có marker.`
- `drain_sqlcl_prefix` clear partial line mỗi vòng (`ssh_pool.rs:59-77`) → có thể cắt đầu JSON/prompt của query sau. Marker trên partial line lúc wakeup không được check (`ssh_pool.rs:384-389`) → idle 60s thay vì complete.
- ECHO=false (`ssh_pool.rs:249-253`) chỉ tắt terminal echo của input; lệnh `echo TASKMATE_PGID:$$` (`tool_cancel.rs:312-319`) vẫn in ra. Không phải nguyên nhân mất PGID.
- TS heredoc/guardrail không phải thủ phạm: delimiter 49 ký tự (`oracleSqlclService.ts:654-659`), `parse_sqlcl_command` strip `EXIT;` (`ssh_pool.rs:757-767`).
