import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GitHubPassphraseModal } from '../../../src/components/settings/GitHubPassphraseModal';
import * as githubSyncService from '../../../src/services/github/githubSyncService';

vi.mock('../../../src/services/github/githubSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof githubSyncService>();
  return {
    ...actual,
    downloadRawEncryptedBackup: vi.fn(),
  };
});

describe('GitHubPassphraseModal', () => {
  it('renders modal with title, password input, and buttons when open', () => {
    render(
      <GitHubPassphraseModal
        open={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Nhập mật khẩu giải mã GitHub')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu giải mã')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hủy bỏ/i })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Giải mã và xem trước/i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button and calls onSubmit when passphrase is typed and submitted', () => {
    const handleSubmit = vi.fn();
    render(
      <GitHubPassphraseModal
        open={true}
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Mật khẩu giải mã');
    fireEvent.change(input, { target: { value: 'my-secret-passphrase' } });

    const submitBtn = screen.getByRole('button', { name: /Giải mã và xem trước/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledWith('my-secret-passphrase');
  });

  it('renders error alert when error message is provided', () => {
    const errorMsg = 'Mật khẩu giải mã không chính xác hoặc tệp sao lưu đã bị thay đổi.';
    render(
      <GitHubPassphraseModal
        open={true}
        error={errorMsg}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Lỗi giải mã')).toBeInTheDocument();
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it('renders raw download button when rawEncryptedJson is present and triggers download', () => {
    const rawJson = '{"app":"personal-task-planner","format":"encrypted-v1","ciphertext":"abc"}';
    const handleDownloadRaw = vi.fn();

    render(
      <GitHubPassphraseModal
        open={true}
        rawEncryptedJson={rawJson}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onDownloadRaw={handleDownloadRaw}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /Tải tệp thô về máy/i });
    expect(downloadBtn).toBeInTheDocument();

    fireEvent.click(downloadBtn);
    expect(handleDownloadRaw).toHaveBeenCalled();
  });

  it('triggers default downloadRawEncryptedBackup if onDownloadRaw prop is not provided', () => {
    const rawJson = '{"app":"personal-task-planner","format":"encrypted-v1"}';

    render(
      <GitHubPassphraseModal
        open={true}
        rawEncryptedJson={rawJson}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /Tải tệp thô về máy/i });
    fireEvent.click(downloadBtn);

    expect(githubSyncService.downloadRawEncryptedBackup).toHaveBeenCalledWith(rawJson);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <GitHubPassphraseModal
        open={true}
        onSubmit={vi.fn()}
        onCancel={handleCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Hủy bỏ/i });
    fireEvent.click(cancelBtn);

    expect(handleCancel).toHaveBeenCalled();
  });
});
