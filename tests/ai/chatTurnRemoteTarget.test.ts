// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskPlannerDatabase } from '../../src/db';
import type { ChatTurnRequest } from '../../src/components/ai/runtime/chatTurnRuntime';
import type { AiOrchestratorLoopOptions } from '../../src/services/ai/aiOrchestratorLoop';

// Capture the dispatch options chatTurnRuntime's executeToolFn passes to dispatchAiToolCall.
const mockDispatch = vi.hoisted(() => vi.fn(async () => '{}'));
vi.mock('../../src/services/ai/aiOrchestratorLoop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/aiOrchestratorLoop')>();
  return { ...actual, dispatchAiToolCall: mockDispatch };
});

import { createChatTurnRuntime } from '../../src/components/ai/runtime/chatTurnRuntime';

describe('chatTurnRuntime executeToolFn remote target forwarding (Phase 47 D-13)', () => {
  const db = {} as TaskPlannerDatabase;
  const target = { sshConfigId: 'ssh-prod', repoPath: '/srv/repo', branch: 'feature/x' };

  beforeEach(() => {
    mockDispatch.mockReset();
    mockDispatch.mockResolvedValue('{}');
  });

  it('injects request.remoteTarget into dispatchAiToolCall options from executeToolFn', async () => {
    let capturedExecuteToolFn: AiOrchestratorLoopOptions['executeToolFn'];
    const runLoop = vi.fn(async (options: AiOrchestratorLoopOptions) => {
      capturedExecuteToolFn = options.executeToolFn;
      return {
        fullResponse: 'ok',
        cleanResponse: 'ok',
        messages: [],
        tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        generatedFiles: [],
        truncated: false,
        loopLimitReached: false,
      };
    });
    const runtime = createChatTurnRuntime({
      runLoop: runLoop as never,
      saveMessage: vi.fn(async (input: any) => ({ ...input, id: 'm1' })) as never,
      describeMutation: vi.fn(async () => ({})) as never,
      db,
    });

    const request: ChatTurnRequest = {
      threadId: 'thread-1',
      scopeKey: `remote:${target.sshConfigId}`,
      text: 'trace this',
        autoApprove: false,
      model: 'model-x',
      endpoint: 'https://example.invalid/v1',
      apiKey: 'sk-secret',
      systemMessages: [],
      history: [],
      tools: [],
      remoteTarget: target,
    };
    await runtime.start(request);

    expect(capturedExecuteToolFn).toBeDefined();
    await capturedExecuteToolFn!('ssh_grep_files', { path: '.', pattern: 'x' }, db, undefined, undefined, 'call-9');

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const callArgs = mockDispatch.mock.calls[0] as unknown as any[];
    const options = callArgs[4];
    expect(options.remoteTarget).toEqual(target);
    expect(options.callId).toBe('call-9');
  });
});
