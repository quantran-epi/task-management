import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createNote,
  updateNote,
  softDeleteNote,
} from '../../src/db/repositories/noteRepo';

describe('Diagram Notes - Folder Hierarchy, Entity Linking & Persistence', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDiagramDB_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates diagram note with type "diagram" and persists correctly', async () => {
    const diag = await createNote(
      {
        title: 'Architecture Overview',
        body: 'flowchart TD\n  Client --> Server',
        type: 'diagram',
        tags: ['diagram'],
      },
      db
    );

    expect(diag.id).toBeDefined();
    expect(diag.type).toBe('diagram');
    expect(diag.title).toBe('Architecture Overview');
    expect(diag.body).toContain('flowchart TD');

    const loaded = await db.notes.get(diag.id);
    expect(loaded?.type).toBe('diagram');
    expect(loaded?.title).toBe('Architecture Overview');
  });

  it('supports folder hierarchy for diagram notes', async () => {
    // Create diagram folder
    const folder = await createNote(
      {
        title: 'Backend Diagrams',
        body: '',
        type: 'folder',
        tags: ['diagram'],
      },
      db
    );

    // Create diagram inside folder
    const diag = await createNote(
      {
        title: 'Database ERD',
        body: 'erDiagram\n  USER ||--o{ POST : writes',
        type: 'diagram',
        parentId: folder.id,
        tags: ['diagram'],
      },
      db
    );

    expect(diag.parentId).toBe(folder.id);

    const insideFolder = await db.notes.where('parentId').equals(folder.id).toArray();
    expect(insideFolder).toHaveLength(1);
    expect(insideFolder[0]?.id).toBe(diag.id);
    expect(insideFolder[0]?.type).toBe('diagram');
  });

  it('supports linking diagram to Task, Milestone, or Project and auto-saving updates', async () => {
    const taskId = '00000000-0000-4000-8000-000000000001';
    const diag = await createNote(
      {
        title: 'Task Flow Diagram',
        body: 'sequenceDiagram\n  A->>B: Call',
        type: 'diagram',
        entityType: 'task',
        entityId: taskId,
        tags: ['diagram'],
      },
      db
    );

    expect(diag.entityType).toBe('task');
    expect(diag.entityId).toBe(taskId);

    // Update diagram with new code and title
    const updated = await updateNote(
      diag.id,
      {
        title: 'Updated Task Flow',
        body: 'sequenceDiagram\n  A->>B: Call\n  B-->>A: Return',
      },
      db
    );

    expect(updated?.title).toBe('Updated Task Flow');
    expect(updated?.body).toContain('Return');
    expect(updated?.entityType).toBe('task');
    expect(updated?.entityId).toBe(taskId);
  });

  it('soft deletes diagram note without affecting other diagram notes', async () => {
    const diag1 = await createNote(
      {
        title: 'Diag 1',
        body: 'graph TD; A-->B;',
        type: 'diagram',
      },
      db
    );

    const diag2 = await createNote(
      {
        title: 'Diag 2',
        body: 'graph TD; C-->D;',
        type: 'diagram',
      },
      db
    );

    await softDeleteNote(diag1.id, db);

    const active = await db.notes.filter((n) => n.type === 'diagram' && !n.deletedAt).toArray();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(diag2.id);

    // Verify diagram trash can isolates deleted diagram notes
    const trash = await db.notes
      .filter((n) => Boolean((n.type === 'diagram' || (n.type === 'folder' && n.tags?.includes('diagram'))) && n.deletedAt))
      .toArray();
    expect(trash).toHaveLength(1);
    expect(trash[0]?.id).toBe(diag1.id);
  });

  it('restores diagram note from trash and supports permanent delete', async () => {
    const { restoreNote, permanentDeleteNote } = await import('../../src/db/repositories/noteRepo');

    const diag = await createNote(
      {
        title: 'Temporary Flow',
        body: 'flowchart TD; A-->B;',
        type: 'diagram',
      },
      db
    );

    // Soft delete
    await softDeleteNote(diag.id, db);
    let inDb = await db.notes.get(diag.id);
    expect(inDb?.deletedAt).toBeDefined();

    // Restore
    await restoreNote(diag.id, db);
    inDb = await db.notes.get(diag.id);
    expect(inDb?.deletedAt).toBeUndefined();

    // Permanent delete
    await permanentDeleteNote(diag.id, db);
    inDb = await db.notes.get(diag.id);
    expect(inDb).toBeUndefined();
  });
});
