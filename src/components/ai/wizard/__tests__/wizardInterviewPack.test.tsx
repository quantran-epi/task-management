import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChangePackManifest, ChangePackValidationCode } from '../../../../services/wizard/changePack';
import type { ReconciliationResult } from '../../../../services/wizard/reconciliation';
import { ChangePackConfirmStrip } from '../ChangePackConfirmStrip';
import { ChangePackDropzone } from '../ChangePackDropzone';
import { DriftMatrixView } from '../DriftMatrixView';
import { GapFillQuestionCard, type GapFillQuestion } from '../GapFillQuestionCard';

function manifest(): ChangePackManifest {
  return {
    schemaVersion: 1,
    packHash: 'a'.repeat(64),
    identity: { cr: 'CR-2501', base: 'base-sha', head: 'head-sha', branch: 'feature/cr-2501' },
    meta: {
      cr: 'CR-2501', base: 'base-sha', head: 'head-sha', branch: 'feature/cr-2501', author: 'Dev',
      generatedAt: '2026-10-28T00:00:00.000Z', commits: [{ sha: 'abc123', subject: 'Implement CR' }],
      files: [{ path: 'src/change.ts', status: 'M' }, { path: 'sql/change.sql', status: 'A' }],
    },
    entries: [], compressedBytes: 100, expandedBytes: 200, commitCount: 1, fileCount: 2, coverageStatus: 'complete',
  };
}

