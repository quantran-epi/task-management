export type AppRoute = 'dashboard' | 'tasks' | 'projects' | 'planner' | 'analytics' | 'settings' | 'timer-popout';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;

