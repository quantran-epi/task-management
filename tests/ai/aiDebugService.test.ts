import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiDebugService } from '../../src/services/ai/aiDebugService';

describe('aiDebugService', () => {
  beforeEach(() => {
    aiDebugService.clearLogs();
  });

  it('creates turn with startTurn', () => {
    const turnId = aiDebugService.startTurn({
      scope: 'task-123',
      model: 'openai/gpt-4o',
      systemPrompt: 'System context',
      messagesSent: [{ role: 'user', content: 'Hello AI' }],
      toolsSent: [{ type: 'function', function: { name: 'query_tasks' } }],
    });

    expect(turnId).toBeTruthy();
    const turns = aiDebugService.getTurns();
    expect(turns.length).toBe(1);

    const turn = turns[0]!;
    expect(turn.id).toBe(turnId);
    expect(turn.scope).toBe('task-123');
    expect(turn.model).toBe('openai/gpt-4o');
    expect(turn.systemPrompt).toBe('System context');
    expect(turn.status).toBe('running');
    expect(turn.messagesSent).toHaveLength(1);
    expect(turn.toolsSent).toHaveLength(1);
  });

  it('records stream chunks and appends to live response', () => {
    const turnId = aiDebugService.startTurn({
      scope: 'general',
      model: 'test-model',
      messagesSent: [],
    });

    aiDebugService.appendStreamChunk(turnId, 'Hello');
    aiDebugService.appendStreamChunk(turnId, ' world');

    const turn = aiDebugService.getTurn(turnId);
    expect(turn).toBeDefined();
    expect(turn?.responseStream).toBe('Hello world');
    expect(turn?.chunkCount).toBe(2);
  });

  it('records tool calls and their outputs with latency', () => {
    const turnId = aiDebugService.startTurn({
      scope: 'project-1',
      model: 'test-model',
      messagesSent: [],
    });

    aiDebugService.recordToolCall(turnId, {
      id: 'call_1',
      name: 'query_tasks',
      args: { status: 'in_progress' },
    });

    let turn = aiDebugService.getTurn(turnId);
    expect(turn?.toolExecutions).toHaveLength(1);
    expect(turn?.toolExecutions[0]?.name).toBe('query_tasks');
    expect(turn?.toolExecutions[0]?.args).toEqual({ status: 'in_progress' });
    expect(turn?.toolExecutions[0]?.result).toBeUndefined();

    aiDebugService.recordToolResult(turnId, 'call_1', JSON.stringify([{ id: 't1', title: 'Task 1' }]), 125);

    turn = aiDebugService.getTurn(turnId);
    expect(turn?.toolExecutions[0]?.result).toContain('Task 1');
    expect(turn?.toolExecutions[0]?.durationMs).toBe(125);
  });

  it('finishes turn and updates status and duration', () => {
    const turnId = aiDebugService.startTurn({
      scope: 'general',
      model: 'test-model',
      messagesSent: [],
    });

    aiDebugService.finishTurn(turnId, {
      finalResponse: 'Completed answer',
    });

    const turn = aiDebugService.getTurn(turnId);
    expect(turn?.status).toBe('completed');
    expect(turn?.finalResponse).toBe('Completed answer');
    expect(typeof turn?.durationMs).toBe('number');
  });

  it('handles error and abort statuses in finishTurn', () => {
    const t1 = aiDebugService.startTurn({ scope: 'g', model: 'm', messagesSent: [] });
    aiDebugService.finishTurn(t1, { error: 'Network error 500' });
    expect(aiDebugService.getTurn(t1)?.status).toBe('error');
    expect(aiDebugService.getTurn(t1)?.error).toBe('Network error 500');

    const t2 = aiDebugService.startTurn({ scope: 'g', model: 'm', messagesSent: [] });
    aiDebugService.finishTurn(t2, { aborted: true });
    expect(aiDebugService.getTurn(t2)?.status).toBe('aborted');
  });

  it('notifies subscribers on updates and clear', () => {
    const subscriber = vi.fn();
    const unsubscribe = aiDebugService.subscribe(subscriber);

    aiDebugService.startTurn({ scope: 'g', model: 'm', messagesSent: [] });
    expect(subscriber).toHaveBeenCalledTimes(1);

    aiDebugService.clearLogs();
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(aiDebugService.getTurns()).toHaveLength(0);

    unsubscribe();
    aiDebugService.startTurn({ scope: 'g', model: 'm', messagesSent: [] });
    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  it('caps turns at maximum ring buffer capacity', () => {
    for (let i = 0; i < 60; i++) {
      aiDebugService.startTurn({ scope: `scope-${i}`, model: 'm', messagesSent: [] });
    }
    const turns = aiDebugService.getTurns();
    expect(turns.length).toBe(50);
    expect(turns[0]?.scope).toBe('scope-59');
  });
});
