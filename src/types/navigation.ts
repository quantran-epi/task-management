export type AppRoute = 'dashboard' | 'tasks' | 'projects' | 'planner' | 'notes' | 'settings' | 'timer-popout' | 'notes-popout';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;

