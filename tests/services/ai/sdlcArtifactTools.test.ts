import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import { dispatchAiToolCall } from '../../../src/services/ai/aiOrchestratorLoop';
import { defaultSha256, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import type { SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';
import type { ArtifactToolContext } from '../../../src/services/ai/sdlcArtifactTools';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';

const DRAFT = [
  '# SOLUTION',
  '',
  '## Mục tiêu',
  '',
  'Nội dung mục tiêu.',
  '',
  '## Kiến trúc',
  '',
  'Nội dung kiến trúc.',
].join('\n');

const OTHER_DRAFT = [
  '# SOLUTION',
  '',
  '## Mục tiêu',
  '',
  'CR khác hoàn toàn.',
].join('\n');

async function seedWorkflow(
  db: TaskPlannerDatabase,
  options: { projectId?: string; crId?: string; markdown?: string; committed?: string } = {}
): Promise<void> {
  const projectId = options.projectId ?? PROJECT_ID;
  const crId = options.crId ?? 'cr-active';
  const markdown = options.markdown ?? DRAFT;
  const committed = options.committed ?? markdown;
  const timestamp = '2026-11-04T00:00:00.000Z';
  const state: SdlcWorkflowState = {
    schemaVersion: 1,
    sessionId: '33333333-3333-4333-8333-333333333333',
    projectId,
    threadId: '44444444-4444-4444-8444-444444444444',
    currentStep: 'SOLUTION',
    metadata: {
      cr: 'CR-1',
      featureName: 'Tính năng A',
      author: 'tác giả',
      requestingUnit: 'đơn vị',
      date: '2026-11-04',
    },
    artifacts: {
      solution: {
        kind: 'SOLUTION',
        version: 3,
        hash: await defaultSha256(committed.trim()),
        title: 'SOLUTION.md — v3',
        content: committed,
        sourceHashes: [],
        approvedAt: timestamp,
        updatedAt: timestamp,
      },
    },
    staleSteps: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.settings.put({
    key: workflowStorageKey(projectId, crId),
    value: JSON.stringify(state),
  });
}

function makeContext(overrides: Partial<ArtifactToolContext> = {}): ArtifactToolContext {
  return {
    scopeKey: `sdlc:${PROJECT_ID}:cr-active:SOLUTION`,
    projectId: PROJECT_ID,
    crId: 'cr-active',
    stepId: 'SOLUTION',
    getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }),
    getDraft: (kind) => (kind === 'SOLUTION' ? DRAFT : undefined),
    ...overrides,
  };
}

async function callTool(
  db: TaskPlannerDatabase,
  name: string,
  args: Record<string, unknown>,
  artifactContext?: ArtifactToolContext
): Promise<any> {
  const raw = await dispatchAiToolCall(name, args, db, undefined, artifactContext ? { artifactContext } : {}).catch(
    (err: any) => `TOOL_CALL_FAILED: ${err?.message ?? String(err)}`
  );
  if (typeof raw === 'string' && raw.startsWith('TOOL_CALL_FAILED')) return { failed: raw };
  return JSON.parse(raw);
}

describe('sdlc artifact tools (SDLC-ART-01, SDLC-ART-02)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-artifact-tools-${Date.now()}-${Math.random()}`);
    await db.open();
    await seedWorkflow(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('registers get_artifact and patch_artifact_section as local DB tools', async () => {
    const snapshot = await callTool(db, 'get_artifact', { kind: 'SOLUTION' }, makeContext());
    expect(snapshot.failed).toBeUndefined();
    expect(snapshot.kind).toBe('SOLUTION');
  });

  it('reads the full current draft with committed metadata and a section index without writing', async () => {
    const before = await db.settings.toArray();
    const snapshot = await callTool(db, 'get_artifact', { kind: 'SOLUTION' }, makeContext());

    expect(snapshot).toMatchObject({
      kind: 'SOLUTION',
      version: 3,
      approvedAt: '2026-11-04T00:00:00.000Z',
      approvalState: 'approved',
      markdown: DRAFT,
    });
    expect(snapshot.baseHash).toBe(await defaultSha256(DRAFT.trim()));
    expect(snapshot.sectionIndex.map((section: any) => section.title)).toEqual([
      'SOLUTION',
      'Mục tiêu',
      'Kiến trúc',
    ]);
    expect(snapshot.sectionIndex.map((section: any) => section.id)).toEqual(['1', '1.1', '1.2']);
    expect(await db.settings.toArray()).toEqual(before);
  });

  it('patches one section through registered dispatch and returns a real one-line diff without writes', async () => {
    const before = await db.settings.toArray();
    const snapshot = await callTool(db, 'get_artifact', { kind: 'SOLUTION' }, makeContext());

    const proposal = await callTool(
      db,
      'patch_artifact_section',
      {
        kind: 'SOLUTION',
        sectionId: '1.2',
        expectedHeading: 'Kiến trúc',
        baseHash: snapshot.baseHash,
        operation: 'append',
        newContent: 'Thêm một dòng mới.',
      },
      makeContext()
    );

    expect(proposal.refused).toBeUndefined();
    expect(proposal.addedLines).toBe(1);
    expect(proposal.removedLines).toBe(0);
    expect(proposal.sectionId).toBe('1.2');
    expect(proposal.sectionTitle).toBe('Kiến trúc');
    expect(proposal.baseMarkdown).toBe(DRAFT);
    expect(proposal.diffText).toContain('+Thêm một dòng mới.');
    expect(proposal.patchedMarkdown).toBe(`${DRAFT}\nThêm một dòng mới.`);
    expect(proposal.baseMarkdown.slice(0, DRAFT.indexOf('Nội dung kiến trúc.'))).toBe(
      proposal.patchedMarkdown.slice(0, DRAFT.indexOf('Nội dung kiến trúc.'))
    );
    expect(await db.settings.toArray()).toEqual(before);
  });

  it('ignores forged projectId/crId arguments and keeps trusted scope identity', async () => {
    const proposal = await callTool(
      db,
      'patch_artifact_section',
      {
        kind: 'SOLUTION',
        sectionId: '1.2',
        expectedHeading: 'Kiến trúc',
        baseHash: await defaultSha256(DRAFT.trim()),
        operation: 'append',
        newContent: 'Dòng nối thêm.',
        projectId: OTHER_PROJECT_ID,
        crId: 'cr-khac',
      },
      makeContext()
    );

    expect(proposal.projectId).toBe(PROJECT_ID);
    expect(proposal.crId).toBe('cr-active');
    expect(proposal.baseMarkdown).toBe(DRAFT);
  });

  it('keeps two trusted scopes isolated even with identical model arguments', async () => {
    await seedWorkflow(db, { crId: 'cr-other', markdown: OTHER_DRAFT });
    const contextA = makeContext();
    const contextB = makeContext({
      scopeKey: `sdlc:${PROJECT_ID}:cr-other:SOLUTION`,
      crId: 'cr-other',
      getDraft: () => OTHER_DRAFT,
    });

    const a = await callTool(db, 'get_artifact', { kind: 'SOLUTION' }, contextA);
    const b = await callTool(db, 'get_artifact', { kind: 'SOLUTION' }, contextB);

    expect(a.markdown).toBe(DRAFT);
    expect(b.markdown).toBe(OTHER_DRAFT);
    expect(a.baseHash).not.toBe(b.baseHash);
  });

  it('marks a diverging draft unapproved while keeping committed version metadata truthful', async () => {
    const changedDraft = `${DRAFT}\n\nDòng nháp chưa duyệt.`;
    const snapshot = await callTool(
      db,
      'get_artifact',
      { kind: 'SOLUTION' },
      makeContext({ getDraft: () => changedDraft })
    );

    expect(snapshot.markdown).toBe(changedDraft);
    expect(snapshot.version).toBe(3);
    expect(snapshot.approvedAt).toBe('2026-11-04T00:00:00.000Z');
    expect(snapshot.approvalState).toBe('unapproved');
    expect(snapshot.baseHash).toBe(await defaultSha256(changedDraft.trim()));
  });

  it('falls back to committed content for an undefined draft and never invents a version bump', async () => {
    await seedWorkflow(db, { committed: DRAFT });
    const snapshot = await callTool(
      db,
      'get_artifact',
      { kind: 'SOLUTION' },
      makeContext({ getDraft: () => undefined })
    );

    expect(snapshot.markdown).toBe(DRAFT);
    expect(snapshot.version).toBe(3);
    expect(snapshot.approvalState).toBe('approved');
  });

  it('treats an empty-string draft as a real draft, not a fallback to committed content', async () => {
    const snapshot = await callTool(
      db,
      'get_artifact',
      { kind: 'SOLUTION' },
      makeContext({ getDraft: () => '' })
    );

    expect(snapshot.markdown).toBe('');
    expect(snapshot.baseHash).toBe(await defaultSha256(''));
    expect(snapshot.sectionIndex).toEqual([]);
    expect(snapshot.approvalState).toBe('unapproved');
  });

  it('refuses with ARTIFACT_NOT_FOUND when no committed artifact and no draft exist', async () => {
    const refusal = await callTool(
      db,
      'get_artifact',
      { kind: 'CAB' },
      makeContext({ getDraft: () => undefined })
    );

    expect(refusal.refused).toBe(true);
    expect(refusal.code).toBe('ARTIFACT_NOT_FOUND');
  });

  it('refuses read-only and inactive scopes before touching the artifact', async () => {
    const readOnly = await callTool(
      db,
      'get_artifact',
      { kind: 'SOLUTION' },
      makeContext({ getAccess: () => ({ readOnly: true, crActive: true, scopeValid: true }) })
    );
    expect(readOnly.code).toBe('READ_ONLY');

    const inactive = await callTool(
      db,
      'patch_artifact_section',
      {
        kind: 'SOLUTION',
        sectionId: '1.2',
        expectedHeading: 'Kiến trúc',
        baseHash: await defaultSha256(DRAFT.trim()),
        operation: 'append',
        newContent: 'x',
      },
      makeContext({ getAccess: () => ({ readOnly: false, crActive: false, scopeValid: true }) })
    );
    expect(inactive.code).toBe('CR_NOT_ACTIVE');
  });

  it('refuses without trusted context instead of reading a singleton scope', async () => {
    const refusal = await callTool(db, 'get_artifact', { kind: 'SOLUTION' });
    expect(refusal.refused).toBe(true);
    expect(refusal.code).toBe('ARTIFACT_SCOPE_REQUIRED');
  });
});
