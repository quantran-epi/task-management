/**
 * Captures active element ref and returns a function to restore focus.
 * Uses setTimeout 0 to ensure closing animations or modal unmounting do not steal focus (D-30, T-02-07).
 */
export function createFocusRestorer(): () => void {
  const previousActiveElement = (
    typeof document !== 'undefined' ? document.activeElement : null
  ) as HTMLElement | null;

  return () => {
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      setTimeout(() => {
        try {
          previousActiveElement.focus();
        } catch {
          // Element may have unmounted or become disabled
        }
      }, 0);
    }
  };
}
