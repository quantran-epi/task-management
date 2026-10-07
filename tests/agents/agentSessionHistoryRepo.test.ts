import { describe, it, expect, beforeEach } from 'vitest';
import {
  agentSessionHistoryRepo,
  type GhostDevSessionAuditRecord,
} from '../../src/services/agents/agentSessionHistoryRepo';

describe('agentSessionHistoryRepo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records session start with generated sessionId and default empty feedback history', () => {
    const record: GhostDevSessionAuditRecord = agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-101',
      taskTitle: 'Refactor Auth Controller',
      startedAt: '2026-10-06T10:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-task-101',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'You are the lead agent for task 101',
    });

    expect(record.sessionId).toBeDefined();
    expect(record.taskId).toBe('task-101');
    expect(record.taskTitle).toBe('Refactor Auth Controller');
    expect(record.userFeedbackHistory).toEqual([]);
    expect(record.status).toBe('running');

    const list = agentSessionHistoryRepo.listSessionHistory();
    expect(list).toHaveLength(1);
    expect(list[0]?.taskId).toBe('task-101');
  });

  it('updates session status, finishedAt, and error', () => {
    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-102',
      taskTitle: 'Fix Bug',
      startedAt: '2026-10-06T10:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-task-102',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'Fix bug prompt',
    });

    agentSessionHistoryRepo.updateSessionStatus(
      'task-102',
      'done',
      '2026-10-06T10:15:00.000Z'
    );

    const session = agentSessionHistoryRepo.getSessionById('task-102');
    expect(session?.status).toBe('done');
    expect(session?.finishedAt).toBe('2026-10-06T10:15:00.000Z');
    expect(session?.error).toBeUndefined();

    // Error status update
    agentSessionHistoryRepo.updateSessionStatus(
      'task-102',
      'error',
      '2026-10-06T10:20:00.000Z',
      'Compilation failed'
    );
    const updated = agentSessionHistoryRepo.getSessionById('task-102');
    expect(updated?.status).toBe('error');
    expect(updated?.error).toBe('Compilation failed');
  });

  it('records user feedback chronologically', () => {
    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-103',
      taskTitle: 'Database Migration',
      startedAt: '2026-10-06T10:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-task-103',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'Migrate db',
    });

    agentSessionHistoryRepo.recordUserFeedback('task-103', 'Please add an index on user_id');
    agentSessionHistoryRepo.recordUserFeedback('task-103', 'Make the foreign key nullable');

    const session = agentSessionHistoryRepo.getSessionById('task-103');
    expect(session?.userFeedbackHistory).toHaveLength(2);
    expect(session?.userFeedbackHistory[0]?.feedback).toBe('Please add an index on user_id');
    expect(session?.userFeedbackHistory[1]?.feedback).toBe('Make the foreign key nullable');
    expect(session?.userFeedbackHistory[0]?.timestamp).toBeDefined();
  });

  it('caps history at 100 entries (ring buffer / slice)', () => {
    for (let i = 0; i < 110; i++) {
      agentSessionHistoryRepo.recordSessionStart({
        taskId: `task-cap-${i}`,
        taskTitle: `Task ${i}`,
        startedAt: new Date(Date.now() + i * 1000).toISOString(),
        repoPath: '/workspace/project',
        branchName: `pm-agent/task-${i}`,
        masterModel: 'claude-3-7-sonnet-20250219',
        workerModel: 'claude-3-5-haiku-20241022',
        status: 'running',
        initialPrompt: `Prompt ${i}`,
      });
    }

    const list = agentSessionHistoryRepo.listSessionHistory();
    expect(list.length).toBe(100);
    // Newest is first
    expect(list[0]?.taskId).toBe('task-cap-109');
  });

  it('supports deleteSession and clearAllHistory', () => {
    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-del-1',
      taskTitle: 'Task Delete 1',
      startedAt: '2026-10-06T10:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-del-1',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'Prompt',
    });
    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-del-2',
      taskTitle: 'Task Delete 2',
      startedAt: '2026-10-06T10:01:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-del-2',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'Prompt',
    });

    agentSessionHistoryRepo.deleteSession('task-del-1');
    let list = agentSessionHistoryRepo.listSessionHistory();
    expect(list).toHaveLength(1);
    expect(list[0]?.taskId).toBe('task-del-2');

    agentSessionHistoryRepo.clearAllHistory();
    list = agentSessionHistoryRepo.listSessionHistory();
    expect(list).toHaveLength(0);
  });

  it('keeps distinct session rows for same taskId and updates only active/latest session', () => {
    const sess1 = agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-same-id',
      taskTitle: 'Task Same ID',
      startedAt: '2026-10-06T09:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-same-id',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'done',
      initialPrompt: 'First prompt',
    });

    const sess2 = agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-same-id',
      taskTitle: 'Task Same ID',
      startedAt: '2026-10-06T10:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-same-id',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'Second prompt',
    });

    const list = agentSessionHistoryRepo.listSessionHistory();
    expect(list).toHaveLength(2);
    expect(sess1.sessionId).not.toBe(sess2.sessionId);

    // Feedback sent by taskId should append only to active/latest session (sess2)
    agentSessionHistoryRepo.recordUserFeedback('task-same-id', 'Active session feedback');
    const updatedSess1 = agentSessionHistoryRepo.getSessionById(sess1.sessionId);
    const updatedSess2 = agentSessionHistoryRepo.getSessionById(sess2.sessionId);

    expect(updatedSess1?.userFeedbackHistory).toHaveLength(0);
    expect(updatedSess2?.userFeedbackHistory).toHaveLength(1);
    expect(updatedSess2?.userFeedbackHistory?.[0]?.feedback).toBe('Active session feedback');

    // Deleting sess1 by sessionId does not delete sess2
    agentSessionHistoryRepo.deleteSession(sess1.sessionId);
    const remaining = agentSessionHistoryRepo.listSessionHistory();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.sessionId).toBe(sess2.sessionId);
  });

  it('attaches AI response to latest user feedback', () => {
    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'task-ai-resp',
      taskTitle: 'Test AI Response Pairing',
      startedAt: '2026-10-06T10:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-ai-resp',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'running',
      initialPrompt: 'Prompt',
    });

    agentSessionHistoryRepo.recordUserFeedback('task-ai-resp', 'Please fix the typo in button label');
    agentSessionHistoryRepo.attachAiResponseToLatestFeedback('task-ai-resp', 'I have updated the label to Save');

    const session = agentSessionHistoryRepo.getSessionById('task-ai-resp');
    expect(session?.userFeedbackHistory[0]?.feedback).toBe('Please fix the typo in button label');
    expect(session?.userFeedbackHistory[0]?.aiResponse).toBe('I have updated the label to Save');
  });

  it('safely recovers from malformed localStorage data', () => {
    localStorage.setItem('planner:ghost_dev_session_history', 'corrupted{json');
    const list = agentSessionHistoryRepo.listSessionHistory();
    expect(list).toEqual([]);
  });
});
