import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import 'fake-indexeddb/auto';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'cr' as const, id: PROJECT_ID, title: 'Mcp Project' };
const SCOPE_KEY = `cr:${PROJECT_ID}`;

describe('MCP master toggle reflects the tab state it just wrote', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestMcpToggleDb_${Date.now()}`);
    await db.changeRequests.add({
      id: PROJECT_ID,
      code: 'CR-AI-02',
      name: 'Mcp Project',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  it('stays on after turning MCP on from an off tab', async () => {
    const tab = await createChatTab(
      {
        scopeType: 'cr',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: '💬 MCP tab',
        config: { mcpEnabled: false } as never,
      },
      db
    );
    await setActiveTab(SCOPE_KEY, tab.id, db);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    fireEvent.click(await screen.findByTestId('tab-mcp-btn'));
    const masterSwitch = await screen.findByRole('switch', { name: /Bật\/tắt toàn bộ MCP/i });
    expect(masterSwitch).not.toBeChecked();

    fireEvent.click(masterSwitch);

    // The switch must end up ON, and the stored tab must agree with it.
    await waitFor(async () => {
      expect((await db.chatTabs.get(tab.id))?.config?.mcpEnabled).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /Bật\/tắt toàn bộ MCP/i })).toBeChecked();
    });
  });
});
