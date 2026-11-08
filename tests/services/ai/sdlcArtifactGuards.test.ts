import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { dispatchAiToolCall } from '../../../src/services/ai/aiOrchestratorLoop';
import { defaultSha256, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import type { SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';
import { executeSdlcArtifactTool, prepareArtifactPatch, readArtifactSnapshot, validateArtifactToolAccess,
  type ArtifactToolContext } from '../../../src/services/ai/sdlcArtifactTools';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CR = 'cr-active';
const AT = '2026-11-05T00:00:00.000Z';
const DOC = ['# SOLUTION', '', '## Mục tiêu', '', 'Nội dung gốc.', '', '## Kiến trúc', '', 'Nội dung kiến trúc.'].join('\n');

type Refs = Partial<Record<'pl01' | 'pl02' | 'solution' | 'changePack' | 'pl03b' | 'pl07' | 'cab', string>>;

async function seed(db: TaskPlannerDatabase, refs: Refs, options: { crId?: string } = {}) {
  const crId = options.crId ?? CR;
  const artifacts: SdlcWorkflowState['artifacts'] = { branchSnapshots: {} };
  const dynamicArtifacts = artifacts as Record<string, unknown>;
  for (const [key, content] of Object.entries(refs)) {
    if (content === undefined) continue;
    dynamicArtifacts[key] = {
      kind: key === 'changePack' ? 'CHANGE_PACK' : key === 'solution' ? 'SOLUTION'
        : key === 'pl03b' ? 'PL03B' : key === 'pl07' ? 'PL07' : key === 'cab' ? 'CAB' : key.toUpperCase(),
      version: 1, hash: await defaultSha256(content.trim()), title: key,
      content, sourceHashes: [], updatedAt: AT,
      ...(key === 'changePack' ? {} : { approvedAt: AT }),
    };
  }
  if (dynamicArtifacts.changePack && dynamicArtifacts.solution) {
    (dynamicArtifacts.changePack as { sourceHashes: string[] }).sourceHashes =
      [(dynamicArtifacts.solution as { hash: string }).hash];
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
    scopeKey: `sdlc:${PROJECT}:${CR}:SOLUTION`, changeRequestId: PROJECT, crId: CR, stepId: 'SOLUTION',
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

  it.each(['get_artifact', 'proxy_get_artifact_cc', 'tool_get_artifact_ide', 'patch_artifact_section', 'proxy_patch_artifact_section_cc', 'tool_patch_artifact_section_ide'])(
    'normalizes %s but never accepts forged access flags', async (name) => {
      await seed(db, FULL);
      const result = await call(db, name, { ...patchArgs({ baseHash: await defaultSha256(DOC.trim()) }),
        changeRequestId: 'other', crId: 'other', readOnly: false, approved: true, active: true },
      ctx({ getAccess: () => ({ readOnly: true, crActive: true, scopeValid: true }) }));
      expect(result).toMatchObject({ refused: true, code: 'ARTIFACT_READ_ONLY' });
      expect(JSON.stringify(result)).not.toContain('Nội dung gốc.');
    }
  );

  it.each(['get_artifact', 'patch_artifact_section'])('rechecks %s when access expires during awaited workflow read', async (name) => {
    await seed(db, FULL);
    const before = await db.settings.toArray();
    const originalGet = db.settings.get.bind(db.settings);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const delayedGet = async (key: string) => {
      const row = await originalGet(key);
      entered(); await gate; return row;
    };
    const get = vi.spyOn(db.settings, 'get').mockImplementationOnce(delayedGet as unknown as typeof db.settings.get);
    let valid = true;
    const pending = call(db, name, patchArgs({ baseHash: await defaultSha256(DOC.trim()) }),
      ctx({ getAccess: () => ({ readOnly: false, crActive: true, scopeValid: valid }) }));
    await started;
    valid = false; release();
    const result = await pending;
    get.mockRestore();
    expect(result).toMatchObject({ refused: true, code: 'ARTIFACT_SCOPE_INVALID' });
    expect(JSON.stringify(result)).not.toContain('Nội dung gốc.');
    expect(await db.settings.toArray()).toEqual(before);
  });

  it.each(['get_artifact', 'patch_artifact_section'])('rechecks %s after awaited hashing', async (name) => {
    await seed(db, FULL);
    const hash = await defaultSha256(DOC.trim());
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      entered(); await gate; return digest(...args);
    });
    let readOnly = false;
    const pending = call(db, name, patchArgs({ baseHash: hash }),
      ctx({ getAccess: () => ({ readOnly, crActive: true, scopeValid: true }) }));
    await started; readOnly = true; release();
    const result = await pending;
    spy.mockRestore();
    expect(result).toMatchObject({ refused: true, code: 'ARTIFACT_READ_ONLY' });
    expect(JSON.stringify(result)).not.toContain('Nội dung gốc.');
  });

  it.each(['completed', 'archived', 'preview', 'historical'])(
    'refuses both tools in %s view while another active scope still succeeds', async (mode) => {
      await seed(db, FULL);
      const context = ctx({ getAccess: () => ({ readOnly: mode === 'preview' || mode === 'historical',
        crActive: mode !== 'completed' && mode !== 'archived', scopeValid: true }) });
      for (const name of ['get_artifact', 'patch_artifact_section']) {
        const result = await call(db, name, patchArgs({ baseHash: await defaultSha256(DOC.trim()) }), context);
        expect(result.refused).toBe(true);
        expect(result.markdown).toBeUndefined();
        expect(result.patchedMarkdown).toBeUndefined();
      }
      const active = await call(db, 'get_artifact', { kind: 'SOLUTION' }, ctx());
      expect(active.markdown).toBe(DOC);
    }
  );

  it('validates live host snapshots and rejects mismatched project identity', async () => {
    await seed(db, FULL);
    const row = await db.settings.get(workflowStorageKey(PROJECT, CR));
    const state = JSON.parse(String(row!.value));
    const unavailable = await call(db, 'get_artifact', { kind: 'SOLUTION' }, ctx({ getWorkflowState: () => undefined }));
    expect(unavailable.code).toBe('WORKFLOW_UNAVAILABLE');
    const invalid = await call(db, 'get_artifact', { kind: 'SOLUTION' }, ctx({ getWorkflowState: () => ({ ...state, artifacts: { pl01: { content: 'spoof' } } }) }));
    expect(invalid.code).toBe('WORKFLOW_UNAVAILABLE');
    const otherProject = await call(db, 'get_artifact', { kind: 'SOLUTION' }, ctx({ getWorkflowState: () => ({ ...state, projectId: '22222222-2222-4222-8222-222222222222' }) }));
    expect(otherProject.code).toBe('ARTIFACT_SCOPE_INVALID');
  });

  it.each(['PL03B', 'PL07'])('rejects unvalidated change-pack source chain for %s', async (kind) => {
    await seed(db, FULL);
    const row = await db.settings.get(workflowStorageKey(PROJECT, CR));
    const state = JSON.parse(String(row!.value));
    state.artifacts.changePack.sourceHashes = [];
    await db.settings.put({ ...row!, value: JSON.stringify(state) });
    const result = await call(db, 'get_artifact', { kind }, ctx({ stepId: 'TECH_DOCS', getDraft: () => undefined }));
    expect(result.code).toBe('SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS');
    expect(result.supplyingStep).toBe('CHANGE_PACK');
  });

  it.each(['kind', 'sectionId', 'expectedHeading', 'baseHash', 'operation', 'newContent'])(
    'rejects missing/null/invalid %s without generic exceptions', async (field) => {
      await seed(db, FULL);
      const baseHash = await defaultSha256(DOC.trim());
      for (const value of [undefined, null, 42, {}]) {
        const result = await call(db, 'patch_artifact_section', { ...patchArgs({ baseHash }), [field]: value }, ctx());
        expect(result).toMatchObject({ refused: true, code: 'INVALID_ARGUMENTS' });
        expect(result.markdown).toBeUndefined();
        expect(result.patchedMarkdown).toBeUndefined();
        expect(JSON.stringify(result)).not.toMatch(/stack|Bearer|apiKey|Nội dung gốc\./);
      }
    }
  );

  it.each([undefined, null, 42, '', 'PL01', 'not-a-kind'])(
    'rejects invalid read kind %s as INVALID_ARGUMENTS', async (kind) => {
      await seed(db, FULL);
      expect(await call(db, 'get_artifact', { kind }, ctx())).toMatchObject({ refused: true, code: 'INVALID_ARGUMENTS' });
    }
  );

  it('does not cache permission or proposals across revoked and independent scopes', async () => {
    await seed(db, FULL);
    let valid = true;
    const context = ctx({ getAccess: () => ({ readOnly: false, crActive: true, scopeValid: valid }) });
    const args = patchArgs({ baseHash: await defaultSha256(DOC.trim()) });
    const first = await call(db, 'patch_artifact_section', args, context);
    const second = await call(db, 'patch_artifact_section', args, context);
    expect(first.proposalId).not.toBe(second.proposalId);
    valid = false;
    const denied = await call(db, 'patch_artifact_section', args, context);
    expect(denied.code).toBe('ARTIFACT_SCOPE_INVALID');
    const active = await call(db, 'patch_artifact_section', args, ctx());
    expect(active.patchedMarkdown).toBe(`${DOC}\nDòng thêm.`);
  });

  it('rejects prior hash after heading insertion and reports actual replacement change count', async () => {
    await seed(db, FULL);
    const baseHash = await defaultSha256(DOC.trim());
    const shifted = '# Tiêu đề mới\n' + DOC;
    const drift = await call(db, 'patch_artifact_section', patchArgs({ baseHash }), ctx({ getDraft: () => shifted }));
    expect(drift.code).toBe('SECTION_DRIFT');
    expect(drift.sectionIndex).toBeDefined();
    const before = '# SOLUTION\n## Mục tiêu\n' + Array.from({ length: 61 }, (_, index) => `cũ-${index}`).join('\n');
    const over = await call(db, 'patch_artifact_section', {
      kind: 'SOLUTION', sectionId: '1.1', expectedHeading: 'Mục tiêu', baseHash: await defaultSha256(before.trim()),
      operation: 'replace', newContent: Array.from({ length: 60 }, (_, index) => `mới-${index}`).join('\n'),
    }, ctx({ getDraft: () => before }));
    expect(over).toMatchObject({ refused: true, code: 'PATCH_TOO_LARGE', addedLines: 60, removedLines: 61, cap: 120 });
    expect(over.message).toContain('121');
    expect(over.message).toContain('chia nhỏ');
  });

  it.each(['TECH_DOCS', 'CAB'] as const)('allows valid active prerequisites for %s without writes', async (stepId) => {
    await seed(db, FULL);
    const before = await db.settings.toArray();
    const kinds = stepId === 'TECH_DOCS' ? ['PL03B', 'PL07'] : ['CAB'];
    for (const kind of kinds) {
      const text = `# ${kind}\n## Mục\nNội dung.`;
      const context = ctx({ stepId, getDraft: () => text });
      expect((await call(db, 'get_artifact', { kind }, context)).markdown).toBe(text);
      const proposal = await call(db, 'patch_artifact_section', {
        kind, sectionId: '1.1', expectedHeading: 'Mục', baseHash: await defaultSha256(text.trim()), operation: 'append', newContent: 'Tiếng Việt é 🚀',
      }, context);
      expect(proposal.refused).toBeUndefined();
      expect(proposal.patchedMarkdown).toContain('Tiếng Việt é 🚀');
    }
    expect(await db.settings.toArray()).toEqual(before);
  });

  it('direct service and shared guard entry points fail closed without registry filtering', async () => {
    await seed(db, FULL);
    const state = JSON.parse(String((await db.settings.get(workflowStorageKey(PROJECT, CR)))!.value));
    const readonly = ctx({ getAccess: () => ({ readOnly: true, crActive: true, scopeValid: true }) });
    expect(validateArtifactToolAccess(readonly, state, 'SOLUTION')?.code).toBe('ARTIFACT_READ_ONLY');
    expect(await readArtifactSnapshot(db, readonly, 'SOLUTION')).toMatchObject({ refused: true, code: 'ARTIFACT_READ_ONLY' });
    expect(await prepareArtifactPatch(db, readonly, patchArgs({ baseHash: await defaultSha256(DOC.trim()) })))
      .toMatchObject({ refused: true, code: 'ARTIFACT_READ_ONLY' });
    expect(await executeSdlcArtifactTool('get_artifact', { kind: 'SOLUTION' }, db))
      .toMatchObject({ refused: true, code: 'ARTIFACT_SCOPE_REQUIRED' });
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
