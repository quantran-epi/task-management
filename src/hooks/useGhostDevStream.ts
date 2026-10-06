import { useState, useEffect, useCallback, useRef } from 'react';
import type { GhostDevStreamChunk } from '../types/agent';
import { isTauriApp } from '../utils/timerPopout';
import { agentSessionHistoryRepo } from '../services/agents/agentSessionHistoryRepo';

export const MAX_STREAM_LINES = 2000;

function extractAiTextFromChunk(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const val = JSON.parse(trimmed) as Record<string, unknown>;
    const msgType = String(val.type || '');
    if (msgType === 'assistant' || val.role === 'assistant') {
      if (typeof val.content === 'string') return val.content;
      if (Array.isArray(val.content)) {
        return (val.content as Array<{ type?: string; text?: string }>)
          .filter((c) => c.type === 'text')
          .map((c) => c.text || '')
          .join('\n');
      }
      if (val.message && typeof val.message === 'object') {
        const msgObj = val.message as { content?: Array<{ type?: string; text?: string }> };
        if (Array.isArray(msgObj.content)) {
          return msgObj.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text || '')
            .join('\n');
        }
      }
    }
  } catch {
    // not json
  }
  return null;
}

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
  const awaitingAiResponseRef = useRef<boolean>(false);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Clear logs when active taskId changes
  useEffect(() => {
    setLogs([]);
    awaitingAiResponseRef.current = false;
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

          // If awaiting AI response to user feedback, capture it
          if (awaitingAiResponseRef.current && chunk.source === 'master') {
            const aiText = extractAiTextFromChunk(chunk.content);
            if (aiText) {
              agentSessionHistoryRepo.attachAiResponseToLatestFeedback(chunk.taskId, aiText);
              awaitingAiResponseRef.current = false;
            }
          }

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

        // Record in audit log and arm AI response listener
        agentSessionHistoryRepo.recordUserFeedback(taskIdRef.current, prompt.trim());
        awaitingAiResponseRef.current = true;

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
