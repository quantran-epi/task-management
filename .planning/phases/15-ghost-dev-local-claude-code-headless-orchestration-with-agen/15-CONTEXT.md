# Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 15 cung cấp hệ thống điều phối tiến trình AI cục bộ "Ghost Dev" trên nền tảng Tauri Desktop, cho phép chạy nền Claude Code CLI chế độ Headless (`stream-json`) theo kiến trúc phân tầng Hierarchical Multi-Agent (Master & Workers), giám sát tiến độ trên trang trung tâm "Agent Control", và kiểm duyệt trực quan thay đổi mã nguồn qua Live Git Diff Reviewer.

Phạm vi phase bao gồm:
1. **Hierarchical Multi-Agent Engine**: Quản lý phiên làm việc theo từng Task (TaskAgentSession), hỗ trợ 1 Master/Lead Agent (planner) phân rã công việc và điều phối tối đa 2 Worker Agents thực thi song song với các model LLM khác nhau (ví dụ: Opus cho Master, Haiku/Sonnet cho Worker).
2. **Git Worktree Isolation**: Tự động tạo worktree và branch riêng (`pm-agent/task-<id>`) cho mỗi task để cách ly hoàn toàn thay đổi mã nguồn, không làm ảnh hưởng working tree hiện tại của người dùng.
3. **Agent Control Center**: Trang giao diện chuyên dụng (`/agents` trên Main Sidebar) bố cục 3 cột (Danh sách Agent - Terminal Stream Log/Chat - Live Git Diff Viewer).
4. **Live Git Diff Reviewer**: Trình so sánh mã nguồn trực quan (chuyển đổi Side-by-side / Unified), hỗ trợ duyệt/hủy theo từng file hoặc toàn bộ (`Accept All` / `Revert All`), và cho phép bấm trực tiếp vào dòng code trên Diff để gửi comment phản hồi yêu cầu Agent sửa lại.
5. **Human-in-the-Loop & Safety**: Tự động duyệt thao tác đọc/sửa file trong repo; hiển thị modal xin quyền khi chạy lệnh Shell ngoài Whitelist; tự động kill an toàn toàn bộ process tree khi thoát ứng dụng mà vẫn giữ worktree để resume.

Phase không bao gồm việc giả lập thiết bị đầu cuối PTY (xterm.js ANSI), không hỗ trợ trên nền tảng Web/PWA (tính năng độc quyền của Tauri Desktop), và không tự động push lên remote repository khi chưa có lệnh tường minh.

</domain>

<decisions>
## Implementation Decisions

### UI & Navigation
- **D-01:** Bổ sung mục điều hướng **'Agent Control'** (kèm Badge hiển thị số lượng agent đang chạy) trực tiếp trên Sidebar Navigation chính (`src/components/shell/Navigation.tsx`), gắn với route `agents`.
- **D-02:** Bố cục giao diện bên trong trang Agent Control là **Split Pane 3-Column**: Cột trái danh sách Task Sessions/Agents (Running, Paused/Awaiting, Done, Error); Cột giữa là Terminal Stream Log kèm ô Chat Prompt 2 chiều; Cột phải là Live Git Diff Viewer.
- **D-03:** Khi người dùng bấm "Run Ghost Dev" từ Task (Card, Table hoặc Task Drawer), ứng dụng hiển thị Toast thông báo và **ở lại trang hiện tại** (Toast kèm nút hành động "Xem trong Agent Control"), không gây gián đoạn công việc đang làm. Nếu task có nhiều liên kết thư mục local, hiển thị modal cho người dùng chọn thư mục làm việc (CWD).
- **D-04:** Cơ chế thông báo nền: Tích hợp đồng thời **Sidebar Badge counter** và **Desktop OS Notification** (tận dụng `tauri-plugin-notification` / blur notification vừa hoàn thiện) khi Agent hoàn thành công việc hoặc cần người dùng cấp quyền chạy lệnh Shell.

