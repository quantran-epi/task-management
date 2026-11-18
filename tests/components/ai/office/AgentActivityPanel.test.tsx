import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  AgentActivityPanel,
  type ActivityRosterEntry,
  type TeamDebugLog,
} from '../../../../src/components/ai/office/AgentActivityPanel';
import type { AgentRunState } from '../../../../src/types/aiOffice';

const ROSTER: ActivityRosterEntry[] = [
  { id: 'lead-1', name: 'Bình Lead', isLead: true },
  { id: 'agent-1', name: 'Reviewer' },
];

const noop = () => {};

describe('AgentActivityPanel — one live tool call end-to-end (44-03 Task 1)', () => {
  it('renders a done tool-call row collapsed by default and expands its capped preview', () => {
    const agents: AgentRunState[] = [{
      agentId: 'agent-1',
      status: 'running',
      streamingText: '',
      steps: [{
        id: 'call-1',
        label: 'đang gọi tool git_read',
        at: '2026-11-17T09:42:48+07:00',
        detail: '{"action":"grep","pattern":"PaymentService"}',
        toolName: 'git_read · grep',
        phase: 'result',
        startedAt: '2026-11-17T09:42:48+07:00',
        endedAt: '2026-11-17T09:42:48.312+07:00',
        durationMs: 312,
        status: 'done',
        resultPreview: 'src/payments/PaymentService.ts:18  export class PaymentService {',
      }],
    }];

    const { container } = render(
      <AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />
    );

    // status icon + text, tool name, agent, timestamp and duration all present.
    expect(screen.getByText('git_read · grep')).toBeInTheDocument();
    expect(screen.getByText(/Reviewer · xong/)).toBeInTheDocument();
    expect(screen.getByText('312ms')).toBeInTheDocument();
    expect(screen.getByText(/09:42:48/)).toBeInTheDocument();

    const toggle = screen.getByTestId('activity-event-toggle-call-1');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const detail = container.querySelector('#activity-detail-call-1') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail.hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(detail.hidden).toBe(false);
    expect(screen.getByText(/PaymentService.ts:18/)).toBeInTheDocument();
    // Untrusted tool output is rendered as escaped text, never as injected HTML.
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });
});

function stepRow(overrides: Partial<import('../../../../src/types/aiOffice').AgentLiveStep>): import('../../../../src/types/aiOffice').AgentLiveStep {
  return {
    id: 'row',
    label: 'đang gọi tool',
    at: '2026-11-17T09:42:48+07:00',
    toolName: 'git_read',
    phase: 'result',
    startedAt: '2026-11-17T09:42:48+07:00',
    status: 'done',
    ...overrides,
  };
}

describe('AgentActivityPanel — tabs and a11y (44-03 Task 2)', () => {
  it('renders both tabs with role/aria-selected/aria-controls and switches panels', () => {
    render(<AgentActivityPanel agents={[]} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);

    expect(screen.getByRole('tablist', { name: 'Panel sections' })).toBeInTheDocument();
    const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
    const promptsTab = screen.getByRole('tab', { name: 'Prompt log' });
    expect(timelineTab).toHaveAttribute('aria-selected', 'true');
    expect(timelineTab).toHaveAttribute('aria-controls', 'activity-panel-timeline');
    expect(promptsTab).toHaveAttribute('aria-selected', 'false');
    expect(promptsTab).toHaveAttribute('aria-controls', 'activity-panel-prompts');

    expect(screen.getByTestId('activity-tabpanel-timeline').hidden).toBe(false);
    fireEvent.click(promptsTab);
    expect(promptsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('activity-tabpanel-prompts').hidden).toBe(false);
    expect(screen.getByTestId('activity-tabpanel-timeline').hidden).toBe(true);
  });

  it('groups filter pills under a labelled group and narrows rows by agent', () => {
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [stepRow({ id: 'r-reviewer', toolName: 'git_read' })],
    }, {
      agentId: 'lead-1', status: 'running', streamingText: '',
      steps: [stepRow({ id: 'r-lead', toolName: 'delegate_batch' })],
    }];
    render(<AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);

    expect(screen.getByRole('group', { name: 'Lọc theo agent' })).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-r-reviewer')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-r-lead')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('activity-filter-agent-1'));
    expect(screen.getByTestId('activity-filter-agent-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('activity-event-r-reviewer')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-event-r-lead')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('activity-filter-all'));
    expect(screen.getByTestId('activity-event-r-lead')).toBeInTheDocument();
  });
});

