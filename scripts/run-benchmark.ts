import fs from 'node:fs';
import path from 'node:path';
import { evaluateAllCases } from '../tests/ai/evaluatorCore';
import {
  evaluateReleaseGate,
  DEFAULT_GATE_THRESHOLDS,
} from '../tests/ai/releaseGate';
import {
  buildReportFromVerdict,
  writeBenchmarkReports,
} from '../tests/ai/reportGenerator';
import type { GroundedReferenceCase } from '../tests/fixtures/ai/grounded-reference-fixture-schema';

async function main() {
  const isLive = process.argv.includes('--live');
  const fixturePath = path.resolve('tests/fixtures/ai/grounded-assistant-reference.json');

  if (!fs.existsSync(fixturePath)) {
    console.error(`[BENCHMARK ERROR] Reference fixture file not found at ${fixturePath}`);
    process.exit(1);
  }

  const cases: GroundedReferenceCase[] = JSON.parse(
    fs.readFileSync(fixturePath, 'utf8')
  );

  if (isLive) {
    console.log(`[BENCHMARK] Running in live smoke advisory mode per D-13...`);
  } else {
    console.log(`[BENCHMARK] Running 40 reference benchmark cases in deterministic offline mode...`);
  }

  const results = await evaluateAllCases(cases);
  const verdict = evaluateReleaseGate(results, DEFAULT_GATE_THRESHOLDS);
  const report = buildReportFromVerdict(
    results,
    verdict,
    DEFAULT_GATE_THRESHOLDS,
    isLive ? 'live_smoke' : 'deterministic_offline'
  );

  const { jsonPath, markdownPath } = writeBenchmarkReports(report);

  // Formatted summary console table
  const summaryRows = [
    {
      Metric: 'Aggregate Pass Rate',
      Value: `${(verdict.aggregatePassRate * 100).toFixed(1)}% (${report.summary.passedCases}/${report.summary.totalCases})`,
      Threshold: `>= ${(DEFAULT_GATE_THRESHOLDS.aggregatePassRate * 100).toFixed(0)}%`,
      Status: verdict.passesAggregate ? 'PASS' : 'FAIL',
    },
    {
      Metric: '3-Hop Chain Pass Rate',
      Value: `${(verdict.threeHopScore.passRate * 100).toFixed(1)}% (${verdict.threeHopScore.passed}/${verdict.threeHopScore.total})`,
      Threshold: `>= ${(DEFAULT_GATE_THRESHOLDS.threeHopPassRate * 100).toFixed(0)}%`,
      Status: verdict.passesThreeHop ? 'PASS' : 'FAIL',
    },
    {
      Metric: 'Single-Snapshot Path Fidelity',
      Value: `${(verdict.pathFidelity.fidelityRate * 100).toFixed(1)}% (${verdict.pathFidelity.passed}/${verdict.pathFidelity.totalEvaluated})`,
      Threshold: `${(DEFAULT_GATE_THRESHOLDS.pathFidelityRate * 100).toFixed(0)}%`,
      Status: verdict.passesPathFidelity ? 'PASS' : 'FAIL',
    },
    {
      Metric: 'Trust Invariant Violations',
      Value: `${verdict.invariantViolations.length}`,
      Threshold: `${DEFAULT_GATE_THRESHOLDS.maxInvariantViolations}`,
      Status: verdict.passesInvariants ? 'PASS' : 'FAIL',
    },
  ];

  console.log('\n--- BENCHMARK RELEASE GATE SUMMARY ---');
  console.table(summaryRows);

  console.log('\n--- CATEGORY BREAKDOWN ---');
  const catRows = Object.entries(verdict.categoryScores).map(([cat, score]) => ({
    Category: cat,
    Total: score.total,
    Passed: score.passed,
    'Pass Rate': `${(score.passRate * 100).toFixed(1)}%`,
    Threshold: `>= ${(DEFAULT_GATE_THRESHOLDS.categoryPassRate * 100).toFixed(0)}%`,
    Status: score.passedGate ? 'PASS' : 'FAIL',
  }));
  console.table(catRows);

  console.log(`\nReports generated:`);
  console.log(`- JSON:     ${jsonPath}`);
  console.log(`- Markdown: ${markdownPath}\n`);

  if (verdict.passedGate) {
    console.log(`[BENCHMARK] Release gate PASSED. All multi-tier thresholds and trust invariants satisfied.\n`);
    process.exit(0);
  } else {
    console.error(`[BENCHMARK] Release gate FAILED.`);
    if (!verdict.passesAggregate) {
      console.error(`- Aggregate pass rate ${(verdict.aggregatePassRate * 100).toFixed(1)}% is below ${(DEFAULT_GATE_THRESHOLDS.aggregatePassRate * 100).toFixed(0)}% threshold.`);
    }
    if (!verdict.passesCategories) {
      console.error(`- One or more categories failed to meet ${(DEFAULT_GATE_THRESHOLDS.categoryPassRate * 100).toFixed(0)}% category threshold.`);
    }
    if (!verdict.passesThreeHop) {
      console.error(`- 3-hop pass rate ${(verdict.threeHopScore.passRate * 100).toFixed(1)}% is below ${(DEFAULT_GATE_THRESHOLDS.threeHopPassRate * 100).toFixed(0)}% threshold.`);
    }
    if (!verdict.passesPathFidelity) {
      console.error(`- Path fidelity ${(verdict.pathFidelity.fidelityRate * 100).toFixed(1)}% did not achieve 100% single-snapshot compliance.`);
    }
    if (!verdict.passesInvariants) {
      console.error(`- Detected ${verdict.invariantViolations.length} zero-tolerance trust invariant violation(s):`);
      for (const inv of verdict.invariantViolations) {
        console.error(`  * [${inv.caseId}] ${inv.violation}`);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[BENCHMARK UNCAUGHT ERROR]', err);
  process.exit(1);
});
