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
});
