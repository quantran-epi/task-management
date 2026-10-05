import { useState, useEffect, useCallback, useRef } from 'react';
import type { GhostDevStreamChunk } from '../types/agent';
import { isTauriApp } from '../utils/timerPopout';

export const MAX_STREAM_LINES = 2000;

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export interface UseGhostDevStreamResult {
  logs: GhostDevStreamChunk[];
  clearLogs: () => void;
  sendChatMessage: (prompt: string) => Promise<void>;
  sending: boolean;
}

export function useGhostDevStream(taskId: string | null): UseGhostDevStreamResult {
  const [logs, setLogs] = useState<GhostDevStreamChunk[]>([]);
  const [sending, setSending] = useState<boolean>(false);
  const taskIdRef = useRef<string | null>(taskId);
  taskIdRef.current = taskId;

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Clear logs when active taskId changes
  useEffect(() => {
    setLogs([]);
  }, [taskId]);

  useEffect(() => {
    if (!isTauriApp() || !taskId) return;

    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<GhostDevStreamChunk>('ghost-dev:stream-chunk', (event) => {
          const chunk = event.payload;
          if (!chunk || chunk.taskId !== taskIdRef.current) return;

          setLogs((prev) => {
            const next = [...prev, chunk];
            if (next.length > MAX_STREAM_LINES) {
              return next.slice(next.length - MAX_STREAM_LINES);
            }
            return next;
          });
        });
      } catch (err) {
        console.error('[GhostDev] Failed to subscribe to stream-chunk:', err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [taskId]);

  const sendChatMessage = useCallback(
    async (prompt: string) => {
      if (!isTauriApp() || !taskIdRef.current) return;
      if (!prompt.trim()) return;

      setSending(true);
      try {
        await tauriInvoke('send_agent_feedback', {
          taskId: taskIdRef.current,
          feedback: prompt.trim(),
        });

        // Optimistically append user message chunk in log stream
        const userChunk: GhostDevStreamChunk = {
          taskId: taskIdRef.current,
          source: 'master',
          timestamp: new Date().toISOString(),
          type: 'log',
          content: `[User Feedback]: ${prompt.trim()}`,
        };
        setLogs((prev) => {
          const next = [...prev, userChunk];
          if (next.length > MAX_STREAM_LINES) {
            return next.slice(next.length - MAX_STREAM_LINES);
          }
          return next;
        });
      } catch (err) {
        console.error('[GhostDev] Failed to send agent feedback:', err);
        throw err;
      } finally {
        setSending(false);
      }
    },
    []
  );

  return {
    logs,
    clearLogs,
    sendChatMessage,
    sending,
  };
}
