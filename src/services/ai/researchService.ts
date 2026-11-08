import { z } from 'zod';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSystem } from '../../db/repositories/systemRepo';
import type { SshConfig } from '../../types/ssh';
import { getSshConfigById, execRemoteCommandStream, testSshConnection } from '../sshService';
import { saveResearchArtifact } from '../wizard/artifactRepo';
import { defaultSha256 } from '../wizard/workflowCoordinator';

// -------------------------------------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------------------------------------

export const ResearchFindingSchema = z.object({
  claim: z.string().min(1),
  scope: z.enum(['web', 'repo']),
  systemCode: z.string().optional(),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1).default(1),
});

export const SkippedSystemSchema = z.object({
  systemId: z.string().min(1),
  code: z.string().min(1),
  reason: z.string().min(1),
});

export const ResearchPayloadSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(ResearchFindingSchema),
  skippedSystems: z.array(SkippedSystemSchema).optional(),
  rawOutput: z.string().optional(),
});

export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;
export type SkippedSystem = z.infer<typeof SkippedSystemSchema>;
export type ResearchPayload = z.infer<typeof ResearchPayloadSchema>;

// -------------------------------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------------------------------

export type ResearchErrorCode =
  | 'RESEARCH_UNAVAILABLE'
  | 'RESEARCH_TIMEOUT'
  | 'RESEARCH_CANCELLED'
  | 'RESEARCH_SSH_ERROR';

export class ResearchRunError extends Error {
  readonly code: ResearchErrorCode;

  constructor(code: ResearchErrorCode, message: string) {
    super(message);
    this.name = 'ResearchRunError';
    this.code = code;
  }
}

// -------------------------------------------------------------------------------------------------
// Shell escaping (T-32-03)
// -------------------------------------------------------------------------------------------------

/**
 * Wrap `arg` in single quotes and escape embedded quotes as `'\''`, so shell
 * metacharacters stay literal. Used for both prompt text and remote repo paths.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// -------------------------------------------------------------------------------------------------
// Output parsing (T-32-05)
// -------------------------------------------------------------------------------------------------

/** Return the first balanced `{ ... }` substring, ignoring braces inside JSON strings. */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * `claude -p --output-format json` wraps the model's answer in a result
 * envelope: `{"type":"result","is_error":false,"result":"<model text>",...}`.
 * The payload lives inside `result`, so the envelope must be unwrapped before
 * schema validation — otherwise every real run degrades to zero findings.
 */
const CliResultEnvelopeSchema = z.object({
  type: z.literal('result'),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
});

/** Split raw output into the JSON fragments worth trying, most specific first. */
function extractCandidates(raw: string): string[] {
  const candidates: string[] = [];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const balanced = extractBalancedObject(raw);
  if (balanced) candidates.push(balanced);

  candidates.push(raw.trim());
  return candidates;
}

function parseCandidates(candidates: string[], allowEnvelope: boolean): ResearchPayload | null {
  for (const candidate of candidates) {
    if (!candidate) continue;

    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      continue; // Not JSON — fall through to the next candidate.
    }

    const direct = ResearchPayloadSchema.safeParse(json);
    if (direct.success) return direct.data;

    if (!allowEnvelope) continue;

    const envelope = CliResultEnvelopeSchema.safeParse(json);
    if (!envelope.success || typeof envelope.data.result !== 'string') continue;
    if (envelope.data.is_error) continue; // An error envelope carries no payload.

    const inner = parseCandidates(extractCandidates(envelope.data.result), false);
    if (inner) return inner;
  }

  return null;
}

/**
 * Recover a research payload from model output. Tries a fenced ```json block,
 * then the first balanced object, then the raw text — and unwraps the Claude CLI
 * result envelope when present. Never throws: unparseable output degrades to
 * inert `rawOutput` text rather than fabricated claims.
 */
export function parseResearchOutput(raw: string): ResearchPayload {
  const payload = parseCandidates(extractCandidates(raw), true);
  if (payload) return payload;

  return { summary: raw.slice(0, 2000), findings: [], rawOutput: raw };
}

// -------------------------------------------------------------------------------------------------
// Availability pre-flight (SDLC-RES-05)
// -------------------------------------------------------------------------------------------------

export interface ResearchAvailability {
  systemId: string;
  code: string;
  available: boolean;
  reason?: 'NO_SSH_CONFIG' | 'UNREACHABLE';
}

/**
 * Report per-system research availability. Never throws for a single bad
 * target: a missing system, a missing SSH config, or an unreachable host is
 * recorded with an explicit reason instead of being silently dropped.
 */
