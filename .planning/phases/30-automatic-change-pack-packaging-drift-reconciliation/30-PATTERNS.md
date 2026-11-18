# Phase 30: Automatic Change Pack Packaging & Drift Reconciliation - Pattern Map

**Mapped:** 2026-11-06  
**Files analyzed:** 6 (3 modified, 1 new service, 2 new unit/integration tests)  
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/services/changePackPackager.ts` | service | file-I/O & streaming | `src/services/gitRemoteService.ts` | exact (SSH git command & runner) |
| `src/services/wizard/changePack.ts` | utility & model | transform & validation | `src/services/wizard/changePack.ts` | exact (in-place enhancement) |
| `src/components/sdlc/steps/Step4ChangePackView.tsx` | component | request-response & stateful UI | `src/components/sdlc/steps/Step3CodeGuideView.tsx` | exact (Snapshot & SSH handling) |
| `src/views/ProjectSdlcView.tsx` | component | workflow orchestration | `src/views/ProjectSdlcView.tsx` | exact (props pass-through) |
| `src/services/__tests__/changePackPackager.test.ts` | test | batch / mock execution | `src/services/wizard/__tests__/workflowCoordinator.test.ts` | role-match |
| `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` | test | component DOM testing | `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` | exact |

---

## Pattern Assignments

### `src/services/changePackPackager.ts` (service, file-I/O & streaming)

**Analog:** `src/services/gitRemoteService.ts` (lines 35-75, lines 237-252, lines 280-298)

**Imports pattern:**
```typescript
import JSZip from 'jszip';
import type { SshConfig } from '../types/ssh';
import type { BranchSnapshot, RemoteFileStat } from '../types/gitRemote';
import { runGitCommand, escapeShellArg, checkHeadDrift, checkDirtyStatus } from './gitRemoteService';
import { getSshSecret } from './sshService';
import {
  ChangePackMetaSchema,
  type ChangePackMeta,
  type ChangePackLimits,
  getEffectiveChangePackLimits,
} from './wizard/changePack';
```

**SSH Git & Command Runner pattern:**
```typescript
// Copied from src/services/gitRemoteService.ts lines 245-252
const rangeArg = escapeShellArg(`${base}..${target}`);
const diffPatch = await runGitCommand(
  config,
  repoPath,
  ['diff', '--binary', rangeArg],
  secret
);
```

**File Content Extraction & Entry Filtering pattern:**
```typescript
// Copied pattern from src/services/wizard/changePack.ts lines 98-107 & gitRemoteService
for (const file of fileStats) {
  const path = file.path;
  const isSql = /^sql\/.+\.(?:sql|plb|pck|pkb)$/i.test(path);
  const isAdded = file.status === 'added';

  if (isSql) {
    const content = await runGitCommand(
      config,
      repoPath,
      ['show', `${escapeShellArg(targetCommit)}:${escapeShellArg(path)}`],
      secret
    );
    zip.file(path, content);
  } else if (isAdded) {
    const lower = path.toLowerCase();
    if (lower.split('/').includes('node_modules') || lower.endsWith('package-lock.json')) {
      continue;
    }
    const zipPath = `new-files/${path.replace(/^\/+/, '')}`;
    const content = await runGitCommand(
      config,
      repoPath,
      ['show', `${escapeShellArg(targetCommit)}:${escapeShellArg(path)}`],
      secret
    );
    zip.file(zipPath, content);
  }
}
```

**Progress Stepper Callback & Error Handling pattern:**
```typescript
export interface PackageProgressCallback {
  (step: 'checking' | 'diff' | 'files' | 'compressing' | 'validating', message: string): void;
}
```

---

### `src/services/wizard/changePack.ts` (utility & model, transform & validation)

**Analog:** `src/services/wizard/changePack.ts` (lines 5-30, 132-150)

**Desktop-scaled Limits pattern:**
```typescript
// Modified in src/services/wizard/changePack.ts
export interface ChangePackLimits {
  maxCompressedBytes: number;
  maxExpandedBytes: number;
  maxEntryBytes: number;
  maxEntries: number;
}

