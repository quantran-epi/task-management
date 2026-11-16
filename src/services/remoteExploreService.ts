import { execRemoteCommand, execRemoteCommandStream } from './sshService';
import { escapeShellArg } from './gitRemoteService';
import type { SshConfig } from '../types/ssh';

/**
 * Phase 43 D-03: the second read tier. `git_read` puts file contents into the CALLING model's
 * context; for a broad "understand this subsystem" question that is the expensive shape. Here a
 * model with its own context window does the reading on the remote host and returns only
 * conclusions, capped.
 *
 * Everything in this module is pure or takes an injected function, so the command shape, the
 * parser and the timeout are provable without SSH.
 *
 * Ceiling: the remote CLI's own `--max-turns` is the only server-side bound; `timeout(1)` is not
 * portable to stock macOS, so the wall clock is enforced here and cancelled through the stream
 * handle. A wedged remote process the SSH layer cannot kill still strands the turn.
 */

export const EXPLORE_REPORT_MAX_CHARS = 12_000;
export const EXPLORE_DEFAULT_TIMEOUT_MS = 300_000;
export const EXPLORE_DEFAULT_MAX_TURNS = 20;
export const EXPLORE_MAX_TURNS_CAP = 40;

/** A runaway remote cannot exhaust memory: the line buffer stops at 4× the report cap. */
const STREAM_BUFFER_MAX_CHARS = EXPLORE_REPORT_MAX_CHARS * 4;

export interface ExploreRequest {
  repoPath: string;
  question: string;
  model: string;
  maxTurns: number;
}

export interface ExploreOutcome {
  report: string;
  truncated: boolean;
  /** 'success' | 'max-turns' | 'error' — what the remote run actually did. */
  outcome: 'success' | 'max-turns' | 'error';
  detail?: string;
}

/**
 * The report contract handed to the remote model. It is a system prompt, not data: it must make
 * the report citable and small, because the cap below is what keeps this tier cheaper than the
 * reads it replaces.
 */
const REPORT_CONTRACT = [
  'Bạn đang đọc một repository trên chính máy này để trả lời một câu hỏi về mã nguồn.',
  'Chỉ kết luận từ những tệp bạn thực sự đã đọc; không suy đoán về tệp chưa mở.',
  'Mỗi phát hiện phải kèm vị trí dạng đường/dẫn/tệp:dòng.',
  'Cuối báo cáo liệt kê: (1) các tệp đã đọc, (2) những gì chưa kiểm chứng được.',
  'Toàn bộ câu trả lời dưới 1500 từ. Xuất văn bản thuần, không dùng bảng markdown.',
].join('\n');

/** Clamps a caller-supplied turn budget into the advertised range. */
export function clampExploreMaxTurns(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return EXPLORE_DEFAULT_MAX_TURNS;
  return Math.min(Math.max(1, n), EXPLORE_MAX_TURNS_CAP);
}

/**
 * One shell string, every model-supplied value escaped. `--allowedTools` is a technical
 * requirement, not a security posture: a headless `-p` run that reaches for a tool outside the
 * set blocks on a permission prompt nobody can answer.
 *
 * The prompt goes after `--`: `escapeShellArg` protects the shell, not argv parsing, and a
 * question beginning with `-` is otherwise read by the CLI as an option (`claude -p '--x'`
 * fails with "unknown option"). `--` is last because everything after it is positional.
 */
export function buildExploreCommand(request: ExploreRequest): string {
  return [
    `cd ${escapeShellArg(request.repoPath)} &&`,
    'claude -p',
    '--output-format json',
    '--allowedTools Read,Grep,Glob',
    '--model',
    escapeShellArg(request.model),
    '--max-turns',
    String(clampExploreMaxTurns(request.maxTurns)),
    '--no-session-persistence',
    '--append-system-prompt',
    escapeShellArg(REPORT_CONTRACT),
    '--',
    escapeShellArg(request.question),
  ].join(' ');
}

function capReport(outcome: ExploreOutcome): ExploreOutcome {
  if (outcome.report.length <= EXPLORE_REPORT_MAX_CHARS) return outcome;
  return {
    ...outcome,
    report: outcome.report.slice(0, EXPLORE_REPORT_MAX_CHARS),
    truncated: true,
  };
}

function joinErrors(errors: unknown): string {
  if (!Array.isArray(errors)) return '';
  return errors
    .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' ? JSON.stringify(e) : ''))
    .filter((s) => s !== '')
    .join('; ');
}

/**
 * Parses the ONE JSON object `claude -p --output-format json` prints. The object may be
 * pretty-printed or preceded by progress lines, so try the whole payload first and then the last
 * non-empty line.
 */
