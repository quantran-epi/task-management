import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiTeam, AiTeamLink, AiTeamMember } from '../../types/aiOffice';
import { clampBudgetWarnThresholdPct, clampTeamConcurrency } from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';
import { splitEvenly } from '../../services/ai/office/budgetSplit';
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
 * Team persistence (D-05, D-09, D-17, D-19, D-26, D-32).
 *
 * D-06: no roster or group cap. Leader assignment writes both sources of truth — the
 * `aiTeams.leadId` column and the single `role='lead'` member row — inside one transaction.
 * Budgets live on `aiTeamMembers` rows and are always written one row at a time — never a
 * read-modify-write of a shared array.
 */

export interface CreateTeamInput extends AiTeamInput {
  /** Employees to seed as member rows; the lead row is created from `leadId`. */
  employeeIds?: string[];
}

/** `usedTokens` defaults to 0 in the schema, so callers may omit it. */
export type AddTeamMemberInput = Omit<AiTeamMemberInput, 'usedTokens'> & {
  usedTokens?: number | undefined;
};

/** WR-05/D-15: ids reach the repo from the UI; a dangling one produces an unrestorable export. */
const MISSING_LEAD_MESSAGE =
  'Không tìm thấy lead đã chọn. Hãy chọn lại lead từ danh sách.';
const MISSING_EMPLOYEE_MESSAGE =
  'Không tìm thấy nhân viên đã chọn. Hãy chọn lại nhân viên từ danh sách.';

/** Messages never interpolate the id: the string reaches the UI, where a raw UUID is noise. */
async function assertAgentsExist(
  leadId: string | undefined,
  employeeIds: string[],
  db: TaskPlannerDatabase
): Promise<void> {
  if (leadId !== undefined) {
    const lead = await db.aiLeads.get(leadId);
    if (!lead) throw new Error(MISSING_LEAD_MESSAGE);
  }
  if (employeeIds.length > 0) {
    const employees = await db.aiEmployees.bulkGet(employeeIds);
    if (employees.some((employee) => employee === undefined)) throw new Error(MISSING_EMPLOYEE_MESSAGE);
  }
}

function byCreatedAt<T extends { createdAt: string }>(rows: T[]): T[] {
  return rows.sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1
  );
}

async function assertCanActivate(teamId: string, db: TaskPlannerDatabase): Promise<void> {
  const target = await db.aiTeams.get(teamId);
  if (!target) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
}

/** D-14: the split rule lives once, in `budgetSplit.ts`; both the repo and the drawer import it. */
async function writeEvenSplit(
  teamId: string,
  totalTokens: number,
  db: TaskPlannerDatabase
): Promise<AiTeamMember[]> {
  const members = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
  if (members.length === 0) return [];

  const updated = splitEvenly(totalTokens, members);
  for (const member of updated) {
    await db.aiTeamMembers.update(member.id, { budgetTokens: member.budgetTokens });
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

  const now = new Date().toISOString();
  const team: AiTeam = {
    id: generateId(),
    name: validated.name,
    status: validated.status,
    budgetTokens: validated.budgetTokens,
    createdAt: now,
    updatedAt: now,
  };
  if (validated.leadId !== undefined) team.leadId = validated.leadId;
  if (validated.autoSplitEnabled !== undefined) team.autoSplitEnabled = validated.autoSplitEnabled;
  if (validated.autoApproveMutations !== undefined) {
    team.autoApproveMutations = validated.autoApproveMutations;
  }
  if (validated.concurrencyLimit !== undefined) {
    team.concurrencyLimit = clampTeamConcurrency(validated.concurrencyLimit);
  }
  if (validated.budgetWarnThresholdPct !== undefined) {
    team.budgetWarnThresholdPct = clampBudgetWarnThresholdPct(validated.budgetWarnThresholdPct);
  }

  await db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiLeads, db.aiEmployees], async () => {
    await assertAgentsExist(team.leadId, employeeIds, db);
    await db.aiTeams.add(team);

    const rows: AiTeamMember[] = [
      ...(team.leadId !== undefined
        ? [
            {
              id: generateId(),
              teamId: team.id,
              agentId: team.leadId,
              role: 'lead' as const,
              budgetTokens: 0,
              usedTokens: 0,
              inputTokens: 0,
              outputTokens: 0,
            },
          ]
        : []),
      ...employeeIds.map<AiTeamMember>((agentId) => ({
        id: generateId(),
        teamId: team.id,
        agentId,
        role: 'employee',
        budgetTokens: 0,
        usedTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      })),
    ];
    await db.aiTeamMembers.bulkAdd(rows);
    await writeEvenSplit(team.id, team.budgetTokens, db);
  });

  return team;
}

