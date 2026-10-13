/**
 * Client-side structured logging substrate (Bug 5).
 *
 * Mirrors knowledge-server/src/logging/structured.ts so AI-chat failures can be traced by
 * correlation ID and phase tag across the browser pipeline. Replaces the scattered
 * console.log/console.warn/console.error calls that had no tags and no correlation ID.
 *
 * Phase tags:
 *   [ROUTE]     intent / scope routing decisions
 *   [RETRIEVE]  knowledge retrieval (federated / local BM25)
 *   [TOOL]      operational tool-loop turns
 *   [SYNTHESIS] grounded answer synthesis
 *   [PUBLISH]   graph publish/rebuild triggered from the client
 */
export const LOG_TAGS = ['ROUTE', 'RETRIEVE', 'TOOL', 'SYNTHESIS', 'PUBLISH'] as const;
export type LogTag = (typeof LOG_TAGS)[number];

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Browser has no process.env.LOG_LEVEL; default to 'info'. Overridable at runtime for
// debugging via `window.__AI_LOG_LEVEL__ = 'debug'`.
function activeLevel(): LogLevel {
  const raw =
    typeof window !== 'undefined' && typeof (window as { __AI_LOG_LEVEL__?: unknown }).__AI_LOG_LEVEL__ === 'string'
      ? ((window as { __AI_LOG_LEVEL__?: string }).__AI_LOG_LEVEL__ as string).toLowerCase()
      : 'info';
  return raw in LEVEL_ORDER ? (raw as LogLevel) : 'info';
}

/** Generates a correlation ID to thread one chat turn across every log line. */
export function createCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SECRET_KEY_RE = /(token|password|secret|apikey|api_key|authorization)/i;
function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

export interface StructuredLogEntry {
  ts: string;
  tag: LogTag;
  level: LogLevel;
  correlationId: string;
  event: string;
  [key: string]: unknown;
}

/**
 * Emits a single structured log line if the level is at or above the active level.
 * Returns the entry (or null when suppressed) so callers/tests can assert on it.
 */
export function structuredLog(
  tag: LogTag,
  level: LogLevel,
  correlationId: string,
  event: string,
  fields: Record<string, unknown> = {}
): StructuredLogEntry | null {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) {
    return null;
  }
  const entry: StructuredLogEntry = {
    ts: new Date().toISOString(),
    tag,
    level,
    correlationId,
    event,
    ...redact(fields),
  };
  const line = `[${tag}] ${JSON.stringify(entry)}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  return entry;
}

export interface PhaseLogger {
  correlationId: string;
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Creates a tag+correlation scoped logger so a chokepoint only passes the event + fields.
 */
export function createPhaseLogger(tag: LogTag, correlationId: string = createCorrelationId()): PhaseLogger {
  return {
    correlationId,
    debug: (event, fields) => void structuredLog(tag, 'debug', correlationId, event, fields),
    info: (event, fields) => void structuredLog(tag, 'info', correlationId, event, fields),
    warn: (event, fields) => void structuredLog(tag, 'warn', correlationId, event, fields),
    error: (event, fields) => void structuredLog(tag, 'error', correlationId, event, fields),
  };
}
