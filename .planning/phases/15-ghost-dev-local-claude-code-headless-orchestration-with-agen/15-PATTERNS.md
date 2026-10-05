# Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 28 (17 new, 7 modified, 4 tests)
**Analogs found:** 28 / 28

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/agent.ts` | model | request-response | `src/services/ai/types.ts` | exact |
| `src/types/navigation.ts` | model / config | config | `src/types/navigation.ts` | exact |
| `src/utils/gitDiffParser.ts` | utility | transform | `src/utils/filter.ts` | role-match |
| `src/utils/ghostDevPrompt.ts` | utility | transform | `src/services/ai/claudeCliService.ts` | exact |
| `src/utils/shellWhitelist.ts` | utility | validation | `src/utils/documentLinks.tsx` | role-match |
| `src/hooks/useGhostDevSessions.ts` | hook | CRUD / event-driven | `src/hooks/useDesktopNotification.ts` | role-match |
| `src/hooks/useGhostDevStream.ts` | hook | streaming / pub-sub | `src/views/AIPopoutView.tsx` | exact |
| `src/hooks/useGhostDevDiff.ts` | hook | request-response | `src/services/ai/aiTools.ts` | role-match |
| `src/views/AgentControlView.tsx` | view / component | event-driven | `src/views/TasksView.tsx` | exact |
| `src/components/agents/AgentSessionList.tsx` | component | request-response | `src/components/ai/ScopePickerModal.tsx` | exact |
| `src/components/agents/AgentTerminalLog.tsx` | component | streaming | `src/components/ai/ChatMessageList.tsx` | exact |
| `src/components/agents/AgentDiffReviewer.tsx` | component | request-response | `src/components/settings/BackupImportCard.tsx` | role-match |
| `src/components/agents/DiffHunkView.tsx` | component | transform / render | `src/components/tasks/TaskTable.tsx` | exact |
| `src/components/agents/DiffInlineCommentModal.tsx` | component | request-response | `src/components/ai/ScopePickerModal.tsx` | exact |
| `src/components/agents/ShellPermissionModal.tsx` | component | request-response | `src/components/settings/ImportPreviewModal.tsx` | exact |
| `src/components/agents/RunGhostDevModal.tsx` | component | request-response | `src/components/ai/ScopePickerModal.tsx` | exact |
| `src/components/settings/GhostDevConfigCard.tsx` | component | CRUD | `src/components/settings/NineRouterConfigCard.tsx` | exact |
| `src/components/shell/Navigation.tsx` | component | request-response | `src/components/shell/Navigation.tsx` | exact |
| `src/App.tsx` | component / router | request-response | `src/App.tsx` | exact |
| `src/components/tasks/TaskTable.tsx` | component | event-driven | `src/components/tasks/TaskTable.tsx` | exact |
| `src/components/tasks/TaskDrawer.tsx` | component | event-driven | `src/components/tasks/TaskDrawer.tsx` | exact |
| `src/views/SettingsView.tsx` | view | CRUD | `src/views/SettingsView.tsx` | exact |
| `src-tauri/src/agent_manager.rs` | controller / service | streaming / process management | `src-tauri/src/jira_proxy.rs` | exact |
| `src-tauri/src/lib.rs` | config / controller | event-driven | `src-tauri/src/lib.rs` | exact |
| `tests/agents/gitDiffParser.test.ts` | test | transform | `tests/utils/documentLinks.test.ts` | exact |
| `tests/agents/whitelist.test.ts` | test | validation | `tests/utils/documentLinks.test.ts` | exact |
| `tests/agents/promptBuilder.test.ts` | test | transform | `tests/utils/documentLinks.test.ts` | exact |
| `tests/agents/AgentControlView.test.tsx` | test | request-response | `tests/views/AnalyticsView.test.tsx` | exact |

---

## Pattern Assignments

### 1. `src/types/agent.ts` (model, request-response)

**Analog:** `src/services/ai/types.ts`

**Imports pattern** (lines 1-15):
```typescript
// Type definitions with clean discriminated unions
export type AgentRole = 'master' | 'worker';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'awaiting_approval' | 'done' | 'error' | 'interrupted';
export type DiffViewMode = 'unified' | 'split';
```

**Core types pattern** (from `src/services/ai/types.ts` lines 16-41):
```typescript
export interface AgentSession {
  taskId: string;
  taskTitle: string;
  repoPath: string;
  worktreePath: string;
  branchName: string;
  masterPid: number;
  masterModel: string;
  workerModel: string;
  status: AgentStatus;
  startedAt: string;
  finishedAt?: string;
  activeWorkers: WorkerSession[];
}

