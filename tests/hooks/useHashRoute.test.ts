import { describe, it, expect } from 'vitest';
import { parseHash, buildHash } from '../../src/hooks/useHashRoute';

describe('useHashRoute utilities', () => {
  describe('parseHash', () => {
    it('returns defaultRoute and empty params for empty or missing hash', () => {
      expect(parseHash('')).toEqual({ route: 'dashboard', params: {} });
      expect(parseHash('#')).toEqual({ route: 'dashboard', params: {} });
      expect(parseHash('#/')).toEqual({ route: 'dashboard', params: {} });
      expect(parseHash('', 'tasks')).toEqual({ route: 'tasks', params: {} });
    });

    it('parses basic routes without query parameters', () => {
      expect(parseHash('#/tasks')).toEqual({ route: 'tasks', params: {} });
      expect(parseHash('#/projects')).toEqual({ route: 'projects', params: {} });
      expect(parseHash('#/planner')).toEqual({ route: 'planner', params: {} });
      expect(parseHash('#/analytics')).toEqual({ route: 'analytics', params: {} });
      expect(parseHash('#/settings')).toEqual({ route: 'settings', params: {} });
      expect(parseHash('#/dashboard')).toEqual({ route: 'dashboard', params: {} });
    });

    it('parses routes with query parameters', () => {
      expect(parseHash('#/planner?date=2026-10-05')).toEqual({
        route: 'planner',
        params: { date: '2026-10-05' },
      });
      expect(parseHash('#/tasks?view=all&filter=open')).toEqual({
        route: 'tasks',
        params: { view: 'all', filter: 'open' },
      });
    });

    it('falls back to defaultRoute when route is invalid or unknown (T-05-02 mitigation)', () => {
      expect(parseHash('#/unknown')).toEqual({ route: 'dashboard', params: {} });
      expect(parseHash('#/unknown?hack=1')).toEqual({
        route: 'dashboard',
        params: { hack: '1' },
      });
      expect(parseHash('#/<script>alert(1)</script>')).toEqual({
        route: 'dashboard',
        params: {},
      });
    });

    it('sanitizes invalid or malformed date parameter (T-05-01 mitigation)', () => {
      // Invalid date string discarded
      expect(parseHash('#/planner?date=invalid-date')).toEqual({
        route: 'planner',
        params: {},
      });
      // Timestamp with time discarded (must be strict YYYY-MM-DD)
      expect(parseHash('#/planner?date=2026-10-05T12:00:00Z')).toEqual({
        route: 'planner',
        params: {},
      });
      // Out of bounds date discarded
      expect(parseHash('#/planner?date=2026-02-30')).toEqual({
        route: 'planner',
        params: {},
      });
    });
  });

  describe('buildHash', () => {
    it('serializes routes without params', () => {
      expect(buildHash('dashboard')).toBe('#/dashboard');
      expect(buildHash('planner')).toBe('#/planner');
      expect(buildHash('tasks', {})).toBe('#/tasks');
    });

    it('serializes routes with query params', () => {
      expect(buildHash('planner', { date: '2026-10-05' })).toBe('#/planner?date=2026-10-05');
      expect(buildHash('tasks', { status: 'open', sort: 'priority' })).toBe(
        '#/tasks?status=open&sort=priority'
      );
    });
  });
});
