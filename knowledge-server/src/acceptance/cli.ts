import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { RetrievalResponseSchema, type RetrievalResponse } from '../types/retrievalProtocol.js';

export interface CliOptions {
  endpoint: string;
  setId: string;
  strict: boolean;
  output?: string;
  timeoutMs: number;
}

export interface SmokeCase {
  id: string;
  expectedIntent: string;
  expectedFastPath: boolean;
  expectedOutcome: RetrievalResponse['outcome'];
  requirePath?: boolean;
}

export interface SmokeResult {
  id: string;
  passed: boolean;
  latencyMs: number;
  outcome?: string;
  intent?: string;
  fastPath?: boolean;
  itemCount?: number;
  snapshotId?: string;
  error?: string;
}

export const SMOKE_CASES: SmokeCase[] = [
  { id: 'T1', expectedIntent: 'LOOKUP', expectedFastPath: true, expectedOutcome: 'READY' },
  { id: 'T2', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T3', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T4', expectedIntent: 'FLOW_TRAVERSAL', expectedFastPath: false, expectedOutcome: 'READY', requirePath: true },
  { id: 'T5', expectedIntent: 'IMPACT_ANALYSIS', expectedFastPath: false, expectedOutcome: 'READY', requirePath: true },
  { id: 'T6', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'NO_EVIDENCE' },
  { id: 'T7', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'NO_EVIDENCE' },
  { id: 'T8', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T9', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T10', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'NEEDS_CLARIFICATION' },
  { id: 'T11', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T12', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T13', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'DEGRADED' },
  { id: 'T14', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'UNSUPPORTED' },
  { id: 'T15', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
  { id: 'T16', expectedIntent: 'LOOKUP', expectedFastPath: false, expectedOutcome: 'READY' },
];

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      endpoint: { type: 'string' },
      'set-id': { type: 'string' },
      strict: { type: 'boolean', default: false },
      output: { type: 'string' },
      timeout: { type: 'string', default: '15000' },
    },
    strict: true,
    allowPositionals: false,
  });

  const endpoint = values.endpoint?.trim();
  const setId = values['set-id']?.trim();
  const timeoutMs = Number(values.timeout);
  if (!endpoint || !setId || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    throw new Error('Usage: --endpoint <url> --set-id <uuid> [--strict] [--output <file>] [--timeout <ms>]');
  }

  new URL(endpoint);
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    setId,
    strict: Boolean(values.strict),
    ...(values.output ? { output: values.output } : {}),
    timeoutMs,
  };
}

function assertMetadataOnly(json: string) {
  const forbidden = [/MAIN1\.FCL_CYCLE_COUNTER/i, /Chu kỳ/i, /SWIFT MT103/i, /Bearer\s+/i, /sk-[A-Za-z0-9_-]+/i, /rawSnippet/i, /quote/i, /excerpt/i, /body/i, /content/i];
  for (const re of forbidden) {
    if (re.test(json)) throw new Error(`Metadata output contains forbidden sensitive pattern: ${re}`);
  }
}

function assertStrict(caseDef: SmokeCase, response: RetrievalResponse) {
  if (response.outcome !== caseDef.expectedOutcome) {
    throw new Error(`Expected outcome ${caseDef.expectedOutcome}, got ${response.outcome}`);
  }
  if (response.planTrace.fastPath !== caseDef.expectedFastPath) {
    throw new Error(`Expected fastPath ${caseDef.expectedFastPath}, got ${response.planTrace.fastPath}`);
  }
  if (response.planTrace.intent && response.planTrace.intent !== caseDef.expectedIntent) {
    throw new Error(`Expected intent ${caseDef.expectedIntent}, got ${response.planTrace.intent}`);
  }
  if (caseDef.requirePath && !response.items.some((item) => item.type === 'edge' && item.supportingChunkIds.length > 0)) {
    throw new Error('Expected at least one closed edge path with supporting chunks');
  }
  for (const item of response.items) {
    if (item.type === 'edge' && item.supportingChunkIds.length === 0) {
      throw new Error(`Edge ${item.id} missing fact-to-chunk closure`);
    }
  }
}

async function fetchCase(options: CliOptions, caseDef: SmokeCase): Promise<RetrievalResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(`${options.endpoint}/api/v1/sets/${encodeURIComponent(options.setId)}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': crypto.randomUUID() },
      body: JSON.stringify({
        query: `smoke-${caseDef.id}`,
        limit: 10,
        includeInferred: true,
        recentTurns: [],
      }),
      signal: controller.signal,
    });
    const json = await response.json();
    return RetrievalResponseSchema.parse(json);
  } finally {
    clearTimeout(timer);
  }
}

export async function runAcceptanceCli(options: CliOptions): Promise<{ passed: boolean; results: SmokeResult[] }> {
  const results: SmokeResult[] = [];
  for (const caseDef of SMOKE_CASES) {
    const startedAt = Date.now();
    try {
      const parsed = await fetchCase(options, caseDef);
      if (options.strict) assertStrict(caseDef, parsed);
      results.push({
        id: caseDef.id,
        passed: true,
        latencyMs: Date.now() - startedAt,
        outcome: parsed.outcome,
        intent: String(parsed.planTrace.intent ?? ''),
        fastPath: parsed.planTrace.fastPath,
        itemCount: parsed.items.length,
        snapshotId: parsed.snapshotId,
      });
    } catch (error) {
      results.push({
        id: caseDef.id,
        passed: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return { passed: results.every((r) => r.passed), results };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid arguments');
    return 2;
  }

  const report = await runAcceptanceCli(options);
  const output = JSON.stringify({ generatedAt: new Date().toISOString(), setId: options.setId, ...report }, null, 2);
  try {
    assertMetadataOnly(output);
    if (options.output) await writeFile(options.output, output, 'utf8');
    console.log(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid metadata output');
    return 1;
  }
  return report.passed ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main().then((code) => {
    process.exitCode = code;
  });
}
