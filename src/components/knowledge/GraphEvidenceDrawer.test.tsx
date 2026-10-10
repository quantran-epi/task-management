// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphEvidenceDrawer } from './GraphEvidenceDrawer';
import type {
  FactSummary,
  FactEvidenceDetailResponse,
  QuarantineItem,
} from '../../services/knowledge/knowledgeClient';

describe('GraphEvidenceDrawer (GRAPH-05, D-17, D-18, UI Spec)', () => {
  const setId = 'set-pilot-1';
  const factKey1 = '1111111111111111111111111111111111111111111111111111111111111111';
  const factKey2 = '2222222222222222222222222222222222222222222222222222222222222222';
  const factKeyConflict = '3333333333333333333333333333333333333333333333333333333333333333';

  const mockFacts: FactSummary[] = [
    {
      factKey: factKey1,
      subjectUrn: 'urn:plannermate:smartvista:PRC_PROCESS:60000006',
      subjectName: 'SHB - Credit calculations',
      subjectKind: 'ScheduledProcess',
      relation: 'CONTAINS_STEP',
      objectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
      objectName: 'Step 2 - Billing step',
      objectKind: 'ProcessStep',
      effectiveClassification: 'OBSERVED',
      evidenceCount: 1,
      hasConflict: false,
      qualifiers: {},
    },
    {
      factKey: factKey2,
      subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
      subjectName: 'Step 2 - Billing step',
      subjectKind: 'ProcessStep',
      relation: 'INVOKES',
      objectUrn: 'urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.CRD_PRC_BILLING_PKG.PROCESS',
      objectName: 'MAIN1.CRD_PRC_BILLING_PKG.PROCESS',
      objectKind: 'SoftwareComponent',
      effectiveClassification: 'INFERRED',
      evidenceCount: 1,
      hasConflict: false,
      qualifiers: {},
    },
    {
      factKey: factKeyConflict,
      subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
      subjectName: 'Step 2 - Billing step',
      subjectKind: 'ProcessStep',
      relation: 'HAS_STATUS',
      objectUrn: 'urn:plannermate:smartvista:Status:READY',
      objectName: 'READY - Sẵn sàng',
      objectKind: 'Status',
      effectiveClassification: 'BUSINESS_APPROVED',
      evidenceCount: 2,
      hasConflict: true,
      qualifiers: {},
    },
  ];

  const mockEvidenceDetails: Record<string, FactEvidenceDetailResponse> = {
    [factKey1]: {
      setId,
      factKey: factKey1,
      subjectUrn: 'urn:plannermate:smartvista:PRC_PROCESS:60000006',
      relation: 'CONTAINS_STEP',
      objectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
      effectiveClassification: 'OBSERVED',
      hasConflict: false,
      qualifiers: {},
      occurrences: [
        {
          evidenceId: 'e1111111-1111-4111-8111-111111111111',
          documentId: 'd1111111-1111-4111-8111-111111111111',
          documentTitle: '01-prc-process.md',
          headingPath: ['Process definition', 'Steps'],
          startLine: 15,
          endLine: 18,
          startOffset: 120,
          endOffset: 180,
          method: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          confidence: 1,
          quote: '| 60000006 | Step 2 | BIND_02 |',
        },
      ],
    },
    [factKey2]: {
      setId,
      factKey: factKey2,
      subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
      relation: 'INVOKES',
      objectUrn: 'urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.CRD_PRC_BILLING_PKG.PROCESS',
      effectiveClassification: 'INFERRED',
      hasConflict: false,
      qualifiers: {},
      occurrences: [
        {
          evidenceId: 'e2222222-2222-4222-8222-222222222222',
          documentId: 'd2222222-2222-4222-8222-222222222222',
          documentTitle: '02-steps.md',
          headingPath: ['Prose overview'],
          startLine: 45,
          endLine: 47,
          startOffset: 450,
          endOffset: 520,
          method: 'LLM_PROSE',
          classification: 'INFERRED',
          confidence: 0.95,
          quote: 'Bước 2 gọi thực thi thủ tục CRD_PRC_BILLING_PKG trong chu kỳ',
        },
      ],
    },
    [factKeyConflict]: {
      setId,
      factKey: factKeyConflict,
      subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
      relation: 'HAS_STATUS',
      objectUrn: 'urn:plannermate:smartvista:Status:READY',
      effectiveClassification: 'BUSINESS_APPROVED',
      hasConflict: true,
      qualifiers: {},
      occurrences: [
        {
          evidenceId: 'e3333333-3333-4333-8333-333333333333',
          documentId: 'd1111111-1111-4111-8111-111111111111',
          documentTitle: '01-prc-process.md',
          headingPath: ['Status'],
          startLine: 60,
          endLine: 61,
          startOffset: 600,
          endOffset: 650,
          method: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          confidence: 1,
          quote: 'Status: READY',
          conflictBranch: 'A',
        },
        {
          evidenceId: 'e4444444-4444-4444-8444-444444444444',
          documentId: 'd2222222-2222-4222-8222-222222222222',
          documentTitle: '02-steps.md',
          headingPath: ['Overrides'],
          startLine: 85,
          endLine: 86,
          startOffset: 850,
          endOffset: 900,
          method: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          confidence: 1,
          quote: 'Status: PRSR0003 (FAILED)',
          conflictBranch: 'B',
        },
      ],
    },
  };

  const mockQuarantines: QuarantineItem[] = [
    {
      rawIdentifier: 'UNQUALIFIED_TAB',
      reason: 'Unqualified identifier without proven default schema context',
      documentId: 'd1111111-1111-4111-8111-111111111111',
      headingPath: ['Tables'],
      startLine: 90,
      endLine: 91,
      method: 'DETERMINISTIC_TABLE',
      candidateMatches: ['MAIN1.UNQUALIFIED_TAB'],
    },
  ];

  it('renders distinct visual treatments for OBSERVED, INFERRED, and BUSINESS_APPROVED (D-17)', () => {
    render(
      <GraphEvidenceDrawer
        open={true}
        setId={setId}
        onClose={vi.fn()}
        facts={mockFacts}
        evidenceDetailsByFactKey={mockEvidenceDetails}
        quarantines={mockQuarantines}
      />
    );

    // Classification labels visible in table tags
    const observedTags = screen.getAllByText('Quan sát trực tiếp');
    expect(observedTags.length).toBeGreaterThanOrEqual(1);

    const inferredTags = screen.getAllByText('Suy luận');
    expect(inferredTags.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Đã phê duyệt nghiệp vụ')).toBeInTheDocument();
  });

  it('renders conflict status badge for rows with direct contradiction (D-12, D-18)', () => {
    render(
      <GraphEvidenceDrawer
        open={true}
        setId={setId}
        onClose={vi.fn()}
        facts={mockFacts}
        evidenceDetailsByFactKey={mockEvidenceDetails}
        quarantines={mockQuarantines}
      />
    );

    expect(screen.getByText('Mâu thuẫn')).toBeInTheDocument();
  });

  it('expanding row reveals exact source document, heading path, line range, and extraction method', async () => {
    render(
      <GraphEvidenceDrawer
        open={true}
        setId={setId}
        onClose={vi.fn()}
        facts={mockFacts}
        evidenceDetailsByFactKey={mockEvidenceDetails}
        quarantines={mockQuarantines}
      />
    );

    // Click on the first row cell to expand (expandRowByClick enabled)
    const firstRowSubject = screen.getByText('SHB - Credit calculations');
    fireEvent.click(firstRowSubject);

    await waitFor(() => {
      expect(screen.getByText('01-prc-process.md')).toBeInTheDocument();
      expect(screen.getByText('Dòng 15–18')).toBeInTheDocument();
      expect(screen.getByText('Quy tắc có cấu trúc')).toBeInTheDocument();
      expect(screen.getByText('"| 60000006 | Step 2 | BIND_02 |"')).toBeInTheDocument();
    });
  });

  it('renders quarantined identifiers in the dedicated quarantine tab (D-08, D-16)', async () => {
    render(
      <GraphEvidenceDrawer
        open={true}
        setId={setId}
        onClose={vi.fn()}
        facts={mockFacts}
        evidenceDetailsByFactKey={mockEvidenceDetails}
        quarantines={mockQuarantines}
      />
    );

    const quarantineTab = screen.getByRole('tab', { name: /Định danh cách ly/ });
    expect(quarantineTab).toBeInTheDocument();

    fireEvent.click(quarantineTab);

    await waitFor(() => {
      expect(screen.getByText('UNQUALIFIED_TAB')).toBeInTheDocument();
      expect(
        screen.getByText('Unqualified identifier without proven default schema context')
      ).toBeInTheDocument();
      expect(screen.getByText('MAIN1.UNQUALIFIED_TAB')).toBeInTheDocument();
    });
  });
});
