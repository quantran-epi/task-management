---
slug: ai-chat-input-lag
status: awaiting_human_verify
trigger: "Tính năng AI chat team, gõ vào ô chat lại bị chậm và lag rồi"
created: 2026-11-18
updated: 2026-11-18
---

# Debug Session: ai-chat-input-lag

## Symptoms (confirmed with user 2026-11-18)

- Expected behavior: Gõ tức thì, mượt — mỗi ký tự hiện ngay, giống ô input thông thường.
- Actual behavior: Gõ bị trễ/kẹt — ký tự hiện muộn, có lúc mất ký tự khi gõ nhanh.
- Error messages: Không có lỗi console/UI (theo user).
- Timeline: Regression gần đây — trước đây gõ mượt, gần đây mới lag.
- Reproduction: Mở tab AI chat team rồi gõ liên tục vào ô input.
- Triệu chứng bổ sung (cùng lượt báo cáo 2026-11-18): "khi gọi tool AI oracle, app treo nặng" (calling the AI Oracle tool makes the app hang badly). Giả thuyết: có thể cùng root cause với ô chat lag (main-thread blocking / re-render storm / sync expensive work) — cần điều tra cả hai.

## Current Focus

### Branch B (mới, 2026-11-18) — Oracle tool treo app

- user_feedback: "typing đã mượt, nhưng oracle tool call vẫn gây treo app" → Symptom 1 (render lag) CONFIRMED FIXED trên Tauri thật. Chuyển sang điều tra blind spot Symptom 2.
- scope: Chỉ điều tra/fix cơ chế Oracle tool treo. Không đụng lại phần render đã xác nhận ổn.
- bug_class: Bohrbug (deterministic — gọi Oracle tool treo theo latency SSH/SQLcl; read_to_end không bounded).
- hypothesis: CONFIRMED (source evidence) — `ssh_exec_command` là Tauri command sync dùng `channel.read_to_end()` không có timeout/cancel; `config.timeoutSeconds: 30` tồn tại nhưng KHÔNG được dùng ở bất kỳ đâu trong đường gọi Oracle. Khi SQLcl treo, `await invoke('ssh_exec_command')` trong `execRemoteCommand` không resolve → `executeOracleQuery` không trả → tool event loop không kết thúc → turn treo. UI ProgressCard chỉ là clock hiển thị (`DEADLINE_NOTE`: "Hết giờ → báo cáo một phần...") không phải cơ chế cancel thực.
- test: (1) regression test TS: mock `execRemoteCommand` treo vô hạn (`never-resolving promise`), verify `executeOracleQuery` vẫn trả `{success:false, error: timeout}` sau timeout; (2) Rust bounded read compile check; (3) focused tests + tsc; (4) commit + update session + push.
- expecting: Oracle tool call có timeout thực (default 30s từ config, clamp 1..900) trả error `timeout` thay vì treo; Rust channel read có deadline và trả exit_status -1 + stderr message.
- next_action: Viết regression test (RED) cho client-side watchdog trong oracleSqlclService.test.ts, sau đó implement fix 2 lớp (Rust bounded read + TS watchdog truyền timeoutSeconds).
- reasoning_checkpoint:
  hypothesis: "Oracle tool treo vì `ssh_exec_command` (sync Tauri command) dùng `channel.read_to_end()` không bounded; `timeoutSeconds=30` trong config là giá trị chết không bao giờ được truyền xuống. Khi SQLcl treo (prompt/chậm), invoke Promise không resolve → tool loop await mãi → turn treo. Đây là code defect (dead config + unbounded read), không phải render."
  confirming_evidence:
    - "Source ssh_service.rs:382-416: `ssh_exec_command` gọi `channel.read_to_end()` ở line 400 và stderr `.read_to_end()` line 405, không có timeout/cancel; TCP read_timeout 30s set ở connect_and_auth nhưng libssh2 channel read không bị bound bởi nó trong trường hợp channel không gửi EOF."
    - "Source oracleSqlclService.ts:17 DEFAULT timeoutSeconds=30, nhưng runSqlclScriptOverSsh (line 166-193) gọi execRemoteCommand(line192) KHÔNG truyền timeout; grep timeoutSeconds trong src chỉ thấy định nghĩa type/config + UI progress clock."
    - "Source sshService.ts:250-265: execRemoteCommand → invoke('ssh_exec_command') sync, không có Promise.race/watchdog."
    - "Source AgentActivityPanel.tsx:70,264-317: ProgressCard chỉ đếm clock + Progress bar, DEADLINE_NOTE nói 'Hết giờ → báo cáo một phần + detail: timeout' — giả định tool tự chấm dứt theo deadline, nhưng Oracle path không có deadline thực."
    - "Reference pattern: remoteExploreService.ts:351-437 đã giải bài toán tương tự bằng client-side wall-clock watchdog + cancel handle; Oracle dùng ssh_exec_command nên thiếu cả watchdog lẫn cancel."
  falsification_test: "Nếu sau khi thêm watchdog, mock execRemoteCommand trả promise không bao giờ resolve mà executeOracleQuery VẪN không trả trong thời gian timeout → hypothesis SAI (có blocking khác). Nếu bỏ timeout config mà tool vẫn treo → chưa đúng chỗ. Nếu user build Tauri thật mà Oracle vẫn treo dù watchdog đã trả error → Rust command vẫn chiếm worker thread, cần cancel path bổ sung."
  fix_rationale: "Client-side watchdog đảm bảo frontend/tool loop luôn resolve trong bounded time (fix triệu chứng treo ở UI/turn). Rust bounded read đảm bảo worker thread không bị chiếm vô hạn và trả lỗi rõ ràng (fix gốc ở tầng transport). Truyền timeoutSeconds từ config vào cả hai giúp config 30s không còn là giá trị chết. Đây là sửa nguyên nhân, không phải giảm triệu chứng bằng spinner."
  blind_spots:
    - "Không có SSH server thật trong môi trường này để reproduce hangEnd-to-end; verification dựa trên source evidence + test.mock + user build Tauri thật."
    - "Chưa đo xem Oracle tool có bị gọi nhiều lần liên tục khi treo hay chỉ 1 lần — if many, cần cancel ở coordinator level (AbortSignal)."
    - "TCP read_timeout=30s đã có; cần xác nhận libssh2 channel read thực sự không bị bound bởi nó (đây là nền tảng của hypothesis). Nếu thực ra có bound, thì nguyên nhân treo có thể là prompt SQLcl không có EOF mà vẫn có keepalive — vẫn cần watchdog."
  candidate_causes:
    - "code: unbounded `channel.read_to_end()` trong ssh_exec_command + dead `timeoutSeconds` config không được truyền xuống (nguyên nhân chính, đã xác nhận bằng source)."
    - "config: timeoutSeconds=30 được định nghĩa nhưng không consume ở execution path — config default hợp lệ nhưng bị bỏ qua (config-as-enabler)."
    - "environment: SQLcl trên remote có thể treo ở password prompt / slow query / login -L — là trigger làm lộ bug, không phải nguyên nhân khởi phát."
    - "data: SQL query chậm/lớn gây SQLcl không trả EOF đúng hạn — trigger, không phải root cause."
  and_gate: "Có — triệu chứng treo cần đồng thời (1) unbounded read/code defect VÀ (2) remote trigger (SQLcl treo). Nếu SQLcl trả bình thường thì config chết không biểu hiện. Fix phải addressing (1) để bất kể trigger nào tool vẫn bounded."

