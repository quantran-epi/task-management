---
phase: 15-ghost-dev-local-claude-code-headless-orchestration-with-agen
verified: 2026-10-05T15:45:00Z
status: human_needed
score: 18/18 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Spawn local Ghost Dev session from TaskTable or TaskDrawer"
    expected: "Modal opens with detected or custom git repository path, initiates Claude Code headless CLI session, shows non-blocking toast with 'Xem trong Agent Control' CTA, and increments sidebar badge"
    why_human: "Requires live Claude Code CLI binary in PATH and real git repository on host machine"
  - test: "Verify Desktop OS Notification on agent completion and shell permission"
    expected: "Native desktop notifications appear in OS notification center when session finishes or when unwhitelisted command triggers approval prompt"
    why_human: "Native OS notification dispatch via tauri-plugin-notification requires running desktop window"
  - test: "Live Git Diff Reviewer side-by-side comparison and inline feedback"
    expected: "Diff file list renders modified files; clicking a line opens DiffInlineCommentModal; submitting feedback sends formatted prompt to active Master Agent"
    why_human: "Validates UI layout, scrolling synchronization, and human perception of visual split diffs"
  - test: "Shell permission gate approval / denial flow"
    expected: "When agent invokes non-whitelisted bash command, execution pauses, modal displays command, and approving allows command to proceed while denying sends rejection to Claude stdin"
    why_human: "Requires interactive subprocess execution and timing verification of interactive stdin"
---

# Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer Verification Report

