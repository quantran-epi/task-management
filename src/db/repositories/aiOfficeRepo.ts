import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiEmployee, AiLead, AiSkill, AiSkillVersion } from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';
import { getLatestApprovedVersionNumber, stripNonApprovedVersionNumbers } from './aiSkillVersionRepo';
import {
  AiEmployeeInputSchema,
  AiEmployeeUpdateSchema,
  AiLeadInputSchema,
  AiLeadUpdateSchema,
  AiSkillInputSchema,
  AiSkillUpdateSchema,
  AiStaffImportSchema,
  type AiEmployeeInput,
  type AiEmployeeUpdate,
  type AiLeadInput,
  type AiLeadUpdate,
  type AiSkillInput,
  type AiSkillUpdate,
  type AiStaffImportInput,
} from '../../validation/aiOfficeSchemas';

import { isAgentInUse, isSkillInUse } from '../../services/ai/office/liveUseRegistry';

/**
 * Global AI Office catalogue persistence (D-10..D-15, D-18, D-23, D-25).
 *
 * Employees, leads and skills are global rows: teams store only ids, so an edit here is
 * visible to every team that references the row.
 *
 * Deletes refuse instead of leaving dangling ids. The guard and the write share one `rw`
 * transaction, and the guard also consults the in-memory live-use registry, so a profile a
 * running turn still uses cannot be removed even after it left every roster (D-13).
 * Historical ids in transcripts stay readable — they are not live references (D-14).
 */

/** D-10/D-11/D-12: a refusal names the groups or agents blocking the delete, never a UUID. */
export type AiOfficeDeleteResult =
  | { deleted: true }
  | {
      deleted: false;
      code: 'IN_USE';
      entity: 'lead' | 'employee';
      usedBy: Array<{ teamId: string; teamName: string }>;
    }
  | {
      deleted: false;
      code: 'IN_USE';
      entity: 'employee' | 'skill';
      usedBy: Array<{ agentId: string; agentName: string }>;
    };

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

/**
 * D-11: refuse while any roster still lists the agent, or while a running turn uses it.
 * The membership rows are never cascaded — the user removes the agent from each roster first.
 */
