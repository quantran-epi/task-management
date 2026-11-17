import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';

/**
 * S1 (scroll-to-bottom) host half: TeamWorkspace must bump a `scrollTrigger` on every valid
 * send and hand it to ChatMessageList through `messageListExtensions`. ChatMessageList consumes
 * it to pin the transcript after the persisted row lands (covered in ChatMessageList.test.tsx).
 * Mirrors the AIChatDrawer wiring; team chat otherwise disables passive follow via onMessageRead.
 *
 * Oracle: specified. The trigger value must increase after exactly one valid submit.
 * Boundary neighbours: whitespace-only submit (must NOT bump) and a second valid submit.
 */

// Capture the latest messageListExtensions handed to the widget.
let latestExtensions: Record<string, unknown> = {};
vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({
    onSubmit,
    messageListExtensions,
  }: {
    onSubmit: (text: string) => void;
    messageListExtensions: Record<string, unknown>;
  }) => {
    latestExtensions = messageListExtensions;
    return (
      <div>
        <button type="button" data-testid="send-valid" onClick={() => onSubmit(' Tin nhắn hợp lệ ')}>
          send valid
        </button>
        <button type="button" data-testid="send-blank" onClick={() => onSubmit('   ')}>
          send blank
        </button>
      </div>
    );
  },
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

describe('TeamWorkspace send scroll trigger', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    send.mockClear();
    latestExtensions = {};
    db = new TaskPlannerDatabase('test-team-send-scroll-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    const lead = await createLead(
      { name: 'Bình Lead', role: 'Lead', capability: 'Điều phối.', persona: 'Bạn là lead.', model: 'claude-opus-4' },
      db
    );
    const employee = await createEmployee(
      { name: 'An Nhân viên', role: 'Phân tích', capability: 'Phân tích.', persona: 'Bạn là An.', model: 'claude-sonnet-4' },
      db
    );
    team = await createTeam(
      { name: 'Nhóm thử', budgetTokens: 1000, leadId: lead.id, employeeIds: [employee.id] },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('bumps the scroll trigger on valid sends but not on whitespace-only submits', async () => {
    render(<TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />);
    // The widget mounts only after the coordinator is ready; wait for the mock's button.
    await screen.findByTestId('send-valid');
    const before = latestExtensions.scrollTrigger;
    expect(typeof before).toBe('number');

    fireEvent.click(screen.getByTestId('send-blank'));
    expect(latestExtensions.scrollTrigger).toBe(before);
    expect(send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('send-valid'));
    await waitFor(() =>
      expect(latestExtensions.scrollTrigger).toBe((before as number) + 1)
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('send-valid'));
    await waitFor(() =>
      expect(latestExtensions.scrollTrigger).toBe((before as number) + 2)
    );
  });
});
