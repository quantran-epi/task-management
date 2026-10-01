import type { TaskStatus } from '../../types/models';
import type { JiraTransitionItem, JiraStatusMapping } from './types';

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
export function resolveLocalStatusFromMapping(
  jiraStatusId: string,
  mappings: JiraStatusMapping
): TaskStatus | null {
  for (const [status, ids] of Object.entries(mappings)) {
    if (ids.includes(jiraStatusId)) {
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
  mappings: JiraStatusMapping
): boolean {
  if (!jiraStatusId) return false;
  const mappedIds = mappings[localStatus] || [];
  if (mappedIds.length === 0) {
    // If no mapping is configured for this local status, consider it unmapped
    return true;
  }
  return !mappedIds.includes(jiraStatusId);
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

  return null;
}