const LEADER_LOCKED_MESSAGE =
  'Nhóm đã khóa leader từ lượt chạy đầu tiên. Tạo nhóm mới nếu muốn dùng leader khác.';

/**
 * D-09: the lock is durable and applies to every write path, so the guard lives next to the
 * writes rather than in the UI. A patch that omits `leadId` stays legal.
 */
function assertLeaderUnlocked(existing: AiTeam, nextLeadId: string | undefined): void {
  if (nextLeadId === undefined) return;
  if (existing.leaderLockedAt !== undefined && nextLeadId !== existing.leadId) {
    throw new Error(LEADER_LOCKED_MESSAGE);
  }
}

export async function updateTeam(
  id: string,
  patch: AiTeamUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  const validated = AiTeamUpdateSchema.parse(patch);

  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiLeads], async () => {
    const existing = await db.aiTeams.get(id);
    if (!existing) throw new Error(`Không tìm thấy nhóm: ${id}`);
    assertLeaderUnlocked(existing, validated.leadId);
    // A patch that omits leadId stays legal; a patch that sets one must name a real lead.
    if (validated.leadId !== undefined) await assertAgentsExist(validated.leadId, [], db);

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
    // Phase 37 D-03: same add/remove idiom, so clearing stays expressible. The range is
    // already enforced by zod; the clamp is the runtime belt for values that bypass the form.
    if ('concurrencyLimit' in patch) {
      if (validated.concurrencyLimit !== undefined) {
        updated.concurrencyLimit = clampTeamConcurrency(validated.concurrencyLimit);
      } else {
        delete updated.concurrencyLimit;
      }
    }
    // Phase 38 D-04/D-05: same add/remove idiom, so clearing stays expressible.
    if ('budgetWarnThresholdPct' in patch) {
      if (validated.budgetWarnThresholdPct !== undefined) {
        updated.budgetWarnThresholdPct = clampBudgetWarnThresholdPct(
          validated.budgetWarnThresholdPct
        );
      } else {
        delete updated.budgetWarnThresholdPct;
      }
    }

    // Pitfall 5: the lead member row must move with `leadId` — never two sources that disagree.
    if (validated.leadId !== undefined && validated.leadId !== existing.leadId) {
      await writeLeadRow(id, validated.leadId, db);
    }

    await db.aiTeams.put(updated);
    return updated;
  });
}

/** Replaces the single `role='lead'` member row for a team, carrying any existing budget. */
async function writeLeadRow(
  teamId: string,
  leadId: string,
  db: TaskPlannerDatabase,
  previous?: AiTeamMember | undefined
): Promise<void> {
  const siblings = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
  for (const row of siblings) {
    if (row.role === 'lead') await db.aiTeamMembers.delete(row.id);
  }
  // CR-02: a re-assignment to the same agent must not wipe its budget or recorded usage.
  const carried =
    previous && previous.agentId === leadId
      ? {
          budgetTokens: previous.budgetTokens,
          usedTokens: previous.usedTokens,
          inputTokens: previous.inputTokens ?? 0,
          outputTokens: previous.outputTokens ?? 0,
          ...(previous.usageEstimated !== undefined
            ? { usageEstimated: previous.usageEstimated }
            : {}),
        }
      : { budgetTokens: 0, usedTokens: 0, inputTokens: 0, outputTokens: 0 };
  await db.aiTeamMembers.add({
    id: generateId(),
    teamId,
    agentId: leadId,
    role: 'lead',
    ...carried,
  });
}

