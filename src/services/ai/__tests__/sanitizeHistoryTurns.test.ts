import { describe, it, expect } from 'vitest';
import { sanitizeHistoryTurns } from '../contextCompaction';
import type { ChatMessage } from '../../../types/models';

function mockMsg(
  id: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): ChatMessage {
  return {
    id,
    threadId: 'thread-1',
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

describe('sanitizeHistoryTurns', () => {
  it('filters out orphaned user queries without assistant response (HAR bug scenario)', () => {
    const messages: ChatMessage[] = [
      mockMsg('1', 'user', 'ngày phát hành thẻ được lưu ở đâu'),
      mockMsg('2', 'assistant', 'Vị trí lưu ngày phát hành thẻ: ISS_CARD_INSTANCE.ISS_DATE'),
      mockMsg('3', 'user', 'trạng thái thẻ thì lưu ở đâu'),
      mockMsg('4', 'user', 'trạng thái thẻ thì lưu ở đâu'),
      mockMsg('5', 'user', 'trạng thái thẻ thì lưu ở đâu'),
      mockMsg('6', 'user', 'ngày phát hành thẻ được lưu ở đâu'), // current message
    ];

    const turns = sanitizeHistoryTurns(messages, '6');

    // Only turn 1 should be retained; turns 3, 4, 5 (orphans) and 6 (current) must be dropped
    expect(turns).toEqual([
      { role: 'user', content: 'ngày phát hành thẻ được lưu ở đâu' },
      { role: 'assistant', content: 'Vị trí lưu ngày phát hành thẻ: ISS_CARD_INSTANCE.ISS_DATE' },
    ]);
  });

  it('keeps valid paired turns and preserves assistant content', () => {
    const messages: ChatMessage[] = [
      mockMsg('1', 'user', 'câu hỏi 1'),
      mockMsg('2', 'assistant', 'câu trả lời 1'),
      mockMsg('3', 'user', 'câu hỏi 2'),
      mockMsg('4', 'assistant', 'câu trả lời 2'),
      mockMsg('5', 'user', 'câu hỏi 3'), // current
    ];

    const turns = sanitizeHistoryTurns(messages, '5');

    expect(turns).toHaveLength(4);
    expect(turns[0]).toEqual({ role: 'user', content: 'câu hỏi 1' });
    expect(turns[1]).toEqual({ role: 'assistant', content: 'câu trả lời 1' });
    expect(turns[2]).toEqual({ role: 'user', content: 'câu hỏi 2' });
    expect(turns[3]).toEqual({ role: 'assistant', content: 'câu trả lời 2' });
  });

  it('does not erase older messages that have identical content to current prompt', () => {
    const messages: ChatMessage[] = [
      mockMsg('1', 'user', 'ngày phát hành thẻ được lưu ở đâu'),
      mockMsg('2', 'assistant', 'Lưu tại ISS_CARD_INSTANCE'),
      mockMsg('3', 'user', 'ngày phát hành thẻ được lưu ở đâu'), // user re-asks identical query
    ];

    // Passing '3' as excludeMessageId should keep '1' and '2', dropping only '3'
    const turns = sanitizeHistoryTurns(messages, '3');

    expect(turns).toHaveLength(2);
    expect(turns[0]?.content).toBe('ngày phát hành thẻ được lưu ở đâu');
    expect(turns[1]?.content).toBe('Lưu tại ISS_CARD_INSTANCE');
  });

  it('handles empty or single messages gracefully', () => {
    expect(sanitizeHistoryTurns([])).toEqual([]);
    expect(sanitizeHistoryTurns([mockMsg('1', 'user', 'hello')])).toEqual([]);
    expect(sanitizeHistoryTurns([mockMsg('1', 'assistant', 'hello')])).toEqual([
      { role: 'assistant', content: 'hello' },
    ]);
  });
});
