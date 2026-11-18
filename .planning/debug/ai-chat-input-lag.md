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