### Branch A (đã xong) — gõ chat lag

- bug_class: Bohrbug (deterministic — lag xảy ra mỗi lần gõ; Oracle chậm theo latency SSH/SQLcl).
- hypothesis: Không phải re-render storm — đo được đúng 1 render/ký tự. Chi phí nằm ở công việc đồng bộ trong mỗi render đó (TeamWorkspace dựng lại transcriptExtensions inline + AgentActivityPanel không memo, rebuild/sort/filter rows O(n²) cho pill counts) cộng với controlled-draft round-trip (setInternalValue → onDraftChange → patch → snapshot → render). Riêng Oracle: `ssh_exec_command` là Tauri command synchronous, `read_to_end` không có timeout — khi SQLcl/SSH treo, tool không bao giờ resolve và UI publish tool event dồn dập. Hai triệu chứng có chung cơ chế "work nặng trên main thread / render path", nhưng cần tách biệt.
- test: (a) Xóa probe tạm; (b) viết focused regression test đo AgentActivityPanel render count khi draft thay đổi; (c) fix memoize transcriptExtensions + AgentActivityPanel; (d) bounded timeout cho ssh_exec_command; (e) chạy focused tests.
- expecting: Giảm renders của AgentActivityPanel về 0 khi chỉ gõ; Oracle tool có timeout rõ ràng thay vì treo vô hạn.
- next_action: Viết regression test (specified oracle) chứng minh AgentActivityPanel không render lại khi props không đổi; apply React.memo; chạy focused tests.
- reasoning_checkpoint:
  hypothesis: "AgentActivityPanel thiếu React.memo nên mỗi ký tự gõ vào composer (1 render/ký tự, đã đo) kích hoạt render lại toàn bộ activity rail — rebuild + sort + O(n²) filter trên tới 200 tool-step rows, tốn ~330ms/lần (đo được trong jsdom) — gây lag và rớt ký tự. Cùng component này nhận tool-step rows từ Oracle tool (pushStep/upsertToolStep, MAX_LIVE_STEPS=200), nên khi gọi Oracle tool và snapshot.agents thay đổi liên tục, UI dội lại các render đắt đó → 'treo nặng'. Hai triệu chứng chung một bottleneck render, không phải main-thread blocking từ SSH Rust (ssh_exec_command chạy trên worker thread của Tauri)."
  confirming_evidence:
    - "Probe 1: 3 fireEvent.change → đúng 3 widget renders (1/ký tự) — loại re-render storm, cô lập chi phí nằm ở nội dung mỗi render."
    - "Probe 2: AgentActivityPanel với 200 rows (20 agents x 10 steps, khớp MAX_LIVE_STEPS=200 thực tế) mất 329ms cho một rerender dù props giống hệt; 2313ms lần đầu."
    - "Source: AgentActivityPanel export không có React.memo; rows rebuild/sort mỗi render; pill counts rows.filter() nằm trong pillIds.map() → O(n²)."
    - "Source: TeamWorkspace truyền transcriptExtensions inline (identity mới mỗi render) và activity rail mount mặc định (activityOpen=true trên Tauri); snapshot.agents cập nhật qua coordinator.subscribe mỗi tool step."
  falsification_test: "Sau khi thêm React.memo, probe đo lại phải cho 0ms/0 child render cho rerender với cùng props (hoặc gần 0); nếu lag vẫn xảy ra khi panel đóng (activityOpen=false) hoặc khi mock panel thành no-op thì hypothesis này SAI và phải tìm nguyên nhân khác."
  fix_rationale: "React.memo chặn render lại panel khi props identity không đổi — đúng vào cơ chế đã đo. Kết hợp ổn định hóa transcriptExtensions (useMemo) và pill counts (tính 1 lần) để giảm chi phí ngay cả khi props thay đổi thật (tool activity). Đây là sửa nguyên nhân (render không cần thiết), không phải giảm triệu chứng bằng debounce input."
  blind_spots:
    - "Chưa đo trong Tauri browser thật (jsdom nhanh hơn browser); chưa xác nhận user đang mở activity rail hay đã đóng."
    - "Chưa type-check/build sau fix; chưa kiểm tra AgentActivityPanel có nhận props identity ổn định không (roster地图, debugLogs, onClearLogs inline)."
    - "Oracle hang có thể có thêm nguyên nhân thứ 2 (SQLcl treo không timeout ở Rust `read_to_end`) chưa được sửa/kiểm chứng trong runtime — fix này chỉ giải quyết phần render storm do tool events."
  candidate_causes:
    - "code: AgentActivityPanel thiếu React.memo + O(n²) pill counting + transcriptExtensions inline identity (nguyên nhân chính, đã đo)."
    - "config: Activity rail mở mặc định trên Tauri (activityOpen=true) nên chi phí này luôn phát sinh — như một config/default làm lộ bug."
    - "environment: Tauri desktop rendering thật có thể làm chi phí lớn hơn jsdom; nhưng không phải nguyên nhân khởi phát."
    - "code (khác): ssh_exec_command Rust synchronous read_to_end không có timeout — có thể là nguyên nhân độc lập cho Oracle treo, cần đánh giá riêng."
  and_gate: "Có — triệu chứng Oracle 'treo nặng' có thể cần đồng thời (1) tool events làm snapshot.agents đổi liên tục VÀ (2) render đắt của activity rail; nếu chỉ có tool events mà panel đóng thì lag có thể không xảy ra. Triệu chứng gõ thì chỉ cần (1) render/ký tự + panel mở."

