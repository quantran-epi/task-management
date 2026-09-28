export type AppRoute = 'dashboard' | 'tasks' | 'projects' | 'planner' | 'settings';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;

