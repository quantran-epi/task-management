// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  saveMessage,
  getMessagesByThreadId,
  createOrGetThread,
} from '../../src/db/repositories/chatRepo';
import type { ChatMessageGrounding } from '../../src/services/ai/groundedAnswerSchemas';
import { generateId } from '../../src/utils/uuid';

describe('chatRepo Grounding Persistence (Plan 19-10 Task 1, D-46)', () => {
  let testDb: TaskPlannerDatabase;

  const validLocalGrounding: ChatMessageGrounding = {
    schemaVersion: 1,
    authority: 'local',
    outcome: 'LOCAL_FALLBACK_SYNTHESIS',
    answer: {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Tài liệu hướng dẫn xử lý giao dịch.',
      claims: [
        {
          id: 'C1',
          text: 'Tài liệu hướng dẫn xử lý giao dịch.',
          classification: 'DIRECT',
          citationIds: ['L1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    },
    citations: [
      {
        citationId: 'L1',
        documentId: generateId(),
        documentTitle: 'Huong dan he thong',
        sectionAnchor: 'section-1',
        lineStart: 10,
        lineEnd: 20,
        authority: 'local',
        evidenceClass: 'LOCAL',
        snapshotId: null,
        publishedContentHash: null,
        citedExcerpt: 'Noi dung trich doan tai lieu he thong.',
      },
    ],
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
    createdAt: '2026-10-11T10:00:00.000Z',
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestChatRepoGroundingDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('1. saveMessage with grounding then loadThread returns identical grounding object (deep equal)', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);
    const saved = await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Day la cau tra loi.',
        grounding: validLocalGrounding,
      },
      testDb
    );

    expect(saved.grounding).toEqual(validLocalGrounding);

    const messages = await getMessagesByThreadId(thread.id, testDb);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.grounding).toEqual(validLocalGrounding);
  });

  it('2. saveMessage without grounding leaves field absent on reload (no undefined key added)', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);
    await saveMessage(
      {
        threadId: thread.id,
        role: 'user',
        content: 'Cau hoi cua nguoi dung',
      },
      testDb
    );

    const messages = await getMessagesByThreadId(thread.id, testDb);
    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg).toBeDefined();
    expect('grounding' in (msg as object)).toBe(false);
  });

  it('3. Malformed grounding (missing required schemaVersion) throws INVALID_GROUNDING', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);
    const malformed = {
      ...validLocalGrounding,
      schemaVersion: undefined,
    } as unknown as ChatMessageGrounding;

    await expect(
      saveMessage(
        {
          threadId: thread.id,
          role: 'assistant',
          content: 'Noi dung loi',
          grounding: malformed,
        },
        testDb
      )
    ).rejects.toMatchObject({
      code: 'INVALID_GROUNDING',
    });
  });

  it('4. Dexie db.verno after module load equals the existing V10 version — no bump', async () => {
    expect(testDb.verno).toBe(10);
  });

  it('5. Multiple messages per thread: order preserved, each retains own grounding', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);

    const userMsg = await saveMessage(
      {
        threadId: thread.id,
        role: 'user',
        content: 'Cau hoi 1',
      },
      testDb
    );
    await new Promise((r) => setTimeout(r, 5));

    const assistantMsg1 = await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Tra loi 1',
        grounding: validLocalGrounding,
      },
      testDb
    );
    await new Promise((r) => setTimeout(r, 5));

    const secondGrounding: ChatMessageGrounding = {
      ...validLocalGrounding,
      promptVersion: 'grounded-v2',
      citations: [
        {
          ...validLocalGrounding.citations[0]!,
          citationId: 'L2',
          citedExcerpt: 'Excerpt for second message',
        },
      ],
    };

    const assistantMsg2 = await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Tra loi 2',
        grounding: secondGrounding,
      },
      testDb
    );

    const messages = await getMessagesByThreadId(thread.id, testDb);
    expect(messages).toHaveLength(3);
    expect(messages[0]?.id).toBe(userMsg.id);
    expect('grounding' in (messages[0] as object)).toBe(false);
    expect(messages[1]?.id).toBe(assistantMsg1.id);
    expect(messages[1]?.grounding).toEqual(validLocalGrounding);
    expect(messages[2]?.id).toBe(assistantMsg2.id);
    expect(messages[2]?.grounding).toEqual(secondGrounding);
  });

  it('6. Grounding with citedExcerpt string of 1200 chars round-trips lossless (D-48 bound)', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, testDb);
    const longExcerpt = 'X'.repeat(1200);
    const groundingWithLongExcerpt: ChatMessageGrounding = {
      ...validLocalGrounding,
      citations: [
        {
          ...validLocalGrounding.citations[0]!,
          citedExcerpt: longExcerpt,
        },
      ],
    };

    await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Noi dung dai',
        grounding: groundingWithLongExcerpt,
      },
      testDb
    );

    const messages = await getMessagesByThreadId(thread.id, testDb);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.grounding?.citations[0]?.citedExcerpt).toBe(longExcerpt);
    expect(messages[0]?.grounding?.citations[0]?.citedExcerpt.length).toBe(1200);
  });
});
