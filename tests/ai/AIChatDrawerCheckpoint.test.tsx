import { describe, expect, it, vi } from 'vitest';
import { InterruptedBanner } from '../../src/components/ai/InterruptedBanner';
import { RestoredSourceNotice } from '../../src/components/ai/RestoredSourceNotice';
import { render, screen } from '@testing-library/react';

const checkpoint = {
  requestId: '11111111-1111-4111-8111-111111111111',
  step: 'SOLUTION' as const,
  status: 'running' as const,
  startedAt: '2026-10-30T00:00:00.000Z',
};

describe('SDLC checkpoint restore contract', () => {
  it('renders explicit continue and discard actions for restored work', () => {
    const onContinue = vi.fn();
    const onDiscard = vi.fn();
    render(<InterruptedBanner checkpoint={{ ...checkpoint, status: 'interrupted' }} onContinue={onContinue} onDiscard={onDiscard} />);

    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bỏ qua' })).toBeTruthy();
    expect(screen.queryByText(/đang phát/i)).toBeNull();
  });

  it('shows missing source titles and does not provide an automatic action', () => {
    render(<RestoredSourceNotice missingSources={[{ id: 'missing-1', title: 'PL01 nguồn cũ' }]} />);

    expect(screen.getByRole('status')).toHaveTextContent('PL01 nguồn cũ');
    expect(screen.queryByRole('button', { name: /chạy|tiếp tục/i })).toBeNull();
  });
});
