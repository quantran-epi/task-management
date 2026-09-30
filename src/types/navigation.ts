export type AppRoute = 'dashboard' | 'tasks' | 'projects' | 'planner' | 'analytics' | 'settings';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;

