import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatMessageBubble } from '../../ChatMessageBubble';
import type { ChatMessage } from '../../../../types/models';
import type { WizardSnapshot } from '../../../../services/ai/wizardSchemas';
import * as sandbox from '../../../../utils/dynamicFileSandbox';

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

const wizardCallbacks = {
  onApproveExport: vi.fn(),
  onRequestEdit: vi.fn(),
  onSaveSolution: vi.fn(),
  onOpenNote: vi.fn(),
  onSuggestion: vi.fn(),
  onSkip: vi.fn(),
  onConfirmPack: vi.fn(),
  onReplacePack: vi.fn(),
};

function resetWizardCallbacks() {
  Object.values(wizardCallbacks).forEach((callback) => callback.mockReset());
}

import { describe as describeRouting, it as itRouting } from 'vitest';

describeRouting('wizard message routing contracts', () => {
  itRouting('routes wizard review before generated files and forwards typed approval pointer', () => {
    resetWizardCallbacks();
    const sandboxSpy = vi.spyOn(sandbox, 'executeDynamicFileScript');
    render(<ChatMessageBubble message={wizardMessage} wizardCallbacks={wizardCallbacks} />);

    expect(screen.getByText('Bản thảo PL03')).toBeInTheDocument();
    expect(screen.queryByText('wrong-route.docx')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt & Tải .docx' }));
    expect(wizardCallbacks.onApproveExport).toHaveBeenCalledWith('wizard-message-1', 2);
    expect(sandboxSpy).not.toHaveBeenCalled();
  });

  itRouting('does not add wizard controls to temporary streaming messages', () => {
    render(<ChatMessageBubble message={wizardMessage} isStreaming wizardCallbacks={wizardCallbacks} />);
    expect(screen.queryByRole('button', { name: 'Duyệt & Tải .docx' })).not.toBeInTheDocument();
  });
});

import { ChatMessageList } from '../../ChatMessageList';

describeRouting('wizard message list seam', () => {
  itRouting('forwards wizard callbacks to each persisted message but not temp stream', () => {
    resetWizardCallbacks();
    render(<ChatMessageList messages={[wizardMessage]} isStreaming streamingText="stream" wizardCallbacks={wizardCallbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt & Tải .docx' }));
    expect(wizardCallbacks.onApproveExport).toHaveBeenCalledWith('wizard-message-1', 2);
    expect(screen.getAllByText('stream').length).toBeGreaterThan(0);
  });
});

import { DocumentPreviewCard } from '../DocumentPreviewCard';
import { SolutionReviewCard } from '../SolutionReviewCard';
import { WizardSavedNoteBanner } from '../WizardSavedNoteBanner';

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
  it('renders safe preview, exact actions, disclosure, and immutable edit payload', () => {
    const onEdit = vi.fn();
    const original = structuredClone(preview);
    render(<DocumentPreviewCard preview={preview} onApproveExport={vi.fn()} onRequestEdit={onEdit} />);

    expect(screen.getByText('Bản thảo PL03')).toBeInTheDocument();
    expect(screen.getByText(/CR-42 · Vận hành · Người dùng · 29\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt & Tải .docx' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yêu cầu chỉnh sửa thêm' })).toBeInTheDocument();
    expect(screen.getByText('Sơ đồ sẽ được chuyển thành bảng bước khi xuất Word.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu chỉnh sửa thêm' }));
    expect(onEdit).toHaveBeenCalledWith({ messageId: undefined, draftRevision: undefined });
    expect(preview).toEqual(original);
  });

  it('keeps Markdown and retry action after export failure', () => {
    const onApproveExport = vi.fn();
    render(
      <DocumentPreviewCard
        preview={{ ...preview, exportError: 'Không tạo được tệp .docx. Nội dung Markdown vẫn được giữ trong phiên; thử lại hoặc yêu cầu chỉnh sửa.' }}
        onApproveExport={onApproveExport}
        onRequestEdit={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Không tạo được tệp .docx');
    expect(screen.getByText('Nội dung đã duyệt.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt & Tải .docx' }));
    expect(onApproveExport).toHaveBeenCalledOnce();
  });

  it('renders solution version, affected surfaces, and saved row without mutating old draft', () => {
    const onSave = vi.fn();
    const solution = {
      messageId: 'solution-msg-1',
      version: 2,
      title: 'SOLUTION.md',
      featureMode: 'existing' as const,
      currentSystem: 'Hệ thống hiện tại',
      affectedSurfaces: ['Màn hình giao dịch', 'POST /payments', 'MAIN1.PAYMENT'],
      markdown: '# SOLUTION\n\nBản v2',
      saved: { savedAt: '29/10/2026 10:30', noteId: 'note-2' },
    };
    const original = structuredClone(solution);
    render(<SolutionReviewCard solution={solution} onSave={onSave} onRequestEdit={vi.fn()} onOpenNote={vi.fn()} />);

    expect(screen.getByText('SOLUTION.md — v2')).toBeInTheDocument();
    expect(screen.getByText('Hiện trạng hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Màn hình giao dịch')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu SOLUTION.md phiên bản v2');
    expect(screen.getByRole('link', { name: 'Mở tài liệu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu SOLUTION.md' })).not.toBeInTheDocument();
    expect(solution).toEqual(original);
  });

  it('reports note and download outcomes separately without overclaiming disk success', () => {
    render(<WizardSavedNoteBanner documentId="note-1" filename="PL03.docx" noteSaved downloadInitiated savePickerSaved={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu thành tài liệu dự án');
    expect(screen.getByRole('status')).toHaveTextContent('Đã bắt đầu tải PL03.docx');
    expect(screen.getByRole('status')).not.toHaveTextContent('đã lưu tệp vào ổ đĩa');
    expect(screen.getByRole('link', { name: 'Mở tài liệu' })).toHaveAttribute('href', '#/notes?doc=note-1');
  });
});
