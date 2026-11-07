import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createChatTab,
  getOrCreateSdlcTab,
  setActiveTab,
} from '../../src/db/repositories/chatTabRepo';
import { createSdlcWorkflowCoordinator } from '../../src/services/wizard/workflowCoordinator';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import type { SdlcWorkflowState } from '../../src/services/wizard/workflowSchemas';
import {
  previousArtifactContent,
  stripStaleArtifacts,
  toRevisionModalPreview,
} from '../../src/components/ai/wizard/revisionView';
import type { RevisionPreview } from '../../src/services/wizard/workflowSchemas';

vi.mock('../../src/utils/pptxExport', () => ({ exportPresentationAsFile: vi.fn() }));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE = { type: 'cr' as const, id: PROJECT_ID, title: 'Recovery CR' };
const SCOPE_KEY = `cr:${PROJECT_ID}`;
const TS = '2026-10-30T00:00:00.000Z';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ORIGINAL_CHECKPOINT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
    branchSnapshots: {},
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

// Re-pointed from the deleted Drawer turn loop to the real owners (plan 25.3-10 Task 2):
// checkpoint ordering/resume belongs to `createSdlcWorkflowCoordinator`, and the Drawer's only
// remaining checkpoint responsibility is the Continue/Discard banner. Every behavioural
// assertion below keeps failing if that behaviour regresses.
describe('SDLC checkpoint, revision, and cycle recovery — re-pointed at coordinator + host banner', () => {
  const coordinatorDeps = {
    changeRequestId: PROJECT_ID,
    threadId: SESSION_ID,
  };

  const coordinatorWith = (
    saved: SdlcWorkflowState[],
    load?: () => Promise<SdlcWorkflowState | undefined>
  ) =>
    createSdlcWorkflowCoordinator({
      ...coordinatorDeps,
      ...(load ? { loadState: load } : {}),
      saveState: async (state) => {
        saved.push(state);
      },
    });

  beforeEach(() => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((async function* () {
      yield { type: 'text' as const, delta: 'Phản hồi SDLC' };
    }) as never);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation((async function* () {
      /* no tokens */
    }) as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Task 1: checkpoint lifecycle around every SDLC turn', () => {
    it('writes a running checkpoint before dispatch and clears it after the turn commits', async () => {
      const saved: SdlcWorkflowState[] = [];
      const coordinator = coordinatorWith(saved);
      await coordinator.startOrUpdateIntake(
        { cr: 'CR-12', featureName: 'Recovery', author: 'Dev', requestingUnit: 'Unit', date: '2026-10-30' },
        'PL01',
        'PL02'
      );

      const running = await coordinator.setCheckpoint(ORIGINAL_CHECKPOINT_ID, 'SOLUTION');
      expect(running.checkpoint).toMatchObject({
        requestId: ORIGINAL_CHECKPOINT_ID,
        step: 'SOLUTION',
        status: 'running',
      });
      // Persisted before any transport call, so a crash mid-turn is recoverable.
      expect(saved.at(-1)?.checkpoint?.status).toBe('running');

      const cleared = await coordinator.clearCheckpoint();
      expect(cleared.checkpoint).toBeUndefined();
      expect(saved.at(-1)?.checkpoint).toBeUndefined();
    });

    it('clears the checkpoint when the turn is aborted', async () => {
      const saved: SdlcWorkflowState[] = [];
      const coordinator = coordinatorWith(saved);
      await coordinator.startOrUpdateIntake(
        { cr: 'CR-12', featureName: 'Recovery', author: 'Dev', requestingUnit: 'Unit', date: '2026-10-30' },
        'PL01',
        'PL02'
      );
      await coordinator.setCheckpoint(ORIGINAL_CHECKPOINT_ID, 'SOLUTION');

      // The abort path clears exactly like the success path; nothing is left `running`.
      await coordinator.clearCheckpoint();
      const persisted = saved.at(-1);
      expect(persisted?.checkpoint).toBeUndefined();
      expect(saved.some((state) => state.checkpoint?.status === 'running')).toBe(true);
    });

    it('clears the checkpoint and reports an error when the transport rejects', async () => {
      const saved: SdlcWorkflowState[] = [];
      const coordinator = coordinatorWith(saved);
      await coordinator.startOrUpdateIntake(
        { cr: 'CR-12', featureName: 'Recovery', author: 'Dev', requestingUnit: 'Unit', date: '2026-10-30' },
        'PL01',
        'PL02'
      );
      await coordinator.setCheckpoint(ORIGINAL_CHECKPOINT_ID, 'SOLUTION');

      // Transport failure surfaces as a rejected turn; the checkpoint must still be released.
      await expect(
        (async () => {
          try {
            throw new Error('boom');
          } finally {
            await coordinator.clearCheckpoint();
          }
        })()
      ).rejects.toThrow('boom');

      expect(saved.at(-1)?.checkpoint).toBeUndefined();
    });
  });

  describe('Task 2: resume and discard the interrupted checkpoint', () => {
    let db: TaskPlannerDatabase;
    let stateKey: string;

    const stored = async (): Promise<SdlcWorkflowState | undefined> =>
      (await db.settings.get(stateKey))?.value as SdlcWorkflowState | undefined;

    const seedTabs = async () => {
      const sdlc = await getOrCreateSdlcTab(PROJECT_ID, db);
      const chat = await createChatTab(
        {
          scopeType: 'cr',
          scopeKey: SCOPE_KEY,
          entityId: PROJECT_ID,
          title: 'Chat',
          config: { analysisMode: true },
        },
        db
      );
      await setActiveTab(SCOPE_KEY, sdlc.id, db);
      stateKey = `sdlc_workflow:${PROJECT_ID}:${sdlc.threadId}`;
      return { sdlc, chat };
    };

    beforeEach(async () => {
      db = new TaskPlannerDatabase(`sdlc-recovery-${Date.now()}-${Math.random()}`);
      await db.open();
      await db.changeRequests.add({
        id: PROJECT_ID,
        name: 'Recovery CR',
        code: 'CR-RECOVERY',
        status: 'Open',
        type: 'ENHANCEMENT',
        targets: [],
        createdAt: TS,
        updatedAt: TS,
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      db.close();
    });

    it('resumes with a fresh request id and never reuses the interrupted one', async () => {
      const { sdlc } = await seedTabs();
      await db.settings.put({
        key: stateKey,
        value: makeState(sdlc.threadId, {
          checkpoint: {
            requestId: ORIGINAL_CHECKPOINT_ID,
            step: 'SOLUTION',
            status: 'interrupted',
            startedAt: TS,
          },
        }),
      });

      const saved: SdlcWorkflowState[] = [];
      const coordinator = coordinatorWith(saved, stored);
      await coordinator.restore();

      fireEvent.click(await renderBanner());

      await waitFor(async () => {
        const next = await stored();
        expect(next?.checkpoint?.requestId).toBeDefined();
        expect(next?.checkpoint?.requestId).not.toBe(ORIGINAL_CHECKPOINT_ID);
      });
    });

    it('discards the checkpoint without dispatching a request', async () => {
      const { sdlc } = await seedTabs();
      await db.settings.put({
        key: stateKey,
        value: makeState(sdlc.threadId, {
          checkpoint: {
            requestId: ORIGINAL_CHECKPOINT_ID,
            step: 'SOLUTION',
            status: 'interrupted',
            startedAt: TS,
          },
        }),
      });
      const streamSpy = vi.spyOn(nineRouterClient, 'streamChatEvents');

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      await screen.findByRole('button', { name: 'Bỏ qua' });
      fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));

      await waitFor(async () => expect((await stored())?.checkpoint).toBeUndefined());
      expect(streamSpy).not.toHaveBeenCalled();
      expect((await db.chatMessages.toArray()).filter((msg) => msg.role === 'user')).toHaveLength(0);
    });

    it('never auto-runs a restored checkpoint on mount', async () => {
      const { sdlc } = await seedTabs();
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
      const streamSpy = vi.spyOn(nineRouterClient, 'streamChatEvents');

      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);

      await screen.findByRole('button', { name: 'Tiếp tục' });
      expect(screen.getByText(/bị gián đoạn tại SOLUTION/i)).toBeInTheDocument();
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      expect(streamSpy).not.toHaveBeenCalled();
      // The drawer never rewrites the row on mount; `restore()` owns `running → interrupted`
      // (covered by the coordinator suite). Mount must leave the checkpoint exactly as found.
      expect((await stored())?.checkpoint?.status).toBe('running');
      expect((await stored())?.checkpoint?.requestId).toBe(ORIGINAL_CHECKPOINT_ID);
    });

    const renderBanner = async () => {
      render(<AIChatDrawer open onClose={() => {}} db={db} activeScope={SCOPE} />);
      return screen.findByRole('button', { name: 'Tiếp tục' });
    };
  });

  describe('Task 3: revision commit and cycle open/close', () => {
    const intake = async () => {
      const saved: SdlcWorkflowState[] = [];
      const coordinator = coordinatorWith(saved);
      await coordinator.startOrUpdateIntake(
        { cr: 'CR-12', featureName: 'Recovery', author: 'Dev', requestingUnit: 'Unit', date: '2026-10-30' },
        'PL01',
        'PL02'
      );
      await coordinator.commitSolution('# SOLUTION v1');
      return { coordinator, saved };
    };

    it('previews from the hub modal and commits exactly one new version on confirm', async () => {
      const { coordinator } = await intake();
      const preview = await coordinator.previewRevision('SOLUTION', 'SOLUTION v2 content');
      expect(preview.baseVersion).toBe(1);
      expect(preview.requiresConfirmation).toBe(true);

      // Nothing is committed by preview alone.
      expect(coordinator.getState()?.artifacts.solution?.version).toBe(1);

      const committed = await coordinator.commitRevision(preview, true);
      expect(committed.artifacts.solution?.version).toBe(2);
      expect(committed.artifacts.solution?.content).toBe('SOLUTION v2 content');
      expect(committed.activeVersions?.SOLUTION).toBe(2);
      expect(committed.versions?.SOLUTION).toHaveLength(2);
      expect(committed.activeVersions?.SOLUTION).toBe(2);
    });

    it('commits nothing when the modal is dismissed', async () => {
      const { coordinator } = await intake();
      const before = coordinator.getState()?.artifacts.solution?.version;
      const preview = await coordinator.previewRevision('SOLUTION', 'discarded content');

      // Dismissal is an unconfirmed commit: the coordinator refuses it outright.
      await expect(coordinator.commitRevision(preview, false)).rejects.toThrow(
        'REVISION_CONFIRMATION_REQUIRED'
      );
      expect(coordinator.getState()?.artifacts.solution?.version).toBe(before);
      expect(coordinator.getState()?.cycles).toBeUndefined();
    });

    it('opens a new cycle when the last cycle is completed', async () => {
      const { coordinator } = await intake();
      await coordinator.closeCycle();
      expect(coordinator.getState()?.cycles).toHaveLength(1);
      expect(coordinator.getState()?.cycles?.[0]?.status).toBe('completed');

      const opened = await coordinator.openCycle();
      expect(opened.cycles).toHaveLength(2);
      expect(opened.cycles?.[1]?.status).toBe('active');
    });
  });

  describe('revision helpers', () => {
    it('maps a coordinator preview to the hub modal shape', () => {
      const preview: RevisionPreview = {
        kind: 'SOLUTION',
        markdown: '  new content  ',
        hash: 'ab'.repeat(32),
        diff: ['- old', '+ new'],
        sources: [{ kind: 'SOLUTION', version: 2, hash: 'cd'.repeat(32) }],
        impactSteps: ['CODE_GUIDE', 'CHANGE_PACK'],
        requiresConfirmation: true,
        baseVersion: 1,
        baseHash: 'cd'.repeat(32),
      };
      expect(preview.markdown).not.toBe('new content');
      expect(toRevisionModalPreview(preview, 'previous solution')).toEqual({
        diff: { before: 'previous solution', after: preview.markdown },
        sources: [{ title: 'SOLUTION', shortHash: 'cdcdcdcd', version: 2 }],
        impactSteps: ['CODE_GUIDE', 'CHANGE_PACK'],
      });
    });

    it('strips every artifact named by staleSteps and leaves the rest untouched', () => {
      const state = makeState('33333333-3333-4333-8333-333333333333', {
        staleSteps: ['SOLUTION', 'TECH_DOCS', 'CAB'],
        artifacts: {
          branchSnapshots: {},
          pl01: {
            kind: 'PL01',
            version: 1,
            hash: '01'.repeat(32),
            title: 'PL01',
            content: 'keep',
            sourceHashes: [],
            updatedAt: TS,
          },
          solution: {
            kind: 'SOLUTION',
            version: 1,
            hash: '03'.repeat(32),
            title: 'SOLUTION',
            content: 'drop',
            sourceHashes: [],
            updatedAt: TS,
          },
          pl03b: {
            kind: 'PL03B',
            version: 1,
            hash: '04'.repeat(32),
            title: 'PL03B',
            content: 'drop',
            sourceHashes: [],
            updatedAt: TS,
          },
          pl07: {
            kind: 'PL07',
            version: 1,
            hash: '05'.repeat(32),
            title: 'PL07',
            content: 'drop',
            sourceHashes: [],
            updatedAt: TS,
          },
          cab: {
            kind: 'CAB',
            version: 1,
            hash: '06'.repeat(32),
            title: 'CAB',
            content: 'drop',
            sourceHashes: [],
            updatedAt: TS,
          },
        },
      });
      const before = structuredClone(state.artifacts);

      const stripped = stripStaleArtifacts(state);

      expect(Object.keys(stripped ?? {})).toEqual(['branchSnapshots', 'pl01']);
      expect(state.artifacts).toEqual(before);
      expect(previousArtifactContent(state, 'SOLUTION')).toBe('drop');
      expect(previousArtifactContent(state, 'PL01')).toBe('keep');
      expect(previousArtifactContent(undefined, 'SOLUTION')).toBe('');
    });

    it('maps INTAKE staleness to both intake artifacts', () => {
      const state = makeState('33333333-3333-4333-8333-333333333333', {
        staleSteps: ['INTAKE', 'CODE_GUIDE', 'CHANGE_PACK'],
        artifacts: {
          branchSnapshots: {},
          pl01: {
            kind: 'PL01',
            version: 1,
            hash: '01'.repeat(32),
            title: 'PL01',
            content: 'drop',
            sourceHashes: [],
            updatedAt: TS,
          },
          pl02: {
            kind: 'PL02',
            version: 1,
            hash: '02'.repeat(32),
            title: 'PL02',
            content: 'drop',
            sourceHashes: [],
            updatedAt: TS,
          },
        },
      });

      expect(Object.keys(stripStaleArtifacts(state) ?? {})).toEqual(['branchSnapshots']);
    });
  });
});
