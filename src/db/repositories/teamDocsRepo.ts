import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import { createNote } from './noteRepo';

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
