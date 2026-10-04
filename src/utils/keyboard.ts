/**
 * Platform-aware keyboard helper utilities for macOS and Windows/Linux.
 */

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as { userAgentData?: { platform?: string }; platform?: string; userAgent?: string };
  if (nav.userAgentData?.platform) {
    return /mac/i.test(nav.userAgentData.platform);
  }
  return /Mac|iPod|iPhone|iPad/.test(nav.platform || nav.userAgent || '');
}

export function isInputFocused(target?: EventTarget | null): boolean {
  const el = (target as HTMLElement | null) ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  if (!el) return false;

  const tagName = el.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (Boolean(el.isContentEditable) || el.getAttribute?.('contenteditable') === 'true' || el.getAttribute?.('contenteditable') === '') {
    return true;
  }

  if (Boolean(el.closest?.('[contenteditable="true"], [contenteditable=""]'))) {
    return true;
  }

  if (el.getAttribute?.('role') === 'textbox') {
    return true;
  }

  return false;
}

export interface ModifierLabels {
  mod: string;
  alt: string;
  shift: string;
}

export function getModifierLabels(): ModifierLabels {
  const isMac = isMacPlatform();
  return {
    mod: isMac ? '⌘' : 'Ctrl',
    alt: isMac ? '⌥' : 'Alt',
    shift: 'Shift',
  };
}

/**
 * Format key combinations for human-readable UI badges.
 * e.g. ['Mod', 'N'] => ['⌘', 'N'] on Mac, ['Ctrl', 'N'] on Windows
 */
export function formatShortcutKeys(keys: string[]): string[] {
  const labels = getModifierLabels();
  return keys.map((k) => {
    if (k === 'Mod') return labels.mod;
    if (k === 'Alt') return labels.alt;
    if (k === 'Shift') return labels.shift;
    return k;
  });
}

/**
 * Test if a KeyboardEvent matches requested modifier combination.
 * 'Mod' translates to metaKey on Mac and ctrlKey on Windows/Linux.
 */
export function isModPressed(e: KeyboardEvent): boolean {
  return isMacPlatform() ? e.metaKey : e.ctrlKey;
}
