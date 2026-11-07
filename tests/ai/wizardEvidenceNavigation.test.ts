import { describe, expect, it, vi } from 'vitest';
import { collectWizardEvidence } from '../../src/services/ai/wizardService';
import { runLocalGroundedRetrieval } from '../../src/services/search/localGroundedRetrieval';
import * as bm25 from '../../src/utils/bm25';

// Model the view's cleanup: a new step aborts the previous collector while a note read is pending.
// No timing threshold or fake result: the final step uses real BM25, snippets and content hashes.
describe('SDLC rapid versus settled evidence navigation', () => {
  it('stops obsolete scans after their pending read, preserving final-step evidence', async () => {
    const rank = vi.spyOn(bm25, 'rankBM25');
    const controllers = Array.from({ length: 3 }, () => new AbortController());
    const reads: string[][] = [[], [], []];
    const release: Array<() => void> = [];
    const started: Array<() => void> = [];
    const firstReads = controllers.map((_, index) => new Promise<void>((resolve) => { started[index] = resolve; }));
    const note = { title: 'Architecture', body: '# Architecture\nNavigation evidence from approved design.' };
    const members = Array.from({ length: 4 }, (_, index) => ({ setId: 'set', setName: 'SDLC', documentId: `doc-${index}` }));
    const request = { changeRequestId: 'project', threadId: 'thread', sessionId: 'session', inputRevision: 1, query: 'architecture navigation', resolvedSetIds: ['set'] };
    try {
      const pending = [];
      for (let step = 0; step < 3; step += 1) {
        if (step > 0) controllers[step - 1]!.abort();
        // Catch immediately: cancelled collectors must reject, never publish empty/partial evidence.
        pending.push(collectWizardEvidence({ ...request, threadId: `thread-${step}`, signal: controllers[step]!.signal }, {
          runLocalBm25: (input) => runLocalGroundedRetrieval(input, {
            loadSetMembers: async () => members,
            loadNoteBody: async (id) => {
              reads[step]!.push(id);
              if (id === 'doc-0') {
                started[step]!();
                await new Promise<void>((resolve) => { release[step] = resolve; });
              }
              return note;
            },
          }),
        }).then((evidence) => ({ evidence }), (error: unknown) => ({ error })));
        await firstReads[step];
      }
      release.forEach((resolve) => resolve());
      const outcomes = await Promise.all(pending);
      const rapidRankCalls = rank.mock.calls.length;
      const settled = [];
      for (let step = 0; step < 3; step += 1) {
        settled.push(await collectWizardEvidence({ ...request, threadId: `thread-${step}` }, {
          runLocalBm25: (input) => runLocalGroundedRetrieval(input, {
            loadSetMembers: async () => members,
            loadNoteBody: async () => note,
          }),
        }));
      }
      console.log(JSON.stringify({ rapidReadsPerStep: reads.map((ids) => ids.length), rapidRankCalls, settledRankCalls: rank.mock.calls.length - rapidRankCalls }));
      expect(outcomes[0]).toMatchObject({ error: { code: 'ABORTED' } });
      expect(outcomes[1]).toMatchObject({ error: { code: 'ABORTED' } });
      expect(outcomes[2]).toEqual({ evidence: settled[2] });
      expect(settled.every((evidence) => evidence.items.length === 4)).toBe(true);
      expect(reads.map((ids) => ids.length)).toEqual([1, 1, 4]);
      expect(rapidRankCalls).toBe(1);
      expect(rank.mock.calls.length - rapidRankCalls).toBe(3);
    } finally {
      release.forEach((resolve) => resolve());
      rank.mockRestore();
    }
  });
});
