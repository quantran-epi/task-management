import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessageBubble } from '../../ChatMessageBubble';
import { ChatMessageList } from '../../ChatMessageList';
import type { ChatMessage } from '../../../../types/models';
import type { WizardSnapshot } from '../../../../services/ai/wizardSchemas';
import * as sandbox from '../../../../utils/dynamicFileSandbox';
import { DocumentPreviewCard } from '../DocumentPreviewCard';
import { SolutionReviewCard } from '../SolutionReviewCard';
import { WizardSavedNoteBanner } from '../WizardSavedNoteBanner';

const HISTORICAL_LINE = 'Tài liệu lịch sử — xuất .docx từ bước tương ứng trong SDLC.';

const wizardSnapshot: WizardSnapshot = {
  schemaVersion: 1,
  sessionId: '10000000-0000-4000-8000-000000000001',
  projectId: '10000000-0000-4000-8000-000000000002',
  threadId: '10000000-0000-4000-8000-000000000003',
  skill: 'PL03',
  status: 'review',
  inputRevision: 1,
  draftRevision: 2,
  approvedAt: null,
  artifactId: null,
  artifactHash: null,
  renderPayload: { title: 'Bản thảo PL03', markdown: '# Draft PL03\n\nNội dung lịch sử.' },
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
};

const wizardMessage: ChatMessage = {
  id: 'wizard-message-1',
  threadId: wizardSnapshot.threadId,
  role: 'assistant',
  content: 'Bản nháp PL03 đã sẵn sàng để soát xét.',
  wizard: wizardSnapshot,
  generatedFiles: [{ id: 'generated-1', filename: 'wrong-route.docx', format: 'docx', sizeBytes: 1, content: 'ExcelJS script' }],
  createdAt: wizardSnapshot.createdAt,
};

const gapFillMessage: ChatMessage = {
  ...wizardMessage,
  id: 'wizard-message-gap',
  content: 'Cần làm rõ: luồng phê duyệt của đơn vị yêu cầu',
  wizard: {
    ...wizardSnapshot,
    status: 'gap_fill',
    draftRevision: null,
  },
};

// Only the two survivors of the narrowed contract: an over-wide literal fails `tsc`.
const wizardCallbacks = {
  exportedFiles: new Map(),
  onOpenNote: vi.fn(),
};

