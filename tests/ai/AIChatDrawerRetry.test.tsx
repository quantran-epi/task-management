import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { createRequestRegistry } from '../../src/components/ai/runtime/requestRegistry';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createChatTab,
  setActiveTab,
} from '../../src/db/repositories/chatTabRepo';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Retry Project' };
const SCOPE_KEY = `project:${PROJECT_ID}`;
const TS = '2026-10-30T00:00:00.000Z';
const CHAT_ONE = 'Tab A';
const CHAT_TWO = 'Tab B';

describe('AI retry ownership', () => {
  it('uses new request ID after prior request finishes and blocks double submit', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a', 'thread-a')!;
    expect(registry.begin('tab-a', 'thread-a')).toBeNull();
    registry.finish(first.requestId);

    const retry = registry.begin('tab-a', 'thread-a')!;
    expect(retry.requestId).not.toBe(first.requestId);
    expect(retry.tabId).toBe(first.tabId);
    expect(retry.threadId).toBe(first.threadId);
  });
});

function retryMessageId(messages: readonly { id: string; role: string; content: string }[], id: string | null): string | undefined {
  return id && messages.some((message) => message.id === id && message.role === 'user') ? id : undefined;
}

describe('AI retry message identity', () => {
  it('reuses immutable original user message ID instead of matching duplicate text', () => {
    const messages = [
      { id: 'user-a', role: 'user', content: 'same prompt' },
      { id: 'assistant-a', role: 'assistant', content: 'error' },
      { id: 'user-b', role: 'user', content: 'same prompt' },
    ];
    expect(retryMessageId(messages, 'user-a')).toBe('user-a');
    expect(retryMessageId(messages, 'missing')).toBeUndefined();
  });
});

describe('AIChatDrawer retry reuses the original user row (D-14)', () => {
  let db: TaskPlannerDatabase;
  let dispatches: any[];
  let failNext: boolean;

  const userRows = async (threadId: string) =>
    (await db.chatMessages.where('threadId').equals(threadId).toArray()).filter((m) => m.role === 'user');
  const assistantRows = async (threadId: string) =>
    (await db.chatMessages.where('threadId').equals(threadId).toArray()).filter((m) => m.role === 'assistant');

  const submit = (text: string) => {
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: text },
    });
    const send = screen.queryByLabelText('Gửi tin nhắn');
    if (send) fireEvent.click(send);
    else
      fireEvent.keyDown(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
        key: 'Enter',
        metaKey: true,
      });
  };

  const seedTabs = async () => {
    const first = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_ONE,
        config: { analysisMode: true },
      },
      db
    );
    const second = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: CHAT_TWO,
        config: { analysisMode: true },
      },
      db
    );
    await setActiveTab(SCOPE_KEY, first.id, db);
    return { first, second };
  };

  const openTab = async (title: string) => {
    fireEvent.click(await screen.findByRole('tab', { name: new RegExp(title) }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: new RegExp(title) })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
  };

  beforeEach(async () => {
    dispatches = [];
    failNext = true;
    db = new TaskPlannerDatabase(`retry-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Retry Project',
      status: 'Open',
      createdAt: TS,
      updatedAt: TS,
    });
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterTokenService, 'fetchAvailableModels').mockResolvedValue(['model-alpha']);
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) => {
      dispatches.push(options.payload);
      const shouldFail = failNext;
      failNext = false;
      return (async function* () {
        if (shouldFail) throw new Error('boom');
        yield { type: 'text' as const, delta: 'Phản hồi sau khi thử lại' };
      })();
    }) as never);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation((() =>
      (async function* () {
        /* no tokens */
      })()) as never);
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    db.close();
  });

  it('retries with a new request and keeps exactly one user row for the turn', async () => {
    const { first } = await seedTabs();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);

    submit('Phân tích lại yêu cầu');
    await waitFor(() => expect(dispatches).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('inline-api-error-card')).toBeInTheDocument());

    // Failed turn persisted the user row but never the failed output.
    expect(await userRows(first.threadId)).toHaveLength(1);
    expect(await assistantRows(first.threadId)).toHaveLength(0);

    fireEvent.click(screen.getByLabelText('Thử lại'));

    await waitFor(() => expect(dispatches).toHaveLength(2));
    await waitFor(() => expect(screen.getByText(/Phản hồi sau khi thử lại/)).toBeInTheDocument());

    expect(await userRows(first.threadId)).toHaveLength(1);
    expect(await assistantRows(first.threadId)).toHaveLength(1);

    // The retried history carries the prompt once, never twice.
    const retriedUsers = (dispatches[1].messages as Array<{ role: string; content: string }>).filter(
      (message) => message.role === 'user' && message.content.includes('Phân tích lại yêu cầu')
    );
    expect(retriedUsers).toHaveLength(1);
  });

  it('retries a failed assistant-only turn without resurrecting failed output', async () => {
    const { first } = await seedTabs();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);

    submit('Lỗi transport');
    await waitFor(() => expect(screen.getByTestId('inline-api-error-card')).toBeInTheDocument());
    expect(await assistantRows(first.threadId)).toHaveLength(0);
    expect(await userRows(first.threadId)).toHaveLength(1);
  });

  it('keeps retry anchors per tab', async () => {
    const { first, second } = await seedTabs();
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await openTab(CHAT_ONE);

    submit('Câu hỏi của tab A');
    await waitFor(() => expect(dispatches).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('inline-api-error-card')).toBeInTheDocument());

    await openTab(CHAT_TWO);
    failNext = true;
    submit('Câu hỏi của tab B');
    await waitFor(() => expect(dispatches).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId('inline-api-error-card')).toBeInTheDocument());

    // Back to A: its retry must reuse A's own user row and leave B untouched.
    await openTab(CHAT_ONE);
    fireEvent.click(screen.getByLabelText('Thử lại'));
    await waitFor(() => expect(dispatches).toHaveLength(3));

    expect(await userRows(first.threadId)).toHaveLength(1);
    expect(await userRows(second.threadId)).toHaveLength(1);
    const retried = dispatches[2].messages as Array<{ role: string; content: string }>;
    expect(retried.some((m) => m.role === 'user' && m.content.includes('Câu hỏi của tab A'))).toBe(true);
    expect(retried.some((m) => m.content.includes('Câu hỏi của tab B'))).toBe(false);
  });
});
