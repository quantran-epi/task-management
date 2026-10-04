import { describe, it, expect } from 'vitest';
import {
  isMacPlatform,
  isInputFocused,
  getModifierLabels,
  formatShortcutKeys,
  isModPressed,
} from '../../src/utils/keyboard';

describe('keyboard utils', () => {
  it('returns appropriate modifier labels for platform', () => {
    const labels = getModifierLabels();
    expect(labels).toHaveProperty('mod');
    expect(labels).toHaveProperty('alt');
    expect(labels).toHaveProperty('shift');
    expect(labels.shift).toBe('Shift');
  });

  it('formats shortcut keys replacing Mod and Alt', () => {
    const formatted = formatShortcutKeys(['Mod', 'Shift', 'N']);
    expect(formatted.length).toBe(3);
    expect(formatted[1]).toBe('Shift');
    expect(formatted[2]).toBe('N');
    expect(['⌘', 'Ctrl']).toContain(formatted[0]);
  });

  it('detects input focus accurately', () => {
    const div = document.createElement('div');
    expect(isInputFocused(div)).toBe(false);

    const input = document.createElement('input');
    expect(isInputFocused(input)).toBe(true);

    const textarea = document.createElement('textarea');
    expect(isInputFocused(textarea)).toBe(true);

    const contentEditable = document.createElement('div');
    contentEditable.setAttribute('contenteditable', 'true');
    expect(isInputFocused(contentEditable)).toBe(true);
  });

  it('detects mod key pressed based on platform', () => {
    const isMac = isMacPlatform();
    const eventWithMeta = new KeyboardEvent('keydown', { metaKey: true });
    const eventWithCtrl = new KeyboardEvent('keydown', { ctrlKey: true });

    if (isMac) {
      expect(isModPressed(eventWithMeta)).toBe(true);
      expect(isModPressed(eventWithCtrl)).toBe(false);
    } else {
      expect(isModPressed(eventWithCtrl)).toBe(true);
      expect(isModPressed(eventWithMeta)).toBe(false);
    }
  });
});
