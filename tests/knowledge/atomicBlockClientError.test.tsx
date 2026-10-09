// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublishPreviewModal } from '../../src/components/knowledge/PublishPreviewModal';
import {
  formatOversizedAtomicBlockError,
  PublishProgressPanel,
} from '../../src/components/knowledge/PublishProgressPanel';
import type { ChangePreview } from '../../src/services/knowledge/changePreview';

const RAW_CANARY = 'SELECT secret FROM customers';
const atomicError = {
  code: 'OVERSIZED_ATOMIC_BLOCK',
  message: 'Atomic Markdown block exceeds safe limit.',
  blockType: 'code',
  line: 7,
  column: 5,
  limit: 50_000,
};

const preview = {
  setId: 'set-a',
  documents: [],
  chunks: [],
  counts: {
    documentsAdded: 0,
    documentsChanged: 0,
    documentsRemoved: 0,
    documentsUnchanged: 0,
    chunksAdded: 0,
    chunksChanged: 0,
    chunksRemoved: 0,
    chunksUnchanged: 0,
  },
  hasRemovals: false,
  snapshot: {
    setId: 'set-a',
    setName: 'Set A',
    chunkingPolicyVersion: 'v1',
    documents: [],
  },
} satisfies ChangePreview;

describe('oversized atomic block client errors', () => {
  it('formats preview errors with safe structured location and split guidance', () => {
    const message = formatOversizedAtomicBlockError({ ...atomicError, rawContent: RAW_CANARY });

    expect(message).toContain('Khối code');
    expect(message).toContain('50,000 ký tự');
    expect(message).toContain('dòng 7, cột 5');
    expect(message).toContain('Vui lòng chia nhỏ khối trước khi xuất bản');
    expect(message).not.toContain(RAW_CANARY);
  });

  it('renders structured server poll failures without raw Markdown content', async () => {
    const session = {
      confirmRemoval: vi.fn(),
      cancelRemoval: vi.fn(),
      scan: vi.fn(async () => []),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-1' })),
      submitConfirmedAttempt: vi.fn(async () => ({ attemptId: 'attempt-1', status: 'Publishing' as const })),
      pollAcceptedAttempt: vi.fn(async () => ({
        attemptId: 'attempt-1',
        setId: 'set-a',
        status: 'Failed' as const,
        uncertain: false,
        error: { ...atomicError, rawContent: RAW_CANARY },
      })),
      closePreview: vi.fn(),
    };

    render(<PublishPreviewModal open preview={preview} session={session as never} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất bản bộ tài liệu' }));

    expect(await screen.findByText(/Khối code vượt quá giới hạn an toàn 50,000 ký tự/)).toBeInTheDocument();
    expect(screen.getByText(/dòng 7, cột 5/)).toBeInTheDocument();
    expect(screen.getByText(/Vui lòng chia nhỏ khối trước khi xuất bản/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(RAW_CANARY);
  });

  it('renders atomic metadata directly in the failure panel', () => {
    render(<PublishProgressPanel status="Failed" error={atomicError} onClose={vi.fn()} />);

    expect(screen.getByText(/50,000 ký tự/)).toBeInTheDocument();
    expect(screen.getByText(/dòng 7, cột 5/)).toBeInTheDocument();
    expect(screen.getByText(/chia nhỏ khối/)).toBeInTheDocument();
  });
});