/**
 * D-05/D-09: assign (or re-assign) the leader before the first run. Both sources of truth —
 * `aiTeams.leadId` and the single `role='lead'` member row — are written in one transaction.
 */
export async function assignLeader(
  teamId: string,
  leadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiLeads], async () => {
    const existing = await db.aiTeams.get(teamId);
    if (!existing) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
    assertLeaderUnlocked(existing, leadId);

    const lead = await db.aiLeads.get(leadId);
    if (!lead) throw new Error(`Không tìm thấy lead: ${leadId}`);

    // CR-02: re-assigning the current leader is a no-op — recreating the row would
    // silently reset its budget and usage.
    if (existing.leadId === leadId) return existing;

    const previousLeadRow = (
      await db.aiTeamMembers.where('teamId').equals(teamId).toArray()
    ).find((row) => row.role === 'lead');
    await writeLeadRow(teamId, leadId, db, previousLeadRow);

    const updated: AiTeam = { ...existing, leadId, updatedAt: new Date().toISOString() };
    await db.aiTeams.put(updated);
    return updated;
  });
}

/** D-09: the first run calls this once; a second call keeps the original timestamp. */
export async function lockLeader(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
    const existing = await db.aiTeams.get(teamId);
    if (!existing) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
    if (existing.leaderLockedAt !== undefined) return existing;

    if (existing.leadId === undefined) {
      throw new Error('Nhóm chưa có leader nên chưa thể khóa leader.');
    }
    const siblings = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
    const hasLeadRow = siblings.some(
      (row) => row.role === 'lead' && row.agentId === existing.leadId
    );
    if (!hasLeadRow) {
      throw new Error('Nhóm chưa có leader nên chưa thể khóa leader.');
    }

    const updated: AiTeam = {
      ...existing,
      leaderLockedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.aiTeams.put(updated);
    return updated;
  });
}

/** Child rows die with the team; links and members have no meaning without it. */
export async function deleteTeam(id: string, db: TaskPlannerDatabase = defaultDb): Promise<void> {
  // CR-03: the team's chat thread is a live reference the backup validator enforces
  // (`scopeType: 'team'` must resolve to an existing aiTeams row). Leaving it behind made
  // the app's own next export unrestorable, so the thread dies with the team.
  // Phase 37 CR-01: the run ledger is the same class of reference (`aiTeamBatches.teamId`,
  // `.threadId`, `aiTeamAssignments.batchId`), so it dies in the same transaction — in
  // dependency order, assignments before their batch, before the parent rows.
  await db.transaction(
    'rw',
    [
      db.aiTeams,
      db.aiTeamMembers,
      db.aiTeamLinks,
      db.chatThreads,
      db.chatMessages,
      db.chatTabs,
      db.aiTeamBatches,
      db.aiTeamAssignments,
      db.teamMessages,
      db.teamReadCursors,
      db.teamParticipants,
    ],
    async () => {
      const threads = await db.chatThreads.where('scopeKey').equals(`team:${id}`).toArray();
      for (const thread of threads) {
        await db.chatMessages.where('threadId').equals(thread.id).delete();
        await db.chatTabs.where('threadId').equals(thread.id).delete();
        await db.chatThreads.delete(thread.id);
      }
      // An assignment row has no `teamId`, so its batch ids are the only way to reach it.
      const batchIds = await db.aiTeamBatches.where('teamId').equals(id).primaryKeys();
      if (batchIds.length > 0) {
        await db.aiTeamAssignments.where('batchId').anyOf(batchIds).delete();
      }
      await db.aiTeamBatches.where('teamId').equals(id).delete();
      // 37.1 WR-07: the message log and its cursors belong to the team. Leaving them behind
      // would orphan rows the backup never covers, and a re-created team id would inherit
      // another conversation's read state.
      await db.teamMessages.where('teamId').equals(id).delete();
      await db.teamReadCursors.where('teamId').equals(id).delete();
      await db.teamParticipants.where('teamId').equals(id).delete();
      await db.aiTeamMembers.where('teamId').equals(id).delete();
      await db.aiTeamLinks.where('teamId').equals(id).delete();
      await db.aiTeams.delete(id);
    }
  );
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

  // WR-04: a lead row written here would bypass `assignLeader` and the leader lock, and
  // leave `aiTeams.leadId` out of step — the exact state the backup validator rejects.
  if (validated.role === 'lead') {
    throw new Error('Dùng assignLeader để chọn leader.');
  }

  return db.transaction('rw', [db.aiTeamMembers, db.aiEmployees], async () => {
    // WR-05: a dangling agentId produces a backup the app's own validator rejects.
    const agent = await db.aiEmployees.get(validated.agentId);
    if (!agent) throw new Error(`Không tìm thấy nhân viên: ${validated.agentId}`);

    const siblings = await db.aiTeamMembers
      .where('teamId')
      .equals(validated.teamId)
      .toArray();

    // WR-04: a double click can race the Select's option list.
    if (siblings.some((row) => row.agentId === validated.agentId)) {
      throw new Error('Nhân viên đã có trong nhóm.');
    }

    const member: AiTeamMember = {
      id: generateId(),
      teamId: validated.teamId,
      agentId: validated.agentId,
      role: validated.role,
      budgetTokens: validated.budgetTokens,
      usedTokens: validated.usedTokens,
      inputTokens: 0,
      outputTokens: 0,
    };
    await db.aiTeamMembers.add(member);
    return member;
  });
}