export async function checkResearchAvailability(
  targetSystemIds: string[],
  db: TaskPlannerDatabase = defaultDb,
): Promise<ResearchAvailability[]> {
  const results: ResearchAvailability[] = [];

  for (const systemId of targetSystemIds) {
    let code = systemId;

    try {
      const system = await getSystem(systemId, db);
      if (!system) {
        results.push({ systemId, code, available: false, reason: 'NO_SSH_CONFIG' });
        continue;
      }

      code = system.code;

      if (!system.sshConfigId) {
        results.push({ systemId, code, available: false, reason: 'NO_SSH_CONFIG' });
        continue;
      }

      const config = await getSshConfigById(system.sshConfigId, db);
      if (!config) {
        results.push({ systemId, code, available: false, reason: 'NO_SSH_CONFIG' });
        continue;
      }

      await testSshConnection(config);
      results.push({ systemId, code, available: true });
    } catch {
      results.push({ systemId, code, available: false, reason: 'UNREACHABLE' });
    }
  }

  return results;
}

// -------------------------------------------------------------------------------------------------
// Prompt, remote command, and report rendering (D-04, D-13, T-32-03, T-32-04)
// -------------------------------------------------------------------------------------------------

const READ_ONLY_TOOLS = 'Glob,Grep,Read';
const READ_ONLY_WEB_TOOLS = 'WebSearch,WebFetch,Glob,Grep,Read';

/** Prompt sent to the remote headless CLI: strict JSON, read-only, scoped to one system. */
export function buildResearchPrompt(questions: string[], systemCode: string): string {
  return [
    `Bạn đang nghiên cứu mã nguồn của hệ thống "${systemCode}" trong repository hiện tại.`,
    'Trả lời các câu hỏi sau bằng cách đọc code trong repo (và tìm kiếm web nếu được phép):',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    '',
    'QUY TẮC BẮT BUỘC:',
    '- KHÔNG được sửa, tạo, hay xóa bất kỳ file nào. Chỉ đọc.',
    '- KHÔNG được chạy lệnh git ghi (commit, push, checkout).',
    '- Chỉ xuất ra MỘT đối tượng JSON hợp lệ, không kèm văn bản nào khác.',
    '',
    'Định dạng JSON đầu ra:',
    '{"summary":"tóm tắt ngắn","findings":[{"claim":"kết luận","scope":"web"|"repo","source":"URL hoặc đường dẫn file","confidence":0.0}]}',
  ].join('\n');
}

/**
 * The only place the remote command string is built, so it stays unit-testable.
 *
 * `exec` sits on `claude`, never on `cd`: `cd` is a shell builtin, so `exec cd …`
 * would replace the shell and exit before the rest of the list runs. With `exec`
 * on `claude` the PID from `echo $$` becomes the claude process, so
 * `ssh_kill_process` signals the real process and no child is orphaned (D-02).
 *
 * No nested shell layer: `channel.exec` already runs this through the remote
 * login shell, and a nested shell invocation would be cut short by the single
 * quotes `escapeShellArg` emits (T-32-03).
 */
export function buildResearchCommand(
  remoteRepoPath: string,
  prompt: string,
  includeWeb: boolean,
): string {
  const tools = includeWeb ? READ_ONLY_WEB_TOOLS : READ_ONLY_TOOLS;
  return `cd ${escapeShellArg(remoteRepoPath || '.')} && exec claude -p ${escapeShellArg(prompt)} --output-format json --allowedTools ${tools}`;
}

function findingTag(finding: ResearchFinding): string {
  return finding.scope === 'web'
    ? '[EXTERNAL:WEB]'
    : `[EXTERNAL:REPO:${finding.systemCode ?? 'UNKNOWN'}]`;
}

/** Markdown report persisted as the RESEARCH artifact body. */
export function renderResearchMarkdown(payload: ResearchPayload): string {
  const lines = ['# External Research Report', '', '## Summary', '', payload.summary, ''];

  lines.push('## Findings', '');
  if (payload.findings.length === 0) {
    lines.push('_No structured findings._', '');
  } else {
    for (const finding of payload.findings) {
      lines.push(
        `- ${findingTag(finding)} ${finding.claim} — source: ${finding.source} (confidence: ${finding.confidence})`,
      );
    }
    lines.push('');
  }

  if (payload.skippedSystems && payload.skippedSystems.length > 0) {
    lines.push('## Skipped Systems', '');
    for (const skipped of payload.skippedSystems) {
      lines.push(`- ${skipped.code}: ${skipped.reason}`);
    }
    lines.push('');
  }

  if (payload.rawOutput) {
    lines.push('## Raw Output', '', '```', payload.rawOutput, '```', '');
  }

  return lines.join('\n');
}

// -------------------------------------------------------------------------------------------------
// Multi-system orchestrator (D-02, D-03, D-12, D-13, SDLC-RES-02/03/05)
// -------------------------------------------------------------------------------------------------

export interface ExecuteMultiSystemResearchOptions {
  changeRequestId: string;
  threadId: string;
  sessionId: string;
  targetSystemIds: string[];
  questions: string[];
  includeWeb?: boolean;
  onLog: (line: string) => void;
  db?: TaskPlannerDatabase;
  timeoutMs?: number;
  now?: () => string;
}

const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Run research sequentially across the available target systems.
 *
 * The cancel handle is part of the return value, never a side channel, and the
 * active stream handle is closure-local: a module-level handle would be
 * overwritten by a second concurrent run and `cancel()` would kill the wrong
 * remote process (D-02).
 */