**Phase Goal:** Orchestrate local Claude Code Headless CLI (`stream-json`) via native Rust multi-agent manager (Master-Worker) with Git worktree isolation, a dedicated 3-column Agent Control center, and an interactive Live Git Diff Reviewer with side-by-side/unified diff modes and click-to-comment inline feedback.
**Verified:** 2026-10-05T15:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Git unified diff output parses deterministically into file objects, line counts, hunks, and individual additions/deletions | ✓ VERIFIED | `src/utils/gitDiffParser.ts` exports `parseGitDiff`. All 4 tests in `tests/agents/gitDiffParser.test.ts` pass. |
| 2   | Inline code comment prompt packages exact file path, line number, selected code, and user instruction for Master Agent re-prompting | ✓ VERIFIED | `src/utils/ghostDevPrompt.ts` exports `formatInlineFeedbackPrompt`. Tests in `tests/agents/promptBuilder.test.ts` pass. |
| 3   | Shell command whitelist strictly verifies safe commands without false positives or path escapes | ✓ VERIFIED | `src/utils/shellWhitelist.ts` rejects chaining delimiters (`;`, `&&`, `\|\|`, `\|`) and verifies against `SAFE_COMMAND_PREFIXES`. Tests in `tests/agents/whitelist.test.ts` pass. |
| 4   | Rust backend manages Git worktrees isolated under `.plannermate/worktrees/task-<id>` with branch `pm-agent/task-<id>` | ✓ VERIFIED | `src-tauri/src/agent_manager.rs` implements `ensure_git_worktree` executing `git worktree add -B <branch> <path> HEAD`. |
| 5   | Master and Worker processes spawn via Tokio Command with stream-json pipes and batch event delivery | ✓ VERIFIED | `src-tauri/src/agent_manager.rs` spawns Claude with `--output-format stream-json --input-format stream-json`, processes stdout/stderr, and delivers batches via `ghost-dev:stream-chunk`. |
| 6   | Application exit handler catches `RunEvent::ExitRequested`, terminates all running process groups safely, and preserves worktrees | ✓ VERIFIED | `src-tauri/src/lib.rs` hooks `RunEvent::ExitRequested` calling `agent_manager::cleanup_on_exit()`. `kill_process_tree` kills process groups via `libc::kill(-pgid, SIGKILL)` while preserving worktree folders on disk. |
| 7   | Shell permission interceptor pauses commands outside whitelist and resumes only after explicit user approval | ✓ VERIFIED | `agent_manager.rs` intercepts `tool_use` for shell commands, compares with `is_command_whitelisted`, pauses line processor using `oneshot::channel`, and unblocks upon user IPC `respond_shell_permission`. |
| 8   | Agent Control center displays a 3-column resizable layout using Ant Design 6 Splitter (Session List, Terminal Stream Log, Live Git Diff Reviewer) | ✓ VERIFIED | `src/views/AgentControlView.tsx` wraps panels in `<Splitter>` with default sizes (22%, 45%, 33%) and min-width bounds. |
| 9   | Terminal Stream Log displays formatted line chunks with bounded 2,000 line memory buffer and provides 2-way chat prompting to Master Agent | ✓ VERIFIED | `src/hooks/useGhostDevStream.ts` bounds memory buffer to `MAX_STREAM_LINES = 2000` via `.slice(-MAX_STREAM_LINES)`. `AgentTerminalLog.tsx` renders categorized tags and chat input box. |
| 10  | Live Git Diff Reviewer toggles seamlessly between Side-by-side and Unified diff modes, displays additions/deletions badges, and provides Accept All / Revert All actions | ✓ VERIFIED | `src/components/agents/AgentDiffReviewer.tsx` provides Segmented toggle (`unified` vs `split`), addition/deletion badges, and Popconfirm actions invoking `acceptAll` and `revertAll`. |
| 11  | Clicking any code line on the diff opens the inline feedback modal and sends formatted file:line prompt back to the Master Agent | ✓ VERIFIED | `src/components/agents/DiffHunkView.tsx` handles click and keyboard Enter/Space, opening `DiffInlineCommentModal.tsx` which formats feedback prompt and submits to `sendChatMessage`. |
| 12  | Non-whitelisted shell commands trigger the Shell Permission Modal and pause execution until user grants or denies permission | ✓ VERIFIED | `src/components/agents/ShellPermissionModal.tsx` listens to `ghost-dev:permission-request`, renders modal, and invokes `respond_shell_permission`. |
| 13  | Sidebar Navigation displays 'Agent Control' item with a real-time badge count of running agent sessions | ✓ VERIFIED | `src/components/shell/Navigation.tsx` renders route `'agents'` with dynamic `Badge` count of running/awaiting sessions using color `#4f46e5`. |
| 14  | Background notification mechanism integrates both Sidebar Badge counter and Desktop OS Notification (tauri-plugin-notification) when an agent completes work or requires shell permission approval | ✓ VERIFIED | `src/hooks/useGhostDevNotifications.ts` listens to session status transitions and Tauri permission events, triggering `sendDesktopNotification`. |
| 15  | TaskTable row actions and TaskDrawer header include 'Run Ghost Dev', opening the CWD/Model confirmation modal and launching the session via toast notification without leaving the current view | ✓ VERIFIED | `TaskTable.tsx` menu item 'Chạy Ghost Dev' and `TaskDrawer.tsx` header button open `RunGhostDevModal.tsx`, which triggers toast with 'Xem trong Agent Control' CTA. |
| 16  | Settings page includes Ghost Dev Configuration Card for customizing default Master and Worker models | ✓ VERIFIED | `src/components/settings/GhostDevConfigCard.tsx` mounted in `src/views/SettingsView.tsx` under tab "Trợ lý AI & Ghost Dev". |
| 17  | Selecting 'Agent Control' or navigating to route 'agents' renders the AgentControlView cockpit | ✓ VERIFIED | `src/App.tsx` routes `case 'agents': return <AgentControlView />;`. |
| 18  | Component test verifies AgentControlView renders panels, accepts mock sessions, and responds to user interactions | ✓ VERIFIED | `tests/agents/AgentControlView.test.tsx` passes with 4 assertions covering empty state, panel rendering, and interactions. |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/types/agent.ts` | Agent session, worker, stream event, and permission types | ✓ VERIFIED | 78 lines. Contains `AgentRole`, `AgentStatus`, `AgentSession`, `DiffFile`, `ShellPermissionRequest`. |
| `src/utils/gitDiffParser.ts` | Zero-dependency Git unified diff parser | ✓ VERIFIED | 157 lines. Exports `parseGitDiff`. Parses hunks, statuses, and line counts. |
| `src/utils/ghostDevPrompt.ts` | Master prompt generator and inline comment feedback formatter | ✓ VERIFIED | 40 lines. Exports `generateGhostDevMasterPrompt` and `formatInlineFeedbackPrompt`. |
| `src/utils/shellWhitelist.ts` | Shell command whitelist validator | ✓ VERIFIED | 29 lines. Exports `isCommandWhitelisted` and `SAFE_COMMAND_PREFIXES`. |
| `src-tauri/src/agent_manager.rs` | Native Rust agent manager, Git worktree lifecycle, process pool, and IPC commands | ✓ VERIFIED | 957 lines. Substantive, full Tokio process supervision, worktree management, permission channel, exit cleanup. |
| `src-tauri/src/lib.rs` | Tauri builder command registration and ExitRequested handler | ✓ VERIFIED | 57 lines. Registers 9 agent commands, initializes `tauri_plugin_notification`, and hooks `ExitRequested`. |
| `src/views/AgentControlView.tsx` | Main 3-column Agent Control center view | ✓ VERIFIED | 152 lines. Uses AntD Splitter, renders session list, terminal log, diff reviewer, and shell modal. |
| `src/components/agents/AgentSessionList.tsx` | Hierarchical Master-Worker session tree with status badges | ✓ VERIFIED | 227 lines. Renders session status, active worker counts, and stop session controls. |
| `src/components/agents/AgentTerminalLog.tsx` | Terminal output viewer and 2-way interactive prompt box | ✓ VERIFIED | 232 lines. Autoscrolling terminal stream viewer with formatted tags and send message input. |
| `src/components/agents/AgentDiffReviewer.tsx` | Diff file list and code comparator with Accept/Revert actions | ✓ VERIFIED | 374 lines. Side-by-side / unified toggling, additions/deletions badges, file list, hunk reviewer. |
| `src/components/agents/DiffHunkView.tsx` | Unified and side-by-side hunk line renderer with click-to-comment | ✓ VERIFIED | 294 lines. Synchronized split hunk blocks, line number gutters, inline comment click/keyboard triggers. |
| `src/hooks/useGhostDevSessions.ts` | Session list polling and IPC event synchronization hook | ✓ VERIFIED | 128 lines. Synchronizes session list from `list_agent_sessions` and `ghost-dev:session-updated`. |
| `src/hooks/useGhostDevStream.ts` | Stream buffer hook with 2,000 line memory bound | ✓ VERIFIED | 107 lines. Collects chunks from `ghost-dev:stream-chunk`, bounds buffer to `MAX_STREAM_LINES = 2000`. |
| `src/hooks/useGhostDevDiff.ts` | Worktree diff fetcher and polling hook | ✓ VERIFIED | 138 lines. Fetches raw diff from `get_worktree_diff`, parses with `parseGitDiff`, supports background refresh. |
| `src/components/agents/DiffInlineCommentModal.tsx` | Inline code comment input modal | ✓ VERIFIED | 110 lines. Packages `file_path`, `lineNumber`, `selectedCode`, and `userComment` into Master prompt. |
| `src/components/agents/ShellPermissionModal.tsx` | Interactive modal gate for unwhitelisted shell commands | ✓ VERIFIED | 145 lines. Shows requested command and path, invokes `respond_shell_permission`. |
| `src/types/navigation.ts` | Route type definition for Agent Control | ✓ VERIFIED | Contains `'agents'` in `AppRoute` union. |
| `src/components/shell/Navigation.tsx` | Sidebar navigation menu item with live running badge | ✓ VERIFIED | Renders Agent Control menu item with `#4f46e5` running badge and notification listener. |
| `src/components/agents/RunGhostDevModal.tsx` | Task launch modal with repo detection and model selection | ✓ VERIFIED | 319 lines. Validates repo path, invokes `start_ghost_dev_session`, shows toast with navigation CTA. |
| `src/components/settings/GhostDevConfigCard.tsx` | Settings configuration card for default models and concurrency | ✓ VERIFIED | 175 lines. Customizes master model, worker model, and global concurrency cap. |
| `src/services/agents/ghostDevConfig.ts` | LocalStorage configuration service for Ghost Dev | ✓ VERIFIED | 52 lines. Model ID regex validation and default model fallback constants. |
| `src/hooks/useGhostDevNotifications.ts` | Desktop OS notification dispatcher for agent events | ✓ VERIFIED | 66 lines. Integrates `sendDesktopNotification` on done, error, and shell permission requests. |
| `tests/agents/AgentControlView.test.tsx` | Automated component tests for Agent Control center | ✓ VERIFIED | 217 lines. Tests empty states, active session panels, and diff rendering. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `src/utils/gitDiffParser.ts` | `src/types/agent.ts` | Type imports (`DiffFile`, `DiffHunk`, `DiffLine`) | ✓ WIRED | Deterministic typing for diff AST. |
| `src/utils/ghostDevPrompt.ts` | `src/types/models.ts` | Type import (`Task`) | ✓ WIRED | Serializes task title, description, checklist items into Master prompt. |
| `src-tauri/src/lib.rs` | `src-tauri/src/agent_manager.rs` | Command registration & cleanup call | ✓ WIRED | All 9 commands in invoke handler; `cleanup_on_exit` in `ExitRequested`. |
| `src-tauri/src/agent_manager.rs` | Tauri IPC Events | `app.emit("ghost-dev:stream-chunk")` & `ghost-dev:permission-request` | ✓ WIRED | Event batching and permission dispatch to frontend listeners. |
| `src/views/AgentControlView.tsx` | `src/hooks/useGhostDevSessions.ts` | State hook | ✓ WIRED | Drives active session selection and session list rendering. |
| `src/components/agents/AgentDiffReviewer.tsx` | `src/utils/gitDiffParser.ts` | `parseGitDiff` call via `useGhostDevDiff` | ✓ WIRED | Parses unified diff string from Rust `get_worktree_diff`. |
| `src/components/agents/DiffHunkView.tsx` | `src/components/agents/DiffInlineCommentModal.tsx` | Modal trigger | ✓ WIRED | Passes clicked line, path, code to comment modal. |
| `src/components/agents/DiffInlineCommentModal.tsx` | `src/utils/ghostDevPrompt.ts` | `formatInlineFeedbackPrompt` | ✓ WIRED | Formats prompt and forwards to active Master session stdin. |
| `src/components/shell/Navigation.tsx` | `src/hooks/useGhostDevSessions.ts` | Badge counter | ✓ WIRED | Calculates running/awaiting session count for sidebar badge. |
| `src/App.tsx` | `src/views/AgentControlView.tsx` | Route mapping | ✓ WIRED | Route `'agents'` maps directly to `<AgentControlView />`. |
| `src/components/tasks/TaskTable.tsx` | `src/components/agents/RunGhostDevModal.tsx` | Menu action | ✓ WIRED | 'Chạy Ghost Dev' opens modal with selected task. |
| `src/components/tasks/TaskDrawer.tsx` | `src/components/agents/RunGhostDevModal.tsx` | Header button | ✓ WIRED | Ghost Dev button in drawer header opens modal. |
| `src/views/SettingsView.tsx` | `src/components/settings/GhostDevConfigCard.tsx` | Settings tab | ✓ WIRED | Rendered under tab "Trợ lý AI & Ghost Dev". |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `AgentControlView` | `sessions` | `useGhostDevSessions` -> Tauri `list_agent_sessions` | Real session pool state from Rust `AGENT_POOL` | ✓ FLOWING |
| `AgentTerminalLog` | `logs` | `useGhostDevStream` -> Tauri event `ghost-dev:stream-chunk` | Real stdout stream chunks from spawned Claude Code CLI | ✓ FLOWING |
| `AgentDiffReviewer` | `diffFiles` | `useGhostDevDiff` -> Tauri `get_worktree_diff` -> `parseGitDiff` | Real git diff output executed in isolated `.plannermate/worktrees/task-<id>` | ✓ FLOWING |
| `ShellPermissionModal` | `requests` | Tauri event `ghost-dev:permission-request` | Real unwhitelisted tool calls intercepted by Rust reader loop | ✓ FLOWING |
| `Navigation` | `runningCount` | `useGhostDevSessions` | Real count of sessions in `running` or `awaiting_approval` state | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Git diff parser unit tests | `npx vitest run tests/agents/gitDiffParser.test.ts` | 4 passed | ✓ PASS |
| Prompt builder & inline feedback tests | `npx vitest run tests/agents/promptBuilder.test.ts` | 2 passed | ✓ PASS |
| Shell command whitelist validator tests | `npx vitest run tests/agents/whitelist.test.ts` | 5 passed | ✓ PASS |
| AgentControlView component test suite | `npx vitest run tests/agents/AgentControlView.test.tsx` | 2 passed | ✓ PASS |
| TypeScript compilation check | `npx tsc --noEmit` | 0 errors | ✓ PASS |
| Rust backend compilation check | `cd src-tauri && cargo check` | 0 errors | ✓ PASS |

