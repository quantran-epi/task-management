import { describe, it, expect } from 'vitest';
import {
  extractMessageText,
  shouldCompactThread,
} from '../../src/services/ai/contextCompaction';
import type { ChatMessage } from '../../src/types/models';

describe('contextCompaction', () => {
  it('extracts plain content from text messages', () => {
    const msg: ChatMessage = {
      id: '1',
      threadId: 't1',
      role: 'user',
      content: 'Hello TaskMate',
      createdAt: '2026-10-17T00:00:00Z',
    };
    expect(extractMessageText(msg)).toBe('Hello TaskMate');
  });

  it('extracts grounded conclusion and claims if content is empty', () => {
    const msg: ChatMessage = {
      id: '2',
      threadId: 't1',
      role: 'assistant',
      content: '',
      createdAt: '2026-10-17T00:00:00Z',
      grounding: {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 2,
          language: 'vi',
          conclusion: 'Quy trình tính phí 60000006 hoàn tất.',
          confidence: 'high',
          confidenceReason: 'Bằng chứng đầy đủ',
          claims: [
            {
              id: 'C1',
              text: 'Bước 1 xác thực container',
              classification: 'DIRECT',
              citationIds: ['S1'],
              pathId: null,
            },
          ],
          hypotheses: [],
          unsupportedParts: [],
        },
        citations: [],
        paths: [],
        conflicts: [],
        scope: { setIds: [], routedScope: { domain: null, environment: null, version: null, comparisonMode: null } },
        modalityDiagnostics: { fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 }, vector: { status: 'ok', latencyMs: 0, itemCount: 0 }, graph: { status: 'ok', latencyMs: 0, itemCount: 0 } },
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: 'router-v1',
        promptVersion: 'grounded-v1',
        modelId: 'gpt-4o',
        createdAt: '2026-10-17T00:00:00Z',
      },
    };

    const extracted = extractMessageText(msg);
    expect(extracted).toContain('Quy trình tính phí 60000006 hoàn tất.');
    expect(extracted).toContain('Bước 1 xác thực container');
  });

  it('detects when thread exceeds message threshold and needs compaction', async () => {
    const mockDb: any = {
      chatMessages: {
        where: () => ({
          equals: () => ({
            sortBy: async () => {
              const msgs: ChatMessage[] = [];
              for (let i = 0; i < 20; i++) {
                msgs.push({
                  id: `m-${i}`,
                  threadId: 't1',
                  role: i % 2 === 0 ? 'user' : 'assistant',
                  content: `Message ${i} content`,
                  createdAt: `2026-10-17T00:${i < 10 ? '0' + i : i}:00Z`,
                });
              }
              return msgs;
            },
          }),
        }),
      },
    };

    const res = await shouldCompactThread('t1', mockDb, {
      triggerMessageThreshold: 10,
      keepRecentCount: 4,
    });

    expect(res.needed).toBe(true);
    expect(res.messagesToCompact.length).toBe(16);
    expect(res.messagesToKeep.length).toBe(4);
  });
});
