# Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer - Research

**Researched:** 2026-10-05
**Domain:** Local Multi-Agent Orchestration, Claude Code Headless CLI, Git Worktree Isolation, Tauri IPC Process Management, Live Diff Reviewer
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### UI & Navigation
- **D-01:** Bổ sung mục điều hướng **'Agent Control'** (kèm Badge hiển thị số lượng agent đang chạy) trực tiếp trên Sidebar Navigation chính (`src/components/shell/Navigation.tsx`), gắn với route `agents`.
- **D-02:** Bố cục giao diện bên trong trang Agent Control là **Split Pane 3-Column**: Cột trái danh sách Task Sessions/Agents (Running, Paused/Awaiting, Done, Error); Cột giữa là Terminal Stream Log kèm ô Chat Prompt 2 chiều; Cột phải là Live Git Diff Viewer.
- **D-03:** Khi người dùng bấm "Run Ghost Dev" từ Task (Card, Table hoặc Task Drawer), ứng dụng hiển thị Toast thông báo và **ở lại trang hiện tại** (Toast kèm nút hành động "Xem trong Agent Control"), không gây gián đoạn công việc đang làm. Nếu task có nhiều liên kết thư mục local, hiển thị modal cho người dùng chọn thư mục làm việc (CWD).
- **D-04:** Cơ chế thông báo nền: Tích hợp đồng thời **Sidebar Badge counter** và **Desktop OS Notification** (tận dụng `tauri-plugin-notification` / blur notification vừa hoàn thiện) khi Agent hoàn thành công việc hoặc cần người dùng cấp quyền chạy lệnh Shell.

#### Execution & Hierarchical Multi-Agent (Master-Worker)
- **D-05:** Thiết kế kiến trúc Multi-Agent theo mô hình **Hierarchical Master-Worker** do PlannerMate quản lý trực tiếp: Mỗi Task khởi tạo 1 Master Agent (vai trò Lead/Architect/Planner, dùng model cao cấp như Claude Opus hoặc Sonnet) và có thể spawn tối đa 2 Worker Agents chạy song song (vai trò Coder/Tester, dùng model tốc độ cao/tiết kiệm như Claude Haiku hoặc Sonnet).
- **D-06:** Cơ chế giao tiếp Master - Worker thông qua **Rust-Managed Tool Call**: Master Agent được cung cấp MCP tool `dispatch_subtask(role, task_prompt, model)`; Rust backend nhận lệnh, spawn Worker process độc lập trong worktree, đợi Worker hoàn tất và trả kết quả có cấu trúc về cho Master tiếp tục luồng công việc.
- **D-07:** Mỗi Task được cô lập bằng **Git Worktree Isolation**: Rust backend tự động tạo branch `pm-agent/task-<id>` và thư mục worktree riêng trong `.plannermate/worktrees/task-<id>`. Mọi thao tác sửa file, chạy build và test của Master và Workers đều diễn ra trong worktree này.
- **D-08:** Giới hạn tải (Concurrency Cap): Mặc định cho phép tối đa 1 Master + 2 Workers song song cho 1 Task. Toàn bộ ứng dụng giới hạn tối đa 6 process Claude chạy đồng thời; các task kích hoạt vượt quá giới hạn sẽ chuyển sang trạng thái chờ (Pending Queue).
- **D-09:** Cấu hình Model linh hoạt: Cung cấp bảng cấu hình Default Models cho Master và Workers trong Settings (`SettingsView`), đồng thời hiển thị modal xác nhận/chọn nhanh Model trước khi bấm chạy Ghost Dev.
- **D-10:** Xử lý hủy tác vụ (Stop Action): Khi người dùng bấm "Stop Agent", Rust backend thực hiện **Instant Hard Kill** toàn bộ Process Group (Master + tất cả Worker con đang chạy) qua tín hiệu SIGTERM/SIGKILL và dọn sạch buffer đường ống pipe.

