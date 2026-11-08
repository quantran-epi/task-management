import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db';
import {
  AI_DATABASE_TOOLS,
  isMutationTool,
  normalizeToolName,
} from '../../../src/services/ai/aiTools';
import { getToolsForTurn } from '../../../src/services/ai/chatTurnTools';
import {
  buildToolPolicy,
  SDLC_STEP_ALLOWED_TOOLS,
} from '../../../src/services/ai/sdlcPromptComposer';
import {
  executeSdlcArtifactTool,
  type ArtifactToolContext,
  type SubsystemProposalResult,
} from '../../../src/services/ai/sdlcArtifactTools';

const mocks = vi.hoisted(() => ({ updateChangeRequest: vi.fn() }));
vi.mock('../../../src/db/repositories/changeRequestRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/db/repositories/changeRequestRepo')>();
  return { ...actual, updateChangeRequest: mocks.updateChangeRequest };
});

const PARENT_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const SCHEMA_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

function makeContext(overrides: Partial<ArtifactToolContext> = {}): ArtifactToolContext {
  return {
    scopeKey: 'sdlc:project:cr:SOLUTION',
    changeRequestId: 'project',
    crId: 'cr',
    stepId: 'SOLUTION',
    getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }),
    getDraft: () => undefined,
    ...overrides,
  };
}

describe('propose_subsystems registration', () => {
  it('is declared exactly once with no required parameters', () => {
    const matches = AI_DATABASE_TOOLS.filter((tool) => normalizeToolName(tool.function.name) === 'propose_subsystems');
    expect(matches).toHaveLength(1);
    const parameters = matches[0]!.function.parameters as { required?: string[] };
    expect(parameters.required ?? []).toEqual([]);
  });

  it('is not classified as a mutation tool', () => {
    expect(isMutationTool('propose_subsystems')).toBe(false);
  });

  it('is allowlisted for SOLUTION and INTAKE but stays out of the artifact-owning tool list', () => {
    expect(SDLC_STEP_ALLOWED_TOOLS.SOLUTION).toContain('propose_subsystems');
    expect(SDLC_STEP_ALLOWED_TOOLS.INTAKE).toContain('propose_subsystems');
    // The proposal tool is not an artifact tool: it must not appear on non-proposal steps.
    for (const step of ['CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB'] as const) {
      expect(SDLC_STEP_ALLOWED_TOOLS[step]).not.toContain('propose_subsystems');
    }
  });

  it('keeps propose_research off non-proposal steps', () => {
    expect(SDLC_STEP_ALLOWED_TOOLS.SOLUTION).toContain('propose_research');
    expect(SDLC_STEP_ALLOWED_TOOLS.INTAKE).toContain('propose_research');
    for (const step of ['CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB'] as const) {
      expect(SDLC_STEP_ALLOWED_TOOLS[step]).not.toContain('propose_research');
    }
  });

  it('never leaks into ordinary chat and returns when explicitly allowed', () => {
    const ordinary = getToolsForTurn(false, [], undefined).map((tool) => normalizeToolName(tool.function.name));
    expect(ordinary).not.toContain('propose_subsystems');
    const allowed = getToolsForTurn(false, [], ['propose_subsystems']).map((tool) => normalizeToolName(tool.function.name));
    expect(allowed).toEqual(['propose_subsystems']);
  });

  it('keeps the machine-parsed policy names equal to the payload names', () => {
    for (const step of ['SOLUTION', 'INTAKE'] as const) {
      const payload = getToolsForTurn(true, [], SDLC_STEP_ALLOWED_TOOLS[step])
        .map((tool) => normalizeToolName(tool.function.name));
      const policyNames = buildToolPolicy(step).split('\n')
        .filter((line) => /^(Công cụ đọc cục bộ|MCP đọc-only động):/.test(line))
        .flatMap((line) => line.slice(line.indexOf(': ') + 2).split(', '))
        .filter((name) => name && name !== 'không có trong payload của turn này');
      expect(new Set(policyNames)).toEqual(new Set(payload));
      expect(buildToolPolicy(step)).toContain('propose_subsystems');
    }
  });
});

describe('propose_subsystems dispatch', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    mocks.updateChangeRequest.mockReset();
    db = new TaskPlannerDatabase(`proposal-${crypto.randomUUID()}`);
    await db.open();
    const now = '2026-11-08T00:00:00.000Z';
    await db.systems.bulkAdd([
      { id: PARENT_ID, name: 'Core Banking', code: 'CORE', parentId: null, type: 'LOGICAL_GROUP', createdAt: now, updatedAt: now },
      { id: SERVICE_ID, name: 'Payment Service', code: 'PAY-SVC', parentId: PARENT_ID, type: 'SERVICE', createdAt: now, updatedAt: now },
      { id: SCHEMA_ID, name: 'Billing Schema', code: 'BILL-DB', parentId: PARENT_ID, type: 'SCHEMA', createdAt: now, updatedAt: now },
    ]);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('returns data only and never writes the CR', async () => {
    const result = await executeSdlcArtifactTool('propose_subsystems', {}, db, makeContext()) as SubsystemProposalResult;
    expect(result).toEqual({ items: [], evidence: [] });
    expect(mocks.updateChangeRequest).not.toHaveBeenCalled();
  });

  it('drops unknown ids and logical parents, and takes the code from the catalog', async () => {
    const result = await executeSdlcArtifactTool('propose_subsystems', {
      items: [
        { systemId: SERVICE_ID, code: 'SPOOFED', confidence: 'high', reason: 'solution touches payment repo' },
        { systemId: PARENT_ID, confidence: 'high', reason: 'a parent is not a subsystem' },
        { systemId: MISSING_ID, confidence: 'low', reason: 'hallucinated' },
        { systemId: SCHEMA_ID, confidence: 'medium', reason: 'migration file' },
      ],
      evidence: ['SOLUTION §2.1'],
    }, db, makeContext()) as SubsystemProposalResult;

    expect(result.items.map((item) => item.systemId)).toEqual([SERVICE_ID, SCHEMA_ID]);
    expect(result.items[0]!.code).toBe('PAY-SVC');
    expect(result.items[0]!.name).toBe('Payment Service');
    expect(result.evidence).toEqual(['SOLUTION §2.1']);
    expect(mocks.updateChangeRequest).not.toHaveBeenCalled();
  });

  it('refuses without a trusted context', async () => {
    const result = await executeSdlcArtifactTool('propose_subsystems', {}, db, undefined) as { refused?: boolean; code?: string };
    expect(result.refused).toBe(true);
    expect(result.code).toBe('ARTIFACT_SCOPE_REQUIRED');
  });
});
