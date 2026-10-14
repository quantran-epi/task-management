import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { RetrievalResponseSchema, type RetrievalResponse } from '../types/retrievalProtocol.js';
import { LIVE_SCENARIOS } from './realDataAcceptance.js';

export interface CliOptions {
  endpoint: string;
  setId: string;
  token: string;
  origin: string;
  caseIds?: string[];
  strict: boolean;
  output?: string;
  timeoutMs: number;
}

export interface SmokeCase {
  id: string;
  expectedIntent: string;
  expectedFastPath: boolean;
  expectedOutcome: RetrievalResponse['outcome'];
  expectedSourceDocumentTitles?: string[];
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
  modalityStatus?: RetrievalResponse['modalityStatus'];
  degradedReasons?: string[];
  sourceTitles?: string[];
  error?: string;
}

export const SMOKE_CASES: SmokeCase[] = LIVE_SCENARIOS.map((scenario) => ({
  id: scenario.id,
  expectedIntent:
    scenario.id === 'T4'
      ? 'FLOW_TRAVERSAL'
      : scenario.id === 'T5'
        ? 'IMPACT_ANALYSIS'
        : 'LOOKUP',
  expectedFastPath: scenario.expectedFastPath ?? false,
  expectedOutcome: scenario.expectedOutcome ?? 'READY',
  ...(scenario.id === 'T1' || scenario.id === 'T12' || scenario.id === 'T15'
    ? { expectedSourceDocumentTitles: ['02-data-objects.md', '02 — Data objects'] }
    : {}),
  ...(scenario.requirePath ? { requirePath: true } : {}),
}));

const QUERY_BY_CASE_ID = new Map(LIVE_SCENARIOS.map((scenario) => [scenario.id, scenario.query]));

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      endpoint: { type: 'string' },
      'set-id': { type: 'string' },
      token: { type: 'string' },
      origin: { type: 'string' },
      cases: { type: 'string' },
      strict: { type: 'boolean', default: false },
      output: { type: 'string' },
      timeout: { type: 'string', default: '15000' },
    },
    strict: true,
    allowPositionals: false,
  });

  const endpoint = values.endpoint?.trim();
  const setId = values['set-id']?.trim();
  const token = values.token?.trim();
  const origin = values.origin?.trim();
  const timeoutMs = Number(values.timeout);
  const rawCases = values.cases?.trim();
  const caseIds = rawCases ? rawCases.split(',').map((c) => c.trim()).filter(Boolean) : undefined;
  if (!endpoint || !setId || !token || !origin || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    throw new Error('Usage: --endpoint <url> --set-id <uuid> --token <value> --origin <url> [--cases <T1,T2>] [--strict] [--output <file>] [--timeout <ms>]');
  }

  new URL(endpoint);
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin) {
    throw new Error('--origin must be an exact origin without path or trailing slash.');
  }
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    setId,
    token,
    origin,
    ...(caseIds ? { caseIds } : {}),
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
  if (response.planTrace.intent !== caseDef.expectedIntent) {
    throw new Error(`Expected intent ${caseDef.expectedIntent}, got ${response.planTrace.intent ?? 'missing'}`);
  }
  if (
    caseDef.expectedSourceDocumentTitles &&
    !response.items.some(
      (item) =>
        item.type === 'chunk' &&
        caseDef.expectedSourceDocumentTitles!.includes(item.sourceDocumentTitle)
    )
  ) {
    throw new Error(`Expected citation from ${caseDef.expectedSourceDocumentTitles.join(' or ')}`);
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
      headers: {
        Authorization: `Bearer ${options.token}`,
        Origin: options.origin,
        'Content-Type': 'application/json',
        'X-Correlation-ID': crypto.randomUUID(),
      },
      body: JSON.stringify({
        query: QUERY_BY_CASE_ID.get(caseDef.id) ?? caseDef.id,
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

function safeResponseMetadata(parsed: RetrievalResponse): Omit<SmokeResult, 'id' | 'passed' | 'latencyMs' | 'error'> {
  return {
    outcome: parsed.outcome,
    intent: String(parsed.planTrace.intent ?? ''),
    fastPath: parsed.planTrace.fastPath,
    itemCount: parsed.items.length,
    snapshotId: parsed.snapshotId,
    modalityStatus: parsed.modalityStatus,
    ...(parsed.diagnostics.degradedReasons
      ? { degradedReasons: [...parsed.diagnostics.degradedReasons] }
      : {}),
    sourceTitles: [
      ...new Set(
        parsed.items
          .filter((item) => item.type === 'chunk')
          .map((item) => item.sourceDocumentTitle)
      ),
    ],
  };
}

export async function runAcceptanceCli(options: CliOptions): Promise<{ passed: boolean; results: SmokeResult[] }> {
  const results: SmokeResult[] = [];
  const selectedCases = options.caseIds && options.caseIds.length > 0
    ? SMOKE_CASES.filter((c) => options.caseIds!.includes(c.id))
    : SMOKE_CASES;
  for (const caseDef of selectedCases) {
    const startedAt = Date.now();
    let parsed: RetrievalResponse | undefined;
    try {
      parsed = await fetchCase(options, caseDef);
      // Scenario expectations define acceptance. A schema-valid but semantically wrong
      // response must never be reported as passed, even when --strict is omitted.
      assertStrict(caseDef, parsed);
      results.push({
        id: caseDef.id,
        passed: true,
        latencyMs: Date.now() - startedAt,
        ...safeResponseMetadata(parsed),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      results.push({
        id: caseDef.id,
        passed: false,
        latencyMs: Date.now() - startedAt,
        ...(parsed ? safeResponseMetadata(parsed) : {}),
        error: message.replaceAll(options.token, '[REDACTED]'),
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

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';
const isDirectRun =
  currentFile === invokedFile ||
  invokedFile.endsWith('cli.ts') ||
  invokedFile.endsWith('cli.js');

if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code;
  });
}