export async function removeTeamMember(
  memberId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.aiTeamMembers, db.aiTeams], async () => {
    const row = await db.aiTeamMembers.get(memberId);
    if (!row) return;
    if (row.role === 'lead') {
      throw new Error('Không thể gỡ leader khỏi nhóm. Hãy đổi leader trước khi khóa.');
    }
    await db.aiTeamMembers.delete(memberId);
  });
}

export async function applyEvenSplit(
  teamId: string,
  totalTokens: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember[]> {
  return db.transaction('rw', [db.aiTeamMembers], () => writeEvenSplit(teamId, totalTokens, db));
}

/** Phase 38 D-16/D-17: the two additive scopes. An absolute write is a different verb. */
export type TopUpScopeInput = { kind: 'agent'; agentId: string } | { kind: 'team' };

export interface BudgetWriteResult {
  team: AiTeam;
  members: AiTeamMember[];
}

/** Never interpolate the id: the string reaches the UI, where a raw UUID is noise. */
const MISSING_MEMBER_FOR_TOPUP =
  'Không tìm thấy thành viên trong nhóm. Hãy thêm nhân viên trước khi cấp thêm token.';

/**
 * Phase 38 D-16/D-17/D-18/D-19: the ONE additive budget writer.
 *
 * Agent scope raises that member's share and the team total by the same amount; team scope
 * splits the increase evenly across the roster read FRESH inside the transaction (D-18, so a
 * member added mid-turn is reachable). Both rows move in one `rw` transaction over
 * `[aiTeams, aiTeamMembers]` — a throw anywhere leaves both tables byte-identical.
 *
 * ADDITIVE only: this raises the total by `amount`. An absolute Settings save must use
 * {@link applyTeamBudgetSettings}, or the member increase would be added to the total twice.
 */
export async function applyTopUp(
  teamId: string,
  scope: TopUpScopeInput,
  amount: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<BudgetWriteResult> {
  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
    const team = await db.aiTeams.get(teamId);
    if (!team) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
    // D-18/WR-13: the roster is read here, never from a caller's cache.
    const roster = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
    // T-38-10: a negative or fractional amount never reaches a stored row.
    const added = Math.max(0, Math.round(amount));

    if (scope.kind === 'agent' && !roster.some((row) => row.agentId === scope.agentId)) {
      throw new Error(MISSING_MEMBER_FOR_TOPUP);
    }
    if (added === 0) return { team, members: roster };

    let updatedRoster: AiTeamMember[];
    if (scope.kind === 'agent') {
      updatedRoster = roster.map((row) =>
        row.agentId === scope.agentId
          ? { ...row, budgetTokens: row.budgetTokens + added }
          : row
      );
    } else {
      // D-14/D-16: the split rule lives once, in `budgetSplit.ts`. Each share is ADDED to the
      // existing budget — never written alone, which would reset the member's granted budget.
      const shares = new Map(
        splitEvenly(added, roster).map((row) => [row.id, row.budgetTokens] as const)
      );
      updatedRoster = roster.map((row) => ({
        ...row,
        budgetTokens: row.budgetTokens + (shares.get(row.id) ?? 0),
      }));
    }

    for (const row of updatedRoster) await db.aiTeamMembers.put(row);

    const updatedTeam: AiTeam = {
      ...team,
      budgetTokens: team.budgetTokens + added,
      updatedAt: new Date().toISOString(),
    };
    await db.aiTeams.put(updatedTeam);
    return { team: updatedTeam, members: updatedRoster };
  });
}

