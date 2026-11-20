export type AppRoute =
  | 'dashboard'
  | 'tasks'
  | 'planner'
  | 'analytics'
  | 'notes'
  | 'settings'
  | 'config-profiles'
  | 'timer-popout'
  | 'notes-popout'
  | 'ai-popout'
  | 'coding-zone-popout'
  | 'insight'
  | 'team'
  | 'telegram'
  | 'mermaid';

export type NavigateFunction = (route: AppRoute, params?: Record<string, string>) => void;

