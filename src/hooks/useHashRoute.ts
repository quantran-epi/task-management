import { useState, useEffect } from 'react';
import type { AppRoute } from '../types/navigation';

export function useHashRoute(defaultRoute: AppRoute = 'tasks') {
  const getRouteFromHash = (): AppRoute => {
    if (typeof window === 'undefined') return defaultRoute;
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    if (hash === 'projects' || hash === 'planner' || hash === 'settings') {
      return hash;
    }
    if (hash === 'tasks') {
      return 'tasks';
    }
    return defaultRoute;
  };

  const [route, setRoute] = useState<AppRoute>(getRouteFromHash);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [defaultRoute]);

  const navigate = (nextRoute: AppRoute) => {
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${nextRoute}`;
    }
    setRoute(nextRoute);
  };

  return { route, navigate };
}
