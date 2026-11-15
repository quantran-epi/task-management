// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  AI_TEAMS_DOCS_ROOT_SETTING_KEY,
  AI_TEAMS_DOCS_ROOT_TITLE,
  createMemberFolder,
  createTeamDocsTree,
  deleteTeamDocsTree,
  ensureDocsRoot,
  ensureTeamDocsReady,
  isLiveFolder,
} from '../../src/db/repositories/teamDocsRepo';
import { createEmployee } from '../../src/db/repositories/aiOfficeRepo';
import { createNote } from '../../src/db/repositories/noteRepo';
import type { AiTeam, AiTeamMember } from '../../src/types/aiOffice';
import { generateId } from '../../src/utils/uuid';

/**
 * Phase 41 D-08/D-08b/D-09/D-10/D-11/D-12/D-12b: the docs folder tree repo.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-15T00:00:00.000Z';

describe('teamDocsRepo (Phase 41, D-08, D-10, D-11, D-12, D-12b)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestTeamDocsRepo_' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function folderRows() {
    return (await db.notes.toArray()).filter((note) => note.type === 'folder');
  }

  async function seedTeam(name: string, agentIds: string[]): Promise<AiTeam> {
    const team: AiTeam = {
      id: generateId(),
      name,
      budgetTokens: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.aiTeams.add(team);
    const rows: AiTeamMember[] = agentIds.map((agentId) => ({
      id: generateId(),
      teamId: team.id,
      agentId,
      role: 'employee',
      budgetTokens: 0,
      usedTokens: 0,
    }));
    await db.aiTeamMembers.bulkAdd(rows);
    return team;
  }

  it('creates exactly one AI Teams root and reuses it on a second call', async () => {
    const first = await ensureDocsRoot(db);
    const second = await ensureDocsRoot(db);

    expect(second).toBe(first);
    const roots = (await folderRows()).filter((note) => note.title === AI_TEAMS_DOCS_ROOT_TITLE);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.parentId).toBeUndefined();

    const setting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
    expect(setting?.value).toBe(first);
  });

  it('recreates the root when the setting names a deleted folder', async () => {
    const oldRootId = await ensureDocsRoot(db);
    await db.notes.delete(oldRootId);

    const newRootId = await ensureDocsRoot(db);

    expect(newRootId).not.toBe(oldRootId);
    const setting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
    expect(setting?.value).toBe(newRootId);
    expect((await folderRows()).filter((n) => n.title === AI_TEAMS_DOCS_ROOT_TITLE)).toHaveLength(1);
  });

  it('isLiveFolder rejects a missing id, a deleted folder and a non-folder note', async () => {
    const rootId = await ensureDocsRoot(db);
    const doc = await createNote({ title: 'Doc', body: '', type: 'document' }, db);

    expect(await isLiveFolder(undefined, db)).toBe(false);
    expect(await isLiveFolder(generateId(), db)).toBe(false);
    expect(await isLiveFolder(doc.id, db)).toBe(false);
    expect(await isLiveFolder(rootId, db)).toBe(true);
  });

  it('creates 1 root + 1 team folder + 3 member folders under the right parents', async () => {
    const tree = await createTeamDocsTree(
      'Nhóm A',
      [
        { agentId: generateId(), name: 'An' },
        { agentId: generateId(), name: 'Bình' },
        { agentId: generateId(), name: 'Chi' },
      ],
      db
    );

    expect(await folderRows()).toHaveLength(5);

    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value;
    const teamFolder = await db.notes.get(tree.folderId);
    expect(teamFolder?.parentId).toBe(rootId);
    expect(teamFolder?.title).toBe('Nhóm A');

    expect(tree.memberFolderIds.size).toBe(3);
    for (const memberFolderId of tree.memberFolderIds.values()) {
      expect((await db.notes.get(memberFolderId))?.parentId).toBe(tree.folderId);
    }
  });

  it('suffixes duplicate member folder titles with (2) and (3)', async () => {
    const tree = await createTeamDocsTree('Nhóm A', [{ agentId: generateId(), name: 'An' }], db);

    const second = await createMemberFolder(tree.folderId, 'An', db);
    const third = await createMemberFolder(tree.folderId, 'An', db);

    expect((await db.notes.get(second))?.title).toBe('An (2)');
    expect((await db.notes.get(third))?.title).toBe('An (3)');
  });

  it('deletes the team folder, member folders and their documents, keeping the root and setting', async () => {
    const tree = await createTeamDocsTree(
      'Nhóm A',
      [
        { agentId: generateId(), name: 'An' },
        { agentId: generateId(), name: 'Bình' },
      ],
      db
    );
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    const memberFolderId = tree.memberFolderIds.get([...tree.memberFolderIds.keys()][0] as string)!;

    await createNote({ title: 'Trong thư mục thành viên', body: 'x', type: 'document', parentId: memberFolderId }, db);
    await createNote({ title: 'Trong thư mục nhóm', body: 'y', type: 'document', parentId: tree.folderId }, db);

    await deleteTeamDocsTree(tree.folderId, db);

    const remaining = await db.notes.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(rootId);
    expect(remaining[0]?.title).toBe(AI_TEAMS_DOCS_ROOT_TITLE);

    const setting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
    expect(setting?.value).toBe(rootId);
  });

  it('is a no-op when the team folder id is undefined', async () => {
    const tree = await createTeamDocsTree('Nhóm A', [{ agentId: generateId(), name: 'An' }], db);
    const before = await db.notes.toArray();

    await deleteTeamDocsTree(undefined, db);

    expect(await db.notes.toArray()).toHaveLength(before.length);
    expect(await db.notes.get(tree.folderId)).toBeDefined();
  });

  it('backfills once: two runs yield the same ids and 5 folder rows', async () => {
    const agentIds = [generateId(), generateId(), generateId()];
    for (const agentId of agentIds) {
      await createEmployee(
        { name: `Agent ${agentId.slice(0, 4)}`, role: 'Dev', capability: 'c', persona: 'p', model: 'm' },
        db
      );
    }
    const team = await seedTeam('Nhóm A', agentIds);

    const first = await ensureTeamDocsReady(team.id, db);
    const second = await ensureTeamDocsReady(team.id, db);

    expect(second.team.docsFolderId).toBe(first.team.docsFolderId);
    expect([...second.memberFolderIds.entries()]).toEqual([...first.memberFolderIds.entries()]);
    expect(await folderRows()).toHaveLength(5);
  });

  it('recreates the tree when docsFolderId names a deleted folder', async () => {
    const agentIds = [generateId(), generateId(), generateId()];
    const team = await seedTeam('Nhóm A', agentIds);
    const first = await ensureTeamDocsReady(team.id, db);

    // The owner deleted the whole tree by hand in DocsExplorer (D-12b).
    await deleteTeamDocsTree(first.team.docsFolderId, db);

    const second = await ensureTeamDocsReady(team.id, db);

    expect(second.team.docsFolderId).not.toBe(first.team.docsFolderId);
    expect(await folderRows()).toHaveLength(5);
    const stored = await db.aiTeams.get(team.id);
    expect(stored?.docsFolderId).toBe(second.team.docsFolderId);
  });

  it('recreates the tree when docsFolderId names a live document, not a folder', async () => {
    const team = await seedTeam('Nhóm A', [generateId(), generateId(), generateId()]);
    const doc = await createNote({ title: 'Doc', body: '', type: 'document' }, db);
    await db.aiTeams.update(team.id, { docsFolderId: doc.id });

    const result = await ensureTeamDocsReady(team.id, db);

    expect(result.team.docsFolderId).not.toBe(doc.id);
    expect(await folderRows()).toHaveLength(5);
  });

  it('writes docsFolderId onto every member row and tolerates a missing agent row', async () => {
    const employee = await createEmployee(
      { name: 'Bình', role: 'Dev', capability: 'c', persona: 'p', model: 'm' },
      db
    );
    const danglingAgentId = generateId();
    const team = await seedTeam('Nhóm A', [employee.id, danglingAgentId]);

    const result = await ensureTeamDocsReady(team.id, db);

    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.docsFolderId).toBe(result.memberFolderIds.get(row.agentId));
      expect(row.docsFolderId).toBeDefined();
    }

    const titles = await Promise.all(
      [...result.memberFolderIds.values()].map(async (id) => (await db.notes.get(id))?.title)
    );
    expect(titles).toContain('Bình');
    expect(titles).toContain(danglingAgentId);
  });

  // CR-02: attachments die with their note, or the app's own next export fails validateBackup.
  it('deletes the tree attachments along with the notes (CR-02)', async () => {
    const tree = await createTeamDocsTree('Nhóm A', [{ agentId: generateId(), name: 'An' }], db);
    const memberFolderId = [...tree.memberFolderIds.values()][0] as string;
    const doc = await createNote(
      { title: 'Có ảnh', body: 'x', type: 'document', parentId: memberFolderId },
      db
    );
    await createNote({ title: 'Không ảnh', body: 'y', type: 'document', parentId: memberFolderId }, db);
    await db.noteAttachments.add({
      id: generateId(),
      noteId: doc.id,
      fileName: 'anh.png',
      mimeType: 'image/png',
      sizeBytes: 10,
      createdAt: NOW,
      data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    });

    await deleteTeamDocsTree(tree.folderId, db);

    expect(await db.noteAttachments.count()).toBe(0);
    expect(await db.notes.count()).toBe(1); // only the shared root survives
  });

  // CR-03: the owner can create subfolders inside a member folder, so the tree is not bounded
  // to three levels. A fixed-depth delete left deeper notes with a dangling parentId.
  it('deletes descendants below a subfolder created inside a member folder (CR-03)', async () => {
    const tree = await createTeamDocsTree('Nhóm A', [{ agentId: generateId(), name: 'An' }], db);
    const memberFolderId = [...tree.memberFolderIds.values()][0] as string;
    const sub = await createNote(
      { title: 'Thư mục con', body: '', type: 'folder', parentId: memberFolderId },
      db
    );
    const deepDoc = await createNote(
      { title: 'Sâu', body: 'z', type: 'document', parentId: sub.id },
      db
    );

    await deleteTeamDocsTree(tree.folderId, db);

    expect(await db.notes.get(sub.id)).toBeUndefined();
    expect(await db.notes.get(deepDoc.id)).toBeUndefined();
    expect(await db.notes.count()).toBe(1); // only the shared root survives
  });

  // WR-01: a hand-deleted member folder is repaired on the next run, not handed out dead.
  it('re-mints a dead member folder while keeping the live team folder (WR-01)', async () => {
    const agentIds = [generateId(), generateId()];
    const team = await seedTeam('Nhóm A', agentIds);
    const first = await ensureTeamDocsReady(team.id, db);
    const deadAgentId = agentIds[0] as string;
    const deadFolderId = first.memberFolderIds.get(deadAgentId) as string;

    // The owner deleted one member folder by hand; the team folder survives.
    await db.notes.delete(deadFolderId);

    const second = await ensureTeamDocsReady(team.id, db);

    expect(second.team.docsFolderId).toBe(first.team.docsFolderId);
    const repaired = second.memberFolderIds.get(deadAgentId);
    expect(repaired).toBeDefined();
    expect(repaired).not.toBe(deadFolderId);
    expect(await isLiveFolder(repaired, db)).toBe(true);
    // The other member's folder is untouched.
    expect(second.memberFolderIds.get(agentIds[1] as string)).toBe(
      first.memberFolderIds.get(agentIds[1] as string)
    );
    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    const deadRow = rows.find((row) => row.agentId === deadAgentId);
    expect(deadRow?.docsFolderId).toBe(repaired);
  });

  // WR-01: a member row with no docsFolderId at all is repaired, never stuck at
  // TEAM_DOCS_NOT_READY forever.
  it('mints a folder for a member row that has no docsFolderId (WR-01)', async () => {
    const agentIds = [generateId(), generateId()];
    const team = await seedTeam('Nhóm A', agentIds);
    const first = await ensureTeamDocsReady(team.id, db);
    const targetAgentId = agentIds[0] as string;

    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    const targetRow = rows.find((row) => row.agentId === targetAgentId)!;
    await db.aiTeamMembers.update(targetRow.id, { docsFolderId: undefined });

    const second = await ensureTeamDocsReady(team.id, db);

    const minted = second.memberFolderIds.get(targetAgentId);
    expect(minted).toBeDefined();
    expect(await isLiveFolder(minted, db)).toBe(true);
    expect(await folderRows()).toHaveLength(5);
    expect(second.team.docsFolderId).toBe(first.team.docsFolderId);
  });

  // WR-09: a corrupted backup can point a team at the shared root; deleting it must not take
  // every other team's tree with it.
  it('refuses to delete the shared AI Teams root (WR-09)', async () => {
    const tree = await createTeamDocsTree('Nhóm A', [{ agentId: generateId(), name: 'An' }], db);
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    const before = await db.notes.count();

    await deleteTeamDocsTree(rootId, db);

    expect(await db.notes.count()).toBe(before);
    expect(await db.notes.get(rootId)).toBeDefined();
    expect(await db.notes.get(tree.folderId)).toBeDefined();
  });
});
