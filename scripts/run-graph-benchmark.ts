/**
 * Offline graph correctness gate (D-22, SC-7).
 *
 * GATE: Neo4j `EXPLAIN`/`PROFILE` tuning MUST NOT start until this benchmark
 * exits 0 and a passing `24-GRAPH-BASELINE.json` exists whose `fixtureHash`
 * equals the SHA-256 of the committed fixture bytes. Any tuning change must
 * re-run this gate against the same fixture hash and must not lower quality.
 *
 * Runs fully offline: no Neo4j, no knowledge server, no model.
 * Output is content-free — IDs, codes, counts, hashes, and metrics only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GraphReferenceFixtureSchema } from '../tests/fixtures/ai/graph-reference-fixture-schema';
import {
  buildGraphBaseline,
  checkBaselineFixtureHash,
  computeFixtureHash,
  evaluateGraphGate,
  evaluateGraphReferenceCases,
  serializeGraphBaseline,
  GRAPH_GATE_THRESHOLDS,
} from '../tests/ai/graphRetrievalEvaluator';

const FIXTURE_PATH = path.resolve('tests/fixtures/ai/graph-retrieval-reference.json');

function readJsonArg(argv: readonly string[]): string | null {
  const index = argv.indexOf('--json');
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

async function main() {
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error('[GRAPH BENCHMARK] Fixture not found.');
    process.exit(1);
  }

  const fixtureBytes = fs.readFileSync(FIXTURE_PATH);
  const fixtureHash = computeFixtureHash(fixtureBytes);

  let cases;
  try {
    cases = GraphReferenceFixtureSchema.parse(JSON.parse(fixtureBytes.toString('utf8')));
  } catch {
    console.error('[GRAPH BENCHMARK] Fixture schema invalid.');
    process.exit(1);
  }

  const metrics = await evaluateGraphReferenceCases(cases);
  const verdict = evaluateGraphGate(metrics, GRAPH_GATE_THRESHOLDS);

  console.log('\n--- GRAPH CORRECTNESS GATE ---');
  console.table([
    { Metric: 'Cases', Value: `${metrics.totalCases}`, Threshold: '>= 12' },
    {
      Metric: 'Zero-result rate',
      Value: metrics.zeroResultRate.toFixed(4),
      Threshold: `<= ${GRAPH_GATE_THRESHOLDS.maxZeroResultRate}`,
    },
    {
      Metric: 'Entity recall',
      Value: metrics.entityRecall.toFixed(4),
      Threshold: `>= ${GRAPH_GATE_THRESHOLDS.minEntityRecall}`,
    },
    {
      Metric: 'Edge precision',
      Value: metrics.edgePrecision.toFixed(4),
      Threshold: `>= ${GRAPH_GATE_THRESHOLDS.minEdgePrecision}`,
    },
    { Metric: 'Identity preserved', Value: String(metrics.identityPreserved), Threshold: 'true' },
    { Metric: 'Citation closed', Value: String(metrics.citationClosed), Threshold: 'true' },
    { Metric: 'Deterministic order', Value: String(metrics.deterministicOrdering), Threshold: 'true' },
    {
      Metric: 'Latency p50/p95 (ms)',
      Value: `${metrics.latency.p50Ms} / ${metrics.latency.p95Ms}`,
      Threshold: `>= ${GRAPH_GATE_THRESHOLDS.minLatencySamples} samples`,
    },
  ]);

  console.log(`Fixture SHA-256: ${fixtureHash}`);

  const jsonPath = readJsonArg(process.argv);
  if (jsonPath) {
    const existing = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, 'utf8') : null;
    if (checkBaselineFixtureHash(existing, fixtureHash) === 'FIXTURE_HASH_MISMATCH') {
      console.error('[GRAPH BENCHMARK] Existing baseline was produced from different fixture bytes.');
      console.error('Delete the baseline artifact to re-baseline intentionally.');
      process.exit(1);
    }

    if (!verdict.passed) {
      console.error('[GRAPH BENCHMARK] Gate failed; baseline not written.');
    } else {
      const baseline = buildGraphBaseline(
        metrics,
        verdict,
        fixtureHash,
        new Date().toISOString()
      );
      fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
      fs.writeFileSync(jsonPath, serializeGraphBaseline(baseline), 'utf8');
      console.log(`Baseline written: ${jsonPath}`);
    }
  }

  if (verdict.passed) {
    console.log('[GRAPH BENCHMARK] PASSED. EXPLAIN/PROFILE tuning may proceed at this fixture hash.\n');
    process.exit(0);
  }

  console.error('[GRAPH BENCHMARK] FAILED.');
  for (const failure of verdict.failures) {
    console.error(
      `- ${failure.code}${failure.caseId ? ` [${failure.caseId}]` : ''}`
    );
  }
  process.exit(1);
}

main().catch(() => {
  console.error('[GRAPH BENCHMARK] Uncaught error.');
  process.exit(1);
});
