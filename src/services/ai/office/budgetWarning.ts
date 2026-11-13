import { sendDesktopNotification } from '../../../utils/desktopNotification';

/**
 * Phase 38 D-02/D-03/D-06: the two independent warning levels, one OS notification each.
 *
 * Budget never blocks (D-01). A crossing raises a notification and the run continues; the
 * user decides whether to press Stop. The marker set is what keeps a long turn from
 * notifying once per tool round and a second teammate from notifying again.
 *
 * Identity is `(teamId, level)` and NOTHING else. The per-member badge is a UI concern
 * (plan 09) and must not drive notification identity: an agent-keyed marker would re-notify
 * for every teammate that crosses the same team-level share.
 *
 * T-38-20: the body is templated from numbers and the agent/team name only — never prompt
 * text, model output, an endpoint or a credential.
 */

export type BudgetWarningLevel = 'member' | 'team';

export interface BudgetWarning {
  level: BudgetWarningLevel;
  teamId: string;
  teamName: string;
  /** Whole percent consumed, for display only — the crossing is decided on raw numbers. */
  usedPct: number;
  agentName?: string | undefined;
}

/** `${teamId}:${level}` — one marker per team per level, held until a team-scoped reset. */
const notified = new Set<string>();

function keyOf(teamId: string, level: BudgetWarningLevel): string {
  return `${teamId}:${level}`;
}

/** D-06: a top-up, a new turn or a dispose clears ONLY the owning team's markers. */
export function resetBudgetWarnings(teamId: string): void {
  const prefix = `${teamId}:`;
  for (const key of [...notified]) {
    if (key.startsWith(prefix)) notified.delete(key);
  }
}

/** TEST SEAM ONLY — no production path may call this (T-38-33). */
export function resetAllBudgetWarnings(): void {
  notified.clear();
}

function bodyFor(warning: BudgetWarning): string {
  const pct = Number.isFinite(warning.usedPct) ? Math.round(warning.usedPct) : 0;
  const who = warning.agentName ?? 'Nhân viên';
  return warning.level === 'member'
    ? `${who} đã dùng ${pct}% phần ngân sách token của mình. Lượt chạy vẫn tiếp tục — bấm Stop nếu muốn dừng.`
    : `Nhóm đã dùng ${pct}% tổng ngân sách token. Lượt chạy vẫn tiếp tục — bấm Stop nếu muốn dừng.`;
}

/**
 * Sends at most one notification per `(teamId, level)`. The marker is added BEFORE the
 * await, so two reports settling in the same tick cannot double-send; a failed send clears
 * it again so the next crossing retries (same shape as `useTeamChatNotifications`).
 */
export async function dispatchBudgetWarning(warning: BudgetWarning): Promise<boolean> {
  const key = keyOf(warning.teamId, warning.level);
  if (notified.has(key)) return false;
  notified.add(key);
  try {
    const sent = await sendDesktopNotification({
      title:
        warning.level === 'member'
          ? `${warning.agentName ?? 'Nhân viên'} · ${warning.teamName}`
          : warning.teamName,
      body: bodyFor(warning),
      tag: key,
    });
    if (!sent) notified.delete(key);
    return sent;
  } catch {
    notified.delete(key);
    return false;
  }
}
