// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V8 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createNote,
  softDeleteNote,
  restoreNote,
  getNotesByFolder,
  getTrashNotes,
  permanentDeleteNote,
} from '../../src/db/repositories/noteRepo';
import { NoteInputSchema } from '../../src/validation/schemas';

describe('Dexie Schema v9 Migration & Note Repository (REQ-14.1, D-01, D-02, D-17)', () => {
  const dbName = 'TestMigrationV9DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('opens database and populates notes table with SCHEMA_V9 indexes', async () => {
    const db = new TaskPlannerDatabase(dbName);
    await db.open();

    expect(db.verno).toBeGreaterThanOrEqual(9);
    expect(db.notes.schema.indexes.some((idx) => idx.name === 'type')).toBe(true);
    expect(db.notes.schema.indexes.some((idx) => idx.name === 'parentId')).toBe(true);
    expect(db.notes.schema.indexes.some((idx) => idx.name === 'deletedAt')).toBe(true);
    expect(db.notes.schema.indexes.some((idx) => idx.name === 'tags')).toBe(true);
    db.close();
  });

  it('migrates legacy v8 notes without type or tags gracefully to type quick_note and tags []', async () => {
    // Step 1: populate v8 database
    const v8Db = new Dexie(dbName);
    v8Db.version(8).stores(SCHEMA_V8);
    await v8Db.open();

    const legacyNoteId = '11111111-1111-4111-8111-111111111111';
    await v8Db.table('notes').add({
      id: legacyNoteId,
      entityType: 'task',
      entityId: '22222222-2222-4222-8222-222222222222',
      title: 'Legacy sticky note',
      body: 'Sticky note body content',
      isPinned: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    v8Db.close();

    // Step 2: open with TaskPlannerDatabase which runs version 9 upgrade
    const v9Db = new TaskPlannerDatabase(dbName);
    await v9Db.open();

    const note = await v9Db.notes.get(legacyNoteId);
    expect(note).toBeDefined();
    expect(note?.type).toBe('quick_note');
    expect(note?.tags).toEqual([]);
    expect(note?.title).toBe('Legacy sticky note');
    expect(note?.body).toBe('Sticky note body content');
    expect(note?.isPinned).toBe(true);

    v9Db.close();
  });

  it('validates NoteInputSchema with type, parentId, tags, and slug', () => {
    const validDocument = {
      type: 'document' as const,
      parentId: '33333333-3333-4333-8333-333333333333',
      title: 'Architectural Blueprint',
      body: '# Architecture\nDetailed plan...',
      tags: ['architecture', 'specs'],
      slug: 'architectural-blueprint',
    };

    const parsed = NoteInputSchema.parse(validDocument);
    expect(parsed.type).toBe('document');
    expect(parsed.parentId).toBe('33333333-3333-4333-8333-333333333333');
    expect(parsed.tags).toEqual(['architecture', 'specs']);
    expect(parsed.slug).toBe('architectural-blueprint');

    // Default type is quick_note
    const defaultParsed = NoteInputSchema.parse({
      body: 'Just a quick reminder',
    });
    expect(defaultParsed.type).toBe('quick_note');

    // Folder allows empty body
    const folderParsed = NoteInputSchema.parse({
      type: 'folder',
      title: 'Tài liệu kiến trúc',
      body: '',
    });
    expect(folderParsed.type).toBe('folder');
    expect(folderParsed.body).toBe('');
  });

  it('supports noteRepo CRUD with soft delete, restore, folder filter, and trash queries', async () => {
    const db = new TaskPlannerDatabase(dbName);
    await db.open();

    const folderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    // 1. Create document in folder
    const doc1 = await createNote(
      {
        type: 'document',
        parentId: folderId,
        title: 'Doc in Folder',
        body: 'Content in folder',
        tags: ['guide'],
      },
      db
    );

    // 2. Create another doc at root (no parentId)
    const docRoot = await createNote(
      {
        type: 'document',
        title: 'Root Doc',
        body: 'Root doc content',
        tags: ['root'],
      },
      db
    );

    // Query by folder
    const folderNotes = await getNotesByFolder(folderId, db);
    expect(folderNotes).toHaveLength(1);
    expect(folderNotes[0]?.id).toBe(doc1.id);

    const rootNotes = await getNotesByFolder(undefined, db);
    expect(rootNotes.some((n) => n.id === docRoot.id)).toBe(true);

    // 3. Soft delete doc1
    await softDeleteNote(doc1.id, db);

    const folderNotesAfterDelete = await getNotesByFolder(folderId, db);
    expect(folderNotesAfterDelete).toHaveLength(0);

    const trashNotes = await getTrashNotes(db);
    expect(trashNotes.some((n) => n.id === doc1.id)).toBe(true);

    // 4. Restore doc1
    await restoreNote(doc1.id, db);

    const folderNotesAfterRestore = await getNotesByFolder(folderId, db);
    expect(folderNotesAfterRestore).toHaveLength(1);

    const trashAfterRestore = await getTrashNotes(db);
    expect(trashAfterRestore.some((n) => n.id === doc1.id)).toBe(false);

    // 5. Permanent delete
    await permanentDeleteNote(doc1.id, db);
    const deletedDoc = await db.notes.get(doc1.id);
    expect(deletedDoc).toBeUndefined();

    db.close();
  });
});