## Evidence

- timestamp: 2026-11-18
  checked: .planning/debug/ai-chat-input-lag.md (debug session state)
  found: Hai triệu chứng đã được xác nhận với user; status=investigating; chưa có evidence hay hypothesis nào được ghi lại.
  implication: Bắt đầu từ Phase 0 (knowledge base) và Phase 1 (evidence gathering), không cần hỏi lại symptoms.

- timestamp: 2026-11-18
  checked: .planning/debug/knowledge-base.md
  found: Không tồn tại knowledge base.
  implication: Không có known pattern từ KB; dùng debug sessions khác.

- timestamp: 2026-11-18
  checked: .planning/debug/uat-37-1-chat-lag-leader.md
  found: Session 2026-11-13 ghi nhận cùng triệu chứng "gõ phím trong ô chat nhóm rất giật lag"; root cause đã xác nhận lúc đó: "Typing re-renders transcript"; fix: memo hóa ChatMessageList props (commit e8ce7e4f). Resolution ghi rõ verification live Tauri còn pending.
  implication: Đây là known pattern candidate — regression có thể nằm ở memoization bị phá vỡ bởi commit sau đó (39ebf352 thêm scrollTrigger vào messageListExtensions).

- timestamp: 2026-11-18
  checked: src/components/ai/runtime/useTabRuntimes.ts + AIChatDrawer.tsx:2492-2496
  found: Mỗi ký tự gọi onDraftChange → tabRuntimes.patch() → notifyListeners() → setSnapshot(Object.fromEntries(globalRuntimes)) → re-render toàn AIChatDrawer. ChatInputBar cũng setInternalValue sau khi gọi update().
  implication: Có round-trip state đồng bộ mỗi ký tự; cần đo xem có gây re-render thừa không.