### Execution & Hierarchical Multi-Agent (Master-Worker)
- **D-05:** Thiết kế kiến trúc Multi-Agent theo mô hình **Hierarchical Master-Worker** do PlannerMate quản lý trực tiếp: Mỗi Task khởi tạo 1 Master Agent (vai trò Lead/Architect/Planner, dùng model cao cấp như Claude Opus hoặc Sonnet) và có thể spawn tối đa 2 Worker Agents chạy song song (vai trò Coder/Tester, dùng model tốc độ cao/tiết kiệm như Claude Haiku hoặc Sonnet).
- **D-06:** Cơ chế giao tiếp Master - Worker thông qua **Rust-Managed Tool Call**: Master Agent được cung cấp MCP tool `dispatch_subtask(role, task_prompt, model)`; Rust backend nhận lệnh, spawn Worker process độc lập trong worktree, đợi Worker hoàn tất và trả kết quả có cấu trúc về cho Master tiếp tục luồng công việc.
- **D-07:** Mỗi Task được cô lập bằng **Git Worktree Isolation**: Rust backend tự động tạo branch `pm-agent/task-<id>` và thư mục worktree riêng trong `.plannermate/worktrees/task-<id>`. Mọi thao tác sửa file, chạy build và test của Master và Workers đều diễn ra trong worktree này.
- **D-08:** Giới hạn tải (Concurrency Cap): Mặc định cho phép tối đa 1 Master + 2 Workers song song cho 1 Task. Toàn bộ ứng dụng giới hạn tối đa 6 process Claude chạy đồng thời; các task kích hoạt vượt quá giới hạn sẽ chuyển sang trạng thái chờ (Pending Queue).
- **D-09:** Cấu hình Model linh hoạt: Cung cấp bảng cấu hình Default Models cho Master và Workers trong Settings (`SettingsView`), đồng thời hiển thị modal xác nhận/chọn nhanh Model trước khi bấm chạy Ghost Dev.
- **D-10:** Xử lý hủy tác vụ (Stop Action): Khi người dùng bấm "Stop Agent", Rust backend thực hiện **Instant Hard Kill** toàn bộ Process Group (Master + tất cả Worker con đang chạy) qua tín hiệu SIGTERM/SIGKILL và dọn sạch buffer đường ống pipe.

### Live Git Diff Reviewer UX
- **D-11:** Trình xem Diff hỗ trợ linh hoạt cả hai chế độ **Side-by-side** (2 cột so sánh) và **Unified Diff** (1 cột gộp dòng có ký hiệu +/-) với nút toggle chuyển đổi nhanh trên header của Diff Viewer.
- **D-12:** Hỗ trợ đầy đủ các cấp độ kiểm duyệt: Cho phép người dùng duyệt (Accept) hoặc hủy bỏ (Revert) theo **từng file đơn lẻ**, đồng thời cung cấp hai nút tổng thể **'Accept All'** và **'Revert All'** cho toàn bộ task.
- **D-13:** Tính năng **Click to Comment on Diff (Inline Feedback)**: Người dùng có thể bấm trực tiếp vào bất kỳ dòng code nào trên Diff để gõ comment feedback. Hệ thống sẽ tự động đóng gói prompt kèm ngữ cảnh chính xác `file_path:line_number` và gửi thẳng vào Master Agent để yêu cầu sửa tiếp.
- **D-14:** Hành vi khi bấm 'Accept All': Hệ thống tự động tạo Git Commit trên worktree branch với commit message do AI sinh ra, sau đó hiển thị nút hành động "Merge to Current Branch" hoặc cho phép sao chép tên branch để merge thủ công.

### Permission & Safety
- **D-15:** Chính sách cấp quyền **Auto Edit, Confirm Shell**: Tự động cho phép các thao tác đọc và chỉnh sửa file trong phạm vi Git Worktree của task; chỉ hiển thị banner/modal xin quyền (Approve/Deny) khi Agent yêu cầu chạy các lệnh Shell/Bash.
- **D-16:** Danh sách **Whitelist Safe Commands**: Cho phép chạy tự động không cần hỏi đối với các lệnh an toàn được định nghĩa trong whitelist (ví dụ: `git status`, `git diff`, `npm test`, `cargo check`, `npx vitest`). Các lệnh can thiệp sâu (`rm`, `git push`, custom scripts) bắt buộc phải có sự xác nhận của người dùng.
- **D-17:** Chính sách Timeout: Khi Agent đang chờ người dùng cấp quyền chạy lệnh Shell mà người dùng không có mặt tại máy, hệ thống **Pause vô thời hạn** (giữ nguyên tiến trình và trạng thái chờ) cho đến khi người dùng quay lại xử lý, không tự ý hủy lệnh.
- **D-18:** Xử lý thoát ứng dụng đột ngột (App Exit / Crash Protection): Bắt sự kiện `RunEvent::ExitRequested` tại Rust backend để **Kill sạch toàn bộ child processes**, lưu trạng thái 'Interrupted' vào cơ sở dữ liệu SQLite, và **giữ nguyên Git Worktree** trên ổ cứng để người dùng có thể khôi phục và tiếp tục (Resume) phiên làm việc trong lần mở app sau.

