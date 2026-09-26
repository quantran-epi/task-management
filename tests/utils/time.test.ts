import { describe, it, expect } from 'vitest';
import {
  parseQuickAddInput,
  formatMinutes,
  validateMinutes,
} from '../../src/utils/time';

describe('Time Utilities (D-22, D-23, D-24, T-02-04)', () => {
  describe('parseQuickAddInput', () => {
    it('parses ~Xh syntax into minutes', () => {
      const result = parseQuickAddInput('Draft RFC ~2h');
      expect(result.name).toBe('Draft RFC');
      expect(result.estimateMinutes).toBe(120);
    });

    it('parses ~Ym syntax into minutes', () => {
      const result = parseQuickAddInput('Review PR ~45m');
      expect(result.name).toBe('Review PR');
      expect(result.estimateMinutes).toBe(45);
    });

    it('parses ~Xh Ym syntax into minutes', () => {
      const result = parseQuickAddInput('Fix bug ~1h 30m');
      expect(result.name).toBe('Fix bug');
      expect(result.estimateMinutes).toBe(90);
    });

    it('handles input with no estimate', () => {
      const result = parseQuickAddInput('Task with no estimate');
      expect(result.name).toBe('Task with no estimate');
      expect(result.estimateMinutes).toBe(0);
    });

    it('handles ~ with whitespace correctly', () => {
      const result = parseQuickAddInput('Refactor backend ~ 3h  15m ');
      expect(result.name).toBe('Refactor backend');
      expect(result.estimateMinutes).toBe(195);
    });

    it('clamps estimates to max 6000 minutes per D-24', () => {
      const result = parseQuickAddInput('Huge migration ~200h');
      expect(result.name).toBe('Huge migration');
      expect(result.estimateMinutes).toBe(6000);
    });

    it('handles empty input gracefully', () => {
      const result = parseQuickAddInput('');
      expect(result.name).toBe('');
      expect(result.estimateMinutes).toBe(0);
    });

    it('handles input with only tilde symbol gracefully', () => {
      const result = parseQuickAddInput('Task with ~ alone');
      expect(result.estimateMinutes).toBe(0);
      expect(result.name).toBe('Task with ~ alone');
    });
  });

  describe('formatMinutes', () => {
    it('formats 0 as 0m', () => {
      expect(formatMinutes(0)).toBe('0m');
      expect(formatMinutes(-5)).toBe('0m');
    });

    it('formats minutes under 1 hour', () => {
      expect(formatMinutes(45)).toBe('45m');
      expect(formatMinutes(1)).toBe('1m');
    });

    it('formats exact hours without minutes', () => {
      expect(formatMinutes(60)).toBe('1h');
      expect(formatMinutes(120)).toBe('2h');
    });

    it('formats mixed hours and minutes', () => {
      expect(formatMinutes(150)).toBe('2h 30m');
      expect(formatMinutes(95)).toBe('1h 35m');
    });
  });

  describe('validateMinutes', () => {
    it('accepts integer minutes between 0 and 6000', () => {
      expect(validateMinutes(0)).toBe(true);
      expect(validateMinutes(60)).toBe(true);
      expect(validateMinutes(6000)).toBe(true);
    });

    it('rejects negative numbers, non-integers, and values over 6000', () => {
      expect(validateMinutes(-1)).toBe(false);
      expect(validateMinutes(6001)).toBe(false);
      expect(validateMinutes(12.5)).toBe(false);
      expect(validateMinutes(NaN)).toBe(false);
      expect(validateMinutes(Infinity)).toBe(false);
      expect(validateMinutes('60')).toBe(false);
    });
  });
});
