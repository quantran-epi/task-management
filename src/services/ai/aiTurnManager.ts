import { useSyncExternalStore } from 'react';
import type { ChatTurnStatus, ChatTurnToolEvent } from '../../components/ai/runtime/chatTurnRuntime';

export const ACTIVE_AI_STATUSES: readonly ChatTurnStatus[] = [
  'preparing',
  'tool',
  'streaming',
  'synthesizing',
  'awaiting-approval',
];

export interface ActiveAiTurn {
  id: string;
  scopeKey: string;
  title: string;
  status: ChatTurnStatus;
  streamingText: string;
  streamingStatusLabel: string | null;
  toolEvents: ChatTurnToolEvent[];
  toolProgress?: string | null;
  startedAt: number;
  abort: () => void;
  meta?: {
    type?: string;
    id?: string;
    tabId?: string;
  };
}

export class AiTurnManager {
  private turns = new Map<string, ActiveAiTurn>();
  private activeTurnsCache: ActiveAiTurn[] = [];
  private listeners = new Set<() => void>();

  private updateCacheAndNotify() {
    this.activeTurnsCache = Array.from(this.turns.values()).filter((t) =>
      ACTIVE_AI_STATUSES.includes(t.status)
    );
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[AiTurnManager] Listener error:', err);
      }
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getActiveTurns = (): ActiveAiTurn[] => {
    return this.activeTurnsCache;
  };

  getTurn(id: string): ActiveAiTurn | undefined {
    return this.turns.get(id);
  }

  getAllTurns(): ActiveAiTurn[] {
    return Array.from(this.turns.values());
  }

  registerTurn(turn: Omit<ActiveAiTurn, 'startedAt' | 'toolEvents' | 'streamingText'> & {
    startedAt?: number;
    toolEvents?: ChatTurnToolEvent[];
    streamingText?: string;
  }) {
    const fullTurn: ActiveAiTurn = {
      ...turn,
      streamingText: turn.streamingText ?? '',
      toolEvents: turn.toolEvents ?? [],
      startedAt: turn.startedAt ?? Date.now(),
    };
    this.turns.set(turn.id, fullTurn);
    this.updateCacheAndNotify();
  }

  updateTurn(id: string, patch: Partial<Omit<ActiveAiTurn, 'id' | 'abort'>>) {
    const existing = this.turns.get(id);
    if (!existing) return;
    this.turns.set(id, { ...existing, ...patch });
    this.updateCacheAndNotify();
  }

  finishTurn(id: string, finalStatus: ChatTurnStatus = 'complete') {
    const existing = this.turns.get(id);
    if (!existing) return;
    this.turns.set(id, { ...existing, status: finalStatus });
    this.updateCacheAndNotify();
    // Allow UI to observe the final completed/aborted state, then purge from manager
    setTimeout(() => {
      if (this.turns.get(id)?.status === finalStatus) {
        this.turns.delete(id);
        this.updateCacheAndNotify();
      }
    }, 800);
  }

  abortTurn(id: string) {
    const turn = this.turns.get(id);
    if (turn) {
      try {
        turn.abort();
      } catch (err) {
        console.warn(`[AiTurnManager] Error aborting turn ${id}:`, err);
      }
      this.turns.delete(id);
      this.updateCacheAndNotify();
    }
  }

  abortAll() {
    for (const turn of this.turns.values()) {
      try {
        turn.abort();
      } catch (err) {
        console.warn(`[AiTurnManager] Error aborting turn ${turn.id}:`, err);
      }
    }
    this.turns.clear();
    this.updateCacheAndNotify();
  }
}

export const aiTurnManager = new AiTurnManager();

const EMPTY_TURNS: ActiveAiTurn[] = [];

export function useActiveAiTurns(): ActiveAiTurn[] {
  return useSyncExternalStore(
    aiTurnManager.subscribe,
    aiTurnManager.getActiveTurns,
    () => EMPTY_TURNS
  );
}

export function useAiTurn(id: string | null | undefined): ActiveAiTurn | undefined {
  return useSyncExternalStore(
    aiTurnManager.subscribe,
    () => (id ? aiTurnManager.getTurn(id) : undefined),
    () => undefined
  );
}
