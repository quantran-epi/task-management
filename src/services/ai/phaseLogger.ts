export type PhaseTag = '[ROUTE]' | '[RETRIEVE]' | '[TOOL]' | '[SYNTHESIS]' | '[PUBLISH]';
export type PhaseOutcome = 'ok' | 'error' | 'degraded' | 'blocked' | 'skipped';

export interface PhaseLogEntry {
  timestamp: string;
  correlationId: string;
  phase: PhaseTag;
  outcome: PhaseOutcome;
  latencyMs: number;
  safeIds: string[];
  counts: Record<string, number>;
  metadata: Record<string, unknown>;
}

export interface PhaseLoggerOptions {
  correlationId?: string;
  sink?: (entry: PhaseLogEntry) => void;
  now?: () => Date;
}

const SECRET_KEY_RE = /^(authorization|api[_-]?key|token|password|passphrase|secret|credential|cookie|set-cookie|dlp|prompt|query|rawSnippet|quote|excerpt|body|content)$/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PAN_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const API_KEY_RE = /\b(?:sk|rk|pk|ghp|github_pat|xoxb|AIza)[A-Za-z0-9_\-]{8,}\b/g;
const PASSWORD_ASSIGNMENT_RE = /\b(password|passphrase|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;}]+/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function safeCorrelationId(input?: string): string {
  if (input && UUID_RE.test(input)) {
    UUID_RE.lastIndex = 0;
    return input;
  }
  UUID_RE.lastIndex = 0;
  return crypto.randomUUID();
}

function redactString(value: string): string {
  return value
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(API_KEY_RE, '[REDACTED]')
    .replace(PASSWORD_ASSIGNMENT_RE, '$1=[REDACTED]')
    .replace(EMAIL_RE, '[REDACTED]')
    .replace(PAN_RE, '[REDACTED]');
}

export function redactSensitiveData<T>(input: T): T {
  if (typeof input === 'string') return redactString(input) as T;
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((item) => redactSensitiveData(item)) as T;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redactSensitiveData(value);
    }
  }
  return output as T;
}

function numericRecord(input?: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.max(0, Math.trunc(value));
  }
  return out;
}

export function createPhaseLogger(phase: PhaseTag, options: PhaseLoggerOptions = {}) {
  const correlationId = safeCorrelationId(options.correlationId);
  const now = options.now ?? (() => new Date());
  const sink = options.sink ?? ((entry: PhaseLogEntry) => console.info(JSON.stringify(entry)));

  return {
    correlationId,
    log(input: {
      outcome: PhaseOutcome;
      latencyMs?: number;
      safeIds?: readonly string[];
      counts?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }) {
      const entry: PhaseLogEntry = {
        timestamp: now().toISOString(),
        correlationId,
        phase,
        outcome: input.outcome,
        latencyMs: Math.max(0, Math.trunc(input.latencyMs ?? 0)),
        safeIds: [...(input.safeIds ?? [])].map((id) => redactString(String(id)).slice(0, 160)),
        counts: numericRecord(input.counts),
        metadata: redactSensitiveData(input.metadata ?? {}),
      };
      sink(entry);
      return entry;
    },
  };
}
