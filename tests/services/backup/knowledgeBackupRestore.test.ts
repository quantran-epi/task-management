import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  APP_MARKER,
  CURRENT_SCHEMA_VERSION,
  exportBackupPayload,
} from '../../../src/services/backup/exportBackup';
import {
  restoreBackupPayload,
  rollbackToSnapshot,
} from '../../../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';
import type { BackupEnvelope } from '../../../src/types/backup';
import type {
  ChatMessage,
  ChatThread,
  DlpAuditRecord,
  DocumentSet,
  Note,
  PublishedDocumentMetadata,
  PublishAttemptCache,
} from '../../../src/types/models';

const NOW = '2026-10-08T12:00:00.000Z';
const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const SET_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';
const HASH = 'a'.repeat(64);

const note: Note = {
  id: NOTE_ID,
  type: 'document',
  title: 'Pilot document',
  body: '# Pilot\n\nCanonical Markdown.',
  isPinned: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const documentSet: DocumentSet = {
  id: SET_ID,
  name: 'Pilot set',
  description: 'Scheduled process 60000006',
  documentIds: [NOTE_ID],
  createdAt: NOW,
  updatedAt: NOW,
};

const publishedDocument: PublishedDocumentMetadata = {
  setId: SET_ID,
  documentId: NOTE_ID,
  lastKnownRemoteAt: NOW,
  publishedContentHash: HASH,
  activeSnapshotId: SNAPSHOT_ID,
  activeAttemptId: ATTEMPT_ID,
  lastPrimaryState: 'In sync',
};

const publishAttempt: PublishAttemptCache = {
  id: ATTEMPT_ID,
  setId: SET_ID,
  attemptKey: 'attempt-key-1',
  startedAt: NOW,
  completedAt: NOW,
  durationMs: 100,
  status: 'In sync',
  addedCount: 1,
  changedCount: 0,
  removedCount: 0,
  unchangedCount: 0,
  warningCount: 0,
};

const dlpAudit: DlpAuditRecord = {
  id: '55555555-5555-4555-8555-555555555555',
  setId: SET_ID,
  attemptId: ATTEMPT_ID,
  ruleSetVersion: 'phase16-v1',
  timestamp: NOW,
  documentIds: [NOTE_ID],
  contentHashes: [HASH],
  findingCountsByCategory: { credential: 0 },
  userAction: 'auto_passed',
};

async function seedKnowledge(db: TaskPlannerDatabase, suffix = ''): Promise<void> {
  const seededNote = suffix ? { ...note, title: `Pilot document ${suffix}` } : note;
  await db.notes.add(seededNote);
  await db.documentSets.add(documentSet);
  await db.publishedDocuments.add(publishedDocument);
  await db.publishAttempts.add(publishAttempt);
  await db.dlpAudits.add(dlpAudit);
}

function legacyEnvelope(): BackupEnvelope {
  return {
    app: APP_MARKER,
    schemaVersion: 4,
    exportedAt: NOW,
    tables: {
      projects: [],
      milestones: [],
      tasks: [],
      capacityRules: [],
      capacityOverrides: [],
      plannedAllocations: [],
    },
    counts: {
      projects: 0,
      milestones: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    },
  };
}

describe('Schema V10 knowledge backup lifecycle', () => {
  let sourceDb: TaskPlannerDatabase;
  let restoredDb: TaskPlannerDatabase;

  beforeEach(async () => {
    sourceDb = new TaskPlannerDatabase(`KnowledgeBackupSource_${crypto.randomUUID()}`);
    restoredDb = new TaskPlannerDatabase(`KnowledgeBackupRestore_${crypto.randomUUID()}`);
    await Promise.all([sourceDb.open(), restoredDb.open()]);
  });

  afterEach(async () => {
    await Promise.all([sourceDb.delete(), restoredDb.delete()]);
  });

  it('exports and validates all Schema V10 tables without content-bearing audit fields', async () => {
    await seedKnowledge(sourceDb);

    const envelope = await exportBackupPayload(sourceDb);
    const validation = validateBackupPayload(envelope);

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(envelope.tables.documentSets).toEqual([documentSet]);
    expect(envelope.tables.publishedDocuments).toEqual([publishedDocument]);
    expect(envelope.tables.publishAttempts).toEqual([publishAttempt]);
    expect(envelope.tables.dlpAudits).toEqual([dlpAudit]);
    expect(envelope.counts).toMatchObject({
      documentSets: 1,
      publishedDocuments: 1,
      publishAttempts: 1,
      dlpAudits: 1,
    });
    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(JSON.stringify(envelope.tables.dlpAudits)).not.toContain('Canonical Markdown');
  });

  it('rejects malformed knowledge records and accepts legacy payloads without V10 tables', () => {
    const malformed = legacyEnvelope();
    malformed.tables.documentSets = [{ ...documentSet, id: 'not-a-uuid' }];

    const invalidResult = validateBackupPayload(malformed);
    const legacyResult = validateBackupPayload(legacyEnvelope());

    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'documentSets', field: 'id' }),
      ])
    );
    expect(legacyResult).toMatchObject({ valid: true, errors: [] });
    expect(legacyResult.envelope?.tables.documentSets).toBeUndefined();
  });

  it('restores knowledge records, replaces stale data, and rolls back the pre-restore snapshot', async () => {
    await seedKnowledge(sourceDb);
    const envelope = await exportBackupPayload(sourceDb);

    await seedKnowledge(restoredDb, 'before restore');
    await restoreBackupPayload(envelope, restoredDb);

    expect(await restoredDb.notes.get(NOTE_ID)).toEqual(note);
    expect(await restoredDb.documentSets.toArray()).toEqual([documentSet]);
    expect(await restoredDb.publishedDocuments.toArray()).toEqual([publishedDocument]);
    expect(await restoredDb.publishAttempts.toArray()).toEqual([publishAttempt]);
    expect(await restoredDb.dlpAudits.toArray()).toEqual([dlpAudit]);

    const snapshot = await restoredDb.settings.get('last_pre_import_snapshot');
    expect(snapshot?.value).toMatchObject({
      tables: {
        documentSets: [documentSet],
        publishedDocuments: [publishedDocument],
        publishAttempts: [publishAttempt],
        dlpAudits: [dlpAudit],
      },
    });

    await rollbackToSnapshot(restoredDb);

    expect((await restoredDb.notes.get(NOTE_ID))?.title).toBe('Pilot document before restore');
    expect(await restoredDb.documentSets.toArray()).toEqual([documentSet]);
    expect(await restoredDb.publishedDocuments.toArray()).toEqual([publishedDocument]);
    expect(await restoredDb.publishAttempts.toArray()).toEqual([publishAttempt]);
    expect(await restoredDb.dlpAudits.toArray()).toEqual([dlpAudit]);
  });

  it('restores a legacy payload while clearing stale Schema V10 projection metadata', async () => {
    await seedKnowledge(restoredDb);

    await restoreBackupPayload(legacyEnvelope(), restoredDb);

    expect(await restoredDb.documentSets.count()).toBe(0);
    expect(await restoredDb.publishedDocuments.count()).toBe(0);
    expect(await restoredDb.publishAttempts.count()).toBe(0);
    expect(await restoredDb.dlpAudits.count()).toBe(0);
  });

  describe('Document chat thread scope validation and restore (CR-08)', () => {
    const DOC_THREAD_ID = '66666666-6666-4666-8666-666666666666';
    const DOC_MSG_ID = '77777777-7777-4777-8777-777777777777';

    const docThread: ChatThread = {
      id: DOC_THREAD_ID,
      scopeKey: `document:${NOTE_ID}`,
      scopeType: 'document',
      entityId: NOTE_ID,
      title: 'Chat about Pilot document',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const docMessage: ChatMessage = {
      id: DOC_MSG_ID,
      threadId: DOC_THREAD_ID,
      role: 'user',
      content: 'Summarize Pilot doc please',
      createdAt: NOW,
    };

    it('rejects document-scoped chat thread missing entityId or referencing absent document', async () => {
      await seedKnowledge(sourceDb);
      const envelope = await exportBackupPayload(sourceDb);

      const invalidMissingEntityId = {
        ...envelope,
        tables: {
          ...envelope.tables,
          chatThreads: [
            {
              ...docThread,
              entityId: undefined,
            },
          ],
          chatMessages: [docMessage],
        },
      };

      const resMissing = validateBackupPayload(invalidMissingEntityId);
      expect(resMissing.valid).toBe(false);
      expect(
        resMissing.errors.some((e) => e.table === 'chatThreads' && e.field === 'entityId')
      ).toBe(true);

      const invalidAbsentDoc = {
        ...envelope,
        tables: {
          ...envelope.tables,
          chatThreads: [
            {
              ...docThread,
              entityId: '99999999-9999-4999-8999-999999999999',
            },
          ],
          chatMessages: [docMessage],
        },
      };

      const resAbsent = validateBackupPayload(invalidAbsentDoc);
      expect(resAbsent.valid).toBe(false);
      expect(
        resAbsent.errors.some(
          (e) =>
            e.table === 'chatThreads' &&
            e.field === 'entityId' &&
            e.message.includes('not found in notes')
        )
      ).toBe(true);
    });

    it('exports, validates, restores, and rolls back document chat thread and messages', async () => {
      await seedKnowledge(sourceDb);
      await sourceDb.chatThreads.add(docThread);
      await sourceDb.chatMessages.add(docMessage);

      // Seed settings canary to ensure token exclusion invariant holds
      await sourceDb.settings.put({
        key: 'knowledge_server_token',
        value: 'secret-bearer-token-12345',
      });

      const envelope = await exportBackupPayload(sourceDb);
      const validation = validateBackupPayload(envelope);

      expect(validation.valid).toBe(true);
      expect(envelope.tables.chatThreads).toEqual([docThread]);
      expect(envelope.tables.chatMessages).toEqual([docMessage]);
      expect(JSON.stringify(envelope)).not.toContain('secret-bearer-token-12345');

      const preExistingThread: ChatThread = {
        id: DOC_THREAD_ID,
        scopeKey: `document:${NOTE_ID}`,
        scopeType: 'document',
        entityId: NOTE_ID,
        title: 'Original pre-restore thread',
        createdAt: NOW,
        updatedAt: NOW,
      };
      const preExistingMsg: ChatMessage = {
        id: DOC_MSG_ID,
        threadId: DOC_THREAD_ID,
        role: 'user',
        content: 'Original pre-restore content',
        createdAt: NOW,
      };

      await seedKnowledge(restoredDb, 'prior');
      await restoredDb.chatThreads.add(preExistingThread);
      await restoredDb.chatMessages.add(preExistingMsg);

      await restoreBackupPayload(envelope, restoredDb);

      const restoredThread = await restoredDb.chatThreads.get(DOC_THREAD_ID);
      const restoredMsg = await restoredDb.chatMessages.get(DOC_MSG_ID);

      expect(restoredThread).toEqual(docThread);
      expect(restoredMsg).toEqual(docMessage);

      await rollbackToSnapshot(restoredDb);

      const rolledBackThread = await restoredDb.chatThreads.get(DOC_THREAD_ID);
      const rolledBackMsg = await restoredDb.chatMessages.get(DOC_MSG_ID);

      expect(rolledBackThread?.title).toBe('Original pre-restore thread');
      expect(rolledBackMsg?.content).toBe('Original pre-restore content');
    });
  });
});
