import { describe, it, expect, vi } from 'vitest';
import { createFocusRestorer } from '../../src/utils/focus';

describe('createFocusRestorer', () => {
  it('captures activeElement and restores focus upon trigger invocation per D-30', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();

    expect(document.activeElement).toBe(button);

    const restore = createFocusRestorer();

    // Move focus away to another element
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    // Call restore
    restore();

    // Uses setTimeout(..., 0) for DOM settling
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.activeElement).toBe(button);

    // Cleanup
    document.body.removeChild(button);
    document.body.removeChild(input);
  });

  it('safely handles null or disconnected activeElement', () => {
    expect(() => {
      const restore = createFocusRestorer();
      restore();
    }).not.toThrow();
  });
});
