import { useEffect, useRef } from 'react';

/**
 * useDoubleShift
 * High-performance standalone Shift double-tap detector (<350ms).
 *
 * T-25.4-06: Guards against key repetition events (e.repeat) to prevent event flooding.
 * Ignores when focus is inside text input, textarea, or contentEditable.
 */
export function useDoubleShift(onDoubleShift: () => void, timeoutMs: number = 350): void {
  const lastShiftTimeRef = useRef<number>(0);
  const callbackRef = useRef(onDoubleShift);
  callbackRef.current = onDoubleShift;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // T-25.4-06: Guard against key repetition
      if (e.repeat) return;

      if (e.key === 'Shift') {
        const target = e.target;
        if (target instanceof HTMLElement) {
          const tagName = target.tagName.toLowerCase();
          const isEditable =
            tagName === 'input' ||
            tagName === 'textarea' ||
            target.isContentEditable ||
            target.getAttribute('role') === 'textbox';

          if (isEditable) {
            lastShiftTimeRef.current = 0;
            return;
          }
        }

        const now = Date.now();
        if (now - lastShiftTimeRef.current <= timeoutMs && lastShiftTimeRef.current > 0) {
          lastShiftTimeRef.current = 0;
          callbackRef.current();
        } else {
          lastShiftTimeRef.current = now;
        }
      } else {
        // Any other key clears double-shift sequence
        lastShiftTimeRef.current = 0;
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [timeoutMs]);
}
