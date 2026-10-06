import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { NormalizeDocModal } from '../../../src/components/notes/NormalizeDocModal';
import * as nineRouterClient from '../../../src/services/ai/nineRouterClient';
import * as nineRouterTokenService from '../../../src/services/ai/nineRouterTokenService';

describe('NormalizeDocModal', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`normalize-doc-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
  });

  it('displays warning when API key is not configured', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('');

    render(
      <NormalizeDocModal
        open={true}
        originalContent="Nội dung ban đầu"
        docTitle="Doc 1"
        onClose={vi.fn()}
        onApply={vi.fn()}
        db={db}
      />
    );

    expect(await screen.findByText('Không thể chuẩn hóa qua AI')).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa cấu hình API Key. Vui lòng mở Cài đặt AI để thiết lập API Key./)
    ).toBeInTheDocument();
  });

  it('renders original content in split mode and streams normalized response', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    async function* mockStream() {
      yield '# Tiêu đề chuẩn hóa\n\n';
      yield '## Tóm tắt\nNội dung tóm tắt.';
    }

    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(() => mockStream() as any);

    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <NormalizeDocModal
        open={true}
        originalContent="Nội dung cần chuẩn hóa ban đầu"
        docTitle="Tài liệu kiểm tra"
        onClose={onClose}
        onApply={onApply}
        db={db}
      />
    );

    // Verify modal title
    expect(await screen.findByText(/AI Chuẩn hóa tài liệu \("Tài liệu kiểm tra"\)/)).toBeInTheDocument();

    // Verify original content is displayed
    expect(screen.getByText('Nội dung cần chuẩn hóa ban đầu')).toBeInTheDocument();

    // Wait for streaming completion
    await waitFor(() => {
      expect(screen.getByText(/## Tóm tắt/)).toBeInTheDocument();
    });

    // Accept button should be enabled and apply proposed content
    const acceptBtn = screen.getByRole('button', { name: /chấp nhận/i });
    expect(acceptBtn).not.toBeDisabled();
    fireEvent.click(acceptBtn);

    expect(onApply).toHaveBeenCalledWith('# Tiêu đề chuẩn hóa\n\n## Tóm tắt\nNội dung tóm tắt.');
    expect(onClose).toHaveBeenCalled();
  });

  it('aborts and calls onClose when clicking Hủy', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');

    const onClose = vi.fn();
    render(
      <NormalizeDocModal
        open={true}
        originalContent="Sample text"
        onClose={onClose}
        onApply={vi.fn()}
        db={db}
      />
    );

    const cancelBtn = await screen.findByRole('button', { name: /hủy/i });
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
