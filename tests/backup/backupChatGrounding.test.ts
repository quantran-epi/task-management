// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import { restoreBackupPayload } from '../../src/services/backup/restoreBackup';
import { BackupChatMessageRecordSchema } from '../../src/validation/backupSchemas';
import { createOrGetThread, saveMessage, getMessagesByThreadId } from '../../src/db/repositories/chatRepo';
import type { ChatMessageGrounding, PersistedCitation } from '../../src/services/ai/groundedAnswerSchemas';
import { generateId } from '../../src/utils/uuid';

describe('Backup Chat Grounding (Plan 19-10 Task 2, D-46, D-48)', () => {
  let db: TaskPlannerDatabase;
  const dbName = 'TestBackupChatGroundingDB_' + Math.random().toString(36).slice(2);

  const localCitation: PersistedCitation = {
    citationId: 'L1',
    documentId: generateId(),
    documentTitle: 'Huong dan thanh toan',
    sectionAnchor: 'section-overview',
    lineStart: 1,
    lineEnd: 5,
    authority: 'local',
    evidenceClass: 'LOCAL',
    snapshotId: null,
    publishedContentHash: null,
    citedExcerpt: 'Huong dan tich hop API thanh toan truc tuyen.',
  };

  const validLocalGrounding: ChatMessageGrounding = {
    schemaVersion: 1,
    authority: 'local',
    outcome: 'LOCAL_FALLBACK_SYNTHESIS',
    answer: {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Trich dan tu he thong thanh toan.',
      claims: [
        {
          id: 'C1',
          text: 'Trich dan tu he thong thanh toan.',
          classification: 'DIRECT',
          citationIds: ['L1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    },
    citations: [localCitation],
    paths: null,
    conflicts: null,
    scope: null,
    modalityDiagnostics: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
      graph: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
    },
    coverageWarnings: [],
    fallbackReason: 'SERVER_ABSENT',
    routerVersion: null,
    promptVersion: 'grounded-v1',
    modelId: 'gpt-4o-mini',
    createdAt: '2026-10-11T12:00:00.000Z',
  };

  const validServerGrounding: ChatMessageGrounding = {
    schemaVersion: 1,
    authority: 'server',
    outcome: 'READY',
    answer: {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Giai doan thanh toan duoc chung thuc.',
      claims: [
        {
          id: 'C1',
          text: 'Giai doan thanh toan duoc chung thuc.',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    },
    citations: [
      {
        citationId: 'S1',
        documentId: generateId(),
        documentTitle: 'SIT Environment Specs',
        sectionAnchor: 'arch',
        lineStart: 10,
        lineEnd: 15,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'gsnap_abcdef0123',
        publishedContentHash: 'a'.repeat(64),
        citedExcerpt: 'He thong chay tren moi truong SIT.',
      },
    ],
    paths: [],
    conflicts: [],
    scope: {
      setIds: [generateId()],
      routedScope: {
        domain: 'CARD_SYSTEM',
        environment: 'SIT',
        version: null,
        comparisonMode: 'single',
      },
    },
    modalityDiagnostics: {
      fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
      vector: { status: 'ok', latencyMs: 12, itemCount: 1 },
      graph: { status: 'ok', latencyMs: 18, itemCount: 1 },
    },
    coverageWarnings: [],
    fallbackReason: 'NONE',
    routerVersion: 'v1.0.0',
    promptVersion: 'grounded-v1',
    modelId: 'gpt-4o',
    createdAt: '2026-10-11T12:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('1. Round-trip: export a ChatMessage with full grounding -> parse via BackupChatMessageRecordSchema -> restore round-trips grounding', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, db);
    const saved = await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Noi dung co grounded',
        grounding: validLocalGrounding,
      },
      db
    );

    const backupPayload = await exportBackupPayload(db);
    expect(backupPayload.tables.chatMessages).toBeDefined();
    const exportedMsg = backupPayload.tables.chatMessages?.find((m) => m.id === saved.id);
    expect(exportedMsg).toBeDefined();
    expect(exportedMsg?.grounding).toEqual(validLocalGrounding);

    // Schema parse
    const parseResult = BackupChatMessageRecordSchema.safeParse(exportedMsg);
    expect(parseResult.success).toBe(true);

    // Validate overall backup payload
    const validation = validateBackupPayload(backupPayload);
    expect(validation.valid).toBe(true);

    // Restore to fresh DB
    const restoreDbName = 'TestRestoreChatGroundingDB_' + Math.random().toString(36).slice(2);
    const restoreDb = new TaskPlannerDatabase(restoreDbName);
    await restoreDb.open();
    try {
      await restoreBackupPayload(backupPayload, restoreDb);
      const restoredMessages = await getMessagesByThreadId(thread.id, restoreDb);
      expect(restoredMessages).toHaveLength(1);
      expect(restoredMessages[0]?.grounding).toEqual(validLocalGrounding);
    } finally {
      await restoreDb.delete();
    }
  });

  it('2. Export rejects grounding with 21 citations -> safeParse fails with GROUNDING_SIZE_EXCEEDED', () => {
    const citations: PersistedCitation[] = [];
    for (let i = 1; i <= 21; i++) {
      citations.push({
        ...localCitation,
        citationId: `L${i}`,
      });
    }

    const oversizedGrounding = {
      ...validLocalGrounding,
      citations,
    };

    const msg = {
      id: generateId(),
      threadId: generateId(),
      role: 'assistant' as const,
      content: 'Cau tra loi',
      createdAt: '2026-10-11T12:00:00.000Z',
      grounding: oversizedGrounding,
    };

    const result = BackupChatMessageRecordSchema.safeParse(msg);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message.includes('GROUNDING_SIZE_EXCEEDED')
      );
      expect(issue).toBeDefined();
    }
  });

  it('3. Export rejects grounding with a citation citedExcerpt of 2501 chars', () => {
    const longCitation: PersistedCitation = {
      ...localCitation,
      citedExcerpt: 'A'.repeat(2501),
    };

    const invalidGrounding = {
      ...validLocalGrounding,
      citations: [longCitation],
    };

    const msg = {
      id: generateId(),
      threadId: generateId(),
      role: 'assistant' as const,
      content: 'Cau tra loi',
      createdAt: '2026-10-11T12:00:00.000Z',
      grounding: invalidGrounding,
    };

    const result = BackupChatMessageRecordSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('4. Export rejects grounding containing a nested apiKey key anywhere -> safeParse fails with FORBIDDEN_FIELD', () => {
    const leakedGrounding = {
      ...validLocalGrounding,
      modalityDiagnostics: {
        ...validLocalGrounding.modalityDiagnostics,
        apiKey: 'secret-leaked-key-12345',
      },
    };

    const msg = {
      id: generateId(),
      threadId: generateId(),
      role: 'assistant' as const,
      content: 'Cau tra loi',
      createdAt: '2026-10-11T12:00:00.000Z',
      grounding: leakedGrounding,
    };

    const result = BackupChatMessageRecordSchema.safeParse(msg);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message.includes('FORBIDDEN_FIELD')
      );
      expect(issue).toBeDefined();
    }
  });

  it('5. Export rejects nested bearerToken key in deeply nested shape', () => {
    const leakedGrounding = {
      ...validLocalGrounding,
      citations: [
        {
          ...localCitation,
          bearerToken: 'Bearer eyJhbGciOi...',
        },
      ],
    };

    const msg = {
      id: generateId(),
      threadId: generateId(),
      role: 'assistant' as const,
      content: 'Cau tra loi',
      createdAt: '2026-10-11T12:00:00.000Z',
      grounding: leakedGrounding,
    };

    const result = BackupChatMessageRecordSchema.safeParse(msg);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.message.includes('FORBIDDEN_FIELD')
      );
      expect(issue).toBeDefined();
    }
  });

  it('6. Backup payload with absent grounding round-trips through the schema (backward compatible with pre-19 backups)', () => {
    const msgWithoutGrounding = {
      id: generateId(),
      threadId: generateId(),
      role: 'user' as const,
      content: 'Tin nhan khong co grounding tu pre-19',
      createdAt: '2026-10-01T12:00:00.000Z',
    };

    const result = BackupChatMessageRecordSchema.safeParse(msgWithoutGrounding);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grounding).toBeUndefined();
    }
  });

  it('7. Backup payload with local-authority grounding (null snapshotId per citation) parses success', () => {
    const msg = {
      id: generateId(),
      threadId: generateId(),
      role: 'assistant' as const,
      content: 'Tra loi local',
      createdAt: '2026-10-11T12:00:00.000Z',
      grounding: validLocalGrounding,
    };

    const result = BackupChatMessageRecordSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('8. Backup payload with server-authority grounding missing publishedContentHash on any citation fails', () => {
    const invalidServerGrounding = {
      ...validServerGrounding,
      citations: [
        {
          ...validServerGrounding.citations[0]!,
          publishedContentHash: null,
        },
      ],
    };

    const msg = {
      id: generateId(),
      threadId: generateId(),
      role: 'assistant' as const,
      content: 'Tra loi server thieu hash',
      createdAt: '2026-10-11T12:00:00.000Z',
      grounding: invalidServerGrounding,
    };

    const result = BackupChatMessageRecordSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});
