import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { InlineAISelectionBar } from '../../src/components/ai/InlineAISelectionBar';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import 'fake-indexeddb/auto';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'cr' as const, id: PROJECT_ID, title: 'Toolbox Project' };
const SCOPE_KEY = `cr:${PROJECT_ID}`;
const CHAT_ONE = '💬 Cuộc trò chuyện #1';
const CHAT_TWO = '💬 Cuộc trò chuyện #2';

describe('ChatTabToolbox and Tab Isolation', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestToolboxDb_${Date.now()}`);
    await db.changeRequests.add({
      id: PROJECT_ID,
        code: 'CR-AI-01',
      name: 'Toolbox Project',
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

  const seedTabs = async (configA?: Record<string, unknown>, configB?: Record<string, unknown>) => {
    const first = await createChatTab(
      {
        scopeType: 'cr',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_ONE,
        ...(configA ? { config: configA as never } : {}),
      },
      db
    );
    const second = await createChatTab(
      {
        scopeType: 'cr',
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

/**
 * Phase 47 D-09/D-10/D-11: a selection in a remote readonly viewer activates the inline
 * toolbar, and Open in Chat carries the D-11 structured anchor (with path:line) into the
 * remote-scope composer — never a fake doc resolution.
 */
describe('Remote selection inline toolbar (Phase 47 D-09/D-10/D-11)', () => {
  let db: TaskPlannerDatabase;

  const SSH_CONFIG_ID = 'ssh-remote-1';
  const REPO_PATH = '/srv/repos/my-repo';
  const BRANCH = 'feature/remote';
  const FILE_PATH = 'src/service/PaymentService.ts';
  const TARGET_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SELECTED_TEXT = 'function calculateFee(amount: number) {\n  return amount * 0.02;\n}';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    db = new TaskPlannerDatabase(`TestRemoteInline_${Date.now()}_${Math.random()}`);
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await db.delete();
  });

  /** Render a code-container DOM like RemoteFileViewer and a remote selection inside it. */
  const selectRemoteCode = () => {
    const container = document.createElement('div');
    container.setAttribute('data-testid', 'code-container');
    container.setAttribute('data-ai-context-type', 'remote');
    container.setAttribute('data-ai-context-id', TARGET_UUID);
    container.setAttribute('data-remote-target-uuid', TARGET_UUID);
    container.setAttribute('data-remote-config', SSH_CONFIG_ID);
    container.setAttribute('data-remote-ssh-config-id', SSH_CONFIG_ID);
    container.setAttribute('data-remote-repo-path', REPO_PATH);
    container.setAttribute('data-remote-branch', BRANCH);
    container.setAttribute('data-remote-path', FILE_PATH);
    document.body.appendChild(container);

    const line = document.createElement('div');
    line.setAttribute('data-remote-line', '42');
    line.setAttribute('data-remote-path', FILE_PATH);
    line.textContent = SELECTED_TEXT;
    container.appendChild(line);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => SELECTED_TEXT,
      anchorNode: line,
      focusNode: line,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          top: 250,
          bottom: 310,
          left: 200,
          right: 500,
          width: 300,
          height: 60,
        }),
      }),
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);
    return container;
  };

  const TestShell = () => {
    const { isOpen, closeChat, activeScope } = useAIChat();
    return (
      <div>
        <InlineAISelectionBar db={db} />
        <AIChatDrawer open={isOpen} onClose={closeChat} db={db} activeScope={activeScope} />
      </div>
    );
  };

  it('shows Explain, Ask and Open in Chat for a remote selection', async () => {
    selectRemoteCode();
    render(
      <AIChatProvider>
        <TestShell />
      </AIChatProvider>
    );

    fireEvent.mouseUp(document);

    const toolbar = await screen.findByTestId('remote-inline-toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByTestId('remote-explain')).toBeInTheDocument();
    expect(screen.getByTestId('remote-ask')).toBeInTheDocument();
    expect(screen.getByTestId('remote-open-in-chat')).toBeInTheDocument();
    // Breadcrumb shows repo-relative path + line, not a fake doc entity.
    expect(screen.getByText(new RegExp(FILE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
  });

  it('Open in Chat calls openChatWithDraft with remote scope and a path:line mention, no fake doc resolution', async () => {
    selectRemoteCode();
    // Pin a spy on resolveEntityHierarchy: the remote branch must NEVER call it.
    const selectionContext = await import('../../src/utils/selectionContext');
    const resolveSpy = vi.spyOn(selectionContext, 'resolveEntityHierarchy');

    render(
      <AIChatProvider>
        <TestShell />
      </AIChatProvider>
    );

    fireEvent.mouseUp(document);
    const openInChat = await screen.findByTestId('remote-open-in-chat');
    fireEvent.click(openInChat);

    const textarea = (await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain(`${FILE_PATH}:42-42`);
      expect(textarea.value).toContain('> function calculateFee');
    });
    // No fake doc resolution was ever attempted for the remote anchor.
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});
