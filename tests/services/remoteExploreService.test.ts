// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EXPLORE_DEFAULT_MAX_TURNS,
  EXPLORE_MAX_TURNS_CAP,
  EXPLORE_REPORT_MAX_CHARS,
  buildExploreCommand,
  parseExploreResult,
  runRemoteExplore,
  type ExploreRequest,
} from '../../src/services/remoteExploreService';
import type { SshConfig, SshStreamEvent, SshStreamExitEvent } from '../../src/types/ssh';

const CONFIG: SshConfig = {
  id: 'cfg-1',
  name: 'Dev',
  host: '10.0.0.5',
  port: 22,
  username: 'git',
  authType: 'password',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const request = (overrides: Partial<ExploreRequest> = {}): ExploreRequest => ({
  repoPath: '/srv/repo',
  question: 'Luồng đơn hàng đi qua những module nào?',
  model: 'haiku',
  maxTurns: 20,
  ...overrides,
});

/** The exact adversarial payload from the git_read escaping cases. */
const EVIL = `"'; $(rm -rf /); echo '`;

afterEach(() => {
  vi.useRealTimers();
});

describe('buildExploreCommand (43-04 D-03)', () => {
  it('escapes every model-supplied value — whole string pinned, no containment check', () => {
    const cmd = buildExploreCommand(
      request({ question: EVIL, model: EVIL, repoPath: EVIL })
    );

    // Pinned to a literal, independent of `escapeShellArg`, so a builder that interpolates a raw
    // value produces a different string and fails here.
    // `escapeShellArg` output for EVIL, pinned literally and independent of the function.
    const q = `'"'\\''; $(rm -rf /); echo '\\'''`;
    expect(cmd).toBe(
      `cd ${q} && claude -p ${q} --output-format json --allowedTools Read,Grep,Glob ` +
        `--model ${q} --max-turns 20 --no-session-persistence --append-system-prompt ` +
        `'Bạn đang đọc một repository trên chính máy này để trả lời một câu hỏi về mã nguồn.\n` +
        `Chỉ kết luận từ những tệp bạn thực sự đã đọc; không suy đoán về tệp chưa mở.\n` +
        `Mỗi phát hiện phải kèm vị trí dạng đường/dẫn/tệp:dòng.\n` +
        `Cuối báo cáo liệt kê: (1) các tệp đã đọc, (2) những gì chưa kiểm chứng được.\n` +
        `Toàn bộ câu trả lời dưới 1500 từ. Xuất văn bản thuần, không dùng bảng markdown.'`
    );
  });

  it('clamps maxTurns to the cap and floors below 1', () => {
    expect(buildExploreCommand(request({ maxTurns: 999 }))).toContain(
      `--max-turns ${EXPLORE_MAX_TURNS_CAP} `
    );
    expect(buildExploreCommand(request({ maxTurns: 0 }))).toContain('--max-turns 1 ');
    expect(buildExploreCommand(request({ maxTurns: -5 }))).toContain('--max-turns 1 ');
    expect(buildExploreCommand(request({ maxTurns: Number.NaN }))).toContain(
      `--max-turns ${EXPLORE_DEFAULT_MAX_TURNS} `
    );
  });

  it('carries the tool allow-list, JSON output and no session persistence', () => {
    const cmd = buildExploreCommand(request());
    expect(cmd).toContain('--allowedTools Read,Grep,Glob');
    expect(cmd).toContain('--no-session-persistence');
    expect(cmd).toContain('--output-format json');
    // `timeout(1)` is absent on stock macOS — the bound lives on the JS side.
    expect(cmd).not.toContain('timeout ');
  });
});

describe('parseExploreResult (43-04 D-03)', () => {
  it('returns the result text of a success payload', () => {
    const out = parseExploreResult(
      JSON.stringify({ is_error: false, result: 'Báo cáo: src/app.ts:12 là điểm vào.' })
    );
    expect(out).toEqual({
      report: 'Báo cáo: src/app.ts:12 là điểm vào.',
      truncated: false,
      outcome: 'success',
    });
  });

  it('prefers structured_output when it is a string', () => {
    const out = parseExploreResult(
      JSON.stringify({ is_error: false, result: 'raw', structured_output: 'đã phân tích' })
    );
    expect(out.report).toBe('đã phân tích');
  });

  it('reports max-turns when the CLI exhausted its budget', () => {
    const out = parseExploreResult(
      JSON.stringify({
        is_error: true,
        subtype: 'error_max_turns',
        result: null,
        errors: ['hit the turn limit'],
      })
    );
    expect(out.outcome).toBe('max-turns');
    expect(out.report).toBe('');
    expect(out.detail).toBe('hit the turn limit');
  });

  it('reports error with the subtype when there are no error strings', () => {
    const out = parseExploreResult(JSON.stringify({ is_error: true, subtype: 'error_during_execution' }));
    expect(out.outcome).toBe('error');
    expect(out.detail).toBe('error_during_execution');
  });

  it('caps an oversized report and marks it truncated', () => {
    const out = parseExploreResult(
      JSON.stringify({ is_error: false, result: 'x'.repeat(EXPLORE_REPORT_MAX_CHARS + 500) })
    );
    expect(out.report).toHaveLength(EXPLORE_REPORT_MAX_CHARS);
    expect(out.truncated).toBe(true);
  });

  it('returns raw text with an error outcome when stdout is not JSON', () => {
    const out = parseExploreResult('claude: command not found\n');
    expect(out).toEqual({
      report: 'claude: command not found',
      truncated: false,
      outcome: 'error',
      detail: 'unparseable-output',
    });
  });
});

describe('runRemoteExplore (43-04 D-03)', () => {
  it('resolves with the parsed report on exit and leaves no timer pending', async () => {
    vi.useFakeTimers();

    const cancel = vi.fn(async () => {});
    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        onData: (e: SshStreamEvent) => void,
        onExit: (e: SshStreamExitEvent) => void
      ) => {
        // The CLI prints ONE JSON object; a line-streamed transport delivers it as one line.
        onData({ sessionId: 's', stream: 'stdout', line: '{"is_error":false,"result":"xong"}' });
        onExit({ sessionId: 's', exitStatus: 0, error: null });
        return cancel;
      }
    );

    const outcome = await runRemoteExplore(CONFIG, undefined, request(), { stream });

    expect(outcome).toEqual({ report: 'xong', truncated: false, outcome: 'success' });
    expect(vi.getTimerCount()).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('bounds a stream that never exits, cancels it, and reports timeout', async () => {
    vi.useFakeTimers();

    const cancel = vi.fn(async () => {});
    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        onData: (e: SshStreamEvent) => void
      ) => {
        onData({ sessionId: 's', stream: 'stdout', line: 'một phần báo cáo' });
        return cancel;
      }
    );

    const pending = runRemoteExplore(CONFIG, undefined, request(), { stream });
    // Let the stream handle resolve before the wall clock fires.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300_000);

    const outcome = await pending;
    expect(outcome.outcome).toBe('error');
    expect(outcome.detail).toBe('timeout');
    expect(outcome.report).toBe('một phần báo cáo');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps a timeout report at the same budget as a parsed one', async () => {
    vi.useFakeTimers();

    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        onData: (e: SshStreamEvent) => void
      ) => {
        // Never exits and never prints JSON: the raw stream is all the caller will get.
        onData({ sessionId: 's', stream: 'stdout', line: 'y'.repeat(EXPLORE_REPORT_MAX_CHARS * 3) });
        return async () => {};
      }
    );

    const pending = runRemoteExplore(CONFIG, undefined, request(), { stream });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300_000);

    const outcome = await pending;
    expect(outcome.detail).toBe('timeout');
    expect(outcome.report).toHaveLength(EXPLORE_REPORT_MAX_CHARS);
    expect(outcome.truncated).toBe(true);
  });

  it('cancels a process whose stream handle resolves after the timeout', async () => {
    vi.useFakeTimers();

    const cancel = vi.fn(async () => {});
    let releaseHandle: ((handle: () => Promise<void>) => void) | undefined;
    const stream = vi.fn(
      () =>
        new Promise<() => Promise<void>>((resolve) => {
          releaseHandle = resolve;
        })
    );

    const pending = runRemoteExplore(CONFIG, undefined, request(), { stream });
    // SSH connect still in flight when the wall clock fires.
    await vi.advanceTimersByTimeAsync(300_000);
    expect((await pending).detail).toBe('timeout');

    releaseHandle!(cancel);
    await vi.advanceTimersByTimeAsync(0);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns a non-zero exit with no stdout into an error carrying stderr', async () => {
    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        onData: (e: SshStreamEvent) => void,
        onExit: (e: SshStreamExitEvent) => void
      ) => {
        onData({ sessionId: 's', stream: 'stderr', line: 'claude: not found' });
        onExit({ sessionId: 's', exitStatus: 127, error: null });
        return async () => {};
      }
    );

    const outcome = await runRemoteExplore(CONFIG, undefined, request(), { stream });
    expect(outcome.outcome).toBe('error');
    expect(outcome.detail).toBe('claude: not found');
    expect(outcome.report).toBe('');
  });
});
