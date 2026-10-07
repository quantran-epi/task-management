import { useState, useEffect, useCallback } from 'react';
import type { AgentSession } from '../types/agent';
import { isTauriApp } from '../utils/timerPopout';
import { agentSessionHistoryRepo } from '../services/agents/agentSessionHistoryRepo';

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export interface UseGhostDevSessionsResult {
  sessions: AgentSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  activeSession: AgentSession | null;
  loading: boolean;
  refreshSessions: () => Promise<void>;
  stopSession: (taskId: string) => Promise<void>;
}

export function useGhostDevSessions(): UseGhostDevSessionsResult {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSessions = useCallback(async () => {
    if (!isTauriApp()) {
      setLoading(false);
      return;
    }
    try {
      const result = await tauriInvoke<AgentSession[]>('list_agent_sessions');
      setSessions(result || []);
      if (result && Array.isArray(result)) {
        result.forEach((s) => {
          agentSessionHistoryRepo.updateSessionStatus(s.taskId, s.status, s.finishedAt);
        });
      }
    } catch (err) {
      console.error('[GhostDev] Failed to list agent sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const stopSession = useCallback(
    async (taskId: string) => {
      if (!isTauriApp()) return;
      try {
        await tauriInvoke('stop_ghost_dev_session', { taskId });
      } catch (err) {
        console.warn(`[GhostDev] Notice when stopping session ${taskId}:`, err);
      } finally {
        agentSessionHistoryRepo.updateSessionStatus(
          taskId,
          'interrupted',
          new Date().toISOString()
        );
        if (activeSessionId === taskId) {
          setActiveSessionId(null);
        }
        await refreshSessions();
      }
    },
    [refreshSessions, activeSessionId]
  );

  // Initial fetch and Tauri event listeners
  useEffect(() => {
    void refreshSessions();

    if (!isTauriApp()) return;

    let unlistenUpdated: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;
    let unlistenStream: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        unlistenUpdated = await listen('ghost-dev:session-updated', () => {
          void refreshSessions();
        });

        unlistenFinished = await listen('ghost-dev:session-finished', () => {
          void refreshSessions();
        });

        // Also refresh on status change stream chunks
        unlistenStream = await listen<{ type?: string }>('ghost-dev:stream-chunk', (event) => {
          if (event.payload?.type === 'status_change') {
            void refreshSessions();
          }
        });
      } catch (err) {
        console.error('[GhostDev] Error setting up session event listeners:', err);
      }
    })();

    return () => {
      if (unlistenUpdated) unlistenUpdated();
      if (unlistenFinished) unlistenFinished();
      if (unlistenStream) unlistenStream();
    };
  }, [refreshSessions]);

  // Auto-select first running session if none selected, or keep selection valid
  useEffect(() => {
    if (sessions.length === 0) {
      if (activeSessionId !== null) {
        setActiveSessionId(null);
      }
      return;
    }

    const currentExists = sessions.some((s) => s.taskId === activeSessionId);
    if (!currentExists) {
      const runningSession = sessions.find(
        (s) => s.status === 'running' || s.status === 'awaiting_approval'
      );
      if (runningSession) {
        setActiveSessionId(runningSession.taskId);
      } else {
        const first = sessions[0];
        setActiveSessionId(first ? first.taskId : null);
      }
    }
  }, [sessions, activeSessionId]);

  const activeSession = sessions.find((s) => s.taskId === activeSessionId) || null;

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    loading,
    refreshSessions,
    stopSession,
  };
}
