import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { AiTeam } from '../../types/aiOffice';
import { createNote, detachNoteReferences } from './noteRepo';
import { generateId } from '../../utils/uuid';

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
 * so it is an untrusted handle. A *member* folder is a live folder that is a direct child of the
 * team folder. Anything else is treated as absent and rebuilt, never trusted.
 */
export async function isChildFolderOf(
  noteId: string | undefined,
  parentId: string | undefined,
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  if (noteId === undefined || parentId === undefined) return false;
  const row = await db.notes.get(noteId);
  return !!row && !row.deletedAt && row.type === 'folder' && row.parentId === parentId;
}

/**
 * CR-01: the ONE place a team folder handle is validated, used by every consumer (backfill,
 * delete, rename, add-member, lead write).
 *
 * Identity is the slug stamped at creation, and NOTHING else. Every weaker proof failed:
 *
 * - Parent shape ("direct child of the current root") over-refuses — the `AI Teams` root is an
 *   ordinary folder the owner can delete, and every existing team folder is then parented to a
 *   dead row.
 * - "No rival team claims it" under-refuses — a user folder the owner created is claimed by
 *   nobody, so a corrupted backup pointing a team at it made `deleteTeam` hard-delete the user's
 *   folder and every document inside.
 * - A parent-shape *fallback* for slugless trees re-opened the same hole: any live folder under
 *   the root (including a member folder dragged there) satisfied it.
 *
 * Phase 41 has not shipped, so there is no slugless production tree to support; the fallback is
 * gone. A handle that does not carry exactly this team's slug is treated as absent and rebuilt.
 *
 * Ceiling: `slug` is a Note field the owner can edit through the docs UI, so this is an
 * accident-proof marker, not a security boundary. That matches the threat model — a corrupted
 * backup, not a hostile owner.
 */
export async function resolveTeamFolder(
  teamId: string,
  docsFolderId: string | undefined,
  db: TaskPlannerDatabase = defaultDb
): Promise<string | undefined> {
  if (docsFolderId === undefined) return undefined;

  const row = await db.notes.get(docsFolderId);
  if (!row || row.deletedAt || row.type !== 'folder') return undefined;

  return row.slug === teamFolderSlug(teamId) ? docsFolderId : undefined;
}

/** CR-01/WR-01: a team folder's identity marker, stamped at creation. */
export function teamFolderSlug(teamId: string): string {
  return `ai-team:${teamId}`;
}

/**
 * CR-07: a member folder's identity is this slug, never its title. Display names are not unique
 * (`AiEmployeeInputSchema` has no uniqueness rule, and leads live in a different table), so a
 * title match let a second agent named "An" adopt the first one's zone and overwrite its
 * documents. The slug is scoped by team so one agent in two teams gets two folders.
 */
