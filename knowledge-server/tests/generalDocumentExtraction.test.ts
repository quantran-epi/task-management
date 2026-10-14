import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDeterministicFacts } from '../src/graph/extraction.js';
import { chunkMarkdownSnapshot } from '../src/parser/sectionChunker.js';
import type { ProjectionSnapshot, ProjectedDocument } from '../src/indexing/incrementalProjector.js';
import {
  ResolvedNode,
  FactAssertion,
  GraphEvidenceRecord,
  GraphNodeSchema,
  GraphEvidenceRecordSchema,
} from '../src/types/graphProtocol.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { collectUncoveredProse, extractProseCandidatesOnce } from '../src/ai/proseExtraction.js';

function createMockSnapshotFromFiles(files: Record<string, string>, setId = 'test-set'): ProjectionSnapshot {
  const documents: ProjectedDocument[] = Object.entries(files).map(([name, content], idx) => {
    const docId = `00000000-0000-4000-8000-${(idx + 1).toString().padStart(12, '0')}`;
    const chunks = chunkMarkdownSnapshot(docId, content).map((c) => ({
      occurrenceId: c.occurrenceId,
      representationId: c.contentHash,
      contentHash: c.contentHash,
      chunkIndex: c.chunkIndex,
      headingPath: c.headingPath,
      startLine: c.startLine,
      endLine: c.endLine,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      rawContent: c.rawContent,
    }));

    return {
      documentId: docId,
      title: name,
      contentHash: `hash-${idx}`,
      chunks,
    };
  });

  return {
    snapshotId: `snapshot-${setId}`,
    setId,
    chunkingPolicyVersion: '2026.10.1',
    documents,
  };
}

