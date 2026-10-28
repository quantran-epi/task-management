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

  it('strips <think>...</think> blocks and unclosed <think> streaming chunks', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'deepseek-r1',
      charLimit: 12000,
    });

    async function* mockStream() {
      yield '<think>Đang suy nghĩ cấu trúc chuẩn hóa...</think>';
      yield '# Tiêu đề chuẩn hóa\n\n';
      yield '<think>Suy nghĩ thêm về nội dung'; // mid-stream unclosed think
      yield ' - nội dung suy nghĩ tiếp</think>';
      yield 'Nội dung thực tế sau chuẩn hóa.';
    }

    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(() => mockStream() as any);

    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <NormalizeDocModal
        open={true}
        originalContent="Nội dung kiểm tra lọc think"
        docTitle="Doc Think Strip"
        onClose={onClose}
        onApply={onApply}
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Nội dung thực tế sau chuẩn hóa\./)).toBeInTheDocument();
    });

    // Ensure thinking content is NOT rendered
    expect(screen.queryByText(/Đang suy nghĩ cấu trúc/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nội dung suy nghĩ tiếp/)).not.toBeInTheDocument();

    const acceptBtn = screen.getByRole('button', { name: /chấp nhận/i });
    fireEvent.click(acceptBtn);

    expect(onApply).toHaveBeenCalledWith(
      '# Tiêu đề chuẩn hóa\n\nNội dung thực tế sau chuẩn hóa.'
    );
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

  it('passes modernized AI_KNOWLEDGE_DOC_PROMPT with THU_TU and TEN_BUOC guidelines without mandatory STEP_ID', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let capturedPayload: any = null;
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(({ payload }) => {
      capturedPayload = payload;
      async function* emptyStream() {
        yield '# Tiêu đề\n\nNội dung';
      }
      return emptyStream() as any;
    });

    render(
      <NormalizeDocModal
        open={true}
        originalContent="Nội dung cần kiểm tra prompt"
        docTitle="Doc Kiểm Tra Prompt"
        onClose={vi.fn()}
        onApply={vi.fn()}
        db={db}
      />
    );

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull();
    });

    const systemMessage = capturedPayload.messages.find((m: any) => m.role === 'system')?.content || '';
    const userMessage = capturedPayload.messages.find((m: any) => m.role === 'user')?.content || '';

    // Verify system prompt features THU_TU, TEN_BUOC, TARGET, WRITES, GHI_CHU
    expect(systemMessage).toContain('| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |');
    expect(systemMessage).toContain('THU_TU / ORDER');
    expect(systemMessage).toContain('TEN_BUOC / PROCEDURE');
    expect(systemMessage).toContain('TARGET');
    expect(systemMessage).toContain('WRITES / GHI / TARGET_TABLE');
    expect(systemMessage).toContain('TUYỆT ĐỐI KHÔNG tự bịa hoặc tự sinh mã giả như STEP_01, STEP_02');

    // Verify source-fidelity guardrails and missing-information markers
    expect(systemMessage).toContain('TRUNG THÀNH TUYỆT ĐỐI VỚI NGUỒN');
    expect(systemMessage).toContain('TUYỆT ĐỐI KHÔNG tự tạo hoặc suy diễn');
    expect(systemMessage).toContain('[THIẾU THÔNG TIN:');
    expect(systemMessage).toContain('[CHƯA XÁC MINH:');
    expect(systemMessage).toContain('KHÔNG bịa nội dung để lấp chỗ trống');

    // Verify fabricated template seeds are gone
    expect(systemMessage).not.toContain('SD-XXXXX');
    expect(systemMessage).not.toContain('MAIN1.PKG_PAYMENT.EXECUTE_PAYMENT');
    expect(systemMessage).not.toContain('CYTP1002');

    // Verify user prompt instructs not to fabricate STEP_ID and use standard columns
    expect(userMessage).toContain('THU_TU, TEN_BUOC, TARGET, WRITES, GHI_CHU');
    expect(userMessage).toContain('Không tự sinh mã giả STEP_ID nếu tài liệu gốc không có mã bước cũ');
    expect(userMessage).toContain('Không bịa hoặc suy diễn');
    expect(userMessage).toContain('[THIẾU THÔNG TIN:');
  });
});
