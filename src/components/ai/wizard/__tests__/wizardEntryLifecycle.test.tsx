import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInputBar } from '../../ChatInputBar';
import { TaskPlannerDatabase } from '../../../../db';
import type { WizardSnapshot, WizardStatus } from '../../../../services/ai/wizardSchemas';
import { WizardLifecycleBar } from '../WizardLifecycleBar';
import { WizardMetadataModal } from '../WizardMetadataModal';
import { WizardProgressStrip } from '../WizardProgressStrip';
import { WizardSkillBar } from '../WizardSkillBar';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

function snapshot(status: WizardStatus): WizardSnapshot {
  const hasDraft = ['review', 'approved', 'exporting', 'completed'].includes(status);
  const approved = ['approved', 'exporting', 'completed'].includes(status);
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    skill: 'PL02',
    status,
    inputRevision: 1,
    draftRevision: hasDraft ? 1 : null,
    renderPayload: { title: 'CR-25' },
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    approvedAt: approved ? '2026-10-28T00:00:00.000Z' : null,
    artifactId: status === 'completed' ? '44444444-4444-4444-8444-444444444444' : null,
    artifactHash: status === 'completed' ? 'a'.repeat(64) : null,
  } as WizardSnapshot;
}

describe('Wizard entry primitives', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`wizard-entry-${crypto.randomUUID()}`);
  });

  it('renders leading content before attachments and composer without changing submit', () => {
    const onSubmit = vi.fn();
    render(
      <ChatInputBar
        db={db}
        leadingContent={<div data-testid="leading">Wizard controls</div>}
        attachedFiles={['design.md']}
        onSubmit={onSubmit}
      />,
    );

    const leading = screen.getByTestId('leading');
    const attachment = screen.getByText('design.md');
    const composer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    expect(leading.compareDocumentPosition(attachment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attachment.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(composer, { target: { value: 'Tin nhắn thường' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    expect(onSubmit).toHaveBeenCalledWith('Tin nhắn thường');
  });

  it('supports one roving tab stop, arrow navigation, and keyboard activation', () => {
    const onActivate = vi.fn();
    render(<WizardSkillBar projectScoped onActivate={onActivate} />);

    const skills = screen.getAllByRole('button');
    expect(skills.map((button) => button.textContent)).toEqual([
      '📋 Soạn PL02',
      '⚙️ Soạn PL03',
      '🔍 Checklist PL07',
      '📢 Tờ trình CAB',
    ]);
    expect(skills.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);

    skills[0]?.focus();
    fireEvent.keyDown(skills[0]!, { key: 'ArrowRight' });
    expect(skills[1]).toHaveFocus();
    expect(skills.map((button) => button.tabIndex)).toEqual([-1, 0, -1, -1]);
    fireEvent.keyDown(skills[1]!, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith('PL03');

    fireEvent.keyDown(skills[1]!, { key: 'End' });
    expect(skills[3]).toHaveFocus();
    fireEvent.keyDown(skills[3]!, { key: ' ' });
    expect(onActivate).toHaveBeenLastCalledWith('CAB');
  });

  it('keeps gated skills focusable with exact tooltips', async () => {
    const onActivate = vi.fn();
    const { rerender } = render(<WizardSkillBar projectScoped={false} onActivate={onActivate} />);
    const first = screen.getByRole('button', { name: 'Soạn PL02 — Tài liệu Đặc tả Chức năng' });
    expect(first).toHaveAttribute('aria-disabled', 'true');
    expect(first).not.toBeDisabled();
    fireEvent.mouseEnter(first);
    expect(await screen.findByText('Chọn phạm vi Dự án để dùng wizard tài liệu.')).toBeInTheDocument();
    fireEvent.click(first);
    expect(onActivate).not.toHaveBeenCalled();

    rerender(<WizardSkillBar projectScoped activeSession onActivate={onActivate} />);
    const activeGate = screen.getByRole('button', { name: 'Soạn PL02 — Tài liệu Đặc tả Chức năng' });
    fireEvent.mouseEnter(activeGate);
    expect(await screen.findByText('Đang trong phiên wizard. Hãy hoàn tất hoặc hủy phiên hiện tại.')).toBeInTheDocument();
  });

  it('prefills metadata, validates required fields, submits parsed values, and restores focus', async () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <>
        <button ref={triggerRef}>Mở PL02</button>
        <WizardMetadataModal
          open
          skill="PL02"
          project={{ id: PROJECT_ID, name: 'Core Banking', code: 'CR-2501' }}
          currentUser="Nguyễn Văn A"
          triggerRef={triggerRef}
          onClose={onClose}
          onStart={onStart}
          today="2026-10-28"
        />
      </>,
    );

    expect(screen.getByText('Thông tin tài liệu')).toBeInTheDocument();
    expect(screen.getByText('PL02 — Tài liệu Đặc tả Chức năng')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã dự án/CR')).toHaveValue('CR-2501');
    expect(screen.getByLabelText('Tên tính năng')).toHaveValue('Core Banking');
    expect(screen.getByLabelText('Người lập')).toHaveValue('Nguyễn Văn A');
    expect(screen.getByLabelText('Ngày lập')).toHaveValue('28/10/2026');

    fireEvent.change(screen.getByLabelText('Mã dự án/CR'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Tên tính năng'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu soạn thảo' }));
    expect(await screen.findByText('Vui lòng nhập Mã dự án/CR.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã dự án/CR')).toHaveFocus();
    expect(onStart).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Mã dự án/CR'), { target: { value: 'CR-2502' } });
    fireEvent.change(screen.getByLabelText('Tên tính năng'), { target: { value: 'Tokenization' } });
    fireEvent.change(screen.getByLabelText('Đơn vị yêu cầu'), { target: { value: 'Khối CNTT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu soạn thảo' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith({
      cr: 'CR-2502',
      featureName: 'Tokenization',
      requestingUnit: 'Khối CNTT',
      author: 'Nguyễn Văn A',
      date: '2026-10-28',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(triggerRef.current).toHaveFocus());
  });
});

describe('Wizard lifecycle primitives', () => {
  it.each([
    ['collecting', 1, 'Thu thập'],
    ['gap_fill', 2, 'Hỏi bù'],
    ['review', 3, 'Soát xét'],
    ['approved', 4, 'Xuất bản'],
    ['exporting', 4, 'Xuất bản'],
    ['completed', 4, 'Xuất bản'],
    ['abandoned', 1, 'Thu thập'],
  ] as const)('maps %s to step %i', (status, step, label) => {
    render(<WizardProgressStrip snapshot={snapshot(status)} />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', String(step));
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(progress).toHaveAttribute('aria-valuetext', `Bước ${step}/4 · ${label}`);
    expect(screen.getByText(`Bước ${step}/4 · ${label}`)).toBeInTheDocument();
    expect(screen.getAllByTestId('wizard-progress-segment')).toHaveLength(4);
    expect(screen.getAllByText(/^(Hoàn thành|Đang thực hiện|Chờ)$/)).toHaveLength(4);
  });

  it('shows restored notice and only abandons after destructive confirmation', async () => {
    const onAbandon = vi.fn();
    render(<WizardLifecycleBar formName="PL03" snapshot={snapshot('gap_fill')} restored onAbandon={onAbandon} />);

    expect(screen.getByText('PL03')).toBeInTheDocument();
    expect(screen.getByText('Bước 2/4')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Wizard đang tiếp tục từ bản nháp. Bấm Hủy Wizard để bắt đầu lại.');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onAbandon).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy Wizard' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Hủy phiên wizard? Bản nháp hiện tại vẫn được giữ trong thread và có thể tiếp tục sau.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp tục làm' }));
    expect(onAbandon).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy Wizard' }));
    const reopened = await screen.findByRole('dialog');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Hủy phiên' }));
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });
});