#### Live Git Diff Reviewer UX
- **D-11:** Trình xem Diff hỗ trợ linh hoạt cả hai chế độ **Side-by-side** (2 cột so sánh) và **Unified Diff** (1 cột gộp dòng có ký hiệu +/-) với nút toggle chuyển đổi nhanh trên header của Diff Viewer.
- **D-12:** Hỗ trợ đầy đủ các cấp độ kiểm duyệt: Cho phép người dùng duyệt (Accept) hoặc hủy bỏ (Revert) theo **từng file đơn lẻ**, đồng thời cung cấp hai nút tổng thể **'Accept All'** và **'Revert All'** cho toàn bộ task.
- **D-13:** Tính năng **Click to Comment on Diff (Inline Feedback)**: Người dùng có thể bấm trực tiếp vào bất kỳ dòng code nào trên Diff để gõ comment feedback. Hệ thống sẽ tự động đóng gói prompt kèm ngữ cảnh chính xác `file_path:line_number` và gửi thẳng vào Master Agent để yêu cầu sửa tiếp.
- **D-14:** Hành vi khi bấm 'Accept All': Hệ thống tự động tạo Git Commit trên worktree branch với commit message do AI sinh ra, sau đó hiển thị nút hành động "Merge to Current Branch" hoặc cho phép sao chép tên branch để merge thủ công.

#### Permission & Safety
- **D-15:** Chính sách cấp quyền **Auto Edit, Confirm Shell**: Tự động cho phép các thao tác đọc và chỉnh sửa file trong phạm vi Git Worktree của task; chỉ hiển thị banner/modal xin quyền (Approve/Deny) khi Agent yêu cầu chạy các lệnh Shell/Bash.
- **D-16:** Danh sách **Whitelist Safe Commands**: Cho phép chạy tự động không cần hỏi đối với các lệnh an toàn được định nghĩa trong whitelist (ví dụ: `git status`, `git diff`, `npm test`, `cargo check`, `npx vitest`). Các lệnh can thiệp sâu (`rm`, `git push`, custom scripts) bắt buộc phải có sự xác nhận của người dùng.
- **D-17:** Chính sách Timeout: Khi Agent đang chờ người dùng cấp quyền chạy lệnh Shell mà người dùng không có mặt tại máy, hệ thống **Pause vô thời hạn** (giữ nguyên tiến trình và trạng thái chờ) cho đến khi người dùng quay lại xử lý, không tự ý hủy lệnh.
- **D-18:** Xử lý thoát ứng dụng đột ngột (App Exit / Crash Protection): Bắt sự kiện `RunEvent::ExitRequested` tại Rust backend để **Kill sạch toàn bộ child processes**, lưu trạng thái 'Interrupted' vào cơ sở dữ liệu SQLite, và **giữ nguyên Git Worktree** trên ổ cứng để người dùng có thể khôi phục và tiếp tục (Resume) phiên làm việc trong lần mở app sau.

### Claude's Discretion
- Cơ chế batching IPC events: Rust backend gom dữ liệu chunk `stream-json` và gửi lên React theo chu kỳ 50ms-100ms để đảm bảo 60 FPS, không gây nghẽn Webview.
- Thư viện render Diff: Tận dụng Monaco Editor Diff (`@monaco-editor/react`) hoặc trình render diff DOM chuẩn Ant Design không thêm phụ thuộc nặng.
- Cấu trúc thư mục Worktree: Lưu trữ dưới thư mục `.plannermate/worktrees/task-<id>` bên trong repo mục tiêu hoặc trong local data directory của PlannerMate.

### Deferred Ideas (OUT OF SCOPE)
- Remote Cloud Agent Execution (chạy agent trên cloud).
- Voice-Controlled Agent Prompting (điều khiển qua microphone).
- Auto-PR Creation on GitHub/GitLab (tự động mở PR qua API).
</user_constraints>

## Summary

Phase 15 biến PlannerMate thành trung tâm điều phối mã nguồn tự động cục bộ ("Ghost Dev") bằng cách tích hợp trực tiếp Claude Code CLI Headless qua đường ống `stream-json` hai chiều do Rust backend quản lý. Mô hình Hierarchical Master-Worker cho phép mỗi Task sở hữu một Master Agent chịu trách nhiệm lập kế hoạch và phân tách subtask cho tối đa 2 Worker Agents thực thi song song trong môi trường cô lập tuyệt đối bằng `git worktree`.

