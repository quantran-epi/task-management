import { useState, useEffect, useCallback, useRef } from 'react';
import type { GhostDevStreamChunk } from '../types/agent';
import { isTauriApp } from '../utils/timerPopout';
import { agentSessionHistoryRepo } from '../services/agents/agentSessionHistoryRepo';
import { agentLogStore, MAX_STREAM_LINES } from '../services/agents/agentLogStore';

export { MAX_STREAM_LINES };

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
  isCleared: boolean;
}

export function useGhostDevStream(taskId: string | null): UseGhostDevStreamResult {
  const [logs, setLogs] = useState<GhostDevStreamChunk[]>(() =>
    taskId ? agentLogStore.getLogs(taskId) : []
  );
  const [isCleared, setIsCleared] = useState<boolean>(() =>
    taskId ? agentLogStore.isCleared(taskId) : false
  );
  const [sending, setSending] = useState<boolean>(false);
  const taskIdRef = useRef<string | null>(taskId);
  taskIdRef.current = taskId;
  const awaitingAiResponseRef = useRef<boolean>(false);

  const clearLogs = useCallback(() => {
    if (taskIdRef.current) {
      agentLogStore.clearLogs(taskIdRef.current);
      setIsCleared(true);
    }
  }, []);

  // Subscribe to agentLogStore for active taskId
  useEffect(() => {
    if (!taskId) {
      setLogs([]);
      setIsCleared(false);
      awaitingAiResponseRef.current = false;
      return;
    }

    // Immediately load stored logs for this task
    setLogs(agentLogStore.getLogs(taskId));
    setIsCleared(agentLogStore.isCleared(taskId));
    awaitingAiResponseRef.current = false;

    // Listen to continuous stream updates from store
    const unsubscribe = agentLogStore.subscribe(taskId, (newLogs) => {
      setLogs(newLogs);
      setIsCleared(agentLogStore.isCleared(taskId));

      // If awaiting AI response to user feedback, capture it
      if (awaitingAiResponseRef.current && newLogs.length > 0) {
        const last = newLogs[newLogs.length - 1];
        if (last && last.source === 'master') {
          const aiText = extractAiTextFromChunk(last.content);
          if (aiText) {
            agentSessionHistoryRepo.attachAiResponseToLatestFeedback(taskId, aiText);
            awaitingAiResponseRef.current = false;
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [taskId]);

  const sendChatMessage = useCallback(
    async (prompt: string) => {
      if (!isTauriApp() || !taskIdRef.current) return;
      if (!prompt.trim()) return;

      const currentTaskId = taskIdRef.current;
      setSending(true);
      try {
        await tauriInvoke('send_agent_feedback', {
          taskId: currentTaskId,
          feedback: prompt.trim(),
        });

        // Record in audit log and arm AI response listener
        agentSessionHistoryRepo.recordUserFeedback(currentTaskId, prompt.trim());
        awaitingAiResponseRef.current = true;

        // Optimistically record user message chunk in log store
        const userChunk: GhostDevStreamChunk = {
          taskId: currentTaskId,
          source: 'master',
          timestamp: new Date().toISOString(),
          type: 'log',
          content: `[User Feedback]: ${prompt.trim()}`,
        };
        agentLogStore.addChunk(userChunk);
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
    isCleared,
  };
}
