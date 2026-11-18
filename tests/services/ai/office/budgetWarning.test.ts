// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 38 D-03/D-06/T-38-20/T-38-33: the dispatcher's identity is `(teamId, level)` and
 * nothing else. The payload is captured so a test can assert the body carries numbers and
 * names only.
 */
const payloads: Array<{ title: string; body?: string; tag?: string }> = [];
const sendResult = { value: true };
const sendDesktopNotification = vi.fn(
  async (payload: { title: string; body?: string; tag?: string }) => {
    payloads.push(payload);
    return sendResult.value;
  }
);
vi.mock('../../../../src/utils/desktopNotification', () => ({
  sendDesktopNotification: (payload: { title: string; body?: string; tag?: string }) =>
    sendDesktopNotification(payload),
}));

import {
  dispatchBudgetWarning,
  resetAllBudgetWarnings,
  resetBudgetWarnings,
  type BudgetWarning,
} from '../../../../src/services/ai/office/budgetWarning';

const warning = (overrides: Partial<BudgetWarning> = {}): BudgetWarning => ({
  level: 'member',
  teamId: 'team-a',
  teamName: 'Nhóm A',
  usedPct: 87,
  agentName: 'An',
  ...overrides,
});

describe('budgetWarning dispatcher (D-03, D-06, T-38-20, T-38-33)', () => {
  beforeEach(() => {
    resetAllBudgetWarnings();
    payloads.length = 0;
    sendResult.value = true;
    sendDesktopNotification.mockClear();
  });

  it('sends once per (teamId, level) and drops the second call', async () => {
    expect(await dispatchBudgetWarning(warning())).toBe(true);
    expect(await dispatchBudgetWarning(warning({ usedPct: 95 }))).toBe(false);
    expect(sendDesktopNotification).toHaveBeenCalledTimes(1);
  });

  it('treats the two levels as independent for the same team', async () => {
    expect(await dispatchBudgetWarning(warning({ level: 'member' }))).toBe(true);
    expect(await dispatchBudgetWarning(warning({ level: 'team', agentName: undefined }))).toBe(true);
    expect(sendDesktopNotification).toHaveBeenCalledTimes(2);
  });

  it('does not re-notify when a different teammate crosses the member level', async () => {
    expect(await dispatchBudgetWarning(warning({ agentName: 'An' }))).toBe(true);
    expect(await dispatchBudgetWarning(warning({ agentName: 'Bình' }))).toBe(false);
    expect(sendDesktopNotification).toHaveBeenCalledTimes(1);
  });

  it('warns even when no agent name resolved — the key is the team and the level', async () => {
    expect(await dispatchBudgetWarning(warning({ agentName: undefined }))).toBe(true);
    expect(payloads[0]!.title).toContain('Nhóm A');
  });

  it('resetBudgetWarnings re-arms one team and leaves another team’s marker alone', async () => {
    await dispatchBudgetWarning(warning({ teamId: 'team-a' }));
    await dispatchBudgetWarning(warning({ teamId: 'team-b' }));

    resetBudgetWarnings('team-a');

    expect(await dispatchBudgetWarning(warning({ teamId: 'team-b' }))).toBe(false);
    expect(await dispatchBudgetWarning(warning({ teamId: 'team-a' }))).toBe(true);
  });

  it('a failed send leaves the marker clear so the next attempt retries', async () => {
    sendResult.value = false;
    expect(await dispatchBudgetWarning(warning())).toBe(false);
    sendResult.value = true;
    expect(await dispatchBudgetWarning(warning())).toBe(true);
  });

  it('a throwing send also leaves the marker clear', async () => {
    sendDesktopNotification.mockImplementationOnce(async () => {
      throw new Error('channel down');
    });
    expect(await dispatchBudgetWarning(warning())).toBe(false);
    expect(await dispatchBudgetWarning(warning())).toBe(true);
  });

  it('resetAllBudgetWarnings clears every team and level', async () => {
    await dispatchBudgetWarning(warning({ teamId: 'team-a', level: 'member' }));
    await dispatchBudgetWarning(warning({ teamId: 'team-b', level: 'team', agentName: undefined }));

    resetAllBudgetWarnings();

    expect(await dispatchBudgetWarning(warning({ teamId: 'team-a', level: 'member' }))).toBe(true);
    expect(
      await dispatchBudgetWarning(warning({ teamId: 'team-b', level: 'team', agentName: undefined }))
    ).toBe(true);
  });

  it('the payload carries numbers and names only — never prompt-like text (T-38-20)', async () => {
    await dispatchBudgetWarning(warning({ usedPct: 87.4 }));
    await dispatchBudgetWarning(warning({ level: 'team', agentName: undefined, usedPct: 101 }));

    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.title).toBe('An · Nhóm A');
    expect(payloads[0]!.body).toMatch(/87%/);
    expect(payloads[1]!.title).toBe('Nhóm A');
    expect(payloads[1]!.body).toMatch(/101%/);
    for (const payload of payloads) {
      expect(payload.body).not.toMatch(/sk-|https?:\/\//);
      expect(payload.tag).toMatch(/^team-a:(member|team)$/);
    }
  });
});
