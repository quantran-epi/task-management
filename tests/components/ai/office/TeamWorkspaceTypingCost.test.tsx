import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import {
  ensureTeamThread,
  saveTeamMessage,
} from '../../../../src/db/repositories/teamTranscriptRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';

// Regression: typing must not re-render existing transcript rows.
const bubbleRenders = vi.fn();

vi.mock('../../../../src/components/ai/ChatMessageBubble', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/components/ai/ChatMessageBubble')>();
  return {
    ...actual,
    ChatMessageBubble: (props: { message: { id: string } }) => {
      bubbleRenders(props.message.id);
      return <div data-testid={`probe-bubble-${props.message.id}`} />;
    },
  };
});

vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => ({
      send: vi.fn(async () => 'started'),
      stopAgent: vi.fn(),
      abortAll: vi.fn(),
      resolvePlan: vi.fn(),
      resolveApproval: vi.fn(),
      topUp: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      setTeamSettings: vi.fn(),
      setTeamBudget: vi.fn(),
      setTeamThresholdPct: vi.fn(),
      setGlobalThresholdPct: vi.fn(),
      getRunningCount: () => 0,
      finalizeAttempt: vi.fn(async () => null),
      runBatch: vi.fn(async () => ''),
      retryAssignment: vi.fn(async () => undefined),
      subscribe: () => () => {},
      getState: () => makeTeamRunSnapshot({ phase: 'ready' }),
    })),
  };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace composer typing cost (37.1 UAT gap 10)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;
  let threadId: string;
  let leadRow: Awaited<ReturnType<typeof createLead>>;

  beforeEach(async () => {
    bubbleRenders.mockClear();
    db = new TaskPlannerDatabase('test-team-typing-cost-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    leadRow = await createLead(
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
        budgetTokens: 1000,
        leadId: leadRow.id,
        employeeIds: [employee.id],
      },
      db
    );
    threadId = (await ensureTeamThread(team.id, db)).id;
    for (let index = 0; index < 40; index += 1) {
      await saveTeamMessage(
        {
          threadId,
          role: 'assistant',
          content: `Tin ${index}`,
          agentId: leadRow.id,
          agentName: 'Bình Lead',
        },
        db
      );
    }
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('does not re-render existing transcript rows on a keystroke', async () => {
    render(
      <TeamWorkspace
        team={team}
        lead={leadRow}
        members={[]}
        employees={[]}
        skills={[]}
        db={db}
      />
    );

    const composer = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    await screen.findAllByTestId(/^probe-bubble-/, undefined, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    bubbleRenders.mockClear();
    fireEvent.change(composer, { target: { value: 'a' } });

    expect(bubbleRenders).not.toHaveBeenCalled();
  });
});