function reconciliation(status: ReconciliationResult['status']): ReconciliationResult {
  return {
    schemaVersion: 1,
    identity: {
      projectId: 'project', threadId: 'thread', solutionNoteId: 'solution', solutionVersion: 1,
      solutionHash: 'a'.repeat(64), packHash: 'b'.repeat(64), cr: 'CR-2501', base: 'base', head: 'head',
    },
    status,
    approvedDesign: { currentSystem: 'Core', affectedScreens: [], affectedApis: [], affectedTables: [] },
    actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
    drift: [
      { requirementId: 'REQ-OUT', category: 'outside_solution', evidence: { evidenceId: 'e1', path: 'src/out.ts', startLine: 1, endLine: 2, text: 'new behavior' }, baselineRequirement: null },
      { requirementId: 'REQ-MISS', category: 'missing', evidence: null, baselineRequirement: 'Must validate limit' },
      { requirementId: 'REQ-DIFF', category: 'different', evidence: { evidenceId: 'e2', path: 'src/diff.ts', startLine: 3, endLine: 4, text: 'different behavior' }, baselineRequirement: null },
    ],
    dbChangesRollback: { affectedTables: [], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
    regressionMatrix: [],
    coverage: [{ path: 'diff.patch', state: status === 'PARTIAL_COVERAGE' ? 'deferred' : 'included', evidenceIds: [] }],
  };
}

const openQuestion: GapFillQuestion = {
  id: 'gap-1',
  topic: '<img src=x onerror=alert(1)> Quy tắc hạn mức',
  description: 'Chưa rõ giá trị <script>alert(1)</script> trong mục II.2.',
  templateSection: 'PL02 II.2',
  suggestions: ['Theo CIF', 'Theo tài khoản'],
  evidenceSources: ['SOLUTION.md', '<b>Kiến trúc</b>', 'Nguồn 3', 'Nguồn 4'],
  answer: null,
  outcome: 'open',
};

describe('GapFillQuestionCard', () => {
  it('renders exact question copy and prefills suggestion without submitting', () => {
    const onSuggestion = vi.fn();
    const onSkip = vi.fn();
    render(<GapFillQuestionCard question={openQuestion} onSuggestion={onSuggestion} onSkip={onSkip} />);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Cần làm rõ: <img src=x onerror=alert(1)> Quy tắc hạn mức',
    );
    expect(screen.getByText('Chưa rõ giá trị <script>alert(1)</script> trong mục II.2.')).toBeInTheDocument();
    expect(screen.getByText('Nhập câu trả lời hoặc chọn gợi ý bên dưới')).toBeInTheDocument();
    expect(screen.getByText('Dựa trên 4 nguồn đã tra cứu: SOLUTION.md, <b>Kiến trúc</b>, Nguồn 3 và 1 nguồn khác')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Theo CIF' }));
    expect(onSuggestion).toHaveBeenCalledOnce();
    expect(onSuggestion).toHaveBeenCalledWith('gap-1', 'Theo CIF');
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('skips explicit question as omitted without supplying an answer', () => {
    const onSkip = vi.fn();
    render(<GapFillQuestionCard question={openQuestion} onSuggestion={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua mục này' }));
    expect(onSkip).toHaveBeenCalledWith('gap-1', 'omitted');
  });

  it('collapses answered and skipped questions into status summaries', () => {
    const { rerender } = render(
      <GapFillQuestionCard
        question={{ ...openQuestion, outcome: 'answered', answer: 'Áp dụng theo CIF' }}
        onSuggestion={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đã trả lời: Áp dụng theo CIF');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <GapFillQuestionCard
        question={{ ...openQuestion, outcome: 'omitted', answer: null }}
        onSuggestion={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đã bỏ qua: (chưa cung cấp)');
  });

  it('uses 24px spacing when multiple question cards stack', () => {
    render(
      <div data-testid="stack" style={GapFillQuestionCard.stackStyle}>
        <GapFillQuestionCard question={openQuestion} onSuggestion={vi.fn()} onSkip={vi.fn()} />
        <GapFillQuestionCard question={{ ...openQuestion, id: 'gap-2' }} onSuggestion={vi.fn()} onSkip={vi.fn()} />
      </div>,
    );
    expect(screen.getByTestId('stack')).toHaveStyle({ gap: '24px' });
  });
});

describe('ChangePackDropzone', () => {
  it('passes selected browser File identity through picker and drop', () => {
    const onSelect = vi.fn();
    const { container } = render(<ChangePackDropzone onSelect={onSelect} />);
    const file = new File(['zip'], 'change-pack.zip', { type: 'application/zip' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onSelect).toHaveBeenLastCalledWith(file);

    const dropped = new File(['drop'], 'dropped.zip', { type: 'application/zip' });
    fireEvent.drop(screen.getByRole('button', { name: 'Khu vực nạp change-pack' }), { dataTransfer: { files: [dropped] } });
    expect(onSelect).toHaveBeenLastCalledWith(dropped);
  });

  it.each(['Enter', ' '])('opens the zip picker with %s', (key) => {
    const { container } = render(<ChangePackDropzone onSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Khu vực nạp change-pack' }), { key });
    expect(click).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('accept', '.zip,application/zip');
  });

  it('announces drag state with text rather than color alone', () => {
    render(<ChangePackDropzone onSelect={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: 'Khu vực nạp change-pack' });
    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveTextContent('Thả change-pack.zip để nạp.');
    fireEvent.dragLeave(dropzone);
    expect(dropzone).toHaveTextContent('Kéo thả change-pack.zip vào đây hoặc bấm để chọn tệp.');
  });
});

describe('ChangePackConfirmStrip', () => {
  it('shows exact validated pack identity before explicit confirm', () => {
    const onConfirm = vi.fn();
    const onReplace = vi.fn();
    render(<ChangePackConfirmStrip result={{ status: 'valid', manifest: manifest() }} onConfirm={onConfirm} onReplace={onReplace} />);
    expect(screen.getByText('CR CR-2501 · Nhánh feature/cr-2501 · 1 commit · 2 tệp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận pack' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ packHash: 'a'.repeat(64) }));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn pack khác' }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it.each([
    ['PACK_COMPRESSED_TOO_LARGE', 'Change-pack vượt quá 5MB. Chạy lại scripts/change-pack.mjs với phạm vi nhỏ hơn rồi nạp lại.'],
    ['PACK_ENTRY_PROHIBITED', 'Change-pack chứa tệp không được phép. Loại bỏ node_modules/, *.min.js và package-lock.json rồi nạp lại.'],
    ['PACK_META_INVALID', 'Không đọc được meta.json trong change-pack. Kiểm tra lệnh sinh pack và nạp lại.'],
    ['PACK_PATH_UNSAFE', 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.'],
  ] satisfies Array<[ChangePackValidationCode, string]>)('maps %s to stable copy without raw paths', (code, copy) => {
    render(<ChangePackConfirmStrip result={{ status: 'invalid', code }} onConfirm={vi.fn()} onReplace={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(copy);
    expect(screen.queryByText(/C:\\secret|\.\.\/private/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận pack' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chọn pack khác' })).toBeInTheDocument();
  });
});

describe('DriftMatrixView', () => {
  it('renders three semantic drift groups and fixed columns', () => {
    render(<DriftMatrixView result={reconciliation('DRIFT_DETECTED')} />);
    expect(screen.getByRole('heading', { name: 'Bảng drift so với SOLUTION.md' })).toBeInTheDocument();
    for (const group of ['Ngoài solution', 'Chưa làm', 'Làm khác']) {
      expect(screen.getByRole('heading', { name: group })).toBeInTheDocument();
      expect(screen.getByText(group, { selector: '.ant-tag' })).toBeInTheDocument();
    }
    for (const column of ['Mục', 'SOLUTION.md', 'Thực tế', 'Ghi chú']) {
      expect(screen.getAllByRole('columnheader', { name: column })).toHaveLength(3);
    }
  });

  it('shows coverage warning and never clean copy for partial analysis', () => {
    render(<DriftMatrixView result={{ ...reconciliation('PARTIAL_COVERAGE'), drift: [] }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Phạm vi đối chiếu chưa đầy đủ; chưa thể kết luận không có drift.');
    expect(screen.queryByText('Không phát hiện drift: triển khai khớp với solution đã duyệt.')).not.toBeInTheDocument();
  });

  it('shows clean state only for complete coverage with all groups empty', () => {
    render(<DriftMatrixView result={{ ...reconciliation('NO_DRIFT_COMPLETE'), drift: [] }} />);
    expect(screen.getAllByText('Không phát hiện drift: triển khai khớp với solution đã duyệt.')).toHaveLength(3);
  });
});
