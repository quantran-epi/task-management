import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { buildWizardDocx } from '../../src/services/export/wizardDocx';
import {
  runWizardStage,
  type WizardEvidence,
  type WizardModel,
  type WizardModelRequest,
} from '../../src/services/ai/wizardService';
import { generateHubCab, generateHubCabDraft, toCabDocxPayload, type CabPayloadContext, type CabSourcePin } from '../../src/services/wizard/hubCab';
import { defaultSha256 } from '../../src/services/wizard/workflowCoordinator';
import {
  SdlcWorkflowStateSchema,
  type SdlcWorkflowMetadata,
  type SdlcWorkflowState,
} from '../../src/services/wizard/workflowSchemas';
import type { Note, Project } from '../../src/types/models';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const SET_ID = '44444444-4444-4444-8444-444444444444';
const PL03B_NOTE_ID = '55555555-5555-4555-8555-555555555555';
const PL07_NOTE_ID = '66666666-6666-4666-8666-666666666666';
const PL02_NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = '2026-11-01T12:00:00.000Z';
const PL02_MARKDOWN = '# PL02\nĐặc tả chức năng chuyển tiền nhanh.';
const PL03B_HASH = '07'.repeat(32);
const PL07_HASH = '08'.repeat(32);

const project: Project = { id: PROJECT_ID, name: 'CAB project', status: 'Open', createdAt: NOW, updatedAt: NOW };

const metadata: SdlcWorkflowMetadata = {
  cr: 'CR-25006',
  featureName: 'Chuyển tiền nhanh',
  author: 'Dev Lead',
  requestingUnit: 'Digital Banking',
  date: '2026-11-01',
};

const cabProposal = {
  schemaVersion: 1,
  kind: 'CAB',
  title: 'Tờ trình CAB — Chuyển tiền nhanh',
  sections: [
    { heading: 'Bối cảnh', body: 'Bổ sung luồng chuyển tiền nhanh 24/7.' },
    { heading: 'Kỹ thuật', body: 'Thêm API /transfer và bảng TRANSFER.' },
  ],
  risks: ['Rủi ro timeout ngân hàng đích.'],
  missingTests: ['Chưa có kết quả UAT.'],
  unresolvedDrift: [],
  rollback: { summary: 'Tắt cờ tính năng.', verified: false },
  caveats: ['Coverage mã nguồn còn PARTIAL.'],
  citationIds: [],
};

const evidence: WizardEvidence = {
  items: [{
    id: 'ev-1',
    source: 'local',
    documentId: '77777777-7777-4777-8777-777777777777',
    contentHash: '05'.repeat(32),
    lineStart: 1,
    lineEnd: 2,
    startOffset: 0,
    endOffset: 20,
    excerpt: 'transfer flow',
  }],
  coverage: 'PARTIAL',
  degraded: ['REMOTE_DISABLED', 'MCP_UNAVAILABLE'],
};

let db: TaskPlannerDatabase;

