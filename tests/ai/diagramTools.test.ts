import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createNote } from '../../src/db/repositories/noteRepo';
import {
  AI_DATABASE_TOOLS,
  executeAiTool,
  isMutationTool,
} from '../../src/services/ai/aiTools';

const UUID_TASK = '33333333-3333-4333-8333-333333333333';
const UNTRUSTED_MARKER = 'DỮ LIỆU KHÔNG ĐÁNG TIN';

const findTool = (name: string) =>
  AI_DATABASE_TOOLS.find((t) => t.function.name === name)?.function as any;

describe('AI diagram tools', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(
      `TestDiagramTools_${Date.now()}_${Math.random().toString(36).slice(2)}`
    );
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  const seedDiagram = (title: string, body: string, extra: Record<string, any> = {}) =>
    createNote({ title, body, type: 'diagram', tags: ['diagram'], ...extra }, db);

  it('registers the three tools with the documented required params', () => {
    const query = findTool('query_diagrams');
    const create = findTool('create_diagram');
    const update = findTool('update_diagram');

    expect(query).toBeDefined();
    expect(create).toBeDefined();
    expect(update).toBeDefined();

    expect(create.parameters.required).toContain('body');
    expect(update.parameters.required).toContain('id');
    expect(query.parameters.properties).toHaveProperty('includeBody');
  });

  it('classifies query_diagrams as read and the two writers as mutations', () => {
    expect(isMutationTool('query_diagrams')).toBe(false);
    expect(isMutationTool('query_diagrams_ide')).toBe(false);
    expect(isMutationTool('create_diagram')).toBe(true);
    expect(isMutationTool('update_diagram')).toBe(true);
  });

  it('creates a diagram note with the diagram tag and ANSI stripped', async () => {
    const res = JSON.parse(
      await executeAiTool(
        'create_diagram',
        { title: 'Luồng đăng nhập', body: '\x1B[31mflowchart TD\n  A-->B\x1B[0m' },
        db
      )
    );

    expect(res.success).toBe(true);
    expect(res.noteId).toBeTruthy();

    const row = await db.notes.get(res.noteId);
    expect(row?.type).toBe('diagram');
    expect(row?.tags).toContain('diagram');
    expect(row?.body).toBe('flowchart TD\n  A-->B');
  });

  it('saves a fenced mermaid body without the fences', async () => {
    const res = JSON.parse(
      await executeAiTool(
        'create_diagram',
        { title: 'Fenced', body: '```mermaid\nflowchart LR\n  X-->Y\n```' },
        db
      )
    );

    const row = await db.notes.get(res.noteId);
    expect(row?.body).toBe('flowchart LR\n  X-->Y');
    expect(row?.body).not.toContain('```');
  });

  it('rejects create_diagram when the body is missing or empty', async () => {
    const missing = JSON.parse(await executeAiTool('create_diagram', { title: 'x' }, db));
    expect(missing.error).toBeTruthy();

    const empty = JSON.parse(await executeAiTool('create_diagram', { body: '   ' }, db));
    expect(empty.error).toBeTruthy();
  });

  it('lists diagrams without body by default and wraps the title', async () => {
    await seedDiagram('Sơ đồ A', 'flowchart TD\n  A-->B');
    await seedDiagram('Sơ đồ B', 'flowchart LR\n  C-->D');
    await createNote({ title: 'Tài liệu', body: 'plain text', type: 'document' }, db);

    const res = JSON.parse(await executeAiTool('query_diagrams', {}, db));

    expect(res.totalCount).toBe(2);
    expect(res.returnedCount).toBe(2);
    for (const row of res.diagrams) {
      expect(row).not.toHaveProperty('body');
      expect(row.id).toBeTruthy();
      expect(row.tags).toContain('diagram');
      expect(row.updatedAt).toBeTruthy();
      expect(row.title).toContain(UNTRUSTED_MARKER);
    }
  });

  it('filters by tag, title substring, entityId, and adds a wrapped body on request', async () => {
    await seedDiagram('Luồng đăng nhập', 'flowchart TD\n  A-->B');
    const linked = await seedDiagram('Sơ đồ liên kết', 'flowchart LR\n  C-->D', {
      entityType: 'task',
      entityId: UUID_TASK,
      tags: ['diagram', 'auth'],
    });

    const byTag = JSON.parse(await executeAiTool('query_diagrams', { tags: ['diagram'] }, db));
    expect(byTag.totalCount).toBe(2);

    const byTitle = JSON.parse(
      await executeAiTool('query_diagrams', { title: 'đăng nhập' }, db)
    );
    expect(byTitle.totalCount).toBe(1);
    expect(byTitle.diagrams[0].id).not.toBe(linked.id);

    const byEntity = JSON.parse(
      await executeAiTool('query_diagrams', { entityId: UUID_TASK }, db)
    );
    expect(byEntity.totalCount).toBe(1);
    expect(byEntity.diagrams[0].id).toBe(linked.id);

    const withBody = JSON.parse(
      await executeAiTool('query_diagrams', { entityId: UUID_TASK, includeBody: true }, db)
    );
    expect(withBody.diagrams[0].body).toContain('flowchart LR');
    expect(withBody.diagrams[0].body).toContain(UNTRUSTED_MARKER);
  });

  it('updates a diagram body and refuses non-diagram or unknown targets', async () => {
    const diagram = await seedDiagram('Sơ đồ cũ', 'flowchart TD\n  A-->B');
    const doc = await createNote(
      { title: 'Tài liệu', body: 'nội dung tài liệu', type: 'document' },
      db
    );

    const ok = JSON.parse(
      await executeAiTool(
        'update_diagram',
        { id: diagram.id, body: 'flowchart LR\n  C-->D' },
        db
      )
    );
    expect(ok.success).toBe(true);
    const updated = await db.notes.get(diagram.id);
    expect(updated?.body).toBe('flowchart LR\n  C-->D');

    const wrongType = JSON.parse(
      await executeAiTool('update_diagram', { id: doc.id, body: 'flowchart TD\n  X-->Y' }, db)
    );
    expect(wrongType.error).toBeTruthy();
    const docAfter = await db.notes.get(doc.id);
    expect(docAfter?.body).toBe('nội dung tài liệu');

    const missing = JSON.parse(
      await executeAiTool(
        'update_diagram',
        { id: '99999999-9999-4999-8999-999999999999', body: 'flowchart TD\n  X-->Y' },
        db
      )
    );
    expect(missing.error).toContain('not found');
  });
});