Kiến trúc UI chia 3 cột tương tác theo hợp đồng `15-UI-SPEC.md` với Ant Design `Splitter`, cung cấp giao diện quản lý phiên, stream log thời gian thực, và Live Git Diff Reviewer (hỗ trợ Side-by-side / Unified, Accept/Revert theo từng file hoặc toàn bộ, cùng tính năng Click-to-Comment trực tiếp trên dòng code của diff). Hệ thống bảo đảm tính an toàn cao nhất thông qua chính sách Auto-Edit nhưng Confirm-Shell (với whitelist các lệnh build/test an toàn), ngăn rò rỉ tiến trình bằng PID group management trong Rust, và bảo toàn worktree khi ứng dụng bị tắt đột ngột.

**Primary recommendation:** Triển khai module Rust `agent_manager.rs` sử dụng Tokio asynchronous process execution cho Claude Code CLI (`--output-format stream-json --input-format stream-json --permission-mode acceptEdits`), quản lý vòng đời Git worktree qua lệnh CLI git cục bộ, và render giao diện 3 cột bằng Ant Design 6 `Splitter` kết hợp parser diff tùy biến native siêu nhẹ thay vì cài đặt các gói diff cồng kềnh.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Headless CLI Process Management | Rust Backend (Tauri) | OS Process Group | Rust nắm quyền kiểm soát process group, stdin/stdout/stderr pipes, bắt tín hiệu kill và dọn dẹp tiến trình an toàn khi thoát app. |
| Git Worktree Lifecycle | Rust Backend (Tauri) | Git CLI / Worktree Filesystem | Khởi tạo branch `pm-agent/task-<id>`, gắn worktree vào `.plannermate/worktrees/task-<id>`, truy vấn diff và xử lý commit/merge. |
| Stream Event Batching & IPC | Rust Backend (Tauri) | React (WebView) | Rust gom chunk 50ms-100ms và emit `agent:stream-event` để tránh flood WebView IPC; React cập nhật live log và terminal view. |
| Session State & Queue Persistence | Rust Backend (SQLite) / Dexie | React Context / Store | Trạng thái phiên (Running, Paused, AwaitingApproval, Done, Interrupted) lưu bền vững vào SQLite/IndexedDB để hỗ trợ khôi phục sau crash. |
| Agent Control 3-Column Center | React (Browser) | Ant Design 6 | Layout Splitter chia 3 pane, quản lý active session, chat prompt 2 chiều và danh sách file thay đổi. |
| Live Git Diff Reviewer & Inline Comment | React (Browser) | Rust Backend (git diff command) | Rust cung cấp raw unified diff text; React parse ra hunks/lines, hiển thị Side-by-side hoặc Unified, và xử lý click chọn dòng gõ comment feedback. |
| Shell Permission Gate & Whitelist | Rust Backend (Tauri) | React Modal Banner | Rust kiểm tra whitelist; nếu ngoài whitelist thì giữ process chờ stdin, gửi IPC request lên UI hiển thị modal xác nhận. |
| Desktop OS Notification | Rust Plugin (`tauri-plugin-notification`) | Web Notification Fallback | Báo hiệu ra ngoài OS khi Agent hoàn thành tác vụ hoặc cần người dùng cấp quyền chạy shell. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tauri 2 | 2.2.0 | Native Desktop Engine & IPC | [VERIFIED: Cargo.toml] Đang được dùng trong dự án; cung cấp quyền truy cập hệ điều hành, IPC async, command handlers và window events. |
| Tokio | 1.x (trong Cargo.lock) | Rust Async Runtime | [VERIFIED: Cargo.lock] Quản lý process streams không đồng bộ, reading line buffers, timers batching và channel communication. |
| Ant Design | 6.6.5 | UI Components & Layout | [VERIFIED: package.json] Đã cài đặt; Ant Design 6 có sẵn `Splitter` cho 3 cột resizable, `Badge`, `Tag`, `Modal`, `Button`, `Table`, `Tabs`. |
| Claude Code CLI | 2.1.x (Headless) | Local AI Coding Agent Engine | [VERIFIED: Local environment & CLI] Có sẵn cờ `--output-format stream-json --input-format stream-json --permission-mode acceptEdits`. |
| Git CLI | >= 2.20 | Worktree & Diff Engine | [VERIFIED: Local environment] Tính năng `git worktree add/remove/list`, `git diff`, `git commit` có sẵn trên mọi máy trạm lập trình viên. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ant-design/icons | 6.3.4 | Navigation & Status Icons | [VERIFIED: package.json] Dùng các icon `RobotOutlined`, `DeploymentUnitOutlined`, `BranchesOutlined`, `DiffOutlined`, `PlayCircleOutlined`, `StopOutlined`. |
| tauri-plugin-notification | 2.5.0 | Native OS Alerts | [VERIFIED: package.json & Cargo.toml] Bắn thông báo desktop khi agent hoàn thành hoặc yêu cầu cấp quyền. |
| dayjs | 1.11.23 | Timestamps & Durations | [VERIFIED: package.json] Tính thời gian chạy của Agent, định dạng thời điểm tạo phiên. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Lightweight Diff Parser | `@monaco-editor/react` (4.7.0) | Monaco nặng hơn 30MB bundle, khó tùy biến click-to-comment inline theo nhu cầu chính xác của giao diện Ant Design. Native line parser chỉ tốn ~150 dòng code TypeScript. |
| Native Git CLI via Command | `git2` (libgit2 Rust crate) | `git2` yêu cầu build C-bindings phức tạp trên Windows/macOS, dễ lỗi toolchain; Git CLI native tận dụng cấu hình SSH, GPG, user config có sẵn của lập trình viên và hỗ trợ đầy đủ `git worktree` không phụ thuộc thư viện thứ ba. |
| Raw Pipe JSON Protocol | PTY library (`portable-pty`) | PTY xử lý escape ANSI code phức tạp, khó phân tách dữ liệu có cấu trúc. Claude Code đã cung cấp sẵn `stream-json`, cho phép trao đổi JSON thuần nhất và ổn định. |