export function executeMultiSystemResearch(
  options: ExecuteMultiSystemResearchOptions,
): { promise: Promise<ResearchPayload>; cancel: () => Promise<void> } {
  const db = options.db ?? defaultDb;
  const includeWeb = options.includeWeb !== false;

  // Closure-local, one per run.
  let cancelActive: (() => Promise<void>) | undefined;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveRun!: (value: ResearchPayload) => void;
  let rejectRun!: (error: unknown) => void;

  const promise = new Promise<ResearchPayload>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });

  const finishResolve = (value: ResearchPayload): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    resolveRun(value);
  };

  const finishReject = (error: unknown): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    rejectRun(error);
  };

  const stopRemote = async (): Promise<void> => {
    const handle = cancelActive;
    if (!handle) return;
    try {
      await handle();
    } catch {
      // The remote process may already be gone; cancellation is best-effort.
    }
  };

  timer = setTimeout(() => {
    finishReject(
      new ResearchRunError('RESEARCH_TIMEOUT', `Nghiên cứu vượt quá ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`),
    );
    void stopRemote();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  void (async () => {
    try {
      const availability = await checkResearchAvailability(options.targetSystemIds, db);
      if (settled) return;

      const skippedSystems: SkippedSystem[] = [];
      for (const entry of availability) {
        if (entry.available) continue;
        const reason = entry.reason ?? 'UNREACHABLE';
        skippedSystems.push({ systemId: entry.systemId, code: entry.code, reason });
        options.onLog(`Bỏ qua ${entry.code}: ${reason}`);
      }

      const runnable = availability.filter((entry) => entry.available);
      if (runnable.length === 0) {
        throw new ResearchRunError(
          'RESEARCH_UNAVAILABLE',
          'Không có hệ thống nào sẵn sàng cho nghiên cứu.',
        );
      }

      const findings: ResearchFinding[] = [];
      const summaries: string[] = [];
      let rawOutput: string | undefined;

      for (const entry of runnable) {
        if (settled) return;

        const system = await getSystem(entry.systemId, db);
        if (!system?.sshConfigId) continue;

        const sshConfig: SshConfig | null = await getSshConfigById(system.sshConfigId, db);
        if (!sshConfig) continue;

        options.onLog(`Bắt đầu nghiên cứu ${system.code}...`);

        const command = buildResearchCommand(system.remoteRepoPath || '.', buildResearchPrompt(options.questions, system.code), includeWeb);

        const lines: string[] = [];
        let exitResolve!: () => void;
        let exitReject!: (error: unknown) => void;
        const streamDone = new Promise<void>((resolve, reject) => {
          exitResolve = resolve;
          exitReject = reject;
        });

        try {
          cancelActive = await execRemoteCommandStream(
            sshConfig,
            command,
            options.sessionId,
            (event) => {
              lines.push(event.line);
              options.onLog(event.line);
            },
            (event) => {
              if (event.error) {
                exitReject(
                  new ResearchRunError(
                    'RESEARCH_SSH_ERROR',
                    `Kết nối SSH tới ${system.code} bị ngắt: ${event.error}`,
                  ),
                );
              } else if (event.exitStatus !== 0) {
                // A non-zero exit means the CLI failed; its stdout is not a report.
                exitReject(
                  new ResearchRunError(
                    'RESEARCH_SSH_ERROR',
                    `Lệnh nghiên cứu trên ${system.code} kết thúc với mã ${event.exitStatus}.`,
                  ),
                );
              } else {
                exitResolve();
              }
            },
          );
        } catch (error) {
          await stopRemote();
          throw new ResearchRunError(
            'RESEARCH_SSH_ERROR',
            `Không thể chạy nghiên cứu trên ${system.code}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await streamDone;
        if (settled) return;

        const parsed = parseResearchOutput(lines.join('\n'));
        summaries.push(parsed.summary);
        if (parsed.rawOutput) rawOutput = parsed.rawOutput;
        for (const finding of parsed.findings) {
          findings.push(
            finding.scope === 'repo' ? { ...finding, systemCode: system.code } : finding,
          );
        }
      }

      const payload: ResearchPayload = {
        summary: summaries.join('\n\n'),
        findings,
        ...(skippedSystems.length > 0 ? { skippedSystems } : {}),
        ...(rawOutput ? { rawOutput } : {}),
      };

      await saveResearchArtifact(
        {
          changeRequestId: options.changeRequestId,
          threadId: options.threadId,
          sessionId: options.sessionId,
          inputRevision: 0,
          draftRevision: 0,
          inputHash: await defaultSha256(JSON.stringify(payload)),
          markdown: renderResearchMarkdown(payload),
          exportPayload: payload,
          approvedAt: options.now?.() ?? new Date().toISOString(),
        },
        db,
      );

      finishResolve(payload);
    } catch (error) {
      finishReject(error);
    }
  })();

  const cancel = async (): Promise<void> => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    await stopRemote();
    rejectRun(new ResearchRunError('RESEARCH_CANCELLED', 'Nghiên cứu đã bị hủy.'));
  };

  return { promise, cancel };
}