export async function deleteEmployee(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiOfficeDeleteResult> {
  return db.transaction('rw', [db.aiEmployees, db.aiTeamMembers, db.aiTeams], async () => {
    // WR-11: Dexie serialises transactions that overlap on the same object stores, so no
    // competing writer can interleave here. The remaining window is the synchronous
    // in-memory registry lookup — hence the second check right before the delete, after
    // the last await. Not full atomicity, just no async boundary between check and write.
    const memberships = await db.aiTeamMembers.where('agentId').equals(id).toArray();
    if (memberships.length > 0 || isAgentInUse(id)) {
      const teamIds = [...new Set(memberships.map((row) => row.teamId))];
      const teams = await db.aiTeams.bulkGet(teamIds);
      return {
        deleted: false,
        code: 'IN_USE',
        entity: 'employee',
        usedBy: teams.flatMap((team) =>
          team ? [{ teamId: team.id, teamName: team.name }] : []
        ),
      };
    }
    // WR-11: a turn may have claimed the profile while the roster read was in flight.
    if (isAgentInUse(id)) {
      return { deleted: false, code: 'IN_USE', entity: 'employee', usedBy: [] };
    }
    await db.aiEmployees.delete(id);
    return { deleted: true };
  });
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

/** D-10: refuse while any group still names the lead, or while a running turn uses it. */
export async function deleteLead(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiOfficeDeleteResult> {
  return db.transaction('rw', [db.aiLeads, db.aiTeams, db.aiTeamMembers], async () => {
    const teams = await db.aiTeams.where('leadId').equals(id).toArray();
    // WR-06: a lead may also sit in a roster as a plain member (the validator allows it),
    // so a dangling member row would make the next export unrestorable.
    const memberships = await db.aiTeamMembers.where('agentId').equals(id).toArray();
    if (teams.length > 0 || memberships.length > 0 || isAgentInUse(id)) {
      return {
        deleted: false,
        code: 'IN_USE',
        entity: 'lead',
        usedBy: teams.map((team) => ({ teamId: team.id, teamName: team.name })),
      };
    }
    // WR-11: re-check after the last await — see deleteEmployee for the window rationale.
    if (isAgentInUse(id)) {
      return { deleted: false, code: 'IN_USE', entity: 'lead', usedBy: [] };
    }
    await db.aiLeads.delete(id);
    return { deleted: true };
  });
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

/**
 * D-09: a manual save is a write path like any other — it appends an approved version row in
 * the same `rw` transaction as the `aiSkills` put, so no caller can edit a skill without
 * leaving history. Doing it here (not in the drawer) keeps every caller on one rule.
 *
 * The version row snapshots the MERGED row: `AiSkillUpdate` is all-optional, so copying the
 * raw patch would write `undefined` into required string fields.
 */
/**
 * CR-02: the drawer's form is a draft over a row that other surfaces can move — approving a
 * proposal overwrites `aiSkills` from the queue or the transcript. A save built from a draft
 * older than that write would silently revert the approved body, and D-12 makes history
 * view-only, so there is no restore path. The caller hands over the content it seeded from;
 * the write is refused inside the same `rw` transaction if the row no longer matches.
 *
 * Content, not `updatedAt`: two writes inside one millisecond share a timestamp, and a guard
 * that cannot see the move is not a guard.
 */
export const SKILL_MOVED_MESSAGE =
  'Kỹ năng vừa được cập nhật ở nơi khác. Tải lại nội dung mới, kiểm tra rồi lưu lại.';

/** CR-02: the content a draft was seeded from — the compare-and-swap token. */
export type AiSkillSeed = Pick<AiSkill, 'name' | 'description' | 'body'>;

export async function updateSkill(
  id: string,
  patch: AiSkillUpdate,
  db: TaskPlannerDatabase = defaultDb,
  /** CR-02: the content the draft was seeded from. Omit to skip the compare-and-swap. */
  expected?: AiSkillSeed
): Promise<AiSkill> {
  const validated = AiSkillUpdateSchema.parse(patch);

  return db.transaction('rw', [db.aiSkills, db.aiSkillVersions], async () => {
    const existing = await db.aiSkills.get(id);
    if (!existing) throw new Error(`Không tìm thấy kỹ năng: ${id}`);

    // CR-02: checked before the merge, so a refused save writes nothing at all.
    if (
      expected !== undefined &&
      (existing.name !== expected.name ||
        existing.description !== expected.description ||
        existing.body !== expected.body)
    ) {
      throw new Error(SKILL_MOVED_MESSAGE);
    }

    const now = new Date().toISOString();
    const updated: AiSkill = { ...existing, updatedAt: now };

    if (validated.name !== undefined) updated.name = validated.name;
    if (validated.description !== undefined) updated.description = validated.description;
    if (validated.body !== undefined) updated.body = validated.body;

    // WR-01: a no-op save must not mint a version. The new number would become
    // `currentApproved`, flipping every pending proposal for this skill to `stale` — the user
    // would lock themselves out of their own approval queue by clicking Save.
    if (
      updated.name === existing.name &&
      updated.description === existing.description &&
      updated.body === existing.body
    ) {
      return existing;
    }

    // D-14: number over approved rows only, so a pending proposal cannot shift a manual save.
    // CR-01: repair any legacy numbered non-approved row first, or the new number collides.
    await stripNonApprovedVersionNumbers(id, db);
    let baseVersion = await getLatestApprovedVersionNumber(id, db);
    // CR-02: the create-time body is the baseline. `createSkill` writes no version row (D-10),
    // so without this snapshot the first manual save overwrites the only copy — the same
    // defect CR-03 fixed on the approval path. Snapshot it as v1, then number the save v2.
    if (baseVersion === 0) {
      await db.aiSkillVersions.add({
        id: generateId(),
        skillId: id,
        version: 1,
        baseVersion: 0,
        status: 'approved',
        name: existing.name,
        description: existing.description,
        body: existing.body,
        createdAt: existing.createdAt,
        decidedAt: existing.updatedAt,
      });
      baseVersion = 1;
    }
    const versionRow: AiSkillVersion = {
      id: generateId(),
      skillId: id,
      version: baseVersion + 1,
      baseVersion,
      status: 'approved',
      name: updated.name,
      description: updated.description,
      body: updated.body,
      createdAt: now,
      decidedAt: now,
    };

    await db.aiSkillVersions.add(versionRow);
    await db.aiSkills.put(updated);
    return updated;
  });
}

/**
 * D-12: refuse while any profile still carries the skill, or while a running turn uses it.
 * A permitted delete cascades the skill's version rows in the same transaction (A3).
 */
export async function deleteSkill(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiOfficeDeleteResult> {
  return db.transaction('rw', [db.aiSkills, db.aiEmployees, db.aiSkillVersions], async () => {
    const employees = await db.aiEmployees.where('skillId').equals(id).toArray();
    if (employees.length > 0 || isSkillInUse(id)) {
      return {
        deleted: false,
        code: 'IN_USE',
        entity: 'skill',
        usedBy: employees.map((row) => ({ agentId: row.id, agentName: row.name })),
      };
    }
    // WR-11: re-check after the last await — see deleteEmployee for the window rationale.
    if (isSkillInUse(id)) {
      return { deleted: false, code: 'IN_USE', entity: 'skill', usedBy: [] };
    }
    await db.aiSkillVersions.where('skillId').equals(id).delete();
    await db.aiSkills.delete(id);
    return { deleted: true };
  });
}

export async function countAgentsUsingSkill(
  skillId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<number> {
  return db.aiEmployees.where('skillId').equals(skillId).count();
}

/** What a bulk import did. `skipped` counts rows dropped because the name already exists. */
export interface AiStaffImportResult {
  created: { skills: number; employees: number; leads: number };
  skipped: { skills: number; employees: number; leads: number };
  /** Non-fatal notes: substituted model, unknown `skillName`, duplicate names inside the file. */
  warnings: string[];
}

/**
 * Bulk import of skills + employees + leads from one JSON payload.
 *
 * Add-only: a row whose name already exists is skipped, never updated or deleted. Skills are
 * written first so `skillName` can resolve to an id, and the whole import is one `rw`
 * transaction — a malformed row late in the file cannot leave half a team behind.
 *
 * `fallbackModel` is the model to use when a row omits `model` (the caller reads it from
 * `fetchAvailableModels`). Without it, a row that omits `model` is skipped with a warning
 * rather than written with an empty model, which every prompt path would then send upstream.
 */
export async function importAiStaff(
  payload: AiStaffImportInput,
  db: TaskPlannerDatabase = defaultDb,
  fallbackModel?: string
): Promise<AiStaffImportResult> {
  const parsed = AiStaffImportSchema.parse(payload);
  const result: AiStaffImportResult = {
    created: { skills: 0, employees: 0, leads: 0 },
    skipped: { skills: 0, employees: 0, leads: 0 },
    warnings: [],
  };

  return db.transaction('rw', [db.aiSkills, db.aiEmployees, db.aiLeads], async () => {
    const now = new Date().toISOString();

    // Existing names, lower-cased: the roster shows names, so "evra" and "Evra" are the same
    // row to the user and a second one would be indistinguishable in the picker.
    const skillNames = new Set(
      (await db.aiSkills.toArray()).map((row) => row.name.trim().toLowerCase())
    );
    const employeeNames = new Set(
      (await db.aiEmployees.toArray()).map((row) => row.name.trim().toLowerCase())
    );
    const leadNames = new Set(
      (await db.aiLeads.toArray()).map((row) => row.name.trim().toLowerCase())
    );
    const skillIdByName = new Map(
      (await db.aiSkills.toArray()).map((row) => [row.name.trim().toLowerCase(), row.id])
    );

    for (const skill of parsed.skills) {
      const key = skill.name.trim().toLowerCase();
      if (skillNames.has(key)) {
        result.skipped.skills += 1;
        continue;
      }
      const row: AiSkill = {
        id: generateId(),
        name: skill.name,
        description: skill.description,
        body: skill.body,
        createdAt: now,
        updatedAt: now,
      };
      await db.aiSkills.add(row);
      skillNames.add(key);
      skillIdByName.set(key, row.id);
      result.created.skills += 1;
    }

    const resolveModel = (name: string, model: string | undefined): string | undefined => {
      if (model) return model;
      if (fallbackModel) {
        result.warnings.push(`«${name}» không có model, dùng model khả dụng: ${fallbackModel}.`);
        return fallbackModel;
      }
      result.warnings.push(`Bỏ qua «${name}»: không có model và chưa cấu hình model khả dụng.`);
      return undefined;
    };

    for (const employee of parsed.employees) {
      const key = employee.name.trim().toLowerCase();
      if (employeeNames.has(key)) {
        result.skipped.employees += 1;
        continue;
      }
      const model = resolveModel(employee.name, employee.model);
      if (!model) {
        result.skipped.employees += 1;
        continue;
      }
      const row: AiEmployee = {
        id: generateId(),
        name: employee.name,
        role: employee.role,
        capability: employee.capability,
        persona: employee.persona,
        model,
        createdAt: now,
        updatedAt: now,
      };
      if (employee.skillName) {
        const skillId = skillIdByName.get(employee.skillName.trim().toLowerCase());
        if (skillId) row.skillId = skillId;
        else
          result.warnings.push(
            `«${employee.name}» tham chiếu kỹ năng «${employee.skillName}» không có trong file lẫn hệ thống — nhân viên được tạo không gắn kỹ năng.`
          );
      }
      await db.aiEmployees.add(row);
      employeeNames.add(key);
      result.created.employees += 1;
    }

    for (const lead of parsed.leads) {
      const key = lead.name.trim().toLowerCase();
      if (leadNames.has(key)) {
        result.skipped.leads += 1;
        continue;
      }
      const model = resolveModel(lead.name, lead.model);
      if (!model) {
        result.skipped.leads += 1;
        continue;
      }
      await db.aiLeads.add({
        id: generateId(),
        name: lead.name,
        role: lead.role,
        capability: lead.capability,
        persona: lead.persona,
        model,
        createdAt: now,
        updatedAt: now,
      });
      leadNames.add(key);
      result.created.leads += 1;
    }

    return result;
  });
}
