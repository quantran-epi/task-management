import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiTeam, AiTeamLink, AiTeamMember } from '../../types/aiOffice';
import { clampBudgetWarnThresholdPct, clampTeamConcurrency } from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';
import { splitEvenly } from '../../services/ai/office/budgetSplit';
import {
  createMemberFolder,
  createTeamDocsTree,
  deleteTeamDocsTree,
  ensureTeamDocsReady,
  findMemberFolderForAgent,
  isChildFolderOf,
  resolveTeamFolder,
} from './teamDocsRepo';
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
  // WR-04: a duplicate id would write two member rows for one agent, and `createTeamDocsTree`
  // keys folders by `agentId` — the second folder (`X (2)`) would win while the first is left
  // orphaned. The lead also never belongs in the employee list; its row is built from `leadId`.
  const employeeIds = [...new Set(input.employeeIds ?? [])].filter(
    (agentId) => agentId !== validated.leadId
  );

  const now = new Date().toISOString();
  const team: AiTeam = {
    id: generateId(),
    name: validated.name,
    budgetTokens: validated.budgetTokens,
    createdAt: now,
    updatedAt: now,
  };
  if (validated.leadId !== undefined) team.leadId = validated.leadId;
  if (validated.autoSplitEnabled !== undefined) team.autoSplitEnabled = validated.autoSplitEnabled;
  if (validated.autoApproveMutations !== undefined) {
    team.autoApproveMutations = validated.autoApproveMutations;
  }
  if (validated.mcpEnabled !== undefined) team.mcpEnabled = validated.mcpEnabled;
  if (validated.concurrencyLimit !== undefined) {
    team.concurrencyLimit = clampTeamConcurrency(validated.concurrencyLimit);
  }
  if (validated.budgetWarnThresholdPct !== undefined) {
    team.budgetWarnThresholdPct = clampBudgetWarnThresholdPct(validated.budgetWarnThresholdPct);
  }

  // D-09: `db.notes` and `db.settings` join the transaction — the folder tree and the shared
  // root setting are written here and must roll back with the team row.
  const transactionTables = [
    db.aiTeams,
    db.aiTeamMembers,
    db.aiLeads,
    db.aiEmployees,
    db.notes,
    db.settings,
  ];

  // D-09: the tree is created inside the transaction, but the returned row must carry the id
  // without a re-read — captured here and merged into the result after commit.
  let docsFolderId: string | undefined;

  await db.transaction('rw', transactionTables, async () => {
    await assertAgentsExist(team.leadId, employeeIds, db);

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

    // D-09/D-11: one team folder plus one folder per member row — the lead is a member row
    // like any other. `createTeamDocsTree` opens no transaction, so it joins this one.
    // Built BEFORE the rows are written, so each row carries its folder id from the start
    // instead of being rewritten immediately after (IN-05).
    const leadAgent = team.leadId === undefined ? undefined : await db.aiLeads.get(team.leadId);
    const employeeAgents = await db.aiEmployees.bulkGet(
      rows.filter((row) => row.role === 'employee').map((row) => row.agentId)
    );
    const names = new Map<string, string>();
    if (leadAgent !== undefined) names.set(leadAgent.id, leadAgent.name);
    for (const agent of employeeAgents) {
      // A dangling agentId still gets a folder named after the id — never a throw.
      if (agent !== undefined) names.set(agent.id, agent.name);
    }

    const tree = await createTeamDocsTree(
      team.id,
      team.name,
      rows.map((row) => ({ agentId: row.agentId, name: names.get(row.agentId) ?? row.agentId })),
      db
    );
    docsFolderId = tree.folderId;

    await db.aiTeams.add({ ...team, docsFolderId: tree.folderId });
    await db.aiTeamMembers.bulkAdd(
      rows.map((row) => {
        const memberFolderId = tree.memberFolderIds.get(row.agentId);
        return memberFolderId === undefined ? row : { ...row, docsFolderId: memberFolderId };
      })
    );
    await writeEvenSplit(team.id, team.budgetTokens, db);
  });

  return docsFolderId === undefined ? team : { ...team, docsFolderId };
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

  // D-09/D-10: the tree is created and destroyed inside this transaction, so the folder rows
  // and the root setting roll back with the team row. `db.aiEmployees` is reached only by the
  // nested backfill — the easiest store to forget, and a `SubTransactionError` if it is.
  const tables = [db.aiTeams, db.aiTeamMembers, db.aiLeads, db.aiEmployees, db.notes, db.settings];

  return db.transaction('rw', tables, async () => {
    const existing = await db.aiTeams.get(id);
    if (!existing) throw new Error(`Không tìm thấy nhóm: ${id}`);
    assertLeaderUnlocked(existing, validated.leadId);
    // A patch that omits leadId stays legal; a patch that sets one must name a real lead.
    if (validated.leadId !== undefined) await assertAgentsExist(validated.leadId, [], db);

    const updated: AiTeam = { ...existing, updatedAt: new Date().toISOString() };

    if (validated.name !== undefined) updated.name = validated.name;
    if (validated.leadId !== undefined) updated.leadId = validated.leadId;
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
    if ('mcpEnabled' in patch) {
      if (validated.mcpEnabled !== undefined) {
        updated.mcpEnabled = validated.mcpEnabled;
      } else {
        delete updated.mcpEnabled;
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
    // The row is already validated by `assertAgentsExist`, so the fallback only keeps the type
    // honest.
    if (validated.leadId !== undefined && validated.leadId !== existing.leadId) {
      const nextLead = await db.aiLeads.get(validated.leadId);
      await writeLeadRow(id, validated.leadId, nextLead?.name ?? validated.leadId, db);
      // The nested backfill may have just written a fresh `docsFolderId` onto the row we read
      // before it ran. Carry that id forward, or this `put` would erase the new tree's handle.
      const fresh = await db.aiTeams.get(id);
      if (fresh?.docsFolderId !== undefined) updated.docsFolderId = fresh.docsFolderId;
    }

    await db.aiTeams.put(updated);

    // WR-07/CR-02/WR-01: the docs tree is keyed by `docsFolderId`, so a rename never breaks it —
    // but the owner would keep seeing a folder named after the team's previous name. Rename it
    // here, in the same transaction, and only when the resolver proves the id is THIS team's
    // folder: `docsFolderId` is an untrusted handle restored from a backup.
    if (validated.name !== undefined) {
      const teamFolderId = await resolveTeamFolder(id, updated.docsFolderId, db);
      if (teamFolderId !== undefined) {
        await db.notes.update(teamFolderId, {
          title: validated.name,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return updated;
  });
}

/**
 * CR-05: replaces the single `role='lead'` member row for a team.
 *
 * Usage belongs to the AGENT, not the seat, so:
 * - the incoming agent's own roster row is promoted in place (its budget and recorded usage
 *   come with it) instead of a second row being created at 0;
 * - the outgoing lead's row is demoted to `employee` when it carries recorded usage, so the
 *   charge never disappears from the roster sums the team total is built from. A row with no
 *   usage is deleted, as before.
 */
async function writeLeadRow(
  teamId: string,
  leadId: string,
  leadName: string,
  db: TaskPlannerDatabase
): Promise<void> {
  // D-12b: resolve the team folder here, not at the call sites, so both callers cannot drift.
  const team = await db.aiTeams.get(teamId);
  if (!team) throw new Error(`Không tìm thấy nhóm: ${teamId}`);

  // CR-05: the handle is validated by the ONE resolver, so an untrusted id rebuilds instead of
  // being handed to the new lead.
  let teamFolderId = await resolveTeamFolder(teamId, team.docsFolderId, db);
  let backfillIds = new Map<string, string>();
  if (teamFolderId === undefined) {
    const ready = await ensureTeamDocsReady(teamId, db);
    teamFolderId = ready.team.docsFolderId;
    backfillIds = ready.memberFolderIds;
  }
  if (teamFolderId === undefined) {
    // A leader with no folder would make `write_doc` refuse for a reason the owner cannot see.
    throw new Error(`Không tạo được thư mục tài liệu cho nhóm: ${teamId}`);
  }

  // Read AFTER the backfill, so the rows carry any `docsFolderId` it just wrote.
  const siblings = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
  const incoming = siblings.find((row) => row.agentId === leadId);

  for (const row of siblings) {
    if (row.role !== 'lead' || row.id === incoming?.id) continue;
    const hasUsage =
      row.usedTokens > 0 || (row.inputTokens ?? 0) > 0 || (row.outputTokens ?? 0) > 0;
    // D-11: a demoted row keeps its own `docsFolderId` — a demoted member is still a member and
    // its folder is still where its documents live. No folder is created for the outgoing lead.
    if (hasUsage) await db.aiTeamMembers.update(row.id, { role: 'employee' });
    else await db.aiTeamMembers.delete(row.id);
  }

  if (incoming) {
    // The backfill map first: on a dead tree it already minted this agent's folder and wrote it
    // on the row, so calling `createMemberFolder` here would produce a ` (2)` duplicate.
    const folderId =
      backfillIds.get(leadId) ??
      (incoming.docsFolderId !== undefined &&
      (await isChildFolderOf(incoming.docsFolderId, teamFolderId, db))
        ? incoming.docsFolderId
        : await createMemberFolder(teamFolderId, leadName, db, { teamId, agentId: leadId }));
    await db.aiTeamMembers.update(incoming.id, { role: 'lead', docsFolderId: folderId });
    return;
  }

  // The row did not exist when the backfill ran, so `backfillIds` cannot name it.
  // CR-03: every mint site stamps the slug, or a later repair cannot find this lead's folder and
  // mints a ` (2)` sibling that strands everything the lead wrote earlier.
  const folderId = await createMemberFolder(teamFolderId, leadName, db, {
    teamId,
    agentId: leadId,
  });
  await db.aiTeamMembers.add({
    id: generateId(),
    teamId,
    agentId: leadId,
    role: 'lead',
    budgetTokens: 0,
    usedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    docsFolderId: folderId,
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
  // D-11/D-12b: `writeLeadRow` reaches `ensureTeamDocsReady`, whose transaction spans
  // `[aiTeams, aiTeamMembers, aiEmployees, notes, settings]` — a sub-transaction's tables must
  // be a subset of the parent's. `db.aiEmployees` is read only by the backfill.
  return db.transaction(
    'rw',
    [db.aiTeams, db.aiTeamMembers, db.aiLeads, db.aiEmployees, db.notes, db.settings],
    async () => {
      const existing = await db.aiTeams.get(teamId);
      if (!existing) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
      assertLeaderUnlocked(existing, leadId);

      const lead = await db.aiLeads.get(leadId);
      if (!lead) throw new Error(`Không tìm thấy lead: ${leadId}`);

      // CR-02: re-assigning the current leader is a no-op — recreating the row would
      // silently reset its budget and usage.
      if (existing.leadId === leadId) return existing;

      await writeLeadRow(teamId, leadId, lead.name, db);

      const updated: AiTeam = { ...existing, leadId, updatedAt: new Date().toISOString() };
      // The nested backfill may have just written a fresh `docsFolderId` onto the row read
      // above. Carry it forward, or this `put` would erase the new tree's only handle.
      const fresh = await db.aiTeams.get(teamId);
      if (fresh?.docsFolderId !== undefined) updated.docsFolderId = fresh.docsFolderId;
      await db.aiTeams.put(updated);
      return updated;
    }
  );
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
      db.notes,
      // CR-04/CR-08: `deleteTeamDocsTree` → `detachNoteReferences` touches all of these, and
      // `resolveTeamFolder` reads the shared-root setting. A missing store here is a
      // `SubTransactionError`, not a silent skip.
      db.noteAttachments,
      db.documentSets,
      db.publishedDocuments,
      db.knowledgeLinks,
      db.settings,
    ],
    async () => {
      // D-10: read the team row before anything is deleted — its `docsFolderId` is the only
      // handle on the tree. The shared `AI Teams` root and its setting are never touched.
      const existing = await db.aiTeams.get(id);
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
      // D-10: deleting a team deletes its whole docs tree — the team folder, its member
      // folders and every document inside them. Hard delete, in this same transaction.
      await deleteTeamDocsTree(existing?.docsFolderId, db, id);
      await db.aiTeams.delete(id);
    }
  );
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

  // D-11: `db.aiTeams`/`db.notes`/`db.settings` join the transaction because the dead-tree path
  // reaches `ensureTeamDocsReady`, whose own transaction spans all of these tables — `aiLeads`
  // included, since the backfill resolves the lead's display name from it (WR-01).
  return db.transaction(
    'rw',
    [db.aiTeamMembers, db.aiEmployees, db.aiLeads, db.aiTeams, db.notes, db.settings],
    async () => {
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

      const team = await db.aiTeams.get(validated.teamId);
      if (!team) throw new Error(`Không tìm thấy nhóm: ${validated.teamId}`);

      // CR-05: the handle goes through the ONE resolver, so a restored id naming the shared
      // root or another team's folder rebuilds instead of being used.
      const teamFolderId = await resolveTeamFolder(validated.teamId, team.docsFolderId, db);
      const liveTree = teamFolderId !== undefined;

      // WR-02/CR-07: `removeTeamMember` deliberately keeps the member's folder, so re-adding the
      // same agent must reuse it. Identity is the folder's slug (teamId + agentId), never the
      // display name — two agents named "An" must not share a zone.
      const reusableFolderId = liveTree
        ? await findMemberFolderForAgent(validated.teamId, validated.agentId, teamFolderId, db)
        : undefined;

      const member: AiTeamMember = {
        id: generateId(),
        teamId: validated.teamId,
        agentId: validated.agentId,
        role: validated.role,
        budgetTokens: validated.budgetTokens,
        usedTokens: validated.usedTokens,
        inputTokens: 0,
        outputTokens: 0,
        ...(reusableFolderId !== undefined ? { docsFolderId: reusableFolderId } : {}),
      };
      await db.aiTeamMembers.add(member);

      // D-11: the member gets its own folder in this same transaction. The two paths must stay
      // separate — running both would mint a ` (2)` duplicate for the same agent.
      if (reusableFolderId !== undefined) {
        return member;
      }

      if (liveTree) {
        // Path A — live tree: mint the folder here, stamped with this agent's identity.
        const folderId = await createMemberFolder(teamFolderId, agent.name, db, {
          teamId: validated.teamId,
          agentId: validated.agentId,
        });
        await db.aiTeamMembers.update(member.id, { docsFolderId: folderId });
        return { ...member, docsFolderId: folderId };
      }

      // Path B — dead or absent tree: the backfill recreates the whole tree and writes
      // `docsFolderId` on every member row, including the one just added. Take the id FROM ITS
      // MAP and mint nothing, or the agent ends up with two folders.
      const ready = await ensureTeamDocsReady(validated.teamId, db);
      const folderId = ready.memberFolderIds.get(validated.agentId);
      if (folderId === undefined) {
        // The row was not visible to the backfill's read — a bug worth surfacing, not a
        // member written without a folder.
        throw new Error(`Không tạo được thư mục tài liệu cho thành viên: ${validated.agentId}`);
      }
      return { ...member, docsFolderId: folderId };
    }
  );
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
    // D-11: the member's folder and the documents inside it STAY. The owner must still be able
    // to read what that member wrote; the folder disappears only when the whole team is deleted.
    // Do not "clean up" the tree here.
    await db.aiTeamMembers.delete(memberId);
    // Releasing a seat releases its allocation: the team total is the sum of its grants.
    // Same transaction as the delete, so the roster and the total can never disagree.
    const team = await db.aiTeams.get(row.teamId);
    if (team) {
      await db.aiTeams.update(row.teamId, {
        budgetTokens: Math.max(0, team.budgetTokens - row.budgetTokens),
        updatedAt: new Date().toISOString(),
      });
    }
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

/**
 * WR-01: `Math.max(0, Math.round(NaN))` is `NaN`, and a `NaN` written into `budgetTokens`
 * makes the app's own next export unrestorable (`aiTokensSchema` refuses it). Non-finite
 * input becomes 0 — the same value an absent budget already means.
 */
function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
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
    const added = nonNegativeInt(amount);

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

/**
 * Phase 38 D-04/D-05: the three-state override. `undefined` (or an absent key) leaves the
 * stored value alone, `null` deletes the key so the team inherits the global default, a number
 * clamps and stores. Spelled out so a caller forwarding `number | null | undefined` state
 * type-checks under `exactOptionalPropertyTypes` without a cast.
 */
export interface TeamBudgetSettingsInput {
  budgetTokens: number;
  budgets: Record<string, number>;
  budgetWarnThresholdPct?: number | null | undefined;
}

/**
 * Phase 38 D-19: the ONE absolute budget writer for the Settings drawer.
 *
 * ABSOLUTE, not additive: the team total is set verbatim and each listed member's
 * `budgetTokens` is set verbatim. Routing a positive member delta through {@link applyTopUp}
 * instead would add it to the total a second time — the 3000→5000 bug.
 *
 * Only granted budget moves: every other member field (`usedTokens`, `inputTokens`,
 * `outputTokens`, `usageEstimated`) is carried through untouched. Member budgets summing to
 * less than the team total is legal and preserved — the user may deliberately under-allocate.
 *
 * An id in `budgets` with no roster row is ignored; this never invents a member.
 */
export async function applyTeamBudgetSettings(
  teamId: string,
  input: TeamBudgetSettingsInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<BudgetWriteResult> {
  const budgetTokens = nonNegativeInt(input.budgetTokens);

  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
    const team = await db.aiTeams.get(teamId);
    if (!team) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
    const roster = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();

    const updatedRoster = roster.map((row) => {
      const next = input.budgets[row.id];
      if (next === undefined) return row;
      // Spread keeps the usage columns; only the granted budget is replaced.
      return { ...row, budgetTokens: nonNegativeInt(next) };
    });
    for (const row of updatedRoster) await db.aiTeamMembers.put(row);

    const updatedTeam: AiTeam = {
      ...team,
      budgetTokens,
      updatedAt: new Date().toISOString(),
    };
    // D-04/D-05: never `??` — that collapses `null` (clear) and `undefined` (leave alone).
    if (input.budgetWarnThresholdPct === null) {
      delete updatedTeam.budgetWarnThresholdPct;
    } else if (input.budgetWarnThresholdPct !== undefined) {
      updatedTeam.budgetWarnThresholdPct = clampBudgetWarnThresholdPct(
        input.budgetWarnThresholdPct
      );
    }
    await db.aiTeams.put(updatedTeam);
    return { team: updatedTeam, members: updatedRoster };
  });
}

/** CR-02: a budget *decrease* is a write, not a top-up — it must not open the gate. */
export async function setMemberBudget(
  memberId: string,
  budgetTokens: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

  const next = nonNegativeInt(budgetTokens);
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
