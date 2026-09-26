import { describe, it, expect } from 'vitest';
import { generateId, isValidUuid } from '../src/utils/uuid';

describe('UUID generator (DATA-01)', () => {
  it('generates valid RFC 4122 v4 UUIDs', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(isValidUuid(id)).toBe(true);
  });

  it('rejects invalid UUID strings and non-string types', () => {
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('12345678-1234-1234-1234-123456789abc')).toBe(false); // v1/non-v4
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(12345)).toBe(false);
  });

  it('produces 1,000 unique valid RFC 4122 v4 UUIDs without collision', () => {
    const iterations = 1000;
    const generated = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      const id = generateId();
      expect(isValidUuid(id)).toBe(true);
      generated.add(id);
    }

    expect(generated.size).toBe(iterations);
  });
});
