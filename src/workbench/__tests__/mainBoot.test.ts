import { describe, it, expect, beforeEach } from 'vitest';
import { shouldBootIntelliJ } from '../../main';

describe('Dual-boot entrypoint detection (shouldBootIntelliJ)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true when ?ui=intellij query param is present and persists flag', () => {
    const result = shouldBootIntelliJ('?ui=intellij');
    expect(result).toBe(true);
    expect(localStorage.getItem('taskmate_ui_shell')).toBe('intellij');
  });

  it('returns false by default when no param and no storage flag exists', () => {
    const result = shouldBootIntelliJ('');
    expect(result).toBe(false);
  });

  it('returns true when localStorage has taskmate_ui_shell=intellij even without query param', () => {
    localStorage.setItem('taskmate_ui_shell', 'intellij');
    const result = shouldBootIntelliJ('');
    expect(result).toBe(true);
  });

  it('resets to default and returns false when ?ui=default is passed', () => {
    localStorage.setItem('taskmate_ui_shell', 'intellij');
    const result = shouldBootIntelliJ('?ui=default');
    expect(result).toBe(false);
    expect(localStorage.getItem('taskmate_ui_shell')).toBeNull();
  });

  it('ignores invalid or unknown query parameter values and falls back safely (T-25.4-07)', () => {
    const result = shouldBootIntelliJ('?ui=malicious<script>');
    expect(result).toBe(false);
    expect(localStorage.getItem('taskmate_ui_shell')).toBeNull();
  });
});
