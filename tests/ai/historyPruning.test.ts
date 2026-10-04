import { describe, it, expect } from 'vitest';
import {
  truncateToolOutput,
  pruneToolOutputsInMessages,
  selectMessagesWithinBudget,
} from '../../src/services/ai/historyPruning';
import type { ChatCompletionMessage } from '../../src/services/ai/types';

describe('historyPruning', () => {
  describe('truncateToolOutput', () => {
    it('returns original content if within limit', () => {
      const text = 'Short output';
      expect(truncateToolOutput(text, 50)).toBe(text);
    });

    it('truncates content exceeding maxChars and appends notice', () => {
      const text = 'A'.repeat(600);
      const truncated = truncateToolOutput(text, 500);
      expect(truncated.length).toBeLessThan(text.length);
      expect(truncated).toContain('... [Tool output truncated to preserve context budget]');
      expect(truncated.startsWith('A'.repeat(500))).toBe(true);
    });
  });

  describe('pruneToolOutputsInMessages', () => {
    it('does not prune when tool count is <= keepRecentCount', () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: null },
        { role: 'tool', content: 'A'.repeat(1000), tool_call_id: '1' },
      ];
      const result = pruneToolOutputsInMessages(messages, 2);
      expect(result[2]?.content).toBe('A'.repeat(1000));
    });

    it('prunes older tool outputs while keeping the most recent tool outputs intact', () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'check files' },
        { role: 'assistant', content: null },
        { role: 'tool', content: 'OLD_TOOL_OUTPUT_'.padEnd(1200, 'X'), tool_call_id: 'tool_1' },
        { role: 'assistant', content: null },
        { role: 'tool', content: 'RECENT_TOOL_OUTPUT_1_'.padEnd(1200, 'Y'), tool_call_id: 'tool_2' },
        { role: 'tool', content: 'RECENT_TOOL_OUTPUT_2_'.padEnd(1200, 'Z'), tool_call_id: 'tool_3' },
      ];

      const result = pruneToolOutputsInMessages(messages, 2, 500);

      // Oldest tool output should be pruned
      expect(result[2]?.content).toContain('... [Tool output truncated to preserve context budget]');
      expect(result[2]?.content?.length).toBeLessThan(700);

      // Latest 2 tool outputs should remain full
      expect(result[4]?.content).toBe('RECENT_TOOL_OUTPUT_1_'.padEnd(1200, 'Y'));
      expect(result[5]?.content).toBe('RECENT_TOOL_OUTPUT_2_'.padEnd(1200, 'Z'));
    });

    it('leaves non-tool messages untouched', () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'User text '.repeat(100) },
        { role: 'assistant', content: 'Assistant text '.repeat(100) },
      ];
      const result = pruneToolOutputsInMessages(messages);
      expect(result).toEqual(messages);
    });
  });

  describe('selectMessagesWithinBudget', () => {
    it('returns empty array when messages is empty', () => {
      expect(selectMessagesWithinBudget([])).toEqual([]);
    });

    it('always preserves the latest message even if it exceeds the character budget', () => {
      const giantMsg = { id: 'm1', content: 'X'.repeat(50000) };
      const result = selectMessagesWithinBudget([giantMsg], { maxTotalChars: 10000 });
      expect(result.length).toBe(1);
      expect(result[0]).toBe(giantMsg);
    });

    it('accumulates messages backwards until budget is reached', () => {
      const m1 = { id: '1', content: 'A'.repeat(500) };
      const m2 = { id: '2', content: 'B'.repeat(500) };
      const m3 = { id: '3', content: 'C'.repeat(500) };
      const m4 = { id: '4', content: 'D'.repeat(500) }; // newest

      // Total budget 1100 -> fits m4 (500) + m3 (500) = 1000. m2 would push to 1500 > 1100.
      const result = selectMessagesWithinBudget([m1, m2, m3, m4], { maxTotalChars: 1100 });
      expect(result.length).toBe(2);
      expect(result[0]?.id).toBe('3');
      expect(result[1]?.id).toBe('4');
    });

    it('respects maxMessages limit', () => {
      const msgs = Array.from({ length: 30 }, (_, i) => ({
        id: String(i),
        content: `Msg ${i}`,
      }));

      const result = selectMessagesWithinBudget(msgs, { maxMessages: 5, maxTotalChars: 100000 });
      expect(result.length).toBe(5);
      expect(result[0]?.id).toBe('25');
      expect(result[4]?.id).toBe('29');
    });
  });
});