describe('AgentActivityPanel — explore progress (44-03 Task 2)', () => {
  it('shows an elapsed/deadline progress card for a running explore_repo, derived from serialized args', () => {
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [stepRow({
        id: 'explore-1',
        toolName: 'explore_repo',
        phase: 'call',
        status: 'running',
        startedAt: new Date(Date.now() - 83_000).toISOString(),
        detail: JSON.stringify({ question: 'luồng xử lý thanh toán đi qua module nào', timeoutSeconds: 300 }),
        label: 'đang gọi tool explore_repo',
      })],
    }];
    render(<AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);

    const card = screen.getByTestId('activity-progress-card');
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain('explore_repo');
    // deadline derived from timeoutSeconds=300 -> 05:00; elapsed ~01:23
    expect(screen.getByTestId('activity-progress-clock').textContent).toMatch(/^\d{2}:\d{2} \/ 05:00$/);
    expect(card.textContent).toMatch(/luồng xử lý thanh toán/);
    expect(card.textContent).toContain('Hết giờ → báo cáo một phần + detail: timeout; agent tự tiếp tục.');
    expect(card.querySelector('.ant-progress')).not.toBeNull();
    // App-level call only: no nested remote CLI steps leak into the card.
    expect(card.textContent).not.toMatch(/Read \/etc|nested|claude -p/);
  });

  it('clamps an out-of-range serialized timeoutSeconds to the 60..900 window', () => {
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [stepRow({
        id: 'explore-2', toolName: 'explore_repo', phase: 'call', status: 'running',
        detail: JSON.stringify({ question: 'q', timeoutSeconds: 9999 }),
      })],
    }];
    render(<AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);
    // 9999 clamps to 900 -> 15:00
    expect(screen.getByTestId('activity-progress-clock').textContent).toMatch(/ \/ 15:00$/);
  });

  it('advances the elapsed clock on its own ticker even without a re-render (UI-REVIEW WR-01)', () => {
    vi.useFakeTimers();
    const realNow = Date.now();
    vi.setSystemTime(realNow);
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [stepRow({
        id: 'explore-tick', toolName: 'explore_repo', phase: 'call', status: 'running',
        startedAt: new Date(realNow).toISOString(),
        detail: JSON.stringify({ question: 'q', timeoutSeconds: 300 }),
        label: 'đang gọi tool explore_repo',
      })],
    }];
    try {
      render(<AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);
      const clock = screen.getByTestId('activity-progress-clock');
      expect(clock.textContent).toMatch(/^00:00 \/ 05:00$/);

      // No prop change / re-render: advance the fake clock only. The card must still tick.
      act(() => {
        vi.advanceTimersByTime(62_000);
      });
      expect(clock.textContent).toMatch(/^01:02 \/ 05:00$/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AgentActivityPanel — overflow backstop and states (44-03 Task 2)', () => {
  it('caps an 8000+ char preview and wraps it in its own scrolling container', () => {
    const huge = 'x'.repeat(9_000);
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [stepRow({ id: 'huge', detail: huge })],
    }];
    const { container } = render(
      <AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />
    );
    fireEvent.click(screen.getByTestId('activity-event-toggle-huge'));
    const pre = container.querySelector('pre.activity-preview') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.textContent).toContain('… (đã rút gọn)');
    expect(pre.textContent!.length).toBeLessThanOrEqual(8_000 + 40);
    expect(pre.style.whiteSpace).toBe('pre-wrap');
    expect(pre.style.wordBreak).toBe('break-word');
    expect(pre.style.overflowY).toBe('auto');
    // every flex child pins minWidth:0 so the rail cannot widen the document
    const rail = screen.getByTestId('agent-activity-panel');
    expect(rail.style.minWidth).toBe('0px');
  });

  it('renders the empty Timeline and empty Prompt log copy', () => {
    render(<AgentActivityPanel agents={[]} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);
    expect(screen.getByText('Chưa có tool call nào')).toBeInTheDocument();
    expect(screen.getByText(/Các lời gọi công cụ của agent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt log' }));
    expect(screen.getByText('Chưa có lượt gửi AI nào trong phiên này.')).toBeInTheDocument();
  });

  it('shows status icon + text for done, running and error rows', () => {
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [
        stepRow({ id: 's-done', status: 'done', toolName: 'git_read' }),
        stepRow({ id: 's-running', status: 'running', phase: 'call', toolName: 'read_file' }),
        stepRow({ id: 's-error', status: 'error', toolName: 'diff_file', resultPreview: '{"refused":true,"code":"INVALID_ARGUMENT"}' }),
      ],
    }];
    render(<AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);

    expect(screen.getByTestId('activity-event-s-done').textContent).toContain('xong');
    expect(screen.getByTestId('activity-event-s-running').textContent).toContain('đang chạy');
    expect(screen.getByTestId('activity-event-s-error').textContent).toContain('lỗi');
    // status legend present
    expect(screen.getByText('✓ xong')).toBeInTheDocument();
    expect(screen.getByText('› đang chạy')).toBeInTheDocument();
    expect(screen.getByText('! lỗi')).toBeInTheDocument();
    // error copy is documented and rendered inside the row detail
    fireEvent.click(screen.getByTestId('activity-event-toggle-s-error'));
    expect(screen.getByTestId('activity-error-copy').textContent).toContain('Không đọc được kết quả tool');
  });

  it('renders a running row placeholder when no result is present', () => {
    const agents: AgentRunState[] = [{
      agentId: 'agent-1', status: 'running', streamingText: '',
      steps: [stepRow({ id: 's-run', status: 'running', phase: 'call' })],
    }];
    render(<AgentActivityPanel agents={agents} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);
    fireEvent.click(screen.getByTestId('activity-event-toggle-s-run'));
    expect(screen.getByText('Chưa có kết quả…')).toBeInTheDocument();
  });
});

