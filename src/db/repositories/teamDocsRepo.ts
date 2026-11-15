import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiTeam } from '../../types/aiOffice';
import { createNote, detachNoteReferences } from './noteRepo';

/**
 * Docs folder tree for AI teams (Phase 41, D-08/D-08b/D-09/D-10/D-11/D-12/D-12b).
 *
 * Three callers need the same tree logic — `createTeam`, `addTeamMember`/`deleteTeam`, and the
 * coordinator's turn-start backfill — so the naming rule, the collision suffix, the liveness
 * check and the transaction boundary live here once.
 *
 * Every helper takes the ambient `db` last and opens NO transaction of its own except
 * `ensureTeamDocsReady`: Dexie joins the caller's `rw` transaction automatically, so
 * `createTeam`'s rollback covers the folders too (D-09).
 */

/** D-08: identity is this setting key, never a title match — renaming the folder cannot break it. */
export const AI_TEAMS_DOCS_ROOT_SETTING_KEY = 'ai_teams_docs_root';

/** D-08: used only when the root is created. */
export const AI_TEAMS_DOCS_ROOT_TITLE = 'AI Teams';

/** D-12b: true only when the id still names a live folder row. */
export async function isLiveFolder(
  noteId: string | undefined,
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  if (noteId === undefined) return false;
  const row = await db.notes.get(noteId);
  return !!row && !row.deletedAt && row.type === 'folder';
}

/**
 * CR-01/CR-03: `docsFolderId` is restored verbatim from a backup and validated only as a UUID,
 * so it is an untrusted handle. A *team* folder is a live folder that is a DIRECT child of the
 * shared `AI Teams` root; a *member* folder is a live folder that is a direct child of the team
 * folder. Anything else is treated as absent and rebuilt, never trusted.
 */
async function isChildFolderOf(
  noteId: string | undefined,
  parentId: string | undefined,
  db: TaskPlannerDatabase
): Promise<boolean> {
  if (noteId === undefined || parentId === undefined) return false;
  const row = await db.notes.get(noteId);
  return !!row && !row.deletedAt && row.type === 'folder' && row.parentId === parentId;
}

/**
 * D-08b: lazy root. Reads the setting; creates the root and rewrites the setting when the
 * setting is missing or names a dead/non-folder note.
 *
 * No transaction here — this runs inside `createTeam`'s and `ensureTeamDocsReady`'s ambient
 * transaction, and a nested one would split the rollback.
 */
export async function ensureDocsRoot(db: TaskPlannerDatabase = defaultDb): Promise<string> {
  const setting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
  const stored = typeof setting?.value === 'string' ? setting.value : undefined;
  if (stored !== undefined && (await isLiveFolder(stored, db))) return stored;

  const root = await createNote(
    { title: AI_TEAMS_DOCS_ROOT_TITLE, body: '', type: 'folder' },
    db
  );
  await db.settings.put({ key: AI_TEAMS_DOCS_ROOT_SETTING_KEY, value: root.id });
  return root.id;
}

/**
 * D-11: one folder per member, named after the agent, suffixed ` (2)`, ` (3)` … on collision
 * inside the team folder. Title length is bounded by `NoteInputSchema` (max 120) — an
 * over-long name is a validation error, not a silently truncated folder (T-41-05).
 */