describe('wizard message routing contracts', () => {
  it('renders the historic review card and never exposes an approval path', () => {
    const sandboxSpy = vi.spyOn(sandbox, 'executeDynamicFileScript');
    render(<ChatMessageBubble message={wizardMessage} wizardCallbacks={wizardCallbacks} />);

    expect(screen.getByText('Bản thảo PL03')).toBeInTheDocument();
    expect(screen.queryByText('wrong-route.docx')).not.toBeInTheDocument();
    expect(screen.getByText(HISTORICAL_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yêu cầu chỉnh sửa thêm' })).not.toBeInTheDocument();
    expect(sandboxSpy).not.toHaveBeenCalled();
  });

  it('renders the historic gap-fill line with inert actions', () => {
    render(<ChatMessageBubble message={gapFillMessage} wizardCallbacks={wizardCallbacks} />);

    expect(screen.getByText('Bản nháp lịch sử đang chờ làm rõ.')).toBeInTheDocument();
    expect(screen.getByText(/Cần làm rõ: Bản thảo PL03/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
    expect(wizardCallbacks.onOpenNote).not.toHaveBeenCalled();
  });

  it('does not add wizard controls to temporary streaming messages', () => {
    render(<ChatMessageBubble message={wizardMessage} isStreaming wizardCallbacks={wizardCallbacks} />);
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bản thảo PL03')).not.toBeInTheDocument();
  });
});

describe('wizard message list seam', () => {
  it('renders the historic review card and stream text without an approval path', () => {
    const sandboxSpy = vi.spyOn(sandbox, 'executeDynamicFileScript');
    render(<ChatMessageList messages={[wizardMessage]} isStreaming streamingText="stream" wizardCallbacks={wizardCallbacks} />);
    expect(screen.getByText(HISTORICAL_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
    expect(screen.getAllByText('stream').length).toBeGreaterThan(0);
    expect(sandboxSpy).not.toHaveBeenCalled();
  });
});

const preview = {
  skill: 'PL03' as const,
  title: 'Bản thảo PL03',
  metadata: {
    cr: 'CR-42',
    requestingUnit: 'Vận hành',
    author: 'Người dùng',
    date: '29/10/2026',
  },
  markdown: '# PL03\n\nNội dung đã duyệt.\n\n```mermaid\ngraph TD\n A-->B\n```',
  mermaid: 'graph TD\n A-->B',
  driftMatrix: undefined,
  exportedFile: undefined,
  exportError: undefined,
};

describe('document wizard review components', () => {
  it('renders a preview-only historical card with no approval actions', () => {
    const original = structuredClone(preview);
    render(<DocumentPreviewCard preview={preview} />);

    expect(screen.getByText('Bản thảo PL03')).toBeInTheDocument();
    expect(screen.getByText(/CR-42 · Vận hành · Người dùng · 29\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem toàn bộ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yêu cầu chỉnh sửa thêm' })).not.toBeInTheDocument();
    expect(screen.getByText('Sơ đồ sẽ được chuyển thành bảng bước khi xuất Word.')).toBeInTheDocument();
    expect(screen.getAllByText(HISTORICAL_LINE)).toHaveLength(1);
    expect(preview).toEqual(original);
  });

  it('renders the already-exported file row and keeps the export error visible', () => {
    render(
      <DocumentPreviewCard
        preview={{
          ...preview,
          exportError: 'Không tạo được tệp .docx. Nội dung Markdown vẫn được giữ trong phiên; thử lại hoặc yêu cầu chỉnh sửa.',
          exportedFile: { filename: 'PL03.docx', sizeBytes: 2048, noteId: 'note-9', noteSaved: true, downloadInitiated: true },
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Không tạo được tệp .docx');
    expect(screen.getByText(/PL03\.docx · 2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở tài liệu' })).toBeInTheDocument();
    expect(screen.queryByText(HISTORICAL_LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
  });

  it('renders a historic solution card with no save or edit actions', () => {
    const solution = {
      messageId: 'solution-msg-1',
      version: 2,
      title: 'SOLUTION.md',
      featureMode: 'existing' as const,
      currentSystem: 'Hệ thống hiện tại',
      affectedSurfaces: ['Màn hình giao dịch', 'POST /payments', 'MAIN1.PAYMENT'],
      markdown: '# SOLUTION\n\nBản v2',
    };
    const original = structuredClone(solution);
    render(<SolutionReviewCard solution={solution} onOpenNote={vi.fn()} />);

    expect(screen.getByText('SOLUTION.md — v2')).toBeInTheDocument();
    expect(screen.getByText('Hiện trạng hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Màn hình giao dịch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem toàn bộ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu SOLUTION.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yêu cầu chỉnh sửa thêm' })).not.toBeInTheDocument();
    expect(screen.getAllByText(HISTORICAL_LINE)).toHaveLength(1);
    expect(solution).toEqual(original);
  });

  it('renders a saved solution version row without mutating the old draft', () => {
    const solution = {
      messageId: 'solution-msg-2',
      version: 3,
      title: 'SOLUTION.md',
      featureMode: 'new' as const,
      markdown: '# SOLUTION\n\nBản v3',
      saved: { savedAt: '29/10/2026 10:30', noteId: 'note-2' },
    };
    render(<SolutionReviewCard solution={solution} onOpenNote={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu SOLUTION.md phiên bản v3');
    expect(screen.getByRole('link', { name: 'Mở tài liệu' })).toHaveAttribute('href', '#/notes?doc=note-2');
    expect(screen.queryByText(HISTORICAL_LINE)).not.toBeInTheDocument();
  });

  it('reports note and download outcomes separately without overclaiming disk success', () => {
    render(<WizardSavedNoteBanner documentId="note-1" filename="PL03.docx" noteSaved downloadInitiated savePickerSaved={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu thành tài liệu dự án');
    expect(screen.getByRole('status')).toHaveTextContent('Đã bắt đầu tải PL03.docx');
    expect(screen.getByRole('status')).not.toHaveTextContent('đã lưu tệp vào ổ đĩa');
    expect(screen.getByRole('link', { name: 'Mở tài liệu' })).toHaveAttribute('href', '#/notes?doc=note-1');
  });
});
