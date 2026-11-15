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
 * The ONE team-folder resolver, used by every consumer (backfill, delete, rename, add-member,
 * lead write). Identity is the slug stamped at creation, and nothing else.
 *
 * Every weaker proof failed in an earlier round:
 *
 * - Parent shape ("direct child of the current root") over-refuses — the `AI Teams` root is an
 *   ordinary folder the owner can delete, and every existing team folder is then parented to a
 *   dead row.
 * - "No rival team claims it" under-refuses — a user folder the owner created is claimed by
 *   nobody, so a corrupted backup pointing a team at it made `deleteTeam` hard-delete the user's
 *   folder and every document inside.
 * - A parent-shape *fallback* for slugless trees re-opened the same hole: any live folder under
 *   the root (including a member folder dragged there) satisfied it.
 * - Corroborating a slugless folder from member handles was an ADOPTION primitive, not a check:
 *   a payload that pointed both the team handle and one member handle at a user folder made the
 *   next turn stamp a real slug onto it, after which `deleteTeam` destroyed it.
 *
 * The slug is only trustworthy because the invariant is enforced at the two boundaries that can
 * write it — `validateBackup` rejects a payload whose slugs and handles disagree, and `updateNote`
 * refuses to change `slug`/`type` on a note carrying a reserved slug. Inside the app the
 * invariant therefore holds, and a handle that does not carry exactly this team's slug is treated
 * as absent and rebuilt. A stranded tree is the owner's to clean up, which is already the
 * documented rule for a hand-deleted folder.
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

/**
 * CR-02: the delete path's resolver. Same identity proof, but `deletedAt` is NOT part of
 * identity — a tree the owner moved to Trash is still this team's tree, and D-10 says the team's
 * delete takes it. Used only by `deleteTeamDocsTree`.
 */
async function resolveTeamFolderIncludingDeleted(
  teamId: string,
  docsFolderId: string | undefined,
  db: TaskPlannerDatabase
): Promise<string | undefined> {
  if (docsFolderId === undefined) return undefined;
  const row = await db.notes.get(docsFolderId);
  if (!row || row.type !== 'folder') return undefined;
  return row.slug === teamFolderSlug(teamId) ? docsFolderId : undefined;
}

/** CR-01/WR-01: a team folder's identity marker, stamped at creation. */
export function teamFolderSlug(teamId: string): string {
  return `ai-team:${teamId}`;
}

/** The shared root's own marker, so a forged setting cannot point it at a user folder (WR-03). */
export const AI_TEAMS_DOCS_ROOT_SLUG = 'ai-root';

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
 * setting is missing or names anything other than a live folder carrying the root slug.
 *
 * WR-03: the setting is a plain `settings` row restored verbatim from backup, so a payload that
 * pointed it at a user folder would make every team tree a child of that folder — deleting the
 * user folder from Docs would then take every team's tree with it. The slug check is what makes
 * the setting a hint rather than an authority.
 *
 * No transaction here — this runs inside `createTeam`'s and `ensureTeamDocsReady`'s ambient
 * transaction, and a nested one would split the rollback.
 */
export async function ensureDocsRoot(db: TaskPlannerDatabase = defaultDb): Promise<string> {
  const setting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
  const stored = typeof setting?.value === 'string' ? setting.value : undefined;
  if (stored !== undefined) {
    const row = await db.notes.get(stored);
    if (row && !row.deletedAt && row.type === 'folder' && row.slug === AI_TEAMS_DOCS_ROOT_SLUG) {
      return stored;
    }
  }

  const root = await createNote(
    {
      title: AI_TEAMS_DOCS_ROOT_TITLE,
      body: '',
      type: 'folder',
      slug: AI_TEAMS_DOCS_ROOT_SLUG,
    },
    db,
    { allowReservedSlug: true }
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
    db,
    { allowReservedSlug: true }
  );
  return folder.id;
}

/**
 * CR-01/CR-03: the ONE member-zone resolver. Identity is the slug stamped at creation AND the
 * folder being a direct child of the team folder — both, never either.
 *
 * Slug alone was not enough: a stale duplicate outside the tree won the scan. Parent alone was
 * not enough either: any child of the team folder (the lead's own zone, a folder the owner
 * dragged in) satisfied it, so a row could adopt another agent's zone and its documents. The
 * handle (`docsFolderId`) is only a cache and is never consulted here.
 *
 * Duplicate slugs are possible (`slug` is not unique), so the result is sorted by id — the same
 * input always resolves to the same folder.
 */