### Claude's Discretion
- Cơ chế batching IPC events: Rust backend gom dữ liệu chunk `stream-json` và gửi lên React theo chu kỳ 50ms-100ms để đảm bảo 60 FPS, không gây nghẽn Webview.
- Thư viện render Diff: Tận dụng Monaco Editor Diff (`@monaco-editor/react`) hoặc thư viện Diff gọn nhẹ tương thích Ant Design theme.
- Cấu trúc thư mục Worktree: Lưu trữ dưới thư mục tạm an toàn bên trong repo hoặc cache OS.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Roadmap & Requirements
- `.planning/ROADMAP.md` §Phase 15 — Mục tiêu phase, tiêu chí thành công và kế hoạch các plans
- `.planning/REQUIREMENTS.md` — Các ràng buộc kỹ thuật cốt lõi của PlannerMate (Tauri, SQLite, offline-first)

### Codebase Infrastructure & Tauri IPC
- `src-tauri/src/lib.rs` — Khai báo các module proxy, command handlers và lifecycle của Tauri app
- `src-tauri/src/jira_proxy.rs` — Tham chiếu các command chạy lệnh hệ thống hiện tại (`launch_claude_terminal`, `read_local_file_slice`, `open_local_path`)
- `src/components/shell/AppShell.tsx` — Layout chính, header, navigation routes và cơ chế đăng ký view
- `src/components/shell/Navigation.tsx` — Danh sách các menu routes chính của Sidebar
- `src/types/navigation.ts` — Định nghĩa enum và type của AppRoute

### Desktop Notifications & UI Feedback
- `src/components/ai/AIChatDrawer.tsx` — Triển khai gọi desktop notification khi blur và cơ chế stream phản hồi
- `src/hooks/useDesktopNotification.ts` — Hook phát thông báo desktop qua Tauri plugin notification

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/jira_proxy.rs`: Hàm `clean_file_uri_path`, `resolve_claude_working_dir` và các logic kiểm tra an toàn đường dẫn file.
- `src/hooks/useDesktopNotification.ts`: Hook gửi notification ra ngoài hệ điều hành khi agent hoàn thành hoặc cần user approve.
- `src/components/common/AriaLiveRegion.tsx`: Thông báo trợ năng trạng thái agent cho screen reader.

### Established Patterns
- **Tauri Command Invocation:** Sử dụng `tauriInvoke<T>('command_name', { ... })` an toàn, bọc qua try/catch và trả về Result chuẩn.
- **Ant Design Split & Layouts:** Sử dụng Flex, Space, Splitter (Ant Design 6) để chia cột linh hoạt.
- **SQLite & Local Storage Settings:** Sử dụng `useLocalSqlitePersistence` và `localStorage` tiền tố `planner:*` để lưu trữ layout, trạng thái chọn model.

### Integration Points
- `src/types/navigation.ts`: Bổ sung route `'agents'` vào `AppRoute`.
- `src/components/shell/Navigation.tsx`: Thêm mục menu 'Agent Control' với icon `RobotOutlined` hoặc `DeploymentUnitOutlined`.
- `src/components/shell/AppShell.tsx`: Đăng ký render view mới `AgentControlView` khi `currentRoute === 'agents'`.
- `src-tauri/src/`: Tạo module Rust mới `agent_manager.rs` quản lý pool process, pipe I/O, tokio task và git worktree.
- `src/components/tasks/`: Thêm nút bấm "Ghost Dev" vào Task Card / Task Table / Task Drawer để kích hoạt session cho task.

</code_context>

<specifics>
## Specific Ideas
- **Cây tiến trình (Hierarchical Process Tree):** Hiển thị trực quan Lead Agent (Master) ở trên, bên dưới thụt đầu dòng các Worker Agents đang chạy, có badge model tương ứng (Opus / Sonnet / Haiku).
- **Inline Feedback on Diff:** Cho phép bấm vào bất kỳ dòng code nào trên Diff để gõ comment feedback, hệ thống tự động sinh prompt kèm ngữ cảnh `file_path:line_number` gửi thẳng vào Master Agent.
- **Toast Launch:** Bấm "Run Ghost Dev" từ task chỉ hiện Toast thông báo kèm nút "Xem trong Agent Control", không nhảy trang để người dùng tiếp tục làm việc bình thường.

</specifics>

<deferred>
## Deferred Ideas

- **Remote Cloud Agent Execution:** Chạy agent trên server đám mây từ xa (hiện tại chỉ tập trung 100% vào local CLI trên máy người dùng).
- **Voice-Controlled Agent Prompting:** Ra lệnh cho Agent bằng giọng nói qua micro của máy tính.
- **Auto-PR Creation on GitHub/GitLab:** Tự động dùng `gh pr create` đẩy PR lên remote repository (hiện tại chỉ dừng ở commit và merge local).

</deferred>

---

*Phase: 15-Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer*
*Context gathered: 2026-10-05*