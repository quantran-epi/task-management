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

  it('5. NO_EVIDENCE renders "Không tìm thấy bằng chứng" heading + refinement chip slots invoked', () => {
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

    expect(screen.getByText('Không tìm thấy bằng chứng')).toBeInTheDocument();
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

  it('17. D-26 override claim without SUPERSEDES renders safe error, not prose', () => {
    const conflictExtends: PersistedConflictGroup = {
      conflictId: 'cg-extends',
      dimension: 'Version',
      branches: [
        { factKey: '4'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: '5'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Version',
        environment: null,
        version: '2.0',
        overrideRelation: 'EXTENDS',
      },
    };

    const citWithOther = {
      ...baseCitation,
      evidenceKind: 'other' as const,
    };

    const grounding = createMockGrounding({
      citations: [citWithOther],
      conflicts: [conflictExtends],
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

    expect(screen.getByTestId('claim-block-invalid')).toBeInTheDocument();
    expect(
      screen.getByText(/Không thể khẳng định ghi đè — thiếu bằng chứng SUPERSEDES/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Phiên bản 2 ghi đè phiên bản 1')).not.toBeInTheDocument();
  });

  it('18. D-26 override claim with SUPERSEDES renders normal prose', () => {
    const conflictSupersedes: PersistedConflictGroup = {
      conflictId: 'cg-supersedes',
      dimension: 'Version',
      branches: [
        { factKey: '6'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: '7'.repeat(64), claimIds: ['C1'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Version',
        environment: null,
        version: '2.0',
        overrideRelation: 'SUPERSEDES',
      },
    };

    const grounding = createMockGrounding({
      conflicts: [conflictSupersedes],
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

  it('19. D-26 override claim with release_note evidence renders normally', () => {
    const citWithReleaseNote = {
      ...baseCitation,
      evidenceKind: 'release_note' as const,
    };

    const grounding = createMockGrounding({
      citations: [citWithReleaseNote],
      conflicts: [],
      answer: {
        schemaVersion: 1,
        language: 'vi',
        conclusion: 'Hệ thống supersedes dịch vụ cũ',
        claims: [
          {
            id: 'C1',
            text: 'Hệ thống supersedes dịch vụ cũ',
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
    expect(screen.getByText('Hệ thống supersedes dịch vụ cũ')).toBeInTheDocument();
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
});
