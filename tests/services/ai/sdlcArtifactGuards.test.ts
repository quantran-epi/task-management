import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { dispatchAiToolCall } from '../../../src/services/ai/aiOrchestratorLoop';
import { defaultSha256, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import type { SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';
import type { ArtifactToolContext } from '../../../src/services/ai/sdlcArtifactTools';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CR = 'cr-active';
const AT = '2026-11-05T00:00:00.000Z';
const DOC = ['# SOLUTION', '', '## Mục tiêu', '', 'Nội dung gốc.', '', '## Kiến trúc', '', 'Nội dung kiến trúc.'].join('\n');

type Refs = Partial<Record<'pl01' | 'pl02' | 'solution' | 'changePack' | 'pl03b' | 'pl07' | 'cab', string>>;

async function seed(db: TaskPlannerDatabase, refs: Refs, options: { crId?: string } = {}) {
  const crId = options.crId ?? CR;
  const artifacts: Record<string, unknown> = {};
  for (const [key, content] of Object.entries(refs)) {
    if (content === undefined) continue;
    artifacts[key] = {
      kind: key === 'changePack' ? 'CHANGE_PACK' : key === 'solution' ? 'SOLUTION'
        : key === 'pl03b' ? 'PL03B' : key === 'pl07' ? 'PL07' : key === 'cab' ? 'CAB' : key.toUpperCase(),
      version: 1, hash: await defaultSha256(content.trim()), title: key,
      content, sourceHashes: [], updatedAt: AT,
      ...(key === 'changePack' ? {} : { approvedAt: AT }),
    };
  }
  if (artifacts.changePack && artifacts.solution) {
    (artifacts.changePack as { sourceHashes: string[] }).sourceHashes =
      [(artifacts.solution as { hash: string }).hash];
  }
  const state: SdlcWorkflowState = {
    schemaVersion: 1, sessionId: '33333333-3333-4333-8333-333333333333', projectId: PROJECT,
    threadId: '44444444-4444-4444-8444-444444444444', currentStep: 'SOLUTION',
    metadata: { cr: 'CR-1', featureName: 'T', author: 'A', requestingUnit: 'U', date: '2026-11-05' },
    artifacts, staleSteps: [], createdAt: AT, updatedAt: AT,
  } as SdlcWorkflowState;
  await db.settings.put({ key: workflowStorageKey(PROJECT, crId), value: JSON.stringify(state) });
}

function ctx(overrides: Partial<ArtifactToolContext> = {}): ArtifactToolContext {
  return {
    scopeKey: `sdlc:${PROJECT}:${CR}:SOLUTION`, projectId: PROJECT, crId: CR, stepId: 'SOLUTION',
    getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }),
    getDraft: (kind) => (kind === 'SOLUTION' ? DOC : undefined),
    ...overrides,
  };
}

async function call(db: TaskPlannerDatabase, name: string, args: Record<string, unknown>, context?: ArtifactToolContext) {
  const raw = await dispatchAiToolCall(name, args, db, undefined, context ? { artifactContext: context } : {});
  return JSON.parse(raw);
}

function patchArgs(extra: Record<string, unknown> = {}) {
  return { kind: 'SOLUTION', sectionId: '1.2', expectedHeading: 'Kiến trúc',
    baseHash: '', operation: 'append', newContent: 'Dòng thêm.', ...extra };
}

const FULL: Refs = { pl01: 'PL01', pl02: 'PL02', solution: DOC, changePack: 'PACK', pl03b: 'PL03B', pl07: 'PL07', cab: 'CAB' };