## Package Legitimacy Audit

Tất cả các thành phần cốt lõi của Phase 15 đều **tận dụng dependencies đã cài đặt sẵn trong codebase** (`antd`, `@ant-design/icons`, `dayjs`, `tauri`, `tauri-plugin-notification`, `rusqlite`, `tokio`). Không cần cài đặt thêm gói npm bên ngoài mới nào [VERIFIED: codebase & node_modules].

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| antd | npm | > 9 yrs | 4.5M/wk | github.com/ant-design/ant-design | [OK] | Approved (Already in package.json) |
| @ant-design/icons | npm | > 6 yrs | 5.1M/wk | github.com/ant-design/ant-design-icons | [OK] | Approved (Already in package.json) |
| dayjs | npm | > 6 yrs | 89M/wk | github.com/iamkun/dayjs | [OK] | Approved (Already in package.json) |
| tauri | crates.io | > 4 yrs | N/A | github.com/tauri-apps/tauri | [OK] | Approved (Already in Cargo.toml) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[ User Interaction ]
   │
   ├─► Click "Run Ghost Dev" (TaskCard / Drawer)
   │     │
   │     ▼
   │   [ Modal Select CWD / Confirm Models ] (Master: Opus/Sonnet, Worker: Haiku)
   │     │
   │     ▼ (Tauri IPC: start_ghost_dev_session)
   │
[ Rust Backend (agent_manager.rs) ]
   │
   ├──► 1. Git Worktree Manager:
   │       `git worktree add -b pm-agent/task-<id> .plannermate/worktrees/task-<id> HEAD`
   │
   ├──► 2. Master Agent Process (Tokio Command):
   │       `claude -p --output-format stream-json --input-format stream-json --permission-mode acceptEdits --model <opus>`
   │       - Injects MCP Tool: `dispatch_subtask(role, task_prompt, model)`
   │       - Stdin / Stdout buffered pipe reader
   │
   ├──► 3. Worker Agent Dispatcher (when Master calls dispatch_subtask):
   │       - Check concurrency cap (Max 2 workers / task, Max 6 processes global)
   │       - Spawn Worker process in same worktree directory
   │       - Forward Worker events to Frontend via tagged stream
   │       - Send structured completion result back to Master via stdin
   │
   ├──► 4. Stream Batcher (50ms - 100ms interval):
   │       - Collect line JSON chunks from stdout
   │       - Emit Tauri Event: `ghost-dev:stream-chunk`
   │
   └──► 5. Safety & Process Group Supervisor:
           - Intercept `RunEvent::ExitRequested` -> SIGKILL Process Groups
           - Whitelist Safe Commands (`npm test`, `git status`, `cargo check`)
           - Shell Confirmation Interceptor -> Emit `ghost-dev:permission-request`
                                            ◄- Receive Approve / Deny

