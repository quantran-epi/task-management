import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AgentActivityPanel,
  type ActivityRosterEntry,
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