describe('AgentActivityPanel — Prompt log migration (44-03 Task 3)', () => {
  const log: TeamDebugLog = {
    timestamp: '09:43:11',
    agentId: 'agent-1',
    agentName: 'Reviewer',
    agentKind: 'employee',
    model: 'claude-haiku',
    text: 'Rà soát repo theo CR-204…',
    systemMessages: ['Bạn là reviewer, chỉ đọc repo.'],
    toolNames: ['git_read', 'explore_repo'],
  };

  it('renders every preserved field of a prompt-history entry', () => {
    render(<AgentActivityPanel agents={[]} roster={ROSTER} debugLogs={[log]} onClearLogs={noop} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt log' }));

    const entry = screen.getByTestId('activity-prompt-entry-0');
    expect(entry).toBeInTheDocument();
    expect(screen.getByTestId('activity-prompt-kind').textContent).toContain('EMPLOYEE: Reviewer');
    expect(entry.textContent).toContain('09:43:11');
    expect(entry.textContent).toContain('claude-haiku');
    expect(entry.textContent).toContain('git_read, explore_repo');
    expect(screen.getByTestId('activity-prompt-text').textContent).toContain('Rà soát repo theo CR-204');
    expect(screen.getByTestId('activity-prompt-system').textContent).toContain('chỉ đọc repo');
    expect(screen.getByTestId('activity-prompt-copy')).toBeInTheDocument();
  });

  it('opens the Popconfirm with the exact copy and calls onClearLogs on confirm', () => {
    const onClearLogs = vi.fn();
    render(<AgentActivityPanel agents={[]} roster={ROSTER} debugLogs={[log]} onClearLogs={onClearLogs} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt log' }));

    fireEvent.click(screen.getByTestId('activity-clear-logs'));
    expect(screen.getByText('Xóa toàn bộ nhật ký prompt trong phiên này? Không thể hoàn tác.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeInTheDocument();
    expect(onClearLogs).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onClearLogs).toHaveBeenCalledTimes(1);
  });

  it('renders the preserved empty-state copy when there are no logs', () => {
    render(<AgentActivityPanel agents={[]} roster={ROSTER} debugLogs={[]} onClearLogs={noop} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt log' }));
    expect(screen.getByTestId('activity-prompts-empty').textContent).toBe(
      'Chưa có lượt gửi AI nào trong phiên này.'
    );
  });
});
