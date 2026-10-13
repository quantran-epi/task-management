import { randomUUID } from 'node:crypto';

/**
 * Structured logging substrate (Bug 5).
 *
 * Dependency-free. Emits one JSON line per event so failures across the knowledge
 * pipeline can be traced by correlation ID and phase tag. Fastify's pino logger stays
 * for HTTP access logs; this module is for the pipeline chokepoints that previously used
 * scattered console.log/console.error with no tags and no correlation ID.
 *
 * Phase tags (one per pipeline stage):
 *   [ROUTE]     intent / scope routing decisions
 *   [RETRIEVE]  modality execution, latency, degradation reasons
 *   [TOOL]      tool-loop turns
 *   [SYNTHESIS] answer synthesis (plan / validate / repair)
 *   [PUBLISH]   graph build / rebuild stages
 */
export const LOG_TAGS = ['ROUTE', 'RETRIEVE', 'TOOL', 'SYNTHESIS', 'PUBLISH'] as const;
export type LogTag = (typeof LOG_TAGS)[number];

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : 'info';
}

/** Generates a correlation ID to thread one request/build across every log line. */
export function createCorrelationId(): string {
  return randomUUID();
}

/**
 * Removes obvious secret-bearing keys before serializing so tokens/passwords never land
 * in logs. Values are shallow-copied; secret keys are dropped entirely.
 */
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
 * Emits a single structured JSON log line if the level is at or above LOG_LEVEL.
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
