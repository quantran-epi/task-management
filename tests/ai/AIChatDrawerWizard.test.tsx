import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import * as coordinatorModule from '../../src/services/wizard/wizardCoordinator';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('AIChatDrawer wizard wiring', () => {
  let db: TaskPlannerDatabase;
  const start = vi.fn();
  const cancel = vi.fn();
  const dispose = vi.fn();
  const restore = vi.fn();
  const addContext = vi.fn();

  beforeEach(async () => {
    vi.restoreAllMocks();
    start.mockReset(); cancel.mockReset(); dispose.mockReset(); restore.mockReset(); addContext.mockReset();
    db = new TaskPlannerDatabase(`drawer-wizard-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({ id: PROJECT_ID, name: 'Wizard Project', status: 'Open', createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' });
    restore.mockResolvedValue(undefined);
    vi.spyOn(coordinatorModule, 'createWizardCoordinator').mockReturnValue({
      start, cancel, dispose, restore, addContext,
      answerGap: vi.fn(), skipGap: vi.fn(), requestEdit: vi.fn(), approveSolution: vi.fn(),
      getState: vi.fn(), getSnapshot: vi.fn(),
    } as any);
  });

  it('gates skills by project scope and starts after metadata', async () => {
    const { rerender } = render(<AIChatDrawer open onClose={() => {}} db={db} />);
    expect(screen.getByRole('button', { name: /Soạn PL02/ })).toHaveAttribute('aria-disabled', 'true');

    rerender(<AIChatDrawer open onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Soạn PL02/ })).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(screen.getByRole('button', { name: /Soạn PL02/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu soạn thảo' }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it('routes composer text to active gap wizard and disposes on close', async () => {
    const thread = await db.chatThreads.add({
      id: '33333333-3333-4333-8333-333333333333', scopeKey: `project:${PROJECT_ID}`, scopeType: 'project', entityId: PROJECT_ID,
      createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
    });
    void thread;
    await db.chatMessages.add({
      id: '44444444-4444-4444-8444-444444444444', threadId: '33333333-3333-4333-8333-333333333333', role: 'assistant', content: 'gap',
      createdAt: '2026-10-28T00:00:00.000Z', wizard: {
        schemaVersion: 1, sessionId: '22222222-2222-4222-8222-222222222222', projectId: PROJECT_ID,
        threadId: '33333333-3333-4333-8333-333333333333', skill: 'PL02', status: 'gap_fill',
        inputRevision: 1, draftRevision: null, approvedAt: null, artifactId: null, artifactHash: null,
        renderPayload: { title: 'PL02' }, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
      },
    });
    const { rerender } = render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    const input = await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    await waitFor(() => expect(input).toHaveAttribute('placeholder', 'Trả lời câu hỏi hoặc bổ sung thông tin…'));
    fireEvent.change(input, { target: { value: 'Ngưỡng là 100' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(addContext).toHaveBeenCalledWith('Ngưỡng là 100'));
    rerender(<AIChatDrawer open={false} onClose={() => {}} db={db} activeScope={{ type: 'project', id: PROJECT_ID, title: 'Wizard Project' }} />);
    await waitFor(() => expect(dispose).toHaveBeenCalled());
  });
});