beforeEach(async () => {
  db = new TaskPlannerDatabase(`hub-cab-${Date.now()}-${Math.random()}`);
  await db.open();
  await db.changeRequests.add(project);
  await db.chatThreads.add({
    id: THREAD_ID,
    scopeKey: `cr:${PROJECT_ID}`,
    scopeType: 'cr',
    entityId: PROJECT_ID,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterEach(async () => {
  await db.delete();
});

async function seedArtifactNote(input: {
  id: string;
  kind: 'PL02' | 'PL03B' | 'PL07';
  version: number;
  hash: string;
  sourceIds: string[];
}): Promise<void> {
  const note: Note = {
    id: input.id,
    type: 'document',
    tags: ['sdlc', input.kind.toLowerCase()],
    entityType: 'cr',
    entityId: PROJECT_ID,
    title: `${input.kind} v${input.version}`,
    body: JSON.stringify({ markdown: `# ${input.kind} v${input.version}`, exportPayload: {} }),
    isPinned: false,
    sdlcArtifact: {
      kind: input.kind,
      changeRequestId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      version: input.version,
      inputHash: input.hash,
      sourceArtifactIds: input.sourceIds,
      sourceArtifactHashes: input.sourceIds.map(() => '09'.repeat(32)),
      approvedAt: NOW,
      idempotencyKey: `${SESSION_ID}:${input.kind}:${input.hash}`,
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
  await db.notes.add(note);
}

/** The typed-text path: `artifacts.pl02` has content + hash but **no** `noteId`. */
async function seedState(overrides: { pl02Content?: string | undefined; pl02Hash?: string | undefined; pl02NoteId?: string | undefined; withPl02?: boolean | undefined; withPl07?: boolean | undefined; withDrift?: boolean | undefined; cabVersion?: number | undefined } = {}): Promise<SdlcWorkflowState> {
  const content = overrides.pl02Content ?? PL02_MARKDOWN;
  const includePl02 = overrides.withPl02 ?? true;
  return SdlcWorkflowStateSchema.parse({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    currentStep: 'CAB',
    metadata,
    artifacts: {
      ...(includePl02 ? {
        pl02: {
          ...(overrides.pl02NoteId ? { noteId: overrides.pl02NoteId } : {}),
          kind: 'PL02',
          version: 1,
          hash: overrides.pl02Hash ?? await defaultSha256(content.trim()),
          title: 'PL02 — Đặc tả chức năng',
          content,
          sourceHashes: [],
          updatedAt: NOW,
        },
      } : {}),
      pl03b: {
        noteId: PL03B_NOTE_ID,
        kind: 'PL03B',
        version: 1,
        hash: PL03B_HASH,
        title: 'PL03B v1',
        sourceHashes: [],
        updatedAt: NOW,
      },
      ...(overrides.withPl07 === false ? {} : {
        pl07: {
          noteId: PL07_NOTE_ID,
          kind: 'PL07',
          version: 1,
          hash: PL07_HASH,
          title: 'PL07 v1',
          sourceHashes: [],
          updatedAt: NOW,
        },
      }),
      ...(overrides.cabVersion ? {
        cab: { kind: 'CAB', version: overrides.cabVersion, hash: '0a'.repeat(32), title: 'CAB', sourceHashes: [], updatedAt: NOW },
      } : {}),
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedChain(): Promise<SdlcWorkflowState> {
  await seedArtifactNote({ id: PL03B_NOTE_ID, kind: 'PL03B', version: 1, hash: PL03B_HASH, sourceIds: ['88888888-8888-4888-8888-888888888888'] });
  await seedArtifactNote({ id: PL07_NOTE_ID, kind: 'PL07', version: 1, hash: PL07_HASH, sourceIds: ['88888888-8888-4888-8888-888888888888'] });
  return seedState();
}

/** Draft path needs an existing approved PL02 Note: it must never mint one. */
async function seedDraftChain(): Promise<SdlcWorkflowState> {
  const pl02Hash = await defaultSha256(PL02_MARKDOWN.trim());
  await seedArtifactNote({ id: PL02_NOTE_ID, kind: 'PL02', version: 1, hash: pl02Hash, sourceIds: [] });
  await seedArtifactNote({ id: PL03B_NOTE_ID, kind: 'PL03B', version: 1, hash: PL03B_HASH, sourceIds: [] });
  await seedArtifactNote({ id: PL07_NOTE_ID, kind: 'PL07', version: 1, hash: PL07_HASH, sourceIds: [] });
  return seedState({ pl02NoteId: PL02_NOTE_ID, pl02Hash });
}

function baseInput(state: SdlcWorkflowState, overrides: Record<string, unknown> = {}) {
  return {
    db,
    changeRequestId: PROJECT_ID,
    threadId: THREAD_ID,
    sessionId: SESSION_ID,
    draftRevision: 1,
    metadata,
    state,
    model: { endpoint: 'http://localhost:20128', model: 'test' } as WizardModel,
    collectEvidence: vi.fn(async () => evidence),
    resolveSetIds: vi.fn(async () => [SET_ID]),
    runStage: vi.fn(async () => cabProposal),
    ...overrides,
  };
}

const pinsForContext: CabSourcePin[] = [
  { artifactId: '99999999-9999-4999-8999-999999999991', kind: 'PL02', changeRequestId: PROJECT_ID, threadId: THREAD_ID, version: 1, hash: '02'.repeat(32), approved: true },
  { artifactId: '99999999-9999-4999-8999-999999999992', kind: 'PL03B', changeRequestId: PROJECT_ID, threadId: THREAD_ID, version: 1, hash: PL03B_HASH, approved: true },
  { artifactId: '99999999-9999-4999-8999-999999999993', kind: 'PL07', changeRequestId: PROJECT_ID, threadId: THREAD_ID, version: 1, hash: PL07_HASH, approved: true },
];

const payloadContext: CabPayloadContext = {
  metadata,
  changeRequestId: PROJECT_ID,
  threadId: THREAD_ID,
  inputRevision: 1,
  draftRevision: 1,
  sources: pinsForContext,
};

describe('toCabDocxPayload', () => {
  it('maps a schema-valid proposal into a payload the real DOCX dispatcher accepts', async () => {
    const payload = toCabDocxPayload(cabProposal, payloadContext);

    await expect(buildWizardDocx('CAB', payload)).resolves.toBeInstanceOf(Blob);
    expect(payload.sourceArtifactIds).toEqual({
      PL02: pinsForContext[0]!.artifactId,
      PL03B: pinsForContext[1]!.artifactId,
      PL07: pinsForContext[2]!.artifactId,
    });
    expect(payload.sources).toEqual(pinsForContext);
    expect(payload.caveats).toEqual(['Chưa có kết quả UAT.', 'Coverage mã nguồn còn PARTIAL.']);
  });

  it('truncates an over-long section body to the builder bound instead of dropping it', async () => {
    const longBody = 'x'.repeat(700);
    const payload = toCabDocxPayload({
      ...cabProposal,
      sections: cabProposal.sections.map((section, index) => index === 1 ? { ...section, body: longBody } : section),
    }, payloadContext);

    expect(payload.technicalChanges).toHaveLength(1);
    expect(payload.technicalChanges[0]).toHaveLength(600);
    await expect(buildWizardDocx('CAB', payload)).resolves.toBeInstanceOf(Blob);
  });

  it('throws rather than inventing a payload from an invalid proposal', () => {
    expect(() => toCabDocxPayload({ kind: 'CAB' }, payloadContext)).toThrow('CAB_PROPOSAL_INVALID');
  });
});

describe('generateHubCab', () => {
  it('resolves PL02 itself, calls the stage once, and persists three pinned sources', async () => {
    const state = await seedChain();
    expect(state.artifacts.pl02?.noteId).toBeUndefined();
    const input = baseInput(state);

    const result = await generateHubCab(input);

    expect(input.runStage).toHaveBeenCalledTimes(1);
    expect(input.resolveSetIds).toHaveBeenCalledWith(PROJECT_ID);
    expect(input.collectEvidence).toHaveBeenCalledWith(expect.objectContaining({ resolvedSetIds: [SET_ID] }));
    expect(result.pl02.noteId).toBeTruthy();
    expect(result.noteId).toBeTruthy();

    const pl02Note = await db.notes.get(result.pl02.noteId);
    expect(pl02Note?.sdlcArtifact?.inputHash).toBe(await defaultSha256(PL02_MARKDOWN.trim()));
    expect(pl02Note?.sdlcArtifact?.inputHash).toBe(state.artifacts.pl02?.hash);

    const cabNote = await db.notes.get(result.noteId);
    expect(cabNote?.sdlcArtifact?.sourceArtifactIds).toEqual([result.pl02.noteId, PL03B_NOTE_ID, PL07_NOTE_ID]);
    await expect(buildWizardDocx('CAB', result.payload)).resolves.toBeInstanceOf(Blob);
    const stored = JSON.parse(cabNote!.body) as { exportPayload: unknown };
    await expect(buildWizardDocx('CAB', stored.exportPayload)).resolves.toBeInstanceOf(Blob);
  });

  it('rejects with CAB_SOURCE_CHAIN_REQUIRED and writes nothing when PL07 is missing', async () => {
    const state = await seedState({ withPl07: false });
    const before = await db.notes.count();

    await expect(generateHubCab(baseInput(state))).rejects.toThrow('CAB_SOURCE_CHAIN_REQUIRED');
    expect(await db.notes.count()).toBe(before);
  });

  it('rejects with CAB_SOURCE_CHAIN_REQUIRED when PL02 is absent entirely', async () => {
    const state = await seedState({ withPl02: false });
    await expect(generateHubCab(baseInput(state))).rejects.toThrow('CAB_SOURCE_CHAIN_REQUIRED');
  });

  it('persists the changed CAB at version 2 rather than throwing', async () => {
    const state = await seedChain();
    const first = await generateHubCab(baseInput(state));
    const second = await generateHubCab(baseInput(state, {
      runStage: vi.fn(async () => ({ ...cabProposal, title: 'Tờ trình CAB v2 — Chuyển tiền nhanh' })),
    }));

    expect(second.noteId).not.toBe(first.noteId);
    const cabVersions = (await db.notes.where('entityId').equals(PROJECT_ID).toArray())
      .filter((note) => note.sdlcArtifact?.kind === 'CAB')
      .map((note) => note.sdlcArtifact!.version)
      .sort();
    expect(cabVersions).toEqual([1, 2]);
  });

  it('is accepted by the real runWizardStage (no runStage override)', async () => {
    const state = await seedChain();
    const complete = vi.fn(async (_request: WizardModelRequest) => cabProposal);
    const probe = vi.fn(async () => ({ ok: true as const, strictJsonSchema: false }));

    const result = await generateHubCab(baseInput(state, {
      runStage: undefined,
      model: { endpoint: 'http://localhost:20128', model: 'test', complete, probe },
    }));

    expect(complete).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.payload.title).toBe(cabProposal.title);
    await expect(buildWizardDocx('CAB', result.payload)).resolves.toBeInstanceOf(Blob);

    // Negative half: a pin stripped of projectId/threadId is rejected by the real stage contract.
    const { changeRequestId: _projectId, threadId: _threadId, ...identitylessPin } = pinsForContext[0]!;
    await expect(runWizardStage({
      kind: 'CAB',
      changeRequestId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      model: { endpoint: '', model: '', complete, probe },
      isCurrent: () => true,
      payload: {
        evidence,
        sources: [identitylessPin, pinsForContext[1]!, pinsForContext[2]!],
        expectedVersions: { PL02: 1, PL03B: 1, PL07: 1 },
        expectedHashes: { PL02: '02'.repeat(32), PL03B: PL03B_HASH, PL07: PL07_HASH },
      },
    })).rejects.toMatchObject({ code: 'INVALID_OUTPUT', message: 'ARTIFACT_IDENTITY_MISMATCH' });
  });
});

describe('generateHubCabDraft', () => {
  it('resolves a draft with zero Note writes and no approval side effects (T-25.3-18)', async () => {
    const state = await seedDraftChain();
    const before = await db.notes.count();
    const input = baseInput(state);

    const draft = await generateHubCabDraft(input);

    expect(await db.notes.count()).toBe(before);
    expect(draft.markdown).toContain('Tờ trình CAB');
    expect(draft.pl02).toEqual({ noteId: PL02_NOTE_ID, version: 1, hash: state.artifacts.pl02!.hash });
    expect(draft.sources.map((pin) => pin.artifactId)).toEqual([PL02_NOTE_ID, PL03B_NOTE_ID, PL07_NOTE_ID]);
    // Nothing in the return value claims an approval timestamp.
    expect(JSON.stringify(draft.payload)).not.toMatch(/approvedAt/);
  });

  it('refuses to mint a PL02 pin and throws CAB_SOURCE_CHAIN_REQUIRED instead', async () => {
    const state = await seedState(); // typed-text path: PL02 content + hash, no noteId
    const before = await db.notes.count();

    await expect(generateHubCabDraft(baseInput(state))).rejects.toThrow('CAB_SOURCE_CHAIN_REQUIRED');
    expect(await db.notes.count()).toBe(before);
  });

  it('never fabricates rollback verification, risk-control claims, or source pins', async () => {
    const state = await seedDraftChain();

    // Proposal claims verified:true, but no reconciliation evidence backs it.
    const draft = await generateHubCabDraft(baseInput(state));

    expect(draft.markdown).not.toMatch(/đã được kiểm soát/);
    expect(draft.markdown).not.toMatch(/Verified:/);
    expect(draft.markdown).not.toMatch(/pl02-note-id|pl03b-note-id|pl07-note-id/);
    expect(draft.markdown).toContain('chưa kiểm chứng');
  });

  it('renders the verified rollback claim as unproven when no evidence ids exist', async () => {
    const state = await seedDraftChain();

    const draft = await generateHubCabDraft(baseInput(state, {
      runStage: vi.fn(async () => ({ ...cabProposal, rollback: { summary: 'Tắt cờ tính năng.', verified: true } })),
    }));

    expect(draft.markdown).toContain('chưa có bằng chứng kiểm chứng');
    expect(draft.markdown).not.toMatch(/đã kiểm chứng(?!\s)/);
  });

  it('discloses a missing reconciliation result as an explicit gap (T-25.3-16)', async () => {
    const state = await seedDraftChain();
    expect(state.artifacts.driftResult).toBeUndefined();

    const draft = await generateHubCabDraft(baseInput(state));

    expect(draft.markdown).toContain('Khoảng trống bằng chứng');
    expect(draft.markdown).toContain('Chưa có kết quả đối chiếu Change Pack.');
  });

  it('shares its generation body with generateHubCab, which still persists', async () => {
    const state = await seedDraftChain();
    const draft = await generateHubCabDraft(baseInput(state));
    const persisted = await generateHubCab(baseInput(state));

    expect(persisted.markdown).toBe(draft.markdown);
    expect(await db.notes.get(persisted.noteId)).toBeTruthy();
  });
});
