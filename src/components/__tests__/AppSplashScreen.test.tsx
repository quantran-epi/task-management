import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppSplashScreen } from '../AppSplashScreen';

const MIN_DURATION = 1800;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function progressWidth(container: HTMLElement): string {
  return (container.querySelector('.tm-splash__progress-fill') as HTMLElement).style.width;
}

describe('AppSplashScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('advances the four boot steps at 15/45/80/100 percent', () => {
    const { container } = render(<AppSplashScreen minDuration={MIN_DURATION} />);
    expect(screen.getByText('Đang khởi động')).toBeTruthy();
    expect(progressWidth(container)).toBe('15%');

    advance(MIN_DURATION * 0.3);
    expect(screen.getByText('Đang tải dữ liệu cục bộ')).toBeTruthy();
    expect(progressWidth(container)).toBe('45%');

    advance(MIN_DURATION * 0.35);
    expect(screen.getByText('Đang chuẩn bị giao diện')).toBeTruthy();
    expect(progressWidth(container)).toBe('80%');

    advance(MIN_DURATION * 0.25);
    expect(screen.getByText('Sẵn sàng')).toBeTruthy();
    expect(progressWidth(container)).toBe('100%');
  });

  it('shows the English tagline and percent without IntelliJ branding', () => {
    const { container } = render(<AppSplashScreen minDuration={MIN_DURATION} />);
    expect(screen.getByText('Plan work. Stay clear. Stay local.')).toBeTruthy();
    expect(screen.getByText('15%')).toBeTruthy();
    expect(container.textContent).not.toMatch(/IntelliJ|Islands|Workbench/);
  });

  it('calls onReady exactly once after minDuration + 350ms fade', () => {
    const onReady = vi.fn();
    render(<AppSplashScreen minDuration={MIN_DURATION} onReady={onReady} />);
    advance(MIN_DURATION + 349);
    expect(onReady).not.toHaveBeenCalled();
    advance(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not call onReady after unmount before the fade finishes', () => {
    const onReady = vi.fn();
    const { unmount } = render(<AppSplashScreen minDuration={MIN_DURATION} onReady={onReady} />);
    advance(MIN_DURATION + 100);
    unmount();
    advance(1000);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('honours prefers-reduced-motion via CSS, with no infinite inline animation', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);

    const { container } = render(<AppSplashScreen minDuration={MIN_DURATION} />);
    const root = container.querySelector('.tm-splash') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('style') ?? '').not.toMatch(/animation[^;]*infinite/);
    expect(root.querySelectorAll('[style*="infinite"]').length).toBe(0);

    const css = readFileSync(resolve(process.cwd(), 'src/components/app-splash.css'), 'utf8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.tm-splash__mark\s*\{\s*animation:\s*none/);
    expect(css).toMatch(/\.tm-splash__progress-fill\s*\{\s*transition:\s*none/);
  });
});