[ React Frontend (/agents Route) ]
   │
   ├──► Left Pane: Session List (Hierarchical Tree: Master -> Workers, Status Badges)
   ├──► Center Pane: Terminal Stream Log (Colored JSON Events, 2-Way Chat Prompt)
   └──► Right Pane: Live Git Diff Viewer:
           - Fetch: `git diff HEAD` from Rust
           - Parse Diff -> Render Side-by-side / Unified
           - Action: Accept All / Revert All / Accept File / Revert File
           - Interactive: Click on Line -> Inline Feedback Drawer/Input -> Send to Master
```

### Recommended Project Structure
```
src/
├── components/
│   └── agents/                          # Ghost Dev UI components
│       ├── AgentControlView.tsx         # Main 3-column Splitter container
│       ├── AgentSessionList.tsx         # Left column: Session hierarchy & status
│       ├── AgentTerminalLog.tsx         # Center column: Stream events, tool outputs, chat input
│       ├── AgentDiffReviewer.tsx        # Right column: File tree & diff renderer
│       ├── DiffHunkView.tsx             # Unified & Side-by-side diff renderer with line-click
│       ├── DiffInlineCommentModal.tsx   # Modal/Popover for sending code-line feedback
│       └── ShellPermissionModal.tsx     # Confirmation modal for non-whitelisted bash commands
├── hooks/
│   ├── useGhostDevSessions.ts           # Hook managing session list & active session state
│   ├── useGhostDevStream.ts             # Hook listening to Tauri stream events with batching
│   └── useGhostDevDiff.ts               # Hook querying live git diff for current worktree
├── types/
│   └── agent.ts                         # Type definitions for sessions, events, diff, permissions
└── utils/
    └── gitDiffParser.ts                 # Lightweight unified diff parser into hunks and lines

src-tauri/
└── src/
    ├── agent_manager.rs                 # Process pool, worktree manager, pipe reader, tokio loop
    └── lib.rs                           # Register agent commands & exit handler
