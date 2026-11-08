// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  TEAM_TOOL_DEFINITIONS,
  executeTeamTool,
  type TeamToolContext,
} from '../../../../src/services/ai/office/teamTools';
import { ensureTeamThread, saveTeamMessage } from '../../../../src/db/repositories/teamTranscriptRepo';
import { generateId } from '../../../../src/utils/uuid';

const LONG_BODY = [
  '# Báo cáo thanh toán',
  '',
  'Phân tích luồng thanh toán của hệ thống lõi cho thấy ba điểm nghẽn chính cần xử lý.',
  ...Array.from({ length: 30 }, (_, i) => `Chi tiết bổ sung số ${i} về luồng thanh toán và đối soát.`),
].join('\n');

describe('teamTools — transcript search and skill reader (AIO-MEM-02, AIO-MEM-03, AIO-SKILL-02, D-11, D-24)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;
  let teamId: string;
  let threadId: string;
  let agentId: string;

  const ctx = (overrides: Partial<TeamToolContext> = {}): TeamToolContext => ({
    db,
    teamId,
    threadId,
    agentId,
    ...overrides,
  });

  beforeEach(async () => {
    dbName = 'TestTeamTools_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();

    teamId = generateId();
    agentId = generateId();
    const now = new Date().toISOString();
    await db.aiTeams.add({
      id: teamId,
      name: 'Nhóm Thanh Toán',
      leadId: generateId(),
      status: 'idle',
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
    threadId = (await ensureTeamThread(teamId, db)).id;
  });

  afterEach(async () => {
    await db.delete();
  });

  async function seedTurn(content: string, kind: 'report' | 'instruction' = 'report') {
    return saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content,
        agentId,
        agentName: 'Lan',
        agentKind: 'employee',
        messageKind: kind,
      },
      db
    );
  }

  it('exposes the six team tool definitions', () => {
    const names = TEAM_TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names).toHaveLength(6);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_team_history',
        'read_team_turn',
        'read_skill',
        'list_linked_items',
        'get_linked_context',
        'delegate_batch',
      ])
    );
  });

  it('returns compact BM25 hits with exactly turnId, agent, timestamp, kind, excerpt', async () => {
    const turn = await seedTurn(LONG_BODY);

    const hits = JSON.parse(
      await executeTeamTool('search_team_history', { query: 'thanh toán' }, ctx())
    );

    expect(hits).toHaveLength(1);
    expect(Object.keys(hits[0]).sort()).toEqual(
      ['agent', 'excerpt', 'kind', 'timestamp', 'turnId'].sort()
    );
    expect(hits[0].turnId).toBe(turn.id);
    expect(hits[0].agent).toBe('Lan');
    expect(hits[0].timestamp).toBe(turn.createdAt);
    expect(hits[0].kind).toBe('report');
    expect(hits[0].excerpt.length).toBeLessThan(LONG_BODY.length);
    expect(hits[0].excerpt).toContain('thanh toán');
  });

  it('defaults limit to 8 and clamps to 20', async () => {
    for (let i = 0; i < 25; i += 1) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2));
      await seedTurn(`Báo cáo thanh toán số ${i}`);
    }

    const defaultHits = JSON.parse(
      await executeTeamTool('search_team_history', { query: 'thanh toán' }, ctx())
    );
    expect(defaultHits).toHaveLength(8);

    const clampedHits = JSON.parse(
      await executeTeamTool('search_team_history', { query: 'thanh toán', limit: 500 }, ctx())
    );
    expect(clampedHits).toHaveLength(20);
  });

  it('reads one full turn from this team thread', async () => {
    const turn = await seedTurn(LONG_BODY);

    const result = JSON.parse(
      await executeTeamTool('read_team_turn', { turnId: turn.id }, ctx())
    );

    expect(result).toMatchObject({
      turnId: turn.id,
      agent: 'Lan',
      timestamp: turn.createdAt,
      kind: 'report',
    });
    expect(result.content).toBe(LONG_BODY);
  });

  it('refuses a turnId belonging to a different thread', async () => {
    const otherTeamId = generateId();
    const now = new Date().toISOString();
    await db.aiTeams.add({
      id: otherTeamId,
      name: 'Nhóm Khác',
      leadId: generateId(),
      status: 'idle',
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
    const otherThreadId = (await ensureTeamThread(otherTeamId, db)).id;
    const foreign = await saveTeamMessage(
      { threadId: otherThreadId, role: 'user', content: 'Bí mật nhóm khác' },
      db
    );

    const result = JSON.parse(
      await executeTeamTool('read_team_turn', { turnId: foreign.id }, ctx())
    );

    expect(result).toMatchObject({ refused: true, code: 'TURN_NOT_IN_TEAM' });
    expect(JSON.stringify(result)).not.toContain('Bí mật nhóm khác');
  });

  it('returns the assigned skill body verbatim', async () => {
    const skillId = generateId();
    const now = new Date().toISOString();
    await db.aiSkills.add({
      id: skillId,
      name: 'Kiểm thử hồi quy',
      description: 'Quy trình kiểm thử hồi quy',
      body: '# Quy trình\n\nBước 1. Chạy bộ kiểm thử.\nBước 2. Ghi nhận kết quả.',
      createdAt: now,
      updatedAt: now,
    });

    const result = JSON.parse(await executeTeamTool('read_skill', {}, ctx({ skillId })));

    expect(result.name).toBe('Kiểm thử hồi quy');
    expect(result.description).toBe('Quy trình kiểm thử hồi quy');
    expect(result.body).toBe('# Quy trình\n\nBước 1. Chạy bộ kiểm thử.\nBước 2. Ghi nhận kết quả.');
  });

  it('refuses read_skill when the agent has no skill assigned', async () => {
    const result = JSON.parse(await executeTeamTool('read_skill', {}, ctx()));

    expect(result).toMatchObject({ refused: true, code: 'SKILL_NOT_ASSIGNED' });
  });
});
