import { describe, expect, it, vi } from 'vitest';
import { AttemptService, SetPublishInProgressError } from '../src/services/attemptService.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';

const SET_A = '11111111-1111-4111-8111-111111111111';
const SET_B = '22222222-2222-4222-8222-222222222222';
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function payload(body = '## Flow\n\nSafe body\n') {
  return {
    setName: 'Pilot',
    documents: [{ documentId: DOC_A, title: 'Flow', body, tags: ['pilot'] }],
  };
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('AttemptService', () => {
  it('returns same attempt after response loss without duplicate candidate', async () => {
    const blocker = gate();
    const store = new SnapshotStore();
    const service = new AttemptService(store, { beforeProject: () => blocker.promise });

    const first = service.accept(SET_A, 'retry-key', payload());
    const replay = service.accept(SET_A, 'retry-key', payload());
    expect(replay.attemptId).toBe(first.attemptId);
    expect(store.listCandidates(SET_A)).toHaveLength(1);
    blocker.release();
    await service.waitForAttempt(first.attemptId);
  });

  it('rejects another key for same set while different sets run concurrently', async () => {
    const blocker = gate();
    const service = new AttemptService(new SnapshotStore(), {
      beforeProject: () => blocker.promise,
    });

    service.accept(SET_A, 'a-1', payload());
    expect(() => service.accept(SET_A, 'a-2', payload())).toThrowError(
      SetPublishInProgressError
    );
    expect(() => service.accept(SET_B, 'b-1', payload())).not.toThrow();
    blocker.release();
    await Promise.all(service.listAttempts().map((attempt) => service.waitForAttempt(attempt.attemptId)));
  });

  it('deep-copies and freezes accepted input against caller mutation', async () => {
    const blocker = gate();
    const service = new AttemptService(new SnapshotStore(), {
      beforeProject: () => blocker.promise,
    });
    const mutable = payload();
    const attempt = service.accept(SET_A, 'immutable', mutable);

    mutable.setName = 'Changed';
    mutable.documents[0]!.title = 'Changed';
    mutable.documents[0]!.body = 'secret mutation';
    mutable.documents[0]!.tags!.push('changed');

    expect(service.getAcceptedInput(attempt.attemptId).setName).toBe('Pilot');
    expect(service.getAcceptedInput(attempt.attemptId).documents[0]!.body).toBe('## Flow\n\nSafe body\n');
    expect(Object.isFrozen(service.getAcceptedInput(attempt.attemptId).documents[0]!.tags)).toBe(true);
    blocker.release();
    await service.waitForAttempt(attempt.attemptId);
  });

  it('retains active snapshot and safe failed candidate when one document fails', async () => {
    const store = new SnapshotStore();
    const secret = 'token-super-secret';
    const service = new AttemptService(store, {
      beforeDocument(document) {
        if (document.documentId === DOC_B) {
          throw Object.assign(new Error(secret), { documentId: DOC_B });
        }
      },
    });
    const baseline = service.accept(SET_A, 'baseline', payload());
    await service.waitForAttempt(baseline.attemptId);
    const activeBefore = structuredClone(service.getActiveSnapshot(SET_A));
    const failing = service.accept(SET_A, 'failure', {
      setName: 'Pilot',
      documents: [
        ...payload('## Flow\n\nChanged\n').documents,
        { documentId: DOC_B, title: 'Broken', body: `## Broken\n\n${secret}`, tags: [] },
      ],
    });
    await service.waitForAttempt(failing.attemptId);

    expect(service.getActiveSnapshot(SET_A)).toEqual(activeBefore);
    expect(service.getAttempt(failing.attemptId)?.status).toBe('Failed');
    expect(JSON.stringify(service.getAttempt(failing.attemptId))).not.toContain(secret);
    expect(JSON.stringify(store.listCandidates(SET_A))).not.toContain(secret);
  });

  it('promotes once after all documents succeed and exposes no cancellation', async () => {
    const store = new SnapshotStore();
    const promote = vi.spyOn(store, 'promoteCandidate');
    const service = new AttemptService(store);
    const accepted = service.accept(SET_A, 'success', payload());
    await service.waitForAttempt(accepted.attemptId);

    expect(promote).toHaveBeenCalledTimes(1);
    expect(service.getAttempt(accepted.attemptId)?.status).toBe('In sync');
    expect(service.getActiveSnapshot(SET_A)?.snapshotId).toBeDefined();
    expect('cancel' in service).toBe(false);
    expect('cancelAttempt' in service).toBe(false);
  });
});