### Probe Execution

No probes declared for Phase 15. All unit, component, and static checks pass.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| GHOST-01 | 15-01, 15-02, 15-03 | Zero-dependency Git unified diff parser converts raw diff strings into structured files, line counts, hunks, and individual additions/deletions. | ✓ SATISFIED | `src/utils/gitDiffParser.ts` parses raw unified diffs into `DiffFile[]` with additions, deletions, hunks, and line numbering. Fully tested in `tests/agents/gitDiffParser.test.ts`. |
| GHOST-02 | 15-01, 15-03 | Prompt builder utilities format task context for Master Agent orchestration and package inline diff code comments (`file_path:line_number`) for iterative code refinement. | ✓ SATISFIED | `src/utils/ghostDevPrompt.ts` generates structured Master prompt from `Task` model and packages inline comments into `file_path:line_number` prompts. Verified in `promptBuilder.test.ts` and `DiffInlineCommentModal.tsx`. |
| GHOST-03 | 15-01, 15-02, 15-03 | Rust backend enforces shell command whitelist for autonomous diagnostic runs and blocks unwhitelisted commands until explicit user approval via modal gate. | ✓ SATISFIED | `src/utils/shellWhitelist.ts` and `src-tauri/src/agent_manager.rs` enforce `SAFE_COMMAND_PREFIXES`, block shell injection delimiters, pause reader loop via oneshot channel, and await approval via `ShellPermissionModal.tsx`. |
| GHOST-04 | 15-03, 15-04 | Agent Control view delivers a 3-column layout (Session List, Terminal Stream Log, Live Git Diff Reviewer) accessible via Sidebar badge and integrated with task triggers. | ✓ SATISFIED | `src/views/AgentControlView.tsx` renders 3-column Splitter layout. Sidebar `Navigation.tsx` shows dynamic running badge. `TaskTable.tsx` and `TaskDrawer.tsx` trigger `RunGhostDevModal.tsx`. Verified by `AgentControlView.test.tsx`. |