- timestamp: 2026-11-18 (observability experiment)
  checked: tests/components/ai/office/RenderProbe.tmp.test.tsx (temporary, mock AiChatWidget, count renders)
  found: 3 fireEvent.change → widgetRenders tăng đúng 3 (1 render/ký tự), test passed. Không có re-render storm ở host layer.
  implication: ELIMINATE giả thuyết "re-render storm". Vấn đề là chi phí của mỗi lần render đó (nặng component) hoặc blocking khác.

- timestamp: 2026-11-18
  checked: src/components/ai/office/TeamWorkspace.tsx:768-800 + 1061 + AgentActivityPanel.tsx:425-450,502-517
  found: transcriptExtensions là inline JSX (new element identity mỗi render) chứa TeamActivityIndicator, AssignmentPlanCard, PendingSkillProposals. AiChatWidget nhận {messageListExtensions} được memo nhưng {transcriptExtensions} KHÔNG memo → mọi render của TeamWorkspace tạo lại subtree. AgentActivityPanel (activity rail, mở mặc định trên Tauri) KHÔNG được React.memo; mỗi render rebuild `rows` từ snapshot.agents, sort, và tính pill counts bằng rows.filter() bên trong pillIds.map() → O(n²). Cùng lúc re-render mọi TimelineEventRow (mỗi row parse JSON args trong render).
  implication: Đây là nguồn chi phí đồng bộ trên main thread cho mỗi ký tự — giải thích lag khi gõ.

