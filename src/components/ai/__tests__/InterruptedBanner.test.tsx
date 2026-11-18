import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InterruptedBanner } from '../InterruptedBanner';

describe('InterruptedBanner (ordinary-chat interrupted runtime)', () => {
  it('renders the generic interrupted copy when no message is given', () => {
    render(<InterruptedBanner onContinue={vi.fn()} onDiscard={vi.fn()} />);

    expect(
      screen.getByText('Yêu cầu trước bị gián đoạn khi ứng dụng đóng.')
    ).toBeInTheDocument();
  });

  it('lets a message prop override the generic copy', () => {
    render(
      <InterruptedBanner
        message="Phiên trước bị đóng đột ngột."
        onContinue={vi.fn()}
        onDiscard={vi.fn()}
      />
    );

    expect(screen.getByText('Phiên trước bị đóng đột ngột.')).toBeInTheDocument();
    expect(
      screen.queryByText('Yêu cầu trước bị gián đoạn khi ứng dụng đóng.')
    ).not.toBeInTheDocument();
  });

  it('calls onContinue once and onDiscard once', () => {
    const onContinue = vi.fn();
    const onDiscard = vi.fn();
    render(<InterruptedBanner onContinue={onContinue} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('renders no SDLC copy anywhere in its output', () => {
    const { container } = render(
      <InterruptedBanner onContinue={vi.fn()} onDiscard={vi.fn()} />
    );

    expect(container.textContent ?? '').not.toContain('SDLC');
  });
});
