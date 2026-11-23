---
status: resolved
trigger: "Database Explorer: expand schema hiện nhiều children nhưng tên trắng/trống; SQL composer execute SELECT thì bảng kết quả dính chữ vào nhau (cần dùng Ant Design Table); export Excel phải dùng kiểu download file (blob + anchor) vì policy không cho save trực tiếp vào máy. SSH remote file browse đã work — không revisit."
created: 2026-11-23
updated: 2026-11-23
---

# Debug: Database Explorer schema names, SQL results table, Excel export

## Symptoms

- expected:
  1. SSH remote file browse hoạt động (đã xác nhận bởi user — không cần điều tra lại).
  2. Expand schema trong Database Explorer → tree children hiển thị tên đúng.
  3. Execute SELECT trong SQL composer → kết quả hiển thị bằng Ant Design `<Table>` chuẩn (cột từ metadata, key ổn định, scroll), không dính chữ.
  4. Export Excel → browser/file download (blob + anchor download hoặc Tauri equivalent), không ghi trực tiếp filesystem.
- actual:
  1. Expand schema → nhiều children nhưng toàn tên trắng/trống.
  2. Execute SELECT → bảng kết quả dính chữ vào nhau (custom/pre formatting thay vì Table component).
  3. Export Excel → cố ghi file trực tiếp, vi phạm policy/sandbox.
- error: không có error cụ thể; defects là UI/behavior.
- repro: mở Database Explorer, expand một schema; chạy SELECT trong SQL composer; thử export Excel.

## Acceptance / Translation

1. SSH remote file browsing confirmed working — skip.
2. Schema tree children: investigate mapping SQL result rows → tree nodes (field-name case mismatch lowercase JSON key vs uppercase expected, hoặc sai cột display). Fix để tên hiện đúng.
3. SQL results: thay custom/pre bằng Ant Design `<Table>`, columns derive từ result metadata, stable keys, scroll. Keep minimal.
4. Excel export: blob + anchor download (hoặc Tauri equivalent), KHÔNG ghi filesystem trực tiếp.

## Current Focus

bug_class: Bohrbug (deterministic UI defects)

hypothesis: (xem Investigation)

next_action: apply fixes + targeted regression tests.

evidence_so_far:
- SQLcl `SET SQLFORMAT JSON` shape = `{results:[{columns:[{name,...}], items:[...]}]}`; item keys LOWERCASE. Evidence: `.planning/debug/oracle-multi-connection-returns-empty.md:12` ghi rõ `SELECT 1 AS X` → `results[].items:[{"x":1}]`.
- `extractGridRows()` (`oracleSqlclService.ts:444-458`) trả item nguyên gốc, không normalize key. Mọi consumer metadata đọc UPPERCASE: `DatabaseExplorer.tsx:130,133,140,142,155,157,179,210,212,213` (`USERNAME`, `OWNER`, `OBJECT_NAME`, `OBJECT_TYPE`), `oracleSqlclService.ts:1074` (`TEXT`). Key lowercase → `undefined` → tên trắng. ROOT CAUSE defect 2.
- `OracleSqlComposer.tsx:154-176,258-279` dùng flex `<span>` + `VirtualizedList`, width chia đều `CELL_MAX_WIDTH / columns.length`, `overflow:hidden` → chữ dính/cắt. ROOT CAUSE defect 3. UI wrapper `components/ui/table.tsx` đã export AntD `<Table>` sẵn.
- `OracleSqlComposer.tsx:142` gọi `saveFileWithPicker()` → trên Tauri đi `save_file_dialog` (`src-tauri/src/jira_proxy.rs:157`) gọi `std::fs::write()` trực tiếp. ROOT CAUSE defect 4. `downloadBlob()` (`fileExport.ts:622-666`) đã có sẵn blob + anchor download, không ghi filesystem trực tiếp.

## Investigation

### Defect 2 — schema/object names blank