export const DesktopChangePackLimits: Readonly<ChangePackLimits> = Object.freeze({
  maxCompressedBytes: 26_214_400, // 25 MB
  maxExpandedBytes: 104_857_600,  // 100 MB
  maxEntryBytes: 10_485_760,      // 10 MB
  maxEntries: 1000,
});

export const ChangePackLimits: Readonly<ChangePackLimits> = DesktopChangePackLimits;

export function getEffectiveChangePackLimits(
  customLimits?: Partial<ChangePackLimits>
): ChangePackLimits {
  return {
    ...DesktopChangePackLimits,
    ...(customLimits || {}),
  };
}
```

**Zod Schema ceiling adaptation:**
```typescript
// Update ChangePackManifestSchema entries max bound to support desktop limit
export const ChangePackManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  packHash: z.string().regex(/^[a-f0-9]{64}$/),
  identity: ChangePackIdentitySchema,
  meta: ChangePackMetaSchema,
  entries: z.array(ChangePackEntrySchema).max(10_000), // Desktop-safe ceiling
  compressedBytes: z.number().int().nonnegative(),
  expandedBytes: z.number().int().nonnegative(),
  commitCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  coverageStatus: z.enum(['complete', 'partial']),
});
```

---

### `src/components/sdlc/steps/Step4ChangePackView.tsx` (component, stateful UI & workflow)

**Analog:** `src/components/sdlc/steps/Step3CodeGuideView.tsx` (lines 75-120, lines 201-260) & current `Step4ChangePackView.tsx`

**Imports pattern:**
```typescript
import React, { useState, useEffect } from 'react';
import {
  Typography,
  Alert,
  Button,
  message,
  Spin,
  theme,
  Card,
  Space,
  Tag,
  Collapse,
  Steps,
  Modal,
} from 'antd';
import {
  ArrowRightOutlined,
  UploadOutlined,
  SyncOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { BranchSnapshot } from '../../../types/gitRemote';
import { getProjectRepoSshBinding } from '../../../services/gitRemoteService';
import { getSshConfigs } from '../../../services/sshService';
import { createChangePackFromSnapshot } from '../../../services/changePackPackager';
```

**Snapshot Card & Active Packaging Trigger pattern:**
```typescript
// Step 4 header with BranchSnapshot preview
<Card
  size="small"
  title={
    <Space>
      <BranchesOutlined />
      <span>Branch Snapshot đã duyệt (Bước 3)</span>
    </Space>
  }
  extra={
    <Tag color="success" icon={<CheckCircleOutlined />}>
      Đã phê duyệt
    </Tag>
  }
  style={{ background: token.colorBgContainer }}
>
  <Space direction="vertical" style={{ width: '100%' }}>
    <div>
      <Typography.Text type="secondary">Nhánh: </Typography.Text>
      <Tag color="blue">{branchSnapshot.targetBranch}</Tag>
      <Typography.Text type="secondary">Base: </Typography.Text>
      <Typography.Text code>{branchSnapshot.baseCommit?.slice(0, 8)}</Typography.Text>
      <Typography.Text type="secondary" style={{ marginLeft: 8 }}>Head: </Typography.Text>
      <Typography.Text code>{branchSnapshot.headSha?.slice(0, 8)}</Typography.Text>
    </div>
    <Button
      type="primary"
      icon={<CloudUploadOutlined />}
      loading={packagingLoading}
      onClick={handlePackageFromSnapshot}
    >
      Đóng gói & Đối chiếu từ Snapshot
    </Button>
  </Space>
</Card>
```

**Accordion Fallback for Manual Dropzone pattern:**
```typescript
<Collapse
  ghost
  activeKey={manualAccordionOpen ? ['manual_pack'] : []}
  onChange={(keys) => setManualAccordionOpen(keys.includes('manual_pack'))}
  items={[
    {
      key: 'manual_pack',
      label: (
        <Space>
          <UploadOutlined />
          <Typography.Text strong>
            Nạp Change Pack thủ công (.zip) — Dự phòng khi không có SSH
          </Typography.Text>
        </Space>
      ),
      children: (
        <div style={{ padding: 12, border: `1px dashed ${token.colorBorder}` }}>
          <ChangePackDropzone onSelect={handleSelectFile} disabled={!solutionArtifact} />
        </div>
      ),
    },
  ]}
/>
```

---

### `src/views/ProjectSdlcView.tsx` (view, routing & workflow coordinator integration)

**Analog:** `src/views/ProjectSdlcView.tsx` (lines 756-780)

**Handoff of `branchSnapshot` to Step 4 pattern:**
```typescript
case 'CHANGE_PACK':
  return (
    <Step4ChangePackView
      projectId={projectId}
      crId={activeCrId}
      crCode={workflowState?.metadata.cr ?? ''}
      solutionArtifact={workflowState?.artifacts.solution}
      branchSnapshot={workflowState?.artifacts.branchSnapshot}
      initialDriftResult={workflowState?.artifacts.driftResult}
      onCommitChangePackAndDrift={async (packHash, packTitle, driftResult) => {
        try {
          await coordinator.commitChangePackAndDrift(
            packHash,
            packTitle,
            driftResult
          );
        } catch (err) {
          reportGuardError(err);
        }
      }}
      onNavigateToStep={handleNavigateToStep}
      onProceedToStep5={() => handleNavigateToStep('TECH_DOCS')}
      db={db}
    />
  );
```

---

### `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` (test, component DOM)

**Analog:** `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` (lines 1-40)

**Test Setup & Mocking pattern:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step4ChangePackView } from '../Step4ChangePackView';
import * as changePackPackager from '../../../../services/changePackPackager';

describe('Step4ChangePackView Component', () => {
  const dummySnapshot = {
    targetBranch: 'feature/cr-001',
    baseCommit: '11111111',
    headSha: '22222222',
    author: 'Dev',
    approvedAt: '2026-11-06T00:00:00Z',
  };

  it('renders snapshot card and packaging button when snapshot is provided', () => {
    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        branchSnapshot={dummySnapshot as any}
        solutionArtifact={{ noteId: 'n1', version: 1, hash: 'h1' }}
        onCommitChangePackAndDrift={vi.fn()}
      />
    );

    expect(screen.getByText('Branch Snapshot đã duyệt (Bước 3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đóng gói & Đối chiếu từ Snapshot/i })).toBeInTheDocument();
  });

  it('renders warning alert and opens manual dropzone when snapshot is missing', () => {
    render(
      <Step4ChangePackView
        projectId="proj-1"
        crId="cr-1"
        crCode="CR-001"
        solutionArtifact={{ noteId: 'n1', version: 1, hash: 'h1' }}
        onCommitChangePackAndDrift={vi.fn()}
      />
    );

    expect(screen.getByText(/Chưa có Branch Snapshot được duyệt/i)).toBeInTheDocument();
  });
});
```

---

## Shared Patterns

### SSH Execution & Keyring Credentials
**Source:** `src/services/sshService.ts` & `src/services/gitRemoteService.ts`  
**Apply to:** `src/services/changePackPackager.ts`  
```typescript
const secret = (await getSshSecret(config.id)) ?? undefined;
const stdout = await runGitCommand(config, repoPath, args, secret);
```

### MultiPack State Persistence
**Source:** `src/services/wizard/sdlcCrManager.ts`  
**Apply to:** `Step4ChangePackView.tsx`  
```typescript
const existingWithoutCurrent = multiPackState.packs.filter((p) => p.hash !== manifest.packHash);
const nextState: MultiPackState = {
  activePackHash: manifest.packHash,
  packs: [newHistoryItem, ...existingWithoutCurrent],
};
await saveMultiPackState(projectId, crId, nextState, db);
```

### Path Sanitization & Entry Security Policy
**Source:** `src/services/wizard/changePack.ts`  
**Apply to:** `changePackPackager.ts`  
```typescript
function isAllowedEntry(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.split('/').includes('node_modules') || lower.endsWith('package-lock.json')) {
    return false;
  }
  return true;
}
```

---

## No Analog Found

None. All required roles, execution methods, schemas, and UI components have established analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/services/**/*`, `src/components/sdlc/**/*`, `src/views/**/*`  
**Files scanned:** 12  
**Pattern extraction date:** 2026-11-06  