export interface WorkerSession {
  workerId: string;
  role: string;
  pid: number;
  model: string;
  status: AgentStatus;
  subtaskPrompt: string;
  startedAt: string;
}

export interface GhostDevStreamChunk {
  taskId: string;
  workerId?: string;
  source: 'master' | 'worker';
  timestamp: string;
  type: 'log' | 'tool_call' | 'tool_result' | 'error' | 'status_change';
  content: string;
}

export interface ShellPermissionRequest {
  taskId: string;
  command: string;
  workingDir: string;
  requestId: string;
}
```

---

### 2. `src/utils/gitDiffParser.ts` (utility, transform)

**Analog:** `src/utils/filter.ts`

**Core transform pattern**:
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
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: 'modified' | 'added' | 'deleted';
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export function parseGitDiff(rawDiff: string): DiffFile[] {
  if (!rawDiff || !rawDiff.trim()) return [];
  const lines = rawDiff.split('\n');
  const files: DiffFile[] = [];
  // Parse diff --git headers, hunk @@ -a,b +c,d @@ and +/- lines
  return files;
}
```

---

### 3. `src/utils/ghostDevPrompt.ts` (utility, transform)

**Analog:** `src/services/ai/claudeCliService.ts`

**Imports pattern** (lines 1-12):
```typescript
import type { Task } from '../types/models';
import { isLocalPath, normalizeLocalPath } from './documentLinks';
```

**Prompt builder pattern** (from `src/services/ai/claudeCliService.ts` lines 18-42):
```typescript
export function generateGhostDevMasterPrompt(task: Task, repoPath: string): string {
  const parts: string[] = [
    `Bạn là Master/Lead Agent chịu trách nhiệm lập kế hoạch, phân rã công việc và điều phối giải quyết tác vụ: "${task.name}".`,
    `Thư mục làm việc: ${repoPath}`,
  ];
  if (task.description?.trim()) {
    parts.push(`Mô tả chi tiết:\n${task.description.trim()}`);
  }
  const pendingChecklist = (task.checklist || []).filter((item) => !item.done);
  if (pendingChecklist.length > 0) {
    parts.push('Mục tiêu cần hoàn thành:');
    pendingChecklist.forEach((item) => parts.push(`- ${item.text}`));
  }
  return parts.join('\n\n');
}

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

---

### 4. `src/utils/shellWhitelist.ts` (utility, validation)

**Analog:** `src/utils/documentLinks.tsx`

**Whitelist pattern**:
```typescript
export const SAFE_COMMAND_PREFIXES: readonly string[] = [
  'git status',
  'git diff',
  'git log',
  'npm test',
  'npx vitest',
  'cargo check',
  'cargo test',
  'pytest',
  'go test',
] as const;

export function isCommandWhitelisted(command: string): boolean {
  const trimmed = command.trim();
  return SAFE_COMMAND_PREFIXES.some((safe) =>
    trimmed === safe || trimmed.startsWith(`${safe} `)
  );
}
```

---

### 5. `src/hooks/useGhostDevStream.ts` (hook, streaming / pub-sub)

**Analog:** `src/views/AIPopoutView.tsx`

**Imports & Listen pattern** (from `src/views/AIPopoutView.tsx` lines 50-68):
```typescript
import { useState, useEffect, useRef } from 'react';
import type { GhostDevStreamChunk } from '../types/agent';

