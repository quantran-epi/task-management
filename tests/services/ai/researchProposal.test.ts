import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  AI_DATABASE_TOOLS,
  executeAiTool,
  isMutationTool,
  normalizeToolName,
} from '../../../src/services/ai/aiTools';
import { getToolsForTurn } from '../../../src/services/ai/chatTurnTools';
import {
  executeSdlcArtifactTool,
  type ArtifactToolContext,
  type ResearchProposalResult,
} from '../../../src/services/ai/sdlcArtifactTools';

const mocks = vi.hoisted(() => ({ updateChangeRequest: vi.fn() }));
vi.mock('../../../src/db/repositories/changeRequestRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/db/repositories/changeRequestRepo')>();
  return { ...actual, updateChangeRequest: mocks.updateChangeRequest };
});

const CR_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const NO_SSH_ID = '44444444-4444-4444-8444-444444444444';
const OUT_OF_SCOPE_ID = '55555555-5555-4555-8555-555555555555';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

function makeContext(overrides: Partial<ArtifactToolContext> = {}): ArtifactToolContext {
  return {
    scopeKey: 'sdlc:project:cr:SOLUTION',
    changeRequestId: CR_ID,
    crId: CR_ID,
    stepId: 'SOLUTION',
    getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }),
    getDraft: () => undefined,
    ...overrides,
  };
}

describe('propose_research registration', () => {
  it('is declared exactly once with questions required', () => {
    const matches = AI_DATABASE_TOOLS.filter((tool) => normalizeToolName(tool.function.name) === 'propose_research');
    expect(matches).toHaveLength(1);
    const parameters = matches[0]!.function.parameters as { required?: string[] };
    expect(parameters.required).toEqual(['questions']);
  });

  it('is not classified as a mutation tool', () => {
    expect(isMutationTool('propose_research')).toBe(false);
  });

  it('never leaks into ordinary chat and returns when explicitly allowed', () => {
    const ordinary = getToolsForTurn(false, [], undefined).map((tool) => normalizeToolName(tool.function.name));
    expect(ordinary).not.toContain('propose_research');
    const allowed = getToolsForTurn(false, [], ['propose_research']).map((tool) => normalizeToolName(tool.function.name));
    expect(allowed).toEqual(['propose_research']);
  });
});

describe('propose_research dispatch and scope', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    mocks.updateChangeRequest.mockReset();
    db = new TaskPlannerDatabase(`research-${crypto.randomUUID()}`);
    await db.open();
    const now = '2026-11-08T00:00:00.000Z';
    await db.systems.bulkAdd([
      { id: PARENT_ID, name: 'Core Banking', code: 'CORE', parentId: null, type: 'LOGICAL_GROUP', createdAt: now, updatedAt: now },
      { id: SERVICE_ID, name: 'Payment Service', code: 'PAY-SVC', parentId: PARENT_ID, type: 'SERVICE', sshConfigId: 'ssh-1', createdAt: now, updatedAt: now },
      { id: NO_SSH_ID, name: 'Billing Schema', code: 'BILL-DB', parentId: PARENT_ID, type: 'SCHEMA', createdAt: now, updatedAt: now },
      { id: OUT_OF_SCOPE_ID, name: 'Other Service', code: 'OTHER', parentId: PARENT_ID, type: 'SERVICE', sshConfigId: 'ssh-2', createdAt: now, updatedAt: now },
    ]);
    await db.changeRequests.add({
      id: CR_ID,
      name: 'CR',
      code: 'CR-2026-001',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [{ systemId: SERVICE_ID }, { systemId: NO_SSH_ID }],
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('is reachable through executeAiTool and returns a proposal payload', async () => {
    const raw = await executeAiTool('propose_research', {
      questions: [{ question: 'Which retry policy?', systemId: SERVICE_ID }],
      rationale: 'no internal evidence',
    }, db, undefined, { artifactContext: makeContext() });
    const parsed = JSON.parse(raw) as ResearchProposalResult & { error?: string };
    expect(parsed.error).toBeUndefined();
    expect(parsed.targetSystemIds).toEqual([SERVICE_ID]);
    expect(parsed.questions[0]!.systemCode).toBe('PAY-SVC');
    expect(parsed.rationale).toBe('no internal evidence');
  });

  it('returns data only and never writes the CR', async () => {
    const result = await executeSdlcArtifactTool('propose_research', {}, db, makeContext()) as ResearchProposalResult;
    expect(result).toEqual({ questions: [], targetSystemIds: [], rationale: '', unavailableSystemIds: [] });
    expect(mocks.updateChangeRequest).not.toHaveBeenCalled();
  });

  it('drops spoofed codes, unknown ids, and ids outside the CR targets', async () => {
    const result = await executeSdlcArtifactTool('propose_research', {
      questions: [
        { question: 'spoofed', systemId: SERVICE_ID, systemCode: 'SPOOFED' },
        { question: 'unknown', systemId: MISSING_ID },
        { question: 'out of scope', systemId: OUT_OF_SCOPE_ID },
        { question: 'unbound' },
      ],
      rationale: 'r',
    }, db, makeContext()) as ResearchProposalResult;

    expect(result.questions).toEqual([
      { question: 'spoofed', systemId: SERVICE_ID, systemCode: 'PAY-SVC' },
      { question: 'unbound' },
    ]);
    expect(result.targetSystemIds).toEqual([SERVICE_ID]);
  });

  it('flags target systems without an SSH config as unavailable', async () => {
    const result = await executeSdlcArtifactTool('propose_research', {
      questions: [
        { question: 'a', systemId: SERVICE_ID },
        { question: 'b', systemId: NO_SSH_ID },
      ],
    }, db, makeContext()) as ResearchProposalResult;

    expect(result.targetSystemIds).toEqual([SERVICE_ID, NO_SSH_ID]);
    expect(result.unavailableSystemIds).toEqual([NO_SSH_ID]);
  });

  it('refuses without a trusted context', async () => {
    const result = await executeSdlcArtifactTool('propose_research', {}, db, undefined) as { refused?: boolean; code?: string };
    expect(result.refused).toBe(true);
    expect(result.code).toBe('ARTIFACT_SCOPE_REQUIRED');
  });
});