describe('General Document Extraction (BUILD-05, D-16)', () => {
  describe('Zero Hardcoded Constants (no-constants)', () => {
    it('contains zero hardcoded banking procedure names or pilot constants in extraction.ts', () => {
      const extractionTsPath = path.resolve(process.cwd(), 'src/graph/extraction.ts');
      const content = fs.readFileSync(extractionTsPath, 'utf-8');

      // Specific pilot procedures and tables that must NOT be hardcoded
      expect(content).not.toMatch(/PRC_FCL_CALCULATE_LIMIT/i);
      expect(content).not.toMatch(/CRD_PRC_BILLING_PKG/i);
      expect(content).not.toMatch(/FCL_PRC_CYCLE_COUNTER_PKG/i);
      expect(content).not.toMatch(/update_cycle_counter/i);
      expect(content).not.toMatch(/60000006/);
      expect(content).not.toMatch(/Hạch toán/i);
      expect(content).not.toMatch(/Chu kỳ tính lãi/i);
    });
  });

  describe('Dynamic Schema-Driven Table Parsing (schema)', () => {
    it('extracts process and step relations from English workflow tables', () => {
      const orderDoc = `# Order Processing System

## Order Fulfillment Pipeline

| Step ID | Action | Target | Order | Description |
|---|---|---|---|---|
| STEP_10 | VALIDATE | SVC_INVENTORY | 10 | Validate inventory availability |
| STEP_20 | CHARGE | SVC_PAYMENT | 20 | Charge credit card |
| STEP_30 | NOTIFY | SVC_NOTIFICATION | 30 | Send receipt email |
`;

      const snapshot = createMockSnapshotFromFiles({ 'order-workflow.md': orderDoc });
      const result = extractDeterministicFacts(snapshot);

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.facts.length).toBeGreaterThan(0);

      // Verifies step nodes were created
      const stepNodes = result.nodes.filter((n) => n.kind === 'ProcessStep');
      expect(stepNodes.length).toBe(3);

      // Verifies precedes relations were created between steps
      const precedesFacts = result.facts.filter((f) => f.relation === 'PRECEDES');
      expect(precedesFacts.length).toBe(2);
    });

    it('extracts entities and relations from Vietnamese workflow tables', () => {
      const vnDoc = `# Quy trình thanh toán

## Các bước xử lý

| Mã bước | Thao tác | Đối tượng | Thứ tự | Ghi chú |
|---|---|---|---|---|
| B10 | KIEM_TRA | KHO_HANG | 1 | Kiểm tra tồn kho |
| B20 | TRU_TIEN | CONG_THANH_TOAN | 2 | Trừ tiền tài khoản |
`;

      const snapshot = createMockSnapshotFromFiles({ 'quy-trinh.md': vnDoc });
      const result = extractDeterministicFacts(snapshot);

      expect(result.nodes.length).toBeGreaterThan(0);
      const stepNodes = result.nodes.filter((n) => n.kind === 'ProcessStep');
      expect(stepNodes.length).toBe(2);
    });
  });

  describe('Prose and Table-less Document Extraction (prose|table-less)', () => {
    it('extracts uncovered prose segments and supports bounded LLM prose extraction', async () => {
      const tablelessDoc = `# System Architecture Overview

The PaymentGateway service calls the LedgerService during the checkout flow.

The LedgerService reads from the ACCOUNTS table to verify balances.
`;

      const snapshot = createMockSnapshotFromFiles({ 'architecture.md': tablelessDoc });
      const detResult = extractDeterministicFacts(snapshot);

      // Table-less doc has 0 table facts
      expect(detResult.facts.length).toBe(0);

      // Uncovered prose collection extracts the paragraphs
      const proseSegments = collectUncoveredProse(snapshot, detResult.consumedRanges);
      expect(proseSegments.length).toBe(2);
      expect(proseSegments[0]?.text).toContain('PaymentGateway');

      // Fake LLM fetch response
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      subjectUrn: 'urn:plannermate:system:SoftwareComponent:PaymentGateway',
                      relation: 'CALLS',
                      objectUrn: 'urn:plannermate:system:SoftwareComponent:LedgerService',
                      qualifiers: {},
                      evidence: {
                        segmentId: proseSegments[0]!.segmentId,
                        startOffset: proseSegments[0]!.text.indexOf('PaymentGateway service calls the LedgerService'),
                        endOffset: proseSegments[0]!.text.indexOf('PaymentGateway service calls the LedgerService') + 'PaymentGateway service calls the LedgerService'.length,
                        quote: 'PaymentGateway service calls the LedgerService',
                      },
                      confidence: 0.95,
                    },
                  ],
                }),
              },
            },
          ],
        }),
      });

      const endpoints: ResolvedNode[] = [
        {
          urn: 'urn:plannermate:system:SoftwareComponent:PaymentGateway',
          kind: 'SoftwareComponent',
          canonicalName: 'PaymentGateway',
          sourceSystem: 'system',
          nativeType: 'Service',
          normalizedKey: 'PaymentGateway',
          properties: {},
          aliases: [],
        },
        {
          urn: 'urn:plannermate:system:SoftwareComponent:LedgerService',
          kind: 'SoftwareComponent',
          canonicalName: 'LedgerService',
          sourceSystem: 'system',
          nativeType: 'Service',
          normalizedKey: 'LedgerService',
          properties: {},
          aliases: [],
        },
      ];

      const proseResult = await extractProseCandidatesOnce({
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        segments: proseSegments,
        resolvedEndpoints: endpoints,
        fetchFn: mockFetch as any,
      });

      expect(proseResult.facts.length).toBe(1);
      expect(proseResult.facts[0]?.classification).toBe('INFERRED');
      expect(proseResult.evidence.length).toBe(1);
      expect(proseResult.evidence[0]?.rawSnippet).toBe('PaymentGateway service calls the LedgerService');
      expect(proseResult.evidence[0]?.startOffset).toBeGreaterThan(0);
    });
  });

  describe('Comprehensive End-to-End Extraction (BUILD-05, D-16)', () => {
    it('extracts non-SHB microservice call chain fixture cleanly and satisfies schema validation', () => {
      const doc = `# Payment Service Architecture

## Order Workflow

| Step ID | Thao tác | Target | Thứ tự | Note |
|---|---|---|---|---|
| STEP_AUTH | AUTHORIZE | SVC_PAYMENT | 1 | Authenticate and hold funds |
| STEP_SETTLE | CAPTURE | SVC_SETTLEMENT | 2 | Settle transaction |

## Status Codes

| Code | Name |
|---|---|
| PRSR0001 | In progress |
| READY | System ready |
`;

      const snapshot = createMockSnapshotFromFiles({ 'payment-service.md': doc });
      const result = extractDeterministicFacts(snapshot);

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.facts.length).toBeGreaterThan(0);

      const statusNodes = result.nodes.filter((n) => n.kind === 'Status');
      expect(statusNodes.length).toBe(2);

      const stepNodes = result.nodes.filter((n) => n.kind === 'ProcessStep');
      expect(stepNodes.length).toBe(2);

      const precedesFacts = result.facts.filter((f) => f.relation === 'PRECEDES');
      expect(precedesFacts.length).toBe(1);

      // Verify all facts have valid subjects and objects
      const knownNodeUrns = new Set(result.nodes.map((n) => n.urn));
      for (const fact of result.facts) {
        expect(knownNodeUrns.has(fact.subjectUrn)).toBe(true);
        expect(knownNodeUrns.has(fact.objectUrn)).toBe(true);
      }

      // Schema validation for all nodes and evidence records
      for (const node of result.nodes) {
        expect(() => GraphNodeSchema.parse(node)).not.toThrow();
      }
      for (const ev of result.evidence) {
        expect(() => GraphEvidenceRecordSchema.parse(ev)).not.toThrow();
        expect(ev.startOffset).toBeLessThanOrEqual(ev.endOffset);
        const slice = doc.slice(ev.startOffset, ev.endOffset);
        expect(slice).toContain(ev.rawSnippet);
      }
    });
  });
});

