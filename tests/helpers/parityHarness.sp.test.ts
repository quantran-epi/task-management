import { describe, expect, it } from 'vitest';
import { resolveSp } from './parityEvidence';

/**
 * WR-R2-02: the harness must not pretend it can run from a session-specific
 * /private/tmp default that vanishes on reboot. PARITY_SP is an explicit
 * precondition, resolved lazily so test collection never hard-crashes.
 */
describe('WR-R2-02: PARITY_SP is an explicit precondition', () => {
  it('throws an actionable error when PARITY_SP is missing', () => {
    expect(() => resolveSp({})).toThrow(/PARITY_SP.*required/i);
  });

  it('throws when PARITY_SP is blank', () => {
    expect(() => resolveSp({ PARITY_SP: '   ' })).toThrow(/PARITY_SP.*required/i);
  });

  it('uses the caller-supplied scratchpad root verbatim', () => {
    expect(resolveSp({ PARITY_SP: '/tmp/fixtures' })).toBe('/tmp/fixtures');
  });
});
