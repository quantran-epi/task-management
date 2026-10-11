import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourcesPanel } from '../../src/components/ai/grounded/SourcesPanel';
import type { PersistedCitation } from '../../src/services/ai/groundedAnswerSchemas';

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
