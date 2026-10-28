import { z } from 'zod';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmpty = z.string().trim().min(1).max(500);
const coverageStateSchema = z.enum(['included', 'deferred', 'unreadable', 'binary']);

export const CoverageLedgerSchema = z.strictObject({
  path: nonEmpty,
  hunkId: nonEmpty.optional(),
  state: coverageStateSchema,
  evidenceIds: z.array(nonEmpty).max(512),
});
export type CoverageLedger = z.infer<typeof CoverageLedgerSchema>;

const DriftEvidenceSchema = z.strictObject({
  evidenceId: nonEmpty,
  path: nonEmpty,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string().max(100_000),
});
export const DriftTupleSchema = z.strictObject({
  requirementId: nonEmpty,
  category: z.enum(['outside_solution', 'missing', 'different']),
  evidence: DriftEvidenceSchema.nullable(),
  baselineRequirement: nonEmpty.nullable().optional(),
}).superRefine((tuple, ctx) => {
  if (tuple.category === 'missing' && !tuple.baselineRequirement) {
    ctx.addIssue({ code: 'custom', path: ['baselineRequirement'], message: 'MISSING_REQUIRES_BASELINE_REQUIREMENT' });
  }
  if (tuple.category !== 'missing' && tuple.evidence === null) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'ACTUAL_DRIFT_REQUIRES_EVIDENCE' });
  }
});
export type DriftTuple = z.infer<typeof DriftTupleSchema>;

const ApprovedDesignSchema = z.strictObject({
  currentSystem: z.string().max(100_000),
  affectedScreens: z.array(nonEmpty).max(500),
  affectedApis: z.array(nonEmpty).max(500),
  affectedTables: z.array(nonEmpty).max(500),
});
const ActualImplementationSchema = z.strictObject({
  affectedFiles: z.array(nonEmpty).max(512),
  affectedScreens: z.array(nonEmpty).max(500),
  affectedApis: z.array(nonEmpty).max(500),
  affectedTables: z.array(nonEmpty).max(500),
});
const DbChangesRollbackSchema = z.strictObject({
  affectedTables: z.array(nonEmpty).max(500),
  changes: z.array(z.strictObject({ path: nonEmpty, evidenceIds: z.array(nonEmpty).max(512) })).max(512),
  rollback: z.strictObject({ status: z.enum(['verified', 'unknown']), evidenceIds: z.array(nonEmpty).max(512) }),
});

export const ReconciliationResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identity: z.strictObject({
    projectId: nonEmpty,
    threadId: nonEmpty,
    solutionNoteId: nonEmpty,
    solutionVersion: z.number().int().positive(),
    solutionHash: hashSchema,
    packHash: hashSchema,
    cr: nonEmpty,
    base: nonEmpty,
    head: nonEmpty,
  }),
  status: z.enum(['NO_DRIFT_COMPLETE', 'DRIFT_DETECTED', 'PARTIAL_COVERAGE']),
  approvedDesign: ApprovedDesignSchema,
  actualImplementation: ActualImplementationSchema,
  drift: z.array(DriftTupleSchema).max(1_024),
  dbChangesRollback: DbChangesRollbackSchema,
  regressionMatrix: z.array(z.strictObject({ scenario: nonEmpty, expected: nonEmpty })).max(500),
  coverage: z.array(CoverageLedgerSchema).max(2_048),
});
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

const EvidenceSchema = DriftEvidenceSchema.extend({ id: nonEmpty }).omit({ evidenceId: true });
const RequirementSchema = z.strictObject({
  id: nonEmpty,
  category: nonEmpty,
  summary: nonEmpty,
  evidencePaths: z.array(nonEmpty).max(512),
});
const HunkSchema = z.strictObject({
  id: nonEmpty,
  path: nonEmpty,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string().max(100_000),
});
const ReconciliationInputSchema = z.strictObject({
  projectId: nonEmpty,
  threadId: nonEmpty,
  solutionNoteId: nonEmpty,
  solutionVersion: z.number().int().positive(),
  solutionHash: hashSchema,
  packHash: hashSchema,
  cr: nonEmpty,
  base: nonEmpty,
  head: nonEmpty,
  solution: z.strictObject({
    projectId: nonEmpty,
    threadId: nonEmpty,
    noteId: nonEmpty,
    version: z.number().int().positive(),
    hash: hashSchema,
    requirements: z.array(RequirementSchema).max(1_024),
    approvedDesign: z.strictObject({
      currentSystem: z.string().max(100_000),
      affectedScreens: z.array(nonEmpty).max(500),
      affectedApis: z.array(nonEmpty).max(500),
      affectedTables: z.array(nonEmpty).max(500),
      regressionMatrix: z.array(z.strictObject({ scenario: nonEmpty, expected: nonEmpty })).max(500),
    }),
  }),
  pack: z.strictObject({
    packHash: hashSchema,
    identity: z.strictObject({ cr: nonEmpty, base: nonEmpty, head: nonEmpty, branch: nonEmpty }),
    entries: z.array(z.strictObject({
      path: nonEmpty,
      status: coverageStateSchema,
      coverage: coverageStateSchema,
      hunks: z.array(HunkSchema).max(1_024),
    })).max(512),
  }),
  evidence: z.array(EvidenceSchema).max(2_048),
  proposedDrift: z.array(z.strictObject({
    requirementId: nonEmpty,
    category: z.enum(['outside_solution', 'missing', 'different']),
    evidenceId: nonEmpty.nullable(),
  })).max(1_024),
});
export type ReconciliationInput = z.infer<typeof ReconciliationInputSchema>;

