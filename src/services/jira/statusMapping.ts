import type { TaskStatus } from '../../types/models';

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
