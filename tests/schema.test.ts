import { describe, it, expect } from 'vitest';
import {
  DATE_REGEX,
  isValidCalendarDate,
  getTodayDateString,
  isValidMinutes,
  toMinutes,
} from '../src/utils/date';

describe('Date & Minute Schema Validation (DATA-03)', () => {
  describe('isValidCalendarDate', () => {
    it('accepts strictly formatted YYYY-MM-DD calendar dates', () => {
      expect(isValidCalendarDate('2026-09-26')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // leap year
      expect(isValidCalendarDate('2000-01-01')).toBe(true);
      expect(isValidCalendarDate('2099-12-31')).toBe(true);
    });

    it('rejects invalid calendar days', () => {
      expect(isValidCalendarDate('2026-02-29')).toBe(false); // non-leap year
      expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidCalendarDate('2026-13-01')).toBe(false); // month 13
      expect(isValidCalendarDate('2026-00-10')).toBe(false); // month 0
      expect(isValidCalendarDate('2026-05-00')).toBe(false); // day 0
      expect(isValidCalendarDate('2026-05-32')).toBe(false); // day 32
    });

    it('rejects ISO timestamps, Date objects, time-bearing strings, and slashes', () => {
      expect(isValidCalendarDate('2026-09-26T12:00:00Z')).toBe(false);
      expect(isValidCalendarDate('2026-09-26T00:00:00.000Z')).toBe(false);
      expect(isValidCalendarDate('2026/09/26')).toBe(false);
      expect(isValidCalendarDate('26-09-2026')).toBe(false);
      expect(isValidCalendarDate(new Date() as unknown)).toBe(false);
      expect(isValidCalendarDate(null)).toBe(false);
      expect(isValidCalendarDate(undefined)).toBe(false);
      expect(isValidCalendarDate(123456789)).toBe(false);
    });
  });

  describe('getTodayDateString', () => {
    it('returns a valid calendar date matching DATE_REGEX', () => {
      const today = getTodayDateString();
      expect(DATE_REGEX.test(today)).toBe(true);
      expect(isValidCalendarDate(today)).toBe(true);
    });
  });

  describe('isValidMinutes', () => {
    it('accepts non-negative integers', () => {
      expect(isValidMinutes(0)).toBe(true);
      expect(isValidMinutes(30)).toBe(true);
      expect(isValidMinutes(480)).toBe(true);
      expect(isValidMinutes(10000)).toBe(true);
    });

    it('rejects negative numbers, floats, NaN, infinity, and non-numbers', () => {
      expect(isValidMinutes(-1)).toBe(false);
      expect(isValidMinutes(-480)).toBe(false);
      expect(isValidMinutes(30.5)).toBe(false);
      expect(isValidMinutes(NaN)).toBe(false);
      expect(isValidMinutes(Infinity)).toBe(false);
      expect(isValidMinutes('480')).toBe(false);
      expect(isValidMinutes(null)).toBe(false);
      expect(isValidMinutes(undefined)).toBe(false);
    });
  });

  describe('toMinutes', () => {
    it('converts non-negative finite hours to integer minutes', () => {
      expect(toMinutes(0)).toBe(0);
      expect(toMinutes(1)).toBe(60);
      expect(toMinutes(8)).toBe(480);
      expect(toMinutes(1.5)).toBe(90);
      expect(toMinutes(0.25)).toBe(15);
    });

    it('throws RangeError for negative numbers, NaN, or non-finite values', () => {
      expect(() => toMinutes(-1)).toThrow(RangeError);
      expect(() => toMinutes(NaN)).toThrow(RangeError);
      expect(() => toMinutes(Infinity)).toThrow(RangeError);
      expect(() => toMinutes('8' as unknown as number)).toThrow(RangeError);
    });
  });
});
