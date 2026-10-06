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

    // Filter out if duplicate taskId already exists, or keep newest at top
    const nextList = [newRecord, ...existing.filter((s) => s.taskId !== record.taskId)];
    saveHistory(nextList);
    return newRecord;
  },

  updateSessionStatus(
    taskId: string,
    status: AgentStatus,
    finishedAt?: string,
    error?: string
  ): void {
    const existing = loadHistory();
    let updated = false;

    const nextList = existing.map((item) => {
      if (item.taskId === taskId || item.sessionId === taskId) {
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

  recordUserFeedback(taskId: string, feedback: string): void {
    const existing = loadHistory();
    let updated = false;

    const nextList = existing.map((item) => {
      if (item.taskId === taskId || item.sessionId === taskId) {
        updated = true;
        const entry: UserFeedbackEntry = {
          timestamp: new Date().toISOString(),
          feedback,
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

  listSessionHistory(): GhostDevSessionAuditRecord[] {
    return loadHistory();
  },

  getSessionById(taskId: string): GhostDevSessionAuditRecord | null {
    const existing = loadHistory();
    return existing.find((item) => item.taskId === taskId || item.sessionId === taskId) || null;
  },

  deleteSession(taskId: string): void {
    const existing = loadHistory();
    const nextList = existing.filter((item) => item.taskId !== taskId && item.sessionId !== taskId);
    saveHistory(nextList);
  },

  clearAllHistory(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};