/**
 * @deprecated Phase 38 — use {@link applyTopUp}. Kept as a forwarding shim so the remaining
 * no-coordinator caller keeps compiling; it holds no arithmetic of its own, so the member
 * share and the team total can no longer drift apart.
 */
export async function topUpMemberBudget(
  memberId: string,
  added: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

  const result = await applyTopUp(
    row.teamId,
    { kind: 'agent', agentId: row.agentId },
    added,
    db
  );
  return result.members.find((member) => member.id === memberId) ?? row;
}

/** CR-02: a budget *decrease* is a write, not a top-up — it must not open the gate. */
export async function setMemberBudget(
  memberId: string,
  budgetTokens: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

  const next = Math.max(0, budgetTokens);
  await db.aiTeamMembers.update(memberId, { budgetTokens: next });
  return { ...row, budgetTokens: next };
}

/** Phase 38 D-09/D-23: one usage charge, split into its input and output halves. */
export interface MemberUsageDelta {
  inputTokens: number;
  outputTokens: number;
  /** D-10: the provider gave no `usage`, so these numbers are a local tokenizer estimate. */
  estimated: boolean;
}

/**
 * Phase 38 D-13: the usage ledger is a delta sink, and each call is atomic on its own.
 *
 * The read-modify-write runs inside one `rw` transaction, so 20 concurrent calls land as
 * exactly `start + 20 × delta`. Calling twice for the same attempt adds twice — deduplication
 * is the caller's accounting-key job (D-24 Phase 37.1 baseline), never this function's.
 *
 * `usedTokens` stays in sync as the legacy scalar every existing reader sums; plan 09 switches
 * those readers to the split columns.
 */
export async function incrementMemberUsage(
  memberId: string,
  delta: MemberUsageDelta,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  return db.transaction('rw', db.aiTeamMembers, async () => {
    const row = await db.aiTeamMembers.get(memberId);
    if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

    const next: AiTeamMember = {
      ...row,
      usedTokens: (row.usedTokens ?? 0) + delta.inputTokens + delta.outputTokens,
      inputTokens: (row.inputTokens ?? 0) + delta.inputTokens,
      outputTokens: (row.outputTokens ?? 0) + delta.outputTokens,
    };
    // D-10: an untouched pre-V25 row keeps the key absent; once estimated, it stays estimated.
    if (row.usageEstimated === true || delta.estimated) {
      next.usageEstimated = true;
    } else {
      delete next.usageEstimated;
    }

    await db.aiTeamMembers.put(next);
    return next;
  });
}

/**
 * @deprecated Phase 38 — use {@link incrementMemberUsage}. Kept until plan 07 rewires
 * `teamRunCoordinator`, which still charges a single scalar.
 */
export async function addUsedTokens(
  memberId: string,
  delta: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  return incrementMemberUsage(
    memberId,
    { inputTokens: delta, outputTokens: 0, estimated: false },
    db
  );
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
