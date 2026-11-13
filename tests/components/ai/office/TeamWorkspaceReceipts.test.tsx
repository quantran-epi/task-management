import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, configure } from '@testing-library/react';
configure({ asyncUtilTimeout: 5000 });
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import {
  ensureTeamThread,
  saveTeamMessage,
} from '../../../../src/db/repositories/teamTranscriptRepo';
import {
  advanceCursor,
  appendForExistingMessage,
} from '../../../../src/services/ai/office/teamEventLog';
import { USER_PARTICIPANT_ID } from '../../../../src/types/teamChat';
import type { AiTeam } from '../../../../src/types/aiOffice';

/**
 * 37.1 R10/R11/R13: the user is a participant, so the receipts work in both directions.
 *
 * These are the three properties a chat has and a log does not: a message you received says
 * you read it, a message you sent says who read it, and a message you have not looked at is
 * counted. All three read the SAME cursor table, so they can never disagree.
 */

const notificationPermission = vi.hoisted(() => ({
  check: vi.fn(async () => true),
  request: vi.fn(async () => true),
}));
vi.mock('../../../../src/utils/desktopNotification', () => ({
  isNotificationPermissionGranted: notificationPermission.check,
  requestNotificationPermission: notificationPermission.request,
}));

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

describe('TeamWorkspace receipts (37.1 R10, R11, R13)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;
  let threadId: string;
  let leadId: string;
  let employeeId: string;
  let leadRow: Awaited<ReturnType<typeof createLead>>;
  let employeeRow: Awaited<ReturnType<typeof createEmployee>>;

  beforeEach(async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    notificationPermission.check.mockResolvedValue(true);
    notificationPermission.request.mockReset().mockResolvedValue(true);
    db = new TaskPlannerDatabase('test-team-receipts-' + Math.random().toString(36).slice(2));
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
    leadId = lead.id;
    leadRow = lead;
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
    employeeId = employee.id;
    employeeRow = employee;
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
    threadId = (await ensureTeamThread(team.id, db)).id;
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  const renderWorkspace = () =>
    render(
      <TeamWorkspace
        team={team}
        lead={leadRow}
        members={[
          { id: 'm-lead', teamId: team.id, agentId: leadId, role: 'lead', budgetTokens: 0, usedTokens: 0 },
          {
            id: 'm-emp',
            teamId: team.id,
            agentId: employeeId,
            role: 'employee',
            budgetTokens: 0,
            usedTokens: 0,
          },
        ]}
        employees={[employeeRow]}
        skills={[]}
        db={db}
        onBack={() => {}}
      />
    );

  /** One message from the lead to the user, in both projections. */
  const seedLeadMessage = async (content: string) => {
    const row = await saveTeamMessage(
      { threadId, role: 'assistant', content, agentId: leadId, agentName: 'Bình Lead' },
      db
    );
    await appendForExistingMessage(
      {
        id: row.id,
        teamId: team.id,
        from: leadId,
        to: [USER_PARTICIPANT_ID],
        content,
        kind: 'synthesis',
        createdAt: row.createdAt,
      },
      db
    );
    return row;
  };

  const markRead = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc' }));
  };

  it('requests notification permission only after explicit click and reports denial', async () => {
    notificationPermission.check.mockResolvedValue(false);
    notificationPermission.request.mockResolvedValue(false);
    renderWorkspace();
    const enable = await screen.findByRole('button', { name: 'Bật thông báo' });
    expect(notificationPermission.request).not.toHaveBeenCalled();
    fireEvent.click(enable);
    await screen.findByText(/Chưa cấp được quyền thông báo/);
    expect(notificationPermission.request).toHaveBeenCalledTimes(1);
  });

  it('R11: opening preserves unread until explicit acknowledgement', async () => {
    await seedLeadMessage('Đã tổng hợp xong.');
    renderWorkspace();
    await screen.findByTestId('team-new-divider');
    expect(await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`)).toBeUndefined();
    await markRead();

    await waitFor(async () => {
      const cursor = await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`);
      expect(cursor?.lastSeq).toBe(1);
    });
  });

  it('R11: a hidden tab never marks messages read', async () => {
    const spy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden' as DocumentVisibilityState);
    await seedLeadMessage('Tin đến khi tab đang ẩn.');
    renderWorkspace();

    // Give the effect every chance to run, then prove it did not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const cursor = await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`);
    expect(cursor).toBeUndefined();
    spy.mockRestore();
  });

  it('R10: a message the user received shows a read receipt once the cursor covers it', async () => {
    const row = await seedLeadMessage('Bạn xem giúp mình mục này.');
    renderWorkspace();
    await markRead();

    await waitFor(async () => {
      const receipt = await screen.findByTestId(`seen-${row.id}`);
      expect(receipt.textContent).toBe('✓✓');
    });
  });

  it('R13: a hidden tab shows the unread count and the "Tin mới" divider', async () => {
    const spy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden' as DocumentVisibilityState);
    await seedLeadMessage('Tin một.');
    await seedLeadMessage('Tin hai.');
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId('team-unread-badge').textContent).toContain('2 tin mới');
      expect(screen.getByText('Tin mới')).toBeInTheDocument();
    });
    spy.mockRestore();
  });

  it('R13: returning to the tab keeps the badge until the user scrolls', async () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden' as DocumentVisibilityState);
    await seedLeadMessage('Tin đến khi tab đang ẩn.');
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId('team-unread-badge')).toBeInTheDocument();
    });

    // Back to the visible tab. The transcript is still not "read" — nothing was scrolled by
    // the user — so the badge must survive the focus event.
    visibility.mockReturnValue('visible' as DocumentVisibilityState);
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('team-unread-badge')).toBeInTheDocument();
    visibility.mockRestore();
  });

  it('desktop blur and refocus preserve unread and do not scroll past its marker', async () => {
    await seedLeadMessage('Tin chưa đọc.');
    const scroll = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const focus = vi.mocked(document.hasFocus);
      focus.mockReturnValue(false);
      renderWorkspace();
      await screen.findByTestId('team-new-divider');
      focus.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));
      await seedLeadMessage('Tin tiếp theo.');
      await screen.findByText('Tin tiếp theo.');
      expect(await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`)).toBeUndefined();
      expect(scroll.mock.calls.some(([options]) => options?.block === 'start')).toBe(true);
      expect(scroll.mock.calls.some(([options]) => options?.block !== 'start')).toBe(false);
      await markRead();
      await waitFor(async () => {
        expect((await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`))?.lastSeq).toBe(2);
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = previous;
    }
  });

  it('acknowledges unread only after focused user scroll reaches bottom', async () => {
    await seedLeadMessage('Tin cần cuộn để đọc.');
    renderWorkspace();
    const marker = await screen.findByTestId('team-new-divider');
    const viewport = marker.closest('[tabindex="0"]') as HTMLElement;
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 400 },
    });
    viewport.scrollTop = 800;
    fireEvent.scroll(viewport);
    expect(await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`)).toBeUndefined();
    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    await waitFor(async () => {
      expect((await db.teamReadCursors.get(`${team.id}:${USER_PARTICIPANT_ID}`))?.lastSeq).toBe(1);
    });
  });

  it('R13: reading everything clears the badge', async () => {
    await seedLeadMessage('Tin duy nhất.');
    renderWorkspace();
    await markRead();

    await waitFor(() => {
      expect(screen.queryByTestId('team-unread-badge')).not.toBeInTheDocument();
    });
  });

  it('R10: a message the user sent shows who read it', async () => {
    const row = await saveTeamMessage(
      { threadId, role: 'user', content: 'Làm báo cáo giúp mình' },
      db
    );
    await appendForExistingMessage(
      {
        id: row.id,
        teamId: team.id,
        from: USER_PARTICIPANT_ID,
        to: [leadId],
        content: row.content,
        kind: 'chat',
        createdAt: row.createdAt,
      },
      db
    );
    await advanceCursor(team.id, leadId, 1, db);
    renderWorkspace();

    await waitFor(async () => {
      const receipt = await screen.findByTestId(`seen-${row.id}`);
      expect(receipt.textContent).toBe('✓✓');
    });
  });

  it('names who a message is addressed to', async () => {
    const row = await saveTeamMessage(
      { threadId, role: 'assistant', content: 'Java có kiểu Integer không?', agentId: leadId, agentName: 'Bình Lead' },
      db
    );
    await appendForExistingMessage(
      {
        id: row.id,
        teamId: team.id,
        from: leadId,
        to: [employeeId],
        content: row.content,
        kind: 'chat',
        createdAt: row.createdAt,
      },
      db
    );
    renderWorkspace();

    const label = await screen.findByTestId(`addressed-to-${row.id}`);
    expect(label.textContent).toContain('An Nhân viên');
  });

  it('an agent reply to the leader still shows the USER as a reader', async () => {
    const row = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Có, Integer là kiểu wrapper.',
        agentId: employeeId,
        agentName: 'An Nhân viên',
      },
      db
    );
    // Addressed to the LEAD — the user is not a recipient, yet the user has read it.
    await appendForExistingMessage(
      {
        id: row.id,
        teamId: team.id,
        from: employeeId,
        to: [leadId],
        content: row.content,
        kind: 'report',
        createdAt: row.createdAt,
      },
      db
    );
    renderWorkspace();
    await markRead();

    await waitFor(async () => {
      const receipt = await screen.findByTestId(`seen-${row.id}`);
      expect(receipt.textContent).toBe('✓✓');
    });
  });

  it('R14: a reply renders the message it answers', async () => {
    const question = await saveTeamMessage(
      { threadId, role: 'user', content: 'Luồng đối soát có vấn đề gì?' },
      db
    );
    const answer = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Có ba điểm nghẽn.',
        agentId: employeeId,
        agentName: 'An Nhân viên',
        replyToId: question.id,
      },
      db
    );

    renderWorkspace();

    const quote = await screen.findByTestId(`reply-quote-${answer.id}`);
    expect(quote.textContent).toContain('Luồng đối soát có vấn đề gì?');
    expect(quote.textContent).toContain('Bạn');
  });
});
