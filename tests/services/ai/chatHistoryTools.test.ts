// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { createOrGetThread, saveMessage } from '../../../src/db/repositories/chatRepo';
import {
  CHAT_HISTORY_TOOL_DEFINITIONS,
  executeChatHistoryTool,
} from '../../../src/services/ai/chatHistoryTools';
import { dispatchAiToolCall } from '../../../src/services/ai/aiOrchestratorLoop';
import { generateId } from '../../../src/utils/uuid';

const LONG_BODY = [
  '# Ghi chú cũ',
  '',
  'Bí mật Q7J nằm ở đây và cần được đọc lại đúng thứ tự.',
  ...Array.from({ length: 30 }, (_, i) => `Chi tiết bổ sung số ${i} về nội dung lịch sử.`),
].join('\n');

describe('chatHistoryTools — thread-scoped search and read', () => {
  let db: TaskPlannerDatabase;
  let threadId: string;
  let foreignThreadId: string;
  let ownTurnId: string;
  let foreignTurnId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestChatHistory_' + Math.random().toString(36).slice(2));
    await db.open();
    threadId = (await createOrGetThread({ scopeType: 'global' }, db)).id;
    foreignThreadId = (await createOrGetThread({ scopeType: 'cr', entityId: generateId() }, db)).id;
    ownTurnId = (await saveMessage({ threadId, role: 'user', content: LONG_BODY }, db)).id;
    foreignTurnId = (
      await saveMessage(
        { threadId: foreignThreadId, role: 'user', content: 'Tuyệt mật thread khác: Bí mật Q7J' },
        db
      )
    ).id;
  });

  afterEach(async () => {
    await db.delete();
  });

  it('advertises exactly search_chat_history and read_chat_turn with no threadId argument', () => {
    expect(CHAT_HISTORY_TOOL_DEFINITIONS.map((t) => t.function.name)).toEqual([
      'search_chat_history',
      'read_chat_turn',
    ]);
    for (const tool of CHAT_HISTORY_TOOL_DEFINITIONS) {
      expect(tool.function.parameters.properties).not.toHaveProperty('threadId');
    }
    expect(CHAT_HISTORY_TOOL_DEFINITIONS[0]!.function.parameters.properties).toHaveProperty('query');
    expect(CHAT_HISTORY_TOOL_DEFINITIONS[0]!.function.parameters.properties).toHaveProperty('limit');
    expect(CHAT_HISTORY_TOOL_DEFINITIONS[0]!.function.parameters.required).toEqual(['query']);
    expect(CHAT_HISTORY_TOOL_DEFINITIONS[1]!.function.parameters.required).toEqual(['turnId']);
  });

  it('ranks only the current thread and wraps every excerpt', async () => {
    const hits = JSON.parse(
      await executeChatHistoryTool('search_chat_history', { query: 'Bí mật Q7J' }, threadId, db)
    );
    expect(hits).toHaveLength(1);
    expect(Object.keys(hits[0]).sort()).toEqual(
      ['agent', 'excerpt', 'kind', 'timestamp', 'turnId'].sort()
    );
    expect(hits[0].turnId).toBe(ownTurnId);
    expect(hits[0].excerpt).toContain('DỮ LIỆU KHÔNG ĐÁNG TIN');
    expect(hits[0].excerpt).toContain('Bí mật Q7J');
    expect(JSON.stringify(hits)).not.toContain('Tuyệt mật thread khác');
  });

  it('defaults limit to 8 and clamps to 20', async () => {
    for (let i = 0; i < 25; i += 1) {
      await saveMessage({ threadId, role: 'user', content: `Bí mật Q7J số ${i}` }, db);
    }
    const defaults = JSON.parse(
      await executeChatHistoryTool('search_chat_history', { query: 'Bí mật Q7J' }, threadId, db)
    );
    expect(defaults).toHaveLength(8);
    const clamped = JSON.parse(
      await executeChatHistoryTool(
        'search_chat_history',
        { query: 'Bí mật Q7J', limit: 500 },
        threadId,
        db
      )
    );
    expect(clamped).toHaveLength(20);
  });

  it('reads the full turn through wrapUntrusted and refuses a foreign turn', async () => {
    const ok = JSON.parse(
      await executeChatHistoryTool('read_chat_turn', { turnId: ownTurnId }, threadId, db)
    );
    expect(ok.turnId).toBe(ownTurnId);
    expect(ok.content).toContain(LONG_BODY);
    expect(ok.content).toContain('DỮ LIỆU KHÔNG ĐÁNG TIN');

    const refused = JSON.parse(
      await executeChatHistoryTool('read_chat_turn', { turnId: foreignTurnId }, threadId, db)
    );
    expect(refused).toMatchObject({ refused: true, code: 'TURN_NOT_IN_THREAD' });
    expect(JSON.stringify(refused)).not.toContain('Tuyệt mật thread khác');
  });

  it('ignores a model-supplied threadId selector entirely', async () => {
    const search = JSON.parse(
      await executeChatHistoryTool(
        'search_chat_history',
        { query: 'Bí mật Q7J', threadId: foreignThreadId },
        threadId,
        db
      )
    );
    expect(search.map((hit: { turnId: string }) => hit.turnId)).toEqual([ownTurnId]);

    const refused = JSON.parse(
      await executeChatHistoryTool(
        'read_chat_turn',
        { turnId: ownTurnId, threadId: foreignThreadId },
        threadId,
        db
      )
    );
    expect(refused.turnId).toBe(ownTurnId);
    expect(refused.content).toContain('Bí mật Q7J');
  });

  it('dispatches from options.threadId and refuses without reading the DB when it is missing', async () => {
    const granted = JSON.parse(
      await dispatchAiToolCall(
        'read_chat_turn',
        { turnId: ownTurnId, threadId: foreignThreadId },
        db,
        undefined,
        { threadId }
      )
    );
    expect(granted.turnId).toBe(ownTurnId);

    const getSpy = vi.spyOn(db.chatMessages, 'get');
    const missing = JSON.parse(
      await dispatchAiToolCall('read_chat_turn', { turnId: ownTurnId }, db, undefined, {})
    );
    expect(missing).toMatchObject({ refused: true, code: 'THREAD_CONTEXT_MISSING' });
    expect(getSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});
