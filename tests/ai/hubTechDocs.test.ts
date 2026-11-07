import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { buildWizardDocx } from '../../src/services/export/wizardDocx';
import { runWizardStage, type WizardEvidence, type WizardModel, type WizardModelRequest } from '../../src/services/ai/wizardService';
import {
  generateHubTechDocs,
  generateHubTechDocDraft,
  toPl03bDocxPayload,
  toPl07DocxPayload,
  type HubTechDocsPayloadContext,
} from '../../src/services/wizard/hubTechDocs';
import { saveHubSolution } from '../../src/services/wizard/hubSolution';
import type { ReconciliationResult } from '../../src/services/wizard/reconciliation';
import type { SdlcWorkflowMetadata } from '../../src/services/wizard/workflowSchemas';
import type { Project } from '../../src/types/models';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-01T12:00:00.000Z';
const SET_ID = '44444444-4444-4444-8444-444444444444';

const project: Project = { id: PROJECT_ID, name: 'Tech docs project', status: 'Open', createdAt: NOW, updatedAt: NOW };

const metadata: SdlcWorkflowMetadata = {
  cr: 'CR-25001',
  featureName: 'Chuyển tiền nhanh',
  author: 'Dev Lead',
  requestingUnit: 'Digital Banking',
  date: '2026-11-01',
};

const reconciliation: ReconciliationResult = {
  schemaVersion: 1,
  identity: {
    changeRequestId: PROJECT_ID,
    threadId: THREAD_ID,
    solutionNoteId: '55555555-5555-4555-8555-555555555555',
    solutionVersion: 1,
    solutionHash: '03'.repeat(32),
    packHash: '04'.repeat(32),
    cr: metadata.cr,
    base: 'base-1',
    head: 'head-2',
  },
  status: 'PARTIAL_COVERAGE',
  approvedDesign: { currentSystem: 'Core banking', affectedScreens: [], affectedApis: [], affectedTables: [] },
  actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
  drift: [],
  dbChangesRollback: {
    affectedTables: ['TRANSFER'],
    changes: [],
    rollback: { status: 'unknown', evidenceIds: [] },
  },
  regressionMatrix: [],
  coverage: [{ path: 'src/transfer.ts', state: 'included', evidenceIds: [] }],
};

const pl03Proposal = {
  schemaVersion: 1,
  kind: 'PL03',
  title: 'Thiết kế chuyển tiền',
  approvedDesign: ['Thiết kế đã duyệt: chuyển tiền nhanh 24/7.'],
  actualImplementation: ['Đã triển khai API /transfer.'],
  drift: [],
  databaseAndRollback: [],
  regressionMatrix: [{ area: 'Transfer', scenario: 'Chuyển 10k', expected: 'Thành công', citationIds: [] }],
  flowSteps: [],
  coverage: 'PARTIAL',
  caveats: [],
  citationIds: [],
};

const pl07Proposal = {
  schemaVersion: 1,
  kind: 'PL07',
  marks: [
    { itemId: 'I.1', status: 'PASS', note: 'Kiểm tra server-side', evidenceIds: ['ev-1'] },
    { itemId: 'II.5', status: 'UNKNOWN', note: '', evidenceIds: [] },
  ],
  sectionVI: [{ title: 'Review code', findings: ['Bổ sung validate'], evidenceIds: ['ev-2'] }],
  unknowns: [],
  citationIds: [],
};

const evidence: WizardEvidence = {
  items: [{
    id: 'ev-1',
    source: 'local',
    documentId: '66666666-6666-4666-8666-666666666666',
    contentHash: '05'.repeat(32),
    lineStart: 1,
    lineEnd: 2,
    startOffset: 0,
    endOffset: 20,
    excerpt: 'server-side validation',
  }],
  coverage: 'PARTIAL',
  degraded: ['REMOTE_DISABLED', 'MCP_UNAVAILABLE'],
};

const payloadContext: HubTechDocsPayloadContext = {
  metadata,
  inputRevision: 1,
  draftRevision: 2,
  reconciliation,
};

let db: TaskPlannerDatabase;

