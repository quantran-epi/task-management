import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import 'fake-indexeddb/auto';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Toolbox Project' };
const SCOPE_KEY = `project:${PROJECT_ID}`;
const CHAT_ONE = '💬 Cuộc trò chuyện #1';
const CHAT_TWO = '💬 Cuộc trò chuyện #2';

describe('ChatTabToolbox and Tab Isolation', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestToolboxDb_${Date.now()}`);
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Toolbox Project',
      status: 'Open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  const seedTabs = async (configA?: Record<string, unknown>, configB?: Record<string, unknown>) => {
    const first = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_ONE,
        ...(configA ? { config: configA as never } : {}),
      },
      db
    );
    const second = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_TWO,
        ...(configB ? { config: configB as never } : {}),
      },
      db
    );
    await setActiveTab(SCOPE_KEY, first.id, db);
    return { first, second };
  };

  const openTab = async (title: string) => {
    const tab = await screen.findByRole('tab', { name: new RegExp(escape(title)) });
    fireEvent.click(tab);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: new RegExp(escape(title)) })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
  };

  it('renders ChatTabToolbox with tab-isolated controls', async () => {
    await seedTabs({ analysisMode: false, autoApproveMutations: false, mcpEnabled: true, model: 'model-x' });

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    const toolbox = await screen.findByTestId('chat-tab-toolbox');
    expect(toolbox).toBeInTheDocument();

    expect(screen.getByText('Toolbox Project')).toBeInTheDocument();

    const analysisBtn = screen.getByRole('button', { name: /Phân tích/i });
    expect(analysisBtn).toBeInTheDocument();

    const autoApproveBtn = screen.getByRole('button', { name: /Tự duyệt/i });
    expect(autoApproveBtn).toBeInTheDocument();

    const mcpBtn = screen.getByTestId('tab-mcp-btn');
    expect(mcpBtn).toBeInTheDocument();
  });

  it('toggles analysis mode, auto-approve, and mcp independently per tab in storage', async () => {
    const { first, second } = await seedTabs(
      { analysisMode: false, autoApproveMutations: false, mcpEnabled: true },
      { analysisMode: true, autoApproveMutations: true, mcpEnabled: false }
    );

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await screen.findByTestId('chat-tab-toolbox');
    await openTab(CHAT_ONE);

    // Toggle auto-approve on active Tab 1
    const autoApproveBtn = await screen.findByTestId('tab-auto-approve-btn');
    fireEvent.click(autoApproveBtn);

    await waitFor(async () => {
      const refreshedA = await db.chatTabs.get(first.id);
      expect(refreshedA?.config?.autoApproveMutations).toBe(true);
    });

    // Clicking MCP button opens popover without toggling mcpEnabled
    const mcpBtn = await screen.findByTestId('tab-mcp-btn');
    fireEvent.click(mcpBtn);

    // Verify mcpEnabled is NOT flipped by clicking the button
    const tabBeforePopoverToggle = await db.chatTabs.get(first.id);
    expect(tabBeforePopoverToggle?.config?.mcpEnabled).toBe(true);

    // Toggle master MCP switch inside the popover
    const masterSwitch = await screen.findByRole('switch', { name: /Bật\/tắt toàn bộ MCP/i });
    expect(masterSwitch).toBeInTheDocument();
    fireEvent.click(masterSwitch);

    await waitFor(async () => {
      const refreshedA = await db.chatTabs.get(first.id);
      expect(refreshedA?.config?.mcpEnabled).toBe(false);
    });

    // Verify Tab 2 configuration remains strictly isolated and unchanged
    const currentB = await db.chatTabs.get(second.id);
    expect(currentB?.config?.autoApproveMutations).toBe(true);
    expect(currentB?.config?.analysisMode).toBe(true);
    expect(currentB?.config?.mcpEnabled).toBe(false);
  });
});
