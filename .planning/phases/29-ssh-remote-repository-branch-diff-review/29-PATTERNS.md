# Phase 29: SSH Remote Repository Branch & Diff Review - Pattern Map

**Mapped:** 2026-11-06  
**Files analyzed:** 9 (3 new services/types, 2 new/upgraded UI components, 2 modified schemas/views, 2 new test suites)  
**Analogs found:** 7 / 7 core functional areas (100% matched)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/types/gitRemote.ts` | model | transform | `src/types/ssh.ts` & `src/types/agent.ts` | exact |
| `src/services/gitRemoteService.ts` | service | request-response | `src/services/sshService.ts` | exact |
| `src/services/wizard/workflowSchemas.ts` | model / schema | transform | `src/services/wizard/workflowSchemas.ts` | exact (in-tree schema modification) |
| `src/services/wizard/workflowCoordinator.ts` | service | CRUD / event-driven | `src/services/wizard/workflowCoordinator.ts` | exact (in-tree coordinator modification) |
| `src/components/sdlc/diff/RemoteDiffViewer.tsx` | component | request-response / render | `src/components/agents/DiffHunkView.tsx` | exact |
| `src/components/sdlc/steps/Step3CodeGuideView.tsx` | component | request-response / CRUD | `src/components/sdlc/steps/Step4ChangePackView.tsx` | exact |
| `src/views/ProjectSdlcView.tsx` | view / controller | event-driven | `src/views/ProjectSdlcView.tsx` | exact (in-tree host wiring) |
| `src/services/__tests__/gitRemoteService.test.ts` | test | request-response | `src/utils/__tests__/gitDiffParser.test.ts` | role-match |
| `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` | test | component / event-driven | `src/components/ai/wizard/__tests__/sdlcWorkflowHub.test.tsx` | role-match |

---

## Pattern Assignments

### 1. `src/types/gitRemote.ts` (model, transform)

**Analog:** `src/types/ssh.ts` (lines 1-40) and `src/types/agent.ts` (lines 80-105)

**Imports & Types Pattern:**
```typescript
import type { DiffFile } from './agent';

export interface RemoteGitBranch {
  name: string;
  isRemote: boolean;
  isHead: boolean;
}

export interface RemoteGitCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  message: string;
}

