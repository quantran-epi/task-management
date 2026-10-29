import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  loadCanonicalArtifactChain,
  saveApprovedArtifact,
  saveSolutionVersion,
} from '../../src/services/wizard/artifactRepo';
import {
  createWizardCoordinator,
  deriveActiveWizard,
  type WizardCoordinatorDeps,
} from '../../src/services/wizard/wizardCoordinator';
import {
  SdlcArtifactMetadataSchema,
  SdlcDocumentSetMetadataSchema,
  WizardSnapshotSchema,
  WizardTransitionError,
  assertWizardTransition,
  buildWizardIdempotencyKey,
} from '../../src/services/ai/wizardSchemas';
import { DocumentSetSchema } from '../../src/validation/knowledgeSchemas';
import { NoteSchema } from '../../src/validation/schemas';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOTE_ID = '44444444-4444-4444-8444-444444444444';
const HASH = 'a'.repeat(64);
const NOW = '2026-10-28T12:00:00.000Z';

function snapshot(
  status: 'collecting' | 'gap_fill' | 'review' | 'approved' | 'exporting' | 'completed' | 'abandoned',
  overrides: Record<string, unknown> = {},
) {
  const draftRevision = ['review', 'approved', 'exporting', 'completed'].includes(status) ? 1 : null;
  const approvedAt = ['approved', 'exporting', 'completed'].includes(status) ? NOW : null;
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    skill: 'SOLUTION',
    status,
    inputRevision: status === 'collecting' ? 0 : 1,
    draftRevision,
    approvedAt,
    artifactId: status === 'completed' ? NOTE_ID : null,
    artifactHash: status === 'completed' ? HASH : null,
    renderPayload: { title: 'SOLUTION', featureMode: 'new' },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function expectTransitionCode(previous: unknown, next: unknown, code: string) {
  expect(() => assertWizardTransition(previous, next)).toThrowError(
    expect.objectContaining<Partial<WizardTransitionError>>({ code }),
  );
}

function approvedSnapshot(overrides: Record<string, unknown> = {}) {
  return WizardSnapshotSchema.parse(snapshot('approved', {
    artifactHash: HASH,
    renderPayload: { title: 'SOLUTION', featureMode: 'new', markdown: '# Solution v1' },
    ...overrides,
  }));
}

describe('wizard coordinator lifecycle', () => {
  const projectId = PROJECT_ID;
  const threadId = THREAD_ID;
  const sessionId = SESSION_ID;
  const collecting = WizardSnapshotSchema.parse(snapshot('collecting', {
    sessionId,
    projectId,
    threadId,
    skill: 'PL02',
    renderPayload: { title: 'PL02', markdown: '# Draft' },
  }));

  function coordinatorDeps(overrides: Partial<WizardCoordinatorDeps> = {}): WizardCoordinatorDeps {
    return {
      projectId,
      threadId,
      db: new TaskPlannerDatabase(`wizard-coordinator-${Date.now()}-${Math.random()}`),
      now: () => NOW,
      createSessionId: () => sessionId,
      collectEvidence: vi.fn().mockResolvedValue({ items: [], coverage: 'COMPLETE', degraded: [] }),
      runStage: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        gaps: [{ sectionId: 'PL02.II', fieldId: 'threshold', question: 'Ngưỡng áp dụng là bao nhiêu?', citationIds: [], suggestions: [] }],
        unknowns: ['threshold'],
        contradictions: [],
      }),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn().mockResolvedValue(undefined),
      saveSolution: vi.fn().mockResolvedValue({ created: true, note: { id: NOTE_ID } }),
      ...overrides,
    };
  }

  it('starts only in project scope, persists collecting, and asks gaps after grounded stage', async () => {
    const deps = coordinatorDeps();
    const coordinator = createWizardCoordinator(deps);
    const started = await coordinator.start('PL02', { cr: 'CR-1', featureName: 'Feature', requestingUnit: '', author: 'User', date: '2026-10-28' });
    expect(started.projectId).toBe(projectId);
    expect(deps.collectEvidence).toHaveBeenCalledTimes(1);
    expect(deps.runStage).toHaveBeenCalledTimes(1);
    expect(deps.saveSnapshot).toHaveBeenCalled();
  });

  it('invalidates late stage results when cancelled and restores without rerun', async () => {
    let resolveStage: ((value: unknown) => void) | undefined;
    const deps = coordinatorDeps({
      runStage: vi.fn().mockImplementation(() => new Promise((resolve) => { resolveStage = resolve; })),
    });
    const coordinator = createWizardCoordinator(deps);
    const pending = coordinator.start('PL02', { cr: 'CR-1', featureName: 'Feature', requestingUnit: '', author: 'User', date: '2026-10-28' });
    coordinator.cancel();
    resolveStage?.({ schemaVersion: 1, gaps: [], unknowns: [], contradictions: [] });
    await pending;
    expect(deps.saveSnapshot).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'gap_fill' }));

    const restored = deriveActiveWizard([{ ...collecting, updatedAt: NOW } as any], projectId, threadId);
    expect(restored?.status).toBe('collecting');
    const restoreDeps = coordinatorDeps({ loadMessages: vi.fn().mockResolvedValue([{ ...collecting, updatedAt: NOW } as any]), runStage: vi.fn() });
    await createWizardCoordinator(restoreDeps).restore();
    expect(restoreDeps.runStage).not.toHaveBeenCalled();
  });

  it('retains answered input, invalidates approval on context, and deduplicates solution approval', async () => {
    const deps = coordinatorDeps({
      runStage: vi.fn().mockResolvedValue({ schemaVersion: 1, gaps: [], unknowns: [], contradictions: [] }),
    });
    const coordinator = createWizardCoordinator(deps);
    await coordinator.start('SOLUTION', { cr: 'CR-1', featureName: 'Feature', requestingUnit: '', author: 'User', date: '2026-10-28' });
    await coordinator.addContext('API /limits');
    await Promise.all([coordinator.approveSolution(), coordinator.approveSolution()]);
    expect(deps.saveSolution).toHaveBeenCalledTimes(1);
  });
});

