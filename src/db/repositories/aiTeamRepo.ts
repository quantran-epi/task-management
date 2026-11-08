import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiTeam, AiTeamLink, AiTeamMember } from '../../types/aiOffice';
import { MAX_ACTIVE_TEAMS, MAX_EMPLOYEES_PER_TEAM } from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';
import {
  AiTeamInputSchema,
  AiTeamUpdateSchema,
  AiTeamMemberInputSchema,
  AiTeamLinkInputSchema,
  type AiTeamInput,
  type AiTeamUpdate,
  type AiTeamMemberInput,
  type AiTeamLinkInput,
} from '../../validation/aiOfficeSchemas';

/**
 * Team persistence (D-15, D-16, D-17, D-19, D-26, D-32).
 *
 * Caps are enforced inside `db.transaction('rw', ...)` so two racing callers cannot both pass
 * the count check. Budgets live on `aiTeamMembers` rows and are always written one row at a
 * time — never a read-modify-write of a shared array.
 */

export const ACTIVE_TEAM_CAP_MESSAGE =
  'Đã có 3 nhóm đang hoạt động. Tạm dừng một nhóm khác trước khi kích hoạt nhóm này.';

export interface CreateTeamInput extends AiTeamInput {
  /** Employees to seed as member rows; the lead row is created from `leadId`. */
  employeeIds?: string[];
}

/** `usedTokens` defaults to 0 in the schema, so callers may omit it. */
export type AddTeamMemberInput = Omit<AiTeamMemberInput, 'usedTokens'> & {
  usedTokens?: number | undefined;
};

function byCreatedAt<T extends { createdAt: string }>(rows: T[]): T[] {
  return rows.sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1
  );
}

async function assertCanActivate(teamId: string, db: TaskPlannerDatabase): Promise<void> {
  const target = await db.aiTeams.get(teamId);
  if (!target) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
  if (target.status === 'active') return;

  const activeCount = await db.aiTeams.where('status').equals('active').count();
  if (activeCount >= MAX_ACTIVE_TEAMS) throw new Error(ACTIVE_TEAM_CAP_MESSAGE);
}

/** UI-SPEC §8a: floor per row, remainder on the lead row so the sum is exact. */
function splitBudget(total: number, memberCount: number): number {
  return memberCount > 0 ? Math.floor(total / memberCount) : 0;
}

async function writeEvenSplit(
  teamId: string,
  totalTokens: number,
  db: TaskPlannerDatabase
): Promise<AiTeamMember[]> {
  const members = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
  if (members.length === 0) return [];

  const perRow = splitBudget(totalTokens, members.length);
  const remainder = totalTokens - perRow * members.length;

  const updated: AiTeamMember[] = [];
  for (const member of members) {
    const budgetTokens = member.role === 'lead' ? perRow + remainder : perRow;
    await db.aiTeamMembers.update(member.id, { budgetTokens });
    updated.push({ ...member, budgetTokens });
  }
  return updated;
}

export async function listTeams(db: TaskPlannerDatabase = defaultDb): Promise<AiTeam[]> {
  return byCreatedAt(await db.aiTeams.toArray());
}

export async function getTeam(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam | undefined> {
  return db.aiTeams.get(id);
}

export async function createTeam(
  input: CreateTeamInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  const validated = AiTeamInputSchema.parse(input);
  const employeeIds = input.employeeIds ?? [];
  if (employeeIds.length > MAX_EMPLOYEES_PER_TEAM) {
    throw new Error(`Một nhóm chỉ có tối đa ${MAX_EMPLOYEES_PER_TEAM} nhân viên.`);
  }

  const now = new Date().toISOString();
  const team: AiTeam = {
    id: generateId(),
    name: validated.name,
    leadId: validated.leadId,
    status: validated.status,
    budgetTokens: validated.budgetTokens,
    createdAt: now,
    updatedAt: now,
  };
  if (validated.autoSplitEnabled !== undefined) team.autoSplitEnabled = validated.autoSplitEnabled;
  if (validated.autoApproveMutations !== undefined) {
    team.autoApproveMutations = validated.autoApproveMutations;
  }

  await db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
    if (team.status === 'active') {
      const activeCount = await db.aiTeams.where('status').equals('active').count();
      if (activeCount >= MAX_ACTIVE_TEAMS) throw new Error(ACTIVE_TEAM_CAP_MESSAGE);
    }
    await db.aiTeams.add(team);

    const rows: AiTeamMember[] = [
      {
        id: generateId(),
        teamId: team.id,
        agentId: team.leadId,
        role: 'lead',
        budgetTokens: 0,
        usedTokens: 0,
      },
      ...employeeIds.map<AiTeamMember>((agentId) => ({
        id: generateId(),
        teamId: team.id,
        agentId,
        role: 'employee',
        budgetTokens: 0,
        usedTokens: 0,
      })),
    ];
    await db.aiTeamMembers.bulkAdd(rows);
    await writeEvenSplit(team.id, team.budgetTokens, db);
  });

  return team;
}

