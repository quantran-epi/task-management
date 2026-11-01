import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createOrGetThread, saveMessage, getMessagesByThreadId } from '../../src/db/repositories/chatRepo';
import type { ChatMessage, ChatTokenUsage } from '../../src/types/models';
import {
  createChatTurnRuntime,
  type ChatTurnRequest,
  type ChatTurnRuntimeDeps,
  type ChatTurnStatus,
} from '../../src/components/ai/runtime/chatTurnRuntime';
import type { AiOrchestratorLoopOptions } from '../../src/services/ai/aiOrchestratorLoop';

const SCOPE_KEY = 'project:11111111-1111-4111-8111-111111111111';

function makeRequest(overrides: Partial<ChatTurnRequest> = {}): ChatTurnRequest {
  return {
    threadId: '',
    scopeKey: SCOPE_KEY,
    text: 'Xin chào',
    analysisMode: false,
    autoApprove: false,
    model: 'model-x',
    endpoint: 'https://example.invalid/v1',
    apiKey: 'sk-secret-key',
    systemMessages: [{ role: 'system', content: 'Bạn là trợ lý.' }],
    history: [],
    tools: [],
    ...overrides,
  };
}

interface LoopScript {
  (options: AiOrchestratorLoopOptions): Promise<{ fullResponse: string; tokenUsage: ChatTokenUsage }>;
}