export function parseExploreResult(stdout: string): ExploreOutcome {
  const trimmed = stdout.trim();
  const lastLine = trimmed.split('\n').filter((line) => line.trim() !== '').at(-1) ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      // Raw text is still useful to the caller, so it is returned rather than discarded.
      return capReport({
        report: trimmed,
        truncated: false,
        outcome: 'error',
        detail: 'unparseable-output',
      });
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return capReport({
      report: trimmed,
      truncated: false,
      outcome: 'error',
      detail: 'unparseable-output',
    });
  }

  const obj = parsed as Record<string, unknown>;
  const result = typeof obj.result === 'string' ? obj.result : '';

  if (obj.is_error === true) {
    const detail = joinErrors(obj.errors) || (typeof obj.subtype === 'string' ? obj.subtype : '');
    return capReport({
      report: result,
      truncated: false,
      outcome: obj.subtype === 'error_max_turns' ? 'max-turns' : 'error',
      ...(detail ? { detail } : {}),
    });
  }

  const report = typeof obj.structured_output === 'string' ? obj.structured_output : result;
  return capReport({ report, truncated: false, outcome: 'success' });
}

const probeCache = new Set<string>();

/** Tests only: the cache is per SSH profile and would otherwise leak between cases. */
export function resetRemoteClaudeProbeCache(): void {
  probeCache.clear();
}

/**
 * Configuration fact, not a bad argument: a remote without the CLI must refuse before a stream is
 * opened. Only a POSITIVE answer is cached, per `sshConfig.id`: the refusal tells the user to
 * install the CLI, and a cached negative would keep refusing after they did, until a reload.
 */
export async function probeRemoteClaude(
  config: SshConfig,
  secret?: string,
  deps?: { exec?: typeof execRemoteCommand }
): Promise<boolean> {
  const cached = probeCache.has(config.id);
  if (cached) return true;

  const exec = deps?.exec ?? execRemoteCommand;
  const res = await exec(config, 'command -v claude >/dev/null 2>&1', secret);
  const available = res.exitStatus === 0;
  // A transport failure throws above and is deliberately NOT cached — it says nothing about
  // whether the CLI is installed.
  if (available) probeCache.add(config.id);
  return available;
}

export interface RunRemoteExploreDeps {
  stream?: typeof execRemoteCommandStream;
  now?: () => number;
}

/**
 * Runs the explore command and bounds it on this side. The remote may lack `timeout(1)`, so the
 * wall clock lives here and cancels through the handle the stream returns.
 */
export async function runRemoteExplore(
  config: SshConfig,
  secret: string | undefined,
  request: ExploreRequest,
  deps: RunRemoteExploreDeps = {}
): Promise<ExploreOutcome> {
  const stream = deps.stream ?? execRemoteCommandStream;
  const command = buildExploreCommand(request);
  const sessionId = crypto.randomUUID();

  let stdout = '';
  let stderr = '';
  let overflowed = false;
  let settled = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => Promise<void>) | undefined;

  return new Promise<ExploreOutcome>((resolve) => {
    const finish = (outcome: ExploreOutcome) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(overflowed ? { ...outcome, truncated: true } : outcome);
    };

    const onData = (event: { stream: 'stdout' | 'stderr'; line: string }) => {
      if (settled) return;
      if (event.stream === 'stderr') {
        if (stderr.length < STREAM_BUFFER_MAX_CHARS) stderr += `${event.line}\n`;
        return;
      }
      if (stdout.length >= STREAM_BUFFER_MAX_CHARS) {
        overflowed = true;
        return;
      }
      stdout += `${event.line}\n`;
    };

    const onExit = (event: { exitStatus: number; error: string | null }) => {
      if (settled) return;
      if (event.exitStatus !== 0 && stdout.trim() === '') {
        finish({
          report: '',
          truncated: false,
          outcome: 'error',
          detail: stderr.trim() || event.error || `exit ${event.exitStatus}`,
        });
        return;
      }
      finish(parseExploreResult(stdout));
    };

    timer = setTimeout(() => {
      // The remote is wedged: kill it, keep whatever arrived, and never hang the turn.
      timedOut = true;
      void cancel?.().catch(() => undefined);
      // Same cap as the parsed path: a wedged remote that streamed 48k must not hand the
      // calling model 4× the report budget just because it never printed valid JSON.
      finish(
        capReport({
          report: stdout.trim(),
          truncated: false,
          outcome: 'error',
          detail: 'timeout',
        })
      );
    }, EXPLORE_DEFAULT_TIMEOUT_MS);

    void (async () => {
      try {
        const handle = await stream(config, command, sessionId, onData, onExit, secret);
        cancel = handle;
        // The wall clock can fire while the SSH connect is still in flight; the process it
        // would have killed is now live and nothing else would ever cancel it.
        if (timedOut) await handle().catch(() => undefined);
      } catch (err: any) {
        finish({
          report: '',
          truncated: false,
          outcome: 'error',
          detail: err?.message || String(err),
        });
      }
    })();
  });
}
