import { describe, it, expect, vi, beforeEach } from 'vitest';

const applyHunkMock = vi.hoisted(() => vi.fn());
const revertHunkMock = vi.hoisted(() => vi.fn());
const requireProvisionedWorktreeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../sshWorktreeService', () => ({
  applyHunk: applyHunkMock,
  revertHunk: revertHunkMock,
  requireProvisionedWorktree: requireProvisionedWorktreeMock,
}));

import {
  CODE_EDIT_AGENT_NAME,
  codeEditToolName,
  TEAM_TOOL_DEFINITIONS,
  executeTeamTool,
  type TeamToolContext,
} from '../teamTools';
import type { TaskPlannerDatabase } from '../../../../db';
import type { WorktreeDescriptor } from '../../../../types/codingZone';

const WT: WorktreeDescriptor = {
  sshConfigId: 'ssh-1',
  remoteRepoPath: '/repo',
  remoteWorktreePath: '/repo/.taskmate-worktrees/agent-developer-a1',
  branch: 'taskmate/agent-developer-a1',
};

function ctx(overrides: Partial<TeamToolContext> = {}): TeamToolContext {
  return {
    db: {} as TaskPlannerDatabase,
    teamId: 't1',
    threadId: 'th1',
    agentId: 'a1',
    agentName: CODE_EDIT_AGENT_NAME,
    role: 'employee',
    codeEditAllowed: true,
    worktreeDescriptor: WT,
    ...overrides,
  };
}

const PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
].join('\n');
const HUNK = {
  oldStart: 1,
  oldCount: 1,
  newStart: 1,
  newCount: 1,
  header: '',
  lines: [
    { type: 'delete' as const, oldLineNumber: 1, content: 'old' },
    { type: 'add' as const, newLineNumber: 1, content: 'new' },
  ],
};

const ARGS = { filePath: 'src/a.ts', hunkHeader: '@@ -1 +1 @@', action: 'apply', patch: PATCH };

describe('code_edit team tool definition', () => {
  it('offers code_edit only to Agent Developer in the coordinator payload filter', () => {
    const def = TEAM_TOOL_DEFINITIONS.find((tool) => tool.function.name === codeEditToolName);
    expect(def).toBeDefined();
    expect((def!.function.parameters as Record<string, unknown>).additionalProperties).toBe(false);
    expect(def!.function.parameters.required).toContain('action');
    const names = TEAM_TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names.filter((name) => name === codeEditToolName)).toHaveLength(1);
  });
});

describe('code_edit dispatch', () => {
  beforeEach(() => {
    applyHunkMock.mockReset();
    revertHunkMock.mockReset();
    requireProvisionedWorktreeMock.mockReset();
    requireProvisionedWorktreeMock.mockImplementation((d: WorktreeDescriptor | undefined) => {
      if (!d?.remoteWorktreePath) throw new Error('WORKTREE_NOT_AVAILABLE');
      return d;
    });
  });

  it('refuses a display-name spoof without the stable capability grant (WR-05)', async () => {
    const spoof = await executeTeamTool(
      'code_edit',
      ARGS,
      ctx({ agentName: CODE_EDIT_AGENT_NAME, codeEditAllowed: undefined, worktreeDescriptor: WT })
    );
    expect(JSON.parse(spoof)).toMatchObject({ code: 'CODE_EDIT_NOT_ALLOWED' });
    expect(applyHunkMock).not.toHaveBeenCalled();
  });

  it('refuses non-developer employees and the lead before any SSH verb', async () => {
    const other = await executeTeamTool(
      'code_edit',
      ARGS,
      ctx({ agentName: 'Patrice Evra', codeEditAllowed: undefined, worktreeDescriptor: WT })
    );
    const lead = await executeTeamTool(
      'code_edit',
      ARGS,
      ctx({ agentName: CODE_EDIT_AGENT_NAME, role: 'lead', worktreeDescriptor: WT })
    );
    expect(JSON.parse(other)).toMatchObject({ code: 'CODE_EDIT_NOT_ALLOWED' });
    expect(JSON.parse(lead)).toMatchObject({ code: 'CODE_EDIT_NOT_ALLOWED' });
    expect(applyHunkMock).not.toHaveBeenCalled();
    expect(revertHunkMock).not.toHaveBeenCalled();
  });

  it('ignores a model-supplied repo/path and uses only the provisioned context descriptor', async () => {
    const result = await executeTeamTool(
      'code_edit',
      { ...ARGS, repoPath: '/main-checkout', remoteRepoPath: '/main-checkout' },
      ctx()
    );
    expect(JSON.parse(result).ok).toBe(true);
    expect(applyHunkMock).toHaveBeenCalledWith(WT, 'src/a.ts', HUNK);
    const allArgs = applyHunkMock.mock.calls.flat().join(' ');
    expect(allArgs).not.toContain('/main-checkout');
  });

  it('refuses an unprovisioned session before SSH', async () => {
    const result = await executeTeamTool('code_edit', ARGS, ctx({ worktreeDescriptor: undefined }));
    expect(JSON.parse(result)).toMatchObject({ code: 'WORKTREE_NOT_AVAILABLE' });
    expect(applyHunkMock).not.toHaveBeenCalled();
  });

  it('dispatches apply vs revert and wraps output as untrusted data', async () => {
    const applied = await executeTeamTool('code_edit', ARGS, ctx());
    const reverted = await executeTeamTool(
      'code_edit',
      { ...ARGS, action: 'revert' },
      ctx()
    );
    expect(revertHunkMock).toHaveBeenCalledWith(WT, 'src/a.ts', HUNK);
    expect(applied).toContain('DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU');
    expect(reverted).toContain('DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU');
    expect(applied).toContain('KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN');
    expect(JSON.parse(applied)).toMatchObject({ ok: true, action: 'apply' });
  });

  it('surfaces a typed failure when the worktree verb fails', async () => {
    applyHunkMock.mockRejectedValue(new Error('git apply thất bại: patch does not apply'));
    const result = await executeTeamTool('code_edit', ARGS, ctx());
    expect(JSON.parse(result)).toMatchObject({ code: 'CODE_EDIT_FAILED' });
  });
});
