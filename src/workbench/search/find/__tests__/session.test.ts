import { describe, expect, it, vi } from 'vitest';
import {
  FIND_DEBOUNCE_MS,
  FIND_MATCH_LIMIT,
  FIND_STATUS_COPY,
  FindSession,
  isCancelledError,
  type FindState,
  type GrepResult,
  type RemoteQuery,
} from '../session';

const query: RemoteQuery = {
  pattern: 'needle',
  mode: 'content',
  scope: 'whole-ref',
  matchCase: false,
  words: false,
  regex: false,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function hit(path: string, line: number) {
  return { path, line, text: `text ${path} ${line}` };
}

function makeDeps(startImpl: (callId: string) => Promise<GrepResult>) {
  const cancel = vi.fn(async (_callId: string): Promise<void> => undefined);
  const start = vi.fn(async (callId: string, _q: RemoteQuery) => startImpl(callId));
  let id = 0;
  return {
    start,
    cancel,
    nextRequestId: vi.fn(() => `call-${++id}`),
  };
}

describe('FindSession — tracer correctness backbone (D-08/D-10)', () => {
  it('exports the shared caps and single-source copy', () => {
    expect(FIND_MATCH_LIMIT).toBe(2000);
    expect(FIND_DEBOUNCE_MS).toBe(150);
    expect(FIND_STATUS_COPY.partial).toBe('Stopped — showing partial results.');
  });

  it('(d) a plain resolve commits hits verbatim with stale=false', async () => {
    const result: GrepResult = { hits: [hit('a.ts', 1), hit('b.ts', 9)], truncated: false };
    const deps = makeDeps(async () => result);
    const seen: FindState[] = [];
    const session = new FindSession(deps, (s) => seen.push(s));

    await session.search(query);

    expect(session.getState()).toEqual({
      status: 'done',
      stale: false,
      hits: result.hits,
      truncated: false,
      error: null,
    });
    // Hits are committed verbatim — no re-parsing, no raw stdout, no ranges field.
    expect(session.getState().hits[0]).toEqual(hit('a.ts', 1));
    expect(seen.some((s) => s.status === 'searching' && s.stale)).toBe(true);
  });

  it('(a) a stale response never overwrites current results; second search sets stale immediately', async () => {
    const first = deferred<GrepResult>();
    const second = deferred<GrepResult>();
    const deps = makeDeps((callId) => (callId === 'call-1' ? first.promise : second.promise));
    const seen: FindState[] = [];
    const session = new FindSession(deps, (s) => seen.push(s));

    const p1 = session.search(query);
    const p2 = session.search({ ...query, pattern: 'newer' });
    expect(seen.some((s) => s.stale && s.status === 'searching')).toBe(true);

    second.resolve({ hits: [hit('new.ts', 2)], truncated: false });
    await p2;
    first.resolve({ hits: [hit('old.ts', 1)], truncated: false });
    await p1;

    const state = session.getState();
    expect(state.hits).toEqual([hit('new.ts', 2)]);
    expect(state.hits.some((h) => h.path === 'old.ts')).toBe(false);
    expect(state.stale).toBe(false);
  });

  it('(b) cancel keeps hits collected so far and maps a cancel rejection to partial', async () => {
    const pending = deferred<GrepResult>();
    const first = deferred<GrepResult>();
    const deps = makeDeps((callId) => (callId === 'call-1' ? first.promise : pending.promise));
    const session = new FindSession(deps);

    // Seed hits via a first completed run.
    const seedP = session.search(query);
    first.resolve({ hits: [hit('before-cancel.ts', 7)], truncated: false });
    await seedP;

    const p = session.search({ ...query, pattern: 'stop-me' });
    session.cancel();
    pending.reject(new Error('tool call cancelled by user'));
    await p;

    expect(session.getState().status).toBe('partial');
    expect(session.getState().hits).toEqual([hit('before-cancel.ts', 7)]);
    expect(deps.cancel).toHaveBeenCalled();
  });

  it('(c) a non-cancel error surfaces a truthful error message', async () => {
    const deps = makeDeps(async () => {
      throw new Error('ssh channel dropped');
    });
    const session = new FindSession(deps);
    await session.search(query);
    expect(session.getState().status).toBe('error');
    expect(session.getState().error).toBe(FIND_STATUS_COPY.error('ssh channel dropped'));
  });

  it('(e) invalidate() sets stale immediately without clearing hits', async () => {
    const deps = makeDeps(async () => ({ hits: [hit('x.ts', 1)], truncated: false }));
    const session = new FindSession(deps);
    await session.search(query);
    const hitsBefore = session.getState().hits;

    session.invalidate();

    expect(session.getState().stale).toBe(true);
    expect(session.getState().hits).toBe(hitsBefore); // same reference — nothing cleared
  });

  it('recognises cancel-shaped and abort-shaped errors only', () => {
    expect(isCancelledError(new Error('cancelled'))).toBe(true);
    expect(isCancelledError(new Error('AbortError: aborted'))).toBe(true);
    expect(isCancelledError(new Error('network failure'))).toBe(false);
    expect(isCancelledError(null)).toBe(false);
  });
});
