import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { USER_PARTICIPANT_ID } from '../types/teamChat';
import { cursorId } from '../types/teamChat';
import { sendDesktopNotification, isNotificationPermissionGranted } from '../utils/desktopNotification';
import { getActiveTeamView } from '../services/ai/office/activeTeamView';

/**
 * 37.1 R13: a team message the user has not read raises an OS notification, in real time.
 *
 * The trigger is the log itself — a `liveQuery` on `teamMessages` — not a timer and not a
 * component that happens to be mounted. A message arriving while the user is working
 * somewhere else therefore notifies without any interaction.
 *
 * Nothing notifies while the user is looking at that team: the transcript and the in-app
 * badge are the channel then. Every message from an agent or the lead notifies when the user
 * is elsewhere — another tab, another view, or a blurred window.
 */
export function useTeamChatNotifications(db: TaskPlannerDatabase = defaultDb): void {
  /** Ids already notified, so a re-render or a republish cannot notify twice. */
  const notifiedRef = useRef<Set<string>>(new Set());

  const pending = useLiveQuery(async () => {
    const teams = await db.aiTeams.toArray();
    const rows: Array<{ teamId: string; teamName: string; from: string; content: string; id: string }> = [];
    for (const team of teams) {
      const cursor = await db.teamReadCursors.get(cursorId(team.id, USER_PARTICIPANT_ID));
      const unread = await db.teamMessages
        .where('[teamId+seq]')
        .between([team.id, cursor?.lastSeq ?? 0], [team.id, Infinity], false, false)
        .toArray();
      for (const message of unread) {
        if (message.from === USER_PARTICIPANT_ID) continue;
        rows.push({
          id: message.id,
          teamId: team.id,
          teamName: team.name,
          from: message.from,
          content: message.content,
        });
      }
    }
    return rows;
  }, [db]);

  useEffect(() => {
    if (!pending || pending.length === 0) return;
    // Focused on this team's transcript → the message is already on screen. Notify for the
    // OTHER teams, and for every team when the window is hidden or blurred.
    const focusedTeam = typeof document !== 'undefined' && document.visibilityState === 'visible'
      ? getActiveTeamView()
      : null;
    const toNotify = pending.filter((row) => row.teamId !== focusedTeam);
    if (toNotify.length === 0) return;

    void (async () => {
      if (!(await isNotificationPermissionGranted())) return;
      const names = new Map<string, string>();
      for (const lead of await db.aiLeads.toArray()) names.set(lead.id, lead.name);
      for (const employee of await db.aiEmployees.toArray()) names.set(employee.id, employee.name);

      for (const row of toNotify) {
        if (notifiedRef.current.has(row.id)) continue;
        notifiedRef.current.add(row.id);
        void sendDesktopNotification({
          title: `${names.get(row.from) ?? 'Nhóm'} · ${row.teamName}`,
          body: row.content.slice(0, 160),
          tag: row.id,
        });
      }
    })();
  }, [pending, db]);
}
