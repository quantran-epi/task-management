// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  beginTurn,
  endTurn,
  isAgentInUse,
  isSkillInUse,
  reset,
} from '../../../../src/services/ai/office/liveUseRegistry';

// WR-11: delegate to the real registry by default; individual tests override one call.
vi.mock('../../../../src/services/ai/office/liveUseRegistry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/liveUseRegistry')>();
  return {
    ...actual,
    isAgentInUse: vi.fn((id: string) => actual.isAgentInUse(id)),
    isSkillInUse: vi.fn((id: string) => actual.isSkillInUse(id)),
  };
});
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  countTeamsUsingEmployee,
  countAgentsUsingSkill,
} from '../../../../src/db/repositories/aiOfficeRepo';
import { generateId } from '../../../../src/utils/uuid';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import {
  ensureTeamThread,
  saveTeamMessage,
} from '../../../../src/db/repositories/teamTranscriptRepo';
import { exportBackupPayload } from '../../../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../../../src/services/backup/validateBackup';

const EMPLOYEE = {
  name: 'Lan',
  role: 'Researcher',
  capability: 'Tìm và tóm tắt tài liệu',
  persona: '# Persona\nCẩn thận, dẫn nguồn.',
  model: 'claude-sonnet',
};

const SKILL_BODY = '# Skill\nBước 1: đọc.\nBước 2: tóm tắt.\nBước 3: trích nguồn.';

