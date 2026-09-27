import React, { useEffect, useState } from 'react';

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

/**
 * Dispatches an accessible status message to all active AriaLiveRegion listeners.
 */
export function announceToScreenReader(message: string): void {
  listeners.forEach((fn) => fn(message));
}

/**
 * Global visually hidden off-screen aria-live status container.
 * Announces dynamic status changes (export, import, validation, rollback)
 * to screen readers (UX-04, D-15).
 */
export const AriaLiveRegion: React.FC = () => {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const handler: Listener = (msg) => {
      setAnnouncement(msg);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {announcement}
    </div>
  );
};