export async function resolveMemberFolder(
  teamId: string,
  agentId: string,
  teamFolderId: string | undefined,
  db: TaskPlannerDatabase = defaultDb
): Promise<string | undefined> {
  if (teamFolderId === undefined) return undefined;
  const slug = memberFolderSlug(teamId, agentId);
  // `slug` is not indexed, so a scan is the honest form.
  const matches = (await db.notes.toArray()).filter(
    (note) =>
      note.type === 'folder' &&
      !note.deletedAt &&
      note.slug === slug &&
      note.parentId === teamFolderId
  );
  return matches.sort((a, b) => (a.id < b.id ? -1 : 1))[0]?.id;
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
    db,
    { allowReservedSlug: true }
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
 * fixed-depth walk leaves deeper notes with a dangling `parentId`, and `DocFolderTree`
 * re-surfaces those as roots. The `seen` set also makes the walk cycle-safe.
 *
 * CR-05: the walk deliberately does NOT try to tell an app-minted folder from one the owner
 * filed here. The two are indistinguishable in the data (both are plain folders under a member
 * folder), and D-10 says the team's delete takes the whole tree. The safety comes from the
 * delete being recoverable, not from guessing which folder is whose.
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
 * D-10: remove the team folder, its member folders and every note inside them.
 *
 * D-10's decision is "deleting a team takes the whole tree". It is implemented as a SOFT delete,
 * deliberately: the identity proof for the tree is a slug that arrives from a backup payload, and
 * no payload check can make payload-supplied data authoritative for an irreversible operation. A
 * crafted or corrupted payload can therefore point a team handle at a folder the owner cares
 * about; with a hard delete that costs the owner their documents, and with a soft delete it costs
 * them a Trash restore. The tree still leaves Docs and the team either way.
 *
 * The shared `AI Teams` root and its setting are never touched; other teams may still use them.
 *
 * CR-05: only app-minted folders are touched (see `collectOwnedSubtreeIds`), so a folder the
 * owner filed under a team folder is left alone.
 *
 * CR-02: a tree the owner moved to Trash is still this team's tree — `deletedAt` is not part of
 * identity. A handle that names a live folder it cannot prove is a REFUSAL, not a no-op, because
 * silently returning deleted the team row and left the tree behind with no handle left.
 */
export async function deleteTeamDocsTree(
  teamFolderId: string | undefined,
  ownerTeamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (teamFolderId === undefined) return;

  const resolved = await resolveTeamFolderIncludingDeleted(ownerTeamId, teamFolderId, db);
  if (resolved === undefined) {
    const row = await db.notes.get(teamFolderId);
    if (row && !row.deletedAt) {
      throw new Error(
        'Không xác định được thư mục tài liệu của nhóm. Huỷ nhóm đã dừng lại để không xoá nhầm.'
      );
    }
    // The handle names a row that is already gone — nothing to delete.
    return;
  }

  const ids = await collectSubtreeIds(teamFolderId, db);

  // CR-04: attachments, document-set entries and document-scoped threads all reference notes;
  // the shared helper detaches every one of them, or the app's own next export fails
  // `validateBackup`. It also clears the team handles that named a dying folder.
  await detachNoteReferences(ids, db);
  const now = new Date().toISOString();
  for (const id of ids) {
    await db.notes.update(id, { deletedAt: now, updatedAt: now });
  }
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

      // CR-01: the ONE team-folder resolver. A handle that does not carry this team's slug is
      // absent, and a fresh tree is built — adoption was an attack surface, not a safety net.
      const teamFolderId = await resolveTeamFolder(teamId, team.docsFolderId, db);

      if (teamFolderId !== undefined) {
        const memberFolderIds = new Map<string, string>();
        const assigned = new Set<string>();

        for (const row of rows) {
          const agent = await db.aiEmployees.get(row.agentId);

          // WR-01: duplicate `agentId` rows are one agent and therefore ONE zone. Reusing the
          // folder already resolved for this agent keeps the second row stable instead of
          // minting a fresh folder every turn (the slug match is the same for both rows, so a
          // per-row fallback would still grow the tree). `validateBackup` now rejects the state
          // on import; this keeps an existing local one from drifting.
          const already = memberFolderIds.get(row.agentId);
          if (already !== undefined) {
            if (row.docsFolderId !== already) {
              await db.aiTeamMembers.update(row.id, { docsFolderId: already });
            }
            continue;
          }

          // CR-01/CR-03: identity is the (slug, parent) pair, resolved in ONE place. The handle
          // is only a cache — a stale duplicate, another agent's zone, or a folder the owner
          // dragged elsewhere all resolve to `undefined` and get a fresh zone. Nothing is
          // re-parented: moving rows is what closed a parent cycle (CR-04).
          //
          // CR-03 (round 8): the handle is NOT a fallback. A folder this resolver rejects is
          // rejected by `write_doc` too, so handing it out made the backfill and the write path
          // disagree — the agent was told to write into a folder the handler always refuses.
          const owned = await resolveMemberFolder(teamId, row.agentId, teamFolderId, db);

          const folderId =
            (owned !== undefined && !assigned.has(owned) ? owned : undefined) ??
            (await createMemberFolder(teamFolderId, nameFor(row.agentId, agent?.name), db, {
              teamId,
              agentId: row.agentId,
            }));

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
