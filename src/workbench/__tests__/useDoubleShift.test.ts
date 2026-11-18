import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDoubleShift } from '../hooks/useDoubleShift';

describe('useDoubleShift', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers callback on double shift press within 350ms', () => {
    const callback = vi.fn();
    renderHook(() => useDoubleShift(callback));

    // First shift press
    const event1 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    window.dispatchEvent(event1);
    expect(callback).not.toHaveBeenCalled();

    // Second shift press within 200ms
    const event2 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    window.dispatchEvent(event2);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not trigger if interval exceeds 350ms', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    renderHook(() => useDoubleShift(callback));

    const event1 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    window.dispatchEvent(event1);

    vi.advanceTimersByTime(400);

    const event2 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    window.dispatchEvent(event2);
    expect(callback).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('ignores repeat events (T-25.4-06)', () => {
    const callback = vi.fn();
    renderHook(() => useDoubleShift(callback));

    const event1 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    window.dispatchEvent(event1);

    const repeatEvent = new KeyboardEvent('keydown', { key: 'Shift', repeat: true, bubbles: true });
    window.dispatchEvent(repeatEvent);

    expect(callback).not.toHaveBeenCalled();
  });

  it('does not trigger when focused on input, textarea, or contentEditable', () => {
    const callback = vi.fn();
    renderHook(() => useDoubleShift(callback));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event1 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    input.dispatchEvent(event1);

    const event2 = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true });
    input.dispatchEvent(event2);

    expect(callback).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