export function memberFolderSlug(teamId: string, agentId: string): string {
  return `ai-member:${teamId}:${agentId}`;
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
 *
 * CR-07: the folder carries `slug = memberFolderSlug(teamId, agentId)` so its identity never
 * depends on the display name, which is not unique.
 */
export async function createMemberFolder(
  teamFolderId: string,
  agentName: string,
  db: TaskPlannerDatabase = defaultDb,
  identity?: { teamId: string; agentId: string }
): Promise<string> {
  const children = await db.notes.where('parentId').equals(teamFolderId).toArray();
  const taken = new Set(
    children.filter((child) => child.type === 'folder' && !child.deletedAt).map((c) => c.title)
  );

  let title = agentName;
  // Ceiling: 99 suffixed siblings. Past that a generated suffix keeps a hostile roster from
  // spinning, and — unlike a timestamp — cannot collide with a sibling minted in the same
  // millisecond (IN-03).
  for (let attempt = 2; taken.has(title) && attempt <= 99; attempt += 1) {
    title = `${agentName} (${attempt})`;
  }
  if (taken.has(title)) title = `${agentName} (${generateId().slice(0, 8)})`;

  const folder = await createNote(
    {
      title,
      body: '',
      type: 'folder',
      parentId: teamFolderId,
      ...(identity !== undefined
        ? { slug: memberFolderSlug(identity.teamId, identity.agentId) }
        : {}),
    },
    db
  );
  return folder.id;
}

/**
 * WR-02/CR-07/WR-04: the live folder this agent already owns, if any.
 *
 * `removeTeamMember` keeps the folder on purpose, so re-adding the same agent must adopt that
 * folder rather than mint a ` (2)` sibling that strands everything written earlier. Identity is
 * the slug, so two agents with the same display name never share a zone.
 *
 * WR-09: duplicate slugs are possible (a rebuild can mint a second folder before the first is
 * cleaned up, and `slug` is not unique), so the scan prefers a folder that is a direct child of
 * this team folder and falls back to the first match. Deterministic either way.
 */
export async function findMemberFolderForAgent(
  teamId: string,
  agentId: string,
  teamFolderId?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<string | undefined> {
  const slug = memberFolderSlug(teamId, agentId);
  // `slug` is not indexed, so a scan is the honest form.
  const matches = (await db.notes.toArray()).filter(
    (note) => note.type === 'folder' && !note.deletedAt && note.slug === slug
  );
  if (matches.length === 0) return undefined;
  if (teamFolderId !== undefined) {
    const child = matches.find((note) => note.parentId === teamFolderId);
    if (child !== undefined) return child.id;
  }
  return matches[0]?.id;
}

/**
 * D-09: team folder under the shared root, plus one folder per member in the order given.
 *
 * It does NOT write `AiTeam.docsFolderId` / `AiTeamMember.docsFolderId` — the caller owns those
 * rows and writes them inside the same transaction. Opens no transaction of its own.
 */
export async function createTeamDocsTree(
  teamId: string,
  teamName: string,
  members: readonly { agentId: string; name: string }[],
  db: TaskPlannerDatabase = defaultDb
): Promise<{ folderId: string; memberFolderIds: Map<string, string> }> {
  const rootId = await ensureDocsRoot(db);
  const teamFolder = await createNote(
    {
      title: teamName,
      body: '',
      type: 'folder',
      parentId: rootId,
      slug: teamFolderSlug(teamId),
    },
    db
  );

  const memberFolderIds = new Map<string, string>();
  for (const member of members) {
    memberFolderIds.set(
      member.agentId,
      await createMemberFolder(teamFolder.id, member.name, db, {
        teamId,
        agentId: member.agentId,
      })
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
  db: TaskPlannerDatabase,
  ownerTeamId: string
): Promise<void> {
  if (teamFolderId === undefined) return;

  // CR-01/CR-06: the ONE resolver decides whether this handle is really this team's folder.
  // It refuses the shared root, a user document, a user folder and another team's folder, and it
  // does NOT depend on the folder still being a child of the *current* root — the owner can
  // delete the `AI Teams` root from Docs, after which a parent-shape rule would silently delete
  // nothing and leak the whole tree.
  if ((await resolveTeamFolder(ownerTeamId, teamFolderId, db)) === undefined) return;

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

      // CR-05: the handle is validated by the ONE resolver, not by `isLiveFolder` alone — a
      // restored id naming the shared root or another team's folder must rebuild, not be used.
      const teamFolderId = await resolveTeamFolder(teamId, team.docsFolderId, db);

      if (teamFolderId !== undefined) {
        const memberFolderIds = new Map<string, string>();
        // CR-02: how many rows name each folder, so a folder two rows share is given to neither
        // and both get a fresh one. Counting (rather than a growing `claimed` set) is what makes
        // the outcome independent of row order: the first row cannot win a folder the second
        // also names.
        const handleCount = new Map<string, number>();
        for (const row of rows) {
          if (row.docsFolderId === undefined) continue;
          handleCount.set(row.docsFolderId, (handleCount.get(row.docsFolderId) ?? 0) + 1);
        }
        const assigned = new Set<string>();

        for (const row of rows) {
          const agent = await db.aiEmployees.get(row.agentId);
          // CR-03: the slug is the identity. A folder found by slug that is not a direct child
          // of the team folder is NOT re-parented — moving rows is what closed a parent cycle
          // (CR-04) and what let a stale duplicate win. It is simply not this member's zone.
          const owned = await findMemberFolderForAgent(teamId, row.agentId, teamFolderId, db);
          const ownedIsChild =
            owned !== undefined && (await isChildFolderOf(owned, teamFolderId, db));

          // CR-02: a handle shared by two rows is ambiguous — refuse it for both.
          const handleUsable =
            row.docsFolderId !== undefined &&
            handleCount.get(row.docsFolderId) === 1 &&
            (await isChildFolderOf(row.docsFolderId, teamFolderId, db));

          const candidate = ownedIsChild ? (owned as string) : handleUsable ? row.docsFolderId : undefined;

          let folderId: string;
          if (candidate !== undefined && !assigned.has(candidate)) {
            folderId = candidate;
          } else {
            folderId = await createMemberFolder(
              teamFolderId,
              nameFor(row.agentId, agent?.name),
              db,
              { teamId, agentId: row.agentId }
            );
          }
          assigned.add(folderId);
          if (row.docsFolderId !== folderId) {
            await db.aiTeamMembers.update(row.id, { docsFolderId: folderId });
          }
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

      const { folderId, memberFolderIds } = await createTeamDocsTree(teamId, team.name, members, db);
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