export async function createMemberFolder(
  teamFolderId: string,
  agentName: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<string> {
  const children = await db.notes.where('parentId').equals(teamFolderId).toArray();
  const taken = new Set(
    children.filter((child) => child.type === 'folder' && !child.deletedAt).map((c) => c.title)
  );

  let title = agentName;
  // Ceiling: 99 suffixed siblings. Past that a timestamp keeps a hostile roster from spinning.
  for (let attempt = 2; taken.has(title) && attempt <= 99; attempt += 1) {
    title = `${agentName} (${attempt})`;
  }
  if (taken.has(title)) title = `${agentName} (${Date.now()})`;

  const folder = await createNote(
    { title, body: '', type: 'folder', parentId: teamFolderId },
    db
  );
  return folder.id;
}

/**
 * WR-02: a live folder inside the team folder whose title matches the agent's name, if any.
 *
 * `removeTeamMember` keeps the folder on purpose, so re-adding the same agent must adopt that
 * folder rather than mint a ` (2)` sibling that strands everything written earlier.
 */
export async function findMemberFolderByTitle(
  teamFolderId: string,
  agentName: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<string | undefined> {
  const children = await db.notes.where('parentId').equals(teamFolderId).toArray();
  const match = children.find(
    (child) => child.type === 'folder' && !child.deletedAt && child.title === agentName
  );
  return match?.id;
}

/**
 * D-09: team folder under the shared root, plus one folder per member in the order given.
 *
 * It does NOT write `AiTeam.docsFolderId` / `AiTeamMember.docsFolderId` — the caller owns those
 * rows and writes them inside the same transaction. Opens no transaction of its own.
 */
export async function createTeamDocsTree(
  teamName: string,
  members: readonly { agentId: string; name: string }[],
  db: TaskPlannerDatabase = defaultDb
): Promise<{ folderId: string; memberFolderIds: Map<string, string> }> {
  const rootId = await ensureDocsRoot(db);
  const teamFolder = await createNote(
    { title: teamName, body: '', type: 'folder', parentId: rootId },
    db
  );

  const memberFolderIds = new Map<string, string>();
  for (const member of members) {
    memberFolderIds.set(
      member.agentId,
      await createMemberFolder(teamFolder.id, member.name, db)
    );
  }
  return { folderId: teamFolder.id, memberFolderIds };
}

/**
 * CR-03: every descendant id of `rootId`, however deep.
 *
 * The tree is NOT bounded to three levels — the owner can create subfolders inside a member
 * folder from the Docs UI (`DocFolderTree` → `onCreateFolder(name, parentFolder.id)`), so a
 * fixed-depth delete leaves deeper notes with a dangling `parentId`, and `DocFolderTree`
 * re-surfaces those as roots. The `seen` set also makes the walk cycle-safe.
 */
async function collectSubtreeIds(
  rootId: string,
  db: TaskPlannerDatabase
): Promise<string[]> {
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await db.notes.where('parentId').anyOf(frontier).toArray();
    frontier = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      frontier.push(child.id);
    }
  }
  return [...seen];
}

/**
 * D-10: hard-delete the team folder, its member folders and every note inside them.
 *
 * Hard delete, not `deletedAt`: the owner chose "deleting a team deletes the whole tree", and a
 * soft-deleted tree would still occupy the notes table and surface in Trash.
 *
 * The shared `AI Teams` root and its setting are never touched; other teams may still use them.
 */
export async function deleteTeamDocsTree(
  teamFolderId: string | undefined,
  db: TaskPlannerDatabase = defaultDb,
  ownerTeamId?: string
): Promise<void> {
  if (teamFolderId === undefined) return;

  // CR-01: the id is an untrusted handle, not just "not the root". Only a live folder that is a
  // DIRECT child of the shared root is a team folder. Without this, a corrupted `docsFolderId`
  // pointing at a user document or another team's folder would delete that content.
  const rootSetting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
  const rootId = typeof rootSetting?.value === 'string' ? rootSetting.value : undefined;
  if (!(await isChildFolderOf(teamFolderId, rootId, db))) return;

  // CR-01: every team folder is a child of the same root, so the shape check alone cannot tell
  // THIS team's folder from another's. A corrupted `docsFolderId` that duplicates another team's
  // id would delete that team's tree — refuse when the folder is claimed elsewhere.
  // D-13: `docsFolderId` is unindexed payload, so this is a scan, not a `where` query.
  if (ownerTeamId !== undefined) {
    const claimants = (await db.aiTeams.toArray()).filter(
      (team) => team.docsFolderId === teamFolderId
    );
    if (claimants.some((team) => team.id !== ownerTeamId)) return;
  }

  const ids = await collectSubtreeIds(teamFolderId, db);

  // CR-04: attachments, document-set entries and document-scoped threads all reference notes;
  // the shared helper detaches every one of them, or the app's own next export fails
  // `validateBackup`. IN-03: soft-deleted descendants are destroyed too — that is D-10.
  await detachNoteReferences(ids, db);
  await db.notes.bulkDelete(ids);
}