- timestamp: 2026-11-18 (observability experiment)
  checked: tests/components/ai/office/ActivityRenderProbe.tmp.test.tsx (temporary, 20 agents x 10 steps = 200 timeline rows)
  found: Render đầu 2313.5ms; rerender với props GIỐNG HỆT vẫn mất 329.0ms (jsdom, chưa kể browser thật). AgentActivityPanel không React.memo, rebuild+sort+filter rows O(n²) mỗi lần.
  implication: CONFIRM root cause triệu chứng 1 — mỗi ký tự gõ → TeamWorkspace render → widget render → AgentActivityPanel render lại toàn bộ 200 rows (~330ms/keystroke). Đây là main-thread work đồng bộ giải thích lag và mất ký tự khi gõ nhanh.

- timestamp: 2026-11-18
  checked: src-tauri/src/ssh_service.rs:382-414 (ssh_exec_command) + src/services/ai/oracleSqlclService.ts
  found: ssh_exec_command là #[tauri::command] synchronous, connect có TCP timeout 10s + read timeout 30s, nhưng `channel.read_to_end()` không có timeout riêng và không có abort path từ frontend. Oracle tool đi qua executeOracleQuery → runSqlclScriptOverSsh → execRemoteCommand → invoke('ssh_exec_command'). Khi SQLcl treo (VD SQL chậm / prompt password / login -L chờ), lệnh không resolve; tool event loop không kết thúc và UI có thể nhận nhiều tool events.
  implication: Giải thích "app treo nặng" khi gọi Oracle tool — khác cơ chế với lag khi gõ nhưng cùng class "expensive/synchronous work on main path". Cần xác nhận thêm trước khi sửa Rust.

- timestamp: 2026-11-18 (Branch B — user feedback)
  checked: checkpoint_response từ user sau fix render
  found: "typing đã mượt, nhưng oracle tool call vẫn gây treo app" → Symptom 1 CONFIRMED FIXED trên Tauri thật. Symptom 2 persists, độc lập với render fix.
  implication: Mở branch điều tra mới, không đụng lại code render đã xác nhận ổn. Focus vào blind spot ssh_exec_command.

- timestamp: 2026-11-18 (source trace, full read)
  checked: src-tauri/src/ssh_service.rs (full 579 lines), src/services/ai/oracleSqlclService.ts (full 535 lines), src/services/sshService.ts:250-330, AgentActivityPanel.tsx:264-319 + DEADLINE_NOTE line 70
  found: (1) ssh_exec_command line 400 `channel.read_to_end(&mut stdout_buf)` + line 405 stderr read_to_end — không có timeout/cancel; (2) DEFAULT_ORACLE_CONFIG.timeoutSeconds=30 (line17) nhưng runSqlclScriptOverSsh line 192 gọi execRemoteCommand KHÔNG truyền timeout — grep 'timeoutSeconds' trong src chỉ thấy type/config/UI clock, không có execution usage; (3) sshService.execRemoteCommand line 250-265 invoke sync không watchdog/Promise.race; (4) AgentActivityPanel ProgressCard chỉ là clock+Progress bar, DEADLINE_NOTE='Hết giờ → báo cáo một phần + detail: timeout' — giả định tool tự dừng theo deadline nhưng Oracle path không có deadline thực; (5) có sẵn reference pattern ở remoteExploreService.ts:351-437 dùng wall-clock watchdog + cancel handle.
  implication: ROOT CAUSE xác nhận = dead config + unbounded read. Thiết kế fix 2 lớp: client-side watchdog (testable) + Rust bounded read (transport). Truyền timeoutSeconds từ config xuống cả hai.

