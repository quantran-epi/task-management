import { z } from 'zod';

export const BenchmarkReportSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),
  environment: z.strictObject({
    nodeVersion: z.string(),
    mode: z.enum(['deterministic_offline', 'live_smoke']),
  }),
  thresholds: z.strictObject({
    aggregatePassRate: z.number(),
    categoryPassRate: z.number(),
    threeHopPassRate: z.number(),
    pathFidelityRate: z.number(),
    maxInvariantViolations: z.literal(0),
  }),
  summary: z.strictObject({
    totalCases: z.number().int(),
    passedCases: z.number().int(),
    failedCases: z.number().int(),
    aggregatePassRate: z.number(),
    passedGate: z.boolean(),
  }),
  categoryScores: z.record(
    z.string(),
    z.strictObject({
      total: z.number().int(),
      passed: z.number().int(),
      passRate: z.number(),
      passedGate: z.boolean(),
    })
  ),
  threeHopScore: z.strictObject({
    total: z.number().int(),
    passed: z.number().int(),
    passRate: z.number(),
    passedGate: z.boolean(),
  }),
  pathFidelity: z.strictObject({
    totalEvaluated: z.number().int(),
    passed: z.number().int(),
    fidelityRate: z.number(),
    passedGate: z.boolean(),
  }),
  invariants: z.strictObject({
    totalViolations: z.number().int(),
    passedGate: z.boolean(),
    violations: z.array(
      z.strictObject({
        caseId: z.string(),
        violation: z.string(),
      })
    ),
  }),
  failedCaseDetails: z.array(
    z.strictObject({
      id: z.string(),
      category: z.string(),
      reasons: z.array(z.string()),
    })
  ),
});

export type BenchmarkReport = z.infer<typeof BenchmarkReportSchema>;
