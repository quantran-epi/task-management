import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createEmployee, createLead } from '../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../src/db/repositories/aiTeamRepo';
import {
  ensureTeamThread,
  saveTeamMessage,
} from '../../src/db/repositories/teamTranscriptRepo';
import { appendForExistingMessage } from '../../src/services/ai/office/teamEventLog';
import { setActiveTeamView } from '../../src/services/ai/office/activeTeamView';
import { USER_PARTICIPANT_ID } from '../../src/types/teamChat';
import type { AiTeam } from '../../src/types/aiOffice';

/**
 * 37.1 R13: the notification channel.
 *
 * The rule the user stated: focused on the team's transcript → no OS notification (the
 * transcript is already on screen); anywhere else → notify for every agent/lead message.
 * The trigger is the log itself, so it is real-time by construction.
 */

const sendDesktopNotification = vi.fn(async (_payload: { title: string; body: string }) => true);
vi.mock('../../src/utils/desktopNotification', () => ({
  sendDesktopNotification: (payload: { title: string; body: string }) =>
    sendDesktopNotification(payload),
  isNotificationPermissionGranted: async () => true,
  isTauriEnvironment: () => false,
}));

import { useTeamChatNotifications } from '../../src/hooks/useTeamChatNotifications';

function Harness({ db }: { db: TaskPlannerDatabase }) {
  useTeamChatNotifications(db);
  return null;
}

describe('useTeamChatNotifications (37.1 R13)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;
  let threadId: string;
  let leadId: string;

  beforeEach(async () => {
    sendDesktopNotification.mockClear();
    setActiveTeamView(null);
    db = new TaskPlannerDatabase('test-team-notify-' + Math.random().toString(36).slice(2));
    await db.open();
    const lead = await createLead(
      { name: 'Bình Lead', role: 'Lead', capability: 'x', persona: 'y', model: 'm' },
      db
    );
    leadId = lead.id;
    const employee = await createEmployee(
      { name: 'An Nhân viên', role: 'Phân tích', capability: 'x', persona: 'y', model: 'm' },
      db
    );
    team = await createTeam(
      { name: 'Nhóm thử', status: 'active', budgetTokens: 1000, leadId: lead.id, employeeIds: [employee.id] },
      db
    );
    threadId = (await ensureTeamThread(team.id, db)).id;
  });

  afterEach(async () => {
    setActiveTeamView(null);
    await db.delete();
    vi.restoreAllMocks();
  });

  const seedFromLead = async (content: string) => {
    const row = await saveTeamMessage(
      { threadId, role: 'assistant', content, agentId: leadId, agentName: 'Bình Lead' },
      db
    );
    await appendForExistingMessage(
      { id: row.id, teamId: team.id, from: leadId, to: [USER_PARTICIPANT_ID], content, kind: 'chat', createdAt: row.createdAt },
      db
    );
    return row;
  };

  it('notifies when the user is not looking at that team', async () => {
    render(<Harness db={db} />);
    await seedFromLead('Đã tổng hợp xong.');

    await waitFor(() => expect(sendDesktopNotification).toHaveBeenCalled());
    const payload = sendDesktopNotification.mock.calls[0]![0];
    expect(payload.title).toContain('Bình Lead');
    expect(payload.title).toContain('Nhóm thử');
    expect(payload.body).toContain('Đã tổng hợp xong.');
  });

  it('stays silent while that team is the one on screen', async () => {
    setActiveTeamView(team.id);
    render(<Harness db={db} />);
    await seedFromLead('Tin trong nhóm đang mở.');

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(sendDesktopNotification).not.toHaveBeenCalled();
  });

  it('notifies for a different team even while one team is open', async () => {
    const other = await createTeam(
      { name: 'Nhóm khác', status: 'active', budgetTokens: 1000, leadId },
      db
    );
    const otherThread = (await ensureTeamThread(other.id, db)).id;
    setActiveTeamView(team.id);

    render(<Harness db={db} />);
    const row = await saveTeamMessage(
      { threadId: otherThread, role: 'assistant', content: 'Tin nhóm khác', agentId: leadId, agentName: 'Bình Lead' },
      db
    );
    await appendForExistingMessage(
      { id: row.id, teamId: other.id, from: leadId, to: [USER_PARTICIPANT_ID], content: row.content, kind: 'chat', createdAt: row.createdAt },
      db
    );

    await waitFor(() => expect(sendDesktopNotification).toHaveBeenCalled());
    expect(sendDesktopNotification.mock.calls[0]![0].title).toContain('Nhóm khác');
  });

  it('never notifies for the user’s own message', async () => {
    render(<Harness db={db} />);
    const row = await saveTeamMessage(
      { threadId, role: 'user', content: 'Tin của tôi' },
      db
    );
    await appendForExistingMessage(
      { id: row.id, teamId: team.id, from: USER_PARTICIPANT_ID, to: [leadId], content: row.content, kind: 'chat', createdAt: row.createdAt },
      db
    );

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(sendDesktopNotification).not.toHaveBeenCalled();
  });

  it('notifies each message once, not once per re-render', async () => {
    render(<Harness db={db} />);
    await seedFromLead('Tin một.');
    await waitFor(() => expect(sendDesktopNotification).toHaveBeenCalledTimes(1));

    await seedFromLead('Tin hai.');
    await waitFor(() => expect(sendDesktopNotification).toHaveBeenCalledTimes(2));
  });
});
