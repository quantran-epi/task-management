import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createChatTab,
  listTabsByScope,
  setActiveTab,
} from '../../src/db/repositories/chatTabRepo';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

vi.mock('../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Isolation Project' };
const SCOPE_KEY = `project:${PROJECT_ID}`;
const CHAT_ONE = '💬 Cuộc trò chuyện #1';
const CHAT_TWO = '💬 Cuộc trò chuyện #2';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('AIChatDrawer multi-tab isolation', () => {
  let db: TaskPlannerDatabase;
  let streamSignals: AbortSignal[];
  let streamPayloads: any[];

  const seedTabs = async (config?: Record<string, unknown>) => {
    const first = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_ONE,
        ...(config ? { config: config as never } : {}),
      },
      db
    );
    const second = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_TWO,
        ...(config ? { config: config as never } : {}),
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

  const submit = (text: string) => {
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: text },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
  };

  beforeEach(async () => {
    streamSignals = [];
    streamPayloads = [];
    db = new TaskPlannerDatabase(`isolation-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Isolation Project',
      status: 'Open',
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:00:00.000Z',
    });
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterTokenService, 'fetchAvailableModels').mockResolvedValue([
      'model-alpha',
      'model-beta',
    ]);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(
      (async function* () {
        /* no tokens */
      }) as never
    );
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    db.close();
  });

  const hangStream = () => {
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) => {
      streamPayloads.push(options.payload);
      streamSignals.push(options.signal);
      return (async function* () {
        await new Promise<void>(() => {});
        yield { type: 'text' as const, delta: 'never' };
      })();
    }) as never);
  };

  it('seeds per-tab runtimes so tab badges show real per-tab status', async () => {
    await seedTabs({ analysisMode: true });
    hangStream();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await openTab(CHAT_ONE);
    submit('Tab A request');

    await waitFor(() => expect(streamSignals).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: new RegExp(`${escape(CHAT_ONE)} — Đang xử lý`) })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('tab', { name: new RegExp(`${escape(CHAT_TWO)} — `) })
    ).toBeNull();
  });

  it('streams concurrently in two tabs without aborting the first request', async () => {
    await seedTabs({ analysisMode: true });
    hangStream();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await openTab(CHAT_ONE);
    submit('Tab A request');
    await waitFor(() => expect(streamSignals).toHaveLength(1));

    await openTab(CHAT_TWO);
    submit('Tab B request');
    await waitFor(() => expect(streamSignals).toHaveLength(2));

    expect(streamSignals[0]?.aborted).toBe(false);
    expect(streamSignals[1]?.aborted).toBe(false);
  });

  it('stop aborts only the active tab request', async () => {
    await seedTabs({ analysisMode: true });
    hangStream();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await openTab(CHAT_ONE);
    submit('Tab A request');
    await waitFor(() => expect(streamSignals).toHaveLength(1));

    await openTab(CHAT_TWO);
    submit('Tab B request');
    await waitFor(() => expect(streamSignals).toHaveLength(2));

    fireEvent.click(screen.getByLabelText('Dừng sinh phản hồi'));

    await waitFor(() => expect(streamSignals[1]?.aborted).toBe(true));
    expect(streamSignals[0]?.aborted).toBe(false);
  });

  it('unmounting the drawer aborts every tab request', async () => {
    await seedTabs({ analysisMode: true });
    hangStream();
    const { unmount } = render(
      <AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />
    );

    await openTab(CHAT_ONE);
    submit('Tab A request');
    await waitFor(() => expect(streamSignals).toHaveLength(1));

    await openTab(CHAT_TWO);
    submit('Tab B request');
    await waitFor(() => expect(streamSignals).toHaveLength(2));

    unmount();
    expect(streamSignals[0]?.aborted).toBe(true);
    expect(streamSignals[1]?.aborted).toBe(true);
  });

  it('keeps a composer draft per tab across tab switches', async () => {
    await seedTabs({ analysisMode: true });
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await openTab(CHAT_ONE);
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Draft only in tab A' },
    });

    await openTab(CHAT_TWO);
    expect(
      (screen.getByLabelText('Nội dung tin nhắn trò chuyện AI') as HTMLTextAreaElement).value
    ).toBe('');

    await openTab(CHAT_ONE);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Nội dung tin nhắn trò chuyện AI') as HTMLTextAreaElement).value
      ).toBe('Draft only in tab A')
    );
  });

  it('persists the model per tab in ChatTab.config and resolves it after reopen', async () => {
    const { first, second } = await seedTabs({ analysisMode: true });
    const firstRender = render(
      <AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />
    );
    await openTab(CHAT_ONE);

    fireEvent.mouseDown(screen.getByLabelText('Chọn mô hình AI'));
    const option = await screen.findByText('model-beta');
    fireEvent.click(option);

    await waitFor(async () => {
      const row = await db.chatTabs.get(first.id);
      expect(row?.config?.model).toBe('model-beta');
    });
    const other = await db.chatTabs.get(second.id);
    expect(other?.config?.model).not.toBe('model-beta');

    firstRender.unmount();

    hangStream();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);
    submit('Model after reopen');
    await waitFor(() => expect(streamPayloads).toHaveLength(1));
    expect(streamPayloads[0]?.model).toBe('model-beta');
  });

  it('sends a non-empty model on the first turn of a fresh tab', async () => {
    await seedTabs({ analysisMode: true });
    hangStream();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    await openTab(CHAT_ONE);
    submit('First turn');
    await waitFor(() => expect(streamPayloads).toHaveLength(1));
    expect(streamPayloads[0]?.model).toBeTruthy();
    expect(streamPayloads[0]?.model).not.toBe('');
  });

  it('renders the error card only for the tab that failed', async () => {
    await seedTabs({ analysisMode: true });
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((() =>
      (async function* () {
        throw new Error('boom');
      })()) as never);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(
      (async function* () {
        throw new Error('boom');
      }) as never
    );

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);
    submit('Failing turn');

    await waitFor(() =>
      expect(screen.getAllByTestId('inline-api-error-card')).toHaveLength(1)
    );

    await openTab(CHAT_TWO);
    expect(screen.queryByTestId('inline-api-error-card')).toBeNull();

    await openTab(CHAT_ONE);
    await waitFor(() =>
      expect(screen.getAllByTestId('inline-api-error-card')).toHaveLength(1)
    );
  });

  it('keeps mutation confirmation owned by its own tab', async () => {
    await seedTabs();
    let call = 0;
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((() => {
      call += 1;
      if (call === 1) {
        return (async function* () {
          yield {
            type: 'tool_calls' as const,
            calls: [
              {
                id: 'call_iso_task',
                type: 'function',
                function: {
                  name: 'create_task',
                  arguments: JSON.stringify({ name: 'Tác vụ cách ly tab' }),
                },
              },
            ],
          };
        })();
      }
      return (async function* () {
        yield { type: 'text' as const, delta: 'Đã tạo tác vụ cách ly.' };
      })();
    }) as never);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);
    submit('Tạo task');

    await waitFor(() =>
      expect(screen.getByTestId('ai-mutation-confirmation')).toBeInTheDocument()
    );

    await openTab(CHAT_TWO);
    expect(screen.queryByTestId('ai-mutation-confirmation')).toBeNull();

    await openTab(CHAT_ONE);
    await waitFor(() =>
      expect(screen.getByTestId('ai-mutation-confirmation')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByLabelText('Xác nhận thao tác'));
    await waitFor(() =>
      expect(screen.getByText(/Đã tạo tác vụ cách ly/i)).toBeInTheDocument()
    );
  });

  it('never commits assistant output for a request superseded mid-stream', async () => {
    await seedTabs({ analysisMode: true });
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) => {
      streamSignals.push(options.signal);
      return (async function* () {
        await new Promise<void>((resolve) => setTimeout(resolve, 40));
        yield { type: 'text' as const, delta: 'late output' };
      })();
    }) as never);

    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);
    submit('Stop me');

    await waitFor(() => expect(screen.getByLabelText('Dừng sinh phản hồi')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Dừng sinh phản hồi'));

    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const tab = (await listTabsByScope(SCOPE_KEY, db)).find((row) => row.title === CHAT_ONE);
    const messages = await db.chatMessages.where('threadId').equals(tab!.threadId).toArray();
    expect(messages.filter((msg) => msg.role === 'assistant')).toHaveLength(0);
    expect(messages.filter((msg) => msg.role === 'user')).toHaveLength(1);
  });
});