```

### Pattern 1: Git Worktree Isolation & Cleanup
**What:** Tạo môi trường làm việc tách biệt không đụng chạm vào thư mục git hiện tại của người dùng.
**When to use:** Bắt đầu phiên làm việc cho từng Task.
**Implementation Logic:**
```rust
// Rust implementation pattern in agent_manager.rs
pub fn create_worktree(repo_root: &Path, task_id: &str) -> Result<PathBuf, String> {
    let branch_name = format!("pm-agent/task-{}", task_id);
    let worktree_dir = repo_root.join(".plannermate").join("worktrees").join(format!("task-{}", task_id));

    // Ensure parent dir exists
    if let Some(parent) = worktree_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Run: git worktree add -B <branch_name> <worktree_dir> HEAD
    let output = std::process::Command::new("git")
        .current_dir(repo_root)
        .args(["worktree", "add", "-B", &branch_name, worktree_dir.to_str().unwrap(), "HEAD"])
        .output()
        .map_err(|e| format!("Failed to execute git worktree: {}", e))?;

    if !output.status.success() {
        return Err(format!("git worktree add failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(worktree_dir)
}
```

### Pattern 2: Claude Code Headless Stream-JSON & IPC Batching
**What:** Chạy tiến trình Claude Code chế độ headless với đường ống JSON stream 2 chiều.
**When to use:** Master Agent hoặc Worker Agent bắt đầu xử lý prompt.
**Implementation Logic:**
```rust
// Launching command with tokio process and reading lines asynchronously
let mut child = tokio::process::Command::new("claude")
    .current_dir(&worktree_dir)
    .args([
        "-p",
        "--output-format", "stream-json",
        "--input-format", "stream-json",
        "--permission-mode", "acceptEdits",
        "--model", &model,
        &initial_prompt
    ])
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| format!("Failed to spawn claude: {}", e))?;
```

### Pattern 3: Zero-Dependency Unified Git Diff Parser
**What:** Phân tách đầu ra của `git diff HEAD` thành danh sách file, hunks và từng dòng code kèm chỉ số dòng để hỗ trợ Click-to-Comment.
**When to use:** Hiển thị trong Live Git Diff Reviewer.
**Implementation Logic:**
```typescript
export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: 'modified' | 'added' | 'deleted';
  hunks: DiffHunk[];
}
```

### Anti-Patterns to Avoid
- **Chạy Claude trực tiếp trên Working Tree chính:** Làm dơ staging area, xung đột với code chưa commit của người dùng. Luôn bắt buộc dùng `git worktree`.
- **Dùng PTY giả lập xterm cho headless agent:** Làm phức tạp parser vì dính mã màu ANSI. Claude Code hỗ trợ sẵn `--output-format stream-json`, hãy khai thác triệt để định dạng JSON có cấu trúc.
- **Flood IPC lên React từng byte:** Khi LLM sinh code với tốc độ cao, gửi từng chunk qua Tauri event sẽ làm đơ giao diện. Phải gom batch ở Rust theo khoảng 50ms-100ms hoặc dùng buffered line reader.
- **Xóa worktree khi người dùng tắt app:** Làm mất toàn bộ thành quả chưa kịp lưu. Chỉ kill child processes, giữ nguyên thư mục worktree để hỗ trợ tính năng Resume trong lần mở app kế tiếp.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resizable 3-Column Split Pane | Custom mouse dragging & divider recalculation | Ant Design 6 `Splitter` component | Ant Design 6 có sẵn `Splitter`, `Splitter.Panel`, hỗ trợ min/max size, keyboard accessible, lưu layout trạng thái. |
| Worktree isolation | Copying entire project folder manually | `git worktree add / remove` native CLI | Tận dụng chung git objects database (`.git`), tạo tức thì trong 100ms, không tốn dung lượng ổ đĩa. |
| Diff calculation | Thuật toán so khớp chuỗi diff thủ công | `git diff HEAD` và `git diff --cached` | Git diff là chuẩn công nghiệp, nhận diện rename, binary files, chính xác tuyệt đối. |
| Desktop notifications | Custom alert banner giả lập | `tauri-plugin-notification` | Đã tích hợp sẵn, hiển thị native Notification Center trên macOS và Action Center trên Windows. |

## Common Pitfalls

### Pitfall 1: Orphan Process Leak khi người dùng tắt hoặc tắt cưỡng bức ứng dụng
**What goes wrong:** Người dùng đóng cửa sổ hoặc tắt Tauri app, các child processes (`claude`, `node`, sub-workers) vẫn chạy ngầm tiêu tốn 100% CPU và tài nguyên API.
**Why it happens:** Khi tiến trình cha chết, tiến trình con không tự động nhận tín hiệu kết thúc trên một số hệ điều hành (đặc biệt là Windows hoặc tiến trình con bị detach).
**How to avoid:**
1. Trên Unix (macOS/Linux): Khởi tạo child process với process group riêng và gửi `SIGTERM` / `SIGKILL` tới toàn bộ Process Group khi nhận event `RunEvent::ExitRequested`.
2. Trên Windows: Sử dụng Windows Job Objects hoặc gọi lệnh taskkill theo Process Tree (`taskkill /F /T /PID`).
3. Đăng ký listener tại `tauri::Builder::default().build().run(|app_handle, event| ...)` bắt sự kiện `RunEvent::ExitRequested` để dọn sạch pool process trước khi app tắt hoàn toàn.

### Pitfall 2: Git Worktree Lock hoặc Branch Collision
**What goes wrong:** Người dùng chạy lại Ghost Dev cho cùng một Task nhưng branch hoặc thư mục worktree cũ chưa được dọn dẹp, dẫn đến `fatal: 'pm-agent/task-xxx' already exists`.
**Why it happens:** Phiên làm việc trước đó bị crash hoặc dừng đột ngột khiến worktree metadata còn lưu trong `.git/worktrees/`.
**How to avoid:** Trước khi gọi `git worktree add`, kiểm tra nếu thư mục tồn tại thì dọn dẹp bằng `git worktree prune` hoặc tái sử dụng worktree cũ để tiếp tục phiên làm việc (Resume workflow).

### Pitfall 3: Blocking Shell Permission Deadlock
**What goes wrong:** Agent gọi lệnh shell nguy hiểm, tiến trình Claude Code bị dừng lại chờ input stdin, nhưng giao diện không hiển thị prompt hoặc gửi input sai định dạng làm tiến trình treo vĩnh viễn.
**Why it happens:** Không có timeout quản lý phản hồi của người dùng hoặc pipe stdin bị đóng sớm.
**How to avoid:** Đặt trạng thái session là `AwaitingApproval`. Nếu người dùng Deny hoặc đóng modal, ghi JSON phản hồi từ chối vào stdin của Claude Code để agent nhận thông tin và chuyển hướng xử lý thay vì bị treo pipe.

### Pitfall 4: Memory Leak từ Log Stream quá dài
**What goes wrong:** Khi Agent thực thi task lớn hoặc chạy test dài hàng nghìn dòng log, Webview bị tràn RAM hoặc giật lag khi render DOM.
**Why it happens:** Mảng log trong React state tăng không giới hạn.
**How to avoid:** Giới hạn log buffer ở mức tối đa 2,000 dòng gần nhất trong giao diện, hoặc sử dụng virtualized list cho Terminal Stream Log.

## Code Examples

### 1. Tauri Process Manager Lifecycle (Rust)
```rust
// Source: Tauri 2 Process & Tokio asynchronous pipe pattern
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct AgentSession {
    pub task_id: String,
    pub master_pid: u32,
    pub status: String,
}

pub type AgentPool = Arc<Mutex<HashMap<String, AgentSession>>>;

pub fn setup_exit_protection(app_handle: AppHandle, pool: AgentPool) {
    // Intercept application exit to terminate all running child processes safely
    // D-18: Kill child processes, keep worktrees intact
}
```

### 2. Click-to-Comment Inline Feedback Packaging (React)
```typescript
// Source: 15-CONTEXT.md D-13 inline feedback formatting
export function formatInlineFeedbackPrompt(
  filePath: string,
  lineNumber: number,
  selectedCode: string,
  userComment: string
): string {
  return `Vui lòng sửa mã nguồn theo phản hồi sau:
- Tập tin: \`${filePath}\`
- Dòng: ${lineNumber}
- Đoạn mã liên quan:
\`\`\`
${selectedCode}
\`\`\`
- Yêu cầu chỉnh sửa: ${userComment}`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chạy Agent trực tiếp trên working repo | Git Worktree Isolation (`.plannermate/worktrees`) | Phase 15 | Cách ly 100% thay đổi của AI, không làm dơ workspace của lập trình viên. |
| Mở Terminal OS rời rạc bên ngoài | Nhúng Headless Stream-JSON trực tiếp vào UI | Phase 15 | Kiểm soát trạng thái 2 chiều, phân tích log có cấu trúc, tích hợp live diff. |
| Single monolithic agent | Hierarchical Master-Worker Multi-Agent | Phase 15 | Phân rã bài toán lớn (Master dùng Opus/Sonnet), thực thi song song (Worker dùng Haiku). |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Người dùng đã cài đặt và cấu hình sẵn `claude` CLI trên máy tính và có thể gọi được qua đường dẫn hệ thống `$PATH` hoặc `~/.local/bin/claude` | Standard Stack | Nếu máy chưa có `claude` CLI, ứng dụng cần phát hiện và hiển thị hướng dẫn cài đặt trực quan. |
| A2 | Dự án làm việc là một Git repository hợp lệ và hỗ trợ lệnh `git worktree` | Standard Stack | Nếu thư mục liên kết chưa có `.git`, cần thông báo cho người dùng khởi tạo repo trước khi chạy Ghost Dev. |

## Open Questions

1. **Vị trí lưu trữ `.plannermate/worktrees`:**
   - What we know: Lưu trong repo sẽ tận dụng trực tiếp git objects.
   - What's unclear: Có thể bị git status quét nếu người dùng chưa thêm vào `.gitignore`.
   - Recommendation: Tự động ghi `.plannermate/` vào `.git/info/exclude` cục bộ khi tạo worktree để không làm bẩn file `.gitignore` của repo.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Web app build & dev | ✓ | 24.16.0 | — |
| Cargo / Rust | Tauri Desktop backend | ✓ | 1.98.1 | — |
| Git CLI | Git Worktree & Diff | ✓ | 2.50.1 | Bắt buộc (báo lỗi nếu thiếu) |
| Claude Code CLI | Ghost Dev Agent Engine | ✓ | 2.1.x (`~/.local/bin/claude`) | Hiển thị modal hướng dẫn cài đặt `npm i -g @anthropic-ai/claude-code` |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vite.config.ts` |
| Quick run command | `npm test -- tests/agents/gitDiffParser.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GHOST-01 | Parse git unified diff into hunks and lines | Unit | `npx vitest run tests/agents/gitDiffParser.test.ts` | ❌ Wave 0 |
| GHOST-02 | Format inline feedback comment prompt with line & file context | Unit | `npx vitest run tests/agents/promptBuilder.test.ts` | ❌ Wave 0 |
| GHOST-03 | Shell command whitelist validation | Unit | `npx vitest run tests/agents/whitelist.test.ts` | ❌ Wave 0 |
| GHOST-04 | Agent Control page layout and navigation | Component | `npx vitest run tests/agents/AgentControlView.test.tsx` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `tests/agents/gitDiffParser.test.ts` — kiểm tra phân tách raw unified diff text thành hunks và lines.
- [ ] `tests/agents/whitelist.test.ts` — kiểm tra bộ lọc shell command whitelist theo D-16.
- [ ] `tests/agents/promptBuilder.test.ts` — kiểm tra format prompt cho inline comment và subtask dispatch.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Validate và escape đường dẫn file, branch name để ngăn Command Injection vào `std::process::Command`. |
| V14 Configuration | Yes | Whitelist nghiêm ngặt các lệnh Shell tự động (`npm test`, `git status`), mọi lệnh khác bắt buộc qua xác nhận người dùng (D-15, D-16). |

### Known Threat Patterns for Ghost Dev

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary Shell Execution | Elevation of Privilege | Chỉ cho phép chạy lệnh ngoài whitelist khi có xác nhận tường minh của người dùng (Confirm Modal). Truyền tham số dưới dạng `args` mảng trong Rust `Command`, tuyệt đối không dùng shell concatenation `sh -c` với chuỗi không tin cậy. |
| Path Traversal qua Worktree Path | Tampering | Chuẩn hóa đường dẫn bằng `canonicalize()` và xác thực nằm trong phạm vi thư mục dự án được cấp quyền. |
| Denial of Service do Process Fork Bomb | Denial of Service | Giới hạn tối đa 1 Master + 2 Workers cho mỗi task và tối đa 6 processes trên toàn hệ thống (D-08). |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src-tauri/Cargo.toml`, `package.json`, `src/types/navigation.ts`, `src/components/shell/Navigation.tsx`.
- Local CLI tool verification: `claude --help`, `git worktree --help`, `cargo --version`.
- Phase context: `.planning/phases/15-ghost-dev-local-claude-code-headless-orchestration-with-agen/15-CONTEXT.md` & `15-UI-SPEC.md`.

### Secondary (MEDIUM confidence)
- Anthropic Claude Code stream-json headless protocol documentation & flags.
- Git Worktree multi-agent concurrency patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - tận dụng 100% stack hiện tại, không thêm thư viện lạ.
- Architecture: HIGH - phân tầng rõ ràng giữa Rust backend và React frontend.
- Pitfalls: HIGH - đã xác định các điểm then chốt về Process Group termination và Worktree collision.

**Research date:** 2026-10-05
**Valid until:** 2026-11-05
