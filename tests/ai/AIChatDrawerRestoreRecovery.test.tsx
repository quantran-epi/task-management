import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { deriveMissingSources } from '../../src/components/ai/wizard/restoreRecovery';
import { TaskPlannerDatabase } from '../../src/db';
import { getOrCreateSdlcTab } from '../../src/db/repositories/chatTabRepo';
import type { SdlcWorkflowState } from '../../src/services/wizard/workflowSchemas';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'project' as const, id: PROJECT_ID, title: 'Restore Project' };
const TS = '2026-10-30T00:00:00.000Z';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_NOTE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

const artifact = (noteId: string, title: string) => ({
  noteId,
  kind: 'PL01' as const,
  version: 1,
  hash: '01'.repeat(32),
  title,
  content: 'nội dung',
  sourceHashes: [],
  updatedAt: TS,
});

const makeState = (threadId: string, artifacts: SdlcWorkflowState['artifacts']): SdlcWorkflowState => ({
  schemaVersion: 1,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  threadId,
  currentStep: 'SOLUTION',
  metadata: {
    cr: 'CR-14',
    featureName: 'Restore',
    author: 'Dev',
    requestingUnit: 'Unit',
    date: '2026-10-30',
  },
  artifacts,
  staleSteps: [],
  createdAt: TS,
  updatedAt: TS,
});

describe('deriveMissingSources', () => {
  it('returns titles for artifacts whose noteId is gone, de-duplicated, and skips driftResult', () => {
    const state = makeState('33333333-3333-4333-8333-333333333333', {
      pl01: artifact(MISSING_NOTE, 'PL01 nguồn đã xoá'),
      pl02: artifact(MISSING_NOTE, 'PL01 nguồn đã xoá'),
      solution: artifact('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'SOLUTION còn sống'),
      driftResult: {} as never,
    });

    expect(deriveMissingSources(state, new Set(['bbbbbbbb-bbbb-4bbb-8bbb-000000000001']))).toEqual([
      { id: MISSING_NOTE, title: 'PL01 nguồn đã xoá' },
    ]);
    expect(deriveMissingSources(undefined, new Set())).toEqual([]);
  });

  it('returns nothing when every referenced note exists', () => {
    const state = makeState('33333333-3333-4333-8333-333333333333', {
      pl01: artifact(MISSING_NOTE, 'PL01'),
    });

    expect(deriveMissingSources(state, new Set([MISSING_NOTE]))).toEqual([]);
  });
});

describe('AIChatDrawer restored-source recovery (D-30)', () => {
  let db: TaskPlannerDatabase;
  let stateKey: string;
  let dispatches: any[];

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

  const stored = async (): Promise<SdlcWorkflowState | undefined> =>
    (await db.settings.get(stateKey))?.value as SdlcWorkflowState | undefined;

  beforeEach(async () => {
    dispatches = [];
    db = new TaskPlannerDatabase(`restore-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Restore Project',
      status: 'Open',
      createdAt: TS,
      updatedAt: TS,
    });
    const sdlc = await getOrCreateSdlcTab(PROJECT_ID, db);
    stateKey = `sdlc_workflow:${PROJECT_ID}:${sdlc.threadId}`;
    await db.settings.put({
      key: stateKey,
      value: makeState(sdlc.threadId, { pl01: artifact(MISSING_NOTE, 'PL01 nguồn đã xoá') }),
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
      return (async function* () {
        yield { type: 'text' as const, delta: 'Phản hồi SDLC' };
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

  it('renders the real missing title instead of an empty notice', async () => {
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

    expect(await screen.findByText(/PL01 nguồn đã xoá/)).toBeInTheDocument();
  });

  it('blocks the next AI step before any transport call and leaves the checkpoint untouched', async () => {
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await screen.findByText(/PL01 nguồn đã xoá/);

    submit('Chạy bước tiếp theo');

    await waitFor(() =>
      expect(screen.getByTestId('inline-api-error-card')).toHaveTextContent(
        /Thiếu tài liệu nguồn của workflow đã khôi phục/
      )
    );
    expect(dispatches).toHaveLength(0);
    expect(await db.chatMessages.toArray()).toHaveLength(0);
    expect((await stored())?.checkpoint).toBeUndefined();
  });

  it('unblocks once the source Note exists again', async () => {
    render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
    await screen.findByText(/PL01 nguồn đã xoá/);

    await db.notes.add({
      id: MISSING_NOTE,
      title: 'PL01 nguồn đã xoá',
      body: 'khôi phục',
      isPinned: false,
      createdAt: TS,
      updatedAt: TS,
    });
    await waitFor(() => expect(screen.queryByText(/PL01 nguồn đã xoá/)).toBeNull());

    submit('Chạy bước tiếp theo');
    await waitFor(() => expect(dispatches).toHaveLength(1));
  });
});
