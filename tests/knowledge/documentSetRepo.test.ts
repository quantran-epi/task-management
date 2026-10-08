// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createDocumentSet,
  createDocumentSetFromFolder,
  updateDocumentSet,
  deleteDocumentSet,
  listDocumentSets,
  getDocumentPublishStatuses,
  computeSha256,
  normalizeMarkdownForHash,
} from '../../src/db/repositories/documentSetRepo';
import { generateId } from '../../src/utils/uuid';
import type { Note } from '../../src/types/models';

describe('DocumentSet Repository (D-01, D-02, D-27, D-28, T-16-04)', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = 'TestDocSetRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  it('creates empty set and manual set preserving explicit ordered UUID membership', async () => {
    // 1. Empty set
    const emptySet = await createDocumentSet(
      {
        name: 'Empty Set',
        description: 'No initial documents',
      },
      db
    );

    expect(emptySet.id).toBeDefined();
    expect(emptySet.name).toBe('Empty Set');
    expect(emptySet.description).toBe('No initial documents');
    expect(emptySet.documentIds).toEqual([]);
    expect(emptySet.createdAt).toBeDefined();
    expect(emptySet.updatedAt).toBeDefined();

    // 2. Manual set with ordered UUIDs
    const docId1 = generateId();
    const docId2 = generateId();
    const docId3 = generateId();
    const ordered = [docId3, docId1, docId2];

    const manualSet = await createDocumentSet(
      {
        name: 'Ordered Manual Set',
        documentIds: ordered,
      },
      db
    );

    expect(manualSet.name).toBe('Ordered Manual Set');
    expect(manualSet.documentIds).toEqual(ordered); // Preserves exact order

    const fetched = await db.documentSets.get(manualSet.id);
    expect(fetched?.documentIds).toEqual(ordered);
  });

  it('rejects invalid names and duplicate UUIDs during set creation', async () => {
    const docId = generateId();

    await expect(
      createDocumentSet({ name: '   ', documentIds: [docId] }, db)
    ).rejects.toThrow();

    await expect(
      createDocumentSet({ name: 'A'.repeat(121), documentIds: [docId] }, db)
    ).rejects.toThrow();

    await expect(
      createDocumentSet({ name: 'Duplicates', documentIds: [docId, docId] }, db)
    ).rejects.toThrow();

    await expect(
      createDocumentSet({ name: 'Bad ID', documentIds: ['not-a-uuid'] }, db)
    ).rejects.toThrow();
  });

  it('creates set from folder snapshot, excluding subfolders and deleted notes, preserving order', async () => {
    const folderId = generateId();
    const now = new Date().toISOString();

    const note1: Note = {
      id: generateId(),
      type: 'document',
      parentId: folderId,
      title: 'Tài liệu thường',
      body: '# Content 1',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const notePinned: Note = {
      id: generateId(),
      type: 'document',
      parentId: folderId,
      title: 'Tài liệu ghim',
      body: '# Content Pinned',
      isPinned: true, // Pinned comes first
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    };

    const subFolderNote: Note = {
      id: generateId(),
      type: 'folder', // Folder should be excluded
      parentId: folderId,
      title: 'Thư mục con',
      body: '',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };

    const deletedNote: Note = {
      id: generateId(),
      type: 'document',
      parentId: folderId,
      title: 'Tài liệu đã xóa',
      body: '# Deleted',
      isPinned: false,
      deletedAt: now, // Soft-deleted should be excluded
      createdAt: now,
      updatedAt: now,
    };

    await db.notes.bulkAdd([note1, notePinned, subFolderNote, deletedNote]);

    const folderSet = await createDocumentSetFromFolder(
      folderId,
      'Folder Snapshot Set',
      'From SHB Credit Folder',
      db
    );

    // Expect pinned first, then regular note; subfolder and deleted excluded
    expect(folderSet.documentIds).toEqual([notePinned.id, note1.id]);
    expect(folderSet.name).toBe('Folder Snapshot Set');
  });

  it('retains explicit membership when a note is moved after set creation (D-01)', async () => {
    const folderId = generateId();
    const otherFolderId = generateId();

    const noteA: Note = {
      id: generateId(),
      type: 'document',
      parentId: folderId,
      title: 'Tài liệu A',
      body: '# Doc A',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    await db.notes.add(noteA);

    const set = await createDocumentSetFromFolder(
      folderId,
      'Snapshot Set',
      undefined,
      db
    );

    expect(set.documentIds).toEqual([noteA.id]);

    // Move noteA to another folder
    await db.notes.update(noteA.id, { parentId: otherFolderId });

    // Verify set membership is unchanged
    const setAfterMove = await db.documentSets.get(set.id);
    expect(setAfterMove?.documentIds).toEqual([noteA.id]);
  });

  it('updates set name, description, reorders and modifies membership atomically', async () => {
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    const set = await createDocumentSet(
      {
        name: 'Initial Set',
        documentIds: [id1, id2],
      },
      db
    );

    // Atomic update: rename and reorder + add
    const updated = await updateDocumentSet(
      set.id,
      {
        name: 'Renamed Set',
        description: 'New description',
        documentIds: [id3, id2, id1],
      },
      db
    );

    expect(updated?.name).toBe('Renamed Set');
    expect(updated?.description).toBe('New description');
    expect(updated?.documentIds).toEqual([id3, id2, id1]);

    // Bad update rolls back / rejects without modifying set
    await expect(
      updateDocumentSet(
        set.id,
        {
          name: '', // Invalid name
        },
        db
      )
    ).rejects.toThrow();

    const current = await db.documentSets.get(set.id);
    expect(current?.name).toBe('Renamed Set');
  });

  it('membership removal leaves canonical Note record byte-for-byte intact (T-16-04, D-02)', async () => {
    const noteId = generateId();
    const originalBody = '# Quy trình tín dụng SHB\r\n\r\n* Giữ nguyên 100% nội dung.';
    const originalTitle = 'Quy trình gốc';

    const note: Note = {
      id: noteId,
      type: 'document',
      title: originalTitle,
      body: originalBody,
      isPinned: true,
      tags: ['tín-dụng', 'shb'],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    await db.notes.add(note);

    const set = await createDocumentSet(
      {
        name: 'Set with Note',
        documentIds: [noteId],
      },
      db
    );

    // Remove note from set
    await updateDocumentSet(
      set.id,
      {
        documentIds: [],
      },
      db
    );

    // Verify canonical Note in db.notes is completely untouched
    const noteAfterRemoval = await db.notes.get(noteId);
    expect(noteAfterRemoval).toBeDefined();
    expect(noteAfterRemoval?.body).toBe(originalBody);
    expect(noteAfterRemoval?.title).toBe(originalTitle);
    expect(noteAfterRemoval?.tags).toEqual(['tín-dụng', 'shb']);
    expect(noteAfterRemoval?.isPinned).toBe(true);

    // Delete set entirely
    await deleteDocumentSet(set.id, db);

    const noteAfterDeleteSet = await db.notes.get(noteId);
    expect(noteAfterDeleteSet?.body).toBe(originalBody);
  });

  it('derives aggregate publish state following D-27 priority and lists containing sets (D-27, D-28)', async () => {
    const docId = generateId();
    const bodyContent = '# Tài liệu tính toán lãi suất\nCông thức: A = P(1 + rt)';
    const normalizedHash = await computeSha256(normalizeMarkdownForHash(bodyContent));

    const note: Note = {
      id: docId,
      type: 'document',
      title: 'Tài liệu tính lãi',
      body: bodyContent,
      isPinned: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    await db.notes.add(note);

    // 1. Doc not in any set -> 'Never published'
    const status1 = await getDocumentPublishStatuses([docId], db);
    expect(status1[docId]?.aggregateState).toBe('Never published');
    expect(status1[docId]?.containingSets).toEqual([]);

    // 2. Doc added to Set A, published and In sync
    const setA = await createDocumentSet({ name: 'Set A', documentIds: [docId] }, db);
    await db.publishedDocuments.add({
      setId: setA.id,
      documentId: docId,
      lastKnownRemoteAt: '2026-10-08T00:00:00.000Z',
      publishedContentHash: normalizedHash,
      lastPrimaryState: 'In sync',
    });

    const status2 = await getDocumentPublishStatuses([docId], db);
    expect(status2[docId]?.aggregateState).toBe('In sync');
    expect(status2[docId]?.containingSets).toHaveLength(1);
    expect(status2[docId]?.containingSets[0]).toEqual({
      setId: setA.id,
      setName: 'Set A',
      state: 'In sync',
    });

    // 3. Edit local note body -> Derives 'Local changes' without network
    await db.notes.update(docId, {
      body: bodyContent + '\nChỉnh sửa mới thêm.',
      updatedAt: '2026-10-08T01:00:00.000Z',
    });

    const status3 = await getDocumentPublishStatuses([docId], db);
    expect(status3[docId]?.aggregateState).toBe('Local changes');
    expect(status3[docId]?.containingSets[0]?.state).toBe('Local changes');

    // 4. Add doc to Set B where publish attempt Failed -> Priority Failed wins over Local changes
    const setB = await createDocumentSet({ name: 'Set B', documentIds: [docId] }, db);
    await db.publishedDocuments.add({
      setId: setB.id,
      documentId: docId,
      lastKnownRemoteAt: '2026-10-08T02:00:00.000Z',
      publishedContentHash: normalizedHash,
      lastPrimaryState: 'Failed',
    });

    const status4 = await getDocumentPublishStatuses([docId], db);
    expect(status4[docId]?.aggregateState).toBe('Failed'); // Failed > Warning > Publishing > Local changes > In sync > Never published
    expect(status4[docId]?.containingSets).toHaveLength(2);
    expect(status4[docId]?.containingSets).toContainEqual({
      setId: setA.id,
      setName: 'Set A',
      state: 'Local changes',
    });
    expect(status4[docId]?.containingSets).toContainEqual({
      setId: setB.id,
      setName: 'Set B',
      state: 'Failed',
    });
  });

  it('lists document sets ordered by updatedAt descending', async () => {
    const set1 = await createDocumentSet({ name: 'Set 1' }, db);
    const set2 = await createDocumentSet({ name: 'Set 2' }, db);

    const list = await listDocumentSets(db);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((s) => s.id === set1.id)).toBe(true);
    expect(list.some((s) => s.id === set2.id)).toBe(true);
  });
});
