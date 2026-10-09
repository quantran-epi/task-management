// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  reconcileRemoteAttempt,
  markPollingUncertain,
  listRecentAttempts,
  getCachedPublishAttempt,
  type ReconcileAttemptInput,
} from '../../src/db/repositories/publishAttemptRepo';
import { createDocumentSet } from '../../src/db/repositories/documentSetRepo';
import { generateId } from '../../src/utils/uuid';

describe('Publish Attempt Reconciliation & Status (D-08, D-27, D-29, T-16-05, T-16-06, T-16-07)', () => {
  let dbName: string;
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    dbName = 'TestPublishAttemptRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  const validHash1 = '1111111111111111111111111111111111111111111111111111111111111111';
  const validHash2 = '2222222222222222222222222222222222222222222222222222222222222222';

  it('updates attempt cache, published documents, and set atomically on terminal state', async () => {
    const docId1 = generateId();
    const docId2 = generateId();
    const set = await createDocumentSet(
      {
        name: 'Process 60000006 Set',
        documentIds: [docId1, docId2],
      },
      db
    );

    const attemptId = generateId();
    const reconcileInput: ReconcileAttemptInput = {
      attempt: {
        id: attemptId,
        setId: set.id,
        attemptKey: 'key-12345',
        startedAt: '2026-10-08T00:00:00.000Z',
        completedAt: '2026-10-08T00:00:05.000Z',
        durationMs: 5000,
        status: 'In sync',
        addedCount: 2,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
      publishedDocuments: [
        {
          setId: set.id,
          documentId: docId1,
          lastKnownRemoteAt: '2026-10-08T00:00:05.000Z',
          publishedContentHash: validHash1,
          activeSnapshotId: 'snap-001',
          activeAttemptId: attemptId,
          lastPrimaryState: 'In sync',
        },
        {
          setId: set.id,
          documentId: docId2,
          lastKnownRemoteAt: '2026-10-08T00:00:05.000Z',
          publishedContentHash: validHash2,
          activeSnapshotId: 'snap-001',
          activeAttemptId: attemptId,
          lastPrimaryState: 'In sync',
        },
      ],
    };

    const savedAttempt = await reconcileRemoteAttempt(reconcileInput, db);
    expect(savedAttempt.id).toBe(attemptId);
    expect(savedAttempt.status).toBe('In sync');

    // Verify atomic writes in IndexedDB
    const attemptInDb = await db.publishAttempts.get(attemptId);
    expect(attemptInDb).toBeDefined();
    expect(attemptInDb?.addedCount).toBe(2);

    const docMeta1 = await db.publishedDocuments.get([set.id, docId1]);
    expect(docMeta1?.publishedContentHash).toBe(validHash1);
    expect(docMeta1?.activeSnapshotId).toBe('snap-001');

    const docMeta2 = await db.publishedDocuments.get([set.id, docId2]);
    expect(docMeta2?.publishedContentHash).toBe(validHash2);
  });

  it('rejects malformed status, non-UUIDs, bad counts, or bad hashes before opening write transaction (T-16-05)', async () => {
    const set = await createDocumentSet({ name: 'Set A' }, db);

    const badStatusInput: any = {
      attempt: {
        id: generateId(),
        setId: set.id,
        startedAt: '2026-10-08T00:00:00.000Z',
        status: 'Offline', // Invalid status per D-27
        addedCount: 0,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
    };

    await expect(reconcileRemoteAttempt(badStatusInput, db)).rejects.toThrow();

    const badHashInput: any = {
      attempt: {
        id: generateId(),
        setId: set.id,
        startedAt: '2026-10-08T00:00:00.000Z',
        status: 'In sync',
        addedCount: 0,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
      publishedDocuments: [
        {
          setId: set.id,
          documentId: generateId(),
          lastKnownRemoteAt: '2026-10-08T00:00:00.000Z',
          publishedContentHash: 'not-64-hex', // Invalid hash
        },
      ],
    };

    await expect(reconcileRemoteAttempt(badHashInput, db)).rejects.toThrow();

    // Verify 0 attempts entered DB
    const attemptsCount = await db.publishAttempts.count();
    expect(attemptsCount).toBe(0);
  });

  it('rejects content-bearing fields such as body, token, payload, or raw DLP excerpts (T-16-06)', async () => {
    const set = await createDocumentSet({ name: 'Set Content Free' }, db);

    const withSecretAttempt: any = {
      attempt: {
        id: generateId(),
        setId: set.id,
        startedAt: '2026-10-08T00:00:00.000Z',
        status: 'In sync',
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
        body: '# Leaked markdown body', // Forbidden!
      },
    };

    await expect(reconcileRemoteAttempt(withSecretAttempt, db)).rejects.toThrow();

    const withTokenAttempt: any = {
      attempt: {
        id: generateId(),
        setId: set.id,
        startedAt: '2026-10-08T00:00:00.000Z',
        status: 'In sync',
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
        token: 'Bearer eyJ...', // Forbidden!
      },
    };

    await expect(reconcileRemoteAttempt(withTokenAttempt, db)).rejects.toThrow();

    const withExcerptMeta: any = {
      attempt: {
        id: generateId(),
        setId: set.id,
        startedAt: '2026-10-08T00:00:00.000Z',
        status: 'In sync',
        addedCount: 1,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
        warningCount: 0,
      },
      publishedDocuments: [
        {
          setId: set.id,
          documentId: generateId(),
          lastKnownRemoteAt: '2026-10-08T00:00:00.000Z',
          publishedContentHash: validHash1,
          excerpt: 'PAN: 4111111111111111', // Forbidden!
        },
      ],
    };

    await expect(reconcileRemoteAttempt(withExcerptMeta, db)).rejects.toThrow();
  });

  it('marks polling uncertainty by keeping status Publishing and annotating subordinate message (D-08, D-13, D-27)', async () => {
    const set = await createDocumentSet({ name: 'Set Network Uncertainty' }, db);
    const attemptId = generateId();

    // 1. Initial attempt is Publishing
    await reconcileRemoteAttempt(
      {
        attempt: {
          id: attemptId,
          setId: set.id,
          startedAt: '2026-10-08T00:00:00.000Z',
          status: 'Publishing',
          addedCount: 0,
          changedCount: 0,
          removedCount: 0,
          unchangedCount: 0,
          warningCount: 0,
        },
      },
      db
    );

    // 2. Mark network disconnected / uncertain
    const uncertainReason = 'Mất kết nối — chưa xác định kết quả';
    const updated = await markPollingUncertain(attemptId, uncertainReason, db);

    expect(updated).toBeDefined();
    expect(updated?.status).toBe('Publishing'); // Stays exactly 'Publishing', NOT 'Failed' or 7th state
    expect(updated?.errorMessage).toBe(uncertainReason);

    const inDb = await db.publishAttempts.get(attemptId);
    expect(inDb?.status).toBe('Publishing');
    expect(inDb?.errorMessage).toBe(uncertainReason);
  });

  it('retains exactly newest 10 attempts per set by server timestamp with mixed insertion order (D-29, T-16-07)', async () => {
    const set = await createDocumentSet({ name: 'Set Bounded History' }, db);

    // Generate 12 attempts with distinct timestamps
    const timestamps = [
      '2026-10-08T01:00:00.000Z', // Oldest (0) -> should be pruned
      '2026-10-08T02:00:00.000Z', // 2nd oldest (1) -> should be pruned
      '2026-10-08T03:00:00.000Z', // 3
      '2026-10-08T04:00:00.000Z', // 4
      '2026-10-08T05:00:00.000Z', // 5
      '2026-10-08T06:00:00.000Z', // 6
      '2026-10-08T07:00:00.000Z', // 7
      '2026-10-08T08:00:00.000Z', // 8
      '2026-10-08T09:00:00.000Z', // 9
      '2026-10-08T10:00:00.000Z', // 10
      '2026-10-08T11:00:00.000Z', // 11
      '2026-10-08T12:00:00.000Z', // 12 Newest
    ];

    // Insert in shuffled/mixed order
    const shuffledIndices = [5, 2, 0, 11, 7, 1, 9, 3, 10, 4, 8, 6];

    for (const idx of shuffledIndices) {
      const ts = timestamps[idx]!;
      await reconcileRemoteAttempt(
        {
          attempt: {
            id: generateId(),
            setId: set.id,
            startedAt: ts,
            completedAt: ts,
            status: 'In sync',
            addedCount: 1,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            warningCount: 0,
          },
        },
        db
      );
    }

    // List recent attempts
    const history = await listRecentAttempts(set.id, db);
    expect(history).toHaveLength(10); // Bounded to exactly 10

    // Ensure sorted newest first
    expect(history[0]?.startedAt).toBe('2026-10-08T12:00:00.000Z');
    expect(history[9]?.startedAt).toBe('2026-10-08T03:00:00.000Z');

    // Total rows in DB for this set must be exactly 10
    const totalInDb = await db.publishAttempts.where('setId').equals(set.id).count();
    expect(totalInDb).toBe(10);

    // Verify oldest timestamps were pruned
    const allAttemptsInDb = await db.publishAttempts.where('setId').equals(set.id).toArray();
    expect(allAttemptsInDb.some((a) => a.startedAt === '2026-10-08T01:00:00.000Z')).toBe(false);
    expect(allAttemptsInDb.some((a) => a.startedAt === '2026-10-08T02:00:00.000Z')).toBe(false);
  });

  describe('Frozen Submitted Document Manifest (D-06, D-07, D-08, D-10, D-13, D-18, D-29)', () => {
    it('persists frozen manifest entries, survives DB close/reopen, and retrieves by attempt ID via getCachedPublishAttempt', async () => {
      const set = await createDocumentSet({ name: 'Manifest Set' }, db);
      const attemptId = generateId();
      const docId1 = generateId();
      const docId2 = generateId();
      const hash1 = 'a'.repeat(64);
      const hash2 = 'b'.repeat(64);

      const submittedDocs = [
        { documentId: docId1, submittedContentHash: hash1 },
        { documentId: docId2, submittedContentHash: hash2 },
      ];

      await reconcileRemoteAttempt(
        {
          attempt: {
            id: attemptId,
            setId: set.id,
            startedAt: '2026-10-08T00:00:00.000Z',
            status: 'Publishing',
            addedCount: 2,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            warningCount: 0,
            submittedDocuments: submittedDocs,
          },
        },
        db
      );

      // Close and reopen database instance to verify durable IndexedDB persistence
      db.close();
      const reopenedDb = new TaskPlannerDatabase(dbName);
      await reopenedDb.open();

      // Retrieve via getCachedPublishAttempt
      const cached = await getCachedPublishAttempt(attemptId, reopenedDb);
      expect(cached).toBeDefined();
      expect(cached?.id).toBe(attemptId);
      expect(cached?.submittedDocuments).toEqual(submittedDocs);

      reopenedDb.close();
      await db.open();
    });

    it('preserves existing manifest byte-for-byte across subsequent status updates that omit submittedDocuments', async () => {
      const set = await createDocumentSet({ name: 'Preserve Manifest Set' }, db);
      const attemptId = generateId();
      const docId1 = generateId();
      const hash1 = 'c'.repeat(64);

      // 1. Initial write with submitted manifest
      await reconcileRemoteAttempt(
        {
          attempt: {
            id: attemptId,
            setId: set.id,
            startedAt: '2026-10-08T00:00:00.000Z',
            status: 'Publishing',
            addedCount: 1,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            warningCount: 0,
            submittedDocuments: [{ documentId: docId1, submittedContentHash: hash1 }],
          },
        },
        db
      );

      // 2. Network uncertainty update via markPollingUncertain
      await markPollingUncertain(attemptId, 'Connection drop', db);

      let inDb = await getCachedPublishAttempt(attemptId, db);
      expect(inDb?.status).toBe('Publishing');
      expect(inDb?.errorMessage).toBe('Connection drop');
      expect(inDb?.submittedDocuments).toEqual([
        { documentId: docId1, submittedContentHash: hash1 },
      ]);

      // 3. Terminal update without submittedDocuments
      await reconcileRemoteAttempt(
        {
          attempt: {
            id: attemptId,
            setId: set.id,
            startedAt: '2026-10-08T00:00:00.000Z',
            completedAt: '2026-10-08T00:00:04.000Z',
            status: 'In sync',
            addedCount: 1,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            warningCount: 0,
          },
        },
        db
      );

      inDb = await getCachedPublishAttempt(attemptId, db);
      expect(inDb?.status).toBe('In sync');
      expect(inDb?.submittedDocuments).toEqual([
        { documentId: docId1, submittedContentHash: hash1 },
      ]);
    });

    it('rejects duplicate document IDs, non-lowercase hashes, and content-bearing fields in manifest', async () => {
      const set = await createDocumentSet({ name: 'Strict Manifest Set' }, db);
      const docId = generateId();

      // Duplicate document IDs
      await expect(
        reconcileRemoteAttempt(
          {
            attempt: {
              id: generateId(),
              setId: set.id,
              startedAt: '2026-10-08T00:00:00.000Z',
              status: 'Publishing',
              addedCount: 2,
              changedCount: 0,
              removedCount: 0,
              unchangedCount: 0,
              warningCount: 0,
              submittedDocuments: [
                { documentId: docId, submittedContentHash: 'a'.repeat(64) },
                { documentId: docId, submittedContentHash: 'b'.repeat(64) },
              ],
            },
          },
          db
        )
      ).rejects.toThrow();

      // Non-lowercase SHA-256 hash
      await expect(
        reconcileRemoteAttempt(
          {
            attempt: {
              id: generateId(),
              setId: set.id,
              startedAt: '2026-10-08T00:00:00.000Z',
              status: 'Publishing',
              addedCount: 1,
              changedCount: 0,
              removedCount: 0,
              unchangedCount: 0,
              warningCount: 0,
              submittedDocuments: [
                { documentId: docId, submittedContentHash: 'A'.repeat(64) },
              ],
            },
          },
          db
        )
      ).rejects.toThrow();

      // Content-bearing field inside manifest entry
      await expect(
        reconcileRemoteAttempt(
          {
            attempt: {
              id: generateId(),
              setId: set.id,
              startedAt: '2026-10-08T00:00:00.000Z',
              status: 'Publishing',
              addedCount: 1,
              changedCount: 0,
              removedCount: 0,
              unchangedCount: 0,
              warningCount: 0,
              submittedDocuments: [
                {
                  documentId: docId,
                  submittedContentHash: 'a'.repeat(64),
                  body: '# Secret markdown content',
                } as any,
              ],
            },
          },
          db
        )
      ).rejects.toThrow();
    });

    it('proves forbidden canaries (title, body, tag, token, DLP) are completely absent from serialized row', async () => {
      const set = await createDocumentSet({ name: 'Canary Test Set' }, db);
      const attemptId = generateId();
      const docId = generateId();

      await reconcileRemoteAttempt(
        {
          attempt: {
            id: attemptId,
            setId: set.id,
            startedAt: '2026-10-08T00:00:00.000Z',
            status: 'Publishing',
            addedCount: 1,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            warningCount: 0,
            submittedDocuments: [
              { documentId: docId, submittedContentHash: 'f'.repeat(64) },
            ],
          },
        },
        db
      );

      const rawRow = await db.publishAttempts.get(attemptId);
      const serialized = JSON.stringify(rawRow);

      expect(serialized).not.toContain('title');
      expect(serialized).not.toContain('body');
      expect(serialized).not.toContain('tags');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('Bearer');
      expect(serialized).not.toContain('dlp');
      expect(serialized).not.toContain('finding');
    });
  });
});