export interface RemoteFileStat {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface RemoteGitStatus {
  isClean: boolean;
  uncommittedFiles: Array<{
    path: string;
    indexStatus: string;
    workingTreeStatus: string;
  }>;
}

export interface RemoteDiffSummary {
  baseBranch: string;
  targetBranch: string;
  headSha: string;
  commits: RemoteGitCommit[];
  files: RemoteFileStat[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface ProjectRepoSshBinding {
  sshConfigId: string;
  remoteRepoPath: string;
  defaultBaseBranch?: string;
  updatedAt: string;
}
```

---

### 2. `src/services/gitRemoteService.ts` (service, request-response)

**Analog:** `src/services/sshService.ts` (lines 104-118, 248-264)

**Shell Argument Escaping & Command Execution Pattern:**
```typescript
import { execRemoteCommand, getSshConfigById, getSshSecret } from './sshService';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { SshConfig } from '../types/ssh';
import type {
  RemoteGitBranch,
  RemoteGitCommit,
  RemoteFileStat,
  RemoteGitStatus,
  RemoteDiffSummary,
  ProjectRepoSshBinding,
} from '../types/gitRemote';

export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function runGitCommand(
  config: SshConfig,
  repoPath: string,
  gitArgs: string[],
  secret?: string
): Promise<string> {
  const escapedArgs = gitArgs.join(' ');
  const command = `git -C ${escapeShellArg(repoPath)} --no-pager ${escapedArgs}`;
  const res = await execRemoteCommand(config, command, secret);
  if (res.exitStatus !== 0) {
    throw new Error(res.stderr.trim() || `Lệnh git thất bại với exit code ${res.exitStatus}`);
  }
  return res.stdout;
}
```

**Project Setting Persistence Pattern (Analog: `src/services/wizard/sdlcCrManager.ts` lines 43-60):**
```typescript
const PROJECT_SSH_REPO_SETTING_PREFIX = 'project_ssh_repo:';

export function getProjectSshRepoKey(projectId: string): string {
  return `${PROJECT_SSH_REPO_SETTING_PREFIX}${projectId}`;
}

export async function getProjectRepoSshBinding(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ProjectRepoSshBinding | null> {
  const row = await db.settings.get(getProjectSshRepoKey(projectId));
  if (!row || !row.value) return null;
  return row.value as ProjectRepoSshBinding;
}

export async function saveProjectRepoSshBinding(
  projectId: string,
  binding: ProjectRepoSshBinding,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: getProjectSshRepoKey(projectId),
    value: binding,
  });
}
```

---

### 3. `src/services/wizard/workflowSchemas.ts` (schema / model, transform)

**Analog:** `src/services/wizard/workflowSchemas.ts` (lines 70-135)

**Schema Definition Pattern (BranchSnapshot & SdlcWorkflowState):**
```typescript
export const RemoteFileStatSchema = z.strictObject({
  path: z.string().min(1),
  status: z.enum(['added', 'modified', 'deleted', 'renamed']),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type RemoteFileStat = z.infer<typeof RemoteFileStatSchema>;

export const BranchSnapshotSchema = z.strictObject({
  sshConfigId: z.string().min(1),
  remoteRepoPath: z.string().min(1),
  baseBranch: z.string().min(1),
  targetBranch: z.string().min(1),
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
  commitCount: z.number().int().nonnegative(),
  commitShas: z.array(z.string().regex(/^[a-f0-9]{40}$/)),
  filesChangedCount: z.number().int().nonnegative(),
  totalAdditions: z.number().int().nonnegative(),
  totalDeletions: z.number().int().nonnegative(),
  fileStats: z.array(RemoteFileStatSchema),
  approvedAt: isoTimestampSchema,
});
export type BranchSnapshot = z.infer<typeof BranchSnapshotSchema>;

// Insert into SdlcWorkflowStateSchema.artifacts:
// branchSnapshot: BranchSnapshotSchema.optional(),
```

---

### 4. `src/services/wizard/workflowCoordinator.ts` (service, CRUD / event-driven)

**Analog:** `src/services/wizard/workflowCoordinator.ts` (lines 250-297, 302-329)

**Approval & State Transition Pattern:**
```typescript
const commitBranchSnapshot = async (
  snapshot: BranchSnapshot
): Promise<SdlcWorkflowState> => {
  const state = await ensureState();
  if (!state.artifacts.solution) {
    throw guardError('SOLUTION_REQUIRED_FOR_CHANGE_PACK');
  }

  const nextState: SdlcWorkflowState = {
    ...state,
    currentStep: 'CHANGE_PACK',
    artifacts: {
      ...state.artifacts,
      branchSnapshot: snapshot,
    },
    updatedAt: now(),
  };

  return emit(nextState);
};
```

---

### 5. `src/components/sdlc/diff/RemoteDiffViewer.tsx` (component, request-response / render)

**Analog:** `src/components/agents/DiffHunkView.tsx` (lines 25-35, 109-224, 267-330)

**Diff Viewer Pattern (Unified / Split + Safety Truncation):**
```typescript
import React, { useMemo, useState } from 'react';
import { theme, Segmented, Button, Modal, Alert, Space, Typography } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { parseGitDiff } from '../../../utils/gitDiffParser';
import type { DiffViewMode } from '../../../types/agent';

export interface RemoteDiffViewerProps {
  rawDiff: string;
  filePath: string;
  viewMode?: DiffViewMode;
  onViewModeChange?: (mode: DiffViewMode) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const MAX_DIFF_LINES = 5000;

export const RemoteDiffViewer: React.FC<RemoteDiffViewerProps> = ({
  rawDiff,
  filePath,
  viewMode = 'split',
  onViewModeChange,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const { token } = theme.useToken();
  const [forceFullDiff, setForceFullDiff] = useState(false);

  const diffFiles = useMemo(() => parseGitDiff(rawDiff), [rawDiff]);
  const currentDiffFile = useMemo(
    () => diffFiles.find((f) => f.newPath === filePath || f.oldPath === filePath) || diffFiles[0],
    [diffFiles, filePath]
  );

  const lineCount = useMemo(() => rawDiff.split('\n').length, [rawDiff]);
  const isCapped = lineCount > MAX_DIFF_LINES && !forceFullDiff;

  // Render unified or side-by-side hunks based on viewMode
  // ...
};
```

---

### 6. `src/components/sdlc/steps/Step3CodeGuideView.tsx` (component, request-response / CRUD)

**Analog:** `src/components/sdlc/steps/Step4ChangePackView.tsx` (lines 50-85) & `src/components/common/ResizeSplitter.tsx`

**State, Layout, Splitter & Verification Pattern:**
```typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Space,
  Select,
  Input,
  Button,
  Alert,
  Spin,
  Tag,
  Typography,
  Tooltip,
  theme,
  message,
} from 'antd';
import {
  BranchesOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SyncOutlined,
  ArrowRightOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import { ResizeSplitter } from '../../common/ResizeSplitter';
import { RemoteDiffViewer } from '../diff/RemoteDiffViewer';
import {
  getRemoteBranches,
  getCommitLog,
  getDiffSummary,
  getFileDiff,
  checkDirtyStatus,
  checkHeadDrift,
  getProjectRepoSshBinding,
  saveProjectRepoSshBinding,
} from '../../../services/gitRemoteService';
import { getSshConfigs } from '../../../services/sshService';
import type { SshConfig } from '../../../types/ssh';
import type { BranchSnapshot } from '../../../services/wizard/workflowSchemas';
import type { RemoteDiffSummary } from '../../../types/gitRemote';

export interface Step3CodeGuideViewProps {
  projectId: string;
  crCode?: string;
  approvedSolutionMarkdown?: string | undefined;
  savedSnapshot?: BranchSnapshot | undefined;
  onCommitBranchSnapshot: (snapshot: BranchSnapshot) => Promise<void>;
  onProceedToStep4: () => void;
  onNavigateToStep?: (step: any) => void;
  db?: any;
}
```

---

### 7. `src/views/ProjectSdlcView.tsx` (view / controller, event-driven)

**Analog:** `src/views/ProjectSdlcView.tsx` (lines 738-745)

**Step 3 Wiring Pattern:**
```typescript
case 'CODE_GUIDE':
  return (
    <Step3CodeGuideView
      projectId={projectId}
      crCode={workflowState?.metadata.cr ?? ''}
      approvedSolutionMarkdown={workflowState?.artifacts.solution?.content}
      savedSnapshot={workflowState?.artifacts.branchSnapshot}
      onCommitBranchSnapshot={async (snapshot) => {
        try {
          await coordinator.commitBranchSnapshot(snapshot);
          message.success('Đã phê duyệt branch snapshot thành công!');
        } catch (err) {
          reportGuardError(err);
        }
      }}
      onProceedToStep4={() => handleNavigateToStep('CHANGE_PACK')}
      onNavigateToStep={handleNavigateToStep}
      db={db}
    />
  );
```

---

## Shared Patterns

### 1. Tauri Native SSH Command Bridge with OS Keyring
**Source:** `src/services/sshService.ts` lines 89-98, 248-264
**Apply to:** `src/services/gitRemoteService.ts`
```typescript
const effectiveSecret = await resolveSecret(config, secret);
const { invoke } = await import('@tauri-apps/api/core');
return invoke<CommandOutput>('ssh_exec_command', {
  config,
  secret: effectiveSecret ?? null,
  command,
});
```

### 2. POSIX Shell Argument Escaping
**Source:** Project requirement (RESEARCH.md § Code Examples)
**Apply to:** All commands in `gitRemoteService.ts`
```typescript
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
```

### 3. Dexie Settings Storage for Project-Scoped State
**Source:** `src/services/wizard/sdlcCrManager.ts` lines 43-60
**Apply to:** Project SSH profile & repo path bindings
```typescript
const row = await db.settings.get(key);
await db.settings.put({ key, value });
```

### 4. IntelliJ Island Light / Compact Styling Tokens
**Source:** `src/components/sdlc/steps/Step3CodeGuideView.tsx` lines 31, 85-92
**Apply to:** `Step3CodeGuideView.tsx` and `RemoteDiffViewer.tsx`
```typescript
const { token } = theme.useToken();
// Border: token.colorBorderSecondary
// Background: token.colorFillTertiary or token.colorBgContainer
// Font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas...
```

---

## No Analog Found

None. All required patterns (SSH command invocation, Dexie project binding, schema evolution, diff parsing/rendering, 2-column resizing) have direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/services/`, `src/types/`, `src/components/`, `src/utils/`, `src/views/`  
**Files scanned:** 16  
**Pattern extraction date:** 2026-11-06
