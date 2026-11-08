// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
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
    dbName = 'TestAiOfficeRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
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

  it('deletes an employee without cascading into team member rows', async () => {
    const employee = await createEmployee(EMPLOYEE, db);
    const teamId = generateId();
    const memberId = generateId();
    await db.aiTeamMembers.add({
      id: memberId,
      teamId,
      agentId: employee.id,
      role: 'employee',
      budgetTokens: 0,
      usedTokens: 0,
    });

    await deleteEmployee(employee.id, db);

    expect(await db.aiEmployees.get(employee.id)).toBeUndefined();
    expect(await db.aiTeamMembers.get(memberId)).toBeDefined();
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

  it('keeps employees when their skill is deleted and counts skill usage', async () => {
    const skill = await createSkill(
      { name: 'Research', description: 'Quy trình nghiên cứu', body: SKILL_BODY },
      db
    );
    const employee = await createEmployee({ ...EMPLOYEE, skillId: skill.id }, db);

    expect(employee.skillId).toBe(skill.id);
    expect(await countAgentsUsingSkill(skill.id, db)).toBe(1);

    await deleteSkill(skill.id, db);

    expect(await db.aiSkills.get(skill.id)).toBeUndefined();
    expect((await db.aiEmployees.get(employee.id))?.skillId).toBe(skill.id);
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

  it('updates and deletes leads', async () => {
    const lead = await createLead({ ...EMPLOYEE, name: 'Lead' }, db);
    const updated = await updateLead(lead.id, { capability: 'Điều phối' }, db);
    expect(updated.capability).toBe('Điều phối');
    expect(updated.name).toBe('Lead');

    await deleteLead(lead.id, db);
    expect(await db.aiLeads.get(lead.id)).toBeUndefined();
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
