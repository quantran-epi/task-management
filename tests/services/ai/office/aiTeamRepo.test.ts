// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  activateTeam,
  pauseTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
  applyEvenSplit,
  topUpMemberBudget,
  addUsedTokens,
  addTeamLink,
  removeTeamLink,
  listTeamLinks,
  assignLeader,
  lockLeader,
} from '../../../../src/db/repositories/aiTeamRepo';
import { generateId } from '../../../../src/utils/uuid';

const NOW = '2026-11-08T12:00:00.000Z';

describe('aiTeamRepo (AIO-BUDGET-01, D-05, D-06, D-09, D-17, D-19, D-26, D-32)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;
  let leadId: string;
  let employeeIds: string[];

  beforeEach(async () => {
    dbName = 'TestAiTeamRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    leadId = generateId();
    employeeIds = [generateId(), generateId(), generateId()];
  });

  afterEach(async () => {
    await db.delete();
  });

  async function makeTeam(name: string, status: 'active' | 'idle' = 'idle') {
    return createTeam(
      {
        name,
        leadId,
        status,
        budgetTokens: 1000,
        employeeIds: employeeIds.slice(0, 2),
      },
      db
    );
  }

  async function leadRows(teamId: string): Promise<string[]> {
    const rows = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
    return rows.filter((row) => row.role === 'lead').map((row) => row.agentId);
  }

  it('seeds one member row per selected employee plus the lead with an even split', async () => {
    const team = await makeTeam('Alpha');
    const members = await listTeamMembers(team.id, db);

    expect(members).toHaveLength(3);
    expect(members.filter((m) => m.role === 'lead')).toHaveLength(1);
    expect(members.filter((m) => m.role === 'employee')).toHaveLength(2);
    expect(members.every((m) => m.usedTokens === 0)).toBe(true);

    const total = members.reduce((sum, m) => sum + m.budgetTokens, 0);
    expect(total).toBe(1000);
    expect(members.find((m) => m.role === 'lead')?.budgetTokens).toBe(334);
    expect(members.filter((m) => m.role === 'employee').map((m) => m.budgetTokens)).toEqual([
      333, 333,
    ]);
  });

  it('creates more than three active groups (no cap, D-06)', async () => {
    const created = [];
    for (let i = 0; i < 5; i += 1) created.push(await makeTeam(`Active ${i}`, 'active'));

    expect(await db.aiTeams.where('status').equals('active').count()).toBe(5);
    const extra = await makeTeam('Sixth');
    await expect(activateTeam(extra.id, db)).resolves.toMatchObject({ status: 'active' });
    expect(created).toHaveLength(5);
  });

  it('adds more than three employees to one group (no cap, D-06)', async () => {
    const team = await createTeam(
      { name: 'Roster', leadId, status: 'idle', budgetTokens: 0, employeeIds },
      db
    );
    for (let i = 0; i < 2; i += 1) {
      await addTeamMember(
        { teamId: team.id, agentId: generateId(), role: 'employee', budgetTokens: 0 },
        db
      );
    }

    const employees = (await listTeamMembers(team.id, db)).filter((m) => m.role === 'employee');
    expect(employees).toHaveLength(5);

    await expect(
      addTeamMember({ teamId: team.id, agentId: generateId(), role: 'lead', budgetTokens: 0 }, db)
    ).rejects.toThrow(/một lead/i);

    expect(await listTeamMembers(team.id, db)).toHaveLength(6);
  });

  it('creates an empty group with no leader and zero member rows (D-05)', async () => {
    const team = await createTeam({ name: 'Nhóm rỗng' }, db);

    expect(team.leadId).toBeUndefined();
    expect(await listTeamMembers(team.id, db)).toHaveLength(0);
  });

  it('assigns and re-assigns a leader in one transaction, keeping one lead row (D-09)', async () => {
    const otherLeadId = generateId();
    await db.aiLeads.bulkAdd([
      { id: leadId, name: 'An', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
      { id: otherLeadId, name: 'Bình', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
    ]);
    const team = await createTeam({ name: 'Assign' }, db);

    await assignLeader(team.id, leadId, db);
    expect((await getTeam(team.id, db))?.leadId).toBe(leadId);
    expect(await leadRows(team.id)).toEqual([leadId]);

    await assignLeader(team.id, otherLeadId, db);
    expect((await getTeam(team.id, db))?.leadId).toBe(otherLeadId);
    expect(await leadRows(team.id)).toEqual([otherLeadId]);
  });

  it('assignLeader refuses a locked team and writes nothing (D-09)', async () => {
    const otherLeadId = generateId();
    await db.aiLeads.bulkAdd([
      { id: leadId, name: 'An', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
      { id: otherLeadId, name: 'Bình', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
    ]);
    const team = await makeTeam('Locked');
    const locked = await lockLeader(team.id, db);
    const membersBefore = await listTeamMembers(team.id, db);

    await expect(assignLeader(team.id, otherLeadId, db)).rejects.toThrow(/khóa leader/i);

    expect((await getTeam(team.id, db))?.leadId).toBe(leadId);
    expect((await getTeam(team.id, db))?.leaderLockedAt).toBe(locked.leaderLockedAt);
    expect(await listTeamMembers(team.id, db)).toEqual(membersBefore);
  });

  it('locks the leader idempotently and refuses a leaderless group (D-09)', async () => {
    const team = await makeTeam('Idempotent');
    const first = await lockLeader(team.id, db);
    expect(first.leaderLockedAt).toBeDefined();

    await new Promise((r) => setTimeout(r, 3));
    const second = await lockLeader(team.id, db);
    expect(second.leaderLockedAt).toBe(first.leaderLockedAt);

    const empty = await createTeam({ name: 'Không leader' }, db);
    await expect(lockLeader(empty.id, db)).rejects.toThrow(/chưa có leader/i);
    expect((await getTeam(empty.id, db))?.leaderLockedAt).toBeUndefined();
  });

  it('updateTeam cannot change a locked leader, but other patches still work (D-09)', async () => {
    const otherLeadId = generateId();
    await db.aiLeads.bulkAdd([
      { id: leadId, name: 'An', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
      { id: otherLeadId, name: 'Bình', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
    ]);
    const team = await makeTeam('Guarded');
    const locked = await lockLeader(team.id, db);
    const membersBefore = await listTeamMembers(team.id, db);

    await expect(updateTeam(team.id, { leadId: otherLeadId }, db)).rejects.toThrow(/khóa leader/i);

    const after = await getTeam(team.id, db);
    expect(after?.leadId).toBe(leadId);
    expect(after?.leaderLockedAt).toBe(locked.leaderLockedAt);
    expect(await listTeamMembers(team.id, db)).toEqual(membersBefore);

    const renamed = await updateTeam(team.id, { name: 'Đổi tên' }, db);
    expect(renamed.name).toBe('Đổi tên');
    expect(renamed.leadId).toBe(leadId);
  });

  it('updateTeam on an unlocked team still accepts a leadId patch and keeps sources in step', async () => {
    const otherLeadId = generateId();
    await db.aiLeads.bulkAdd([
      { id: leadId, name: 'An', role: 'Lead', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
    ]);
    const team = await makeTeam('Unlocked');

    const updated = await updateTeam(team.id, { leadId: otherLeadId }, db);
    expect(updated.leadId).toBe(otherLeadId);
    expect(await leadRows(team.id)).toEqual([otherLeadId]);

    await assignLeader(team.id, leadId, db);
    expect(await leadRows(team.id)).toEqual([leadId]);
    expect((await getTeam(team.id, db))?.leadId).toBe(leadId);
  });

  it('removeTeamMember refuses the lead row and deletes an employee row', async () => {
    const team = await makeTeam('RemoveMember');
    const members = await listTeamMembers(team.id, db);
    const leadRow = members.find((m) => m.role === 'lead')!;
    const employeeRow = members.find((m) => m.role === 'employee')!;

    await expect(removeTeamMember(leadRow.id, db)).rejects.toThrow(/leader/i);
    expect(await db.aiTeamMembers.get(leadRow.id)).toBeDefined();
    expect((await getTeam(team.id, db))?.leadId).toBe(leadId);

    await removeTeamMember(employeeRow.id, db);
    expect(await db.aiTeamMembers.get(employeeRow.id)).toBeUndefined();
    expect(await db.aiTeamMembers.get(leadRow.id)).toBeDefined();
  });

  it('splits an evenly divisible budget across 4 members', async () => {
    const team = await createTeam(
      {
        name: 'Even',
        leadId,
        status: 'idle',
        budgetTokens: 1000,
        employeeIds,
      },
      db
    );

    await applyEvenSplit(team.id, 1000, db);
    const budgets = (await listTeamMembers(team.id, db)).map((m) => m.budgetTokens);
    expect(budgets.sort()).toEqual([250, 250, 250, 250]);
  });

  it('puts the remainder on the lead row so the split sums exactly', async () => {
    const team = await makeTeam('Odd');
    await applyEvenSplit(team.id, 1000, db);

    const members = await listTeamMembers(team.id, db);
    const lead = members.find((m) => m.role === 'lead');
    const employees = members.filter((m) => m.role === 'employee');

    expect(lead?.budgetTokens).toBe(334);
    expect(employees.map((m) => m.budgetTokens).sort()).toEqual([333, 333]);
    expect(members.reduce((sum, m) => sum + m.budgetTokens, 0)).toBe(1000);
  });

  it('tops up a budget without touching usedTokens', async () => {
    const team = await makeTeam('TopUp');
    const [member] = await listTeamMembers(team.id, db);
    await addUsedTokens(member!.id, 100, db);

    const updated = await topUpMemberBudget(member!.id, 500, db);
    expect(updated.usedTokens).toBe(100);
    expect(updated.budgetTokens).toBe(member!.budgetTokens + 500);
  });

  it('adds used tokens to a single row only', async () => {
    const team = await makeTeam('Usage');
    const members = await listTeamMembers(team.id, db);
    const target = members[0]!;
    const sibling = members[1]!;

    await addUsedTokens(target.id, 42, db);

    expect((await db.aiTeamMembers.get(target.id))?.usedTokens).toBe(42);
    expect((await db.aiTeamMembers.get(sibling.id))?.usedTokens).toBe(0);
  });

  it('pauses and reactivates the same team row with an advanced updatedAt', async () => {
    const team = await makeTeam('Pause', 'active');
    const paused = await pauseTeam(team.id, db);
    expect(paused.status).toBe('idle');

    await new Promise((r) => setTimeout(r, 3));
    const reactivated = await activateTeam(team.id, db);

    expect(reactivated.id).toBe(team.id);
    expect(reactivated.status).toBe('active');
    expect(reactivated.updatedAt > paused.updatedAt).toBe(true);
    expect(await db.aiTeams.count()).toBe(1);
  });

  it('updates and deletes a team with its child rows', async () => {
    const team = await makeTeam('Edit');
    const updated = await updateTeam(team.id, { name: 'Edited' }, db);
    expect(updated.name).toBe('Edited');

    await addTeamLink({ teamId: team.id, itemType: 'task', itemId: generateId() }, db);
    await deleteTeam(team.id, db);

    expect(await getTeam(team.id, db)).toBeUndefined();
    expect(await db.aiTeamMembers.where('teamId').equals(team.id).count()).toBe(0);
    expect(await db.aiTeamLinks.where('teamId').equals(team.id).count()).toBe(0);
  });

  it('removes a member row', async () => {
    const team = await makeTeam('Remove');
    const member = (await listTeamMembers(team.id, db)).find((m) => m.role === 'employee')!;

    await removeTeamMember(member.id, db);
    expect(await db.aiTeamMembers.get(member.id)).toBeUndefined();
  });

  it('adds, lists and removes links with a duplicate guard', async () => {
    const team = await makeTeam('Links');
    const taskId = generateId();

    const link = await addTeamLink({ teamId: team.id, itemType: 'task', itemId: taskId }, db);
    expect((await listTeamLinks(team.id, db)).map((l) => l.id)).toEqual([link.id]);

    await expect(
      addTeamLink({ teamId: team.id, itemType: 'task', itemId: taskId }, db)
    ).rejects.toThrow();

    await removeTeamLink(link.id, db);
    expect(await listTeamLinks(team.id, db)).toHaveLength(0);
  });
});
