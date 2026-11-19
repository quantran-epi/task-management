---
status: resolved
trigger: "Tạo nhiều Oracle connection, test connection OK, nhưng trong AI chat team chỉ connection đầu tiên (active) query được; các connection khác oracle_query/oracle_describe đều trả []"
created: 2026-11-19
updated: 2026-11-19
---

# Debug: Oracle multi-connection — chỉ connection active trả kết quả

## Symptoms

- expected: Mọi connection trong `oracle_list_connections` (CARDAPPDB SIT/UAT, CTM UAT/SIT) khi được chọn qua `connectionId`, `name`, hoặc `environment` đều chạy `SELECT 1 AS X FROM DUAL` và trả `results[].items:[{"x":1}]`.
- actual: Chỉ connection đầu tiên (CARDAPPDB SIT, `isActive: true`, id `3bb81317…`) trả đúng dữ liệu. Mọi selector khác — `connectionId=af92afc8…` (CTM UAT), `name="CTM UAT"`, `environment="UAT"`, `connectionId=c1b3ed96…` (CARDAPPDB UAT), `connectionId=2ccb11ee…` (CTM SIT), `name="CTM SIT"` — đều trả `[]`. `oracle_describe` và `oracle_query` trên CTM UAT cũng trả `columns: []` / `data: []`.
- error: Không có thông báo lỗi; kết quả rỗng. `rowCount` luôn 0 ngay cả trên connection active (dữ liệu thật nằm ở `data.results[].items`) — đây là chi tiết quan trọng, không phải nguyên nhân.
- timeline: Ngay sau khi tạo nhiều profile trong phase 45; connection đầu (active) vẫn chạy ổn.
- repro: Trong AI chat team, gọi `oracle_list_connections` thấy 4 connection, rồi `oracle_query` `SELECT 1 AS X FROM DUAL` với từng selector như bảng trên.

## Current Focus

bug_class: Bohrbug (deterministic positional symptom)

hypothesis (H1 — BIỂU HIỆN, đang kiểm chứng): Lớp execution trong `oracleSqlclService.ts` KHÔNG kiểm tra `exitStatus`/`stderr`/stdout rỗng. Mọi lỗi remote KHÔNG phải ORA-/SP2- (SSH auth fail, `sql: command not found`, connection refused, exit 127, v.v.) với stdout rỗng bị `extractJsonFromSqlclOutput("")` biến thành `[]` và trả `success: true, data: []` — khớp chính xác triệu chứng "không có error, kết quả rỗng". Các connection 2..4 (SSH host / SQLcl env / secret khác first) thất bại ở mức remote command rồi bị che giấu thành `[]`.
hypothesis (H2 — đã LOẠI TRỪ): Resolver/dispatch positional head. `resolveOracleConnection()` dùng `.find()` theo id/name/env, KHÔNG dùng `profiles[0]`. Schema expose đủ selector. Args đi nguyên vẹn: model tool_calls → JSON.parse → dispatchAiToolCall → executeAiTool → executeOracleQuery(resolveOracleConnection(profiles,args)). `oracle_list_connections` trả đủ 4 profile → shape `{profiles:[...]}` đúng. Test `routes a query to the selected profile` chứng minh UAT selector dùng đúng connectionString UAT.

