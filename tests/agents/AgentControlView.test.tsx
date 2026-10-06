import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AgentControlView } from '../../src/views/AgentControlView';
import { agentSessionHistoryRepo } from '../../src/services/agents/agentSessionHistoryRepo';
import type { AgentSession } from '../../src/types/agent';

// Mock Tauri environment
const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe('AgentControlView Component Tests (GHOST-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (window as any).__TAURI_INTERNALS__ = {};
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    cleanup();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('renders empty state when no agent sessions exist', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    });

    render(<AgentControlView />);

    await waitFor(() => {
      expect(screen.getByText('Chưa có phiên Ghost Dev nào')).toBeInTheDocument();
    });

    expect(screen.getByText('Chưa có phiên Ghost Dev nào được chọn')).toBeInTheDocument();
  });

  it('renders session list, terminal stream view, and diff viewer when active session provided', async () => {
    const mockSessions: AgentSession[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Tối ưu hóa thuật toán lập lịch',
        repoPath: '/Users/test/projects/task-management',
        worktreePath: '/Users/test/projects/task-management/.git/worktrees/task-1',
        branchName: 'pm-agent/task-task-1',
        masterPid: 12345,
        masterModel: 'claude-3-5-sonnet-20241022',
        workerModel: 'claude-3-5-haiku-20241022',
        status: 'running',
        startedAt: '2026-10-05T10:00:00Z',
        activeWorkers: [],
      },
    ];

    const mockDiffOutput = `diff --git a/src/utils/scheduler.ts b/src/utils/scheduler.ts
index 1111111..2222222 100644
--- a/src/utils/scheduler.ts
+++ b/src/utils/scheduler.ts
@@ -1,3 +1,4 @@
 export function schedule() {
+  console.log('optimized');
   return true;
 }`;

    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve(mockSessions);
      }
      if (command === 'get_worktree_diff') {
        return Promise.resolve(mockDiffOutput);
      }
      return Promise.resolve(null);
    });

    render(<AgentControlView />);

    // 1. Session item in left sidebar
    await waitFor(() => {
      expect(screen.getByText('Tối ưu hóa thuật toán lập lịch')).toBeInTheDocument();
    });

    // 2. Terminal log panel in center
    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes('Terminal: Tối ưu hóa thuật toán lập lịch'))
      ).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/Chỉ đạo trực tiếp Master Agent/i)).toBeInTheDocument();

    // 3. Diff reviewer on right
    await waitFor(() => {
      expect(screen.getByText('scheduler.ts')).toBeInTheDocument();
      expect(screen.getByText('Accept All')).toBeInTheDocument();
    });
  });

  it('switches active session when clicking a different session item in the list', async () => {
    const mockSessions: AgentSession[] = [
      {
        taskId: 'task-1',
        taskTitle: 'Tác vụ thứ nhất',
        repoPath: '/repo',
        worktreePath: '/worktree-1',
        branchName: 'pm-agent/task-1',
        masterPid: 1001,
        masterModel: 'claude-3-5-sonnet-20241022',
        workerModel: 'claude-3-5-haiku-20241022',
        status: 'done',
        startedAt: '2026-10-05T09:00:00Z',
        activeWorkers: [],
      },
      {
        taskId: 'task-2',
        taskTitle: 'Tác vụ thứ hai',
        repoPath: '/repo',
        worktreePath: '/worktree-2',
        branchName: 'pm-agent/task-2',
        masterPid: 1002,
        masterModel: 'claude-3-5-sonnet-20241022',
        workerModel: 'claude-3-5-haiku-20241022',
        status: 'running',
        startedAt: '2026-10-05T10:00:00Z',
        activeWorkers: [],
      },
    ];

    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve(mockSessions);
      }
      return Promise.resolve('');
    });

    render(<AgentControlView />);

    await waitFor(() => {
      expect(screen.getByText('Tác vụ thứ nhất')).toBeInTheDocument();
      expect(screen.getByText('Tác vụ thứ hai')).toBeInTheDocument();
    });

    // Default active session was task-2 because it was running.
    await waitFor(() => {
      expect(screen.getByText('Terminal: Tác vụ thứ hai')).toBeInTheDocument();
    });

    // Click on the first session card
    const firstSessionCard = screen.getByText('Tác vụ thứ nhất').closest('.ant-card');
    expect(firstSessionCard).toBeTruthy();
    fireEvent.click(firstSessionCard!);

    // Terminal log header updates to Tác vụ thứ nhất
    await waitFor(() => {
      expect(screen.getByText('Terminal: Tác vụ thứ nhất')).toBeInTheDocument();
    });
  });

  it('toggles between Unified and Side-by-side diff view modes', async () => {
    const mockSessions: AgentSession[] = [
      {
        taskId: 'task-diff',
        taskTitle: 'Thử nghiệm Diff View',
        repoPath: '/repo',
        worktreePath: '/worktree-diff',
        branchName: 'pm-agent/diff',
        masterPid: 2001,
        masterModel: 'claude-3-5-sonnet-20241022',
        workerModel: 'claude-3-5-haiku-20241022',
        status: 'running',
        startedAt: '2026-10-05T10:00:00Z',
        activeWorkers: [],
      },
    ];

    const mockDiff = `diff --git a/test.ts b/test.ts
index 0000000..1111111 100644
--- a/test.ts
+++ b/test.ts
@@ -1,2 +1,2 @@
-old line
+new line`;

    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve(mockSessions);
      }
      if (command === 'get_worktree_diff') {
        return Promise.resolve(mockDiff);
      }
      return Promise.resolve(null);
    });

    render(<AgentControlView />);

    await waitFor(() => {
      expect(screen.getByText('Side-by-side')).toBeInTheDocument();
    });

    // Click Side-by-side toggle
    const sideBySideBtn = screen.getByText('Side-by-side');
    fireEvent.click(sideBySideBtn);

    // Assert that split mode rendered (side-by-side elements appear with diff content)
    await waitFor(() => {
      expect(screen.getByText('old line')).toBeInTheDocument();
      expect(screen.getByText('new line')).toBeInTheDocument();
    });
  });

  it('renders audit history tab and inspects past session prompt and feedback details', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    });

    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'hist-task-1',
      taskTitle: 'Lịch sử thiết kế cơ sở dữ liệu',
      startedAt: '2026-10-06T08:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-hist-1',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'done',
      initialPrompt: 'Master prompt: Tạo schema cho bảng user và orders',
    });
    agentSessionHistoryRepo.recordUserFeedback('hist-task-1', 'Thêm trường phone number');

    render(<AgentControlView />);

    // Switch to Lịch sử tab
    const historyTab = screen.getByText(/Lịch sử \(1\)/i);
    fireEvent.click(historyTab);

    // Assert session is listed
    await waitFor(() => {
      expect(screen.getByText('Lịch sử thiết kế cơ sở dữ liệu')).toBeInTheDocument();
    });
    expect(screen.getByText('1 phản hồi')).toBeInTheDocument();

    // Click "Chi tiết" button
    const detailBtn = screen.getByRole('button', { name: /Chi tiết/i });
    fireEvent.click(detailBtn);

    // Assert Drawer opens with details
    await waitFor(() => {
      expect(screen.getByText('Master Prompt ban đầu')).toBeInTheDocument();
    });
    expect(screen.getByText(/Tạo schema cho bảng user và orders/i)).toBeInTheDocument();
    expect(screen.getByText('Thêm trường phone number')).toBeInTheDocument();
  });

  it('supports deleting an audit session from history', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    });

    agentSessionHistoryRepo.recordSessionStart({
      taskId: 'del-task-1',
      taskTitle: 'Phiên cần xóa',
      startedAt: '2026-10-06T08:00:00.000Z',
      repoPath: '/workspace/project',
      branchName: 'pm-agent/task-del-1',
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      status: 'interrupted',
      initialPrompt: 'Prompt',
    });

    render(<AgentControlView />);

    const historyTab = screen.getByText(/Lịch sử \(1\)/i);
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Phiên cần xóa')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /Xóa lịch sử phiên Phiên cần xóa/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Xóa' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(screen.queryByText('Phiên cần xóa')).not.toBeInTheDocument();
    });
  });

  it('displays active running indicator in terminal when session status is running', async () => {
    const mockSessions: AgentSession[] = [
      {
        taskId: 'task-running-1',
        taskTitle: 'Tác vụ đang xử lý',
        repoPath: '/repo',
        worktreePath: '/worktree',
        branchName: 'pm-agent/task-running-1',
        masterPid: 1005,
        masterModel: 'claude-3-5-sonnet-20241022',
        workerModel: 'claude-3-5-haiku-20241022',
        status: 'running',
        startedAt: '2026-10-06T10:00:00Z',
        activeWorkers: [],
      },
    ];

    mockInvoke.mockImplementation((command: string) => {
      if (command === 'list_agent_sessions') {
        return Promise.resolve(mockSessions);
      }
      return Promise.resolve(null);
    });

    render(<AgentControlView />);

    await waitFor(() => {
      expect(screen.getByText('Claude AI đang xử lý / suy nghĩ...')).toBeInTheDocument();
    });
  });
});
