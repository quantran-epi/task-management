import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SeedEntityCard } from '../../src/components/ai/grounded/SeedEntityCard';
import { ReasonCodeChip } from '../../src/components/ai/grounded/ReasonCodeChip';
import { PartialSeedNotice } from '../../src/components/ai/grounded/PartialSeedNotice';
import type { PersistedEntityRef } from '../../src/services/ai/groundedAnswerSchemas';

const entity: PersistedEntityRef = {
  urn: 'urn:plannermate:corebanking:DatabaseObject:MAIN1.EVT_EVENT',
  canonicalName: 'MAIN1.EVT_EVENT',
  kind: 'DatabaseObject',
  snapshotId: '10000000-0000-4000-8000-000000000001',
  evidenceClass: 'OBSERVED',
};

const graphCounts = { entity: 2, edge: 0, path: 0 };

const filePath = (name: string) =>
  fileURLToPath(new URL(`../../src/components/ai/grounded/${name}`, import.meta.url));

describe('SeedEntityCard', () => {
  it('1. renders canonical name, localized kind, URN, evidence class, and separate counts', () => {
    render(
      <SeedEntityCard
        entity={entity}
        graphCounts={graphCounts}
        onFindRelated={vi.fn()}
        isFindingRelated={false}
      />
    );

    expect(screen.getByText('MAIN1.EVT_EVENT')).toBeInTheDocument();
    expect(screen.getByText('Loại: Đối tượng dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/urn:plannermate:corebanking:DatabaseObject:MAIN1.EVT_EVENT/)).toBeInTheDocument();
    expect(screen.getByText('OBSERVED')).toBeInTheDocument();
    expect(screen.getByLabelText('Thực thể: 2 · Cạnh: 0 · Đường dẫn: 0')).toBeInTheDocument();
  });

  it('2. aria-label combines localized kind, canonical name, and URN; CTA is keyboard reachable', () => {
    render(
      <SeedEntityCard
        entity={entity}
        graphCounts={graphCounts}
        onFindRelated={vi.fn()}
        isFindingRelated={false}
      />
    );

    expect(
      screen.getByLabelText(
        'Đối tượng dữ liệu MAIN1.EVT_EVENT, định danh urn:plannermate:corebanking:DatabaseObject:MAIN1.EVT_EVENT'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tìm liên quan' })).toBeInTheDocument();
  });

  it('3. clicking Tìm liên quan calls onFindRelated once; loading disables it', () => {
    const onFindRelated = vi.fn();
    const { rerender } = render(
      <SeedEntityCard
        entity={entity}
        graphCounts={graphCounts}
        onFindRelated={onFindRelated}
        isFindingRelated={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tìm liên quan' }));
    expect(onFindRelated).toHaveBeenCalledTimes(1);
    expect(onFindRelated).toHaveBeenCalledWith(entity);

    rerender(
      <SeedEntityCard
        entity={entity}
        graphCounts={graphCounts}
        onFindRelated={onFindRelated}
        isFindingRelated={true}
      />
    );
    const pendingButton = screen.getByRole('button', { name: /Tìm liên quan/ });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(onFindRelated).toHaveBeenCalledTimes(1);
  });

  it('4. markup-like entity text renders literally and source has no dangerouslySetInnerHTML', () => {
    const hostile: PersistedEntityRef = {
      ...entity,
      canonicalName: '<img src=x onerror=alert(1)>',
    };
    const { container } = render(
      <SeedEntityCard
        entity={hostile}
        graphCounts={graphCounts}
        onFindRelated={vi.fn()}
        isFindingRelated={false}
      />
    );

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();

    for (const name of ['SeedEntityCard.tsx', 'ReasonCodeChip.tsx', 'PartialSeedNotice.tsx']) {
      expect(readFileSync(filePath(name), 'utf8')).not.toContain('dangerouslySetInnerHTML');
    }
  });

  it('5. known reason codes render verbatim with fixed Vietnamese aria explanation; unknown code stays safe', () => {
    render(
      <>
        <ReasonCodeChip code="SEED_NOT_FOUND" />
        <ReasonCodeChip code="FALLBACK_ONE_HOP" />
        <ReasonCodeChip code="RESULT_LIMIT_REACHED" />
        <ReasonCodeChip code="HOP_LIMIT_EXCEEDED" />
        <ReasonCodeChip code="MISSING_SUPPORTING_CHUNK" />
        <ReasonCodeChip code="FUTURE_CODE" />
      </>
    );

    expect(screen.getByText('SEED_NOT_FOUND')).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'SEED_NOT_FOUND: Không tìm thấy thực thể được nhắc đến trong bản chụp đã xuất bản.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('FALLBACK_ONE_HOP: Đang dùng phạm vi liên hệ an toàn một bước.')
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'RESULT_LIMIT_REACHED: Kết quả đồ thị đã bị giới hạn theo số lượng tối đa.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('FUTURE_CODE')).toBeInTheDocument();
    expect(
      screen.getByLabelText('FUTURE_CODE: Không có mô tả cho mã này.')
    ).toBeInTheDocument();
  });

  it('6. partial notice names at most five URNs, one chip per entry, and opens diagnostics by callback', () => {
    const onOpenDiagnostics = vi.fn();
    const failedSeeds = Array.from({ length: 6 }, (_, idx) => ({
      urn: `urn:plannermate:corebanking:DatabaseObject:FAIL_${idx + 1}`,
      reasonCode: 'SEED_NOT_FOUND' as const,
    }));

    const { container } = render(
      <PartialSeedNotice failedSeeds={failedSeeds} onOpenDiagnostics={onOpenDiagnostics} />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelectorAll('.reason-code-chip')).toHaveLength(5);
    expect(screen.queryByText(/FAIL_6/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Không phân giải được 6 thực thể: .*FAIL_1.*FAIL_5/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết chẩn đoán' }));
    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
  });
});
