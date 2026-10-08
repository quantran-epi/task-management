import type { GhostDevStreamChunk } from '../types/agent';

/**
 * Parses token count defensively from stream chunk payload.
 * Inspects total_tokens, tokens, usage, message.usage, and sums components if needed.
 */
export function extractTokenCount(val: Record<string, unknown> | null | undefined): number | null {
  if (!val || typeof val !== 'object') return null;

  try {
    if (typeof val.total_tokens === 'number' && val.total_tokens > 0) {
      return val.total_tokens;
    }
    if (typeof val.tokens === 'number' && val.tokens > 0) {
      return val.tokens;
    }

    const checkUsageObj = (u: unknown): number | null => {
      if (!u || typeof u !== 'object') return null;
      const rec = u as Record<string, unknown>;
      if (typeof rec.total_tokens === 'number' && rec.total_tokens > 0) {
        return rec.total_tokens;
      }
      const input = typeof rec.input_tokens === 'number' ? rec.input_tokens : 0;
      const output = typeof rec.output_tokens === 'number' ? rec.output_tokens : 0;
      const cacheRead = typeof rec.cache_read_input_tokens === 'number' ? rec.cache_read_input_tokens : 0;
      const cacheCreate =
        typeof rec.cache_creation_input_tokens === 'number' ? rec.cache_creation_input_tokens : 0;
      const sum = input + output + cacheRead + cacheCreate;
      return sum > 0 ? sum : null;
    };

    if (val.usage) {
      const tokens = checkUsageObj(val.usage);
      if (tokens !== null) return tokens;
    }

    if (val.message && typeof val.message === 'object') {
      const msg = val.message as Record<string, unknown>;
      if (msg.usage) {
        const tokens = checkUsageObj(msg.usage);
        if (tokens !== null) return tokens;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Formats seconds into Claude Code style duration:
 * e.g. "14s", "1m 24s", "2m 05s"
 */
export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds || 0));
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

/**
 * Formats token count into readable Claude Code format:
 * e.g. "850 tokens", "3.2k tokens", "124.3k tokens"
 */
export function formatTokenCount(tokens: number): string {
  const clamped = Math.max(0, Math.round(tokens || 0));
  if (clamped < 1000) {
    return `${clamped} tokens`;
  }
  const inK = (clamped / 1000).toFixed(1);
  return `${inK}k tokens`;
}

/**
 * Calculates total tokens consumed across session logs.
 * Aggregates all completed turn result events + the latest in-flight message usage of current turn.
 */
export function calculateSessionTokens(logs: GhostDevStreamChunk[]): number {
  if (!Array.isArray(logs) || logs.length === 0) return 0;

  let completedTurnsTokens = 0;
  let currentTurnLatestTokens = 0;

  for (const chunk of logs) {
    if (!chunk || !chunk.content) continue;
    const trimmed = chunk.content.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;

    try {
      const val = JSON.parse(trimmed) as Record<string, unknown>;
      const msgType = String(val.type || '');

      if (msgType === 'result') {
        const tokens = extractTokenCount(val);
        if (tokens !== null && tokens > 0) {
          completedTurnsTokens += tokens;
        }
        // Result marks turn completion, reset current in-flight counter
        currentTurnLatestTokens = 0;
      } else {
        const tokens = extractTokenCount(val);
        if (tokens !== null && tokens > 0) {
          // Update current in-flight turn's latest snapshot
          currentTurnLatestTokens = tokens;
        }
      }
    } catch {
      // Ignore non-json or malformed lines
    }
  }

  return completedTurnsTokens + currentTurnLatestTokens;
}
