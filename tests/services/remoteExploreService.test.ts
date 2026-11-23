// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EXPLORE_DEFAULT_MAX_TURNS,
  EXPLORE_MAX_TURNS_CAP,
  EXPLORE_REPORT_MAX_CHARS,
  buildExploreCommand,
  REMOTE_CLAUDE_AUTH_SETTINGS,
  SSH_TRANSPORT_RETRY_ATTEMPTS,
  SSH_TRANSPORT_RETRY_BACKOFF_MS,
  isTransientSshTransportError,
  parseExploreResult,
  probeRemoteClaude,
  resetRemoteClaudeProbeCache,
  runRemoteExplore,
  type ExploreRequest,
} from '../../src/services/remoteExploreService';
import type { SshConfig, SshStreamEvent, SshStreamExitEvent } from '../../src/types/ssh';
import type { execRemoteCommand } from '../../src/services/sshService';

/** A typed exec mock factory (vitest 5's vi.fn generic is the function signature). */
type ExecFn = typeof execRemoteCommand;
const execMock = () => vi.fn<ExecFn>();

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
      `cd -- ${q} && claude -p --output-format json --restricted ` +
        `--settings ${REMOTE_CLAUDE_AUTH_SETTINGS} ` +
        `--allowedTools Read,Grep,Glob --model ${q} --max-turns 20 --no-session-persistence ` +
        `--append-system-prompt ` +
        `'Bạn đang đọc một repository trên chính máy này để trả lời một câu hỏi về mã nguồn.\n` +
        `Chỉ kết luận từ những tệp bạn thực sự đã đọc; không suy đoán về tệp chưa mở.\n` +
        `Mỗi phát hiện phải kèm vị trí dạng đường/dẫn/tệp:dòng.\n` +
        `Cuối báo cáo liệt kê: (1) các tệp đã đọc, (2) những gì chưa kiểm chứng được.\n` +
        `Toàn bộ câu trả lời dưới 1500 từ. Xuất văn bản thuần, không dùng bảng markdown.' ` +
        `-- ${q}`
    );
  });

  it('runs restricted so repo settings cannot grant Bash and reads stay in the repo', () => {
    const cmd = buildExploreCommand(request());

    // Verified against the real CLI. Without `--restricted`: a repo `.claude/settings.json`
    // with `permissions.allow: ["Bash"]` executed `touch pwned.txt`, and `Read /etc/passwd`
    // returned the file. With it, both are refused and Read/Grep/Glob still work.
    expect(cmd).toContain('--restricted');
    expect(cmd).not.toContain('--disallowedTools');
  });

  it('forwards the remote user settings env block into restricted mode via --settings', () => {
    const cmd = buildExploreCommand(request());

    // --restricted ignores user settings, so the credentials in ~/.claude/settings.json's `env`
    // block would otherwise be invisible and the run would say "Not logged in" on a host where
    // interactive claude works. --settings is the one source restricted mode still honours.
    expect(cmd).toContain(`--settings ${REMOTE_CLAUDE_AUTH_SETTINGS}`);
    // Extraction is a remote shell command substitution that reads the settings file and emits
    // only { env: ... }. It never forwards the whole file (which can carry bypassPermissions).
    expect(REMOTE_CLAUDE_AUTH_SETTINGS).toContain('settings.json');
    expect(REMOTE_CLAUDE_AUTH_SETTINGS).toContain('process.env.CLAUDE_CONFIG_DIR');
    expect(REMOTE_CLAUDE_AUTH_SETTINGS).toContain('JSON.stringify({env:e})');
    expect(REMOTE_CLAUDE_AUTH_SETTINGS).toContain(`echo '{}'`);
    // The substitution is shell syntax, not a single-quoted literal argument.
    expect(REMOTE_CLAUDE_AUTH_SETTINGS.startsWith('"$(node -e ')).toBe(true);
  });

  it('puts the prompt after -- so a question beginning with "-" is not an option', () => {
    const cmd = buildExploreCommand(request({ question: '--output-format text' }));

    // `claude -p '--output-format text'` fails with "unknown option"; `--` ends flag parsing.
    expect(cmd.endsWith(`-- '--output-format text'`)).toBe(true);
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

describe('no explore timeout (tool-lifecycle contract)', () => {
  it('exports no timeout bounds and no timeout clamp', async () => {
    const mod = await import('../../src/services/remoteExploreService');
    expect('clampExploreTimeoutSeconds' in mod).toBe(false);
    expect('EXPLORE_DEFAULT_TIMEOUT_MS' in mod).toBe(false);
    expect('EXPLORE_MIN_TIMEOUT_SECONDS' in mod).toBe(false);
    expect('EXPLORE_MAX_TIMEOUT_SECONDS' in mod).toBe(false);
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

  it('maps the raw "Not logged in" text to a truthful, actionable refusal', () => {
    const out = parseExploreResult(
      JSON.stringify({
        is_error: true,
        subtype: 'success',
        result: 'Not logged in · Please run /login',
      })
    );
    expect(out.outcome).toBe('error');
    // Do not tell an owner whose interactive claude already works to run /login.
    expect(out.detail).toContain('REMOTE_CLAUDE_NOT_AUTHENTICATED');
    expect(out.detail).toContain('settings.json');
    expect(out.detail).toContain('ANTHROPIC_AUTH_TOKEN');
    expect(out.detail).toMatch(/no \/login is needed/i);
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

  it('never ends a stream that runs past any elapsed time: only explicit abort cancels', async () => {
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
    const controller = new AbortController();

    const pending = runRemoteExplore(CONFIG, undefined, request(), { stream, signal: controller.signal });
    let settled = false;
    void pending.then(() => { settled = true; });
    // No time source exists in the implementation; no timer can settle this promise.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(cancel).not.toHaveBeenCalled();

    controller.abort();
    const outcome = await pending;
    expect(outcome.detail).toBe('aborted');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('uses the model call id as the ssh stream session id so cancel targets the right task', async () => {
    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        _onData: (e: SshStreamEvent) => void,
        onExit: (e: SshStreamExitEvent) => void
      ) => {
        onExit({ sessionId: 's', exitStatus: 0, error: null });
        return async () => {};
      }
    );
    await runRemoteExplore(CONFIG, undefined, request(), { stream, callId: 'call-model-42' });
    expect(stream.mock.calls.at(-1)?.[2]).toBe('call-model-42');
  });

  it('cancels a process whose stream handle resolves after an explicit abort', async () => {
    const cancel = vi.fn(async () => {});
    let releaseHandle: ((handle: () => Promise<void>) => void) | undefined;
    const stream = vi.fn(
      () =>
        new Promise<() => Promise<void>>((resolve) => {
          releaseHandle = resolve;
        })
    );
    const controller = new AbortController();

    const pending = runRemoteExplore(CONFIG, undefined, request(), { stream, signal: controller.signal });
    controller.abort();
    expect((await pending).detail).toBe('aborted');

    releaseHandle!(cancel);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('caches a positive probe but re-probes a negative one', async () => {
    resetRemoteClaudeProbeCache();
    const exec = vi.fn(async () => ({ stdout: '', stderr: '', exitStatus: 1 }));

    expect(await probeRemoteClaude(CONFIG, undefined, { exec })).toBe(false);
    // The refusal tells the user to install the CLI; a cached negative would keep refusing
    // after they did, until a reload.
    expect(await probeRemoteClaude(CONFIG, undefined, { exec })).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2);

    exec.mockResolvedValue({ stdout: '', stderr: '', exitStatus: 0 });
    expect(await probeRemoteClaude(CONFIG, undefined, { exec })).toBe(true);
    expect(await probeRemoteClaude(CONFIG, undefined, { exec })).toBe(true);
    expect(exec).toHaveBeenCalledTimes(3);
    resetRemoteClaudeProbeCache();
  });

  it('retries an unknown (-1) probe instead of reporting the CLI as missing', async () => {
    resetRemoteClaudeProbeCache();
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitStatus: -1 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitStatus: 0 });

    expect(await probeRemoteClaude(CONFIG, undefined, { exec })).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
    resetRemoteClaudeProbeCache();
  });

  it('caps an oversized stderr detail on a failed run', async () => {
    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        onData: (e: SshStreamEvent) => void,
        onExit: (e: SshStreamExitEvent) => void
      ) => {
        onData({ sessionId: 's', stream: 'stderr', line: 'e'.repeat(EXPLORE_REPORT_MAX_CHARS * 2) });
        onExit({ sessionId: 's', exitStatus: 1, error: null });
        return async () => {};
      }
    );

    const outcome = await runRemoteExplore(CONFIG, undefined, request(), { stream });
    // `detail` reaches the caller's context too, so the same budget applies to it.
    expect(outcome.detail).toHaveLength(EXPLORE_REPORT_MAX_CHARS);
    expect(outcome.truncated).toBe(true);
  });

  it('cancels the remote process and resolves when the turn is aborted', async () => {
    const cancel = vi.fn(async () => {});
    const stream = vi.fn(
      async (
        _config: SshConfig,
        _command: string,
        _sessionId: string,
        onData: (e: SshStreamEvent) => void
      ) => {
        onData({ sessionId: 's', stream: 'stdout', line: 'một phần' });
        return cancel;
      }
    );
    const controller = new AbortController();

    const pending = runRemoteExplore(CONFIG, undefined, request(), {
      stream,
      signal: controller.signal,
    });
    // Let the stream handle resolve before aborting.
    await Promise.resolve();
    controller.abort();
    const outcome = await pending;
    expect(outcome.detail).toBe('aborted');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('never opens a stream when the turn is already aborted', async () => {
    const stream = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const outcome = await runRemoteExplore(CONFIG, undefined, request(), {
      stream,
      signal: controller.signal,
    });

    expect(outcome.detail).toBe('aborted');
    expect(stream).not.toHaveBeenCalled();
  });

  describe('transient SSH transport retry (handshake KEX abort)', () => {
    const HANDSHAKE_ERR = new Error(
      'SSH handshake thất bại: [Session(-8)] Unable to exchange encryption keys'
    );
    const noSleep = async () => {};

    it('classifies the real libssh2 KEX abort and its transport siblings as transient', () => {
      expect(isTransientSshTransportError(HANDSHAKE_ERR)).toBe(true);
      expect(isTransientSshTransportError(new Error('[Session(-8)] Unable to exchange encryption keys'))).toBe(true);
      expect(isTransientSshTransportError(new Error('Khởi tạo SSH session thất bại: boom'))).toBe(true);
      expect(isTransientSshTransportError(new Error('Kết nối TCP tới host:22 thất bại (timeout 10s)'))).toBe(true);
      expect(isTransientSshTransportError(new Error('Không thể mở channel session: x'))).toBe(true);
    });

    it('does NOT classify deterministic auth/CLI/command errors as transient', () => {
      expect(isTransientSshTransportError(new Error('Xác thực mật khẩu thất bại'))).toBe(false);
      expect(isTransientSshTransportError(new Error('Xác thực khóa riêng tư thất bại'))).toBe(false);
      expect(isTransientSshTransportError(new Error('Not logged in · Please run /login'))).toBe(false);
      expect(isTransientSshTransportError(new Error('claude: command not found'))).toBe(false);
      expect(isTransientSshTransportError(new Error('some remote command error'))).toBe(false);
      // Integrity failures must not be retried even though they carry a Session(-N) code.
      expect(isTransientSshTransportError(new Error('[Session(-4)] Invalid MAC'))).toBe(false);
      expect(isTransientSshTransportError('')).toBe(false);
    });

    it('probeRemoteClaude recovers when the first handshake aborts', async () => {
      resetRemoteClaudeProbeCache();
      const exec = execMock()
        .mockRejectedValueOnce(HANDSHAKE_ERR)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitStatus: 0 });

      expect(await probeRemoteClaude(CONFIG, undefined, { exec, sleep: noSleep })).toBe(true);
      expect(exec).toHaveBeenCalledTimes(SSH_TRANSPORT_RETRY_ATTEMPTS);
    });

    it('probeRemoteClaude stops after the bounded attempts on a persistent handshake fault', async () => {
      resetRemoteClaudeProbeCache();
      const exec = execMock()
        .mockRejectedValue(HANDSHAKE_ERR);

      await expect(probeRemoteClaude(CONFIG, undefined, { exec, sleep: noSleep })).rejects.toThrow(
        /Unable to exchange encryption keys/
      );
      expect(exec).toHaveBeenCalledTimes(SSH_TRANSPORT_RETRY_ATTEMPTS);
      resetRemoteClaudeProbeCache();
    });

    it('probeRemoteClaude never retries a deterministic auth failure', async () => {
      resetRemoteClaudeProbeCache();
      const exec = execMock()
        .mockRejectedValue(new Error('Xác thực mật khẩu thất bại'));

      await expect(probeRemoteClaude(CONFIG, undefined, { exec, sleep: noSleep })).rejects.toThrow(
        /thất bại/
      );
      expect(exec).toHaveBeenCalledTimes(1);
      resetRemoteClaudeProbeCache();
    });

    it('runRemoteExplore retries a first-attempt handshake abort and returns the real report', async () => {
      let attempt = 0;
      const stream = vi.fn(
        async (
          _config: SshConfig,
          _command: string,
          _sessionId: string,
          onData: (e: SshStreamEvent) => void,
          onExit: (e: SshStreamExitEvent) => void
        ) => {
          attempt++;
          if (attempt === 1) throw HANDSHAKE_ERR;
          onData({ sessionId: 's', stream: 'stdout', line: '{"is_error":false,"result":"xong"}' });
          onExit({ sessionId: 's', exitStatus: 0, error: null });
          return async () => {};
        }
      );

      const outcome = await runRemoteExplore(CONFIG, undefined, request(), { stream, sleep: noSleep });

      expect(outcome).toEqual({ report: 'xong', truncated: false, outcome: 'success' });
      expect(stream).toHaveBeenCalledTimes(SSH_TRANSPORT_RETRY_ATTEMPTS);
      // Retried stream uses the same session id so listeners/cancel stay consistent.
      const ids = stream.mock.calls.map((c) => c[2]);
      expect(ids[0]).toBe(ids[1]);
    });

    it('runRemoteExplore surfaces the last handshake error after bounded retries', async () => {
      const stream = vi.fn(async () => {
        throw HANDSHAKE_ERR;
      });

      const outcome = await runRemoteExplore(CONFIG, undefined, request(), { stream, sleep: noSleep });

      expect(outcome.outcome).toBe('error');
      expect(outcome.detail).toMatch(/Unable to exchange encryption keys/);
      expect(stream).toHaveBeenCalledTimes(SSH_TRANSPORT_RETRY_ATTEMPTS);
    });

    it('runRemoteExplore does not retry a deterministic remote error', async () => {
      const stream = vi.fn(async () => {
        throw new Error('Xác thực mật khẩu thất bại');
      });

      const outcome = await runRemoteExplore(CONFIG, undefined, request(), { stream, sleep: noSleep });

      expect(outcome.outcome).toBe('error');
      expect(outcome.detail).toMatch(/thất bại/);
      expect(stream).toHaveBeenCalledTimes(1);
    });

    it('backs off once between the two bounded attempts', async () => {
      resetRemoteClaudeProbeCache();
      const sleep = vi.fn(async () => {});
      const exec = execMock()
        .mockRejectedValueOnce(HANDSHAKE_ERR)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitStatus: 0 });

      await probeRemoteClaude(CONFIG, undefined, { exec, sleep });

      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(SSH_TRANSPORT_RETRY_BACKOFF_MS);
      resetRemoteClaudeProbeCache();
    });
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
