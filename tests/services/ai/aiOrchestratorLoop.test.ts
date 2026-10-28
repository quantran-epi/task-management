import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { runAiOrchestratorLoop } from '../../../src/services/ai/aiOrchestratorLoop';
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
});
