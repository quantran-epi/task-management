import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { runTelegramChatTurn } from '../../src/services/telegram/telegramChatTurn';
import type { runAiOrchestratorLoop as RunLoop } from '../../src/services/ai/aiOrchestratorLoop';

type LoopOptions = Parameters<typeof RunLoop>[0];

describe('Telegram chat turn adapter', () => {
  let db: TaskPlannerDatabase;
  const runLoop = vi.fn();

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TelegramChatTurnAdapterTest');
    await db.open();
    runLoop.mockReset();
  });

  afterEach(async () => {
    await db.delete();
  });

  function params(overrides: Partial<Parameters<typeof runTelegramChatTurn>[0]> = {}) {
    return {
      chatId: 'telegram-parity-1',
      userName: 'Parity User',
      text: 'Tóm tắt task đang mở',
      dataScope: 'full' as const,
      routedIntent: null,
      history: [
        { role: 'user' as const, content: 'câu cũ' },
        { role: 'assistant' as const, content: 'trả lời cũ' },
      ],
      contextText: '## Matching Tasks in TaskMate:\n- [Open] [High] **Task A**',
      endpoint: 'http://localhost',
      apiKey: 'test-key',
      model: 'test-model',
      db,
      ...overrides,
    };
  }

  function mockLoopResult(overrides: Record<string, unknown> = {}) {
    runLoop.mockImplementationOnce(async (options: LoopOptions) => {
      if (overrides.generatedFiles) {
        for (const file of overrides.generatedFiles as any[]) {
          options.onFileGenerated?.(file);
        }
      }
      options.onToolCall?.({ id: 'c1', name: 'query_tasks', args: {} });
      options.onToolResult?.('c1', '{"tasks":[]}', 1);
      return {
        fullResponse: 'Trả lời đầy đủ',
        cleanResponse: 'Trả lời đầy đủ',
        messages: [],
        tokenUsage: { totalTokens: 42 },
        generatedFiles: [],
        truncated: false,
        loopLimitReached: false,
        ...overrides,
      };
    });
  }

  function loopOptions(): any {
    return runLoop.mock.calls[0]?.[0];
  }

  it('injects scoped context and passes panel parity loop options to the orchestrator', async () => {
    mockLoopResult();
    const result = await runTelegramChatTurn(params(), runLoop as any);

    const options = loopOptions();
    expect(options.messages[0].content).toContain('Task A');
    expect(options.messages[0].content).toContain('CRITICAL ANTI-HALLUCINATION RULES:');
    expect(options.keepRecentToolOutputs).toBe(20);
    expect(options.maxOldToolChars).toBe(100_000);
    expect(options.compactAtRatio).toBe(0.9);
    expect(options.tools.some((t: any) => t.function.name === 'generate_pptx')).toBe(true);
    expect(options.tools.some((t: any) => t.function.name === 'generate_file')).toBe(false);
    expect(options.tools.some((t: any) => t.function.name === 'create_task')).toBe(false);
    expect(options.tools.some((t: any) => t.function.name === 'search_chat_history')).toBe(true);
    expect(result.replyMarkdown).toBe('Trả lời đầy đủ');
  });

  it('applies scope hint and refuses mutations in the shared loop', async () => {
    mockLoopResult();
    await runTelegramChatTurn(
      params({ dataScope: 'tasks_only', routedIntent: { intent: 'query_taskmate' } as any }),
      runLoop as any
    );
    const options = loopOptions();
    expect(options.messages[0].content).toContain('chỉ Tasks, Change Requests và Systems');
    expect(options.tools.some((t: any) => t.function.name === 'retrieve_knowledge')).toBe(true);
    const refusal = await options.onMutationCheck('create_task', {});
    expect(refusal.proceed).toBe(false);
    expect(refusal.cancellationResult).toContain('yêu cầu quyền Admin');
  });

  it('reports generated artifacts without leaking data URLs into replies', async () => {
    mockLoopResult({
      cleanResponse: 'Đã tạo ảnh',
      generatedFiles: [
        { id: 'img-1', filename: 'ai-image.png', format: 'png', sizeBytes: 10, content: 'data:image/png;base64,AAAA' },
      ],
    });
    const result = await runTelegramChatTurn(params(), runLoop as any);
    expect(result.replyMarkdown).toContain('ai-image.png');
    expect(result.replyMarkdown).not.toContain('data:image');
  });

  it('binds transcript tools to a per-chat thread', async () => {
    mockLoopResult();
    await runTelegramChatTurn(params(), runLoop as any);
    const options = loopOptions();
    const rows = await db.chatMessages.toArray();
    const threadId = rows[0]?.threadId;
    expect(threadId).toBeTruthy();
    const search = await options.executeToolFn('search_chat_history', { query: 'Tóm tắt task đang mở' }, db, undefined, undefined, 'call-2');
    expect(search).toContain('Tóm tắt task đang mở');
  });
});
