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

function findTargetRecordIndex(
  records: GhostDevSessionAuditRecord[],
  targetId: string
): number {
  // 1. Exact sessionId match
  const sessionIdx = records.findIndex((r) => r.sessionId === targetId);
  if (sessionIdx !== -1) return sessionIdx;

  // 2. Newest record with matching taskId and active status
  const activeIdx = records.findIndex(
    (r) =>
      r.taskId === targetId &&
      (r.status === 'running' || r.status === 'awaiting_approval' || r.status === 'paused')
  );
  if (activeIdx !== -1) return activeIdx;

  // 3. Newest record with matching taskId
  return records.findIndex((r) => r.taskId === targetId);
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

    // Prepend each new session without taskId deduplication
    const nextList = [newRecord, ...existing];
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
    const targetIdx = findTargetRecordIndex(existing, taskIdOrSessionId);
    if (targetIdx === -1) return;

    const nextList = [...existing];
    const current = nextList[targetIdx];
    if (!current) return;

    nextList[targetIdx] = {
      ...current,
      status,
      finishedAt: finishedAt !== undefined ? finishedAt : current.finishedAt,
      error: error !== undefined ? error : current.error,
    };

    saveHistory(nextList);
  },

  recordUserFeedback(taskIdOrSessionId: string, feedback: string, aiResponse?: string): void {
    const existing = loadHistory();
    const targetIdx = findTargetRecordIndex(existing, taskIdOrSessionId);
    if (targetIdx === -1) return;

    const nextList = [...existing];
    const current = nextList[targetIdx];
    if (!current) return;

    const entry: UserFeedbackEntry = {
      timestamp: new Date().toISOString(),
      feedback,
      ...(aiResponse ? { aiResponse } : {}),
    };

    nextList[targetIdx] = {
      ...current,
      userFeedbackHistory: [...(current.userFeedbackHistory || []), entry],
    };

    saveHistory(nextList);
  },

  attachAiResponseToLatestFeedback(taskIdOrSessionId: string, aiResponse: string): void {
    const existing = loadHistory();
    const targetIdx = findTargetRecordIndex(existing, taskIdOrSessionId);
    if (targetIdx === -1) return;

    const nextList = [...existing];
    const current = nextList[targetIdx];
    if (!current) return;

    const history = [...(current.userFeedbackHistory || [])];
    if (history.length === 0) return;

    const lastIdx = history.length - 1;
    const lastEntry = history[lastIdx];
    if (!lastEntry) return;

    history[lastIdx] = {
      ...lastEntry,
      aiResponse: lastEntry.aiResponse
        ? `${lastEntry.aiResponse}\n\n${aiResponse}`
        : aiResponse,
    };

    nextList[targetIdx] = {
      ...current,
      userFeedbackHistory: history,
    };

    saveHistory(nextList);
  },

  listSessionHistory(): GhostDevSessionAuditRecord[] {
    return loadHistory();
  },

  getSessionById(targetId: string): GhostDevSessionAuditRecord | null {
    const existing = loadHistory();
    const targetIdx = findTargetRecordIndex(existing, targetId);
    return targetIdx !== -1 ? existing[targetIdx] ?? null : null;
  },

  deleteSession(targetId: string): void {
    const existing = loadHistory();
    const hasSessionMatch = existing.some((item) => item.sessionId === targetId);
    const nextList = hasSessionMatch
      ? existing.filter((item) => item.sessionId !== targetId)
      : existing.filter((item) => item.taskId !== targetId);
    saveHistory(nextList);
  },

  clearAllHistory(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};
