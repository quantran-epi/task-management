// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  AI_TEAMS_DOCS_ROOT_SETTING_KEY,
  AI_TEAMS_DOCS_ROOT_SLUG,
  AI_TEAMS_DOCS_ROOT_TITLE,
  createMemberFolder,
  createTeamDocsTree,
  deleteTeamDocsTree,
  describeTeamDocsTree,
  ensureDocsRoot,
  ensureTeamDocsReady,
  isLiveFolder,
  memberFolderSlug,
  teamFolderSlug,
} from '../../src/db/repositories/teamDocsRepo';
import { createEmployee, createLead } from '../../src/db/repositories/aiOfficeRepo';
import { createNote, deleteNote, updateNote } from '../../src/db/repositories/noteRepo';
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
    return (await db.notes.toArray()).filter((note) => note.type === 'folder' && !note.deletedAt);
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

  async function seedTeamWithLead(
    name: string,
    leadId: string,
    employeeIds: string[]
  ): Promise<AiTeam> {
    const team: AiTeam = {
      id: generateId(),
      name,
      leadId,
      budgetTokens: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.aiTeams.add(team);
    await db.aiTeamMembers.bulkAdd([
      {
        id: generateId(),
        teamId: team.id,
        agentId: leadId,
        role: 'lead' as const,
        budgetTokens: 0,
        usedTokens: 0,
      },
      ...employeeIds.map<AiTeamMember>((agentId) => ({
        id: generateId(),
        teamId: team.id,
        agentId,
        role: 'employee' as const,
        budgetTokens: 0,
        usedTokens: 0,
      })),
    ]);
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
    const tree = await createTeamDocsTree(generateId(), 'Nhóm A',
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
    const tree = await createTeamDocsTree(generateId(), 'Nhóm A', [{ agentId: generateId(), name: 'An' }], db);

    const second = await createMemberFolder(tree.folderId, 'An', db);
    const third = await createMemberFolder(tree.folderId, 'An', db);

    expect((await db.notes.get(second))?.title).toBe('An (2)');
    expect((await db.notes.get(third))?.title).toBe('An (3)');
  });

  it('deletes the team folder, member folders and their documents, keeping the root and setting', async () => {
    const team = await seedTeam('Nhóm A', [generateId(), generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const tree = { folderId: ready.team.docsFolderId as string, memberFolderIds: ready.memberFolderIds };
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    const memberFolderId = tree.memberFolderIds.get([...tree.memberFolderIds.keys()][0] as string)!;

    await createNote({ title: 'Trong thư mục thành viên', body: 'x', type: 'document', parentId: memberFolderId }, db);
    await createNote({ title: 'Trong thư mục nhóm', body: 'y', type: 'document', parentId: tree.folderId }, db);

    await deleteTeamDocsTree(tree.folderId, team.id, db);

    const remaining = await db.notes.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(rootId);
    expect(remaining[0]?.title).toBe(AI_TEAMS_DOCS_ROOT_TITLE);

    const setting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
    expect(setting?.value).toBe(rootId);
  });

  it('is a no-op when the team folder id is undefined', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const before = await db.notes.toArray();

    await deleteTeamDocsTree(undefined, team.id, db);

    expect(await db.notes.toArray()).toHaveLength(before.length);
    expect(await db.notes.get(ready.team.docsFolderId as string)).toBeDefined();
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
    await deleteTeamDocsTree(first.team.docsFolderId, team.id, db);

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
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const tree = { folderId: ready.team.docsFolderId as string, memberFolderIds: ready.memberFolderIds };
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

    await deleteTeamDocsTree(tree.folderId, team.id, db);

    expect(await db.noteAttachments.count()).toBe(0);
    expect(await db.notes.count()).toBe(1); // only the shared root survives
  });

  // CR-03: the owner can create subfolders inside a member folder, so the tree is not bounded
  // to three levels. A fixed-depth delete left deeper notes with a dangling parentId.
  it('deletes descendants below a subfolder created inside a member folder (CR-03)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const tree = { folderId: ready.team.docsFolderId as string, memberFolderIds: ready.memberFolderIds };
    const memberFolderId = [...tree.memberFolderIds.values()][0] as string;
    const sub = await createNote(
      { title: 'Thư mục con', body: '', type: 'folder', parentId: memberFolderId },
      db
    );
    const deepDoc = await createNote(
      { title: 'Sâu', body: 'z', type: 'document', parentId: sub.id },
      db
    );

    await deleteTeamDocsTree(tree.folderId, team.id, db);

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
    // CR-07: the repair adopts the folder this agent already owns (matched by slug), so no
    // duplicate is minted — 1 root + 1 team folder + 2 member folders.
    expect(await folderRows()).toHaveLength(4);
    expect(minted).toBe(first.memberFolderIds.get(targetAgentId));
    expect(second.team.docsFolderId).toBe(first.team.docsFolderId);
  });

  // WR-09: a corrupted backup can point a team at the shared root; deleting it must not take
  // every other team's tree with it. CR-05: a live folder that cannot be proven is a refusal.
  it('refuses to delete the shared AI Teams root (WR-09)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const teamFolderId = ready.team.docsFolderId as string;
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    const before = await db.notes.count();

    await expect(deleteTeamDocsTree(rootId, team.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.count()).toBe(before);
    expect(await db.notes.get(rootId)).toBeDefined();
    expect(await db.notes.get(teamFolderId)).toBeDefined();
  });

  // CR-01: `docsFolderId` is an untrusted handle — a user document is not a team folder.
  it('refuses to delete when docsFolderId names a user document (CR-01)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    await ensureTeamDocsReady(team.id, db);
    const userDoc = await createNote({ title: 'Tài liệu người dùng', body: 'x', type: 'document' }, db);
    const before = await db.notes.count();

    await expect(deleteTeamDocsTree(userDoc.id, team.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.count()).toBe(before);
    expect(await db.notes.get(userDoc.id)).toBeDefined();
  });

  // CR-01: every team folder is a child of the same root, so the shape check alone cannot tell
  // THIS team's folder from another's. A corrupted `docsFolderId` duplicating another team's id
  // must not delete that team's tree.
  it('refuses to delete a folder another team claims (CR-01)', async () => {
    const mine = await seedTeam('Nhóm A', [generateId()]);
    const other = await seedTeam('Nhóm B', [generateId()]);
    const mineReady = await ensureTeamDocsReady(mine.id, db);
    const otherReady = await ensureTeamDocsReady(other.id, db);
    // Corruption: team A's docsFolderId now names team B's folder.
    await db.aiTeams.update(mine.id, { docsFolderId: otherReady.team.docsFolderId });
    const before = await db.notes.count();
    const otherFolderId = otherReady.team.docsFolderId as string;
    const mineFolderId = mineReady.team.docsFolderId as string;

    await expect(deleteTeamDocsTree(otherFolderId, mine.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.count()).toBe(before);
    expect(await db.notes.get(otherFolderId)).toBeDefined();
    expect(await db.notes.get(mineFolderId)).toBeDefined();
  });

  // CR-03: a member row pointing at the team root would write next to the leader's final.
  it('re-mints a member folder that is not a child of the team folder (CR-03)', async () => {
    const agentIds = [generateId(), generateId()];
    const team = await seedTeam('Nhóm A', agentIds);
    const first = await ensureTeamDocsReady(team.id, db);
    const targetAgentId = agentIds[0] as string;

    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    const targetRow = rows.find((row) => row.agentId === targetAgentId)!;
    // Corrupted backup / owner folder-move: the member now points at the team root.
    await db.aiTeamMembers.update(targetRow.id, { docsFolderId: first.team.docsFolderId });

    const second = await ensureTeamDocsReady(team.id, db);

    const repaired = second.memberFolderIds.get(targetAgentId);
    expect(repaired).not.toBe(first.team.docsFolderId);
    expect((await db.notes.get(repaired!))?.parentId).toBe(first.team.docsFolderId);
    expect((await db.notes.get(repaired!))?.type).toBe('folder');
  });

  // CR-04: document sets and document-scoped threads reference notes; the tree delete must
  // detach them or the app's own next export fails validateBackup.
  it('detaches document-set entries and document-scoped threads (CR-04)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const tree = { folderId: ready.team.docsFolderId as string, memberFolderIds: ready.memberFolderIds };
    const memberFolderId = [...tree.memberFolderIds.values()][0] as string;
    const doc = await createNote(
      { title: 'Có tham chiếu', body: 'x', type: 'document', parentId: memberFolderId },
      db
    );
    const keep = await createNote({ title: 'Giữ lại', body: 'y', type: 'document' }, db);
    const setId = generateId();
    await db.documentSets.add({
      id: setId,
      name: 'Bộ tài liệu',
      documentIds: [doc.id, keep.id],
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    const threadId = generateId();
    await db.chatThreads.add({
      id: threadId,
      scopeKey: `document:${doc.id}`,
      scopeType: 'document',
      entityId: doc.id,
      title: 'Hỏi về tài liệu',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    await deleteTeamDocsTree(tree.folderId, team.id, db);

    // The set survives with the dead id dropped; the live id stays.
    const set = await db.documentSets.get(setId);
    expect(set?.documentIds).toEqual([keep.id]);
    expect(await db.chatThreads.get(threadId)).toBeUndefined();
  });

  // WR-01: the lead lives in `aiLeads`, so a rebuilt tree must not name its folder after a UUID.
  it('names the lead folder from aiLeads when the tree is rebuilt (WR-01)', async () => {
    const lead = await createLead(
      { name: 'Trưởng Nhóm', role: 'Lead', capability: 'c', persona: 'p', model: 'm' },
      db
    );
    const team = await seedTeamWithLead('Nhóm A', lead.id, [generateId()]);
    const first = await ensureTeamDocsReady(team.id, db);

    // Rebuild: the owner deleted the whole tree.
    await deleteTeamDocsTree(first.team.docsFolderId, team.id, db);
    const second = await ensureTeamDocsReady(team.id, db);

    const leadFolderId = second.memberFolderIds.get(lead.id);
    expect((await db.notes.get(leadFolderId!))?.title).toBe('Trưởng Nhóm');
  });

  // CR-05: the backfill must not trust a handle naming the shared root or another team's folder.
  it('rebuilds when docsFolderId names the shared root (CR-05)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const first = await ensureTeamDocsReady(team.id, db);
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    await db.aiTeams.update(team.id, { docsFolderId: rootId });

    const second = await ensureTeamDocsReady(team.id, db);

    expect(second.team.docsFolderId).not.toBe(rootId);
    const teamFolder = await db.notes.get(second.team.docsFolderId as string);
    expect(teamFolder?.parentId).toBe(rootId);
    expect(teamFolder?.title).toBe('Nhóm A');
    // The root was not turned into a team zone: no member folder sits directly under it.
    const rootChildren = await db.notes.where('parentId').equals(rootId as string).toArray();
    expect(rootChildren.filter((n) => n.type === 'folder')).toHaveLength(2); // old tree + new
    expect(first.team.docsFolderId).not.toBe(second.team.docsFolderId);
  });

  it('rebuilds when docsFolderId names another team folder (CR-05)', async () => {
    const mine = await seedTeam('Nhóm A', [generateId()]);
    const other = await seedTeam('Nhóm B', [generateId()]);
    const otherReady = await ensureTeamDocsReady(other.id, db);
    await db.aiTeams.update(mine.id, { docsFolderId: otherReady.team.docsFolderId });

    const second = await ensureTeamDocsReady(mine.id, db);

    expect(second.team.docsFolderId).not.toBe(otherReady.team.docsFolderId);
    // The other team's tree was not polluted with a member folder from this team.
    const otherChildren = await db.notes
      .where('parentId')
      .equals(otherReady.team.docsFolderId as string)
      .toArray();
    expect(otherChildren).toHaveLength(1);
  });

  // CR-06: the `AI Teams` root is an ordinary folder the owner can delete. A parent-shape rule
  // would then silently delete nothing and leak the whole tree.
  it('still deletes the tree after the shared root was replaced (CR-06)', async () => {
    const team = await seedTeam('Nhóm A', [generateId(), generateId()]);
    const first = await ensureTeamDocsReady(team.id, db);
    const oldRootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;

    // Owner deletes the AI Teams root in Docs, then a new root is minted.
    await db.notes.delete(oldRootId as string);
    const newRootId = await ensureDocsRoot(db);
    expect(newRootId).not.toBe(oldRootId);

    await deleteTeamDocsTree(first.team.docsFolderId, team.id, db);

    expect(await db.notes.get(first.team.docsFolderId as string)).toBeUndefined();
    expect(await db.notes.get(newRootId)).toBeDefined();
  });

  // CR-07: two agents with the same display name must not share a zone.
  it('gives two members with the same name separate folders (CR-07)', async () => {
    const agentA = generateId();
    const agentB = generateId();
    const team = await seedTeam('Nhóm A', [agentA, agentB]);
    // Both agent rows resolve to the same display name.
    const name = 'An';
    await db.aiEmployees.bulkAdd([
      { id: agentA, name, role: 'Dev', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
      { id: agentB, name, role: 'Dev', capability: 'c', persona: 'p', model: 'm', createdAt: NOW, updatedAt: NOW },
    ] as never);

    const ready = await ensureTeamDocsReady(team.id, db);

    expect(ready.memberFolderIds.get(agentA)).not.toBe(ready.memberFolderIds.get(agentB));
  });

  // CR-08: deleting a member folder from Docs must not leave the app's own export invalid.
  it('clears a dangling member docsFolderId when the folder is deleted (CR-08)', async () => {
    const agentIds = [generateId()];
    const team = await seedTeam('Nhóm A', agentIds);
    const ready = await ensureTeamDocsReady(team.id, db);
    const memberFolderId = ready.memberFolderIds.get(agentIds[0] as string) as string;

    await deleteNote(memberFolderId, db);

    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    expect(rows[0]?.docsFolderId).toBeUndefined();
  });

  it('clears a dangling team docsFolderId when the team folder is deleted (CR-08)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);

    await deleteNote(ready.team.docsFolderId as string, db);

    expect((await db.aiTeams.get(team.id))?.docsFolderId).toBeUndefined();
  });

  // CR-01: a user folder the owner created in Docs is claimed by no team, so the old
  // "no rival claim" proof accepted it and `deleteTeam` destroyed the user's data.
  it('refuses to delete a user folder the owner created (CR-01)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    await ensureTeamDocsReady(team.id, db);
    const userFolder = await createNote({ title: 'Thư mục riêng', body: '', type: 'folder' }, db);
    const secret = await createNote(
      { title: 'Bí mật', body: 'x', type: 'document', parentId: userFolder.id },
      db
    );
    await db.aiTeams.update(team.id, { docsFolderId: userFolder.id });

    await expect(deleteTeamDocsTree(userFolder.id, team.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.get(userFolder.id)).toBeDefined();
    expect(await db.notes.get(secret.id)).toBeDefined();
  });

  // CR-02: a restored backup can carry two member rows naming one folder; accepting both let
  // one member overwrite the other's documents.
  it('gives two member rows sharing one folder id distinct folders (CR-02)', async () => {
    const agentIds = [generateId(), generateId()];
    const team = await seedTeam('Nhóm A', agentIds);
    const first = await ensureTeamDocsReady(team.id, db);
    const sharedFolderId = first.memberFolderIds.get(agentIds[0] as string) as string;

    // Corruption: both rows now name the same folder.
    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    for (const row of rows) {
      await db.aiTeamMembers.update(row.id, { docsFolderId: sharedFolderId });
    }

    const second = await ensureTeamDocsReady(team.id, db);

    const a = second.memberFolderIds.get(agentIds[0] as string);
    const b = second.memberFolderIds.get(agentIds[1] as string);
    expect(a).not.toBe(b);
    expect(await isLiveFolder(a, db)).toBe(true);
    expect(await isLiveFolder(b, db)).toBe(true);
  });

  // WR-04/CR-04: the owner can drag a member folder elsewhere in Docs. The backfill must NOT
  // move rows to recover it — moving is what closed a parent cycle. It mints a fresh zone under
  // the team folder and leaves the drifted folder (and its documents) where the owner put it.
  it('mints a fresh zone instead of re-parenting a moved member folder (WR-04, CR-04)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const first = await ensureTeamDocsReady(team.id, db);
    const memberFolderId = first.memberFolderIds.get(agentId) as string;
    const doc = await createNote(
      { title: 'Đã viết', body: 'x', type: 'document', parentId: memberFolderId },
      db
    );
    // Owner drags it to the top level.
    await db.notes.update(memberFolderId, { parentId: undefined });

    const second = await ensureTeamDocsReady(team.id, db);

    const fresh = second.memberFolderIds.get(agentId);
    expect(fresh).not.toBe(memberFolderId);
    expect((await db.notes.get(fresh as string))?.parentId).toBe(
      second.team.docsFolderId as string
    );
    // The drifted folder is untouched, and no parent cycle was created.
    expect((await db.notes.get(memberFolderId))?.parentId).toBeUndefined();
    expect((await db.notes.get(doc.id))?.parentId).toBe(memberFolderId);
  });

  // CR-01/WR-01: the team folder carries an identity marker, so ownership never depends on a
  // global scan or on a root that can be replaced.
  it('stamps the team folder with its identity slug (CR-01)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);

    const teamFolder = await db.notes.get(ready.team.docsFolderId as string);
    expect(teamFolder?.slug).toBe(teamFolderSlug(team.id));
  });

  // CR-01 (round 5): a member folder dragged under the shared root satisfies the old parent
  // fallback, so deleteTeam destroyed it and its documents.
  it('refuses to delete a member folder dragged under the root (CR-01)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const memberFolderId = ready.memberFolderIds.get(agentId) as string;
    const doc = await createNote(
      { title: 'Bản nháp', body: 'x', type: 'document', parentId: memberFolderId },
      db
    );
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    await db.notes.update(memberFolderId, { parentId: rootId });

    await expect(deleteTeamDocsTree(memberFolderId, team.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.get(memberFolderId)).toBeDefined();
    expect(await db.notes.get(doc.id)).toBeDefined();
  });

  // CR-01 (round 5): a user folder filed under the root satisfied the same fallback.
  it('refuses to delete a user folder filed under the root (CR-01)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    await ensureTeamDocsReady(team.id, db);
    const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))?.value as string;
    const userFolder = await createNote(
      { title: 'Ghi chú riêng', body: '', type: 'folder', parentId: rootId },
      db
    );

    await expect(deleteTeamDocsTree(userFolder.id, team.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.get(userFolder.id)).toBeDefined();
  });

  // CR-03 (round 5): a stale duplicate slug folder outside the team tree must not win over the
  // live one inside it, and must not be re-parented.
  it('prefers the in-tree folder when a duplicate slug exists (CR-03)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const first = await ensureTeamDocsReady(team.id, db);
    const inTreeFolderId = first.memberFolderIds.get(agentId) as string;
    // A stale duplicate elsewhere (a rebuild that was interrupted before cleanup).
    const stale = await createNote(
      {
        title: 'Cũ',
        body: '',
        type: 'folder',
        slug: memberFolderSlug(team.id, agentId),
      },
      db,
      { allowReservedSlug: true }
    );

    const second = await ensureTeamDocsReady(team.id, db);

    expect(second.memberFolderIds.get(agentId)).toBe(inTreeFolderId);
    // No row was moved: the stale folder is untouched.
    expect((await db.notes.get(stale.id))?.parentId).toBeUndefined();
  });

  // CR-04 (round 5): the backfill must never close a parent cycle.
  it('never creates a parent cycle when folders were moved (CR-04)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const first = await ensureTeamDocsReady(team.id, db);
    const teamFolderId = first.team.docsFolderId as string;
    const memberFolderId = first.memberFolderIds.get(agentId) as string;

    // Owner moves the member folder to the top level, then puts the team folder inside it.
    await db.notes.update(memberFolderId, { parentId: undefined });
    await db.notes.update(teamFolderId, { parentId: memberFolderId });

    await ensureTeamDocsReady(team.id, db);

    // Walk up from the team folder; it must terminate without revisiting a row.
    const seen = new Set<string>();
    let cursor: string | undefined = teamFolderId;
    while (cursor !== undefined) {
      expect(seen.has(cursor)).toBe(false);
      seen.add(cursor);
      cursor = (await db.notes.get(cursor))?.parentId;
    }
  });

  // CR-01 (round 6): a row naming another agent's live child folder used to be accepted on parent
  // shape alone, so the first row processed stole the second agent's zone and its documents.
  it('never adopts another agent zone, even when a row names it (CR-01)', async () => {
    const [a, b] = [generateId(), generateId()];
    const team = await seedTeam('Nhóm A', [a, b]);
    const first = await ensureTeamDocsReady(team.id, db);
    const aFolder = first.memberFolderIds.get(a) as string;
    const doc = await createNote(
      { title: 'Của A', body: 'x', type: 'document', parentId: aFolder },
      db
    );
    // Corruption: B's row now names A's folder.
    const bRow = (await db.aiTeamMembers.where('teamId').equals(team.id).toArray()).find(
      (row) => row.agentId === b
    );
    await db.aiTeamMembers.update(bRow?.id as string, { docsFolderId: aFolder });

    const second = await ensureTeamDocsReady(team.id, db);

    expect(second.memberFolderIds.get(a)).toBe(aFolder);
    expect(second.memberFolderIds.get(b)).not.toBe(aFolder);
    // A's documents stayed in A's zone.
    expect((await db.notes.get(doc.id))?.parentId).toBe(aFolder);
    expect((await db.notes.get(second.memberFolderIds.get(b) as string))?.slug).toBe(
      memberFolderSlug(team.id, b)
    );
  });

  // CR-02 (round 7): the round-6 answer was to corroborate a slugless folder from app-owned rows.
  // That was an ADOPTION primitive — a payload pointing both the team handle and one member
  // handle at a user folder got a real slug stamped onto the user's folder, after which
  // `deleteTeam` destroyed it. Adoption is gone: a slugless handle is absent, and a live folder
  // that cannot be proven is a REFUSAL, never a silent skip.
  it('refuses to delete a tree whose team folder slug was cleared (CR-02)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const teamFolderId = ready.team.docsFolderId as string;
    const memberFolderId = ready.memberFolderIds.get(agentId) as string;
    const doc = await createNote(
      { title: 'Tài liệu', body: 'x', type: 'document', parentId: memberFolderId },
      db
    );
    await db.notes.update(teamFolderId, { slug: undefined });

    await expect(deleteTeamDocsTree(teamFolderId, team.id, db)).rejects.toThrow(/không xác định/i);

    // Nothing was destroyed — the owner is told, and a stale handle cannot take data with it.
    expect(await db.notes.get(teamFolderId)).toBeDefined();
    expect(await db.notes.get(memberFolderId)).toBeDefined();
    expect(await db.notes.get(doc.id)).toBeDefined();
  });

  // CR-02: a slugless user folder is refused the same way — no app-owned row can make it a
  // team's folder.
  it('refuses a slugless user folder no app-owned row names (CR-02)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    await ensureTeamDocsReady(team.id, db);
    const userFolder = await createNote(
      { title: 'Thư mục riêng', body: '', type: 'folder' },
      db
    );
    const secret = await createNote(
      { title: 'Bí mật', body: 'x', type: 'document', parentId: userFolder.id },
      db
    );

    await expect(deleteTeamDocsTree(userFolder.id, team.id, db)).rejects.toThrow(/không xác định/i);

    expect(await db.notes.get(userFolder.id)).toBeDefined();
    expect(await db.notes.get(secret.id)).toBeDefined();
  });

  // CR-02/CR-04: `updateNote` cannot clear a reserved slug, so the state above is unreachable
  // through the generic note path the lead's `update_note` tool uses.
  it('refuses to clear or overwrite a reserved slug, or flip its type (CR-04)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const first = await ensureTeamDocsReady(team.id, db);
    const teamFolderId = first.team.docsFolderId as string;

    await expect(updateNote(teamFolderId, { slug: '' }, db)).rejects.toThrow(/slug hoặc loại/i);
    await expect(updateNote(teamFolderId, { slug: 'khac' }, db)).rejects.toThrow(/slug hoặc loại/i);
    await expect(updateNote(teamFolderId, { type: 'document' }, db)).rejects.toThrow(
      /slug hoặc loại/i
    );

    // The tree is still resolvable, so a later turn and a later delete both work.
    const second = await ensureTeamDocsReady(team.id, db);
    expect(second.team.docsFolderId).toBe(teamFolderId);
  });

  // WR (round 6): the `ai-` namespace is the ownership proof, so `updateNote` must refuse to let
  // a user-supplied slug claim it — otherwise any folder could pass itself off as a team's.
  it('refuses a user-supplied ai- slug (WR)', async () => {
    const team = await seedTeam('Nhóm A', [generateId()]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const userFolder = await createNote({ title: 'Riêng', body: '', type: 'folder' }, db);

    await expect(
      updateNote(userFolder.id, { slug: teamFolderSlug(team.id) }, db)
    ).rejects.toThrow(/dành riêng/i);

    // The real team folder is still the only holder, so delete still resolves.
    expect((await db.notes.get(userFolder.id))?.slug).toBeUndefined();
    expect(ready.team.docsFolderId).toBeDefined();
  });

  // WR-03 (round 7): the root setting is restored verbatim, so a payload pointing it at a user
  // folder made every team tree a child of that folder. The root's own slug is what makes the
  // setting a hint rather than an authority.
  it('recreates the root when the setting names a folder without the root slug (WR-03)', async () => {
    const userFolder = await createNote(
      { title: 'Thư mục người dùng', body: '', type: 'folder' },
      db
    );
    await db.settings.put({ key: AI_TEAMS_DOCS_ROOT_SETTING_KEY, value: userFolder.id });

    const rootId = await ensureDocsRoot(db);

    expect(rootId).not.toBe(userFolder.id);
    expect((await db.notes.get(rootId))?.slug).toBe(AI_TEAMS_DOCS_ROOT_SLUG);
    expect((await db.notes.get(userFolder.id))?.slug).toBeUndefined();
  });

  // CR-02 (round 8): a tree the owner moved to Trash is still this team's tree — `deletedAt` is
  // not part of identity. Round 7 returned silently here, leaving the whole tree unreachable.
  it('deletes a trashed team tree instead of leaking it (CR-02)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const teamFolderId = ready.team.docsFolderId as string;
    const memberFolderId = ready.memberFolderIds.get(agentId) as string;
    const doc = await createNote(
      { title: 'Tài liệu', body: 'x', type: 'document', parentId: memberFolderId },
      db
    );
    // The owner trashed the team folder by hand.
    await db.notes.update(teamFolderId, { deletedAt: NOW });

    await deleteTeamDocsTree(teamFolderId, team.id, db);

    expect(await db.notes.get(teamFolderId)).toBeUndefined();
    expect(await db.notes.get(memberFolderId)).toBeUndefined();
    expect(await db.notes.get(doc.id)).toBeUndefined();
    // The handles were cleared, so the app's own export stays valid.
    expect((await db.aiTeams.get(team.id))?.docsFolderId).toBeUndefined();
  });

  // CR-05 (round 9): the owner can file their own folder under a team folder, and D-10 says the
  // team delete takes the whole tree. The guarantee is not "we can tell whose folder it is" —
  // it is that the confirmation NAMES the tree before the click, so the owner sees it coming.
  it('deletes a user folder filed inside the team tree, and the confirmation names it (CR-05)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const ready = await ensureTeamDocsReady(team.id, db);
    const memberFolderId = ready.memberFolderIds.get(agentId) as string;
    const userFolder = await createNote(
      { title: 'Ghi chú riêng', body: '', type: 'folder', parentId: memberFolderId },
      db
    );
    const secret = await createNote(
      { title: 'Bí mật', body: 'x', type: 'document', parentId: userFolder.id },
      db
    );

    const summary = await describeTeamDocsTree(ready.team.docsFolderId as string, db);
    await deleteTeamDocsTree(ready.team.docsFolderId as string, team.id, db);

    // The confirmation counted the tree BEFORE the delete, so the owner saw what would go.
    expect(summary).toEqual({ folderCount: 3, documentCount: 1 });
    // D-10: the whole tree goes, including the folder the owner filed inside it.
    expect(await db.notes.get(userFolder.id)).toBeUndefined();
    expect(await db.notes.get(secret.id)).toBeUndefined();
    expect(await db.notes.get(memberFolderId)).toBeUndefined();
    expect(await db.notes.count()).toBe(1); // only the shared root survives
  });

  // CR-03 (round 8): `write_doc` re-resolves the caller's zone, so the backfill must never hand
  // out a folder that resolver rejects — the agent would be told to write somewhere it always
  // refuses.
  it('re-mints a soft-deleted member folder instead of handing it back (CR-03)', async () => {
    const agentId = generateId();
    const team = await seedTeam('Nhóm A', [agentId]);
    const first = await ensureTeamDocsReady(team.id, db);
    const trashedFolderId = first.memberFolderIds.get(agentId) as string;
    await db.notes.update(trashedFolderId, { deletedAt: NOW });

    const second = await ensureTeamDocsReady(team.id, db);

    const fresh = second.memberFolderIds.get(agentId);
    expect(fresh).not.toBe(trashedFolderId);
    expect((await db.notes.get(fresh as string))?.deletedAt).toBeUndefined();
    expect((await db.notes.get(fresh as string))?.slug).toBe(memberFolderSlug(team.id, agentId));
  });
});
