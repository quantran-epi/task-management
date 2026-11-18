import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourcesPanel } from '../../src/components/ai/grounded/SourcesPanel';
import {
  PersistedCitationSchema,
  ChatMessageGroundingSchema,
  type PersistedCitation,
} from '../../src/services/ai/groundedAnswerSchemas';
import type { FederatedSetCoverage } from '../../src/services/knowledge/retrievalProtocol';

const serverCitation1: PersistedCitation = {
  citationId: 'S1',
  documentId: '00000000-0000-0000-0000-000000000001',
  documentTitle: 'Báo cáo kỹ thuật 1',
  sectionAnchor: 'KienTruc',
  lineStart: 10,
  lineEnd: 20,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_12345678',
  publishedContentHash: 'a'.repeat(64),
  citedExcerpt: 'Hệ thống hỗ trợ 1000 TPS.',
};

const serverCitationDuplicateRange: PersistedCitation = {
  citationId: 'S2',
  documentId: '00000000-0000-0000-0000-000000000001',
  documentTitle: 'Báo cáo kỹ thuật 1',
  sectionAnchor: 'KienTruc',
  lineStart: 10,
  lineEnd: 20,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_12345678',
  publishedContentHash: 'a'.repeat(64),
  citedExcerpt: 'Hệ thống hỗ trợ 1000 TPS lặp lại.',
};

const localCitation: PersistedCitation = {
  citationId: 'L1',
  documentId: '00000000-0000-0000-0000-000000000002',
  documentTitle: 'Ghi chú cục bộ',
  sectionAnchor: null,
  lineStart: 5,
  lineEnd: 8,
  authority: 'local',
  evidenceClass: 'LOCAL',
  snapshotId: null,
  publishedContentHash: null,
  citedExcerpt: 'Ghi chú cá nhân.',
};

describe('SourcesPanel', () => {
  it('(a) dedup collapses identical ranges', () => {
    render(
      <SourcesPanel
        citations={[serverCitation1, serverCitationDuplicateRange]}
        onOpenCitation={vi.fn()}
      />
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('Báo cáo kỹ thuật 1')).toBeInTheDocument();
  });

  it('(b) click row calls onOpenCitation', () => {
    const handleOpen = vi.fn();
    render(
      <SourcesPanel
        citations={[serverCitation1]}
        onOpenCitation={handleOpen}
      />
    );

    const row = screen.getByRole('button', {
      name: /Báo cáo kỹ thuật 1 L10-20 OBSERVED/,
    });
    fireEvent.click(row);
    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith(serverCitation1);
  });

  it('(c) Enter key on focused row activates', () => {
    const handleOpen = vi.fn();
    render(
      <SourcesPanel
        citations={[serverCitation1]}
        onOpenCitation={handleOpen}
      />
    );

    const row = screen.getByRole('button', {
      name: /Báo cáo kỹ thuật 1 L10-20 OBSERVED/,
    });
    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' });
    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith(serverCitation1);
  });

  it('(d) local vs server rows show Local tag', () => {
    render(
      <SourcesPanel
        citations={[serverCitation1, localCitation]}
        onOpenCitation={vi.fn()}
      />
    );

    expect(screen.getByText('Báo cáo kỹ thuật 1')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú cục bộ')).toBeInTheDocument();
    const localTags = screen.getAllByText('Local');
    expect(localTags.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 28-03: source attribution rendering', () => {
  const withMemberships = (overrides: Partial<PersistedCitation> = {}): PersistedCitation => ({
    ...serverCitation1,
    setMemberships: [
      { setId: '10000000-0000-4000-8000-000000000001', setName: 'Set A' },
      { setId: '20000000-0000-4000-8000-000000000002', setName: 'Set B' },
    ],
    ...overrides,
  });

  const coverage: FederatedSetCoverage[] = [
    { setId: '10000000-0000-4000-8000-000000000001', state: 'CONTRIBUTED', publishedSnapshotId: 'gsnap_abcdef12', retrievalSnapshotId: 'gsnap_abcdef12', staleIndex: false },
    { setId: '20000000-0000-4000-8000-000000000002', state: 'TIMED_OUT', publishedSnapshotId: 'gsnap_abcdef34', retrievalSnapshotId: null, staleIndex: false },
  ];

  it('two same-range different-snapshot citations render as two rows', () => {
    const v2 = withMemberships({ citationId: 'S2', snapshotId: 'gsnap_87654321' });
    render(
      <SourcesPanel citations={[withMemberships(), v2]} onOpenCitation={vi.fn()} />
    );
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
  });

  it('expandable per-row detail shows set IDs, not an always-visible badge', () => {
    render(<SourcesPanel citations={[withMemberships()]} onOpenCitation={vi.fn()} />);
    const setIdText = '10000000-0000-4000-8000-000000000001';
    expect(screen.queryAllByTestId('source-set-id')).toHaveLength(0);
    const expandBtn = screen.getByTestId('source-expand-toggle');
    fireEvent.click(expandBtn);
    const setRows = screen.getAllByTestId('source-set-id');
    expect(setRows.some((el) => el.textContent?.includes(setIdText))).toBe(true);
  });

  it('renders a coverage section when coverage is present', () => {
    render(
      <SourcesPanel citations={[withMemberships()]} coverage={coverage} onOpenCitation={vi.fn()} />
    );
    expect(screen.getByTestId('sources-coverage')).toBeInTheDocument();
    expect(screen.getByText(/CONTRIBUTED/)).toBeInTheDocument();
    expect(screen.getByText(/TIMED_OUT/)).toBeInTheDocument();
  });

  it('renders nothing coverage-specific when coverage is absent', () => {
    render(<SourcesPanel citations={[withMemberships()]} onOpenCitation={vi.fn()} />);
    expect(screen.queryByTestId('sources-coverage')).not.toBeInTheDocument();
  });

  it('schema round-trip: grounding with setMemberships and coverage parses; one without either defaults', () => {
    const populated = PersistedCitationSchema.parse(withMemberships());
    expect(populated.setMemberships).toHaveLength(2);

    const baseGrounding = {
      schemaVersion: 1 as const,
      authority: 'server' as const,
      outcome: 'READY' as const,
      answer: null,
      citations: [populated],
      paths: [],
      conflicts: [],
      scope: { setIds: [], routedScope: { domain: null, environment: null, version: null, comparisonMode: null } },
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
        vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
        graph: { status: 'ok', latencyMs: 1, itemCount: 0 },
      },
      coverageWarnings: [],
      fallbackReason: 'NONE' as const,
      routerVersion: 'v1',
      promptVersion: 'v1',
      modelId: 'm1',
      createdAt: '2026-11-17T00:00:00.000Z',
      coverage,
    };
    const withCoverage = ChatMessageGroundingSchema.parse(baseGrounding);
    expect(withCoverage.coverage).toHaveLength(2);

    const { coverage: _c, ...withoutFields } = baseGrounding;
    const legacyCitation = { ...serverCitation1 };
    const legacy = ChatMessageGroundingSchema.parse({
      ...withoutFields,
      citations: [legacyCitation],
    });
    expect(legacy.coverage ?? []).toEqual([]);
    expect(legacy.citations[0]?.setMemberships ?? []).toEqual([]);

    // An unknown coverage state must fail parsing.
    expect(ChatMessageGroundingSchema.safeParse({
      ...baseGrounding,
      coverage: [{ ...coverage[0], state: 'MADE_UP' }],
    }).success).toBe(false);
  });
});
