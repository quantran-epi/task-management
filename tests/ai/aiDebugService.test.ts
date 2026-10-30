import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiDebugService } from '../../src/services/ai/aiDebugService';

describe('aiDebugService', () => {
  beforeEach(() => aiDebugService.clearLogs());

  it('keeps only bounded metadata at turn start', () => {
    const forbidden = 'RAW_SECRET_PROMPT';
    const turnId = aiDebugService.startTurn({ scope: 'task-123', model: 'openai/gpt-4o', systemPrompt: forbidden, messagesSent: [{ role: 'user', content: forbidden }], toolsSent: [{ type: 'function', function: { name: 'query_tasks' } }] });
    const turn = aiDebugService.getTurn(turnId)!;
    expect(turn).toMatchObject({ scope: 'task-123', model: 'openai/gpt-4o', systemPromptLength: forbidden.length, messageCount: 1, messageCharacterCount: JSON.stringify({ role: 'user', content: forbidden }).length, toolCount: 1, status: 'running' });
    expect(JSON.stringify(turn)).not.toContain(forbidden);
    expect(turn).not.toHaveProperty('systemPrompt');
    expect(turn).not.toHaveProperty('messagesSent');
    expect(turn).not.toHaveProperty('toolsSent');
  });

  it('records stream lengths without retaining response text', () => {
    const forbidden = 'RAW_RESPONSE_TEXT';
    const turnId = aiDebugService.startTurn({ scope: 'general', model: 'test-model', messagesSent: [] });
    aiDebugService.appendStreamChunk(turnId, `Hello ${forbidden}`);
    aiDebugService.appendStreamChunk(turnId, ' world');
    const turn = aiDebugService.getTurn(turnId)!;
    expect(turn.responseStreamLength).toBe(6 + forbidden.length + 6);
    expect(turn.chunkCount).toBe(2);
    expect(JSON.stringify(turn)).not.toContain(forbidden);
    expect(turn).not.toHaveProperty('responseStream');
  });

  it('records tool metadata without args or result content', () => {
    const forbiddenArgs = 'RAW_TOOL_ARGUMENT';
    const forbiddenResult = 'RAW_TOOL_RESULT';
    const turnId = aiDebugService.startTurn({ scope: 'project-1', model: 'test-model', messagesSent: [] });
    aiDebugService.recordToolCall(turnId, { id: 'call_1', name: 'query_tasks', args: { query: forbiddenArgs, limit: 5 } });
    aiDebugService.recordToolResult(turnId, 'call_1', forbiddenResult, 125);
    const turn = aiDebugService.getTurn(turnId)!;
    expect(turn.toolExecutions[0]).toEqual({ id: 'call_1', name: 'query_tasks', argumentCount: 2, resultLength: forbiddenResult.length, durationMs: 125 });
    expect(JSON.stringify(turn)).not.toContain(forbiddenArgs);
    expect(JSON.stringify(turn)).not.toContain(forbiddenResult);
    expect(JSON.stringify(turn)).not.toMatch(/"args"|"result"/);
  });

  it('stores response length and stable error code only', () => {
    const forbiddenResponse = 'RAW_FINAL_RESPONSE';
    const completedId = aiDebugService.startTurn({ scope: 'general', model: 'test-model', messagesSent: [] });
    aiDebugService.finishTurn(completedId, { finalResponse: forbiddenResponse });
    expect(aiDebugService.getTurn(completedId)).toMatchObject({ status: 'completed', finalResponseLength: forbiddenResponse.length });
    expect(JSON.stringify(aiDebugService.getTurn(completedId))).not.toContain(forbiddenResponse);
    const errorId = aiDebugService.startTurn({ scope: 'general', model: 'test-model', messagesSent: [] });
    aiDebugService.finishTurn(errorId, { error: new Error('RAW_ERROR_TEXT network failure') });
    const errorTurn = aiDebugService.getTurn(errorId)!;
    expect(errorTurn).toMatchObject({ status: 'error', errorCode: 'network_error' });
    expect(JSON.stringify(errorTurn)).not.toContain('RAW_ERROR_TEXT');
    expect(errorTurn).not.toHaveProperty('error');
    const abortedId = aiDebugService.startTurn({ scope: 'general', model: 'test-model', messagesSent: [] });
    aiDebugService.finishTurn(abortedId, { aborted: true });
    expect(aiDebugService.getTurn(abortedId)).toMatchObject({ status: 'aborted', errorCode: 'aborted' });
  });

  it('notifies subscribers on updates and clear', () => {
    const subscriber = vi.fn();
    const unsubscribe = aiDebugService.subscribe(subscriber);
    aiDebugService.startTurn({ scope: 'g', model: 'm', messagesSent: [] });
    expect(subscriber).toHaveBeenCalledTimes(1);
    aiDebugService.clearLogs();
    expect(subscriber).toHaveBeenCalledTimes(2);
    unsubscribe();
    aiDebugService.startTurn({ scope: 'g', model: 'm', messagesSent: [] });
    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  it('caps turns at maximum ring buffer capacity', () => {
    for (let i = 0; i < 60; i += 1) aiDebugService.startTurn({ scope: `scope-${i}`, model: 'm', messagesSent: [] });
    expect(aiDebugService.getTurns()).toHaveLength(50);
    expect(aiDebugService.getTurns()[0]?.scope).toBe('scope-59');
  });
});
