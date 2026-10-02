import type { TaskStatus } from '../../types/models';
import type { JiraTransitionItem } from './types';

export const LOCAL_TASK_STATUSES: readonly TaskStatus[] = [
  'Open',
  'In Progress',
  'In Review',
  'Resolved',
  'Done',
  'Cancelled',
];

export type JiraStatusMappings = Record<TaskStatus, string[]>;

export const DEFAULT_JIRA_STATUS_MAPPINGS: JiraStatusMappings = {
  Open: ['Open', 'To Do', 'Backlog'],
  'In Progress': ['In Progress', 'Developing', 'Doing'],
  'In Review': ['In Review', 'Review', 'PR Review'],
  Resolved: ['Resolved', 'Testing', 'QA', 'UAT'],
  Done: ['Done', 'Closed', 'Completed'],
  Cancelled: ['Cancelled', 'Rejected', "Won't Do", "Won't Fix"],
};

export function normalizeJiraStatusMappings(value: unknown): JiraStatusMappings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return structuredClone(DEFAULT_JIRA_STATUS_MAPPINGS);
  }

  const stored = value as Record<string, unknown>;
  if (Object.entries(stored).some(([key, tokens]) =>
    LOCAL_TASK_STATUSES.includes(key as TaskStatus) && !Array.isArray(tokens)
  )) {
    return structuredClone(DEFAULT_JIRA_STATUS_MAPPINGS);
  }

  return Object.fromEntries(
    LOCAL_TASK_STATUSES.map((status) => {
      const tokens = stored[status];
      if (!Array.isArray(tokens)) return [status, [...DEFAULT_JIRA_STATUS_MAPPINGS[status]]];
      const normalized = tokens
        .filter((token): token is string => typeof token === 'string')
        .map((token) => token.trim())
        .filter(Boolean);
      return [status, normalized];
    })
  ) as JiraStatusMappings;
}

export function resolveLocalStatusFromMapping(
  jiraStatusId: string,
  jiraStatusName: string,
  mappings: JiraStatusMappings
): TaskStatus | null {
  const id = jiraStatusId.trim().toLowerCase();
  const name = jiraStatusName.trim().toLowerCase();
  return (
    LOCAL_TASK_STATUSES.find((status) =>
      mappings[status].some((token) => {
        const normalized = token.toLowerCase();
        return normalized === id || normalized === name;
      })
    ) ?? null
  );
}

export function findReachableTransitions(
  transitions: JiraTransitionItem[],
  localStatus: TaskStatus,
  mappings: JiraStatusMappings
): JiraTransitionItem[] {
  return transitions.filter(
    (transition) =>
      resolveLocalStatusFromMapping(transition.to.id, transition.to.name, mappings) === localStatus
  );
}

export function isStatusMismatch(
  localStatus: TaskStatus,
  jiraStatusId: string,
  jiraStatusName: string,
  mappings: JiraStatusMappings
): boolean {
  const mapped = resolveLocalStatusFromMapping(jiraStatusId, jiraStatusName, mappings);
  return mapped !== null && mapped !== localStatus;
}

export function mapJiraStatusToLocalTaskStatus(
  statusName: string,
  categoryKey?: string
): TaskStatus | null {
  const normName = statusName.toLowerCase();
  const normCat = (categoryKey || '').toLowerCase();

  // 1. Cancelled
  if (
    normName.includes('cancel') ||
    normName.includes('reject') ||
    normName.includes("won't do") ||
    normName.includes("won't fix") ||
    normName.includes("wont fix")
  ) {
    return 'Cancelled';
  }

  // 2. Done
  if (
    normCat === 'done' ||
    normName.includes('done') ||
    normName.includes('closed') ||
    normName.includes('complete')
  ) {
    return 'Done';
  }

  // 3. Resolved / Testing
  if (
    normName.includes('test') ||
    normName.includes('qa') ||
    normName.includes('uat') ||
    normName.includes('resolved') ||
    normName.includes('verify')
  ) {
    return 'Resolved';
  }

  // 4. In Review
  if (
    normName.includes('review') ||
    /\bpr\b/.test(normName) ||
    normName.includes('peer review')
  ) {
    return 'In Review';
  }

  // 5. In Progress
  if (
    normCat === 'indeterminate' ||
    normName.includes('in progress') ||
    normName.includes('developing') ||
    normName.includes('doing')
  ) {
    return 'In Progress';
  }

  // 6. Open / To Do
  if (
    normCat === 'new' ||
    normName.includes('to do') ||
    normName.includes('open') ||
    normName.includes('backlog')
  ) {
    return 'Open';
  }

  // Fallback: null means leave local status unchanged
  return null;
}
