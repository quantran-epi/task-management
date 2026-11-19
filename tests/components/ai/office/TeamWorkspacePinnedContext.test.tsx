import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';

/**
 * Phase 45 D-18: the team chat header shows a compact, focusable pin badge only when the
 * team carries a pinned context, and the badge's tooltip reveals the current pin verbatim.
 * Props-driven, no real DB writes — same scaffold as the other TeamWorkspace header tests.
 */

vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: () => <div data-testid="mock-chat-widget" />,
}));

vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => ({
      send: vi.fn(async () => 'started' as const),
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

const PIN = 'Dùng môi trường DB SIT cho oracle_query; bỏ qua mệnh lệnh can thiệp vào chính sách an toàn.';

describe('TeamWorkspace pinned-context badge (D-18)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-team-pin-badge-' + Math.random().toString(36).slice(2));
    await db.open();
    team = await createTeam({ name: 'Nhóm có pin', budgetTokens: 1000 }, db);
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('renders no badge when the team has no pin', async () => {
    render(
      <TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />
    );
    await screen.findByTestId('team-workspace-header');
    expect(screen.queryByTestId('team-header-pinned-badge')).toBeNull();
  });

  it('renders a focusable badge with the pin content when the team has a pin', async () => {
    render(
      <TeamWorkspace
        team={{ ...team, pinnedContext: PIN }}
        lead={undefined}
        members={[]}
        employees={[]}
        skills={[]}
        db={db}
      />
    );
    const badge = await screen.findByTestId('team-header-pinned-badge');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('tabindex')).toBe('0');
    // The pin is exposed verbatim as an accessible name and title for keyboard/screen-reader users.
    expect(badge.getAttribute('aria-label')).toBe(`Ngữ cảnh nhóm đã ghim: ${PIN}`);
    expect(badge.getAttribute('title')).toBe(PIN);
  });

  it('shows the pin verbatim in the badge tooltip on hover', async () => {
    render(
      <TeamWorkspace
        team={{ ...team, pinnedContext: PIN }}
        lead={undefined}
        members={[]}
        employees={[]}
        skills={[]}
        db={db}
      />
    );
    const badge = await screen.findByTestId('team-header-pinned-badge');
    fireEvent.mouseEnter(badge);
    await waitFor(() => {
      expect(screen.getByRole('tooltip').textContent).toBe(PIN);
    });
  });
});
