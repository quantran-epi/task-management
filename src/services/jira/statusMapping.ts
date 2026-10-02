import type { TaskStatus } from '../../types/models';
import type { JiraTransitionItem, JiraStatusMapping } from './types';

export const LOCAL_TASK_STATUSES: readonly TaskStatus[] = [
  'Open',
  'Pending',
  'In Progress',
  'In Review',
  'Resolved',
  'Done',
  'Cancelled',
];

export const DEFAULT_JIRA_STATUS_MAPPINGS: Record<TaskStatus, string[]> = {
  Open: ['10000', '1', 'to do', 'open', 'backlog'],
  Pending: ['pending', 'waiting', 'on hold'],
  'In Progress': ['3', 'in progress', 'doing'],
  'In Review': ['review', 'code review', 'peer review', 'pr'],
  Resolved: ['resolved', 'testing', 'qa', 'uat', 'verify'],
  Done: ['10001', '10002', '6', 'done', 'closed', 'complete'],
  Cancelled: ['cancelled', "won't do", 'rejected'],
};

export function normalizeJiraStatusMappings(
  value: unknown
): Record<TaskStatus, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return structuredClone(DEFAULT_JIRA_STATUS_MAPPINGS);
  }

  const stored = value as Record<string, unknown>;
  if (
    Object.entries(stored).some(
      ([key, tokens]) => LOCAL_TASK_STATUSES.includes(key as TaskStatus) && !Array.isArray(tokens)
    )
  ) {
    return structuredClone(DEFAULT_JIRA_STATUS_MAPPINGS);
  }

  return Object.fromEntries(
    LOCAL_TASK_STATUSES.map((status) => {
      const tokens = stored[status];
      if (!Array.isArray(tokens)) return [status, [...DEFAULT_JIRA_STATUS_MAPPINGS[status]]];
      return [
        status,
        tokens
          .filter((token): token is string => typeof token === 'string')
          .map((token) => token.trim())
          .filter(Boolean),
      ];
    })
  ) as Record<TaskStatus, string[]>;
}

/**
 * Filter Jira transitions to those whose destination status ID matches
 * the configured one-to-many mappings for a given local TaskStatus (D-08, D-09).
 */
export function findReachableTransitions(
  availableTransitions: JiraTransitionItem[],
  localStatus: TaskStatus,
  mappings: JiraStatusMapping
): JiraTransitionItem[] {
  const mappedStatusIds = mappings[localStatus] || [];
  if (mappedStatusIds.length === 0) {
    return [];
  }

  const mappedSet = new Set(mappedStatusIds);
  return availableTransitions.filter((transition) =>
    mappedSet.has(transition.to.id)
  );
}

/**
 * Resolves local TaskStatus corresponding to a Jira status ID from mappings (D-08).
 * In accordance with D-11: No keyword guessing! If unmapped, returns null.
 */
export function normalizeJiraStatusToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveLocalStatusFromMapping(
  jiraStatusId: string,
  mappings: JiraStatusMapping,
  jiraStatusName?: string
): TaskStatus | null {
  for (const [status, ids] of Object.entries(mappings)) {
    if (ids.includes(jiraStatusId)) {
      return status as TaskStatus;
    }
  }

  const normalizedName = jiraStatusName ? normalizeJiraStatusToken(jiraStatusName) : '';
  if (!normalizedName) return null;

  for (const [status, ids] of Object.entries(mappings)) {
    if (ids.some((id) => normalizeJiraStatusToken(id) === normalizedName)) {
      return status as TaskStatus;
    }
  }
  return null;
}

/**
 * Evaluates whether local status matches cached Jira status.
 * D-07, D-10: Task.status is authoritative.
 */
export function isStatusMismatch(
  localStatus: TaskStatus,
  jiraStatusId: string | undefined,
  mappings: JiraStatusMapping,
  jiraStatusName?: string
): boolean {
  if (!jiraStatusId) return false;
  const mappedIds = mappings[localStatus] || [];
  if (mappedIds.length === 0) {
    // If no mapping is configured for this local status, consider it unmapped
    return true;
  }
  if (mappedIds.includes(jiraStatusId)) return false;

  const normalizedName = jiraStatusName ? normalizeJiraStatusToken(jiraStatusName) : '';
  if (!normalizedName) return true;
  return !mappedIds.some((id) => normalizeJiraStatusToken(id) === normalizedName);
}

/**
 * Legacy status mapper for initial default proposal (D-11: statusCategory only used for initial suggestions).
 */
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

  // 3. Pending
  if (
    /\bpending\b/.test(normName) ||
    /\bwaiting\b/.test(normName) ||
    /\bon hold\b/.test(normName)
  ) {
    return 'Pending';
  }

  // 4. Resolved / Testing
  if (
    normName.includes('test') ||
    normName.includes('qa') ||
    normName.includes('uat') ||
    normName.includes('resolved') ||
    normName.includes('verify')
  ) {
    return 'Resolved';
  }

  // 5. In Review
  if (
    normName.includes('review') ||
    /\bpr\b/.test(normName) ||
    normName.includes('peer review')
  ) {
    return 'In Review';
  }

  // 6. In Progress
  if (
    normCat === 'indeterminate' ||
    normName.includes('in progress') ||
    normName.includes('developing') ||
    normName.includes('doing')
  ) {
    return 'In Progress';
  }

  // 7. Open / To Do
  if (
    normCat === 'new' ||
    normName.includes('to do') ||
    normName.includes('open') ||
    normName.includes('backlog')
  ) {
    return 'Open';
  }

  return null;
}

