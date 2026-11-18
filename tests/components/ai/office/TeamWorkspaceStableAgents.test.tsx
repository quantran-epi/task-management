// @vitest-environment jsdom
import React, { useMemo } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { agentSnapshotSignature } from '../../../../src/components/ai/office/TeamWorkspace';
import type { AgentRunState } from '../../../../src/types/aiOffice';

/** The panel is memoized on array identity, exactly like AgentActivityPanel in production. */
const MemoPanel = React.memo(({ agents }: { agents: readonly AgentRunState[] }) => (
  <div data-testid="preview">{agents[0]?.steps?.[0]?.resultPreview ?? '(none)'}</div>
));

/**
 * Harness reproducing TeamWorkspace's `stableAgents` useMemo: the signature decides whether
 * the memoized array is released. A regression that drops a rendered field from the signature
 * makes the panel keep the stale preview even though the coordinator emitted a new snapshot.
 */
function Harness({ agents }: { agents: readonly AgentRunState[] }) {
  const signature = agentSnapshotSignature(agents);
  const stableAgents = useMemo(() => agents, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  return <MemoPanel agents={stableAgents} />;
}

function agentWithPreview(resultPreview?: string): AgentRunState[] {
  return [{
    agentId: 'agent-1',
    status: 'running',
    streamingText: '',
    steps: [{
      id: 'call-1',
      label: 'đang gọi tool git_read',
      at: '2026-11-17T09:42:48+07:00',
      toolName: 'git_read · grep',
      phase: 'result',
      startedAt: '2026-11-17T09:42:48+07:00',
      endedAt: '2026-11-17T09:42:48.312+07:00',
      durationMs: 312,
      status: 'done',
      ...(resultPreview === undefined ? {} : { resultPreview }),
    }],
  }];
}

describe('TeamWorkspace stableAgents — every rendered field invalidates the memo (review C)', () => {
  it('a late tool result with the same id/status but a new preview re-renders the panel', () => {
    const first = agentWithPreview('OLD preview');
    const { rerender } = render(<Harness agents={first} />);
    expect(screen.getByTestId('preview')).toHaveTextContent('OLD preview');

    // A new coordinator snapshot: only resultPreview changed, step identity/id/status are the
    // same. The old signature (id:status:phase only) returned the stale array here.
    const second = agentWithPreview('NEW preview from tool result');
    rerender(<Harness agents={second} />);
    expect(screen.getByTestId('preview')).toHaveTextContent('NEW preview from tool result');
  });

  it('does not invalidate when only an unrendered array identity changes', () => {
    const renderSpy = vi.fn();
    const SpyPanel = React.memo(({ agents }: { agents: readonly AgentRunState[] }) => {
      renderSpy();
      return <div>{agents[0]?.steps?.[0]?.resultPreview}</div>;
    });
    function SpyHarness({ agents }: { agents: readonly AgentRunState[] }) {
      const signature = agentSnapshotSignature(agents);
      const stable = useMemo(() => agents, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
      return <SpyPanel agents={stable} />;
    }
    const { rerender } = render(<SpyHarness agents={agentWithPreview('same')} />);
    const callsAfterFirst = renderSpy.mock.calls.length;
    rerender(<SpyHarness agents={agentWithPreview('same')} />);
    expect(renderSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('covers every other rendered step field and agent streamingText', () => {
    const base = agentWithPreview('p');
    const variants: Array<{ label: string; mutate: (a: AgentRunState[]) => void }> = [
      { label: 'durationMs', mutate: (a) => { a[0]!.steps![0]!.durationMs = 999; } },
      { label: 'endedAt', mutate: (a) => { a[0]!.steps![0]!.endedAt = '2026-11-18T00:00:00Z'; } },
      { label: 'detail', mutate: (a) => { a[0]!.steps![0]!.detail = '{"action":"grep"}'; } },
      { label: 'resultPreview', mutate: (a) => { a[0]!.steps![0]!.resultPreview = 'other'; } },
      { label: 'streamingText', mutate: (a) => { a[0]!.streamingText = 'new tokens'; } },
      { label: 'status', mutate: (a) => { a[0]!.status = 'done'; } },
    ];
    const baseSignature = agentSnapshotSignature(base);
    for (const variant of variants) {
      const next = structuredClone(base);
      variant.mutate(next);
      expect(agentSnapshotSignature(next), variant.label).not.toBe(baseSignature);
    }
  });
});
