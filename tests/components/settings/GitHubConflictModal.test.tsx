import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GitHubConflictModal } from '../../../src/components/settings/GitHubConflictModal';

describe('GitHubConflictModal', () => {
  const defaultProps = {
    open: true,
    remoteSha: 'abc1234567890abcdef',
    localSha: 'fedcba0987654321fed',
    onPullAndPreview: vi.fn(),
    onForceOverwrite: vi.fn(),
    onCancel: vi.fn(),
  };

  it('displays warning alert with 7-char truncated remote SHA and local recorded SHA', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    expect(screen.getByText('Xung đột bản sao lưu từ xa')).toBeInTheDocument();
    // 7-char truncated SHAs
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.getByText(/fedcba0/)).toBeInTheDocument();
  });

  it('renders three explicit action buttons', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Hủy bỏ' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tải và xem trước bản remote' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ghi đè bản remote bằng dữ liệu máy này' })
    ).toBeInTheDocument();
  });

  it('keeps force overwrite button strictly disabled by default', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    const overwriteBtn = screen.getByRole('button', {
      name: 'Ghi đè bản remote bằng dữ liệu máy này',
    });
    expect(overwriteBtn).toBeDisabled();
  });

  it('leaves force overwrite button disabled when typing anything other than exact OVERWRITE', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    const input = screen.getByLabelText('Xác nhận từ khóa OVERWRITE');
    fireEvent.change(input, { target: { value: 'overwrite' } });

    const overwriteBtn = screen.getByRole('button', {
      name: 'Ghi đè bản remote bằng dữ liệu máy này',
    });
    expect(overwriteBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'OVERWRITE ' } });
    expect(overwriteBtn).toBeDisabled();
  });

  it('enables overwrite button when exact string OVERWRITE is typed and triggers onForceOverwrite on click', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    const input = screen.getByLabelText('Xác nhận từ khóa OVERWRITE');
    fireEvent.change(input, { target: { value: 'OVERWRITE' } });

    const overwriteBtn = screen.getByRole('button', {
      name: 'Ghi đè bản remote bằng dữ liệu máy này',
    });
    expect(overwriteBtn).toBeEnabled();

    fireEvent.click(overwriteBtn);
    expect(defaultProps.onForceOverwrite).toHaveBeenCalledTimes(1);
  });

  it('triggers onPullAndPreview when clicking Pull & Preview button', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    const pullBtn = screen.getByRole('button', {
      name: 'Tải và xem trước bản remote',
    });
    fireEvent.click(pullBtn);
    expect(defaultProps.onPullAndPreview).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when clicking Cancel button', () => {
    render(<GitHubConflictModal {...defaultProps} />);

    const cancelBtn = screen.getByRole('button', { name: 'Hủy bỏ' });
    fireEvent.click(cancelBtn);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });
});
