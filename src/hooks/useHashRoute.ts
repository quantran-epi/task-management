import { useState, useEffect } from 'react';
import type { AppRoute } from '../types/navigation';
import { isValidCalendarDate } from '../utils/date';

export interface HashRouteState {
  route: AppRoute;
  params: Record<string, string>;
  navigate: (nextRoute: AppRoute, nextParams?: Record<string, string>) => void;
}

const VALID_ROUTES: readonly AppRoute[] = [
  'dashboard',
  'tasks',
  'projects',
  'planner',
  'analytics',
  'notes',
  'settings',
  'timer-popout',
  'notes-popout',
] as const;

/**
 * Parses window.location.hash into route and query parameters (D-16).
 * Whitelists routes against AppRoute members and sanitizes 'date' parameter (T-05-01, T-05-02).
 * Sanitizes 'milestoneId' parameter against strict alphanumeric/uuid pattern (T-13-01).
 */
export function parseHash(
  hashStr: string,
  defaultRoute: AppRoute = 'dashboard'
): { route: AppRoute; params: Record<string, string> } {
  if (!hashStr) return { route: defaultRoute, params: {} };

  const clean = hashStr.replace(/^#\/?/, '').trim();
  const [routePart, queryPart] = clean.split('?');

  const route = VALID_ROUTES.includes(routePart as AppRoute)
    ? (routePart as AppRoute)
    : defaultRoute;

  const params: Record<string, string> = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    searchParams.forEach((val, key) => {
      // T-05-01: Sanitize 'date' param if present
      if (key === 'date') {
        if (isValidCalendarDate(val)) {
          params[key] = val;
        }
      } else if (key === 'milestoneId') {
        // T-13-01: Sanitize milestoneId parameter
        const sanitized = val.trim();
        if (sanitized.length > 0 && /^[a-zA-Z0-9_-]+$/.test(sanitized)) {
          params[key] = sanitized;
        }
      } else {
        params[key] = val;
      }
    });
  }

  return { route, params };
}

/**
 * Serializes route and optional query parameters into a hash string (e.g. #/planner?date=2026-10-05).
 */
export function buildHash(route: AppRoute, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) {
    return `#/${route}`;
  }
  const query = new URLSearchParams(params).toString();
  return `#/${route}?${query}`;
}

export function useHashRoute(defaultRoute: AppRoute = 'dashboard'): HashRouteState {
  const getStateFromHash = (): { route: AppRoute; params: Record<string, string> } => {
    if (typeof window === 'undefined') return { route: defaultRoute, params: {} };
    return parseHash(window.location.hash, defaultRoute);
  };

  const [state, setState] = useState(getStateFromHash);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => setState(getStateFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [defaultRoute]);

  const navigate = (nextRoute: AppRoute, nextParams?: Record<string, string>) => {
    const nextState = { route: nextRoute, params: nextParams ?? {} };
    if (typeof window !== 'undefined') {
      window.location.hash = buildHash(nextRoute, nextParams);
    }
    setState(nextState);
  };

  return { route: state.route, params: state.params, navigate };
}
