import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../index';
import {
  createNote,
  softDeleteNote,
  restoreNote,
  batchCreateNotes,
  getNotesByFolder,
} from '../noteRepo';

describe('noteRepo - Folder Hierarchy, Restore, and Batch Creation', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('restores a soft-deleted note by removing deletedAt property', async () => {
    const doc = await createNote(
      {
        title: 'Document in trash',
        body: 'Some content',
        type: 'document',
      },
      db
    );

    // Soft delete
    await softDeleteNote(doc.id, db);
    const deleted = await db.notes.get(doc.id);
    expect(deleted?.deletedAt).toBeDefined();

    // Restore
    await restoreNote(doc.id, db);
    const restored = await db.notes.get(doc.id);
    expect(restored).toBeDefined();
    expect(restored?.deletedAt).toBeUndefined();
    expect(restored?.title).toBe('Document in trash');
  });

  it('creates subfolders and documents with parentId hierarchy', async () => {
    // 1. Create root folder
    const rootFolder = await createNote(
      {
        title: 'Root Folder',
        body: '',
        type: 'folder',
      },
      db
    );
    expect(rootFolder.parentId).toBeUndefined();

    // 2. Create subfolder under root folder
    const subFolder = await createNote(
      {
        title: 'Child Subfolder',
        body: '',
        type: 'folder',
        parentId: rootFolder.id,
      },
      db
    );
    expect(subFolder.parentId).toBe(rootFolder.id);

    // 3. Create document in subfolder
    const childDoc = await createNote(
      {
        title: 'Child Document',
        body: 'Doc content',
        type: 'document',
        parentId: subFolder.id,
      },
      db
    );
    expect(childDoc.parentId).toBe(subFolder.id);

    // 4. Verify folder filtering
    const subFolderDocs = await getNotesByFolder(subFolder.id, db);
    expect(subFolderDocs.length).toBe(1);
    expect(subFolderDocs[0]?.id).toBe(childDoc.id);

    const rootFolderDocs = await getNotesByFolder(rootFolder.id, db);
    // Subfolder is a note of type folder with parentId = rootFolder.id
    expect(rootFolderDocs.some((n) => n.id === subFolder.id)).toBe(true);
  });

  it('batch creates multiple notes under target folder in one operation', async () => {
    const folder = await createNote(
      {
        title: 'Target Folder',
        body: '',
        type: 'folder',
      },
      db
    );

    const inputs = [
      { title: 'Doc 1', body: '# Doc 1 content', type: 'document' as const, parentId: folder.id },
      { title: 'Doc 2', body: '# Doc 2 content', type: 'document' as const, parentId: folder.id },
      { title: 'Doc 3', body: '# Doc 3 content', type: 'document' as const, parentId: folder.id },
    ];

    const created = await batchCreateNotes(inputs, db);
    expect(created.length).toBe(3);
    expect(created.every((d) => d.parentId === folder.id)).toBe(true);

    const storedInDb = await db.notes.where('parentId').equals(folder.id).toArray();
    expect(storedInDb.length).toBe(3);
    expect(storedInDb.map((d) => d.title).sort()).toEqual(['Doc 1', 'Doc 2', 'Doc 3']);
  });
});