- timestamp: 2026-11-18 (build/test recon)
  checked: package.json scripts, src-tauri/Cargo.toml (ssh2 0.9.6 vendored-openssl), src/services/ai/__tests__/oracleSqlclService.test.ts, src/types/oracleSqlcl.ts
  found: Có sẵn oracle service test với mock sshService.execRemoteCommand (pattern vi.spyOn). OracleToolConfig.timeoutSeconds là optional number. Có cargo test setup trong src-tauri nhưng không có SSH server thật để test bounded read end-to-end. Không chạy full suite.
  implication: Viết regression test TS với fake timers + never-resolving mock; verify Rust bằng cargo check; focused vitest cho oracle service only.

- timestamp: 2026-11-18 (fix + verification)
  checked: regression tests (RED→GREEN), adjacent tests, tsc, cargo check attempt
  found: RED — 2 tests mới fail (timeout test hung đến vitest 15s timeout; pass-through test sai arg count vì chưa truyền timeout). GREEN sau fix — 14/14 oracle tests + 5/5 sshService tests = 19/19 pass; tsc exit 0. cargo check KHÔNG chạy được: thiếu bit-vec 0.8.0, `cargo check --offline` fail, download từ crates.io bị sandbox chặn (trả HTML). Rust fix đã được đơn giản hóa để chỉ dùng std API (mpsc::recv_timeout, thread::Builder, Duration) + pattern move channel vào thread đã có trong ssh_service.rs:ssh_exec_stream (chứng minh compile được trước đây).
  implication: Guardrail signals 1/3/4/5 pass; signal 2 (mutation) skipped (no Stryker); Rust compile unverified → phải rely on user build Tauri thật để xác nhận. Human-verify checkpoint cần thiết.

## Eliminated

(none yet)

## Resolution

- root_cause: |
    Triệu chứng 1 (gõ lag/rớt ký tự): AgentActivityPanel (activity rail, mở mặc định trên Tauri) không được React.memo. Mỗi ký tự gõ → TeamWorkspace render (1 render/ký tự, đã đo) → render lại panel → rebuild + sort + O(n²) pill-count trên tới 200 tool-step rows (MAX_LIVE_STEPS=200), tốn ~329ms/lần trong jsdom. Thêm vào đó transcriptExtensions inline và roster/callback inline trong TeamWorkspace tạo identity mới mỗi render, phá vỡ memo của subtree.
    Triệu chứng 2 (Oracle tool treo nặng): cùng component AgentActivityPanel nhận tool-step rows từ Oracle (pushStep/upsertToolStep) qua coordinator.subscribe; snapshot.agents đổi liên tục trong lúc tool chạy → dội các render đắt đó. Đây là phần chung của hai triệu chứng. (Rust ssh_exec_command synchronous read_to_end không timeout là rủi ro độc lập đã ghi nhận nhưng chưa sửa/khẳng định trong fix này.)
- fix: |
    1. Wrap AgentActivityPanel bằng React.memo.
    2. Ổn định props trong TeamWorkspace: memo hóa activityRoster, clearDebugLogs, closeActivity; memo hóa transcriptExtensions JSX.
    3. Tối ưu pill counts O(n²) → O(n) bằng Map đếm 1 lần trong AgentActivityPanel.
- verification: |
    - Regression test mới (AgentActivityPanel.test.tsx, oracle=specified): RED trước fix (4 Date.parse calls thay vì 2), GREEN sau fix; đổi props thật vẫn rebuild đúng.
    - Đo lường định lượng: identical-props rerender 200 rows giảm 329.0ms → 1.2ms (~270x).
    - Focused tests: 17 passed (AgentActivityPanel, TeamWorkspaceSendScroll, TeamWorkspaceActivityRail).
    - npx tsc --noEmit: sạch.
