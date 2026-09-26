import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates strict YYYY-MM-DD calendar date string.
 * Rejects ISO timestamps, Date objects, time-bearing strings, and invalid days (DATA-03, T-01-01).
 */
export function isValidCalendarDate(val: unknown): boolean {
  if (typeof val !== 'string') {
    return false;
  }
  if (!DATE_REGEX.test(val)) {
    return false;
  }
  return dayjs(val, 'YYYY-MM-DD', true).isValid();
}

/**
 * Returns today's calendar date as a strict YYYY-MM-DD string.
 */
export function getTodayDateString(): string {
  return dayjs().format('YYYY-MM-DD');
}

/**
 * Validates whether the given value is a non-negative integer minute count.
 */
export function isValidMinutes(minutes: unknown): boolean {
  return typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0;
}

/**
 * Converts hours to non-negative integer minutes.
 * Throws RangeError if hours is negative or not a finite number.
 */
export function toMinutes(hours: number): number {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    throw new RangeError('Hours must be a non-negative finite number');
  }
  return Math.round(hours * 60);
}
