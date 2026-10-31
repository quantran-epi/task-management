import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HubExportRow } from '../HubExportRow';

const baseProps = {
  onExport: vi.fn(),
  onRetry: vi.fn(),
};

describe('HubExportRow', () => {
  it('idle renders a primary Xuất .docx button named after the kind', () => {
    const { rerender } = render(<HubExportRow {...baseProps} kind="PL03B" label="PL03B — Tài liệu triển khai" phase="idle" />);
    const button = screen.getByRole('button', { name: 'Xuất PL03B (.docx)' });
    expect(button).toBeEnabled();
    expect(button.className).toContain('ant-btn-primary');

    rerender(<HubExportRow {...baseProps} kind="PL02" label="PL02 — Đặc tả chức năng" phase="idle" />);
    expect(screen.getByRole('button', { name: 'Xuất PL02 (.docx)' })).toBeInTheDocument();

    rerender(<HubExportRow {...baseProps} kind="PL07" label="PL07 — Checklist review" phase="idle" />);
    expect(screen.getByRole('button', { name: 'Xuất PL07 (.docx)' })).toBeInTheDocument();

    rerender(<HubExportRow {...baseProps} kind="CAB" label="Tờ trình CAB" phase="idle" />);
    expect(screen.getByRole('button', { name: 'Xuất CAB (.docx)' })).toBeInTheDocument();
  });

  it('building keeps the button mounted and announces the progress line', () => {
    render(<HubExportRow {...baseProps} kind="PL03B" label="PL03B" phase="building" />);
    const button = screen.getByRole('button', { name: 'Xuất PL03B (.docx)' });
    expect(button).toBeDisabled();
    expect(button.className).toContain('ant-btn-loading');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tạo tệp .docx…');
  });

  it('saved renders the file row and the saved-note banner with no export button', () => {
    render(
      <HubExportRow
        {...baseProps}
        kind="PL07"
        label="PL07"
        phase="saved"
        filename="PL07-CR-1-v2.docx"
        sizeBytes={2048}
        noteId="note-7"
      />
    );
    expect(screen.getByText(/PL07-CR-1-v2\.docx · 2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu thành tài liệu dự án.');
    expect(screen.getByRole('link', { name: 'Mở tài liệu' })).toHaveAttribute('href', '#/notes?doc=note-7');
    expect(screen.queryByRole('button', { name: 'Xuất PL07 (.docx)' })).not.toBeInTheDocument();
  });

  it('saved_download_failed renders the file row and Tải lại tệp wired to onRetry', () => {
    const onRetry = vi.fn();
    render(
      <HubExportRow
        onExport={vi.fn()}
        onRetry={onRetry}
        kind="CAB"
        label="Tờ trình CAB"
        phase="saved_download_failed"
        filename="CAB-CR-1-v1.docx"
        sizeBytes={512}
        noteId="note-9"
      />
    );
    expect(screen.getByText(/CAB-CR-1-v1\.docx · 512 B/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại tệp' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('failed renders the failure alert and Thử lại fires onRetry', () => {
    const onRetry = vi.fn();
    render(<HubExportRow onExport={vi.fn()} onRetry={onRetry} kind="PL02" label="PL02" phase="failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không tạo được tệp .docx. Nội dung Markdown vẫn được giữ trong phiên; thử lại hoặc yêu cầu chỉnh sửa.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never renders Đã lưu when noteId is undefined', () => {
    render(
      <HubExportRow
        {...baseProps}
        kind="PL03B"
        label="PL03B"
        phase="saved"
        filename="PL03B-CR-1-v1.docx"
        sizeBytes={1024}
      />
    );
    expect(screen.getByText(/PL03B-CR-1-v1\.docx · 1\.0 KB/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã lưu thành tài liệu dự án/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mở tài liệu' })).not.toBeInTheDocument();
  });
});
