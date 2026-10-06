import type {
  AgentStatus,
  GhostDevSessionAuditRecord,
  UserFeedbackEntry,
} from '../../types/agent';

export type { GhostDevSessionAuditRecord };

const STORAGE_KEY = 'planner:ghost_dev_session_history';
const MAX_HISTORY_RECORDS = 100;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function loadHistory(): GhostDevSessionAuditRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error('[GhostDevAudit] Failed to load session history from localStorage:', err);
    return [];
  }
}

function saveHistory(records: GhostDevSessionAuditRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const capped = records.slice(0, MAX_HISTORY_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch (err) {
    console.error('[GhostDevAudit] Failed to save session history to localStorage:', err);
  }
}

export const agentSessionHistoryRepo = {
  recordSessionStart(
    record: Omit<GhostDevSessionAuditRecord, 'sessionId' | 'userFeedbackHistory'> & {
      userFeedbackHistory?: UserFeedbackEntry[];
    }
  ): GhostDevSessionAuditRecord {
    const existing = loadHistory();
    const newRecord: GhostDevSessionAuditRecord = {
      sessionId: generateUUID(),
      taskId: record.taskId,
      taskTitle: record.taskTitle,
      startedAt: record.startedAt || new Date().toISOString(),
      repoPath: record.repoPath,
      branchName: record.branchName,
      masterModel: record.masterModel,
      workerModel: record.workerModel,
      status: record.status || 'running',
      initialPrompt: record.initialPrompt,
      userFeedbackHistory: record.userFeedbackHistory ? [...record.userFeedbackHistory] : [],
      finishedAt: record.finishedAt,
      error: record.error,
    };

    // Keep all historical runs, placing newest session at top
    const nextList = [newRecord, ...existing.filter((s) => s.sessionId !== newRecord.sessionId)];
    saveHistory(nextList);
    return newRecord;
  },

  updateSessionStatus(
    taskIdOrSessionId: string,
    status: AgentStatus,
    finishedAt?: string,
    error?: string
  ): void {
    const existing = loadHistory();
    let updated = false;

    const nextList = existing.map((item) => {
      if (item.sessionId === taskIdOrSessionId || item.taskId === taskIdOrSessionId) {
        updated = true;
        return {
          ...item,
          status,
          finishedAt: finishedAt !== undefined ? finishedAt : item.finishedAt,
          error: error !== undefined ? error : item.error,
        };
      }
      return item;
    });

    if (updated) {
      saveHistory(nextList);
    }
  },

  recordUserFeedback(taskIdOrSessionId: string, feedback: string, aiResponse?: string): void {
    const existing = loadHistory();
    let updated = false;

    const nextList = existing.map((item) => {
      if (item.sessionId === taskIdOrSessionId || item.taskId === taskIdOrSessionId) {
        updated = true;
        const entry: UserFeedbackEntry = {
          timestamp: new Date().toISOString(),
          feedback,
          aiResponse,
        };
        return {
          ...item,
          userFeedbackHistory: [...(item.userFeedbackHistory || []), entry],
        };
      }
      return item;
    });

    if (updated) {
      saveHistory(nextList);
    }
  },

  attachAiResponseToLatestFeedback(taskIdOrSessionId: string, aiResponse: string): void {
    const existing = loadHistory();
    let updated = false;

    const nextList = existing.map((item) => {
      if (item.sessionId === taskIdOrSessionId || item.taskId === taskIdOrSessionId) {
        const history = [...(item.userFeedbackHistory || [])];
        if (history.length > 0) {
          const lastIdx = history.length - 1;
          const lastEntry = history[lastIdx];
          if (lastEntry) {
            history[lastIdx] = {
              ...lastEntry,
              aiResponse: lastEntry.aiResponse
                ? `${lastEntry.aiResponse}\n\n${aiResponse}`
                : aiResponse,
            };
            updated = true;
            return {
              ...item,
              userFeedbackHistory: history,
            };
          }
        }
      }
      return item;
    });

    if (updated) {
      saveHistory(nextList);
    }
  },

  listSessionHistory(): GhostDevSessionAuditRecord[] {
    return loadHistory();
  },

  getSessionById(id: string): GhostDevSessionAuditRecord | null {
    const existing = loadHistory();
    return existing.find((item) => item.sessionId === id || item.taskId === id) || null;
  },

  deleteSession(sessionIdOrTaskId: string): void {
    const existing = loadHistory();
    const hasSessionMatch = existing.some((item) => item.sessionId === sessionIdOrTaskId);
    const nextList = hasSessionMatch
      ? existing.filter((item) => item.sessionId !== sessionIdOrTaskId)
      : existing.filter((item) => item.taskId !== sessionIdOrTaskId);
    saveHistory(nextList);
  },

  clearAllHistory(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};