describe('chatTurnRuntime lifecycle (D-19, D-21, D-22)', () => {
  let db: TaskPlannerDatabase;
  let threadId: string;
  let statuses: ChatTurnStatus[];
  let deltas: string[];
  let errors: { code: string; message: string }[];
  let approvals: { toolName: string; summary: string }[];
  let completed: { content: string; tokenUsage: ChatTokenUsage }[];

  const runtimeWith = (
    runLoop: LoopScript,
    extra: Partial<ChatTurnRuntimeDeps> = {}
  ) => {
    const deps = {
      runLoop: runLoop as unknown as ChatTurnRuntimeDeps['runLoop'],
      saveMessage,
      describeMutation: async () => 'Cập nhật tác vụ "A"',
      db,
      onStatus: (s: ChatTurnStatus) => statuses.push(s),
      onDelta: (t: string) => deltas.push(t),
      onError: (e: { code: string; message: string }) => errors.push(e),
      onAwaitingApproval: (i: { toolName: string; summary: string }) => approvals.push(i),
      onCompleted: (m: { content: string; tokenUsage: ChatTokenUsage }) => completed.push(m),
      ...extra,
    } as ChatTurnRuntimeDeps;
    return createChatTurnRuntime(deps);
  };

  const messageRows = async () => getMessagesByThreadId(threadId, db);
  const assistantRows = async (): Promise<ChatMessage[]> =>
    (await messageRows()).filter((m) => m.role === 'assistant');
  const userRows = async (): Promise<ChatMessage[]> =>
    (await messageRows()).filter((m) => m.role === 'user');

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-turn-${Date.now()}-${Math.random()}`);
    const thread = await createOrGetThread({ scopeType: 'project', entityId: 'p-1' }, db);
    threadId = thread.id;
    statuses = [];
    deltas = [];
    errors = [];
    approvals = [];
    completed = [];
  });

  afterEach(async () => {
    await db.delete();
  });

  it('publishes preparing before the injected saveMessage resolves', async () => {
    let releaseSave: (() => void) | null = null;
    const blockedSave = ((input: never) => {
      return new Promise((resolve) => {
        releaseSave = () => resolve(saveMessage(input, db));
      });
    }) as unknown as ChatTurnRuntimeDeps['saveMessage'];

    const runtime = runtimeWith(
      async () => ({ fullResponse: 'ok', tokenUsage: {} }),
      { saveMessage: blockedSave }
    );

    const pending = runtime.start(makeRequest({ threadId }));
    expect(statuses).toEqual(['preparing']);
    expect(runtime.getStatus()).toBe('preparing');

    await Promise.resolve();
    releaseSave?.();
    await pending;
  });

  it('moves through preparing, streaming, tool, synthesizing, complete', async () => {
    const runtime = runtimeWith(async (options) => {
      options.onTextChunk?.('hello');
      options.onToolCall?.({ id: 'call-1', name: 'query_tasks', args: {} });
      options.onToolResult?.('call-1', '{"items":[]}', 12);
      options.onStatusChange?.('Đang tổng hợp câu trả lời hoàn chỉnh...');
      return { fullResponse: 'hello', tokenUsage: { totalTokens: 3 } };
    });

    const outcome = await runtime.start(makeRequest({ threadId }));

    expect(outcome.phase).toBe('complete');
    expect(statuses).toEqual(['preparing', 'streaming', 'tool', 'synthesizing', 'complete']);
  });

  it('cancels mutations in Analysis Mode without consulting autoApprove or awaiting approval', async () => {
    let checkedResult: { proceed: boolean; cancellationResult?: string } | undefined;
    const runtime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'cancelled turn', tokenUsage: {} };
    });

    await runtime.start(makeRequest({ threadId, analysisMode: true, autoApprove: false }));

    expect(checkedResult?.proceed).toBe(false);
    expect(checkedResult?.cancellationResult).toContain('Analysis Mode');
    expect(statuses).not.toContain('awaiting-approval');
    expect(approvals).toHaveLength(0);
  });

  it('proceeds with autoApprove and never publishes awaiting-approval', async () => {
    let checkedResult: { proceed: boolean } | undefined;
    const runtime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'updated', tokenUsage: {} };
    });

    await runtime.start(makeRequest({ threadId, autoApprove: true }));

    expect(checkedResult?.proceed).toBe(true);
    expect(statuses).not.toContain('awaiting-approval');
  });

  it('waits on explicit approval, resumes on approve, and persists nothing on reject', async () => {
    let checkedResult: { proceed: boolean; cancellationResult?: string } | undefined;

    const approveRuntime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'đã cập nhật', tokenUsage: {} };
    });
    const approveTurn = approveRuntime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    expect(approvals[0]).toEqual({ toolName: 'update_task', summary: 'Cập nhật tác vụ "A"' });
    approveRuntime.resolveApproval(true);
    await approveTurn;
    expect(checkedResult?.proceed).toBe(true);
    expect(await assistantRows()).toHaveLength(1);

    statuses = [];
    deltas = [];
    const rejectRuntime = runtimeWith(async (options) => {
      checkedResult = await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'đã cập nhật', tokenUsage: {} };
    });
    const rejectTurn = rejectRuntime.start(makeRequest({ threadId, text: 'Lần hai' }));
    await waitForStatus(() => statuses.includes('awaiting-approval'));
    rejectRuntime.resolveApproval(false);
    const outcome = await rejectTurn;
    expect(outcome.phase).toBe('cancelled');
    expect(outcome.cancellationResult).toContain('từ chối');
    expect(checkedResult?.proceed).toBe(false);
    expect(await assistantRows()).toHaveLength(1);
  });

  it('aborting mid-stream persists no assistant message and leaves existing messages untouched', async () => {
    const existing = await saveMessage(
      { threadId, role: 'user', content: 'tin nhắn cũ' },
      db
    );
    const before = await messageRows();

    const runtime = runtimeWith(async (options) => {
      options.onTextChunk?.('partial ');
      return await new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }) as never;
    });

    const turn = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('streaming'));
    runtime.abort();
    const outcome = await turn;

    expect(outcome.phase).toBe('aborted');
    expect(await assistantRows()).toHaveLength(0);
    const after = await messageRows();
    expect(after.find((m) => m.id === existing.id)?.content).toBe('tin nhắn cũ');
    expect(after).toHaveLength(before.length + 1); // only the new user row
  });

  it('sanitizes provider errors into a fixed message with no key, auth header or stack', async () => {
    const runtime = runtimeWith(async (options) => {
      void options;
      const err = new Error(
        'Authorization: Bearer sk-secret-key apiKey=sk-secret-key\n    at streamChatEvents (x.ts:1:1)'
      );
      throw err;
    });

    const outcome = await runtime.start(makeRequest({ threadId }));

    expect(outcome.phase).toBe('error');
    expect(runtime.getStatus()).toBe('error');
    expect(errors).toHaveLength(1);
    const message = errors[0]?.message ?? '';
    expect(message).not.toContain('sk-secret-key');
    expect(message).not.toContain('Authorization');
    expect(message).not.toContain('at streamChatEvents');
    expect(message).toContain('Thử lại');
  });

  it('retry after an error reuses the original user message id', async () => {
    let call = 0;
    const runtime = runtimeWith(async () => {
      call += 1;
      if (call === 1) throw new Error('boom');
      return { fullResponse: 'thành công', tokenUsage: {} };
    });

    const first = await runtime.start(makeRequest({ threadId }));
    expect(first.phase).toBe('error');
    expect(await userRows()).toHaveLength(1);

    const second = await runtime.retry();
    expect(second.phase).toBe('complete');
    expect(second.userMessageId).toBe(first.userMessageId);
    expect(await userRows()).toHaveLength(1);
  });

  it('rejects a second concurrent start with TURN_IN_PROGRESS and writes no message', async () => {
    let release: (() => void) | null = null;
    const runtime = runtimeWith(async (options) => {
      options.onTextChunk?.('x');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { fullResponse: 'x', tokenUsage: {} };
    });

    const first = runtime.start(makeRequest({ threadId }));
    await waitForStatus(() => statuses.includes('streaming'));
    const rowsBeforeSecond = await messageRows();

    await expect(runtime.start(makeRequest({ threadId, text: 'lần hai' }))).rejects.toThrow(
      'TURN_IN_PROGRESS'
    );
    expect(await messageRows()).toHaveLength(rowsBeforeSecond.length);

    release?.();
    await first;
  });

  it('persists exactly one assistant message with stripped content and accumulated usage', async () => {
    const runtime = runtimeWith(async (options) => {
      const usage: ChatTokenUsage = {};
      options.onUsage?.({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      options.onUsage?.({ promptTokens: 2, completionTokens: 3, totalTokens: 5 });
      usage.promptTokens = 12;
      usage.completionTokens = 8;
      usage.totalTokens = 20;
      options.onTextChunk?.('Câu trả lời');
      return {
        fullResponse: '<thinking>suy luận nội bộ</thinking>Câu trả lời',
        tokenUsage: usage,
      };
    });

    const outcome = await runtime.start(makeRequest({ threadId }));
    expect(outcome.phase).toBe('complete');

    const assistants = await assistantRows();
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.content).toBe('Câu trả lời');
    expect(assistants[0]?.content).not.toContain('suy luận nội bộ');
    expect(assistants[0]?.tokenUsage).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });
    expect(completed).toHaveLength(1);
    expect(deltas.join('')).toContain('Câu trả lời');
  });
});

async function waitForStatus(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitForStatus timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