describe('aiOfficeRepo (AIO-EMP-01, AIO-EMP-02, AIO-SKILL-01)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbName = 'TestAiOfficeRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    reset();
    await db.delete();
  });

  it('creates an employee with a generated UUID and ISO timestamps', async () => {
    const created = await createEmployee(EMPLOYEE, db);

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(created.name).toBe('Lan');
    expect(created.createdAt).toBe(created.updatedAt);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(created.skillId).toBeUndefined();
  });

  it('rejects a name over 60 characters and an empty persona', async () => {
    await expect(createEmployee({ ...EMPLOYEE, name: 'x'.repeat(61) }, db)).rejects.toThrow();
    await expect(createEmployee({ ...EMPLOYEE, persona: '   ' }, db)).rejects.toThrow();
  });

  it('updates only the target row and a team referencing the id sees the new persona', async () => {
    const target = await createEmployee(EMPLOYEE, db);
    const other = await createEmployee({ ...EMPLOYEE, name: 'Minh' }, db);

    const teamId = generateId();
    await db.aiTeamMembers.add({
      id: generateId(),
      teamId,
      agentId: target.id,
      role: 'employee',
      budgetTokens: 0,
      usedTokens: 0,
    });

    const updated = await updateEmployee(target.id, { persona: '# Mới' }, db);
    expect(updated.persona).toBe('# Mới');
    expect(updated.name).toBe(target.name);

    const resolved = await db.aiEmployees.get(target.id);
    expect(resolved?.persona).toBe('# Mới');
    expect((await db.aiEmployees.get(other.id))?.persona).toBe(EMPLOYEE.persona);
    expect(await countTeamsUsingEmployee(target.id, db)).toBe(1);
  });

  it('refuses to delete an employee still on a roster and names the group', async () => {
    const employee = await createEmployee(EMPLOYEE, db);
    const team = await createTeam(
      { name: 'Nhóm A', leadId: undefined, status: 'active', budgetTokens: 0, employeeIds: [employee.id] },
      db
    );
    const memberRows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();

    const result = await deleteEmployee(employee.id, db);

    expect(result).toEqual({
      deleted: false,
      code: 'IN_USE',
      entity: 'employee',
      usedBy: [{ teamId: team.id, teamName: 'Nhóm A' }],
    });
    expect(await db.aiEmployees.get(employee.id)).toBeDefined();
    expect(await db.aiTeamMembers.where('teamId').equals(team.id).toArray()).toHaveLength(
      memberRows.length
    );
  });

  it('refuses to delete an employee a running turn still uses', async () => {
    const employee = await createEmployee(EMPLOYEE, db);
    beginTurn(employee.id, []);

    const result = await deleteEmployee(employee.id, db);

    expect(result.deleted).toBe(false);
    expect(result).toMatchObject({ code: 'IN_USE', entity: 'employee' });
    expect(await db.aiEmployees.get(employee.id)).toBeDefined();
  });

  it('refuses when a turn claims the employee after the roster check passed (WR-11)', async () => {
    const employee = await createEmployee(EMPLOYEE, db);
    beginTurn(employee.id, []);
    // First (roster) check sees a clear registry; the pre-delete check sees the real claim.
    vi.mocked(isAgentInUse).mockReturnValueOnce(false);

    const result = await deleteEmployee(employee.id, db);

    expect(result).toEqual({
      deleted: false,
      code: 'IN_USE',
      entity: 'employee',
      usedBy: [],
    });
    expect(await db.aiEmployees.get(employee.id)).toBeDefined();
  });

  it('deletes an unreferenced employee', async () => {
    const employee = await createEmployee(EMPLOYEE, db);

    expect(await deleteEmployee(employee.id, db)).toEqual({ deleted: true });
    expect(await db.aiEmployees.get(employee.id)).toBeUndefined();
  });

  it('round-trips a skill body byte-identically and leaves description untouched on body update', async () => {
    const created = await createSkill(
      { name: 'Research', description: 'Quy trình nghiên cứu', body: SKILL_BODY },
      db
    );

    const [readBack] = await listSkills(db);
    expect(readBack?.body).toBe(SKILL_BODY);

    const updated = await updateSkill(created.id, { body: '# Skill\nChỉ đổi body.' }, db);
    expect(updated.body).toBe('# Skill\nChỉ đổi body.');
    expect(updated.description).toBe('Quy trình nghiên cứu');
  });

  it('updateSkill tạo một phiên bản đã duyệt cùng transaction (D-09)', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);

    await updateSkill(
      skill.id,
      { name: 'Tên mới', description: 'Mô tả mới', body: '# Mới' },
      db
    );

    const rows = await db.aiSkillVersions.where('skillId').equals(skill.id).toArray();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.status).toBe('approved');
    expect(row?.version).toBe(1);
    expect(row?.baseVersion).toBe(0);
    expect(row?.name).toBe('Tên mới');
    expect(row?.description).toBe('Mô tả mới');
    expect(row?.body).toBe('# Mới');
    expect(row?.decidedAt).toBe(row?.createdAt);

    const stored = await db.aiSkills.get(skill.id);
    expect(stored?.name).toBe('Tên mới');
    expect(stored?.description).toBe('Mô tả mới');
    expect(stored?.body).toBe('# Mới');
  });

  it('updateSkill numbers the next manual save as max(approved) + 1 (D-09, D-14)', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);

    await updateSkill(skill.id, { body: 'b1' }, db);
    await updateSkill(skill.id, { body: 'b2' }, db);

    // D-14: a pending row carries no number and must not shift the next manual save.
    await db.aiSkillVersions.add({
      id: generateId(),
      skillId: skill.id,
      status: 'pending',
      name: 'S',
      description: 'd',
      body: 'b3',
      createdAt: new Date().toISOString(),
    });

    await updateSkill(skill.id, { body: 'b4' }, db);

    const approved = (await db.aiSkillVersions.where('skillId').equals(skill.id).toArray())
      .filter((row) => row.status === 'approved')
      .map((row) => row.version)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(approved).toEqual([1, 2, 3]);
  });

  it('updateSkill leaves both tables unchanged when the skill row is missing (D-09)', async () => {
    await expect(updateSkill(generateId(), { body: '# X' }, db)).rejects.toThrow(
      /Không tìm thấy kỹ năng/
    );
    expect(await db.aiSkillVersions.count()).toBe(0);
  });

  it('createSkill writes no version row (D-10)', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);

    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(0);
  });

  it('updateSkill writes no version row when nothing changed (WR-01)', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    await updateSkill(skill.id, { body: 'b1' }, db);

    // A no-op save must not mint a number — that would flip every pending proposal stale.
    const unchanged = await updateSkill(skill.id, {}, db);
    expect(unchanged.body).toBe('b1');
    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(1);

    // A patch that restates the current values is a no-op too.
    await updateSkill(skill.id, { name: 'S', description: 'd', body: 'b1' }, db);
    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(1);
  });

  it('refuses to delete a skill assigned to a profile and names the agent', async () => {
    const skill = await createSkill(
      { name: 'Research', description: 'Quy trình nghiên cứu', body: SKILL_BODY },
      db
    );
    const employee = await createEmployee({ ...EMPLOYEE, skillId: skill.id }, db);

    expect(await countAgentsUsingSkill(skill.id, db)).toBe(1);

    const result = await deleteSkill(skill.id, db);

    expect(result).toEqual({
      deleted: false,
      code: 'IN_USE',
      entity: 'skill',
      usedBy: [{ agentId: employee.id, agentName: employee.name }],
    });
    expect(await db.aiSkills.get(skill.id)).toBeDefined();
    expect((await db.aiEmployees.get(employee.id))?.skillId).toBe(skill.id);
  });

  it('refuses to delete a skill a running turn still uses', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    beginTurn('agent-1', [skill.id]);

    expect((await deleteSkill(skill.id, db)).deleted).toBe(false);
    expect(await db.aiSkills.get(skill.id)).toBeDefined();
  });

  it('refuses when a turn claims the skill after the profile check passed (WR-11)', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    const versionId = generateId();
    await db.aiSkillVersions.add({
      id: versionId,
      skillId: skill.id,
      // D-14: a pending row carries no number.
      status: 'pending',
      name: 'S',
      description: 'd',
      body: 'b',
      createdAt: new Date().toISOString(),
    });
    beginTurn('agent-1', [skill.id]);
    vi.mocked(isSkillInUse).mockReturnValueOnce(false);

    const result = await deleteSkill(skill.id, db);

    expect(result).toEqual({ deleted: false, code: 'IN_USE', entity: 'skill', usedBy: [] });
    expect(await db.aiSkills.get(skill.id)).toBeDefined();
    expect(await db.aiSkillVersions.get(versionId)).toBeDefined();
  });

  it('deletes an unreferenced skill together with its version rows', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    await db.aiSkillVersions.bulkAdd([
      {
        id: generateId(),
        skillId: skill.id,
        version: 1,
        status: 'approved',
        name: 'S',
        description: 'd',
        body: 'b',
        createdAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        skillId: skill.id,
        // D-14: a pending row carries no number.
        status: 'pending',
        name: 'S',
        description: 'd',
        body: 'b2',
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(await deleteSkill(skill.id, db)).toEqual({ deleted: true });

    expect(await db.aiSkills.get(skill.id)).toBeUndefined();
    expect(await db.aiSkillVersions.where('skillId').equals(skill.id).count()).toBe(0);
  });

  it('leaves version rows intact when the skill delete is refused', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    const versionId = generateId();
    await db.aiSkillVersions.add({
      id: versionId,
      skillId: skill.id,
      version: 1,
      status: 'approved',
      name: 'S',
      description: 'd',
      body: 'b',
      createdAt: new Date().toISOString(),
    });
    await createEmployee({ ...EMPLOYEE, skillId: skill.id }, db);

    expect((await deleteSkill(skill.id, db)).deleted).toBe(false);
    expect(await db.aiSkillVersions.get(versionId)).toBeDefined();
  });

  it('lists employees, leads and skills sorted by createdAt', async () => {
    const first = await createEmployee({ ...EMPLOYEE, name: 'A' }, db);
    await new Promise((r) => setTimeout(r, 3));
    const second = await createEmployee({ ...EMPLOYEE, name: 'B' }, db);

    const employees = await listEmployees(db);
    expect(employees.map((e) => e.id)).toEqual([first.id, second.id]);

    const leadA = await createLead({ ...EMPLOYEE, name: 'Lead A' }, db);
    await new Promise((r) => setTimeout(r, 3));
    const leadB = await createLead({ ...EMPLOYEE, name: 'Lead B' }, db);
    expect((await listLeads(db)).map((l) => l.id)).toEqual([leadA.id, leadB.id]);

    const skillA = await createSkill({ name: 'S1', description: 'd', body: 'b' }, db);
    await new Promise((r) => setTimeout(r, 3));
    const skillB = await createSkill({ name: 'S2', description: 'd', body: 'b' }, db);
    expect((await listSkills(db)).map((s) => s.id)).toEqual([skillA.id, skillB.id]);
  });

  it('updates a lead and refuses to delete one a group still names', async () => {
    const lead = await createLead({ ...EMPLOYEE, name: 'Lead' }, db);
    const updated = await updateLead(lead.id, { capability: 'Điều phối' }, db);
    expect(updated.capability).toBe('Điều phối');
    expect(updated.name).toBe('Lead');

    const team = await createTeam(
      { name: 'Nhóm Lead', leadId: lead.id, status: 'active', budgetTokens: 0 },
      db
    );

    expect(await deleteLead(lead.id, db)).toEqual({
      deleted: false,
      code: 'IN_USE',
      entity: 'lead',
      usedBy: [{ teamId: team.id, teamName: 'Nhóm Lead' }],
    });
    expect(await db.aiLeads.get(lead.id)).toBeDefined();
  });

  it('deletes an unreferenced lead', async () => {
    const lead = await createLead({ ...EMPLOYEE, name: 'Lead' }, db);

    expect(await deleteLead(lead.id, db)).toEqual({ deleted: true });
    expect(await db.aiLeads.get(lead.id)).toBeUndefined();
  });

  it('keeps the next export valid after an assigned skill is unassigned and deleted', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    const employee = await createEmployee({ ...EMPLOYEE, skillId: skill.id }, db);

    const before = validateBackupPayload(await exportBackupPayload(db));
    expect(before.valid).toBe(true);

    await updateEmployee(employee.id, { skillId: null }, db);
    expect(await deleteSkill(skill.id, db)).toEqual({ deleted: true });

    const after = validateBackupPayload(await exportBackupPayload(db));
    expect(after.valid).toBe(true);
    expect(after.errors).toEqual([]);
  });

  it('keeps the next export valid after a lead referenced only historically is deleted', async () => {
    const lead = await createLead({ ...EMPLOYEE, name: 'Lead' }, db);
    const employee = await createEmployee(EMPLOYEE, db);
    // D-05: a group with no leader is legal, so the lead has no live reference here.
    const team = await createTeam(
      { name: 'Nhóm Cũ', status: 'idle', budgetTokens: 0, employeeIds: [employee.id] },
      db
    );
    const thread = await ensureTeamThread(team.id, db);
    await saveTeamMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Tổng hợp cũ.',
        agentId: lead.id,
        agentName: 'Lead',
        agentKind: 'lead',
        messageKind: 'synthesis',
        targetAgentId: employee.id,
      },
      db
    );

    expect(await deleteLead(lead.id, db)).toEqual({ deleted: true });

    const result = validateBackupPayload(await exportBackupPayload(db));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('throws a not-found error when updating a missing row', async () => {
    await expect(updateEmployee(generateId(), { persona: 'x' }, db)).rejects.toThrow();
    await expect(updateLead(generateId(), { persona: 'x' }, db)).rejects.toThrow();
    await expect(updateSkill(generateId(), { body: 'x' }, db)).rejects.toThrow();
  });

  it('clears skillId when the patch sets it to null', async () => {
    const skill = await createSkill({ name: 'S', description: 'd', body: 'b' }, db);
    const employee = await createEmployee({ ...EMPLOYEE, skillId: skill.id }, db);

    const cleared = await updateEmployee(employee.id, { skillId: null }, db);
    expect(cleared.skillId).toBeUndefined();
  });
});

