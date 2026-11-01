import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { TaskPlannerDatabase } from '../../src/db';
import type { ChatMessage } from '../../src/types/models';
import { useChatTurn, stageLabelFor } from '../../src/components/ai/runtime/useChatTurn';
import type {
  ChatTurnRequest,
  ChatTurnRuntimeDeps,
} from '../../src/components/ai/runtime/chatTurnRuntime';
import type { AiOrchestratorLoopOptions } from '../../src/services/ai/aiOrchestratorLoop';

const SCOPE_KEY = 'sdlc:project-1:cr-1:INTAKE';

function makeRequest(overrides: Partial<ChatTurnRequest> = {}): ChatTurnRequest {
  return {
    threadId: 'thread-1',
    scopeKey: SCOPE_KEY,
    text: 'Xin chào',
    analysisMode: false,
    autoApprove: false,
    model: 'model-x',
    endpoint: 'https://example.invalid/v1',
    apiKey: 'sk-secret',
    systemMessages: [],
    history: [],
    tools: [],
    ...overrides,
  };
}

let saveCounter = 0;
const fakeSave = (async (input: { threadId: string; role: string; content: string }) => {
  saveCounter += 1;
  return {
    id: `msg-${saveCounter}`,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
  } as ChatMessage;
}) as unknown as ChatTurnRuntimeDeps['saveMessage'];

const baseDeps = (
  runLoop: (options: AiOrchestratorLoopOptions) => Promise<{ fullResponse: string; tokenUsage: {} }>
): Omit<ChatTurnRuntimeDeps, 'onStatus' | 'onDelta'> => ({
  runLoop: runLoop as unknown as ChatTurnRuntimeDeps['runLoop'],
  saveMessage: fakeSave,
  describeMutation: async () => 'Cập nhật tác vụ "A"',
  db: {} as TaskPlannerDatabase,
});

describe('useChatTurn binding', () => {
  it('disposes the previous runtime exactly once when scopeKey changes', () => {
    const deps = baseDeps(async () => ({ fullResponse: 'ok', tokenUsage: {} }));
    const { result, rerender } = renderHook(
      ({ scopeKey }: { scopeKey: string }) => useChatTurn({ scopeKey, deps }),
      { initialProps: { scopeKey: SCOPE_KEY } }
    );

    const firstRuntime = result.current.runtime;
    const abortSpy = vi.spyOn(firstRuntime, 'abort');

    rerender({ scopeKey: 'sdlc:project-1:cr-2:INTAKE' });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(result.current.runtime).not.toBe(firstRuntime);
  });

  it('aborts the in-flight runtime on unmount', () => {
    const deps = baseDeps(async () => ({ fullResponse: 'ok', tokenUsage: {} }));
    const { result, unmount } = renderHook(() => useChatTurn({ scopeKey: SCOPE_KEY, deps }));

    const abortSpy = vi.spyOn(result.current.runtime, 'abort');
    unmount();
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it('maps statuses to the four UI-SPEC staged labels', () => {
    expect(stageLabelFor('preparing')).toBe('Chuẩn bị ngữ cảnh');
    expect(stageLabelFor('tool')).toBe('Truy xuất công cụ');
    expect(stageLabelFor('streaming')).toBe('Đang phản hồi');
    expect(stageLabelFor('synthesizing')).toBe('Đang phản hồi');
    expect(stageLabelFor('awaiting-approval')).toBe('Chờ phê duyệt');
    expect(stageLabelFor('idle')).toBeNull();
    expect(stageLabelFor('complete')).toBeNull();
  });

  it('accumulates streamingText across onDelta and resets on a new turn', async () => {
    const deps = baseDeps(async (options) => {
      options.onTextChunk?.('Xin ');
      options.onTextChunk?.('chào');
      return { fullResponse: 'Xin chào', tokenUsage: {} };
    });

    const { result } = renderHook(() => useChatTurn({ scopeKey: SCOPE_KEY, deps }));

    await act(async () => {
      await result.current.start(makeRequest());
    });

    await waitFor(() => expect(result.current.status).toBe('complete'));
    expect(result.current.streamingText).toBe('Xin chào');

    await act(async () => {
      await result.current.start(makeRequest({ text: 'Lần hai' }));
    });
    expect(result.current.streamingText).toBe('Xin chào');
  });

  it('sets pendingApproval from onAwaitingApproval and clears it on resolveApproval', async () => {
    const deps = baseDeps(async (options) => {
      await options.onMutationCheck?.('update_task', { id: 't-1' });
      return { fullResponse: 'đã cập nhật', tokenUsage: {} };
    });

    const { result } = renderHook(() => useChatTurn({ scopeKey: SCOPE_KEY, deps }));

    let turn: Promise<unknown> | undefined;
    await act(async () => {
      turn = result.current.start(makeRequest());
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());
    expect(result.current.pendingApproval).toEqual({
      toolName: 'update_task',
      summary: 'Cập nhật tác vụ "A"',
    });
    expect(result.current.streamingStatusLabel).toBe('Chờ phê duyệt');

    await act(async () => {
      result.current.resolveApproval(true);
      await turn;
    });

    expect(result.current.pendingApproval).toBeNull();
  });
});