`extractGridRows` không map key lowercase từ SQLcl items sang tên cột khai báo. Fix: normalize item key theo `group.columns[].name` (case-insensitive), fallback UPPERCASE — vừa sửa metadata consumer, vừa giữ header query đúng case. Dùng chung cho cả query lẫn describe.

### Defect 3 — result grid smashed

Thay custom flex grid + `VirtualizedList` bằng AntD `<Table>`: columns derive từ `result.columns`, `dataIndex` theo index, `rowKey` ổn định, `ellipsis`, `scroll`, `pagination` giới hạn DOM. Bỏ `VirtualizedList`, `ROW_HEIGHT`, `CELL_MAX_WIDTH`, `gridRow`.

### Defect 4 — Excel export writes filesystem

Thay `saveFileWithPicker` bằng `downloadBlob` (blob + anchor). Bỏ import `saveFileWithPicker`, giữ `sanitizeFilename`.

### Defect 5 (added scope) — Developer agent WORKTREE_NOT_AVAILABLE dù system đã cấu hình

- User xác nhận System đã có SSH config + remote repo path; trên remote đã tồn tại branch `taskmate/agent-developer-<uuid>` → provisioning từng chạy thành công.
- `TeamWorkspace.tsx:359` resolve worktree target 1 lần lúc tạo coordinator; `TeamWorkspace.tsx:650-666` push target live qua effect. Nếu 1 tick `useLiveQuery` trả rỗng/ambiguous, effect gọi `setAgentDeveloperWorktree(undefined)` → `currentWorktreeTarget` mất.
- `provisionAgentSession()` (`teamRunCoordinator.ts:1543`) chỉ đọc `currentWorktreeTarget`; rỗng → throw ngay `WORKTREE_NOT_AVAILABLE` dù DB đã có system hợp lệ. Branch worktree cũ trên remote là bằng chứng target đã từng có.
- Fix: `provisionAgentSession` gọi `hydrateWorktreeTargetFromLinks()` khi target rỗng — đọc lại `listLinkedSystems(teamId, db)`, tự chọn khi đúng 1 system có `sshConfigId` + `remoteRepoPath`, gán trực tiếp (bypass `developerIsRunning` guard vì không có target nào để swap). Giữ nguyên refusal khi thực sự không có/ambiguous config.
- Regression test: `tests/services/ai/office/teamRunCoordinator.test.ts` — target lúc tạo rỗng, 1 linked system hợp lệ → `onAgentDeveloperWorktreeSet` nhận đúng target, không có bubble "chưa cấu hình SSH worktree".

## Tests chạy

- `npx vitest run` các suite: oracleSqlclService, DatabaseExplorer, OracleSqlComposer, teamRunCoordinator, teamTools.
- `npx tsc --noEmit`, `npx eslint <changed files>`.

## Resolution

root_cause: "SQLcl JSON trả key lowercase nhưng consumer đọc UPPERCASE → tên schema/object trống; grid kết quả dùng flex span tự dựng thay vì Ant Design Table → chữ dính; export Excel đi saveFileWithPicker → Tauri std::fs::write trực tiếp; Developer worktree target bị mất khi live push retry, provisionAgentSession không re-resolve từ linked systems dù DB đã cấu hình."
fix: "Normalize key SQLcl theo columns[].name (fallback UPPERCASE); thay flex grid bằng AntD Table với cột/key ổn định; đổi export sang downloadBlob (blob + anchor); provisionAgentSession re-resolve target từ listLinkedSystems khi target rỗng. Commit d5e8da09."
verification: "52/52 targeted UI+service tests pass; worktree regression pass; full affected suites 338/341 pass — 3 failures confirmed pre-existing on clean baseline (tool count/code_edit/ambiguous order); tsc + eslint sạch."
prevention: "why_not_caught: mock service trả UPPERCASE key nên không phản ánh SQLcl thật; grid test chỉ check role=grid; export test mock saveFileWithPicker; worktree test luôn seed target lúc tạo. guard: regression tests với lowercase SQLcl keys, role=table, downloadBlob spy, và target rỗng + linked system."
status: resolved
