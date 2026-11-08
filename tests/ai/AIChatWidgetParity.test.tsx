import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { getMessagesByThreadId, saveMessage } from '../../src/db/repositories/chatRepo';
import { createChatTab, setActiveTab } from '../../src/db/repositories/chatTabRepo';
import { getStepThread } from '../../src/services/wizard/sdlcCrManager';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as mcpClient from '../../src/services/ai/mcpClient';
import {
  clearGroundedTurnTestHooks,
  setGroundedTurnTestHooks,
} from '../../src/services/ai/groundedTurnDeps';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { StepChatPanel } from '../../src/components/sdlc/chat/StepChatPanel';

// The one orchestrator call site is replaced, not reimplemented: every host must reach the same
// loop through the shared runtime, so a host that grew its own loop would never run this script.
let loopScript: (options: any) => Promise<any>;
const loopCalls: any[] = [];

vi.mock('../../src/services/ai/aiOrchestratorLoop', () => ({
  // The turn runtime reads this constant at send time; a mock without it throws.
  DEFAULT_MAX_TOOL_ROUNDS: 50,
  runAiOrchestratorLoop: (options: any) => {
    loopCalls.push(options);
    return loopScript(options);
  },
  dispatchAiToolCall: async () => '{}',
}));

vi.mock('../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CR_ID = '22222222-2222-4222-8222-222222222222';
const STEP_ID = 'INTAKE' as const;
const API_KEY = 'sk-super-secret-parity-key';

const DRAWER_SCOPE = { type: 'cr' as const, id: PROJECT_ID, title: 'Dự án Parity' };
const DRAWER_SCOPE_KEY = `cr:${PROJECT_ID}`;
const SDLC_SCOPE_KEY = `sdlc:${PROJECT_ID}:${CR_ID}:${STEP_ID}`;

type PendingLoop = {
  options: any;
  resolve: (value: { fullResponse: string; tokenUsage: Record<string, never> }) => void;
  reject: (error: Error) => void;
};

interface HostHarness {
  name: string;
  scopeKey: string;
  scopeLabel: string;
  mount: (db: TaskPlannerDatabase) => Promise<void>;
  prepare: (db: TaskPlannerDatabase) => Promise<void>;
  /** Resolve only once the host can accept a send, so no test races its own bootstrap. */
  ready: (db: TaskPlannerDatabase) => Promise<void>;
  clearThread: (db: TaskPlannerDatabase) => Promise<void>;
  toolbox: () => Promise<{ model: HTMLElement; analysis: HTMLElement; autoApprove: HTMLElement; mcp: HTMLElement }>;
}

function deferredLoop(): PendingLoop[] {
  const pending: PendingLoop[] = [];
  loopScript = () =>
    new Promise((resolve, reject) => {
      pending.push({ options: loopCalls[loopCalls.length - 1], resolve, reject });
    });
  return pending;
}

const hosts: HostHarness[] = [
  {
    name: 'AIChatDrawer',
    scopeKey: DRAWER_SCOPE_KEY,
    scopeLabel: 'cr · Dự án Parity',
    mount: async (db) => {
      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={DRAWER_SCOPE} />);
      await waitFor(() => expect(screen.getByTestId('chat-tab-toolbox')).toBeInTheDocument());
    },
    prepare: async (db) => {
      await db.changeRequests.add({
        id: PROJECT_ID,
        code: 'CR-AI-01',
        name: 'Dự án Parity',
        status: 'Open',
        type: 'ENHANCEMENT',
        targets: [],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      });
      await waitFor(async () => {
        expect(await db.chatTabs.where('scopeKey').equals(DRAWER_SCOPE_KEY).count()).toBeGreaterThan(0);
      });
    },
    ready: async () => {
      // The Drawer awaits its own tab bootstrap inside the send path.
      await waitFor(() => expect(screen.getByTestId('chat-tab-toolbox')).toBeInTheDocument());
    },
    clearThread: async () => {
      // Non-compact toolbox: the clear affordance is its own labelled button.
      fireEvent.click(screen.getByLabelText('Đặt lại ngữ cảnh (/clear)'));
    },
    toolbox: async () => ({
      model: screen.getByLabelText('Chọn mô hình AI cho tab này'),
      analysis: screen.getByRole('button', { name: /Phân tích/ }),
      autoApprove: screen.getByTestId('tab-auto-approve-btn'),
      mcp: screen.getByTestId('tab-mcp-btn'),
    }),
  },
  {
    name: 'StepChatPanel',
    scopeKey: SDLC_SCOPE_KEY,
    scopeLabel: 'SDLC — 1. Hồ sơ đầu vào',
    mount: async (db) => {
      render(<StepChatPanel changeRequestId={PROJECT_ID} crId={CR_ID} stepId={STEP_ID} db={db} />);
    },
    prepare: async (db) => {
      await waitFor(async () => {
        expect(await db.chatThreads.where('scopeKey').equals(SDLC_SCOPE_KEY).count()).toBe(1);
      });
    },
    ready: async (db) => {
      // The step host drops a send until its isolated thread resolves.
      await waitFor(() => expect(screen.getByTestId('chat-tab-toolbox')).toBeInTheDocument());
      await waitFor(async () => {
        expect(await db.chatThreads.where('scopeKey').equals(SDLC_SCOPE_KEY).count()).toBe(1);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    clearThread: async () => {
      // Compact toolbox: analysis/auto-approve/clear live behind the overflow menu.
      fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
      fireEvent.click(await screen.findByText('Đặt lại hội thoại (/clear)'));
    },
    toolbox: async () => {
      fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
      return {
        model: screen.getByLabelText('Chọn mô hình AI cho tab này'),
        analysis: await screen.findByText('Chế độ phân tích (chỉ đọc)'),
        autoApprove: await screen.findByText('Tự động duyệt thay đổi'),
        mcp: screen.getByTestId('tab-mcp-manage-btn'),
      };
    },
  },
];

const textarea = () => screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');

function send(text: string) {
  fireEvent.change(textarea(), { target: { value: text } });
  fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
}

async function submitUntilLoopStarts(text: string, pending: PendingLoop[]) {
  let sent = false;
  for (let attempt = 0; attempt < 20 && pending.length === 0; attempt += 1) {
    // Once the turn is staging, the composer swaps Send for Stop, so a retry is neither
    // possible nor needed — wait for the loop instead of clicking again.
    if (!sent && screen.queryByLabelText('Gửi tin nhắn')) {
      send(text);
      sent = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(pending).toHaveLength(1);
}

async function threadMessages(db: TaskPlannerDatabase, scopeKey: string) {
  const thread = await db.chatThreads.where('scopeKey').equals(scopeKey).first();
  return thread ? getMessagesByThreadId(thread.id, db) : [];
}

/** Analysis Mode is a guard, not a host difference: turn it off so mutations can ask for approval. */
async function disableAnalysisMode(host: HostHarness) {
  const controls = await host.toolbox();
  fireEvent.click(controls.analysis);
  if (host.name === 'StepChatPanel') {
    await waitFor(() => expect(screen.queryByText('Phân tích', { selector: '.ant-tag' })).toBeNull());
  }
}

describe.each(hosts)('$name lifecycle parity through the shared widget', (host) => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    loopCalls.length = 0;
    loopScript = async () => ({ fullResponse: 'Xong', tokenUsage: {} });
    localStorage.clear();
    clearGroundedTurnTestHooks();
    // Ordinary chat falls through the grounded router into the tool loop.
    setGroundedTurnTestHooks({
      runGroundedTurn: async (input) => ({ kind: 'operational', routedQuery: input.query }),
    });
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue(API_KEY);
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://127.0.0.1:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterTokenService, 'fetchAvailableModels').mockResolvedValue(['gpt-4o']);
    vi.spyOn(mcpClient, 'discoverAllMcpTools').mockResolvedValue([]);
    vi.spyOn(mcpClient, 'getEnabledMcpInstructions').mockResolvedValue('');
    db = new TaskPlannerDatabase(`parity-${host.name}-${Date.now()}-${Math.random()}`);
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    clearGroundedTurnTestHooks();
    // Toolbox toggles and turn tails finish asynchronously; let them land before closing the DB,
    // otherwise Dexie reports a post-teardown DatabaseClosedError as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await db.delete();
  });

  it('publishes the staged indicator before the injected loop resolves', async () => {
    const pending = deferredLoop();
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);

    // A step host resolves its isolated thread in an effect, so an early click can be dropped.
    // Retry the submit instead of asserting a race: the assertion is about staging, not timing.
    await submitUntilLoopStarts('Xin chào', pending);

    expect(pending[0]!.options).toBeTruthy();
    const indicator = await screen.findByTestId('ai-staged-loading');
    expect(indicator).toHaveAttribute('role', 'status');
    expect(within(indicator).getByText('Chuẩn bị ngữ cảnh')).toBeInTheDocument();

    pending[0]!.resolve({ fullResponse: 'Đã trả lời xong', tokenUsage: {} });
    await waitFor(() => expect(screen.getByText('Đã trả lời xong')).toBeInTheDocument());
    expect(screen.queryByTestId('ai-staged-loading')).toBeNull();
  });

  it('renders one collapsed tool badge and reveals arguments and result on expand', async () => {
    loopScript = async (options) => {
      options.onToolCall({ id: 'call-1', name: 'query_tasks', args: { projectId: 'p-1' } });
      options.onToolResult('call-1', '{"items":[]}', 7);
      return { fullResponse: 'Đã tra cứu xong', tokenUsage: {} };
    };
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);

    send('Có bao nhiêu tác vụ?');
    await waitFor(() => expect(screen.getByText('Đã tra cứu xong')).toBeInTheDocument());

    const badges = screen.getAllByRole('button', { name: /\[Công cụ\] query_tasks/ });
    expect(badges).toHaveLength(1);
    const badge = badges[0]!;
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('{"projectId":"p-1"}')).toBeNull();
    expect(screen.queryByText('{"items":[]}')).toBeNull();

    fireEvent.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('{"projectId":"p-1"}')).toBeInTheDocument();
    expect(screen.getByText('{"items":[]}')).toBeInTheDocument();
  });

  it('surfaces the approval-wait card with approve/reject and no spinner', async () => {
    loopScript = async (options) => {
      await options.onMutationCheck?.('create_task', { name: 'Tác vụ chờ duyệt' });
      return { fullResponse: 'Đã xử lý', tokenUsage: {} };
    };
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);
    await disableAnalysisMode(host);

    send('Tạo tác vụ mới');
    const card = await screen.findByTestId('ai-mutation-approval');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText('Yêu cầu xác nhận thay đổi dữ liệu')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Chấp thuận' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();

    // D-22: the card IS the wait state — no staged loader, no active-generation control.
    expect(screen.queryByTestId('ai-staged-loading')).toBeNull();
    expect(screen.queryByLabelText('Dừng sinh phản hồi')).toBeNull();
  });

  it('rejecting the mutation resumes the turn and persists nothing', async () => {
    let checked: { proceed: boolean } | undefined;
    loopScript = async (options) => {
      checked = await options.onMutationCheck?.('create_task', { name: 'Tác vụ bị từ chối' });
      return { fullResponse: '', tokenUsage: {} };
    };
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);
    await disableAnalysisMode(host);

    send('Tạo tác vụ mới');
    const card = await screen.findByTestId('ai-mutation-approval');
    fireEvent.click(within(card).getByRole('button', { name: 'Từ chối' }));

    await waitFor(() => expect(checked?.proceed).toBe(false));
    await waitFor(async () => {
      const rows = await threadMessages(db, host.scopeKey);
      expect(rows.filter((row) => row.role === 'assistant')).toHaveLength(0);
      expect(rows.filter((row) => row.role === 'user')).toHaveLength(1);
    });
    expect(await db.tasks.count()).toBe(0);
    expect(screen.queryByTestId('ai-mutation-approval')).toBeNull();
  });

  it('renders a sanitized error with retry and never leaks the api key', async () => {
    let attempt = 0;
    loopScript = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error(`provider rejected ${API_KEY}`);
      return { fullResponse: 'Đã thử lại thành công', tokenUsage: {} };
    };
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);

    send('Câu hỏi gây lỗi');
    // Ant Design toasts also carry role="alert"; the inline card is the turn's own error surface.
    const alert = await screen.findByTestId('inline-api-error-card');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(API_KEY);
    expect(document.body.textContent).not.toContain('provider rejected');

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Đã thử lại thành công')).toBeInTheDocument());

    // Retry reuses the persisted user row: the question is never duplicated.
    const rows = await threadMessages(db, host.scopeKey);
    expect(rows.filter((row) => row.role === 'user')).toHaveLength(1);
    expect(attempt).toBe(2);
  });

  it('clears only the active thread, never a sibling thread', async () => {
    let siblingThreadId: string;
    if (host.name === 'AIChatDrawer') {
      const active = await createChatTab(
        { scopeType: 'cr', scopeKey: DRAWER_SCOPE_KEY, entityId: PROJECT_ID, title: 'Tab chính' },
        db
      );
      const sibling = await createChatTab(
        { scopeType: 'cr', scopeKey: DRAWER_SCOPE_KEY, entityId: PROJECT_ID, title: 'Tab khác' },
        db
      );
      await setActiveTab(DRAWER_SCOPE_KEY, active.id, db);
      await saveMessage({ threadId: active.threadId, role: 'user', content: 'Tin nhắn tab chính' }, db);
      siblingThreadId = sibling.threadId;
      await saveMessage({ threadId: siblingThreadId, role: 'user', content: 'Tin nhắn tab khác' }, db);
    } else {
      const active = await getStepThread(PROJECT_ID, CR_ID, STEP_ID, db);
      const sibling = await getStepThread(PROJECT_ID, CR_ID, 'SOLUTION', db);
      await saveMessage({ threadId: active.id, role: 'user', content: 'Tin nhắn bước hiện tại' }, db);
      siblingThreadId = sibling.id;
      await saveMessage({ threadId: siblingThreadId, role: 'user', content: 'Tin nhắn bước khác' }, db);
    }

    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);
    await host.clearThread(db);

    fireEvent.click(await screen.findByRole('button', { name: 'Xóa tin nhắn' }));

    await waitFor(async () => {
      expect(await threadMessages(db, host.scopeKey)).toHaveLength(0);
    });
    const siblingRows = await getMessagesByThreadId(siblingThreadId, db);
    expect(siblingRows.map((row) => row.content)).toEqual([
      host.name === 'AIChatDrawer' ? 'Tin nhắn tab khác' : 'Tin nhắn bước khác',
    ]);
  });

  it('shows the host-provided scope label in the shared header', async () => {
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);

    const widget = screen.getByTestId('ai-chat-widget');
    expect(within(widget).getByText(host.scopeLabel)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid="ai-chat-widget"]')).toHaveLength(1);
  });

  it('never renders reasoning chunks in the transcript', async () => {
    const reasoning = 'REASONING-ONLY-PARITY-TOKEN';
    loopScript = async (options) => {
      options.onReasoningChunk?.(reasoning);
      return { fullResponse: 'Câu trả lời sạch', tokenUsage: {} };
    };
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);

    send('Giải thích giúp tôi');
    await waitFor(() => expect(screen.getByText('Câu trả lời sạch')).toBeInTheDocument());
    expect(document.body.textContent).not.toContain(reasoning);
  });

  it('renders the shared toolbox controls (model, Analysis Mode, Auto-approve, MCP)', async () => {
    await host.mount(db);
    await host.prepare(db);
    await host.ready(db);

    const controls = await host.toolbox();
    expect(screen.getByTestId('chat-tab-toolbox')).toBeInTheDocument();
    expect(controls.model).toBeInTheDocument();
    expect(controls.analysis).toBeInTheDocument();
    expect(controls.autoApprove).toBeInTheDocument();
    expect(controls.mcp).toBeInTheDocument();
    expect((controls.model as HTMLInputElement).disabled).not.toBe(true);
  });
});