function assertPinnedIdentities(input: ReconciliationInput): void {
  if (input.solution.projectId !== input.projectId || input.solution.threadId !== input.threadId || input.solution.noteId !== input.solutionNoteId) throw new Error('WRONG_PROJECT');
  if (input.solution.version !== input.solutionVersion) throw new Error('STALE_SOLUTION');
  if (input.solution.hash !== input.solutionHash) throw new Error('STALE_SOLUTION');
  if (input.pack.packHash !== input.packHash) throw new Error('PACK_HASH_MISMATCH');
  if (input.pack.identity.cr !== input.cr) throw new Error('CR_MISMATCH');
  if (input.pack.identity.base !== input.base) throw new Error('BASE_MISMATCH');
  if (input.pack.identity.head !== input.head) throw new Error('HEAD_MISMATCH');
}

export function canClaimNoDrift(result: Pick<ReconciliationResult, 'drift' | 'coverage'>): boolean {
  return result.drift.length === 0 && result.coverage.length > 0 && result.coverage.every((entry) => entry.state === 'included');
}

export function reconcileSolutionWithPack(raw: unknown): ReconciliationResult {
  const input = ReconciliationInputSchema.parse(raw);
  assertPinnedIdentities(input);
  const evidenceById = new Map(input.evidence.map((evidence) => [evidence.id, evidence]));
  const requirements = new Map(input.solution.requirements.map((requirement) => [requirement.id, requirement]));

  const drift = input.proposedDrift.map((proposal): DriftTuple => {
    if (proposal.category === 'missing') {
      const baseline = requirements.get(proposal.requirementId);
      if (!baseline) throw new Error('UNKNOWN_BASELINE_REQUIREMENT');
      return DriftTupleSchema.parse({
        requirementId: proposal.requirementId,
        category: proposal.category,
        evidence: null,
        baselineRequirement: baseline.summary,
      });
    }
    if (!proposal.evidenceId) throw new Error('ACTUAL_DRIFT_REQUIRES_EVIDENCE');
    const evidence = evidenceById.get(proposal.evidenceId);
    if (!evidence) throw new Error('UNKNOWN_EVIDENCE');
    return DriftTupleSchema.parse({
      requirementId: proposal.requirementId,
      category: proposal.category,
      evidence: { evidenceId: evidence.id, path: evidence.path, startLine: evidence.startLine, endLine: evidence.endLine, text: evidence.text },
      baselineRequirement: null,
    });
  });

  const coverage = input.pack.entries.flatMap((entry) => entry.hunks.length > 0
    ? entry.hunks.map((hunk) => CoverageLedgerSchema.parse({ path: hunk.path, hunkId: hunk.id, state: entry.coverage, evidenceIds: evidenceById.has(hunk.id) ? [hunk.id] : [] }))
    : [CoverageLedgerSchema.parse({ path: entry.path, state: entry.coverage, evidenceIds: [] })]);
  const includedEvidence = input.evidence.filter((evidence) => coverage.some((item) => item.evidenceIds.includes(evidence.id)));
  const affectedFiles = [...new Set(includedEvidence.map((evidence) => evidence.path))].sort();
  const sqlEvidence = includedEvidence.filter((evidence) => /\.(?:sql|plb|pck|pkb)$/i.test(evidence.path));
  const affectedTables = [...new Set([...input.solution.approvedDesign.affectedTables, ...sqlEvidence.flatMap((evidence) => [...evidence.text.matchAll(/\b(?:TABLE|INTO|UPDATE|FROM)\s+([A-Z][A-Z0-9_$#.]*)/gi)].map((match) => match[1]!).filter(Boolean))])].sort();

  const candidate = {
    schemaVersion: 1 as const,
    identity: {
      projectId: input.projectId,
      threadId: input.threadId,
      solutionNoteId: input.solutionNoteId,
      solutionVersion: input.solutionVersion,
      solutionHash: input.solutionHash,
      packHash: input.packHash,
      cr: input.cr,
      base: input.base,
      head: input.head,
    },
    status: coverage.every((entry) => entry.state === 'included')
      ? (drift.length === 0 ? 'NO_DRIFT_COMPLETE' as const : 'DRIFT_DETECTED' as const)
      : 'PARTIAL_COVERAGE' as const,
    approvedDesign: {
      currentSystem: input.solution.approvedDesign.currentSystem,
      affectedScreens: input.solution.approvedDesign.affectedScreens,
      affectedApis: input.solution.approvedDesign.affectedApis,
      affectedTables: input.solution.approvedDesign.affectedTables,
    },
    actualImplementation: {
      affectedFiles,
      affectedScreens: [],
      affectedApis: [],
      affectedTables,
    },
    drift,
    dbChangesRollback: {
      affectedTables,
      changes: sqlEvidence.map((evidence) => ({ path: evidence.path, evidenceIds: [evidence.id] })),
      rollback: { status: 'unknown' as const, evidenceIds: [] },
    },
    regressionMatrix: input.solution.approvedDesign.regressionMatrix,
    coverage,
  };
  return ReconciliationResultSchema.parse(candidate);
}