export const MAX_STREAM_LINES = 2000;

export function useGhostDevStream(taskId?: string) {
  const [logs, setLogs] = useState<GhostDevStreamChunk[]>([]);
  const bufferRef = useRef<GhostDevStreamChunk[]>([]);

  useEffect(() => {
    if (!taskId) return;
    let unlisten: (() => void) | undefined;

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<GhostDevStreamChunk>('ghost-dev:stream-chunk', (event) => {
        if (event.payload.taskId === taskId) {
          bufferRef.current.push(event.payload);
          // Keep bounded within 2000 lines
          if (bufferRef.current.length > MAX_STREAM_LINES) {
            bufferRef.current = bufferRef.current.slice(-MAX_STREAM_LINES);
          }
          setLogs([...bufferRef.current]);
        }
      }).then((unsub) => {
        unlisten = unsub;
      });
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [taskId]);

  return { logs, clearLogs: () => { bufferRef.current = []; setLogs([]); } };
}
```

---

### 6. `src/views/AgentControlView.tsx` (view / component, event-driven)

**Analog:** `src/views/TasksView.tsx` & `src/views/NotesView.tsx`

**Splitter 3-Column Layout pattern** (Ant Design 6):
```typescript
import React, { useState } from 'react';
import { Splitter, Typography, Empty, theme } from 'antd';
import { AgentSessionList } from '../components/agents/AgentSessionList';
import { AgentTerminalLog } from '../components/agents/AgentTerminalLog';
import { AgentDiffReviewer } from '../components/agents/AgentDiffReviewer';
import { ShellPermissionModal } from '../components/agents/ShellPermissionModal';
import { useGhostDevSessions } from '../hooks/useGhostDevSessions';

export const AgentControlView: React.FC = () => {
  const { token } = theme.useToken();
  const { sessions, activeSessionId, setActiveSessionId } = useGhostDevSessions();

  return (
    <div style={{ height: 'calc(100vh - 100px)', padding: 16 }}>
      <Splitter style={{ height: '100%', boxShadow: token.boxShadowTertiary }}>
        <Splitter.Panel defaultSize="22%" min="240px" max="360px">
          <AgentSessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
          />
        </Splitter.Panel>
        <Splitter.Panel defaultSize="45%" min="400px">
          <AgentTerminalLog sessionId={activeSessionId} />
        </Splitter.Panel>
        <Splitter.Panel defaultSize="33%" min="320px">
          <AgentDiffReviewer sessionId={activeSessionId} />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};
```

---

### 7. `src-tauri/src/agent_manager.rs` (controller / service, streaming)

**Analog:** `src-tauri/src/jira_proxy.rs`

**Imports & Process spawning pattern** (from `src-tauri/src/jira_proxy.rs` lines 1-25 & tokio process):
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionPayload {
    pub task_id: String,
    pub task_title: String,
    pub repo_path: String,
    pub master_model: String,
    pub worker_model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamEventPayload {
    pub task_id: String,
    pub worker_id: Option<String>,
    pub source: String,
    pub timestamp: String,
    pub chunk_type: String,
    pub content: String,
}

#[tauri::command]
pub async fn start_ghost_dev_session(
    app: AppHandle,
    payload: StartSessionPayload,
) -> Result<String, String> {
    // 1. Create Git worktree
    // 2. Spawn Claude headless process with piped stdin/stdout/stderr
    // 3. Spawn background tokio task reading lines and emitting Tauri events
    Ok(payload.task_id)
}

#[tauri::command]
pub async fn stop_ghost_dev_session(
    task_id: String,
) -> Result<(), String> {
    // Instant hard kill process tree
    Ok(())
}
```

---

### 8. `src-tauri/src/lib.rs` (config / controller, event-driven)

**Analog:** `src-tauri/src/lib.rs`

**Command Registration & Exit Protection pattern** (from `src-tauri/src/lib.rs` lines 12-40):
```rust
mod agent_manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            // ... existing commands ...
            agent_manager::start_ghost_dev_session,
            agent_manager::stop_ghost_dev_session,
            agent_manager::list_agent_sessions,
            agent_manager::get_worktree_diff,
            agent_manager::accept_all_diff,
            agent_manager::revert_all_diff,
            agent_manager::send_agent_feedback,
            agent_manager::respond_shell_permission,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // D-18: Kill all running agent process groups safely, keep worktrees intact
                agent_manager::cleanup_on_exit();
            }
        });
}
```

---

### 9. `src/components/shell/Navigation.tsx` (component, request-response)

**Analog:** `src/components/shell/Navigation.tsx`

**Menu item with Badge counter pattern** (lines 20-58):
```typescript
import {
  // ... existing icons ...
  RobotOutlined,
} from '@ant-design/icons';
import { Badge } from 'antd';

// In Navigation items list:
{
  key: 'agents',
  icon: <RobotOutlined style={{ fontSize: 16 }} />,
  label: (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span>Agent Control</span>
      {runningAgentCount > 0 && (
        <Badge count={runningAgentCount} size="small" style={{ backgroundColor: '#4f46e5' }} />
      )}
    </div>
  ),
}
```

---

### 10. `src/components/tasks/TaskTable.tsx` & `TaskDrawer.tsx` (component, event-driven)

**Analog:** `src/components/tasks/TaskTable.tsx` lines 324-340 & `TaskDrawer.tsx` lines 900-906

**Action invocation pattern**:
```typescript
// In TaskTable.tsx getTaskMenuItems:
{
  key: 'ghost-dev',
  icon: <RobotOutlined style={{ color: '#4f46e5' }} />,
  label: 'Chạy Ghost Dev',
  onClick: () => {
    handleRunGhostDev(record);
  },
}

// In TaskDrawer.tsx extra header:
<Button
  icon={<RobotOutlined style={{ color: '#4f46e5' }} />}
  onClick={() => handleRunGhostDev(currentTask)}
  aria-label="Chạy Ghost Dev cho tác vụ này"
>
  Ghost Dev
</Button>
```

---

## Shared Patterns

### Tauri IPC Invoke Pattern
**Source:** `src/services/ai/claudeCliService.ts` & `src/services/localSqlitePersistence.ts`
**Apply to:** All Agent hooks and Tauri handlers
```typescript
export async function invokeTauriCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}
```

### Desktop OS Notification Pattern
**Source:** `src/utils/desktopNotification.ts` lines 1-35
**Apply to:** Completion and Permission request events
```typescript
import { sendDesktopNotification, isNotificationPermissionGranted } from '../../utils/desktopNotification';

if (await isNotificationPermissionGranted()) {
  sendDesktopNotification({
    title: 'Ghost Dev Agent',
    body: `Master Agent đã hoàn tất công việc cho tác vụ: ${taskTitle}`,
    requireInteraction: true,
  });
}
```

### Accessible Screen Reader Announcements
**Source:** `src/components/common/AriaLiveRegion.tsx` lines 1-25
**Apply to:** Stream state changes, Diff actions, Shell permission gates
```typescript
import { announceToScreenReader } from '../common/AriaLiveRegion';

announceToScreenReader('Ghost Dev Agent đang chờ bạn cấp quyền thực thi lệnh shell.');
```

---

## No Analog Found

All required components, hooks, models, utilities, and backend modules have direct or role analogs in the PlannerMate codebase. No files lack an analog.

---

## Metadata

**Analog search scope:** `src/`, `src-tauri/src/`, `tests/`
**Files scanned:** 58
**Pattern extraction date:** 2026-10-05
