import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createChatTab,
  getOrCreateSdlcTab,
  setActiveTab,
} from '../../src/db/repositories/chatTabRepo';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import type { SdlcWorkflowState } from '../../src/services/wizard/workflowSchemas';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Recovery Project' };
const SCOPE_KEY = `project:${PROJECT_ID}`;
const TS = '2026-10-30T00:00:00.000Z';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ORIGINAL_CHECKPOINT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const DRAWER_PATH = path.resolve(process.cwd(), 'src/components/ai/AIChatDrawer.tsx');
const CLOSERS: Record<string, string> = { '(': ')', '{': '}', '[': ']' };

function matchBalanced(source: string, start: number): number {
  const opener = source[start];
  const closer = opener ? CLOSERS[opener] : undefined;
  if (!closer) return -1;

  let depth = 0;
  // 'code' or an open quote character. `${` pushes a nested code mode inside a template.
  const modes: string[] = ['code'];
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    const mode = modes[modes.length - 1];
    if (mode !== 'code') {
      if (char === '\\') i += 1;
      else if (mode === '`' && char === '$' && source[i + 1] === '{') {
        modes.push('code');
        i += 1;
      } else if (char === mode) modes.pop();
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      modes.push(char);
      continue;
    }
    if (char === '}' && modes.length > 1) {
      modes.pop();
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function extractSendBody(source: string): string {
  const clean = stripComments(source);
  const marker = 'const handleSendMessage = async (';
  const start = clean.indexOf(marker);
  if (start === -1) throw new Error('handleSendMessage not found');
  const bodyOpen = clean.indexOf('=> {', start) + '=> '.length;
  const bodyClose = matchBalanced(clean, bodyOpen);
  if (bodyClose === -1) throw new Error('handleSendMessage body not matched');
  return clean.slice(bodyOpen, bodyClose + 1);
}

  const makeState = (
  threadId: string,
  overrides: Partial<SdlcWorkflowState> = {}
): SdlcWorkflowState => ({
  schemaVersion: 1,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  threadId,
  currentStep: 'SOLUTION',
  metadata: {
    cr: 'CR-12',
    featureName: 'Recovery',
    author: 'Dev',
    requestingUnit: 'Unit',
    date: '2026-10-30',
  },
  artifacts: {
    pl01: {
      kind: 'PL01',
      version: 1,
      hash: '01'.repeat(32),
      title: 'PL01',
      content: 'PL01 content',
      sourceHashes: [],
      updatedAt: TS,
    },
    pl02: {
      kind: 'PL02',
      version: 1,
      hash: '02'.repeat(32),
      title: 'PL02',
      content: 'PL02 content',
      sourceHashes: ['01'.repeat(32)],
      updatedAt: TS,
    },
    solution: {
      kind: 'SOLUTION',
      version: 1,
      hash: '03'.repeat(32),
      title: 'SOLUTION',
      content: 'SOLUTION v1 content',
      sourceHashes: ['01'.repeat(32), '02'.repeat(32)],
      updatedAt: TS,
    },
  },
  staleSteps: [],
  createdAt: TS,
  updatedAt: TS,
  ...overrides,
});

describe('AIChatDrawer SDLC checkpoint, revision, and cycle recovery', () => {
  let db: TaskPlannerDatabase;
  let stateKey: string;

  const stored = async (): Promise<SdlcWorkflowState | undefined> =>
    (await db.settings.get(stateKey))?.value as SdlcWorkflowState | undefined;

  const seedTabs = async (active: 'sdlc' | 'chat' = 'sdlc') => {
    const sdlc = await getOrCreateSdlcTab(PROJECT_ID, db);
    const chat = await createChatTab(
      {
        scopeType: 'project',
        scopeKey: SCOPE_KEY,
        entityId: PROJECT_ID,
        title: 'Chat',
        config: { analysisMode: true },
      },
      db
    );
    await setActiveTab(SCOPE_KEY, active === 'sdlc' ? sdlc.id : chat.id, db);
    stateKey = `sdlc_workflow:${PROJECT_ID}:${sdlc.threadId}`;
    return { sdlc, chat };
  };

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

  const answerStream = (dispatches: any[], atDispatch: (SdlcWorkflowState | undefined)[] = []) => {
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) => {
      dispatches.push(options);
      return (async function* () {
        atDispatch.push(await stored());
        yield { type: 'text' as const, delta: 'Phản hồi SDLC' };
      })();
    }) as never);
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`sdlc-recovery-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Recovery Project',
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

  describe('Task 1: checkpoint lifecycle around every SDLC turn', () => {
    it('places setCheckpoint before the enclosing try and clears it once in finally', () => {
      const source = fs.readFileSync(DRAWER_PATH, 'utf8');
      const body = extractSendBody(source);

      const setIndex = body.indexOf('setCheckpoint(');
      expect(setIndex).toBeGreaterThan(-1);

      const tryIndex = body.indexOf('try {', setIndex);
      expect(tryIndex).toBeGreaterThan(setIndex);

      const tryClose = matchBalanced(body, body.indexOf('{', tryIndex));
      expect(tryClose).toBeGreaterThan(tryIndex);

      const returns = [...body.matchAll(/\breturn;/g)].map((match) => match.index ?? -1);
      const postCheckpointReturns = returns.filter((index) => index > setIndex);
      expect(postCheckpointReturns.length).toBeGreaterThan(0);
      for (const index of postCheckpointReturns) {
        expect(index).toBeGreaterThan(tryIndex);
        expect(index).toBeLessThan(tryClose);
      }

      const clearIndexes = [...body.matchAll(/clearCheckpoint\(/g)].map((match) => match.index ?? -1);
      expect(clearIndexes).toHaveLength(1);
      expect(clearIndexes[0]).toBeGreaterThan(tryClose);
      expect(body.slice(tryClose)).toContain('finally');
    });

    it('writes a running checkpoint before dispatch and clears it after the response commits', async () => {
      const { sdlc } = await seedTabs();
      await db.settings.put({ key: stateKey, value: makeState(sdlc.threadId) });
      const dispatches: any[] = [];
      const atDispatch: (SdlcWorkflowState | undefined)[] = [];
      answerStream(dispatches, atDispatch);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      await screen.findByText(/SDLC: Recovery/);
      submit('Phân tích giải pháp');

      await waitFor(() => expect(dispatches).toHaveLength(1));
      expect(atDispatch[0]?.checkpoint?.status).toBe('running');
      await waitFor(async () => expect((await stored())?.checkpoint).toBeUndefined());
    });

    it('clears the checkpoint when the turn is aborted', async () => {
      const { sdlc } = await seedTabs();
      await db.settings.put({ key: stateKey, value: makeState(sdlc.threadId) });
      vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(((options: any) =>
        (async function* () {
          await new Promise<void>((resolve) => {
            if (options.signal?.aborted) resolve();
            else options.signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        })()) as never);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      await screen.findByText(/SDLC: Recovery/);
      submit('Bị dừng giữa chừng');
      await waitFor(() => expect(screen.getByLabelText('Dừng sinh phản hồi')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText('Dừng sinh phản hồi'));

      await waitFor(async () => expect((await stored())?.checkpoint).toBeUndefined());
    });

    it('clears the checkpoint and reports an error when the transport rejects', async () => {
      const { sdlc } = await seedTabs();
      await db.settings.put({ key: stateKey, value: makeState(sdlc.threadId) });
      vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((() =>
        (async function* () {
          throw new Error('boom');
        })()) as never);
      vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation((() =>
        (async function* () {
          throw new Error('boom');
        })()) as never);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      await screen.findByText(/SDLC: Recovery/);
      submit('Lỗi transport');

      await waitFor(() =>
        expect(screen.getAllByTestId('inline-api-error-card')).toHaveLength(1)
      );
      await waitFor(async () => expect((await stored())?.checkpoint).toBeUndefined());
    });

    it('never writes an SDLC checkpoint for an ordinary chat tab', async () => {
      await seedTabs('chat');
      const dispatches: any[] = [];
      answerStream(dispatches);

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      await screen.findByRole('tab', { name: /Chat/ });
      submit('Câu hỏi thường');

      await waitFor(() => expect(dispatches).toHaveLength(1));
      const sdlcSettings = await db.settings.toArray();
      expect(sdlcSettings.filter((row) => String(row.key).startsWith('sdlc_workflow:'))).toEqual([]);
      expect(dispatches[0].payload.messages[0].content).not.toContain('[Quy trình SDLC');
    });
  });

  describe('Task 2: resume and discard the interrupted checkpoint', () => {
    const interruptedState = (threadId: string) =>
      makeState(threadId, {
        checkpoint: {
          requestId: ORIGINAL_CHECKPOINT_ID,
          step: 'SOLUTION',
          status: 'interrupted',
          startedAt: TS,
        },
      });

    const renderInterrupted = async (threadId: string) => {
      await db.settings.put({ key: stateKey, value: interruptedState(threadId) });
      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      return screen.findByRole('button', { name: 'Tiếp tục' });
    };

    it('resumes with a fresh request id and dispatches exactly one request', async () => {
      const { sdlc } = await seedTabs();
      const dispatches: any[] = [];
      answerStream(dispatches);

      fireEvent.click(await renderInterrupted(sdlc.threadId));

      await waitFor(() => expect(dispatches).toHaveLength(1));
      const afterResume = await stored();
      expect(afterResume?.checkpoint?.requestId).not.toBe(ORIGINAL_CHECKPOINT_ID);

      await waitFor(async () => expect((await stored())?.checkpoint).toBeUndefined());
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].payload.messages.at(-1).content).toContain('sau khi bị gián đoạn');
    });

    it('still blocks a plain send while the checkpoint is interrupted', async () => {
      const { sdlc } = await seedTabs();
      const dispatches: any[] = [];
      answerStream(dispatches);

      await renderInterrupted(sdlc.threadId);
      submit('Gửi thường khi đang gián đoạn');

      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      expect(dispatches).toHaveLength(0);
      expect((await stored())?.checkpoint?.status).toBe('interrupted');
    });

    it('discards the checkpoint without calling the transport', async () => {
      const { sdlc } = await seedTabs();
      const dispatches: any[] = [];
      answerStream(dispatches);

      await renderInterrupted(sdlc.threadId);
      fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));

      await waitFor(async () => expect((await stored())?.checkpoint).toBeUndefined());
      expect(dispatches).toHaveLength(0);
      const messages = await db.chatMessages.toArray();
      expect(messages.filter((msg) => msg.role === 'user')).toHaveLength(0);
    });

    it('never auto-runs a restored checkpoint on mount', async () => {
      const { sdlc } = await seedTabs();
      const dispatches: any[] = [];
      answerStream(dispatches);

      await db.settings.put({
        key: stateKey,
        value: makeState(sdlc.threadId, {
          checkpoint: {
            requestId: ORIGINAL_CHECKPOINT_ID,
            step: 'SOLUTION',
            status: 'running',
            startedAt: TS,
          },
        }),
      });
      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

      await screen.findByRole('button', { name: 'Tiếp tục' });
      expect(screen.getByText(/bị gián đoạn tại SOLUTION/i)).toBeInTheDocument();
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      expect(dispatches).toHaveLength(0);
      expect((await stored())?.checkpoint?.status).toBe('interrupted');
    });
  });
});
