import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import 'fake-indexeddb/auto';

describe('ChatTabToolbox and Tab Isolation', () => {
  let db: TaskPlannerDatabase;
  const PROJECT_ID = 'test-proj-toolbox-1';
  const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Test Project Toolbox' };
  const SCOPE_KEY = `project:${PROJECT_ID}`;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestToolboxDb_${Date.now()}`);
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Test Project Toolbox',
      status: 'Open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('renders ChatTabToolbox with tab-isolated controls', async () => {
    const tab1 = await createChatTab({
      scopeType: 'project',
      scopeKey: SCOPE_KEY,
      entityId: PROJECT_ID,
      title: 'Tab One',
      config: { analysisMode: false, autoApproveMutations: false, model: 'model-x' },
    }, db);
    await setActiveTab(SCOPE_KEY, tab1.id, db);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    // Check toolbox container exists
    const toolbox = await screen.findByTestId('chat-tab-toolbox');
    expect(toolbox).toBeInTheDocument();

    // Check scope pill
    expect(screen.getByText('Test Project Toolbox')).toBeInTheDocument();

    // Check analysis mode button
    const analysisBtn = screen.getByRole('button', { name: /Phân tích/i });
    expect(analysisBtn).toBeInTheDocument();

    // Check auto-approve button
    const autoApproveBtn = screen.getByRole('button', { name: /Tự duyệt/i });
    expect(autoApproveBtn).toBeInTheDocument();
  });

  it('toggles analysis mode and auto-approve independently per tab', async () => {
    const tabA = await createChatTab({
      scopeType: 'project',
      scopeKey: SCOPE_KEY,
      entityId: PROJECT_ID,
      title: 'Tab A',
      config: { analysisMode: false, autoApproveMutations: false },
    }, db);

    const tabB = await createChatTab({
      scopeType: 'project',
      scopeKey: SCOPE_KEY,
      entityId: PROJECT_ID,
      title: 'Tab B',
      config: { analysisMode: true, autoApproveMutations: true },
    }, db);

    await setActiveTab(SCOPE_KEY, tabA.id, db);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await screen.findByTestId('chat-tab-toolbox');
    const tabElement = await screen.findByRole('tab', { name: /Tab A/ });
    fireEvent.click(tabElement);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Tab A/ })).toHaveAttribute('aria-selected', 'true')
    );

    // Tab A: click toggle auto-approve
    const autoApproveBtn = screen.getByRole('button', { name: /Tự duyệt/i });
    fireEvent.click(autoApproveBtn);

    await waitFor(async () => {
      const refreshedA = await db.chatTabs.get(tabA.id);
      expect(refreshedA?.config?.autoApproveMutations).toBe(true);
    });

    // Verify Tab B still has its own config intact in db
    const currentB = await db.chatTabs.get(tabB.id);
    expect(currentB?.config?.autoApproveMutations).toBe(true);
    expect(currentB?.config?.analysisMode).toBe(true);
  });
});