### Anti-Patterns Found

Zero blocker or warning anti-patterns found in files modified for Phase 15. No `TBD`, `FIXME`, or `XXX` debt markers. No empty placeholder stubs or static return fallbacks.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | None | None | None | None |

### Human Verification Required

### 1. Launch Ghost Dev Session from Task Workflow
**Test:** From TaskTable row menu or TaskDrawer header, click "Chạy Ghost Dev". Choose repository folder, confirm Master/Worker models, and click "Khởi chạy Ghost Dev".  
**Expected:** Modal closes, toast displays with "Xem trong Agent Control" CTA button, sidebar "Agent Control" item shows badge count "1", and navigating to Agent Control renders the session in the left list.  
**Why human:** Requires host system with installed `claude` CLI in PATH and local Git repository.

### 2. Live Git Diff Reviewer and Inline Code Comment Feedback
**Test:** While an agent is modifying files in its isolated worktree, select the session in Agent Control. Observe additions/deletions badges. Switch between "Unified" and "Side-by-side" views. Click on any modified code line in the diff.  
**Expected:** "Thêm phản hồi mã nguồn" modal opens pre-filled with file path and line number. Entering a comment and clicking "Gửi phản hồi" sends the formatted prompt to the Master Agent stdin and appears in the terminal stream log.  
**Why human:** Verifies split diff visual layout alignment and responsive terminal stream interaction.

### 3. Shell Permission Approval Gate
**Test:** Trigger a Claude Code task that invokes an unwhitelisted shell command (e.g., `touch test.txt` or `curl`).  
**Expected:** Execution pauses, desktop OS notification alerts the user, and `ShellPermissionModal` appears showing the exact command and working directory. Approving allows execution to proceed; denying sends rejection payload to Claude stdin.  
**Why human:** Interactive timing and OS desktop notification display cannot be verified in headless CI.

### 4. Application Exit Safety
**Test:** Start an agent session and close the desktop application window while the agent process is running.  
**Expected:** All child Claude Code processes are killed immediately via process groups (`libc::kill(-pgid, SIGKILL)`), preventing orphan background CPU consumption, while the `.plannermate/worktrees/task-<id>` directory is retained on disk.  
**Why human:** Requires native desktop process inspection across app lifecycle.

---

_Verified: 2026-10-05T15:45:00Z_  
_Verifier: Claude (gsd-verifier)_
