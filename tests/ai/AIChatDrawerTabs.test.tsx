import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { createRequestRegistry } from '../../src/components/ai/runtime/requestRegistry';
import { createTabRuntime } from '../../src/components/ai/runtime/tabTypes';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createChatTab,
  getActiveTab,
  getOrCreateSdlcTab,
  setActiveTab,
  updateChatTab,
} from '../../src/db/repositories/chatTabRepo';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

describe('AI tab runtime ownership gates', () => {
  it('keeps request controllers and transient buffers independent across tabs', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a', 'thread-a');
    const second = registry.begin('tab-b', 'thread-b');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.controller).not.toBe(second?.controller);
    expect(registry.begin('tab-a', 'thread-a')).toBeNull();

    const runtimeA = createTabRuntime('tab-a', 'thread-a', { partialBuffer: 'A', status: 'processing' });
    const runtimeB = createTabRuntime('tab-b', 'thread-b', { partialBuffer: 'B', status: 'processing' });
    expect(runtimeA.partialBuffer).toBe('A');
    expect(runtimeB.partialBuffer).toBe('B');
    expect(registry.isCurrent(first!.requestId, 'tab-a', first!.controller)).toBe(true);
    expect(registry.isCurrent(second!.requestId, 'tab-b', second!.controller)).toBe(true);
  });

  it('aborts only owning tab and rejects stale completion', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a', 'thread-a')!;
    const second = registry.begin('tab-b', 'thread-b')!;

    registry.abortTab('tab-a');
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(registry.isCurrent(first.requestId, 'tab-a', first.controller)).toBe(false);
    expect(registry.isCurrent(second.requestId, 'tab-b', second.controller)).toBe(true);
  });

  it('isolates drafts, streaming buffers, and errors per tab in tab runtimes', () => {
    const runtimeA = createTabRuntime('tab-a', 'thread-a', {
      draft: 'Draft for tab A',
      partialBuffer: 'Stream buffer A',
      status: 'processing',
    });

    const runtimeB = createTabRuntime('tab-b', 'thread-b', {
      draft: 'Draft for tab B',
      partialBuffer: 'Stream buffer B',
      status: 'error',
      error: {
        code: 'request_failed',
        message: 'Lỗi tab B',
        requestId: 'req-b',
      },
    });

    expect(runtimeA.draft).toBe('Draft for tab A');
    expect(runtimeB.draft).toBe('Draft for tab B');
    expect(runtimeA.error).toBeNull();
    expect(runtimeB.error?.code).toBe('request_failed');
    expect(runtimeA.status).toBe('processing');
    expect(runtimeB.status).toBe('error');
  });

  it('persists active tab pointer and ordinary titles in durable repository without canonical localStorage writes', async () => {
    const db = new TaskPlannerDatabase(`TestTabsDb_${Date.now()}`);
    const projectId = 'p-100';
    const scopeKey = `project:${projectId}`;

    // 1. Ensure SDLC tab is singleton
    const sdlcTab = await getOrCreateSdlcTab(projectId, db);
    expect(sdlcTab.type).toBe('sdlc');
    expect(sdlcTab.scopeKey).toBe(scopeKey);

    // 2. Create ordinary tab
    const chatTab1 = await createChatTab({
      scopeType: 'project',
      scopeKey,
      entityId: projectId,
      title: '💬 Tra cứu 1',
    }, db);
    expect(chatTab1.type).toBe('chat');

    // 3. Set active tab
    await setActiveTab(scopeKey, chatTab1.id, db);
    const active = await getActiveTab(scopeKey, db);
    expect(active?.id).toBe(chatTab1.id);

    // 4. Update title in durable repo
    const updated = await updateChatTab(chatTab1.id, { title: '💬 Đã đổi tên' }, db);
    expect(updated.title).toBe('💬 Đã đổi tên');

    const thread = await db.chatThreads.get(chatTab1.threadId);
    expect(thread?.title).toBe('💬 Đã đổi tên');

    // 5. Canonical store check: localStorage must not hold canonical chat tabs
    expect(localStorage.getItem(`planner:chat_tabs:${projectId}`)).toBeNull();

    await db.delete();
  });
});

describe('per-tab analysis mode is durable only (D-07)', () => {
  const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
  const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Analysis Project' };
  const SCOPE_KEY = `project:${PROJECT_ID}`;
  const TS = '2026-10-30T00:00:00.000Z';

  const mount = async (db: TaskPlannerDatabase, analysisMode: boolean) => {
    await db.projects.add({ id: PROJECT_ID, name: 'Analysis Project', status: 'Open', createdAt: TS, updatedAt: TS });
    const tab = await createChatTab(
      { scopeType: 'project', scopeKey: SCOPE_KEY, entityId: PROJECT_ID, title: 'Chat', config: { analysisMode } },
      db
    );
    await setActiveTab(SCOPE_KEY, tab.id, db);
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await screen.findByRole('tab', { name: /Chat/ });
    return tab;
  };

  it('ignores a stale global key when the durable tab config says false', async () => {
    localStorage.setItem('planner:ai_analysis_mode', 'true');
    const db = new TaskPlannerDatabase(`AnalysisIgnore_${Date.now()}`);
    const tab = await mount(db, false);

    await waitFor(async () => {
      const row = await db.chatTabs.get(tab.id);
      expect(row?.config?.analysisMode).toBe(false);
    });
    expect(screen.queryByTestId('analysis-mode-header-tag')).toBeNull();
    expect(localStorage.getItem('planner:ai_analysis_mode')).toBeNull();
    expect(within(screen.getByRole('tab', { name: /Chat/ })).queryByLabelText('Analysis Mode')).toBeNull();

    cleanup();
    await db.delete();
  });

  it('shows the analysis tag from durable config only', async () => {
    localStorage.setItem('planner:ai_analysis_mode', 'true');
    const db = new TaskPlannerDatabase(`AnalysisDurable_${Date.now()}`);
    const tab = await mount(db, true);

    expect((await db.chatTabs.get(tab.id))?.config?.analysisMode).toBe(true);
    expect(await screen.findByTestId('analysis-mode-header-tag')).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /Chat/ })).getByLabelText('Analysis Mode')).toBeInTheDocument();

    cleanup();
    await db.delete();
  });
});
