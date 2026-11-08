import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiEmployee, AiLead, AiSkill } from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';
import {
  AiEmployeeInputSchema,
  AiEmployeeUpdateSchema,
  AiLeadInputSchema,
  AiLeadUpdateSchema,
  AiSkillInputSchema,
  AiSkillUpdateSchema,
  type AiEmployeeInput,
  type AiEmployeeUpdate,
  type AiLeadInput,
  type AiLeadUpdate,
  type AiSkillInput,
  type AiSkillUpdate,
} from '../../validation/aiOfficeSchemas';

/**
 * Global AI Office catalogue persistence (D-18, D-23, D-25).
 *
 * Employees, leads and skills are global rows: teams store only ids, so an edit here is
 * visible to every team that references the row. Deletes never cascade — the team row keeps
 * the dangling id and resolves it (or shows it as missing) at read time.
 */

function byCreatedAt<T extends { createdAt: string }>(rows: T[]): T[] {
  return rows.sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1
  );
}

export async function listEmployees(
  db: TaskPlannerDatabase = defaultDb
): Promise<AiEmployee[]> {
  return byCreatedAt(await db.aiEmployees.toArray());
}

export async function createEmployee(
  input: AiEmployeeInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiEmployee> {
  const validated = AiEmployeeInputSchema.parse(input);
  const now = new Date().toISOString();

  const employee: AiEmployee = {
    id: generateId(),
    name: validated.name,
    role: validated.role,
    capability: validated.capability,
    persona: validated.persona,
    model: validated.model,
    createdAt: now,
    updatedAt: now,
  };
  if (validated.skillId !== undefined) employee.skillId = validated.skillId;

  await db.aiEmployees.add(employee);
  return employee;
}

export async function updateEmployee(
  id: string,
  patch: AiEmployeeUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiEmployee> {
  const validated = AiEmployeeUpdateSchema.parse(patch);
  const existing = await db.aiEmployees.get(id);
  if (!existing) throw new Error(`Không tìm thấy nhân viên: ${id}`);

  const updated: AiEmployee = { ...existing, updatedAt: new Date().toISOString() };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.role !== undefined) updated.role = validated.role;
  if (validated.capability !== undefined) updated.capability = validated.capability;
  if (validated.persona !== undefined) updated.persona = validated.persona;
  if (validated.model !== undefined) updated.model = validated.model;
  if ('skillId' in patch) {
    if (validated.skillId) updated.skillId = validated.skillId;
    else delete updated.skillId;
  }

  await db.aiEmployees.put(updated);
  return updated;
}

/** D-18: no cascade — team member rows keep the id and resolve it at read time. */
export async function deleteEmployee(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.aiEmployees.delete(id);
}

export async function countTeamsUsingEmployee(
  employeeId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  return db.aiTeamMembers.where('agentId').equals(employeeId).count();
}

export async function listLeads(
  db: TaskPlannerDatabase = defaultDb
): Promise<AiLead[]> {
  return byCreatedAt(await db.aiLeads.toArray());
}

export async function createLead(
  input: AiLeadInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiLead> {
  const validated = AiLeadInputSchema.parse(input);
  const now = new Date().toISOString();

  const lead: AiLead = {
    id: generateId(),
    name: validated.name,
    role: validated.role,
    capability: validated.capability,
    persona: validated.persona,
    model: validated.model,
    createdAt: now,
    updatedAt: now,
  };

  await db.aiLeads.add(lead);
  return lead;
}

export async function updateLead(
  id: string,
  patch: AiLeadUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiLead> {
  const validated = AiLeadUpdateSchema.parse(patch);
  const existing = await db.aiLeads.get(id);
  if (!existing) throw new Error(`Không tìm thấy lead: ${id}`);

  const updated: AiLead = { ...existing, updatedAt: new Date().toISOString() };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.role !== undefined) updated.role = validated.role;
  if (validated.capability !== undefined) updated.capability = validated.capability;
  if (validated.persona !== undefined) updated.persona = validated.persona;
  if (validated.model !== undefined) updated.model = validated.model;

  await db.aiLeads.put(updated);
  return updated;
}

export async function deleteLead(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.aiLeads.delete(id);
}

export async function listSkills(
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkill[]> {
  return byCreatedAt(await db.aiSkills.toArray());
}

export async function createSkill(
  input: AiSkillInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkill> {
  const validated = AiSkillInputSchema.parse(input);
  const now = new Date().toISOString();

  const skill: AiSkill = {
    id: generateId(),
    name: validated.name,
    description: validated.description,
    body: validated.body,
    createdAt: now,
    updatedAt: now,
  };

  await db.aiSkills.add(skill);
  return skill;
}

export async function updateSkill(
  id: string,
  patch: AiSkillUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkill> {
  const validated = AiSkillUpdateSchema.parse(patch);
  const existing = await db.aiSkills.get(id);
  if (!existing) throw new Error(`Không tìm thấy kỹ năng: ${id}`);

  const updated: AiSkill = { ...existing, updatedAt: new Date().toISOString() };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.description !== undefined) updated.description = validated.description;
  if (validated.body !== undefined) updated.body = validated.body;

  await db.aiSkills.put(updated);
  return updated;
}

/** D-18/D-25: no cascade — employees keep the dangling scalar `skillId`. */
export async function deleteSkill(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.aiSkills.delete(id);
}

export async function countAgentsUsingSkill(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  return db.aiEmployees.where('skillId').equals(skillId).count();
}
