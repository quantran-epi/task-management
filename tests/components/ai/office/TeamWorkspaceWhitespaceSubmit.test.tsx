import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import { ensureTeamThread } from '../../../../src/db/repositories/teamTranscriptRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';

/**
 * 37-06 backstop, at the guard itself. `TeamWorkspaceSteer.test.tsx` proves the property
 * through the real composer — but `ChatInputBar` trims before calling `onSubmit`, so that
 * test cannot distinguish `TeamWorkspace.handleSubmit`'s own `if (!text.trim()) return`.
 * Removing that line left the composer test green, so this file mocks the widget and calls
 * `onSubmit` with raw whitespace, exactly as a caller could. 37.1: there is no outbox any
 * more, so "queued" is asserted as "no outbox panel exists at all".
 */

vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({ onSubmit }: { onSubmit: (text: string) => void }) => (
    <div>
      {['   ', '\n\t'].map((text, index) => (
        <button key={text} type="button" data-testid={`raw-submit-${index}`} onClick={() => onSubmit(text)}>
          {`submit ${index}`}
        </button>
      ))}
    </div>
  ),
}));

const send = vi.fn(async () => 'started' as const);
vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => ({
      send,
      stopAgent: vi.fn(),
      abortAll: vi.fn(),
      resolvePlan: vi.fn(),
      resolveApproval: vi.fn(),
      topUp: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      setTeamSettings: vi.fn(),
      setTeamBudget: vi.fn(),
      getRunningCount: () => 0,
      finalizeAttempt: vi.fn(async () => null),
      runBatch: vi.fn(async () => ''),
      retryAssignment: vi.fn(async () => undefined),
      subscribe: () => () => {},
      getState: () => ({
        phase: 'ready',
        agents: [],
        pendingPlan: null,
        pendingApproval: null,
        pausedAgentId: null,
        pausedAgentName: null,
        lastPlan: null,
        lastPlanDecision: null,
      }),
    })),
  };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace whitespace submit guard (37-06)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    send.mockClear();
    db = new TaskPlannerDatabase('test-team-ws-guard-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    const lead = await createLead(
      {
        name: 'Bình Lead',
        role: 'Lead',
        capability: 'Điều phối.',
        persona: 'Bạn là lead.',
        model: 'claude-opus-4',
      },
      db
    );
    const employee = await createEmployee(
      {
        name: 'An Nhân viên',
        role: 'Phân tích',
        capability: 'Phân tích.',
        persona: 'Bạn là An.',
        model: 'claude-sonnet-4',
      },
      db
    );
    team = await createTeam(
      {
        name: 'Nhóm thử',
        status: 'active',
        budgetTokens: 1000,
        leadId: lead.id,
        employeeIds: [employee.id],
      },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('never sends, queues or persists a whitespace-only submit', async () => {
    render(
      <TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} onBack={() => {}} />
    );

    for (const index of [0, 1]) {
      (await screen.findByTestId(`raw-submit-${index}`)).click();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByTestId('team-outbox')).not.toBeInTheDocument();

    const thread = await ensureTeamThread(team.id, db);
    const messages = await db.chatMessages.where('threadId').equals(thread.id).toArray();
    expect(messages).toHaveLength(0);
  });
});