export async function updateTeam(
  id: string,
  patch: AiTeamUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  const validated = AiTeamUpdateSchema.parse(patch);
  const existing = await db.aiTeams.get(id);
  if (!existing) throw new Error(`Không tìm thấy nhóm: ${id}`);

  const updated: AiTeam = { ...existing, updatedAt: new Date().toISOString() };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.leadId !== undefined) updated.leadId = validated.leadId;
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.budgetTokens !== undefined) updated.budgetTokens = validated.budgetTokens;
  if ('autoSplitEnabled' in patch) {
    if (validated.autoSplitEnabled !== undefined) {
      updated.autoSplitEnabled = validated.autoSplitEnabled;
    } else {
      delete updated.autoSplitEnabled;
    }
  }
  if ('autoApproveMutations' in patch) {
    if (validated.autoApproveMutations !== undefined) {
      updated.autoApproveMutations = validated.autoApproveMutations;
    } else {
      delete updated.autoApproveMutations;
    }
  }

  await db.transaction('rw', [db.aiTeams], async () => {
    if (updated.status === 'active') await assertCanActivate(id, db);
    await db.aiTeams.put(updated);
  });

  return updated;
}

/** Child rows die with the team; links and members have no meaning without it. */
export async function deleteTeam(id: string, db: TaskPlannerDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiTeamLinks], async () => {
    await db.aiTeamMembers.where('teamId').equals(id).delete();
    await db.aiTeamLinks.where('teamId').equals(id).delete();
    await db.aiTeams.delete(id);
  });
}

export async function activateTeam(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  // Single transaction: counting outside one lets two racing callers both see 2 active teams.
  return db.transaction('rw', [db.aiTeams], async () => {
    await assertCanActivate(teamId, db);
    const now = new Date().toISOString();
    await db.aiTeams.update(teamId, { status: 'active', updatedAt: now });
    return (await db.aiTeams.get(teamId)) as AiTeam;
  });
}

/** D-17: the thread id lives on the chat thread's scope key, so pausing never resets it. */
export async function pauseTeam(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  const existing = await db.aiTeams.get(teamId);
  if (!existing) throw new Error(`Không tìm thấy nhóm: ${teamId}`);

  const now = new Date().toISOString();
  await db.aiTeams.update(teamId, { status: 'idle', updatedAt: now });
  return { ...existing, status: 'idle', updatedAt: now };
}

export async function listTeamMembers(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember[]> {
  const rows = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
  return rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'lead' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export async function addTeamMember(
  input: AddTeamMemberInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const validated = AiTeamMemberInputSchema.parse(input);

  return db.transaction('rw', [db.aiTeamMembers], async () => {
    const siblings = await db.aiTeamMembers
      .where('teamId')
      .equals(validated.teamId)
      .toArray();

    if (validated.role === 'lead' && siblings.some((row) => row.role === 'lead')) {
      throw new Error('Nhóm đã có lead. Mỗi nhóm chỉ có một lead.');
    }
    const employeeCount = siblings.filter((row) => row.role === 'employee').length;
    if (validated.role === 'employee' && employeeCount >= MAX_EMPLOYEES_PER_TEAM) {
      throw new Error(`Một nhóm chỉ có tối đa ${MAX_EMPLOYEES_PER_TEAM} nhân viên.`);
    }

    const member: AiTeamMember = {
      id: generateId(),
      teamId: validated.teamId,
      agentId: validated.agentId,
      role: validated.role,
      budgetTokens: validated.budgetTokens,
      usedTokens: validated.usedTokens,
    };
    await db.aiTeamMembers.add(member);
    return member;
  });
}

export async function removeTeamMember(
  memberId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.aiTeamMembers.delete(memberId);
}

export async function applyEvenSplit(
  teamId: string,
  totalTokens: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember[]> {
  return db.transaction('rw', [db.aiTeamMembers], () => writeEvenSplit(teamId, totalTokens, db));
}

/** D-32: single-row write. Never read the whole team and rewrite it. */
export async function topUpMemberBudget(
  memberId: string,
  added: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

  const budgetTokens = row.budgetTokens + added;
  await db.aiTeamMembers.update(memberId, { budgetTokens });
  return { ...row, budgetTokens };
}

/** D-32: single-row write so three concurrent completions cannot lose usage. */
export async function addUsedTokens(
  memberId: string,
  delta: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

  const usedTokens = row.usedTokens + delta;
  await db.aiTeamMembers.update(memberId, { usedTokens });
  return { ...row, usedTokens };
}

export async function listTeamLinks(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamLink[]> {
  return byCreatedAt(await db.aiTeamLinks.where('teamId').equals(teamId).toArray());
}

export async function addTeamLink(
  input: AiTeamLinkInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamLink> {
  const validated = AiTeamLinkInputSchema.parse(input);

  return db.transaction('rw', [db.aiTeamLinks], async () => {
    const existing = await db.aiTeamLinks.where('teamId').equals(validated.teamId).toArray();
    const duplicate = existing.some(
      (row) => row.itemType === validated.itemType && row.itemId === validated.itemId
    );
    if (duplicate) throw new Error('Mục này đã được liên kết với nhóm.');

    const link: AiTeamLink = {
      id: generateId(),
      teamId: validated.teamId,
      itemType: validated.itemType,
      itemId: validated.itemId,
      createdAt: new Date().toISOString(),
    };
    await db.aiTeamLinks.add(link);
    return link;
  });
}

export async function removeTeamLink(
  linkId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.aiTeamLinks.delete(linkId);
}
