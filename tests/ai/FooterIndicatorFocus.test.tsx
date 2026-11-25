import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { ActiveAiTurnIndicator } from '../../src/components/ai/ActiveAiTurnIndicator';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, getActiveTab, listTabsByScope, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import { aiTurnManager } from '../../src/services/ai/aiTurnManager';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const SCOPE_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE_KEY = `cr:${SCOPE_ID}`;

function DockedDrawer({ db }: { db: TaskPlannerDatabase }) {
  const { activeScope } = useAIChat();
  return <AIChatDrawer open onClose={() => {}} db={db} activeScope={activeScope} isDockedPanel />;
}

describe('footer indicator focuses the running chat tab', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    localStorage.clear();
    aiTurnManager.abortAll();
    db = new TaskPlannerDatabase(`footer-focus-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.changeRequests.add({
      id: SCOPE_ID, code: 'CR-FF-01', name: 'Footer Focus', status: 'Open', type: 'ENHANCEMENT',
      targets: [], createdAt: '2026-11-25T00:00:00.000Z', updatedAt: '2026-11-25T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    cleanup();
    aiTurnManager.abortAll();
    await db.delete();
    vi.restoreAllMocks();
  });

  it('opens the running tab and leaves the other tab untouched', async () => {
    const idle = await createChatTab(
      { scopeType: 'cr', scopeKey: SCOPE_KEY, entityId: SCOPE_ID, title: 'Idle tab' }, db);
    const running = await createChatTab(
      { scopeType: 'cr', scopeKey: SCOPE_KEY, entityId: SCOPE_ID, title: 'Running tab' }, db);
    // Active tab is the OTHER one before the click — the bug used to keep it visible.
    await setActiveTab(SCOPE_KEY, idle.id, db);

    act(() => {
      aiTurnManager.registerTurn({
        id: running.id,
        scopeKey: SCOPE_KEY,
        title: 'Chat: Running tab',
        status: 'streaming',
        streamingStatusLabel: 'Đang phản hồi',
        abort: vi.fn(),
        meta: { tabId: running.id },
      });
    });

    render(
      <AIChatProvider>
        <ActiveAiTurnIndicator compact />
        <DockedDrawer db={db} />
      </AIChatProvider>
    );

    fireEvent.click(screen.getByTestId('active-ai-turn-capsule'));

    await waitFor(async () => {
      const active = await getActiveTab(SCOPE_KEY, db);
      expect(active?.id).toBe(running.id);
    });
    expect(await screen.findByRole('tab', { name: /Running tab/ })).toHaveAttribute('aria-selected', 'true');

    // The idle tab survives with its own state — no scope switch, no deletion.
    const tabs = await listTabsByScope(SCOPE_KEY, db);
    expect(tabs.map((t) => t.id).sort()).toEqual([idle.id, running.id].sort());
    expect(tabs.find((t) => t.id === idle.id)?.active).toBe(false);
  });
});
