import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';
import { getTeamChatDraft, clearTeamChatDraft } from '../../../../src/services/ai/office/teamChatDraftStore';

const sendMock = vi.fn(async (_text: string): Promise<'started' | 'blocked'> => 'started');

vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({ draft, onDraftChange, onSubmit }: {
    draft: string;
    onDraftChange: (next: string) => void;
    onSubmit: (text: string) => void;
  }) => (
    <div>
      <input
        data-testid="draft-input"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
      />
      <button data-testid="send" onClick={() => onSubmit(draft)}>Gửi</button>
    </div>
  ),
}));

vi.mock('../../../../src/services/ai/nineRouterTokenService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/nineRouterTokenService')>();
  return {
    ...actual,
    getNineRouterApiKey: vi.fn(async () => 'test-key'),
    getNineRouterConfig: vi.fn(async () => ({
      endpoint: 'https://example.test/v1',
      defaultModel: 'test-model',
      contextWindowTokens: 8000,
    })),
  };
});

vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => ({
      send: async (text: string) => sendMock(text),
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
      setAgentDeveloperWorktree: vi.fn(() => true),
      setWorktreeAmbiguousSystems: vi.fn(),
      subscribe: () => () => {},
      getState: () => makeTeamRunSnapshot({ phase: 'ready' }),
    })),
  };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace chat draft survives tab remount', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  const renderWorkspace = (current: AiTeam) => render(
    <TeamWorkspace team={current} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />
  );

  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue('started');
    db = new TaskPlannerDatabase('test-team-chat-draft-' + Math.random().toString(36).slice(2));
    await db.open();
    team = await createTeam({ name: 'Nhóm draft', budgetTokens: 1000 }, db);
  });

  afterEach(async () => {
    clearTeamChatDraft(team.id);
    await db.delete();
    vi.clearAllMocks();
  });

  it('keeps typed text across unmount/remount of the same team', async () => {
    const first = renderWorkspace(team);
    const input = await screen.findByTestId('draft-input');
    fireEvent.change(input, { target: { value: 'Soạn dang dang dang' } });
    first.unmount();

    const second = renderWorkspace(team);
    expect(await screen.findByTestId('draft-input')).toHaveProperty('value', 'Soạn dang dang dang');
    second.unmount();
  });

  it('does not leak a draft into a different team', async () => {
    const other = await createTeam({ name: 'Nhóm khác', budgetTokens: 1000 }, db);
    const first = renderWorkspace(team);
    fireEvent.change(await screen.findByTestId('draft-input'), { target: { value: 'Chỉ của nhóm A' } });
    first.unmount();

    const second = renderWorkspace(other);
    expect(await screen.findByTestId('draft-input')).toHaveProperty('value', '');
    expect(getTeamChatDraft(team.id)).toBe('Chỉ của nhóm A');
    second.unmount();
    clearTeamChatDraft(other.id);
  });

  it('clears both view and store after a successful submit', async () => {
    const first = renderWorkspace(team);
    fireEvent.change(await screen.findByTestId('draft-input'), { target: { value: 'Gửi xong' } });
    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => expect(getTeamChatDraft(team.id)).toBe(''));
    expect((screen.getByTestId('draft-input') as HTMLInputElement).value).toBe('');
    first.unmount();

    const second = renderWorkspace(team);
    expect(await screen.findByTestId('draft-input')).toHaveProperty('value', '');
    second.unmount();
  });

  it('restores the text to the store when the coordinator blocks the send', async () => {
    // A blocked coordinator outcome restores the draft rather than clearing it.
    sendMock.mockResolvedValueOnce('blocked');
    const first = renderWorkspace(team);
    fireEvent.change(await screen.findByTestId('draft-input'), { target: { value: 'Giữ lại khi blocked' } });
    fireEvent.click(screen.getByTestId('send'));

    await waitFor(() => expect(getTeamChatDraft(team.id)).toBe('Giữ lại khi blocked'));
    first.unmount();

    const second = renderWorkspace(team);
    expect(await screen.findByTestId('draft-input')).toHaveProperty('value', 'Giữ lại khi blocked');
    second.unmount();
  });
});
