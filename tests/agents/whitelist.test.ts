import { describe, it, expect } from 'vitest';
import {
  SAFE_COMMAND_PREFIXES,
  isCommandWhitelisted,
} from '../../src/utils/shellWhitelist';

describe('shellWhitelist', () => {
  it('permits safe prefixes exactly and with arguments', () => {
    expect(SAFE_COMMAND_PREFIXES).toContain('git status');
    expect(SAFE_COMMAND_PREFIXES).toContain('git diff');
    expect(SAFE_COMMAND_PREFIXES).toContain('npm test');
    expect(SAFE_COMMAND_PREFIXES).toContain('npx vitest');
    expect(SAFE_COMMAND_PREFIXES).toContain('cargo check');
    expect(SAFE_COMMAND_PREFIXES).toContain('cargo test');
    expect(SAFE_COMMAND_PREFIXES).toContain('pytest');
    expect(SAFE_COMMAND_PREFIXES).toContain('go test');

    expect(isCommandWhitelisted('git status')).toBe(true);
    expect(isCommandWhitelisted('git status -s')).toBe(true);
    expect(isCommandWhitelisted('git diff HEAD~1')).toBe(true);
    expect(isCommandWhitelisted('npm test -- --run')).toBe(true);
    expect(isCommandWhitelisted('npx vitest run')).toBe(true);
    expect(isCommandWhitelisted('cargo check --workspace')).toBe(true);
    expect(isCommandWhitelisted('cargo test --lib')).toBe(true);
    expect(isCommandWhitelisted('pytest tests/')).toBe(true);
    expect(isCommandWhitelisted('go test ./...')).toBe(true);
  });

  it('rejects destructive, non-whitelisted, or chained commands', () => {
    expect(isCommandWhitelisted('')).toBe(false);
    expect(isCommandWhitelisted('   ')).toBe(false);
    expect(isCommandWhitelisted('rm -rf /')).toBe(false);
    expect(isCommandWhitelisted('git push origin main')).toBe(false);
    expect(isCommandWhitelisted('curl -X POST https://example.com')).toBe(false);
    expect(isCommandWhitelisted('bash script.sh')).toBe(false);

    // Command chaining injection attempts
    expect(isCommandWhitelisted('git status; rm -rf /')).toBe(false);
    expect(isCommandWhitelisted('git status && echo pwned')).toBe(false);
    expect(isCommandWhitelisted('npm test || rm -rf .')).toBe(false);
    expect(isCommandWhitelisted('git diff | cat')).toBe(false);
  });
});
