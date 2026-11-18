/**
 * Runtime-only structured telemetry for every agent/leader tool call.
 *
 * ADDITIVE OBSERVATION ONLY: this module writes no Dexie rows, changes no abort/timeout/retry
 * behavior, and never feeds a decision. It reuses the existing `structuredLog('TOOL', ...)`
 * substrate (src/services/ai/log.ts) so logs keep one redaction path and one correlation-id
 * scheme. The in-flight bookkeeping lives in the coordinator, not here.
 */
import { createCorrelationId, structuredLog, type LogLevel } from '../log';

/** Abort sources map 1:1 onto existing stop reasons + the two dispose causes + normal turn end. */
export type ToolCallAbortSource =
  | 'user-per-agent'
  | 'user-abort'
  | 'team-deleted'
  | 'app-exit'
  | 'tool-limit'
  | 'leader-amend'
  | 'turn-end';

export type ToolTelemetryPhase = 'call' | 'result' | 'abort';
export type ToolTelemetryOutcome = 'running' | 'done' | 'error' | 'aborted';
export type ToolTelemetryAgentKind = 'lead' | 'employee';

/** One structured log line for one tool call. All optional fields use explicit `| undefined`. */
export interface ToolCallTelemetryEvent {
  ts: string;
  teamId: string;
  agentId: string;
  agentKind: ToolTelemetryAgentKind;
  toolCallId: string;
  toolName: string;
  phase: ToolTelemetryPhase;
  outcome: ToolTelemetryOutcome;
  durationMs?: number | undefined;
  errorCode?: string | undefined;
  errorDetail?: string | undefined;
  abortSource?: ToolCallAbortSource | undefined;
  correlationId?: string | undefined;
}

export interface ToolTelemetryInput {
  teamId: string;
  agentId: string;
  agentKind: ToolTelemetryAgentKind;
  toolCallId: string;
  toolName: string;
  phase: ToolTelemetryPhase;
  outcome: ToolTelemetryOutcome;
  durationMs?: number | undefined;
  errorCode?: string | undefined;
  errorDetail?: string | undefined;
  abortSource?: ToolCallAbortSource | undefined;
  correlationId?: string | undefined;
  /** Deterministic timestamp seam for tests; the production default is `new Date()`. */
  timestamp?: string | undefined;
}

export interface ParsedToolTelemetry {
  outcome: 'done' | 'error';
  errorCode?: string | undefined;
  errorDetail?: string | undefined;
}

const CODE_CAP = 300;
const DETAIL_CAP = 300;

/** Bound log fields so a long provider string cannot flood the structured log. */
function cap(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, limit);
}

/**
 * Derives error metadata from a tool result string with the same semantics as the coordinator's
 * `deriveToolStatus`: unparseable/plain text is success; `refused:true`, a truthy `error`, or
 * `outcome:'error'` is an error. `code`/`detail` are bounded; never throws.
 */
export function parseToolTelemetry(result: string | undefined): ParsedToolTelemetry {
  if (result === undefined) return { outcome: 'done' };
  try {
    const payload: unknown = JSON.parse(result);
    if (payload === null || typeof payload !== 'object') return { outcome: 'done' };
    const record = payload as Record<string, unknown>;
    if (record['refused'] === true || record['error'] || record['outcome'] === 'error') {
      const code = cap(record['code'], CODE_CAP);
      const detail = cap(record['detail'], DETAIL_CAP);
      return {
        outcome: 'error',
        ...(code !== undefined ? { errorCode: code } : {}),
        ...(detail !== undefined ? { errorDetail: detail } : {}),
      };
    }
    return { outcome: 'done' };
  } catch {
    return { outcome: 'done' };
  }
}

/** Build a fully-formed entry with an injectable timestamp. No side effects. */
export function buildToolTelemetryEvent(input: ToolTelemetryInput): ToolCallTelemetryEvent {
  return {
    ts: input.timestamp ?? new Date().toISOString(),
    teamId: input.teamId,
    agentId: input.agentId,
    agentKind: input.agentKind,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    phase: input.phase,
    outcome: input.outcome,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    ...(input.errorDetail !== undefined ? { errorDetail: input.errorDetail } : {}),
    ...(input.abortSource !== undefined ? { abortSource: input.abortSource } : {}),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
  };
}

const structuredEvent = 'agent_tool_call';

/** Emit one existing-substrate `TOOL` log line; returns the entry (or null if suppressed). */
export function emitToolTelemetry(
  event: ToolCallTelemetryEvent
): ReturnType<typeof structuredLog> {
  const level: LogLevel = event.outcome === 'error' || event.outcome === 'aborted' ? 'error' : 'info';
  const correlationId = event.correlationId ?? createCorrelationId();
  return structuredLog('TOOL', level, correlationId, structuredEvent, {
    ...event,
    correlationId,
  });
}
