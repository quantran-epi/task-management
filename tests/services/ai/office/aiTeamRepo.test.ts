// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  listTeams,
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
} from '../../../../src/db/repositories/aiTeamRepo';
import { MAX_ACTIVE_TEAMS, MAX_EMPLOYEES_PER_TEAM } from '../../../../src/types/aiOffice';
import { generateId } from '../../../../src/utils/uuid';

const CAP_MESSAGE =
  'Đã có 3 nhóm đang hoạt động. Tạm dừng một nhóm khác trước khi kích hoạt nhóm này.';

describe('aiTeamRepo (AIO-BUDGET-01, D-15, D-16, D-17, D-19, D-26, D-32)', () => {
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

  it('rejects a 4th active team with the exact UI-SPEC message', async () => {
    for (let i = 0; i < MAX_ACTIVE_TEAMS; i += 1) {
      await makeTeam(`Active ${i}`, 'active');
    }
    const fourth = await makeTeam('Fourth');

    await expect(activateTeam(fourth.id, db)).rejects.toThrow(CAP_MESSAGE);
    expect((await getTeam(fourth.id, db))?.status).toBe('idle');
  });

  it('leaves exactly 3 active when activations run past the cap', async () => {
    const teams = [];
    for (let i = 0; i < 4; i += 1) teams.push(await makeTeam(`Team ${i}`));

    for (const team of teams.slice(0, 3)) await activateTeam(team.id, db);
    await expect(activateTeam(teams[3]!.id, db)).rejects.toThrow(CAP_MESSAGE);

    const active = (await listTeams(db)).filter((t) => t.status === 'active');
    expect(active).toHaveLength(MAX_ACTIVE_TEAMS);
  });

  it('rejects a 4th employee and a second lead', async () => {
    const team = await createTeam(
      { name: 'Roster', leadId, status: 'idle', budgetTokens: 0, employeeIds },
      db
    );
    expect(
      (await listTeamMembers(team.id, db)).filter((m) => m.role === 'employee')
    ).toHaveLength(MAX_EMPLOYEES_PER_TEAM);

    await expect(
      addTeamMember({ teamId: team.id, agentId: generateId(), role: 'employee', budgetTokens: 0 }, db)
    ).rejects.toThrow(/3/);

    await expect(
      addTeamMember({ teamId: team.id, agentId: generateId(), role: 'lead', budgetTokens: 0 }, db)
    ).rejects.toThrow();

    expect(await listTeamMembers(team.id, db)).toHaveLength(MAX_EMPLOYEES_PER_TEAM + 1);
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
    const member = (await listTeamMembers(team.id, db))[0]!;

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
