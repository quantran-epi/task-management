export type AppRoute =
  | 'dashboard'
  | 'tasks'
  | 'planner'
  | 'analytics'
  | 'notes'
  | 'settings'
  | 'timer-popout'
  | 'notes-popout'
  | 'ai-popout'
  | 'insight'
  | 'team'
  | 'telegram'
  | 'mermaid';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;