evidence_so_far (mới):
- [TEST 2026-11-19] `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts src/services/ai/__tests__/oracleMultiConnection.test.ts` → 32/32 PASS. Lớp service + resolver + routing đúng với mock.
- oracleSqlclService.ts:510-549 (query), 631-641/686-697/723-734 (describe): sau `extractOracleError()` (chỉ bắt ORA-\d{5} / SP2-\d{4}) KHÔNG có kiểm tra `res.exitStatus`, KHÔNG có kiểm tra `res.stderr` cho lỗi thường, KHÔNG có kiểm tra stdout rỗng. `extractJsonFromSqlclOutput` (dòng 277-310) trả `[]` khi `stdout.trim()` rỗng → `data: []`, `success: true`.
- oracleSqlclService.ts:524-528: `rowCount` đọc `.results?.[0]?.rows?.length` trong khi data thật nằm ở `.results[].items` → rowCount luôn 0 (user đã xác nhận; triệu chứng phụ, sẽ sửa cùng).
- Chỉ test connection (`testOracleConnection`, dòng 365-407) MỚI có check `exitStatus !== 0 && !stdout.includes('TEST_OK')`. Đây là lý do "Test connection OK" nhưng query vẫn `[]`.
- Mọi selector path (aiTools.ts:2349-2360, aiOrchestratorLoop.ts:47-93 & 469-542, chatTurnTools.ts, teamRunCoordinator.ts:1455-1496, chatTurnRuntime.ts:365-377) đều truyền args nguyên vẹn — không strip/rename.
evidence_so_far (tiếp):
- [TEST RED 2026-11-19] Thêm 2 regression test. Test 1: mock execRemoteCommand trả `{stdout:'', stderr:'Permission denied (publickey).', exitStatus:255}` → `executeOracleQuery` trả `success:true` (kỳ vọng false). Test 2: SQLcl shape `{results:[{items:[{X:1}]}]}` → `rowCount:0` (kỳ vọng 1). Cả 2 FAIL = bug reproduced.
- Rust `run_cancellable_remote_command` (tool_cancel.rs:509-536) trả `ToolExecOutput{ exit_status, finish_reason: 'error'|'complete'|'cancelled', stderr chứa error }` — lớp TS có đủ tín hiệu để báo lỗi nhưng bỏ qua hết.
- getSshSecret lấy keyring theo `targetSsh.id`; mỗi profile có sshConfigId riêng → nếu secret của SSH host 2..4 chưa lưu trong keyring, remote fail, bị che thành [].

reasoning_checkpoint:
  hypothesis: "Lớp execution oracleSqlclService.ts bỏ qua exitStatus/finishReason/stderr không-ORA và stdout rỗng, nên mọi lỗi remote (SSH auth, sqlcl missing, connect fail) của connection 2..4 bị convert thành {success:true, data:[]}. Connection đầu chạy được vì SSH/secret/sqlcl của nó hợp lệ."
  confirming_evidence:
    - "Test RED: exitStatus 255 + stderr 'Permission denied' + stdout '' → success:true (xác nhận che lỗi)."
    - "extractJsonFromSqlclOutput('') trả [] (dòng 277-279) → data:[]."
    - "Chỉ testOracleConnection có check exitStatus !== 0; query/describe không có."
    - "extractOracleError chỉ nhận diện ORA-/SP2-, không nhận diện lỗi shell/SSH thường."
  falsification_test: "Sau fix, cùng mock exitStatus 255 phải trả success:false + error có stderr (đã redact), không chứa mật khẩu. Nếu vẫn success:true hoặc test connection thật trên connection 2 vẫn trả [] có error thực thì giả thuyết sai."
  fix_rationale: "Thêm helper kiểm tra remote failure dùng exitStatus/finishReason/stderr/stdout rỗng áp dụng cho cả query + describe; sửa rowCount đọc items thay vì rows. Đây là nguyên nhân trực tiếp của triệu chứng 'rỗng không có lỗi'; đồng thời để lộ error thật của connection 2..4 để user biết cần sửa SSH/secret."
  blind_spots: "Không có credentials SSH/DB thật để xác nhận connection 2..4 fail vì lý do gì cụ thể (auth vs sqlcl path vs TNS). Chỉ chứng minh được cơ chế che lỗi. Cần user verify sau fix để thấy error message thực."
  candidate_causes:
    - "code: executeOracleQuery/Describe bỏ qua exitStatus/finishReason/stderr và trả [] khi stdout rỗng"
    - "config: SSH secret trong keyring chưa được lưu cho sshConfigId của connection 2..4 (test connection OK nhưng secret chỉ lưu tạm trong session lúc test)"
  and_gate: "Có thể CẦN cả hai: (1) code che lỗi → triệu chứng rỗng; (2) config secret/config sai → connection 2..4 thực sự fail. Fix code là cần thiết để biến '' thành error rõ ràng; config phải do user xác nhận."
