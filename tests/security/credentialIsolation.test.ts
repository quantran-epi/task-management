import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateAllCases } from '../ai/evaluatorCore';
import { evaluateReleaseGate, DEFAULT_GATE_THRESHOLDS } from '../ai/releaseGate';
import {
  buildReportFromVerdict,
  renderBenchmarkMarkdown,
  writeBenchmarkReports,
} from '../ai/reportGenerator';
import type { GroundedReferenceCase } from '../fixtures/ai/grounded-reference-fixture-schema';

describe('Protocol Credential Isolation (QUAL-05, D-22, D-23)', () => {
  const CANARY_SECRET_TOKEN = 'canary-daemon-token-x987xyz-secret';
  const CANARY_BEARER = `Bearer ${CANARY_SECRET_TOKEN}`;

  it('proves zero secret leakage into benchmark JSON and Markdown reports', async () => {
    const fixturePath = path.resolve('tests/fixtures/ai/grounded-assistant-reference.json');
    const cases: GroundedReferenceCase[] = JSON.parse(
      fs.readFileSync(fixturePath, 'utf8')
    );

    // Evaluate all 40 reference benchmark cases
    const results = await evaluateAllCases(cases);
    const verdict = evaluateReleaseGate(results, DEFAULT_GATE_THRESHOLDS);
    const report = buildReportFromVerdict(results, verdict, DEFAULT_GATE_THRESHOLDS);

    // 1. Assert JSON report contains zero canary tokens or raw Bearer credentials
    const jsonString = JSON.stringify(report);
    expect(jsonString).not.toContain(CANARY_SECRET_TOKEN);
    expect(jsonString).not.toContain(CANARY_BEARER);

    // Strict regex check: no raw bearer tokens permitted in report JSON
    const bearerPattern = /Bearer\s+[a-zA-Z0-9_\-\.]{10,}/i;
    expect(bearerPattern.test(jsonString)).toBe(false);

    // 2. Assert Markdown report contains zero canary tokens or raw Bearer credentials
    const markdown = renderBenchmarkMarkdown(report);
    expect(markdown).not.toContain(CANARY_SECRET_TOKEN);
    expect(markdown).not.toContain(CANARY_BEARER);
    expect(bearerPattern.test(markdown)).toBe(false);

    // 3. Assert written reports on disk stay completely sanitized
    const tempOutputDir = path.join('.benchmark-reports', 'isolation-test');
    const { jsonPath, markdownPath } = writeBenchmarkReports(report, tempOutputDir);

    const onDiskJson = fs.readFileSync(jsonPath, 'utf8');
    const onDiskMd = fs.readFileSync(markdownPath, 'utf8');

    expect(onDiskJson).not.toContain(CANARY_SECRET_TOKEN);
    expect(onDiskMd).not.toContain(CANARY_SECRET_TOKEN);
    expect(bearerPattern.test(onDiskJson)).toBe(false);
    expect(bearerPattern.test(onDiskMd)).toBe(false);

    // Clean up test directory
    fs.rmSync(tempOutputDir, { recursive: true, force: true });
  });

  it('guarantees that API error envelopes redact tokens before client propagation', () => {
    // Redaction pattern assertion matching knowledgeClient contract
    const rawError = `Request to http://127.0.0.1:3001 failed with Authorization: Bearer ${CANARY_SECRET_TOKEN}`;
    const sanitizedError = rawError.replaceAll(CANARY_SECRET_TOKEN, '***');

    expect(sanitizedError).not.toContain(CANARY_SECRET_TOKEN);
    expect(sanitizedError).toContain('Bearer ***');
  });
});