/**
 * D-12/D-12b: idempotent lazy backfill, called by the coordinator before a turn starts.
 *
 * The `docsFolderId` re-read and the `isLiveFolder` check both happen INSIDE the `rw`
 * transaction, so two concurrent runs serialise and the second observes the first's write
 * (T-41-06). The store list must name every table the body reads — `aiEmployees` included, or
 * Dexie throws `NotFoundError` and the backfill silently never persists.
 *
 * A `docsFolderId` naming a dead folder or a non-folder note is treated as absent: a new tree is
 * created and the old id overwritten. The old tree is NOT repaired or restored — the owner
 * deleted it by hand and its documents are already gone.
 *
 * WR-01: the same liveness rule applies PER MEMBER ROW, not just to the team row. A member
 * folder the owner deleted by hand is re-minted here; otherwise `write_doc` would write under a
 * dangling `parentId` and report success, and a row with no id at all would refuse
 * `TEAM_DOCS_NOT_READY` forever with nothing to repair it.
 *
 * CR-03: a member's folder must be a direct child of the team folder. A row pointing anywhere
 * else (the team root, another member's folder) is re-minted, or the member would write into
 * the leader's synthesis area.
 */
export async function ensureTeamDocsReady(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<{ team: AiTeam; memberFolderIds: Map<string, string> }> {
  return db.transaction(
    'rw',
    // WR-01: `aiLeads` is named because the lead's display name lives there, not in
    // `aiEmployees` — reading it from an unnamed store is a `NotFoundError`.
    [db.aiTeams, db.aiTeamMembers, db.aiEmployees, db.aiLeads, db.notes, db.settings],
    async () => {
      const team = await db.aiTeams.get(teamId);
      if (!team) throw new Error(`Không tìm thấy nhóm: ${teamId}`);

      const rows = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
      // WR-01: the lead is an `aiLeads` row; every other member is an `aiEmployees` row.
      const lead = team.leadId === undefined ? undefined : await db.aiLeads.get(team.leadId);
      const nameFor = (agentId: string, employeeName: string | undefined): string =>
        agentId === team.leadId ? (lead?.name ?? agentId) : (employeeName ?? agentId);

      if (team.docsFolderId !== undefined && (await isLiveFolder(team.docsFolderId, db))) {
        const memberFolderIds = new Map<string, string>();
        for (const row of rows) {
          // CR-03: a live folder that is NOT a child of the team folder is not this member's
          // zone — treat it as absent and re-mint.
          if (await isChildFolderOf(row.docsFolderId, team.docsFolderId, db)) {
            memberFolderIds.set(row.agentId, row.docsFolderId as string);
            continue;
          }
          // Missing, dead, or mis-parented: mint one in place. The team folder is live, so this
          // is a repair, not a rebuild.
          const agent = await db.aiEmployees.get(row.agentId);
          const folderId = await createMemberFolder(
            team.docsFolderId,
            nameFor(row.agentId, agent?.name),
            db
          );
          await db.aiTeamMembers.update(row.id, { docsFolderId: folderId });
          memberFolderIds.set(row.agentId, folderId);
        }
        return { team, memberFolderIds };
      }

      const agents = await db.aiEmployees.bulkGet(rows.map((row) => row.agentId));
      const members = rows.map((row, index) => ({
        agentId: row.agentId,
        // A dangling agentId still gets a folder, named after the id — never a throw.
        name: nameFor(row.agentId, agents[index]?.name),
      }));

      const { folderId, memberFolderIds } = await createTeamDocsTree(team.name, members, db);
      const now = new Date().toISOString();

      await db.aiTeams.update(teamId, { docsFolderId: folderId, updatedAt: now });
      for (const row of rows) {
        const memberFolderId = memberFolderIds.get(row.agentId);
        if (memberFolderId !== undefined) {
          await db.aiTeamMembers.update(row.id, { docsFolderId: memberFolderId });
        }
      }

      return { team: { ...team, docsFolderId: folderId, updatedAt: now }, memberFolderIds };
    }
  );
}
