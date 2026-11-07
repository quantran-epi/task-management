import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  linkEntitiesToDoc,
  unlinkEntityFromDoc,
  getBacklinksForDoc,
} from '../../src/db/repositories/documentLinkRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';

/**
 * Wave 0 suite for CR-backed document links (ENT-NORM-01, D-50).
 *
 * The `projects` store does not exist after V16, so every transaction in
 * `documentLinkRepo` must name `db.changeRequests` instead. Running these against a
 * current-version database is the functional proof: naming a dropped store in a
 * transaction list throws at runtime.
 *
 * RED until plan 31.2-04 re-axes `documentLinkRepo`.
 */

const NOW = '2026-11-07T00:00:00.000Z';

describe('DocumentLink Repository — CR axis (ENT-NORM-01)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = 'TestDocumentLinkRepoDB_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function seedDocAndCr() {
    const docId = '66666666-6666-4666-8666-666666666666';
    await db.notes.add({
      id: docId,
      title: 'Design Doc',
      body: '# Design',
      isPinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const cr = await createChangeRequest(
      { status: 'Open', targets: [], name: 'CR', code: 'CR-1', type: 'ENHANCEMENT' },
      db
    );

    return { docId, cr };
  }

  it('links a CR to a document through a changeRequests transaction', async () => {
    const { docId, cr } = await seedDocAndCr();

    await linkEntitiesToDoc(
      docId,
      'Design Doc',
      [{ id: cr.id, type: 'cr', title: cr.name }],
      db
    );

    const crAfter = await db.changeRequests.get(cr.id);
    expect(crAfter?.documentLinks).toContain(docId);

    const docAfter = await db.notes.get(docId);
    expect(docAfter?.body).toContain(`[[cr:${cr.id}`);
  }, 30000);

  it('keeps existing CR documentLinks when another link is added', async () => {
    const { docId, cr } = await seedDocAndCr();
    const otherDocId = '77777777-7777-4777-8777-777777777777';

    await db.notes.add({
      id: otherDocId,
      title: 'Other Doc',
      body: '',
      isPinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await linkEntitiesToDoc(docId, 'Design Doc', [{ id: cr.id, type: 'cr', title: cr.name }], db);
    await linkEntitiesToDoc(
      otherDocId,
      'Other Doc',
      [{ id: cr.id, type: 'cr', title: cr.name }],
      db
    );

    const crAfter = await db.changeRequests.get(cr.id);
    expect(crAfter?.documentLinks).toEqual(expect.arrayContaining([docId, otherDocId]));
  }, 30000);

  it('removes the link from changeRequests.documentLinks on unlink', async () => {
    const { docId, cr } = await seedDocAndCr();

    await linkEntitiesToDoc(docId, 'Design Doc', [{ id: cr.id, type: 'cr', title: cr.name }], db);
    await unlinkEntityFromDoc(docId, 'cr', cr.id, db);

    const crAfter = await db.changeRequests.get(cr.id);
    expect(crAfter?.documentLinks ?? []).not.toContain(docId);

    const docAfter = await db.notes.get(docId);
    expect(docAfter?.body ?? '').not.toContain(`[[cr:${cr.id}`);
  }, 30000);

  it('returns backlinks without touching a dropped store', async () => {
    const { docId, cr } = await seedDocAndCr();

    await linkEntitiesToDoc(docId, 'Design Doc', [{ id: cr.id, type: 'cr', title: cr.name }], db);

    const backlinks = await getBacklinksForDoc(docId, db);
    expect(backlinks.referencingNotes).toBeDefined();
    expect(backlinks.tasks).toBeDefined();
  }, 30000);
});
