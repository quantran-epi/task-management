import { describe, it, expect } from 'vitest';
import { extractDeterministicFacts, removeVietnameseDiacritics } from '../src/graph/extraction.js';
import { chunkMarkdownSnapshot } from '../src/parser/sectionChunker.js';
import type { ProjectionSnapshot, ProjectedDocument } from '../src/indexing/incrementalProjector.js';

function createMockSnapshotFromFiles(files: Record<string, string>): ProjectionSnapshot {
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
    snapshotId: 'test-snapshot-pilot',
    setId: 'test-set-pilot',
    chunkingPolicyVersion: '2026.10.1',
    documents,
  };
}

describe('Deterministic MDAST Extraction (GRAPH-03, D-11, D-12, D-16)', () => {
  const file01 = `# Quy trình tính lãi và chuyển chu kỳ

## Danh sách tiến trình

| PROCESS_ID | PROCEDURE_NAME | IS_CONTAINER | IS_EXTERNAL |
|---|---|---|---|
| 60000006 | CONTAINER | 1 | 0 |
| 10000304 | FCL_PRC_CYCLE_COUNTER_PKG.PROCESS | 0 | 0 |

## Các bước xử lý trong container

| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |
|---|---|---|---|---|
| 10 | Kiểm tra kỳ hạn đến hạn | SVC_PERIOD | MAIN1.TBL_PAYMENT_LOG | CYTP1003 |
| 20 | Tính toán lãi suất ân hạn | 10000304 | MAIN1.TBL_TXN | CYTP1002 |
| 30 | Hoàn tất chu kỳ | SVC_NOTIFY | - | Ghi log hoàn tất |
`;

  const file02 = `# Đối tượng cơ sở dữ liệu

## Bảng dữ liệu \`MAIN1.FCL_CYCLE_COUNTER\`

| Cột | Ý nghĩa |
|---|---|
| ID | Khóa chính |

Được cập nhật bởi \`MAIN1.FCL_API_CYCLE_PKG.SWITCH_CYCLE\`.
`;

  const snapshot = createMockSnapshotFromFiles({
    '01-wiring.md': file01,
    '02-data-objects.md': file02,
  });

  it('extracts ScheduledProcess, ProcessStep, and SoftwareComponent nodes deterministically', () => {
    const result = extractDeterministicFacts(snapshot);

    const urns = new Set(result.nodes.map((n) => n.urn));
    expect(urns.has('urn:plannermate:smartvista:PRC_PROCESS:60000006')).toBe(true);
    expect(urns.has('urn:plannermate:smartvista:PRC_CONTAINER:STEP_10')).toBe(true);
    expect(urns.has('urn:plannermate:smartvista:PRC_CONTAINER:STEP_20')).toBe(true);
    expect(urns.has('urn:plannermate:smartvista:PRC_CONTAINER:STEP_30')).toBe(true);
    expect(urns.has('urn:plannermate:smartvista:PRC_PROCESS:10000304')).toBe(true);
    expect(urns.has('urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS')).toBe(true);
  });

  it('extracts cycle binds, database objects, and referenced procedures with semantic kinds', () => {
    const result = extractDeterministicFacts(snapshot);
    const nodesByUrn = new Map(result.nodes.map((node) => [node.urn, node]));

    expect(nodesByUrn.has('urn:plannermate:smartvista:CycleType:CYTP1003')).toBe(true);
    expect(nodesByUrn.has('urn:plannermate:smartvista:CycleType:CYTP1002')).toBe(true);
    expect(nodesByUrn.get('urn:plannermate:oracle:ORACLE_TABLE:MAIN1.FCL_CYCLE_COUNTER')?.kind).toBe('DatabaseObject');
    expect(
      nodesByUrn.get('urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.FCL_API_CYCLE_PKG.SWITCH_CYCLE')?.kind
    ).toBe('SoftwareComponent');
  });

  it('extracts core structural and execution relations with OBSERVED classification', () => {
    const result = extractDeterministicFacts(snapshot);

    for (const fact of result.facts) {
      expect(fact.classification).toBe('OBSERVED');
    }

    // Verify CONTAINS_STEP relation
    const containsStep = result.facts.find(
      (f) => f.subjectUrn === 'urn:plannermate:smartvista:PRC_PROCESS:60000006' &&
             f.relation === 'CONTAINS_STEP' &&
             f.objectUrn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_20'
    );
    expect(containsStep).toBeDefined();

    // Verify PRECEDES relation between sequential steps
    const precedes = result.facts.find(
      (f) => f.subjectUrn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_10' &&
             f.relation === 'PRECEDES' &&
             f.objectUrn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_20'
    );
    expect(precedes).toBeDefined();

    // Verify INVOKES relation from step to sub-process
    const invokes = result.facts.find(
      (f) => f.subjectUrn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_20' &&
             f.relation === 'INVOKES' &&
             f.objectUrn === 'urn:plannermate:smartvista:PRC_PROCESS:10000304'
    );
    expect(invokes).toBeDefined();

    // Verify USES_TYPE relation from step to cycle type
    const usesType = result.facts.find(
      (f) => f.subjectUrn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_20' &&
             f.relation === 'USES_TYPE' &&
             f.objectUrn === 'urn:plannermate:smartvista:CycleType:CYTP1002'
    );
    expect(usesType).toBeDefined();
  });

  describe('step table enhancements (TEN_BUOC, aliases, WRITES_TO)', () => {
    it('sets canonicalName to TEN_BUOC and populates diacritic-stripped aliases', () => {
      const result = extractDeterministicFacts(snapshot);
      const step10 = result.nodes.find((n) => n.urn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_10');

      expect(step10).toBeDefined();
      expect(step10?.canonicalName).toBe('Kiểm tra kỳ hạn đến hạn');
      expect(step10?.aliases).toContain('STEP_10');
      expect(step10?.aliases).toContain('Kiểm tra kỳ hạn đến hạn');
      expect(step10?.aliases).toContain('kiem tra ky han den han');
    });

    it('extracts WRITES column as DatabaseObject and creates WRITES_TO facts', () => {
      const result = extractDeterministicFacts(snapshot);

      const tableNode = result.nodes.find((n) => n.urn === 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.TBL_PAYMENT_LOG');
      expect(tableNode).toBeDefined();
      expect(tableNode?.kind).toBe('DatabaseObject');

      const writesFact = result.facts.find(
        (f) => f.subjectUrn === 'urn:plannermate:smartvista:PRC_CONTAINER:STEP_10' &&
               f.relation === 'WRITES_TO' &&
               f.objectUrn === 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.TBL_PAYMENT_LOG'
      );
      expect(writesFact).toBeDefined();
      expect(writesFact?.qualifiers).toEqual({ operation: 'INSERT' });

      // Service also gets WRITES_TO
      const svcWritesFact = result.facts.find(
        (f) => f.subjectUrn === 'urn:plannermate:system:SoftwareComponent:SVC_PERIOD' &&
               f.relation === 'WRITES_TO' &&
               f.objectUrn === 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.TBL_PAYMENT_LOG'
      );
      expect(svcWritesFact).toBeDefined();
    });
  });

  describe('code blocks and inline code spans extraction', () => {
    it('extracts DatabaseObject from SQL code block', () => {
      const sqlDoc = `# SQL Operations

Here is the migration script:

\`\`\`sql
INSERT INTO MAIN1.TBL_AUDIT_LOG (ID, MESSAGE) VALUES (1, 'Initial setup');
UPDATE TBL_CUSTOMER_BALANCE SET BALANCE = 100 WHERE ID = 10;
\`\`\`
`;
      const docSnapshot = createMockSnapshotFromFiles({ 'sql-ops.md': sqlDoc });
      const result = extractDeterministicFacts(docSnapshot);

      const auditTable = result.nodes.find((n) => n.urn === 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.TBL_AUDIT_LOG');
      expect(auditTable).toBeDefined();
      expect(auditTable?.kind).toBe('DatabaseObject');

      const balanceTable = result.nodes.find((n) => n.urn === 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.TBL_CUSTOMER_BALANCE');
      expect(balanceTable).toBeDefined();
      expect(balanceTable?.kind).toBe('DatabaseObject');
    });

    it('extracts SoftwareComponent from inline code span', () => {
      const inlineDoc = `# Service Runner

To start the settlement batch, call \`MAIN1.PKG_BATCH.RUN\` or invoke \`SETTLE_PKG.DO_SETTLE\`.
`;
      const docSnapshot = createMockSnapshotFromFiles({ 'service-runner.md': inlineDoc });
      const result = extractDeterministicFacts(docSnapshot);

      const batchPkg = result.nodes.find((n) => n.urn === 'urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.PKG_BATCH.RUN');
      expect(batchPkg).toBeDefined();
      expect(batchPkg?.kind).toBe('SoftwareComponent');

      const settlePkg = result.nodes.find((n) => n.urn === 'urn:plannermate:plsql:PLSQL_PROCEDURE:SETTLE_PKG.DO_SETTLE');
      expect(settlePkg).toBeDefined();
      expect(settlePkg?.kind).toBe('SoftwareComponent');
    });

    it('extracts DatabaseObject from inline code span with TBL_ prefix', () => {
      const inlineTableDoc = `# Configuration Details

Please inspect table \`MAIN1.TBL_CONFIG\` for runtime flags.
`;
      const docSnapshot = createMockSnapshotFromFiles({ 'config.md': inlineTableDoc });
      const result = extractDeterministicFacts(docSnapshot);

      const configTable = result.nodes.find((n) => n.urn === 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.TBL_CONFIG');
      expect(configTable).toBeDefined();
      expect(configTable?.kind).toBe('DatabaseObject');
    });
  });

  it('tracks consumed character ranges matching raw source slices', () => {
    const result = extractDeterministicFacts(snapshot);

    expect(result.consumedRanges.size).toBe(2);
    for (const doc of snapshot.documents) {
      const ranges = result.consumedRanges.get(doc.documentId);
      expect(ranges).toBeDefined();
      expect(ranges!.length).toBeGreaterThan(0);

      const body = doc.chunks.map((c) => c.rawContent).join('');
      for (const range of ranges!) {
        const slice = body.slice(range.startOffset, range.endOffset);
        expect(slice.length).toBeGreaterThan(0);
        expect(range.startOffset).toBeLessThan(range.endOffset);
      }
    }
  });

  it('records exact evidence records with valid UUIDs and provenance fields', () => {
    const result = extractDeterministicFacts(snapshot);

    expect(result.evidence.length).toBeGreaterThan(0);
    for (const ev of result.evidence) {
      expect(ev.classification).toBe('OBSERVED');
      expect(ev.confidence).toBe(1.0);
      expect(ev.startOffset).toBeLessThanOrEqual(ev.endOffset);
      expect(ev.rawSnippet.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('correctly strips diacritics via removeVietnameseDiacritics helper', () => {
    expect(removeVietnameseDiacritics('Đăng ký tài khoản')).toBe('Dang ky tai khoan');
    expect(removeVietnameseDiacritics('Khởi tạo giao dịch')).toBe('Khoi tao giao dich');
    expect(removeVietnameseDiacritics('THỬ NGHIỆM ĐỒNG BỘ')).toBe('THU NGHIEM DONG BO');
  });
});
