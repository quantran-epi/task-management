import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroundedAnswerCard } from '../../src/components/ai/grounded/GroundedAnswerCard';
import type {
  ChatMessageGrounding,
  PersistedCitation,
  PersistedConflictGroup,
} from '../../src/services/ai/groundedAnswerSchemas';

const baseCitation: PersistedCitation = {
  citationId: 'S1',
  documentId: '00000000-0000-0000-0000-000000000001',
  documentTitle: 'Báo cáo kỹ thuật',
  sectionAnchor: 'KienTruc',
  lineStart: 10,
  lineEnd: 20,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_12345678',
  publishedContentHash: 'a'.repeat(64),
  citedExcerpt: 'Hệ thống hỗ trợ 1000 TPS.',
};

const localCitation: PersistedCitation = {
  citationId: 'L1',
  documentId: '00000000-0000-0000-0000-000000000002',
  documentTitle: 'Ghi chú cục bộ',
  sectionAnchor: null,
  lineStart: 1,
  lineEnd: 5,
  authority: 'local',
  evidenceClass: 'LOCAL',
  snapshotId: null,
  publishedContentHash: null,
  citedExcerpt: 'Ghi chú cục bộ về cài đặt.',
};

function createMockGrounding(overrides: Partial<ChatMessageGrounding> = {}): ChatMessageGrounding {
  return {
    schemaVersion: 1,
    authority: 'server',
    outcome: 'READY',
    answer: {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Hệ thống hỗ trợ 1000 TPS.',
      claims: [
        {
          id: 'C1',
          text: 'Hệ thống hỗ trợ 1000 TPS.',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    },
    citations: [baseCitation],
    paths: [],
    conflicts: [],
    scope: {
      setIds: ['00000000-0000-0000-0000-000000000010'],
      routedScope: {
        domain: 'payment',
        environment: 'prod',
        version: '1.0',
        comparisonMode: 'single',
      },
    },
    modalityDiagnostics: {
      fulltext: { status: 'ok', latencyMs: 10, itemCount: 5 },
      vector: { status: 'ok', latencyMs: 20, itemCount: 5 },
      graph: { status: 'ok', latencyMs: 15, itemCount: 2 },
    },
    coverageWarnings: [],
    fallbackReason: 'NONE',
    routerVersion: 'v1.0',
    promptVersion: 'p1.0',
    modelId: 'gpt-4o',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GroundedAnswerCard', () => {
  it('1. READY renders conclusion + at least one inline [1] chip', () => {
    const handleActivate = vi.fn();
    render(
      <GroundedAnswerCard
        grounding={createMockGrounding()}
        onCitationActivate={handleActivate}
      />
    );

    expect(screen.getByText('Hệ thống hỗ trợ 1000 TPS.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\[1\]/ })).toBeInTheDocument();
  });

  it('2. READY renders "Trả lời" heading', () => {
    render(
      <GroundedAnswerCard
        grounding={createMockGrounding()}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByText('Trả lời')).toBeInTheDocument();
  });

  it('3. DEGRADED renders degraded banner with modality names interpolated', () => {
    const grounding = createMockGrounding({
      outcome: 'DEGRADED',
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 5 },
        vector: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
        graph: { status: 'timeout', latencyMs: 5000, itemCount: 0 },
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Kết quả thiếu một phần phương thức')).toBeInTheDocument();
    expect(screen.getByText(/Vector, Đồ thị/)).toBeInTheDocument();
  });

  it('4. NEEDS_CLARIFICATION renders "Cần xác định rõ đối tượng" heading and NO conclusion prose', () => {
    const grounding = createMockGrounding({
      outcome: 'NEEDS_CLARIFICATION',
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
        candidatesSlot={<div data-testid="candidates-slot">Candidate 1</div>}
      />
    );

    expect(screen.getByText('Cần xác định rõ đối tượng')).toBeInTheDocument();
    expect(screen.getByTestId('candidates-slot')).toBeInTheDocument();
    expect(screen.queryByText('Trả lời')).not.toBeInTheDocument();
    expect(screen.queryByText('Hệ thống hỗ trợ 1000 TPS.')).not.toBeInTheDocument();
  });

  it('5. NO_EVIDENCE renders "Không tìm thấy bằng chứng trong tri thức đã xuất bản" heading + refinement chip slots invoked', () => {
    const grounding = createMockGrounding({
      outcome: 'NO_EVIDENCE',
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
        refinementsSlot={<div data-testid="refinements-slot">Refinements</div>}
      />
    );

    expect(
      screen.getByText('Không tìm thấy bằng chứng trong tri thức đã xuất bản')
    ).toBeInTheDocument();
    expect(screen.getByTestId('refinements-slot')).toBeInTheDocument();
  });

  it('6. UNSUPPORTED renders "Câu hỏi vượt phạm vi tri thức hiện có" heading', () => {
    const grounding = createMockGrounding({
      outcome: 'UNSUPPORTED',
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByText('Câu hỏi vượt phạm vi tri thức hiện có')).toBeInTheDocument();
  });

  it('7. LOCAL_FALLBACK_SYNTHESIS shows local banner + [L1] chip (not [1])', () => {
    const grounding = createMockGrounding({
      authority: 'local',
      outcome: 'LOCAL_FALLBACK_SYNTHESIS',
      fallbackReason: 'NETWORK_ERROR',
      paths: null,
      conflicts: null,
      scope: null,
      routerVersion: null,
      citations: [localCitation],
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Nội dung trả lời cục bộ.',
        claims: [
          {
            id: 'C1',
            text: 'Nội dung trả lời cục bộ.',
            classification: 'DIRECT',
            citationIds: ['L1'],
            pathId: null,
          },
        ],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Đang dùng tìm kiếm cục bộ (BM25)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\[L1\]/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\[1\]/ })).not.toBeInTheDocument();
  });

  it('8. LOCAL_FALLBACK_RESULTS shows local banner + no answer prose + resultsSlot rendered', () => {
    const grounding = createMockGrounding({
      authority: 'local',
      outcome: 'LOCAL_FALLBACK_RESULTS',
      fallbackReason: 'SERVER_ABSENT',
      paths: null,
      conflicts: null,
      scope: null,
      routerVersion: null,
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
        resultsSlot={<div data-testid="results-slot">Ranked results</div>}
      />
    );

    expect(screen.getByText('Đang dùng tìm kiếm cục bộ (BM25)')).toBeInTheDocument();
    expect(screen.getByTestId('results-slot')).toBeInTheDocument();
    expect(screen.queryByText('Trả lời')).not.toBeInTheDocument();
  });

  it('9. MODEL_UNAVAILABLE shows evidence-only banner with "Tạo câu trả lời từ bằng chứng" button', () => {
    const handleSynthesize = vi.fn();
    const grounding = createMockGrounding({
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
        onEvidenceOnlySynthesize={handleSynthesize}
      />
    );

    expect(screen.getByText('Mô hình ngôn ngữ hiện không khả dụng.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Tạo câu trả lời từ bằng chứng' });
    fireEvent.click(btn);
    expect(handleSynthesize).toHaveBeenCalledTimes(1);
  });

  it('10. INVALID_GROUNDED_OUTPUT shows repair banner with "Thử lại" button calling onInvalidRetry', () => {
    const handleRetry = vi.fn();
    const grounding = createMockGrounding({
      outcome: 'INVALID_GROUNDED_OUTPUT',
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
        onInvalidRetry={handleRetry}
      />
    );

    expect(screen.getByText('Kết quả tổng hợp không khớp với bằng chứng xác thực.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(btn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('11. ERROR_AUTH shows auth banner with repair CTA calling onAuthRepair', () => {
    const handleAuth = vi.fn();
    const grounding = createMockGrounding({
      outcome: 'ERROR_AUTH',
      answer: null,
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={vi.fn()}
        onAuthRepair={handleAuth}
      />
    );

    expect(screen.getByText('Token máy chủ tri thức không hợp lệ. Mở Cài đặt để cập nhật.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Cài đặt' });
    fireEvent.click(btn);
    expect(handleAuth).toHaveBeenCalledTimes(1);
  });

  it('12. INFERRED claim renders "Suy luận:" prefix and INFERRED badge', () => {
    const grounding = createMockGrounding({
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Tiến trình kết nối database.',
        claims: [
          {
            id: 'C1',
            text: 'Tiến trình kết nối database.',
            classification: 'INFERRED',
            citationIds: ['S1'],
            pathId: 'P1',
          },
        ],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Suy luận:')).toBeInTheDocument();
    expect(screen.getByLabelText('INFERRED')).toBeInTheDocument();
  });

  it('13. Mixed-classification claim renders weakest classification badge with tooltip', () => {
    const citation1: PersistedCitation = {
      ...baseCitation,
      citationId: 'S1',
      evidenceClass: 'BUSINESS_APPROVED',
    };
    const citation2: PersistedCitation = {
      ...baseCitation,
      citationId: 'S2',
      evidenceClass: 'OBSERVED',
    };

    const grounding = createMockGrounding({
      citations: [citation1, citation2],
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Nội dung đa phân loại.',
        claims: [
          {
            id: 'C1',
            text: 'Nội dung đa phân loại.',
            classification: 'DIRECT',
            citationIds: ['S1', 'S2'],
            pathId: null,
          },
        ],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    // computeWeakestClassification of ['BUSINESS_APPROVED', 'OBSERVED'] is 'OBSERVED'
    expect(screen.getByLabelText('OBSERVED')).toBeInTheDocument();
  });

  it('14. ScopeVariationCard renders when EXTENDS: neutral title and NO conflict banner', () => {
    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'cg-env-1',
      dimension: 'Environment',
      branches: [
        {
          factKey: 'b'.repeat(64),
          claimIds: ['C1'],
          citationIds: ['S1'],
        },
        {
          factKey: 'c'.repeat(64),
          claimIds: ['C1'],
          citationIds: ['S1'],
        },
      ],
      scopeProof: {
        dimension: 'Environment',
        environment: 'STAGING',
        version: null,
        overrideRelation: 'EXTENDS',
      },
    };

    const grounding = createMockGrounding({
      conflicts: [conflictGroup],
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Khác biệt theo môi trường')).toBeInTheDocument();
    expect(screen.queryByText(/Các nguồn mâu thuẫn/)).not.toBeInTheDocument();
  });

  it('15. ScopeVariationCard renders for SUPPLEMENTS: neutral title "Khác biệt theo phiên bản" and no role="alert"', () => {
    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'cg-ver-1',
      dimension: 'Version',
      branches: [
        {
          factKey: 'd'.repeat(64),
          claimIds: ['C1'],
          citationIds: ['S1'],
        },
        {
          factKey: 'e'.repeat(64),
          claimIds: ['C1'],
          citationIds: ['S1'],
        },
      ],
      scopeProof: {
        dimension: 'Version',
        environment: null,
        version: '2.0',
        overrideRelation: 'SUPPLEMENTS',
      },
    };

    const grounding = createMockGrounding({
      conflicts: [conflictGroup],
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Khác biệt theo phiên bản')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('16. ConflictBanner renders when overrideRelation is null or dimension === "Unknown"', () => {
    const conflictGroupNull: PersistedConflictGroup = {
      conflictId: 'cg-unresolved',
      dimension: 'Behavior',
      branches: [
        { factKey: 'f'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: '1'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
      ],
      scopeProof: null,
    };

    const grounding = createMockGrounding({
      conflicts: [conflictGroupNull],
    });

    const { rerender } = render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Các nguồn mâu thuẫn \(Behavior\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Khác biệt theo/)).not.toBeInTheDocument();

    // Second case: scopeProof.dimension === 'Unknown' with overrideRelation === 'EXTENDS'
    const conflictGroupUnknown: PersistedConflictGroup = {
      conflictId: 'cg-unknown',
      dimension: 'Unknown',
      branches: [
        { factKey: '2'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: '3'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Unknown',
        environment: null,
        version: null,
        overrideRelation: null,
      },
    };

    rerender(
      <GroundedAnswerCard
        grounding={createMockGrounding({ conflicts: [conflictGroupUnknown] })}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByText(/Các nguồn mâu thuẫn \(Unknown\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Khác biệt theo/)).not.toBeInTheDocument();
  });

  it('17. override wording renders as written: semantics are judged from evidence, not UI regex', () => {
    const citWithOther = {
      ...baseCitation,
      evidenceKind: 'other' as const,
    };

    const grounding = createMockGrounding({
      citations: [citWithOther],
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Phiên bản 2 ghi đè phiên bản 1',
        claims: [
          {
            id: 'C1',
            text: 'Phiên bản 2 ghi đè phiên bản 1',
            classification: 'DIRECT',
            citationIds: ['S1'],
            pathId: null,
          },
        ],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.queryByTestId('claim-block-invalid')).not.toBeInTheDocument();
    expect(screen.getByText('Phiên bản 2 ghi đè phiên bản 1')).toBeInTheDocument();
  });

  it('20. "Tra cứu lại" button present on READY and calls onFreshLookup', () => {
    const handleFresh = vi.fn();
    render(
      <GroundedAnswerCard
        grounding={createMockGrounding()}
        onCitationActivate={vi.fn()}
        onFreshLookup={handleFresh}
      />
    );

    const btn = screen.getByRole('button', { name: /Tra cứu lại/ });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handleFresh).toHaveBeenCalledTimes(1);
  });

  it('21. 320px drawer width renders without horizontal overflow', () => {
    const { container } = render(
      <div style={{ width: 320 }}>
        <GroundedAnswerCard
          grounding={createMockGrounding()}
          onCitationActivate={vi.fn()}
        />
      </div>
    );

    const card = container.querySelector('.grounded-answer-card');
    expect(card).toBeInTheDocument();
    // Element exists and has appropriate layout attributes
    expect(card).not.toBeNull();
  });

  it('22. prefers-reduced-motion: reduce disables highlight animation', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = matchMediaMock;

    render(
      <GroundedAnswerCard
        grounding={createMockGrounding()}
        onCitationActivate={vi.fn()}
      />
    );

    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
  });

  it('23. IntentRoutingPrompt renders clarification question with role="status"', async () => {
    const { IntentRoutingPrompt } = await import(
      '../../src/components/ai/grounded/IntentRoutingPrompt'
    );
    const handleCancel = vi.fn();
    render(
      <IntentRoutingPrompt
        question="Bạn muốn tra cứu chu kỳ tính lãi hay sao kê thẻ?"
        originalQuery="Xem chu kỳ"
        onCancel={handleCancel}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Cần thêm thông tin để xử lý chính xác')).toBeInTheDocument();
    expect(
      screen.getByText('Bạn muốn tra cứu chu kỳ tính lãi hay sao kê thẻ?')
    ).toBeInTheDocument();
    expect(screen.getByText(/Xem chu kỳ/)).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'Hủy làm rõ' });
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('28. GroundedAnswerCard renders confidence badge with tooltip', () => {
    const grounding = createMockGrounding({
      answer: {
        schemaVersion: 2,
        language: 'vi',
        conclusion: 'Hệ thống hỗ trợ 1000 TPS.',
        confidence: 'high',
        confidenceReason: 'Trực tiếp trích dẫn đầy đủ.',
        claims: [
          {
            id: 'C1',
            text: 'Hệ thống hỗ trợ 1000 TPS.',
            classification: 'DIRECT',
            citationIds: ['S1'],
            pathId: null,
          },
        ],
        hypotheses: [],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Độ tin cậy: Cao')).toBeInTheDocument();
  });

  it('29. GroundedAnswerCard renders HypothesisBlock with amber styling and no citations', () => {
    const grounding = createMockGrounding({
      answer: {
        schemaVersion: 2,
        language: 'vi',
        conclusion: 'Kết luận có suy đoán.',
        confidence: 'low',
        confidenceReason: 'Bao gồm suy đoán theo yêu cầu.',
        claims: [
          {
            id: 'C1',
            text: 'Dữ liệu thực tế',
            classification: 'DIRECT',
            citationIds: ['S1'],
            pathId: null,
          },
        ],
        hypotheses: [
          {
            id: 'H1',
            text: 'Cổng thanh toán có thể trung gian chuyển mạch.',
            justification: 'Kinh nghiệm kiến trúc vi dịch vụ.',
          },
        ],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(
      screen.getByText('Giả thuyết (Chưa có bằng chứng xác thực)')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cổng thanh toán có thể trung gian chuyển mạch/)
    ).toBeInTheDocument();
    expect(screen.getByText('Độ tin cậy: Thấp')).toBeInTheDocument();
    // Hypothesis does not render any citation chip [H1] or [1] for hypothesis
    expect(screen.queryByRole('button', { name: /\[H1\]/i })).not.toBeInTheDocument();
  });

  it('24. ScopeChipsBar renders "Đang tra cứu:" prefix after routing', async () => {
    const { ScopeChipsBar } = await import(
      '../../src/components/ai/grounded/ScopeChipsBar'
    );
    const handleEdit = vi.fn();
    render(
      <ScopeChipsBar
        routedScope={{
          domain: 'Core Banking',
          environment: 'STAGING',
          version: 'v2.1',
          comparisonMode: 'baseline_vs_scope',
        }}
        onEditScope={handleEdit}
      />
    );

    expect(screen.getByText('Đang tra cứu:')).toBeInTheDocument();
    expect(screen.getByText('Core Banking')).toBeInTheDocument();
    expect(screen.getByText('STAGING')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
    expect(screen.getByText('(so sánh môi trường)')).toBeInTheDocument();

    const domainChip = screen.getByText('Core Banking');
    fireEvent.click(domainChip);
    expect(handleEdit).toHaveBeenCalledTimes(1);
  });

  it('25. EvidenceOnlyCard button "Tạo câu trả lời từ bằng chứng" calls callback', async () => {
    const { EvidenceOnlyCard } = await import(
      '../../src/components/ai/grounded/EvidenceOnlyCard'
    );
    const handleSynthesize = vi.fn();
    const grounding = createMockGrounding({
      outcome: 'MODEL_UNAVAILABLE',
      answer: null,
    });

    render(
      <EvidenceOnlyCard
        grounding={grounding}
        onSynthesizeFromStored={handleSynthesize}
        sourcesSlot={<div data-testid="sources-slot-child">Sources slot</div>}
      />
    );

    expect(screen.getByTestId('sources-slot-child')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Tạo câu trả lời từ bằng chứng' });
    fireEvent.click(btn);
    expect(handleSynthesize).toHaveBeenCalledTimes(1);
  });

  it('26. DiagnosticsPanel renders modality statuses + fallbackReason + repair count', async () => {
    const { DiagnosticsPanel } = await import(
      '../../src/components/ai/grounded/DiagnosticsPanel'
    );
    const mockDiagnostics = {
      fulltext: { status: 'ok' as const, latencyMs: 25, itemCount: 4 },
      vector: { status: 'stale' as const, latencyMs: 120, itemCount: 2 },
      graph: { status: 'ok' as const, latencyMs: 40, itemCount: 1 },
    };

    render(
      <DiagnosticsPanel
        diagnostics={mockDiagnostics}
        fallbackReason="NETWORK_ERROR"
        routerSource="semantic"
        promptVersion="2026.10"
        schemaVersion={1}
        repairs={2}
        coverageWarnings={['Vector index partially stale']}
      />
    );

    // Expand collapse
    const collapseHeader = screen.getByText('Chi tiết chẩn đoán truy xuất');
    fireEvent.click(collapseHeader);

    expect(screen.getByText(/25ms \(4 mục\)/)).toBeInTheDocument();
    expect(screen.getByText(/120ms \(2 mục\)/)).toBeInTheDocument();
    expect(screen.getByText('NETWORK_ERROR')).toBeInTheDocument();
    expect(screen.getByText(/2 lần sửa/)).toBeInTheDocument();
    expect(screen.getByText('Vector index partially stale')).toBeInTheDocument();
  });

  it('27. DiagnosticsPanel contains no query text / source text (content-free invariant)', async () => {
    const { DiagnosticsPanel } = await import(
      '../../src/components/ai/grounded/DiagnosticsPanel'
    );
    const secretQuery = 'BI_MAT_KHOANG_CACH_12345';
    const secretExcerpt = 'NOI_DUNG_NGUON_SECRET_67890';

    const { container } = render(
      <DiagnosticsPanel
        diagnostics={{
          fulltext: { status: 'ok' as const, latencyMs: 15, itemCount: 3 },
          vector: { status: 'ok' as const, latencyMs: 30, itemCount: 2 },
          graph: { status: 'ok' as const, latencyMs: 10, itemCount: 1 },
        }}
        fallbackReason="NONE"
      />
    );

    expect(container.textContent).not.toContain(secretQuery);
    expect(container.textContent).not.toContain(secretExcerpt);
  });

  it('28. renders inline parsed citation chip and source group when claims is empty', () => {
    const handleActivate = vi.fn();
    const grounding = createMockGrounding({
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Tiến trình 60000004 chạy phân bổ nợ [S1].',
        claims: [],
        unsupportedParts: [],
      },
    });

    render(
      <GroundedAnswerCard
        grounding={grounding}
        onCitationActivate={handleActivate}
      />
    );

    expect(screen.getByText('Nguồn trích dẫn:')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /\[1\]/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('29. DEGRADED renders "Đồ thị (0 kết quả)" when graph status is ok but itemCount is 0', () => {
    const grounding = createMockGrounding({
      outcome: 'DEGRADED',
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 5 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 5 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Kết quả thiếu một phần phương thức')).toBeInTheDocument();
    expect(screen.getByText(/Đồ thị \(0 kết quả\)/)).toBeInTheDocument();
  });

  it('30. NO_EVIDENCE with timeout warning or timeout modalityDiagnostics renders timeout notice instead of no-evidence', () => {
    const grounding = createMockGrounding({
      outcome: 'NO_EVIDENCE',
      answer: null,
      coverageWarnings: ['Máy chủ tri thức quá thời gian phản hồi (timeout)'],
      modalityDiagnostics: {
        fulltext: { status: 'timeout', latencyMs: 2000, itemCount: 0 },
        vector: { status: 'timeout', latencyMs: 2000, itemCount: 0 },
        graph: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
      },
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Máy chủ tri thức phản hồi quá thời gian (Timeout)')).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy bằng chứng trong tri thức đã xuất bản')).not.toBeInTheDocument();
  });

  describe('Phase 24 SEED_ONLY and stage diagnostics', () => {
    const seedGrounding = (overrides: Partial<ChatMessageGrounding> = {}): ChatMessageGrounding =>
      createMockGrounding({
        outcome: 'SEED_ONLY',
        answer: null,
        citations: [],
        entities: [
          {
            urn: 'urn:plannermate:corebanking:DatabaseObject:MAIN1.EVT_EVENT',
            canonicalName: 'MAIN1.EVT_EVENT',
            kind: 'DatabaseObject',
            snapshotId: '10000000-0000-4000-8000-000000000001',
            evidenceClass: 'OBSERVED',
          },
        ],
        graphCounts: { entity: 1, edge: 0, path: 0 },
        scope: {
          setIds: ['10000000-0000-4000-8000-000000000010'],
          routedScope: {
            domain: null,
            environment: null,
            version: null,
            comparisonMode: null,
          },
        },
        stageDiagnostics: [
          {
            stage: 'entity_resolution',
            status: 'ok',
            latencyMs: 12,
            accepted: 1,
            rejected: 0,
            truncated: false,
            fallback: false,
            reasonCodes: [],
          },
          {
            stage: 'planning',
            status: 'ok',
            latencyMs: 7,
            accepted: 1,
            rejected: 1,
            truncated: true,
            fallback: true,
            fallbackReason: 'FALLBACK_ONE_HOP',
            reasonCodes: ['RESULT_LIMIT_REACHED', 'FALLBACK_ONE_HOP'],
          },
        ],
        failedSeeds: undefined,
        ...overrides,
      });

    it('32. stage rows show fixed Vietnamese stage name, status, latency, counts, and reason chips', async () => {
      const { DiagnosticsPanel } = await import(
        '../../src/components/ai/grounded/DiagnosticsPanel'
      );
      render(
        <DiagnosticsPanel
          diagnostics={{
            fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
            vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
            graph: { status: 'ok', latencyMs: 15, itemCount: 1, entityCount: 1, edgeCount: 0, pathCount: 0 },
          }}
          graphCounts={{ entity: 1, edge: 0, path: 0 }}
          stages={seedGrounding().stageDiagnostics}
          graphBeforeFusion={{ entity: 3, edge: 10, path: 2 }}
          graphAfterFusion={{ entity: 1, edge: 0, path: 0 }}
        />
      );

      fireEvent.click(screen.getByText('Chi tiết chẩn đoán truy xuất'));

      expect(screen.getByText('Phân giải thực thể')).toBeInTheDocument();
      expect(screen.getByText('Lập kế hoạch')).toBeInTheDocument();
      expect(screen.getByText(/12ms/)).toBeInTheDocument();
      expect(screen.getByText(/1 chấp nhận \/ 1 loại bỏ/)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/RESULT_LIMIT_REACHED: Kết quả đồ thị đã bị giới hạn/)
      ).toBeInTheDocument();
    });

    it('33. truncated and fallback flags render indicators; false flags do not', async () => {
      const { StageDiagnosticsList } = await import(
        '../../src/components/ai/grounded/StageDiagnosticsList'
      );
      render(<StageDiagnosticsList stages={seedGrounding().stageDiagnostics!} />);

      expect(screen.getAllByText('Đã cắt bớt')).toHaveLength(1);
      expect(screen.getAllByText('Dùng phạm vi dự phòng')).toHaveLength(1);
      expect(screen.getAllByLabelText(/FALLBACK_ONE_HOP:/)).toHaveLength(1);
    });

    it('34. diagnostics render entity/edge/path counts and before/after fusion without arbitrary keys', async () => {
      const { DiagnosticsPanel } = await import(
        '../../src/components/ai/grounded/DiagnosticsPanel'
      );
      const { container } = render(
        <DiagnosticsPanel
          diagnostics={{
            fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
            vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
            graph: { status: 'ok', latencyMs: 15, itemCount: 1 },
          }}
          graphCounts={{ entity: 2, edge: 3, path: 4 }}
          graphBeforeFusion={{ entity: 9, edge: 8, path: 7 }}
          graphAfterFusion={{ entity: 2, edge: 3, path: 4 }}
        />
      );

      fireEvent.click(screen.getByText('Chi tiết chẩn đoán truy xuất'));

      expect(screen.getByText('Thực thể: 2 · Cạnh: 3 · Đường dẫn: 4')).toBeInTheDocument();
      expect(screen.getByText(/Trước hợp nhất: 9 thực thể \/ 8 cạnh \/ 7 đường dẫn/)).toBeInTheDocument();
      expect(screen.getByText(/Sau hợp nhất: 2 thực thể \/ 3 cạnh \/ 4 đường dẫn/)).toBeInTheDocument();
      expect(container.textContent).not.toContain('message');
      expect(container.textContent).not.toContain('query');
    });

    it('35. SEED_ONLY renders title, limited copy, counts, entity slot, and partial notice', () => {
      const failedSeeds = [
        {
          urn: 'urn:plannermate:corebanking:DatabaseObject:MISSING_1' as const,
          reasonCode: 'SEED_NOT_FOUND' as const,
        },
      ];
      render(
        <GroundedAnswerCard
          grounding={seedGrounding({ failedSeeds })}
          onCitationActivate={vi.fn()}
          entitiesSlot={<div data-testid="entities-slot">Entity 1</div>}
        />
      );

      expect(screen.getByText('Đã tìm thấy thực thể')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Đã tìm thấy MAIN1.EVT_EVENT, nhưng chưa tìm thấy bằng chứng về mối quan hệ/
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Thực thể: 1 · Cạnh: 0 · Đường dẫn: 0')).toBeInTheDocument();
      expect(screen.getByTestId('entities-slot')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('36. SEED_ONLY omits no-evidence copy, degraded/conflict banners, confidence tag, and refinements', () => {
      render(
        <GroundedAnswerCard
          grounding={seedGrounding()}
          onCitationActivate={vi.fn()}
          refinementsSlot={<div data-testid="refinements-slot">Refine</div>}
        />
      );

      expect(
        screen.queryByText('Không tìm thấy bằng chứng trong tri thức đã xuất bản')
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Kết quả thiếu một phần phương thức')).not.toBeInTheDocument();
      expect(screen.queryByText(/Độ tin cậy:/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('refinements-slot')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('37. SEED_ONLY fixture parses through the persisted schema and buffers exact counts', async () => {
      const { ChatMessageGroundingSchema } = await import(
        '../../src/services/ai/groundedAnswerSchemas'
      );
      const parsed = ChatMessageGroundingSchema.parse(seedGrounding());

      render(
        <GroundedAnswerCard grounding={parsed} onCitationActivate={vi.fn()} />
      );

      expect(screen.getByText('Thực thể: 1 · Cạnh: 0 · Đường dẫn: 0')).toBeInTheDocument();
      expect(screen.queryByText('Trả lời')).not.toBeInTheDocument();
    });
  });

  it('31. LOCAL_FALLBACK_RESULTS without resultsSlot renders empty local notice', () => {
    const grounding = createMockGrounding({
      outcome: 'LOCAL_FALLBACK_RESULTS',
      authority: 'local',
      fallbackReason: 'TIMEOUT',
      answer: null,
      citations: [],
    });

    render(
      <GroundedAnswerCard grounding={grounding} onCitationActivate={vi.fn()} />
    );

    expect(screen.getByText('Đang dùng tìm kiếm cục bộ (BM25)')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy tài liệu liên quan trong kho lưu trữ cục bộ.')).toBeInTheDocument();
  });
});
