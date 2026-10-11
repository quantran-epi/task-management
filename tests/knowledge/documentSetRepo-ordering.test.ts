// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createDocumentSet,
  updatePresentationOrder,
  fetchSetCatalog,
} from '../../src/db/repositories/documentSetRepo';
import { generateId } from '../../src/utils/uuid';
import type { PublishedDocumentMetadata } from '../../src/types/models';

describe('DocumentSet Repository Presentation Ordering & Catalog (D-17, D-32, D-33, D-35)', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = 'TestDocSetOrdering_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  it('7. updatePresentationOrder increments presentationRevision by exactly 1', async () => {
    const docId1 = generateId();
    const docId2 = generateId();
    const set = await createDocumentSet(
      {
        name: 'Order Test Set',
        documentIds: [docId1, docId2],
        presentationRevision: 0,
      },
      db
    );

    expect(set.presentationRevision).toBe(0);

    // Reorder
    await updatePresentationOrder(set.id, [docId2, docId1], db);

    const reloaded = await db.documentSets.get(set.id);
    expect(reloaded?.presentationRevision).toBe(1);
    expect(reloaded?.documentIds).toEqual([docId2, docId1]);

    // Reorder again
    await updatePresentationOrder(set.id, [docId1, docId2], db);
    const reloaded2 = await db.documentSets.get(set.id);
    expect(reloaded2?.presentationRevision).toBe(2);
  });

  it('8. updatePresentationOrder leaves graphSnapshotId unchanged (D-33)', async () => {
    const docId = generateId();
    const set = await createDocumentSet(
      {
        name: 'Snapshot Preserved Set',
        documentIds: [docId],
      },
      db
    );

    // Add a published document metadata with activeSnapshotId
    const meta: PublishedDocumentMetadata = {
      setId: set.id,
      documentId: docId,
      lastKnownRemoteAt: new Date().toISOString(),
      publishedContentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      activeSnapshotId: 'gsnap_immutable_snapshot_123',
    };
    await db.publishedDocuments.add(meta);

    // Reorder
    await updatePresentationOrder(set.id, [docId], db);

    // Meta activeSnapshotId must remain intact
    const fetchedMeta = await db.publishedDocuments.get([set.id, docId]);
    expect(fetchedMeta?.activeSnapshotId).toBe('gsnap_immutable_snapshot_123');
  });

  it('9. updatePresentationOrder leaves publishedContentHash on published projection unchanged', async () => {
    const docId = generateId();
    const originalHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
    const set = await createDocumentSet(
      {
        name: 'Hash Preserved Set',
        documentIds: [docId],
      },
      db
    );

    await db.publishedDocuments.add({
      setId: set.id,
      documentId: docId,
      lastKnownRemoteAt: new Date().toISOString(),
      publishedContentHash: originalHash,
    });

    await updatePresentationOrder(set.id, [docId], db);

    const fetchedMeta = await db.publishedDocuments.get([set.id, docId]);
    expect(fetchedMeta?.publishedContentHash).toBe(originalHash);
  });

  it('10. fetchSetCatalog returns catalog entries with scope/aliases/relation/isBase fields', async () => {
    const baseSet = await createDocumentSet(
      {
        name: 'Base Set',
        documentIds: [],
        scope: { domain: 'CoreBanking', environment: null, version: null },
        aliases: ['core', 'base'],
        isBase: true,
        preset: 'Chung',
      },
      db
    );

    const targetId = baseSet.id;
    await createDocumentSet(
      {
        name: 'UAT Diff Set',
        documentIds: [],
        scope: { domain: 'CoreBanking', environment: 'UAT', version: '2.0' },
        aliases: ['uat-core'],
        relations: [{ kind: 'EXTENDS', targetSetId: targetId }],
        isBase: false,
        preset: 'TheoMoiTruong',
      },
      db
    );

    const catalog = await fetchSetCatalog(db);
    expect(catalog).toHaveLength(2);

    const baseEntry = catalog.find((c) => c.setId === baseSet.id);
    expect(baseEntry).toBeDefined();
    expect(baseEntry?.canonicalName).toBe('Base Set');
    expect(baseEntry?.domain).toBe('CoreBanking');
    expect(baseEntry?.environment).toBeNull();
    expect(baseEntry?.version).toBeNull();
    expect(baseEntry?.aliases).toEqual(['core', 'base']);
    expect(baseEntry?.isBase).toBe(true);
    expect(baseEntry?.relation).toBeNull();

    const uatEntry = catalog.find((c) => c.canonicalName === 'UAT Diff Set');
    expect(uatEntry).toBeDefined();
    expect(uatEntry?.domain).toBe('CoreBanking');
    expect(uatEntry?.environment).toBe('UAT');
    expect(uatEntry?.version).toBe('2.0');
    expect(uatEntry?.aliases).toEqual(['uat-core']);
    expect(uatEntry?.isBase).toBe(false);
    expect(uatEntry?.relation).toBe('EXTENDS');
  });
});
