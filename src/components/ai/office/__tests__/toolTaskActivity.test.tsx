import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentActivityPanel } from '../AgentActivityPanel';
import { agentSnapshotSignature } from '../TeamWorkspace';
import {
  resetToolTaskStoreForTests,
  upsertToolTask,
} from '../../runtime/toolTaskStore';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
  emitTo: vi.fn(async () => {}),
}));

const baseProps = {
  agents: [],
  roster: [],
  debugLogs: [],
  onClearLogs: () => {},
};

beforeEach(() => {
  resetToolTaskStoreForTests();
  vi.useRealTimers();
});

describe('agent snapshot signature', () => {
  it('changes when a tool step gains a result payload without changing id/status', () => {
    const agent = {
      agentId: 'a1', status: 'done' as const, streamingText: '',
      startedAt: '2026-11-22T10:00:00.000Z',
      steps: [{
        id: 'step-1', label: 'step', at: '2026-11-22T10:00:00.000Z',
        status: 'done' as const, detail: '{}',
      }],
    };
    const before = agentSnapshotSignature([agent]);
    const after = agentSnapshotSignature([{
      ...agent,
      steps: [{
        ...agent.steps![0]!,
        resultPreview: 'result',
        durationMs: 42,
        endedAt: '2026-11-22T10:00:01.000Z',
      }],
    }]);
    expect(after).not.toBe(before);
  });
});

describe('store-only tool rows', () => {
  it('shows a cancelled task as cancelled, never as done', () => {
    upsertToolTask({ callId: 'call-1', status: 'cancelled' });
    render(<AgentActivityPanel {...baseProps} />);
    const row = screen.getByTestId('activity-event-call-1');
    expect(row.textContent).toContain('đã hủy');
    expect(row.textContent).not.toContain('xong');
  });

  it('measures the stopwatch from the first running event, not the last output chunk', () => {
    vi.useFakeTimers();
    const start = new Date('2026-11-22T10:00:00.000Z').getTime();
    vi.setSystemTime(start);
    upsertToolTask({ callId: 'explore_repo', status: 'running' });
    vi.setSystemTime(start + 8_000);
    upsertToolTask({ callId: 'explore_repo', stdout: 'chunk' });
    vi.setSystemTime(start + 12_000);
    render(<AgentActivityPanel {...baseProps} />);
    expect(screen.getByTestId('activity-progress-clock').textContent).toContain('00:12');
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByTestId('activity-progress-clock').textContent).toContain('00:15');
  });
});
