import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../db';
import { createNote, softDeleteNote } from '../../../db/repositories/noteRepo';

describe('LinkedKnowledgeSection query behavior', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDocDB_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('filters out deleted documents in bulkGet and returns empty array', async () => {
    const doc = await createNote(
      {
        title: 'Linked Doc',
        body: 'Content',
        type: 'document',
      },
      db
    );

    // Initial state: doc is active
    let records = await db.notes.bulkGet([doc.id]);
    let activeRecords = records.filter((r) => Boolean(r && !r.deletedAt));
    expect(activeRecords.length).toBe(1);

    // Soft delete the linked document
    await softDeleteNote(doc.id, db);

    records = await db.notes.bulkGet([doc.id]);
    activeRecords = records.filter((r) => Boolean(r && !r.deletedAt));
    expect(activeRecords.length).toBe(0);

    // The condition: if (docIds.length === 0 || (linkedDocs !== undefined && linkedDocs.length === 0))
    // correctly identifies that all linked docs are deleted and section must be hidden (return null)
    const docIds = [doc.id];
    const linkedDocs = activeRecords;
    const shouldHideSection = docIds.length === 0 || (linkedDocs !== undefined && linkedDocs.length === 0);
    expect(shouldHideSection).toBe(true);
  });
});