- files_changed: [src/components/ai/office/AgentActivityPanel.tsx, src/components/ai/office/TeamWorkspace.tsx, tests/components/ai/office/AgentActivityPanel.test.tsx]

### Branch B — Oracle tool treo (2026-11-18)

- root_cause: |
    Đường gọi Oracle tool dùng `execRemoteCommand` → Tauri command `ssh_exec_command` (sync) với `channel.read_to_end()` KHÔNG có deadline và KHÔNG có cancel path. `OracleToolConfig.timeoutSeconds: 30` chỉ là config chết — `runSqlclScriptOverSsh` không bao giờ truyền nó xuống, và grep toàn src chỉ thấy timeoutSeconds ở definition/config/UI progress clock. Khi SQLcl trên remote treo (password prompt / slow query / login -L chờ), channel không gửi EOF → `invoke()` Promise không resolve → `executeOracleQuery` không trả → tool/turn treo. UI ProgressCard chỉ là clock hiển thị (DEADLINE_NOTE giả định tool tự dừng theo deadline) nên không cứu được.
- fix: |
    1. `oracleSqlclService.ts`: thêm `clampOracleTimeoutSeconds` (5..120, default 30, khớp UI); `runSqlclScriptOverSsh` truyền timeout xuống transport VÀ bọc bằng client-side wall-clock watchdog (`Promise.race` + `setTimeout`/`clearTimeout`) — đảm bảo tool luôn resolve trong bounded time dù remote không đóng channel.
    2. `sshService.ts`: `execRemoteCommand` nhận optional `timeoutSeconds` và truyền vào invoke `ssh_exec_command`.
    3. `ssh_service.rs`: `ssh_exec_command` nhận `timeout_seconds: Option<u64>` (clamp 5..120, default 30); read chạy trên helper thread, command đợi bằng `mpsc::recv_timeout` — trả CommandOutput với `exit_status=-1` + stderr "Oracle SQLcl hết thời gian chờ (timeout Ns)." khi hết hạn, giải phóng Tauri worker thread.
- oracle_type: specified — contract "bounded tool call returns structured timeout error", test assert `{success:false, error: /timeout/}` khi transport không bao giờ resolve.
- boundary_neighbors: clamp 5..120 test qua `clampOracleTimeoutSeconds` (default 30 cho invalid, clamp ở cả 2 đầu); timeout test dùng 5s (min) với fake timers.
- verification:
  target_test: { result: pass, detail: "2 tests RED trước fix (1 hung → vitest 15s timeout, 1 assert sai arg list), GREEN sau: 14/14 oracle tests pass" }
  mutation_check: { result: skipped, reason: "Stryker không được cấu hình trong project (không có stryker.conf.* / package script)" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, detail: "diff chỉ thêm logic timeout/watchdog; không xóa branch hay assert" }
  adjacent_tests: { result: pass, suites_run: [src/services/ai/__tests__/oracleSqlclService.test.ts, src/services/__tests__/sshService.test.ts], detail: "19/19 pass" }
  revert_and_reconfirm: { result: pass, bug_returned_on_pre_fix: true, fixed_on_reapply: true, detail: "pre-fix test hung 15s; post-fix resolves with structured timeout error" }
  rust_compile: { result: unverified, reason: "cargo check blocked: missing bit-vec 0.8.0 crate, network sandbox chặn crates.io download; code dùng std API cơ bản (mpsc/recv_timeout/thread::Builder) và pattern move channel vào thread đã có trong ssh_service.rs:ssh_exec_stream" }
  tsc: { result: pass, detail: "npx tsc --noEmit exit 0" }
  guardrail_verdict: accepted
- files_changed_branch_b: [src/services/ai/oracleSqlclService.ts, src/services/sshService.ts, src/services/ai/__tests__/oracleSqlclService.test.ts, src-tauri/src/ssh_service.rs]
- human_verify: pending — user cần build Tauri từ remote và thử lại Oracle tool; nếu SQLcl treo thì tool phải trả lỗi timeout sau 30s thay vì treo app.
