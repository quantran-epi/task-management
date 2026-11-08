import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { DEFAULT_MAX_TOOL_ROUNDS, runAiOrchestratorLoop } from '../../../src/services/ai/aiOrchestratorLoop';
import type { ChatCompletionMessage } from '../../../src/services/ai/types';

const mockStreamChatEvents = vi.fn();
const mockStreamChatCompletion = vi.fn();
const mockCompactMessagesInLoop = vi.fn();

vi.mock('../../../src/services/ai/inLoopCompaction', () => ({
  compactMessagesInLoop: (args: any) => mockCompactMessagesInLoop(args),
}));

vi.mock('../../../src/services/ai/nineRouterClient', () => ({
  streamChatEvents: (args: any) => mockStreamChatEvents(args),
  streamChatCompletion: (args: any) => mockStreamChatCompletion(args),
  stripThinkingBlocks: (text: string) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
}));

describe('runAiOrchestratorLoop', () => {
  let testDb: TaskPlannerDatabase;
  const dbName = 'TestAiOrchestratorLoopDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(dbName);
    await testDb.open();
    mockStreamChatEvents.mockReset();
    mockStreamChatCompletion.mockReset();
    mockCompactMessagesInLoop.mockReset();
    mockCompactMessagesInLoop.mockResolvedValue({ compacted: false, messages: [] });
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('terminates cleanly in single turn when model returns pure text and no tools', async () => {
    mockStreamChatEvents.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Xin chào! ' };
      yield { type: 'text', delta: 'Tôi có thể giúp gì cho bạn?' };
      yield { type: 'usage', usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 } };
    });

    const messages: ChatCompletionMessage[] = [
      { role: 'user', content: 'Chào bạn' },
    ];

    const result = await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com',
      apiKey: 'test-key',
      model: 'test-model',
      messages,
      db: testDb,
    });

    expect(result.cleanResponse).toBe('Xin chào! Tôi có thể giúp gì cho bạn?');
    expect(result.tokenUsage.totalTokens).toBe(25);
    expect(result.generatedFiles).toHaveLength(0);
    expect(mockStreamChatCompletion).not.toHaveBeenCalled();
  });

  it.each([undefined, 2, 0, -1, NaN, Infinity, 2.9, 0.5])(
    'bounds tool rounds before pending dispatch (override %s)', async (maxLoops) => {
      expect(DEFAULT_MAX_TOOL_ROUNDS).toBe(50);
      mockStreamChatEvents.mockImplementation(async function* () {
        yield { type: 'text', delta: 'partial' };
        yield { type: 'tool_calls', calls: [{ id: crypto.randomUUID(), type: 'function',
          function: { name: 'custom_lookup', arguments: '{}' } }] };
      });
      const executeToolFn = vi.fn().mockResolvedValue('{}');
      const onToolCall = vi.fn();
      const onToolResult = vi.fn();
      const rounds = maxLoops !== undefined && Number.isFinite(maxLoops) && maxLoops > 0
        ? Math.max(1, Math.floor(maxLoops)) : 50;
      const result = await runAiOrchestratorLoop({
        endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
        messages: [], db: testDb, executeToolFn, onToolCall, onToolResult,
        ...(maxLoops !== undefined ? { maxLoops } : {}),
      });
      expect(result.loopLimitReached).toBe(true);
      expect(result.truncated).toBe(false);
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(rounds);
      expect(executeToolFn).toHaveBeenCalledTimes(rounds - 1);
      expect(onToolCall).toHaveBeenCalledTimes(rounds - 1);
      expect(onToolResult).toHaveBeenCalledTimes(rounds - 1);
    },
  );

  it('allows a text answer on the final round without marking a limit', async () => {
    mockStreamChatEvents.mockImplementationOnce(async function* () {
      yield { type: 'tool_calls', calls: [{ id: 'one', type: 'function',
        function: { name: 'custom_lookup', arguments: '{}' } }] };
    }).mockImplementationOnce(async function* () {
      yield { type: 'text', delta: 'complete answer' };
    });
    const result = await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
      messages: [], db: testDb, maxLoops: 2, executeToolFn: vi.fn().mockResolvedValue('{}'),
    });
    expect(result.loopLimitReached).toBe(false);
    expect(result.cleanResponse).toBe('complete answer');
    expect(mockStreamChatEvents).toHaveBeenCalledTimes(2);
  });

  function setupProviderPath(path: 'main' | 'fallback' | 'synthesis', reason = 'stop') {
    mockStreamChatEvents.mockImplementationOnce(async function* () {
      if (path === 'fallback') throw new Error('Tools unsupported');
      if (path === 'synthesis') {
        yield { type: 'finish', finish_reason: 'tool_calls' };
        yield { type: 'tool_calls', calls: [{
          id: 'call_1', type: 'function',
          function: { name: 'custom_lookup', arguments: '{}' },
        }] };
      } else {
        yield { type: 'text', delta: 'Main output' };
        yield { type: 'finish', finish_reason: reason };
      }
    });
    if (path === 'synthesis') {
      mockStreamChatEvents.mockImplementationOnce(async function* () {
        yield { type: 'text', delta: '' };
      });
    }
    if (path !== 'main') {
      mockStreamChatEvents.mockImplementationOnce(async function* () {
        yield { type: 'text', delta: `${path} output` };
        yield { type: 'finish', finish_reason: reason };
        yield { type: 'usage', usage: { totalTokens: 7 } };
      });
    }
    return {
      endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
      messages: [{ role: 'user' as const, content: 'test' }], db: testDb,
      tools: [{ type: 'function', function: { name: 'custom_lookup', parameters: {} } }],
      maxLoops: 2,
      executeToolFn: vi.fn().mockResolvedValue('{}'),
    };
  }

  it.each(['main', 'fallback', 'synthesis'] as const)(
    'forwards exact caller maxTokens on %s payloads', async (path) => {
      const result = await runAiOrchestratorLoop({ ...setupProviderPath(path), maxTokens: 2048 });
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(path === 'main' ? 1 : path === 'fallback' ? 2 : 3);
      for (const [request] of mockStreamChatEvents.mock.calls) {
        expect(request.payload.max_tokens).toBe(2048);
      }
      if (path !== 'main') {
        expect(mockStreamChatEvents.mock.calls.at(-1)![0].payload).not.toHaveProperty('tools');
        expect(result.tokenUsage.totalTokens).toBe(7);
      }
      expect(result.finishReason).toBe('stop');
      expect(result.truncated).toBe(false);
      expect(mockStreamChatCompletion).not.toHaveBeenCalled();
    },
  );

  it.each(['main', 'fallback', 'synthesis'] as const)(
    'omits own max_tokens when unset on %s payload', async (path) => {
      await runAiOrchestratorLoop(setupProviderPath(path));
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(path === 'main' ? 1 : path === 'fallback' ? 2 : 3);
      const request = mockStreamChatEvents.mock.calls.at(-1)![0];
      expect(Object.hasOwn(request.payload, 'max_tokens')).toBe(false);
    },
  );

  it.each(['main', 'fallback', 'synthesis'] as const)(
    'marks length-truncated %s output and retains text', async (path) => {
      const options = setupProviderPath(path, 'length');
      const result = await runAiOrchestratorLoop(options);
      expect(result.truncated).toBe(true);
      expect(result.finishReason).toBe('length');
      expect(result.fullResponse).toBe(path === 'main' ? 'Main output' : `${path} output`);
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(path === 'main' ? 1 : path === 'fallback' ? 2 : 3);
      if (path === 'main') expect(options.executeToolFn).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, NaN, Infinity, -Infinity])('omits invalid maxTokens %s on every payload', async (maxTokens) => {
    await runAiOrchestratorLoop({ ...setupProviderPath('synthesis'), maxTokens });
    for (const [request] of mockStreamChatEvents.mock.calls) {
      expect(Object.hasOwn(request.payload, 'max_tokens')).toBe(false);
    }
  });

  it('uses final response finish reason rather than earlier tool-call reason', async () => {
    const options = setupProviderPath('synthesis');
    const result = await runAiOrchestratorLoop({ ...options, maxLoops: 2 });
    expect(result.finishReason).toBe('stop');
    expect(result.truncated).toBe(false);
    expect(mockStreamChatEvents).toHaveBeenCalledTimes(3);
  });

  it.each([0.5, 1_000_000])('never clamps valid caller limit %s', async (maxTokens) => {
    await runAiOrchestratorLoop({ ...setupProviderPath('synthesis'), maxTokens });
    for (const [request] of mockStreamChatEvents.mock.calls) {
      expect(request.payload.max_tokens).toBe(maxTokens);
    }
  });

  it('does not synthesize over a main-round length finish after tools ran', async () => {
    const options = setupProviderPath('synthesis', 'length');
    const result = await runAiOrchestratorLoop({ ...options, maxLoops: 3 });
    expect(result.truncated).toBe(true);
    expect(mockStreamChatEvents).toHaveBeenCalledTimes(3);
    expect(options.executeToolFn).toHaveBeenCalledTimes(1);
  });

  it('executes tool call and runs synthesis pass after tool execution', async () => {
    let callCount = 0;
    mockStreamChatEvents.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'custom_lookup',
                arguments: JSON.stringify({ item: 'test' }),
              },
            },
          ],
        };
      } else if (callCount === 2) {
        // Second turn returns empty text, prompting synthesis pass
        yield { type: 'text', delta: '' };
      } else {
        // Synthesis turn
        yield { type: 'text', delta: 'Kết quả sau khi tổng hợp: Đã tìm thấy mục test.' };
        yield { type: 'usage', usage: { totalTokens: 40 } };
      }
    });

    const mockToolFn = vi.fn().mockResolvedValue(JSON.stringify({ found: true, name: 'test' }));
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();

    const result = await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Tìm test' }],
      db: testDb,
      executeToolFn: mockToolFn,
      onToolCall,
      onToolResult,
    });

    expect(mockToolFn).toHaveBeenCalledWith('custom_lookup', { item: 'test' }, testDb, undefined);
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'call_1',
      name: 'custom_lookup',
      args: { item: 'test' },
    });
    expect(onToolResult).toHaveBeenCalledWith('call_1', JSON.stringify({ found: true, name: 'test' }), expect.any(Number));
    expect(result.cleanResponse).toBe('Kết quả sau khi tổng hợp: Đã tìm thấy mục test.');
  });

  it('cancels tool execution and records user decline when onMutationCheck returns proceed: false', async () => {
    let callCount = 0;
    mockStreamChatEvents.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_delete',
              type: 'function',
              function: {
                name: 'delete_task',
                arguments: JSON.stringify({ id: 'task-123' }),
              },
            },
          ],
        };
      } else {
        yield { type: 'text', delta: 'Đã hủy thao tác xóa theo yêu cầu.' };
      }
    });

    const mockToolFn = vi.fn();
    const onMutationCheck = vi.fn().mockResolvedValue({
      proceed: false,
      cancellationResult: JSON.stringify({ cancelled: true, message: 'User declined' }),
    });

    const result = await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Xóa task 123' }],
      db: testDb,
      executeToolFn: mockToolFn,
      onMutationCheck,
    });

    expect(onMutationCheck).toHaveBeenCalledWith('delete_task', { id: 'task-123' });
    expect(mockToolFn).not.toHaveBeenCalled();
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('User declined');
  });

  it('forwards the signal to tool execution and rejects an abort during the tool call', async () => {
    mockStreamChatEvents.mockImplementation(async function* () {
      yield {
        type: 'tool_calls',
        calls: [{
          id: 'call_abort',
          type: 'function',
          function: { name: 'custom_lookup', arguments: '{}' },
        }],
      };
    });
    const controller = new AbortController();
    const mockToolFn = vi.fn(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await expect(runAiOrchestratorLoop({
      endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
      messages: [{ role: 'user', content: 'lookup' }], db: testDb,
      signal: controller.signal, executeToolFn: mockToolFn,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockToolFn).toHaveBeenCalledWith('custom_lookup', {}, testDb, controller.signal);
  });

  it('passes the same signal to in-loop compaction when prompt tokens exceed budget', async () => {
    let callCount = 0;
    mockStreamChatEvents.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield { type: 'usage', usage: { promptTokens: 1000 } };
        yield {
          type: 'tool_calls',
          calls: [{ id: 'call_1', type: 'function', function: { name: 'custom_lookup', arguments: '{}' } }],
        };
      } else {
        yield { type: 'text', delta: 'xong' };
      }
    });
    const controller = new AbortController();

    await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
      messages: [{ role: 'user', content: 'lookup' }], db: testDb,
      signal: controller.signal, contextWindowTokens: 100,
      executeToolFn: vi.fn().mockResolvedValue('{}'),
    });

    expect(mockCompactMessagesInLoop).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('captures generated files from generate_file or generate_pptx tools', async () => {
    let callCount = 0;
    mockStreamChatEvents.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_gen_file',
              type: 'function',
              function: {
                name: 'generate_file',
                arguments: JSON.stringify({ filename: 'report.md', content: '# Báo cáo' }),
              },
            },
          ],
        };
      } else {
        yield { type: 'text', delta: 'Đã tạo tệp báo cáo.' };
      }
    });

    const mockToolFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        success: true,
        filename: 'report.md',
        format: 'md',
        sizeBytes: 100,
      })
    );

    const onFileGenerated = vi.fn();

    const result = await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Tạo file report.md' }],
      db: testDb,
      executeToolFn: mockToolFn,
      onFileGenerated,
    });

    expect(result.generatedFiles).toHaveLength(1);
    expect(result.generatedFiles[0]?.filename).toBe('report.md');
    expect(onFileGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'report.md', format: 'md' })
    );
  });

  it.each([
    ['generate_file_ide', JSON.stringify({ success: true, filename: 'report.md', format: 'md', sizeBytes: 10 })],
    ['generate_image_tool', JSON.stringify({ success: true, imageUrl: 'data:image/png;base64,AAAA', prompt: 'diagram' })],
  ])('captures artifacts from normalized tool name %s', async (name, resultPayload) => {
    let callCount = 0;
    mockStreamChatEvents.mockImplementation(async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [{ id: 'call_artifact_123', type: 'function', function: { name, arguments: JSON.stringify({ filename: 'report.md', content: '# report' }) } }],
        };
      } else {
        yield { type: 'text', delta: 'done' };
      }
    });
    const onFileGenerated = vi.fn();

    const result = await runAiOrchestratorLoop({
      endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
      messages: [{ role: 'user', content: 'generate' }], db: testDb,
      executeToolFn: vi.fn().mockResolvedValue(resultPayload), onFileGenerated,
    });

    expect(result.generatedFiles).toHaveLength(1);
    expect(onFileGenerated).toHaveBeenCalledTimes(1);
    if (name === 'generate_image_tool') {
      expect(result.generatedFiles[0]).toMatchObject({ format: 'png', content: 'data:image/png;base64,AAAA' });
      expect(result.generatedFiles[0]!.sizeBytes).toBeGreaterThan(0);
    }
  });

  describe('beforeToolRound round boundary (D-21)', () => {
    const toolThenText = () => {
      let callCount = 0;
      mockStreamChatEvents.mockImplementation(async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield {
            type: 'tool_calls',
            calls: [{ id: 'call_1', type: 'function', function: { name: 'custom_lookup', arguments: '{}' } }],
          };
        } else {
          yield { type: 'text', delta: 'xong' };
        }
      });
    };

    it('is not called before the first round and gets the 1-based round number', async () => {
      toolThenText();
      const beforeToolRound = vi.fn().mockResolvedValue(undefined);

      await runAiOrchestratorLoop({
        endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
        messages: [], db: testDb, executeToolFn: vi.fn().mockResolvedValue('{}'), beforeToolRound,
      });

      expect(beforeToolRound).toHaveBeenCalledTimes(1);
      expect(beforeToolRound.mock.calls[0]![0]).toBe(2);
    });

    it('receives the loop signal as its second argument', async () => {
      toolThenText();
      const controller = new AbortController();
      const beforeToolRound = vi.fn().mockResolvedValue(undefined);

      await runAiOrchestratorLoop({
        endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
        messages: [], db: testDb, signal: controller.signal,
        executeToolFn: vi.fn().mockResolvedValue('{}'), beforeToolRound,
      });

      expect(beforeToolRound.mock.calls[0]![1]).toBe(controller.signal);
    });

    it('suspends after the completed round tool results are appended', async () => {
      toolThenText();
      let release!: () => void;
      const parked = new Promise<void>((resolve) => { release = resolve; });
      const onToolResult = vi.fn();

      const loop = runAiOrchestratorLoop({
        endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
        messages: [], db: testDb, executeToolFn: vi.fn().mockResolvedValue('{"found":true}'),
        onToolResult, beforeToolRound: () => parked,
      });

      await vi.waitFor(() => expect(onToolResult).toHaveBeenCalledTimes(1));
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(1);

      release();
      const result = await loop;
      expect(result.cleanResponse).toBe('xong');
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(2);
    });

    it('rejects with AbortError when the signal aborts while parked', async () => {
      toolThenText();
      const controller = new AbortController();

      await expect(runAiOrchestratorLoop({
        endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
        messages: [], db: testDb, signal: controller.signal,
        executeToolFn: vi.fn().mockResolvedValue('{}'),
        beforeToolRound: (_round, signal) => new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          controller.abort();
        }),
      })).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('leaves behavior unchanged when the hook is omitted', async () => {
      toolThenText();
      const result = await runAiOrchestratorLoop({
        endpoint: 'https://api.example.com', apiKey: 'test-key', model: 'test-model',
        messages: [], db: testDb, executeToolFn: vi.fn().mockResolvedValue('{}'),
      });
      expect(result.cleanResponse).toBe('xong');
      expect(mockStreamChatEvents).toHaveBeenCalledTimes(2);
    });
  });
});
