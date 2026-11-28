import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChatStandaloneSplash } from '../ChatStandaloneSplash';

const MIN_DURATION = 1800;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function progressWidth(container: HTMLElement): string {
  return (container.querySelector('.tm-chat-splash__progress-fill') as HTMLElement).style.width;
}

describe('ChatStandaloneSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('advances the four chat boot steps at 15/45/80/100 percent', () => {
    const { container } = render(<ChatStandaloneSplash minDuration={MIN_DURATION} />);
    expect(screen.getByText('Đang khởi động')).toBeTruthy();
    expect(progressWidth(container)).toBe('15%');

    advance(MIN_DURATION * 0.3);
    expect(screen.getByText('Đang kết nối cấu hình')).toBeTruthy();
    expect(progressWidth(container)).toBe('45%');

    advance(MIN_DURATION * 0.35);
    expect(screen.getByText('Đang chuẩn bị hội thoại')).toBeTruthy();
    expect(progressWidth(container)).toBe('80%');

    advance(MIN_DURATION * 0.25);
    expect(screen.getByText('Sẵn sàng')).toBeTruthy();
    expect(progressWidth(container)).toBe('100%');
  });

  it('renders chat-only identity without app splash or Workbench copy', () => {
    const { container } = render(<ChatStandaloneSplash minDuration={MIN_DURATION} />);
    expect(screen.getByText('TaskMate Chat')).toBeTruthy();
    expect(screen.getByText('Không gian hội thoại riêng')).toBeTruthy();
    expect(screen.getByText('15%')).toBeTruthy();
    expect(container.querySelector('.tm-chat-splash')).not.toBeNull();
    expect(container.querySelector('.tm-splash')).toBeNull();
    expect(container.textContent).not.toMatch(/Plan work|Workbench|Personal Workload Planner/);
  });

  it('calls onReady exactly once after minDuration + 350ms fade', () => {
    const onReady = vi.fn();
    render(<ChatStandaloneSplash minDuration={MIN_DURATION} onReady={onReady} />);
    advance(MIN_DURATION + 349);
    expect(onReady).not.toHaveBeenCalled();
    advance(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('fades before calling onReady', () => {
    const { container } = render(<ChatStandaloneSplash minDuration={MIN_DURATION} />);
    advance(MIN_DURATION);
    expect(container.querySelector('.tm-chat-splash--fading')).not.toBeNull();
  });

  it('cleans up timers on unmount before the fade finishes', () => {
    const onReady = vi.fn();
    const { unmount } = render(
      <ChatStandaloneSplash minDuration={MIN_DURATION} onReady={onReady} />
    );
    advance(MIN_DURATION + 100);
    unmount();
    advance(1000);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('uses its own CSS namespace with light/dark, responsive and reduced-motion rules', () => {
    const { container } = render(<ChatStandaloneSplash minDuration={MIN_DURATION} />);
    const root = container.querySelector('.tm-chat-splash') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('style') ?? '').not.toMatch(/animation[^;]*infinite/);
    expect(root.querySelectorAll('[style*="infinite"]').length).toBe(0);

    const css = readFileSync(
      resolve(process.cwd(), 'src/components/chat-standalone-splash.css'),
      'utf8'
    );
    expect(css).toContain("[data-theme='dark'] .tm-chat-splash");
    expect(css).toContain("[data-theme='light'] .tm-chat-splash");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.tm-chat-splash__mark\s*\{\s*animation:\s*none/);
    expect(css).toMatch(/\.tm-chat-splash__progress-fill\s*\{\s*transition:\s*none/);
    for (const width of ['768px', '375px']) {
      expect(css).toContain(`@media (max-width: ${width})`);
    }
    expect(css).not.toContain('.tm-splash');
  });
});