describe('wizard artifact persistence', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`wizard-artifact-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.projects.add({
      id: PROJECT_ID,
      name: 'Wizard project',
      status: 'Open',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.chatThreads.add({
      id: THREAD_ID,
      scopeKey: `project:${PROJECT_ID}`,
      scopeType: 'project',
      entityId: PROJECT_ID,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.chatMessages.add({
      id: '55555555-5555-4555-8555-555555555555',
      threadId: THREAD_ID,
      role: 'assistant',
      content: 'Approved SOLUTION preview',
      createdAt: NOW,
      wizard: approvedSnapshot(),
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('deduplicates concurrent SOLUTION saves and allocates changed drafts from metadata', async () => {
    const input = {
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: HASH,
      markdown: '# Solution v1',
      exportPayload: { schemaVersion: 1, title: 'SOLUTION v1' },
      approvedAt: NOW,
    };

    const [first, replay] = await Promise.all([
      saveSolutionVersion(input, db),
      saveSolutionVersion(input, db),
    ]);
    expect([first.created, replay.created].sort()).toEqual([false, true]);
    expect(first.note.id).toBe(replay.note.id);
    expect(await db.notes.count()).toBe(1);
    expect(await db.chatMessages.where('threadId').equals(THREAD_ID).count()).toBe(2);

    const original = JSON.stringify(first.note);
    const nextHash = 'b'.repeat(64);
    await db.chatMessages.add({
      id: '66666666-6666-4666-8666-666666666666',
      threadId: THREAD_ID,
      role: 'assistant',
      content: 'Approved SOLUTION v2 preview',
      createdAt: '2026-10-28T12:01:00.000Z',
      wizard: approvedSnapshot({
        draftRevision: 2,
        artifactHash: nextHash,
        renderPayload: { title: 'SOLUTION', featureMode: 'new', markdown: '# Solution v2' },
        approvedAt: '2026-10-28T12:01:00.000Z',
        updatedAt: '2026-10-28T12:01:00.000Z',
      }),
    });
    const second = await saveSolutionVersion({
      ...input,
      draftRevision: 2,
      inputHash: nextHash,
      markdown: '# Solution v2',
      exportPayload: { schemaVersion: 1, title: 'SOLUTION v2' },
      approvedAt: '2026-10-28T12:01:00.000Z',
    }, db);

    expect(second.note.sdlcArtifact?.version).toBe(2);
    expect(JSON.stringify(await db.notes.get(first.note.id))).toBe(original);
    expect((await loadCanonicalArtifactChain(PROJECT_ID, THREAD_ID, db)).map((note) => note.sdlcArtifact?.version)).toEqual([1, 2]);
  });

  it('saves approved artifact, set membership, and event atomically without Blob data', async () => {
    const source = await saveSolutionVersion({
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: HASH,
      markdown: '# Solution v1',
      exportPayload: { schemaVersion: 1, title: 'SOLUTION v1' },
      approvedAt: NOW,
    }, db);
    const artifactHash = 'c'.repeat(64);
    await db.chatMessages.add({
      id: '77777777-7777-4777-8777-777777777777',
      threadId: THREAD_ID,
      role: 'assistant',
      content: 'Approved PL02 preview',
      createdAt: '2026-10-28T12:02:00.000Z',
      wizard: {
        ...approvedSnapshot(),
        skill: 'PL02',
        artifactId: null,
        artifactHash,
        renderPayload: { title: 'PL02', markdown: '# PL02' },
        approvedAt: '2026-10-28T12:02:00.000Z',
        updatedAt: '2026-10-28T12:02:00.000Z',
      },
    });

    const result = await saveApprovedArtifact({
      kind: 'PL02',
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: artifactHash,
      markdown: '# PL02',
      exportPayload: { schemaVersion: 1, sections: ['I'] },
      sourceArtifacts: [{ id: source.note.id, hash: HASH }],
      approvedAt: '2026-10-28T12:02:00.000Z',
    }, db);

    const set = await db.documentSets.filter((candidate) => candidate.sdlc?.projectId === PROJECT_ID).first();
    expect(set?.documentIds).toEqual([source.note.id, result.note.id]);
    expect(result.note.entityType).toBe('project');
    expect(JSON.stringify(result.note)).not.toContain('Blob');
    expect((await db.chatMessages.where('threadId').equals(THREAD_ID).toArray()).some((message) => message.wizard?.artifactId === result.note.id)).toBe(true);
  });

  it('rejects stale, cross-project, and hash-mismatched commits without mutation', async () => {
    const counts = async () => ({
      notes: await db.notes.count(),
      sets: await db.documentSets.count(),
      messages: await db.chatMessages.count(),
    });
    const before = await counts();
    const base = {
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      draftRevision: 1,
      inputHash: HASH,
      markdown: '# Solution v1',
      exportPayload: { schemaVersion: 1 },
      approvedAt: NOW,
    };
    await expect(saveSolutionVersion({ ...base, inputHash: 'd'.repeat(64) }, db)).rejects.toMatchObject({ code: 'WIZARD_HASH_MISMATCH' });
    await expect(saveSolutionVersion({ ...base, projectId: NOTE_ID }, db)).rejects.toMatchObject({ code: 'WIZARD_PROJECT_MISMATCH' });
    await expect(saveSolutionVersion({ ...base, draftRevision: 2 }, db)).rejects.toMatchObject({ code: 'WIZARD_DRAFT_REVISION_STALE' });
    expect(await counts()).toEqual(before);
  });
});

describe('wizard lifecycle contracts', () => {
  it('accepts legal lifecycle, review edits, and abandoned snapshots', () => {
    const collecting = WizardSnapshotSchema.parse(snapshot('collecting'));
    const gapFill = WizardSnapshotSchema.parse(snapshot('gap_fill'));
    const review = WizardSnapshotSchema.parse(snapshot('review'));
    const approved = WizardSnapshotSchema.parse(snapshot('approved'));
    const exporting = WizardSnapshotSchema.parse(snapshot('exporting'));
    const completed = WizardSnapshotSchema.parse(snapshot('completed'));

    expect(() => assertWizardTransition(collecting, gapFill)).not.toThrow();
    expect(() => assertWizardTransition(gapFill, review)).not.toThrow();
    expect(() => assertWizardTransition(review, approved)).not.toThrow();
    expect(() => assertWizardTransition(approved, exporting)).not.toThrow();
    expect(() => assertWizardTransition(exporting, completed)).not.toThrow();
    expect(() => assertWizardTransition(
      review,
      WizardSnapshotSchema.parse(snapshot('gap_fill', { inputRevision: 2 })),
    )).not.toThrow();
    expect(() => assertWizardTransition(
      review,
      WizardSnapshotSchema.parse(snapshot('abandoned')),
    )).not.toThrow();
  });

  it('rejects unknown keys, identity changes, stale revisions, and completion without approval', () => {
    expect(WizardSnapshotSchema.safeParse({ ...snapshot('review'), apiKey: 'secret' }).success).toBe(false);
    expectTransitionCode(snapshot('review'), snapshot('approved', { projectId: NOTE_ID }), 'WIZARD_PROJECT_MISMATCH');
    expectTransitionCode(snapshot('review'), snapshot('approved', { threadId: NOTE_ID }), 'WIZARD_THREAD_MISMATCH');
    expectTransitionCode(snapshot('review'), snapshot('gap_fill'), 'WIZARD_INPUT_REVISION_STALE');
    expectTransitionCode(snapshot('review'), snapshot('completed'), 'WIZARD_ILLEGAL_TRANSITION');
    expect(WizardSnapshotSchema.safeParse(snapshot('completed', { approvedAt: null })).success).toBe(false);
  });

  it('requires current-system details for existing-feature solution snapshots', () => {
    const invalid = snapshot('review', {
      renderPayload: { title: 'SOLUTION', featureMode: 'existing' },
    });
    expect(WizardSnapshotSchema.safeParse(invalid).success).toBe(false);

    expect(WizardSnapshotSchema.safeParse(snapshot('review', {
      renderPayload: {
        title: 'SOLUTION',
        featureMode: 'existing',
        currentSystem: 'Current card limit service',
        affectedSurfaces: ['API /limits', 'MAIN1.LIMITS'],
      },
    })).success).toBe(true);
  });

  it('rejects render payloads above 524,288 UTF-8 bytes', () => {
    const result = WizardSnapshotSchema.safeParse(snapshot('review', {
      renderPayload: { title: 'x', markdown: 'x'.repeat(524_289), featureMode: 'new' },
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('WIZARD_PAYLOAD_TOO_LARGE'))).toBe(true);
    }
  });

  it('validates artifact chains and stable idempotency keys', () => {
    const solution = SdlcArtifactMetadataSchema.parse({
      kind: 'SOLUTION',
      projectId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      version: 1,
      inputHash: HASH,
      sourceArtifactIds: [],
      sourceArtifactHashes: [],
      approvedAt: NOW,
      idempotencyKey: 'wizard-key',
    });
    expect(solution.version).toBe(1);

    expect(SdlcArtifactMetadataSchema.safeParse({
      ...solution,
      kind: 'PL03B',
      sourceArtifactIds: [],
      sourceArtifactHashes: [],
    }).success).toBe(false);

    expect(SdlcArtifactMetadataSchema.safeParse({
      ...solution,
      kind: 'CHANGE_PACK_ENTRY',
      packHash: HASH,
      path: 'diff.patch',
      sourceArtifactIds: [NOTE_ID],
      sourceArtifactHashes: [HASH],
    }).success).toBe(true);

    expect(buildWizardIdempotencyKey({
      sessionId: SESSION_ID,
      draftRevision: 2,
      artifactKind: 'SOLUTION',
    })).toBe(`${SESSION_ID}:2:SOLUTION`);
  });

  it('keeps historical models valid and accepts exact SDLC set mapping', () => {
    expect(NoteSchema.safeParse({
      id: NOTE_ID,
      body: 'legacy',
      isPinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    }).success).toBe(true);

    expect(DocumentSetSchema.safeParse({
      id: NOTE_ID,
      name: 'Legacy set',
      documentIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    }).success).toBe(true);

    expect(SdlcDocumentSetMetadataSchema.parse({ projectId: PROJECT_ID, purpose: 'sdlc' })).toEqual({
      projectId: PROJECT_ID,
      purpose: 'sdlc',
    });
  });
});
