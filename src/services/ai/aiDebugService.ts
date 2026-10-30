export type TurnStatus = 'running' | 'completed' | 'error' | 'aborted';

export type AiDebugErrorCode =
  | 'aborted'
  | 'network_error'
  | 'timeout'
  | 'validation_error'
  | 'provider_error'
  | 'unknown_error';

export type AiDebugEventPayload =
  | { scope: string }
  | { deltaLength: number }
  | { id: string; argCount: number }
  | { id: string; resultLength: number; durationMs?: number }
  | { status: TurnStatus; durationMs: number }
  | { status: 'error'; errorCode: AiDebugErrorCode };

export interface AiDebugToolExecution {
  id: string;
  name: string;
  argumentCount: number;
  resultLength?: number | undefined;
  durationMs?: number | undefined;
}

export interface AiDebugEvent {
  id: string;
  timestamp: number;
  type: 'start' | 'chunk' | 'tool_call' | 'tool_result' | 'finish' | 'error';
  payload: AiDebugEventPayload;
}

export interface AiDebugTurn {
  id: string;
  timestamp: number;
  scope: string;
  model: string;
  systemPromptLength: number;
  messageCount: number;
  messageChars: number;
  toolCount: number;
  status: TurnStatus;
  responseStreamLength: number;
  chunkCount: number;
  toolExecutions: AiDebugToolExecution[];
  finalResponseLength?: number | undefined;
  errorCode?: AiDebugErrorCode | undefined;
  durationMs?: number | undefined;
  events: AiDebugEvent[];
}

export interface StartTurnParams {
  scope: string;
  model: string;
  systemPrompt?: string | undefined;
  messagesSent: unknown[];
  toolsSent?: unknown[] | undefined;
}

export interface FinishTurnParams {
  finalResponse?: string | undefined;
  error?: unknown;
  aborted?: boolean | undefined;
}

const MAX_TURNS = 50;

function characterCount(value: unknown): number {
  if (typeof value === 'string') return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function errorCode(error: unknown): AiDebugErrorCode {
  const description = error instanceof Error ? error.message.toLowerCase() : typeof error === 'string' ? error.toLowerCase() : '';
  const name = error instanceof Error ? error.name.toLowerCase() : '';
  const value = `${name} ${description}`;
  if (value.includes('abort')) return 'aborted';
  if (value.includes('timeout')) return 'timeout';
  if (value.includes('network') || value.includes('fetch')) return 'network_error';
  if (value.includes('valid') || value.includes('schema') || value.includes('json')) return 'validation_error';
  if (value.includes('provider') || value.includes('model') || value.includes('http')) return 'provider_error';
  return 'unknown_error';
}

class AiDebugService {
  private turns: AiDebugTurn[] = [];
  private subscribers = new Set<() => void>();

  startTurn(params: StartTurnParams): string {
    const id = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const newTurn: AiDebugTurn = {
      id,
      timestamp: now,
      scope: params.scope,
      model: params.model,
      systemPromptLength: params.systemPrompt?.length ?? 0,
      messageCount: params.messagesSent.length,
      messageChars: params.messagesSent.reduce<number>((total, message) => total + characterCount(message), 0),
      toolCount: params.toolsSent?.length ?? 0,
      status: 'running',
      responseStreamLength: 0,
      chunkCount: 0,
      toolExecutions: [],
      events: [{ id: `ev_${now}_start`, timestamp: now, type: 'start', payload: { scope: params.scope } }],
    };
    this.turns.unshift(newTurn);
    if (this.turns.length > MAX_TURNS) this.turns.pop();
    this.notify();
    return id;
  }

  appendStreamChunk(turnId: string, delta: string): void {
    const turn = this.turns.find((item) => item.id === turnId);
    if (!turn) return;
    turn.responseStreamLength += delta.length;
    turn.chunkCount += 1;
    turn.events.push({ id: `ev_${Date.now()}_chunk_${turn.chunkCount}`, timestamp: Date.now(), type: 'chunk', payload: { deltaLength: delta.length } });
    this.notify();
  }

  recordToolCall(turnId: string, toolCall: { id: string; name: string; args: Record<string, any> }): void {
    const turn = this.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const argumentCount = Object.keys(toolCall.args).length;
    turn.toolExecutions.push({ id: toolCall.id, name: toolCall.name, argumentCount });
    turn.events.push({ id: `ev_${Date.now()}_tool_${toolCall.id}`, timestamp: Date.now(), type: 'tool_call', payload: { id: toolCall.id, argCount: argumentCount } });
    this.notify();
  }

  recordToolResult(turnId: string, toolCallId: string, result: string, durationMs?: number): void {
    const turn = this.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const tool = turn.toolExecutions.find((item) => item.id === toolCallId);
    if (tool) {
      tool.resultLength = result.length;
      tool.durationMs = durationMs;
    }
    const resultPayload = durationMs === undefined
      ? { id: toolCallId, resultLength: result.length }
      : { id: toolCallId, durationMs, resultLength: result.length };
    turn.events.push({ id: `ev_${Date.now()}_result_${toolCallId}`, timestamp: Date.now(), type: 'tool_result', payload: resultPayload });
    this.notify();
  }

  finishTurn(turnId: string, result: FinishTurnParams): void {
    const turn = this.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const now = Date.now();
    turn.durationMs = Math.max(0, now - turn.timestamp);
    if (result.aborted) {
      turn.status = 'aborted';
      turn.errorCode = 'aborted';
    } else if (result.error !== undefined) {
      turn.status = 'error';
      turn.errorCode = errorCode(result.error);
    } else {
      turn.status = 'completed';
    }
    if (result.finalResponse !== undefined) turn.finalResponseLength = result.finalResponse.length;
    if (turn.status === 'error') {
      turn.events.push({ id: `ev_${now}_error`, timestamp: now, type: 'error', payload: { status: 'error', errorCode: turn.errorCode ?? 'unknown_error' } });
    } else {
      turn.events.push({ id: `ev_${now}_finish`, timestamp: now, type: 'finish', payload: { status: turn.status, durationMs: turn.durationMs } });
    }
    this.notify();
  }

  getTurns(): AiDebugTurn[] { return [...this.turns]; }
  getTurn(turnId: string): AiDebugTurn | undefined { return this.turns.find((item) => item.id === turnId); }
  clearLogs(): void { this.turns = []; this.notify(); }
  subscribe(listener: () => void): () => void { this.subscribers.add(listener); return () => this.subscribers.delete(listener); }

  private notify(): void {
    this.subscribers.forEach((callback) => {
      try { callback(); } catch { /* Diagnostics never affect AI execution. */ }
    });
  }
}

export const aiDebugService = new AiDebugService();