beforeEach(async () => {
  db = new TaskPlannerDatabase(`hub-tech-docs-${Date.now()}-${Math.random()}`);
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

async function seedSolution(markdown = '# SOLUTION\nHệ thống hiện tại.') {
  return saveHubSolution({ db, changeRequestId: PROJECT_ID, threadId: THREAD_ID, sessionId: SESSION_ID, markdown, draftRevision: 1 });
}

function baseInput(solution: Awaited<ReturnType<typeof seedSolution>>, overrides: Record<string, unknown> = {}) {
  return {
    db,
    changeRequestId: PROJECT_ID,
    threadId: THREAD_ID,
    sessionId: SESSION_ID,
    inputRevision: 1,
    draftRevision: 1,
    metadata,
    solution: { noteId: solution.noteId, version: solution.version, hash: solution.hash },
    reconciliation,
    model: { endpoint: 'http://localhost:20128', model: 'test' } as WizardModel,
    collectEvidence: vi.fn(async () => evidence),
    resolveSetIds: vi.fn(async () => [SET_ID]),
    ...overrides,
  };
}

function stubStage(proposals: { pl03?: unknown; pl07?: unknown } = {}) {
  return vi.fn(async (input: { kind: string }) => (input.kind === 'PL03' ? (proposals.pl03 ?? pl03Proposal) : (proposals.pl07 ?? pl07Proposal)));
}

describe('toPl03bDocxPayload', () => {
  it('maps a PL03 proposal into a payload the real DOCX dispatcher accepts', async () => {
    const payload = toPl03bDocxPayload(pl03Proposal, payloadContext);

    await expect(buildWizardDocx('PL03B', payload)).resolves.toBeInstanceOf(Blob);
    expect(payload.introduction.databases).toEqual(['TRANSFER']);
    expect(payload.reconciliationEvidence.coverage).toEqual(reconciliation.coverage);
    expect(payload.reconciliationEvidence.dbChangesRollback).toEqual(reconciliation.dbChangesRollback);
    expect(payload.reconciliationEvidence.actualImplementation).toEqual(reconciliation.actualImplementation);
    expect(payload.metadata.version).toBe('2');
  });

  it('describes only the implemented system: no approved design and no drift in the payload', () => {
    const payload = toPl03bDocxPayload(pl03Proposal, payloadContext);

    expect(payload).not.toHaveProperty('reconciliation');
    expect(payload.technical.overview).toBe('Đã triển khai API /transfer.');
    expect(payload.technical.overview).not.toContain('Thiết kế đã duyệt');
    expect(payload.introduction.purpose).toBe('Đã triển khai API /transfer.');
  });

  it('throws rather than inventing a payload from an invalid proposal', () => {
    expect(() => toPl03bDocxPayload({ kind: 'PL03' }, payloadContext)).toThrow('PL03B_PROPOSAL_INVALID');
  });
});

describe('toPl07DocxPayload', () => {
  it('maps sections I-V and section VI findings into a payload the dispatcher accepts', async () => {
    const payload = toPl07DocxPayload(pl07Proposal, payloadContext);

    await expect(buildWizardDocx('PL07', payload)).resolves.toBeInstanceOf(Blob);
    expect(payload.marks).toEqual([
      { sectionId: 'I', itemNumber: '1', status: 'unknown', evidenceIds: ['ev-1'], note: 'Kiểm tra server-side' },
      { sectionId: 'II', itemNumber: '5', status: 'unknown', evidenceIds: [], note: '' },
    ]);
    expect(payload.findings).toEqual([
      { number: '1', text: 'Bổ sung validate', evidenceIds: ['ev-2'], file: '(chưa cung cấp)', hunk: '(chưa cung cấp)' },
    ]);
  });

  it('never assigns a verdict, even when every mark claims PASS with citations (D-14)', () => {
    const payload = toPl07DocxPayload({
      ...pl07Proposal,
      marks: [
        { itemId: 'I.1', status: 'PASS', note: '', evidenceIds: ['ev-1'] },
        { itemId: 'II.5', status: 'FAIL', note: '', evidenceIds: ['ev-1'] },
        { itemId: 'III.2', status: 'NOT_APPLICABLE', note: '', evidenceIds: [] },
      ],
    }, payloadContext);

    expect(payload.marks.map((mark) => mark.status)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(payload.marks.filter((mark) => mark.status !== 'unknown')).toHaveLength(0);
  });

  it('returns unknown marks for a proposal whose marks are all UNKNOWN with empty evidenceIds', () => {
    const payload = toPl07DocxPayload({
      ...pl07Proposal,
      marks: [
        { itemId: 'I.2', status: 'UNKNOWN', note: '', evidenceIds: [] },
        { itemId: 'IV.1', status: 'UNKNOWN', note: '', evidenceIds: [] },
      ],
    }, payloadContext);

    expect(payload.marks.map((mark) => mark.status)).toEqual(['unknown', 'unknown']);
  });

  it('downgrades an evidence-less PASS to unknown instead of rendering it as a pass', () => {
    const payload = toPl07DocxPayload({
      ...pl07Proposal,
      marks: [{ itemId: 'III.2', status: 'PASS', note: 'không có bằng chứng', evidenceIds: [] }],
    }, payloadContext);

    expect(payload.marks[0]?.status).toBe('unknown');
  });

  it('drops an evidence-less section-VI finding and still builds', async () => {
    const payload = toPl07DocxPayload({
      ...pl07Proposal,
      sectionVI: [
        { title: 'Review code', findings: ['Không có bằng chứng'], evidenceIds: [] },
        { title: 'Review code', findings: ['Có bằng chứng'], evidenceIds: ['ev-2'] },
      ],
    }, payloadContext);

    expect(payload.findings).toHaveLength(1);
    expect(payload.findings[0]?.text).toBe('Có bằng chứng');
    expect(payload.findings[0]?.number).toBe('1');
    await expect(buildWizardDocx('PL07', payload)).resolves.toBeInstanceOf(Blob);
  });

  it('drops a VI.1 mark (outside the builder enum) and still builds', async () => {
    const payload = toPl07DocxPayload({
      ...pl07Proposal,
      marks: [
        { itemId: 'VI.1', status: 'FAIL', note: 'không thuộc checklist', evidenceIds: ['ev-1'] },
        { itemId: 'VII.1', status: 'FAIL', note: 'không thuộc checklist', evidenceIds: ['ev-1'] },
        { itemId: 'IIII.1', status: 'FAIL', note: 'không thuộc checklist', evidenceIds: ['ev-1'] },
        { itemId: 'IV.3', status: 'PASS', note: 'hợp lệ', evidenceIds: ['ev-1'] },
      ],
    }, payloadContext);

    expect(payload.marks.map((mark) => `${mark.sectionId}.${mark.itemNumber}`)).toEqual(['IV.3']);
    await expect(buildWizardDocx('PL07', payload)).resolves.toBeInstanceOf(Blob);
  });
});

describe('generateHubTechDocDraft', () => {
  it('returns both documents as drafts and writes no Note (D-17)', async () => {
    const solution = await seedSolution();
    const before = await db.notes.count();

    const draft = await generateHubTechDocDraft(baseInput(solution, { runStage: stubStage() }));

    expect(await db.notes.count()).toBe(before);
    await expect(buildWizardDocx('PL03B', draft.pl03b.payload)).resolves.toBeInstanceOf(Blob);
    await expect(buildWizardDocx('PL07', draft.pl07.payload)).resolves.toBeInstanceOf(Blob);
  });

  it('emits PL03B markdown with no drift, no approved design, and no SOLUTION comparison', async () => {
    const solution = await seedSolution();
    const draft = await generateHubTechDocDraft(baseInput(solution, { runStage: stubStage() }));

    expect(draft.pl03b.markdown).not.toMatch(/Drift/i);
    expect(draft.pl03b.markdown).not.toMatch(/approvedDesign/i);
    expect(draft.pl03b.markdown).not.toMatch(/THIẾT KẾ NHƯ ĐÃ DUYỆT/);
    expect(draft.pl03b.markdown).not.toMatch(/THIẾT KẾ/);
    expect(draft.pl03b.markdown).toContain('Đã triển khai API /transfer.');
  });

  it('emits PL07 markdown as baseline questions with no verdict word', async () => {
    const solution = await seedSolution();
    const draft = await generateHubTechDocDraft(baseInput(solution, { runStage: stubStage() }));

    expect(draft.pl07.markdown).toContain('I.1.');
    expect(draft.pl07.markdown).not.toMatch(/\bpass\b/i);
    expect(draft.pl07.markdown).not.toMatch(/\bunknown\b/i);
    expect(draft.pl07.markdown).not.toMatch(/\bnot_applicable\b/);
  });
});

describe('generateHubTechDocs', () => {
  it('collects evidence against the resolved set ids and persists both documents', async () => {
    const solution = await seedSolution();
    const input = baseInput(solution, { runStage: stubStage() });
    const collectEvidence = input.collectEvidence;

    const result = await generateHubTechDocs(input);

    expect(input.resolveSetIds).toHaveBeenCalledWith(PROJECT_ID);
    expect(collectEvidence).toHaveBeenCalledWith(expect.objectContaining({ resolvedSetIds: [SET_ID] }));
    expect(result.pl03b.noteId).toBeTruthy();
    expect(result.pl07.noteId).toBeTruthy();
    const notes = await db.notes.where('entityId').equals(PROJECT_ID).toArray();
    const kinds = notes.map((note) => note.sdlcArtifact?.kind).filter(Boolean).sort();
    expect(kinds).toEqual(['PL03B', 'PL07', 'SOLUTION']);
  });

  it('runs the stages sequentially and stores payloads the DOCX dispatcher accepts', async () => {
    const solution = await seedSolution();
    const result = await generateHubTechDocs(baseInput(solution, { runStage: stubStage() }));

    await expect(buildWizardDocx('PL03B', result.pl03b.payload)).resolves.toBeInstanceOf(Blob);
    await expect(buildWizardDocx('PL07', result.pl07.payload)).resolves.toBeInstanceOf(Blob);

    const pl07Note = await db.notes.get(result.pl07.noteId);
    const stored = JSON.parse(pl07Note!.body) as { exportPayload: unknown };
    await expect(buildWizardDocx('PL07', stored.exportPayload)).resolves.toBeInstanceOf(Blob);
  });

  it('rejects and writes no Note when the PL07 stage throws', async () => {
    const solution = await seedSolution();
    const before = await db.notes.count();
    const runStage = vi.fn(async (input: { kind: string }) => {
      if (input.kind === 'PL07') throw new Error('STAGE_FAILED');
      return pl03Proposal;
    });

    await expect(generateHubTechDocs(baseInput(solution, { runStage }))).rejects.toThrow('STAGE_FAILED');
    expect(await db.notes.count()).toBe(before);
  });

  it('regenerates changed inputs at version 2 instead of conflicting', async () => {
    const solution = await seedSolution();
    const first = await generateHubTechDocs(baseInput(solution, { runStage: stubStage() }));
    const second = await generateHubTechDocs(baseInput(solution, {
      runStage: stubStage({
        pl03: { ...pl03Proposal, actualImplementation: ['Đã triển khai API /transfer bản cập nhật.'] },
        pl07: { ...pl07Proposal, sectionVI: [{ title: 'Review code', findings: ['Bổ sung validate bản cập nhật'], evidenceIds: ['ev-2'] }] },
      }),
    }));

    expect(second.pl03b.noteId).not.toBe(first.pl03b.noteId);
    const notes = await db.notes.where('entityId').equals(PROJECT_ID).toArray();
    const versions = notes
      .filter((note) => note.sdlcArtifact?.kind === 'PL03B')
      .map((note) => note.sdlcArtifact!.version)
      .sort();
    expect(versions).toEqual([1, 2]);
  });

  it('is accepted by the real runWizardStage (no runStage override) and rejects a wrong-shape pin', async () => {
    const solution = await seedSolution();
    const complete = vi.fn(async (request: WizardModelRequest) =>
      request.messages[1]?.content.includes('"kind":"PL07"') ? pl07Proposal : pl03Proposal);
    const probe = vi.fn(async () => ({ ok: true as const, strictJsonSchema: false }));

    const result = await generateHubTechDocs(baseInput(solution, {
      model: { endpoint: 'http://localhost:20128', model: 'test', complete, probe },
    }));

    expect(complete).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenCalledTimes(2);
    await expect(buildWizardDocx('PL03B', result.pl03b.payload)).resolves.toBeInstanceOf(Blob);

    // Negative half: the pre-plan pin shape `{ noteId, version, hash }` carries no identity.
    await expect(runWizardStage({
      kind: 'PL03',
      changeRequestId: PROJECT_ID,
      threadId: THREAD_ID,
      sessionId: SESSION_ID,
      inputRevision: 1,
      model: { endpoint: '', model: '', complete, probe },
      isCurrent: () => true,
      payload: {
        evidence,
        pinnedSolution: { noteId: solution.noteId, version: solution.version, hash: solution.hash },
      },
    })).rejects.toMatchObject({ code: 'INVALID_OUTPUT', message: 'ARTIFACT_IDENTITY_MISMATCH' });
  });
});
