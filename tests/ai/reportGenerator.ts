import fs from 'node:fs';
import path from 'node:path';
import {
  BenchmarkReportSchema,
  type BenchmarkReport,
} from '../../src/services/ai/benchmarkReportSchemas';
import type { GateVerdict, GateThresholds } from './releaseGate';
import type { CaseEvaluationResult } from './evaluatorCore';

export function buildReportFromVerdict(
  results: readonly CaseEvaluationResult[],
  verdict: GateVerdict,
  thresholds: GateThresholds,
  mode: 'deterministic_offline' | 'live_smoke' = 'deterministic_offline'
): BenchmarkReport {
  const totalCases = results.length;
  const passedCases = results.filter((r) => r.passed).length;
  const failedCases = totalCases - passedCases;

  const failedCaseDetails = results
    .filter((r) => !r.passed)
    .map((r) => ({
      id: r.id,
      category: r.category,
      reasons: [...r.failureReasons],
    }));

  const reportData = {
    schemaVersion: '1.0.0' as const,
    runId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      mode,
    },
    thresholds: {
      aggregatePassRate: thresholds.aggregatePassRate,
      categoryPassRate: thresholds.categoryPassRate,
      threeHopPassRate: thresholds.threeHopPassRate,
      pathFidelityRate: thresholds.pathFidelityRate,
      maxInvariantViolations: 0 as const,
    },
    summary: {
      totalCases,
      passedCases,
      failedCases,
      aggregatePassRate: verdict.aggregatePassRate,
      passedGate: verdict.passedGate,
    },
    categoryScores: verdict.categoryScores,
    threeHopScore: verdict.threeHopScore,
    pathFidelity: verdict.pathFidelity,
    invariants: {
      totalViolations: verdict.invariantViolations.length,
      passedGate: verdict.passesInvariants,
      violations: verdict.invariantViolations.map((v) => ({
        caseId: v.caseId,
        violation: v.violation,
      })),
    },
    failedCaseDetails,
  };

  return BenchmarkReportSchema.parse(reportData);
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const statusStr = report.summary.passedGate ? 'PASSED' : 'FAILED';
  const lines: string[] = [
    `# TaskMate Benchmark Evaluation Report`,
    ``,
    `- **Run ID:** \`${report.runId}\``,
    `- **Timestamp:** ${report.timestamp}`,
    `- **Node Version:** ${report.environment.nodeVersion}`,
    `- **Mode:** \`${report.environment.mode}\``,
    ``,
    `## Release Gate: ${statusStr}`,
    ``,
    `| Metric | Result | Target | Status |`,
    `| --- | --- | --- | --- |`,
    `| **Aggregate Pass Rate** | ${(report.summary.aggregatePassRate * 100).toFixed(1)}% (${report.summary.passedCases}/${report.summary.totalCases}) | >= ${(report.thresholds.aggregatePassRate * 100).toFixed(0)}% | ${report.summary.aggregatePassRate >= report.thresholds.aggregatePassRate ? 'PASS' : 'FAIL'} |`,
    `| **3-Hop Chain Pass Rate** | ${(report.threeHopScore.passRate * 100).toFixed(1)}% (${report.threeHopScore.passed}/${report.threeHopScore.total}) | >= ${(report.thresholds.threeHopPassRate * 100).toFixed(0)}% | ${report.threeHopScore.passedGate ? 'PASS' : 'FAIL'} |`,
    `| **Single-Snapshot Path Fidelity** | ${(report.pathFidelity.fidelityRate * 100).toFixed(1)}% (${report.pathFidelity.passed}/${report.pathFidelity.totalEvaluated}) | ${(report.thresholds.pathFidelityRate * 100).toFixed(0)}% | ${report.pathFidelity.passedGate ? 'PASS' : 'FAIL'} |`,
    `| **Trust Invariant Violations** | ${report.invariants.totalViolations} | 0 | ${report.invariants.passedGate ? 'PASS' : 'FAIL'} |`,
    ``,
    `## Category Breakdown`,
    ``,
    `| Category | Total | Passed | Pass Rate | Target | Status |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];

  for (const [cat, score] of Object.entries(report.categoryScores)) {
    lines.push(
      `| \`${cat}\` | ${score.total} | ${score.passed} | ${(score.passRate * 100).toFixed(1)}% | >= ${(report.thresholds.categoryPassRate * 100).toFixed(0)}% | ${score.passedGate ? 'PASS' : 'FAIL'} |`
    );
  }

  lines.push(``);
  lines.push(`## Zero-Tolerance Invariants`);
  lines.push(``);
  if (report.invariants.totalViolations === 0) {
    lines.push(`Zero invariant violations detected across all test runs.`);
  } else {
    lines.push(`**${report.invariants.totalViolations} invariant violation(s) detected:**`);
    lines.push(``);
    for (const v of report.invariants.violations) {
      lines.push(`- [\`${v.caseId}\`]: ${v.violation}`);
    }
  }

  if (report.failedCaseDetails.length > 0) {
    lines.push(``);
    lines.push(`## Diagnostic Failures`);
    lines.push(``);
    for (const f of report.failedCaseDetails) {
      lines.push(`### Case \`${f.id}\` (\`${f.category}\`)`);
      for (const r of f.reasons) {
        lines.push(`- ${r}`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n');
}

export function writeBenchmarkReports(
  report: BenchmarkReport,
  outputDir: string = '.benchmark-reports'
): { jsonPath: string; markdownPath: string } {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, renderBenchmarkMarkdown(report), 'utf8');

  return { jsonPath, markdownPath };
}
