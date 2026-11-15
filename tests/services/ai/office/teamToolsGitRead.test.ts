// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  TEAM_TOOL_DEFINITIONS,
  executeTeamTool,
  type TeamToolContext,
} from '../../../../src/services/ai/office/teamTools';
import { ensureTeamThread } from '../../../../src/db/repositories/teamTranscriptRepo';
import { isMutationTool } from '../../../../src/services/ai/aiTools';
import { SSH_CONFIGS_SETTING_KEY } from '../../../../src/types/ssh';
import { generateId } from '../../../../src/utils/uuid';
import { escapeShellArg } from '../../../../src/services/gitRemoteService';
import { execRemoteCommand } from '../../../../src/services/sshService';

/**
 * Phase 42 D-08: `execRemoteCommand` is the seam where a command string becomes observable.
 * Only that one export is replaced — `getSshConfigById` stays real so it reads the seeded
 * `db.settings` row, and `getSshSecret` returns null outside Tauri.
 */
vi.mock('../../../../src/services/sshService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/sshService')>();
  return { ...actual, execRemoteCommand: vi.fn() };
});

describe('teamTools git_read — definition, repo resolution, mutation class (AIO-READ-04, D-06, D-07, D-09)', () => {
  let db: TaskPlannerDatabase;
  let teamId: string;
  let threadId: string;
  let agentId: string;
  let repoSystemId: string;
  let bareSystemId: string;
  let emptyTeamId: string;

  const ctx = (overrides: Partial<TeamToolContext> = {}): TeamToolContext => ({
    db,
    teamId,
    threadId,
    agentId,
    ...overrides,
  });

  beforeEach(async () => {
    // Resets recorded call history between cases: Block B reads `mock.calls.at(-1)`, so an
    // unreset history would let a case assert against an earlier case's command.
    vi.clearAllMocks();

    db = new TaskPlannerDatabase('TestGitRead_' + Math.random().toString(36).slice(2));
    await db.open();

    const now = new Date().toISOString();
    teamId = generateId();
    agentId = generateId();
    await db.aiTeams.add({
      id: teamId,
      name: 'Nhóm Review',
      leadId: generateId(),
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
    threadId = (await ensureTeamThread(teamId, db)).id;

    const sshConfigId = generateId();
    await db.settings.put({
      key: SSH_CONFIGS_SETTING_KEY,
      value: [
        {
          id: sshConfigId,
          name: 'Dev',
          host: '10.0.0.5',
          port: 22,
          username: 'git',
          authType: 'password',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    repoSystemId = generateId();
    await db.systems.add({
      id: repoSystemId,
      name: 'Hệ thống lõi',
      code: 'CORE',
      parentId: null,
      type: 'SERVICE',
      sshConfigId,
      remoteRepoPath: '/srv/repo',
      defaultBaseBranch: 'main',
      createdAt: now,
      updatedAt: now,
    });
    await db.aiTeamLinks.add({
      id: generateId(),
      teamId,
      itemType: 'system',
      itemId: repoSystemId,
      createdAt: now,
    });

    // Linked but with no SSH profile and no repo path — the NO_LINKED_REPO case that must not
    // be misreported as SYSTEM_NOT_LINKED (T-42-02).
    bareSystemId = generateId();
    await db.systems.add({
      id: bareSystemId,
      name: 'Hệ thống chưa cấu hình',
      code: 'BARE',
      parentId: null,
      type: 'SERVICE',
      createdAt: now,
      updatedAt: now,
    });
    await db.aiTeamLinks.add({
      id: generateId(),
      teamId,
      itemType: 'system',
      itemId: bareSystemId,
      createdAt: now,
    });

    // A second team with no linked system at all, so the first team's repo link cannot leak in.
    emptyTeamId = generateId();
    await db.aiTeams.add({
      id: emptyTeamId,
      name: 'Nhóm rỗng',
      leadId: generateId(),
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('advertises git_read with a fixed seven-action enum and no command-string parameter', () => {
    const def = TEAM_TOOL_DEFINITIONS.find((tool) => tool.function.name === 'git_read');
    expect(def).toBeDefined();

    const params = def!.function.parameters;
    expect(params.properties.action.enum).toEqual([
      'branches',
      'status',
      'log',
      'diff_summary',
      'diff_file',
      'read_file',
      'tree',
    ]);
    expect(params.required).toEqual(['action']);
    // No extra key that could carry a command string, `-c`, `--output` or `--ext-diff`.
    expect(Object.keys(params.properties).sort()).toEqual([
      'action',
      'base',
      'branch',
      'dirPath',
      'filePath',
      'limit',
      'systemId',
      'target',
    ]);
  });

  it('is not mutation-classified, so it never parks an approval card (D-09)', () => {
    expect(isMutationTool('git_read')).toBe(false);
  });

  it('refuses SYSTEM_NOT_LINKED for a systemId outside the team links', async () => {
    const res = JSON.parse(
      await executeTeamTool(
        'git_read',
        { action: 'status', systemId: 'not-a-linked-id' },
        ctx()
      )
    );
    expect(res).toMatchObject({ refused: true, code: 'SYSTEM_NOT_LINKED' });
  });

  it('refuses NO_LINKED_REPO for a team with no linked system at all', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'status' }, ctx({ teamId: emptyTeamId }))
    );
    expect(res).toMatchObject({ refused: true, code: 'NO_LINKED_REPO' });
  });

  it('refuses NO_LINKED_REPO — not SYSTEM_NOT_LINKED — for a linked but repo-less system', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'status', systemId: bareSystemId }, ctx())
    );
    expect(res).toMatchObject({ refused: true, code: 'NO_LINKED_REPO' });
  });

  it('refuses INVALID_ARGUMENT for an action outside the enum', async () => {
    const res = JSON.parse(
      await executeTeamTool('git_read', { action: 'not_an_action' }, ctx())
    );
    expect(res).toMatchObject({ refused: true, code: 'INVALID_ARGUMENT' });
  });

  // ---------------------------------------------------------------------------------------
  // Block A — every action wraps its result (AIO-READ-05, D-11)
  // ---------------------------------------------------------------------------------------

  const OPEN = 'DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU';
  const CLOSE = 'KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN';

  /** Queues exactly the responses the case consumes — no more, no fewer. */
  function queue(...stdouts: string[]) {
    for (const stdout of stdouts) {
      vi.mocked(execRemoteCommand).mockResolvedValueOnce({ stdout, stderr: '', exitStatus: 0 });
    }
  }

  // The `%x1e`/`%x00` record layout `parseCommitLog` expects.
  const LOG_OUT =
    '\x1e<sha>\0<short>\0Lan\0 2026-11-01 10:00:00 +0700\0sửa lỗi' +
    '\x1e<sha2>\0<s2>\0Bình\0 2026-10-30 09:00:00 +0700\0thêm test';

  const WRAP_CASES: Array<{
    action: string;
    args: Record<string, unknown>;
    outputs: string[];
  }> = [
    {
      action: 'branches',
      args: {},
      outputs: ['main\0refs/heads/main\norigin/main\0refs/remotes/origin/main\n'],
    },
    { action: 'status', args: {}, outputs: [' M src/app.ts\n?? new.txt\n'] },
    { action: 'log', args: {}, outputs: [LOG_OUT] },
    {
      action: 'diff_summary',
      args: { base: 'main', target: 'feature/x' },
      // rev-parse, log, --numstat, --name-status — in that order.
      outputs: ['<sha>\n', LOG_OUT, '3\t1\tsrc/app.ts\n', 'M\tsrc/app.ts\n'],
    },
    {
      action: 'diff_file',
      args: { base: 'main', target: 'feature/x', filePath: 'src/app.ts' },
      outputs: ['diff --git a/src/app.ts b/src/app.ts\n+const x = 1;\n'],
    },
    {
      action: 'read_file',
      args: { branch: 'main', filePath: 'src/app.ts' },
      outputs: ['export const x = 1;\n'],
    },
    {
      action: 'tree',
      args: { branch: 'main' },
      outputs: ['100644 blob abc1234    42\tsrc/app.ts\n040000 tree def5678    -\tsrc/lib\n'],
    },
  ];

  for (const testCase of WRAP_CASES) {
    it(`${testCase.action} wraps its payload and labels it GIT ${testCase.action} /srv/repo`, async () => {
      queue(...testCase.outputs);

      const raw = await executeTeamTool(
        'git_read',
        { action: testCase.action, ...testCase.args },
        ctx()
      );

      expect(raw).toContain(OPEN);
      expect(raw).toContain(CLOSE);
      expect(raw).toContain(`GIT ${testCase.action} /srv/repo`);

      const parsed = JSON.parse(raw);
      expect(parsed.systemId).toBe(repoSystemId);
      expect(parsed.repoPath).toBe('/srv/repo');
    });
  }

  // ---------------------------------------------------------------------------------------
  // Block B — shell payloads are escaped, never interpolated (AIO-READ-04, T-42-01)
  // ---------------------------------------------------------------------------------------

  // The exact adversarial string from src/services/__tests__/gitRemoteService.test.ts:45.
  const EVIL = "'; rm -rf /; echo '";

  it('escapes a filePath payload in diff_file — whole command string, no containment check', async () => {
    queue('diff --git a/x b/x\n');

    await executeTeamTool(
      'git_read',
      { action: 'diff_file', base: 'main', target: 'feature/x', filePath: EVIL },
      ctx()
    );

    const cmd = vi.mocked(execRemoteCommand).mock.calls.at(-1)![1];
    // Pinned to a literal, independent of `escapeShellArg`, so a handler that concatenates a
    // raw value produces a different string and fails.
    expect(cmd).toBe(
      "git -C '/srv/repo' --no-pager diff 'main..feature/x' -- ''\\''; rm -rf /; echo '\\'''"
    );
  });

  it('escapes a branch payload in read_file — the object spec is built from escaped parts', async () => {
    queue('export const x = 1;\n');

    await executeTeamTool(
      'git_read',
      { action: 'read_file', branch: EVIL, filePath: 'src/app.ts' },
      ctx()
    );

    const cmd = vi.mocked(execRemoteCommand).mock.calls.at(-1)![1];
    expect(cmd).toBe(
      `git -C ${escapeShellArg('/srv/repo')} --no-pager show ${escapeShellArg(EVIL + ':src/app.ts')}`
    );
  });

  it('escapes a branch payload in log', async () => {
    queue(LOG_OUT);

    await executeTeamTool('git_read', { action: 'log', branch: EVIL }, ctx());

    const cmd = vi.mocked(execRemoteCommand).mock.calls.at(-1)![1];
    expect(cmd).toBe(
      `git -C ${escapeShellArg('/srv/repo')} --no-pager log ${escapeShellArg(EVIL)} -n 20 --format='%x1e%H%x00%h%x00%an%x00%ad%x00%s' --date=iso`
    );
  });

  it('escapes a base payload in diff_summary — the range is one escaped argument', async () => {
    queue('<sha>\n', LOG_OUT, '3\t1\tsrc/app.ts\n', 'M\tsrc/app.ts\n');

    await executeTeamTool(
      'git_read',
      { action: 'diff_summary', base: EVIL, target: 'main' },
      ctx()
    );

    const calls = vi.mocked(execRemoteCommand).mock.calls;
    expect(calls).toHaveLength(4);
    // Third call is `diff --numstat <range>`.
    expect(calls.at(-2)![1]).toBe(
      `git -C ${escapeShellArg('/srv/repo')} --no-pager diff --numstat ${escapeShellArg(EVIL + '..main')}`
    );
  });

  it('turns a git failure into a refusal, never a throw', async () => {
    vi.mocked(execRemoteCommand).mockResolvedValueOnce({
      stdout: '',
      stderr: 'fatal: bad revision',
      exitStatus: 128,
    });

    // `resolves`, never the rejection matcher: a git throw must become a refusal value.
    const promise = executeTeamTool('git_read', { action: 'status' }, ctx());
    await expect(promise).resolves.toBeTypeOf('string');
    expect(JSON.parse(await promise)).toMatchObject({
      refused: true,
      code: 'INVALID_ARGUMENT',
    });
  });
});