describe('liveUseRegistry (D-13, D-19)', () => {
  afterEach(() => {
    reset();
  });

  it('marks an agent and its skill in use between beginTurn and endTurn', () => {
    beginTurn('agent-1', ['skill-1']);

    expect(isAgentInUse('agent-1')).toBe(true);
    expect(isSkillInUse('skill-1')).toBe(true);

    endTurn('agent-1');

    expect(isAgentInUse('agent-1')).toBe(false);
    expect(isSkillInUse('skill-1')).toBe(false);
  });

  it('keeps a shared skill in use until both concurrent turns end', () => {
    beginTurn('agent-1', ['skill-1']);
    beginTurn('agent-2', ['skill-1']);

    endTurn('agent-1');
    expect(isSkillInUse('skill-1')).toBe(true);

    endTurn('agent-2');
    expect(isSkillInUse('skill-1')).toBe(false);
  });

  it('refcounts a duplicate start so one end does not release early', () => {
    beginTurn('agent-1', []);
    beginTurn('agent-1', []);

    endTurn('agent-1');
    expect(isAgentInUse('agent-1')).toBe(true);

    endTurn('agent-1');
    expect(isAgentInUse('agent-1')).toBe(false);
  });

  it('clears every entry on reset', () => {
    beginTurn('agent-1', ['skill-1']);
    beginTurn('agent-2', ['skill-2']);

    reset();

    expect(isAgentInUse('agent-1')).toBe(false);
    expect(isAgentInUse('agent-2')).toBe(false);
    expect(isSkillInUse('skill-1')).toBe(false);
    expect(isSkillInUse('skill-2')).toBe(false);
  });

  it('imports neither React nor Dexie', () => {
    const source = readFileSync(
      new URL('../../../../src/services/ai/office/liveUseRegistry.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/from ['"]react['"]/);
    expect(source).not.toMatch(/from ['"][^'"]*\/db['"]/);
    expect(source).not.toMatch(/from ['"]dexie['"]/);
  });
});
