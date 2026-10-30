export type TurnStatus = 'running' | 'completed' | 'error' | 'aborted';

export interface AiDebugToolExecution {
  id: string;
  name: string;
  argCount: number;
  resultLength?: number | undefined;
  durationMs?: number | undefined;
  errorCode?: string | undefined;
}

export interface AiDebugEvent {
  id: string;
  timestamp: number;
  type: 'start' | 'chunk' | 'tool_call' | 'tool_result' | 'finish' | 'error';
  payload?: { deltaLength?: number; id?: string; durationMs?: number; resultLength?: number; status?: TurnStatus } | undefined;
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
  errorCode?: string | undefined;
  durationMs?: number | undefined;
  events: AiDebugEvent[];
}

export interface StartTurnParams {
  scope: string;
  model: string;
  systemPrompt?: string | undefined;
  messagesSent: Array<{ role?: string; content?: unknown }>;
  toolsSent?: unknown[] | undefined;
}

export interface FinishTurnParams {
  finalResponse?: string | undefined;
  error?: string | undefined;
  aborted?: boolean | undefined;
}

const MAX_TURNS = 50;

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
      messageChars: params.messagesSent.reduce((sum, message) => sum + (typeof message.content === 'string' ? message.content.length : 0), 0),
      toolCount: params.toolsSent?.length ?? 0,
      status: 'running',
      responseStreamLength: 0,
      chunkCount: 0,
      toolExecutions: [],
      events: [
        {
          id: `ev_${now}_start`,
          timestamp: now,
          type: 'start',
          payload: { model: params.model, scope: params.scope },
        },
      ],
    };

    this.turns.unshift(newTurn);
    if (this.turns.length > MAX_TURNS) {
      this.turns.pop();
    }

    this.notify();
    return id;
  }

  appendStreamChunk(turnId: string, delta: string): void {
    const turn = this.turns.find((t) => t.id === turnId);
    if (!turn) return;

    turn.responseStreamLength += delta.length;
    turn.chunkCount += 1;
    turn.events.push({
      id: `ev_${Date.now()}_chunk_${turn.chunkCount}`,
      timestamp: Date.now(),
      type: 'chunk',
      payload: { deltaLength: delta.length },
    });

    this.notify();
  }

  recordToolCall(turnId: string, toolCall: { id: string; name: string; args: Record<string, any> }): void {
    const turn = this.turns.find((t) => t.id === turnId);
    if (!turn) return;

    turn.toolExecutions.push({
      id: toolCall.id,
      name: toolCall.name,
      argCount: Object.keys(toolCall.args).length,
    });

    turn.events.push({
      id: `ev_${Date.now()}_tool_${toolCall.id}`,
      timestamp: Date.now(),
      type: 'tool_call',
      payload: { id: toolCall.id, name: toolCall.name, args: toolCall.args },
    });

    this.notify();
  }

  recordToolResult(turnId: string, toolCallId: string, result: string, durationMs?: number): void {
    const turn = this.turns.find((t) => t.id === turnId);
    if (!turn) return;

    const tool = turn.toolExecutions.find((te) => te.id === toolCallId);
    if (tool) {
      tool.resultLength = result.length;
      tool.durationMs = durationMs;
    }

    turn.events.push({
      id: `ev_${Date.now()}_result_${toolCallId}`,
      timestamp: Date.now(),
      type: 'tool_result',
      payload: { id: toolCallId, durationMs, resultLength: result.length },
    });

    this.notify();
  }

  finishTurn(turnId: string, result: FinishTurnParams): void {
    const turn = this.turns.find((t) => t.id === turnId);
    if (!turn) return;

    const now = Date.now();
    turn.durationMs = Math.max(0, now - turn.timestamp);

    if (result.aborted) {
      turn.status = 'aborted';
    } else if (result.error) {
      turn.status = 'error';
      turn.errorCode = result.error;
    } else {
      turn.status = 'completed';
    }

    if (result.finalResponse !== undefined) {
      turn.finalResponseLength = result.finalResponse.length;
    }

    turn.events.push({
      id: `ev_${now}_finish`,
      timestamp: now,
      type: result.error ? 'error' : 'finish',
      payload: { status: turn.status, durationMs: turn.durationMs },
    });

    this.notify();
  }

  getTurns(): AiDebugTurn[] {
    return [...this.turns];
  }

  getTurn(turnId: string): AiDebugTurn | undefined {
    return this.turns.find((t) => t.id === turnId);
  }

  clearLogs(): void {
    this.turns = [];
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notify(): void {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore subscriber errors
      }
    });
  }
}

export const aiDebugService = new AiDebugService();