describe('artifact tool access guards (SDLC-ART-06)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`artifact-guards-${Date.now()}-${Math.random()}`);
    await db.open();
  });

  afterEach(async () => { await db.delete(); });

  it('refuses both tools in a read-only historical view without exposing content or writing', async () => {
    await seed(db, FULL);
    const before = await db.settings.toArray();
    const historical = ctx({ getAccess: () => ({ readOnly: true, crActive: true, scopeValid: true }) });

    const read = await call(db, 'get_artifact', { kind: 'SOLUTION' }, historical);
    expect(read).toMatchObject({ refused: true, code: 'ARTIFACT_READ_ONLY' });
    expect(read.message).toContain('phiên bản đang hoạt động');
    expect(JSON.stringify(read)).not.toContain('Nội dung gốc.');

    const patch = await call(db, 'patch_artifact_section',
      patchArgs({ baseHash: await defaultSha256(DOC.trim()) }), historical);
    expect(patch).toMatchObject({ refused: true, code: 'ARTIFACT_READ_ONLY' });
    expect(JSON.stringify(patch)).not.toContain('Nội dung gốc.');
    expect(await db.settings.toArray()).toEqual(before);
  });

  it('refuses an inactive or archived CR and a revoked scope', async () => {
    await seed(db, FULL);
    const inactive = await call(db, 'get_artifact', { kind: 'SOLUTION' },
      ctx({ getAccess: () => ({ readOnly: false, crActive: false, scopeValid: true }) }));
    expect(inactive.refused).toBe(true);
    expect(inactive.code).toBe('CR_NOT_ACTIVE');

    const revoked = await call(db, 'patch_artifact_section',
      patchArgs({ baseHash: await defaultSha256(DOC.trim()) }),
      ctx({ getAccess: () => ({ readOnly: false, crActive: true, scopeValid: false }) }));
    expect(revoked.refused).toBe(true);
    expect(revoked.code).toBe('ARTIFACT_SCOPE_INVALID');
  });

  it('blocks a kind that does not belong to the current step', async () => {
    await seed(db, FULL);
    const result = await call(db, 'get_artifact', { kind: 'CAB' }, ctx());
    expect(result).toMatchObject({ refused: true, code: 'ARTIFACT_STEP_UNSUPPORTED' });
    expect(result.message).toContain('CAB');
  });

  it.each([
    ['missing PL01', { pl02: 'PL02', solution: DOC }, 'INTAKE_PL01_REQUIRED', 'INTAKE'],
    ['missing PL02', { pl01: 'PL01', solution: DOC }, 'INTAKE_PL02_REQUIRED', 'INTAKE'],
  ] as const)('refuses SOLUTION read/patch when %s', async (label, refs, guard, supplying) => {
    await seed(db, refs);
    const read = await call(db, 'get_artifact', { kind: 'SOLUTION' }, ctx());
    expect(read.refused).toBe(true);
    expect(read.code).toBe(guard);
    expect(read.supplyingStep).toBe(supplying);
    expect(read.stepNumber).toBe(1);
    expect(read.message).toContain('Chưa đủ điều kiện');

    const patch = await call(db, 'patch_artifact_section',
      patchArgs({ baseHash: await defaultSha256(DOC.trim()) }), ctx());
    expect(patch.code).toBe(guard);
    expect(label).toBeTruthy();
  });

  it.each([
    ['missing SOLUTION', { pl01: 'PL01', pl02: 'PL02', changePack: 'PACK' }, 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS', 'CHANGE_PACK'],
    ['missing validated CHANGE_PACK', { pl01: 'PL01', pl02: 'PL02', solution: DOC }, 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS', 'CHANGE_PACK'],
  ] as const)('refuses TECH_DOCS when %s', async (_label, refs, guard, supplying) => {
    await seed(db, refs);
    const result = await call(db, 'get_artifact', { kind: 'PL03B' },
      ctx({ stepId: 'TECH_DOCS', getDraft: () => undefined }));
    expect(result.refused).toBe(true);
    expect(result.code).toBe(guard);
    expect(result.supplyingStep).toBe(supplying);
    expect(result.stepNumber).toBe(4);
  });

  it.each([
    ['missing PL03B', { pl07: 'PL07', cab: 'CAB' }],
    ['missing PL07', { pl03b: 'PL03B', cab: 'CAB' }],
  ] as const)('refuses CAB when %s', async (_label, refs) => {
    await seed(db, { ...refs, pl01: 'PL01', pl02: 'PL02', solution: DOC, changePack: 'PACK' });
    const result = await call(db, 'get_artifact', { kind: 'CAB' },
      ctx({ stepId: 'CAB', getDraft: () => undefined }));
    expect(result.refused).toBe(true);
    expect(result.code).toBe('ALL_DOCS_REQUIRED_FOR_CAB');
    expect(result.supplyingStep).toBe('TECH_DOCS');
    expect(result.stepNumber).toBe(5);
  });

  it('returns ARTIFACT_REQUIRED when prerequisites exist but the target document does not', async () => {
    await seed(db, { pl01: 'PL01', pl02: 'PL02', solution: DOC, changePack: 'PACK', pl03b: 'PL03B', pl07: 'PL07' });
    const result = await call(db, 'get_artifact', { kind: 'CAB' },
      ctx({ stepId: 'CAB', getDraft: () => undefined }));
    expect(result.refused).toBe(true);
    expect(result.code).toBe('ARTIFACT_REQUIRED');
    expect(result.message).toContain('Tờ trình CAB');
  });

  it('allows active reads and a bounded proposal in a writable active CR', async () => {
    await seed(db, FULL);
    const before = await db.settings.toArray();
    const snapshot = await call(db, 'get_artifact', { kind: 'SOLUTION' }, ctx());
    expect(snapshot.refused).toBeUndefined();
    expect(snapshot.markdown).toBe(DOC);
    expect(snapshot.sectionIndex.map((section: { id: string }) => section.id)).toEqual(['1', '1.1', '1.2']);

    const proposal = await call(db, 'patch_artifact_section',
      patchArgs({ baseHash: snapshot.baseHash }), ctx());
    expect(proposal.refused).toBeUndefined();
    expect(proposal.addedLines).toBe(1);
    expect(proposal.patchedMarkdown).toBe(`${DOC}\nDòng thêm.`);
    expect(await db.settings.toArray()).toEqual(before);
  });
});