status_note: guardrail_accepted_pending_human_verify
resolution_in_progress:
  root_cause: "oracleSqlclService.ts bỏ qua exitStatus/finishReason/stderr và trả [] khi stdout rỗng → mọi lỗi remote của connection 2..4 bị che thành {success:true,data:[]}. Connection đầu work vì SSH/secret/sqlcl hợp lệ."
  fix: "Thêm detectRemoteFailure(res,config) + redactConnectionSecrets; áp dụng cho explain/query/list_tables/describe_table/get_ddl. Sửa rowCount đọc results[].items thay vì results[].rows. Thêm 2 regression test."
  files_changed:
    - src/services/ai/oracleSqlclService.ts
    - src/services/ai/__tests__/oracleSqlclService.test.ts
verification_so_far:
  - "Test RED trước fix: 2 new tests fail (success:true thay vì false; rowCount:0 thay vì 1)."
  - "Test GREEN sau fix: 34/34 focused pass; 49/49 adjacent pass (oracle + chatTurnTools + exportBackup)."
  - "tsc --noEmit exit 0."
next_action: Request human verification. Lưu ý blind spot: chưa có credentials thật để xác nhận lý do connection 2..4 fail cụ thể — sau fix user sẽ thấy error thực thay vì [].

## Resolution

root_cause: "oracleSqlclService.ts (executeOracleQuery/Describe) chỉ dùng extractOracleError (bắt ORA-/SP2-) nhưng bỏ qua exitStatus/finishReason/stderr thường và stdout rỗng. Kết quả: mọi lỗi remote không-ORA của connection 2..4 (SSH auth fail, sqlcl không tồn tại, connect timeout — ví dụ do secret/keyring hoặc cấu hình của sshConfigId tương ứng chưa đúng) bị extractJsonFromSqlclOutput('') biến thành [] và trả {success:true,data:[]}. Connection đầu tiên chạy được vì cấu hình SSH/secret/sqlcl hợp lệ. active-flag KHÔNG phải nguyên nhân; resolver/dispatch/schema đã đúng và được test chứng minh."

fix: "Thêm detectRemoteFailure(res, config) + redactConnectionSecrets() trong oracleSqlclService.ts; áp dụng ở cả 5 đường thực thi (explain, query, list_tables, describe_table, get_ddl). Sửa rowCount đọc results[].items (shape SQLcl thật) thay vì results[].rows. Thêm 2 regression test trong oracleSqlclService.test.ts."

files_changed:
  - src/services/ai/oracleSqlclService.ts
  - src/services/ai/__tests__/oracleSqlclService.test.ts

verification:
  target_test: { result: pass, note: "2 regression test mới: RED trước fix → GREEN sau fix" }
  mutation_check: { result: skipped, reason: "Stryker không được cài đặt/cấu hình trong repo (không có stryker.conf, không có dependency)", mutant_killed: null }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, note: "Fix chỉ THÊM guard + sửa field đọc; không xóa branch hay suy yếu assertion" }
  adjacent_tests: { result: pass, suites_run: [oracleSqlclService.test.ts, oracleMultiConnection.test.ts, chatTurnTools.test.ts, exportBackup.test.ts], count: 49 }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "git checkout HEAD -- source → 2 test FAIL; copy fix về → 28/28 PASS" }
  tsc: { result: pass, exit: 0 }
  guardrail_verdict: accepted

blind_spot: "Không có credentials SSH/DB thật để xác nhận lý do cụ thể connection 2..4 fail. Fix đảm bảo lỗi thực được HIỂN THỊ (có redact secret) thay vì [] giả. User cần verify trong Tauri app để thấy error message thực và sửa SSH/secret/config tương ứng."

human_verify: deferred — user opted to push without testing; verify in Tauri app after build (fix surfaces real remote error instead of [])
commit: 52f2f39a
