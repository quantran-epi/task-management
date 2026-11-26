import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { InlineAISelectionBar } from '../../src/components/ai/InlineAISelectionBar';
import { AIChatProvider, useAIChat } from '../../src/context/AIChatContext';
import { TaskPlannerDatabase } from '../../src/db';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import { saveMessage } from '../../src/db/repositories/chatRepo';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';
import {
  RemoteCitationChips,
  parseRemoteCitationRefs,
} from '../../src/components/ai/RemoteCitationChips';
import * as sshService from '../../src/services/sshService';
import type { SshConfig } from '../../src/types/ssh';
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

  it('renders ChatTabToolbox without analysis or auto-approve affordances', async () => {
    await seedTabs({ analysisMode: true, autoApproveMutations: true, mcpEnabled: true, model: 'model-x' });

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    const toolbox = await screen.findByTestId('chat-tab-toolbox');
    expect(toolbox).toBeInTheDocument();

    expect(screen.getByText('Toolbox Project')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Phân tích/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tự duyệt/i })).toBeNull();
    expect(toolbox.querySelector('[data-testid="tab-auto-approve-btn"]')).toBeNull();
    expect(screen.getByTestId('tab-mcp-btn')).toBeInTheDocument();
  });

  it('assertTabFlagsAreIsolatedAfterMcpToggle', async () => {
    const { first, second } = await seedTabs(
      { analysisMode: true, autoApproveMutations: false, mcpEnabled: true },
      { analysisMode: true, autoApproveMutations: true, mcpEnabled: false }
    );

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await screen.findByTestId('chat-tab-toolbox');
    await openTab(CHAT_ONE);

    // No UI can flip stored legacy flags; the tab-2 seed proves they stay untouched.
    expect(screen.queryByTestId('tab-auto-approve-btn')).toBeNull();
    expect(screen.queryByText(/Tự duyệt/)).toBeNull();

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
      expect(refreshedA?.config?.autoApproveMutations).toBe(false);
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

/**
 * Phase 47 D-12: remote `path:line` citations are render-only chips that open the readonly remote
 * file tab at that line using the ACTIVE target, while document citations keep their preview.
 */
describe('Remote path:line citation navigation (Phase 47 D-12)', () => {
  const REMOTE_CONFIG: SshConfig = {
    id: 'ssh-cite-1',
    name: 'Cite Server',
    host: '10.0.0.5',
    port: 22,
    username: 'dev',
    authType: 'key_file',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const REPO_PATH = '/srv/repos/payments';
  const BRANCH = 'main';
  const REMOTE_TARGET_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useLayoutStore.getState().resetLayout();
  });

  it('parseRemoteCitationRefs extracts repo-relative path:line refs and rejects traversal/absolute paths', () => {
    const refs = parseRemoteCitationRefs(
      'Xem src/service/Fee.ts:42 và docs/guide.md:7.\nKhông /etc/passwd:1 hay ../secret.ts:3.'
    );
    expect(refs).toEqual([
      { relativePath: 'src/service/Fee.ts', line: 42 },
      { relativePath: 'docs/guide.md', line: 7 },
    ]);
  });

  it('chip click invokes onActivate with the exact path:line ref', () => {
    const onActivate = vi.fn();
    render(
      <RemoteCitationChips
        citations={[{ relativePath: 'src/Fee.ts', line: 88 }]}
        onActivate={onActivate}
      />
    );
    const chip = screen.getByTestId('remote-citation-chip');
    expect(chip.textContent).toContain('src/Fee.ts:88');
    fireEvent.click(chip);
    expect(onActivate).toHaveBeenCalledWith({ relativePath: 'src/Fee.ts', line: 88 });
  });

  it('clicking a remote citation chip opens the remote file tab with the active target and initialLine', async () => {
    const db = new TaskPlannerDatabase(`TestRemoteCite_${Date.now()}_${Math.random()}`);
    useLayoutStore.getState().setActiveRemoteTarget(REMOTE_CONFIG.id, REPO_PATH, BRANCH);
    vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(REMOTE_CONFIG);

    const openTabSpy = vi.spyOn(useLayoutStore.getState(), 'openTab').mockImplementation(() => {});

    const SCOPE_KEY = `remote:${REMOTE_TARGET_UUID}`;
    const tab = await createChatTab(
      { scopeType: 'remote', scopeKey: SCOPE_KEY, entityId: REMOTE_TARGET_UUID, title: 'Remote chat' },
      db
    );
    await setActiveTab(SCOPE_KEY, tab.id, db);
    await saveMessage({
      threadId: tab.threadId,
      role: 'assistant',
      content: 'Hàm phí nằm ở src/service/Fee.ts:42.',
    }, db);

    try {
      render(
        <AIChatDrawer
          open
          onClose={() => {}}
          db={db}
          activeScope={{ type: 'remote', id: REMOTE_TARGET_UUID, title: 'Remote chat' }}
        />
      );

      const chip = await screen.findByTestId('remote-citation-chip');
      expect(chip.textContent).toContain('src/service/Fee.ts:42');
      fireEvent.click(chip);

      await waitFor(() => {
        expect(openTabSpy).toHaveBeenCalledTimes(1);
      });
      const opened = openTabSpy.mock.calls[0]![0];
      const openedParams = opened.params ?? {};
      expect(opened.id).toBe('remote:src/service/Fee.ts');
      expect(opened.viewType).toBe('remote_file');
      expect(openedParams.filePath).toBe('src/service/Fee.ts');
      expect(openedParams.initialLine).toBe(42);
      expect(openedParams.repoPath).toBe(REPO_PATH);
      expect(openedParams.branch).toBe(BRANCH);
      expect(openedParams.config.id).toBe(REMOTE_CONFIG.id);
    } finally {
      await db.delete();
    }
  });
});
