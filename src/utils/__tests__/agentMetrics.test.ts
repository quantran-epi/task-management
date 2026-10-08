import { describe, it, expect } from 'vitest';
import {
  extractTokenCount,
  calculateSessionTokens,
  formatDuration,
  formatTokenCount,
} from '../agentMetrics';
import type { GhostDevStreamChunk } from '../../types/agent';

describe('agentMetrics', () => {
  describe('extractTokenCount', () => {
    it('returns total_tokens if present directly', () => {
      expect(extractTokenCount({ total_tokens: 1250 })).toBe(1250);
    });

    it('returns tokens if present directly', () => {
      expect(extractTokenCount({ tokens: 800 })).toBe(800);
    });

    it('returns usage.total_tokens if present in usage object', () => {
      expect(extractTokenCount({ usage: { total_tokens: 4200 } })).toBe(4200);
    });

    it('sums input, output, cache_read, and cache_creation tokens when total_tokens absent', () => {
      const val = {
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 100,
        },
      };
      expect(extractTokenCount(val)).toBe(1800);
    });

    it('checks val.message.usage if present', () => {
      const val = {
        message: {
          usage: {
            input_tokens: 300,
            output_tokens: 150,
          },
        },
      };
      expect(extractTokenCount(val)).toBe(450);
    });

    it('returns null if no token counts exist or all zero', () => {
      expect(extractTokenCount({})).toBeNull();
      expect(extractTokenCount({ usage: {} })).toBeNull();
      expect(extractTokenCount({ usage: { input_tokens: 0 } })).toBeNull();
    });

    it('handles malformed inputs defensively without throwing', () => {
      expect(extractTokenCount(null as unknown as Record<string, unknown>)).toBeNull();
      expect(extractTokenCount(undefined as unknown as Record<string, unknown>)).toBeNull();
      expect(extractTokenCount({ usage: 'invalid' } as unknown as Record<string, unknown>)).toBeNull();
    });
  });

  describe('formatDuration', () => {
    it('formats seconds under 60 as Xs', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(14)).toBe('14s');
      expect(formatDuration(59)).toBe('59s');
    });

    it('formats durations over 60 seconds as Xm Ys with padded seconds', () => {
      expect(formatDuration(60)).toBe('1m 00s');
      expect(formatDuration(84)).toBe('1m 24s');
      expect(formatDuration(125)).toBe('2m 05s');
      expect(formatDuration(3665)).toBe('61m 05s');
    });

    it('clamps negative values to 0s', () => {
      expect(formatDuration(-15)).toBe('0s');
    });

    it('handles non-integer floats by rounding', () => {
      expect(formatDuration(14.6)).toBe('15s');
      expect(formatDuration(84.2)).toBe('1m 24s');
    });
  });

  describe('formatTokenCount', () => {
    it('formats numbers under 1000 with tokens suffix', () => {
      expect(formatTokenCount(0)).toBe('0 tokens');
      expect(formatTokenCount(850)).toBe('850 tokens');
    });

    it('formats numbers >= 1000 into k format', () => {
      expect(formatTokenCount(1000)).toBe('1.0k tokens');
      expect(formatTokenCount(3200)).toBe('3.2k tokens');
      expect(formatTokenCount(124300)).toBe('124.3k tokens');
    });

    it('clamps negative tokens to 0 tokens', () => {
      expect(formatTokenCount(-50)).toBe('0 tokens');
    });
  });

  describe('calculateSessionTokens', () => {
    it('returns 0 for empty logs', () => {
      expect(calculateSessionTokens([])).toBe(0);
    });

    it('accumulates tokens from turn result events across multiple turns', () => {
      const logs: GhostDevStreamChunk[] = [
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:00:00Z',
          type: 'log',
          content: JSON.stringify({
            type: 'result',
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:01:00Z',
          type: 'log',
          content: JSON.stringify({
            type: 'result',
            usage: { input_tokens: 300, output_tokens: 100 },
          }),
        },
      ];
      expect(calculateSessionTokens(logs)).toBe(1100);
    });

    it('includes in-flight message tokens from current active turn', () => {
      const logs: GhostDevStreamChunk[] = [
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:00:00Z',
          type: 'log',
          content: JSON.stringify({
            type: 'result',
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:01:00Z',
          type: 'log',
          content: JSON.stringify({
            type: 'assistant',
            message: {
              usage: { input_tokens: 400, output_tokens: 100 },
            },
          }),
        },
      ];
      // 700 from completed result + 500 from active in-flight turn = 1200
      expect(calculateSessionTokens(logs)).toBe(1200);
    });

    it('does not double count within the current in-flight turn', () => {
      const logs: GhostDevStreamChunk[] = [
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:00:00Z',
          type: 'log',
          content: JSON.stringify({
            type: 'assistant',
            message: { usage: { input_tokens: 300, output_tokens: 50 } }, // 350
          }),
        },
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:00:05Z',
          type: 'log',
          content: JSON.stringify({
            type: 'assistant',
            message: { usage: { input_tokens: 300, output_tokens: 120 } }, // 420 updated
          }),
        },
      ];
      // Latest in-flight usage replaces earlier in-flight usage
      expect(calculateSessionTokens(logs)).toBe(420);
    });

    it('safely skips malformed or non-json logs', () => {
      const logs: GhostDevStreamChunk[] = [
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:00:00Z',
          type: 'log',
          content: 'Plain text log',
        },
        {
          taskId: 't1',
          source: 'master',
          timestamp: '2026-10-08T10:00:01Z',
          type: 'log',
          content: '{ bad json',
        },
      ];
      expect(calculateSessionTokens(logs)).toBe(0);
    });
  });
});
