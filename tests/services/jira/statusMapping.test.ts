import { describe, it, expect } from 'vitest';
import {
  DEFAULT_JIRA_STATUS_MAPPINGS,
  LOCAL_TASK_STATUSES,
  mapJiraStatusToLocalTaskStatus,
  normalizeJiraStatusMappings,
} from '../../../src/services/jira/statusMapping';

describe('Smart Status Mapping (statusMapping.ts - D-10)', () => {
  it('provides ordered defaults for every local task status', () => {
    expect(LOCAL_TASK_STATUSES).toEqual([
      'Open',
      'In Progress',
      'In Review',
      'Resolved',
      'Done',
      'Cancelled',
    ]);
    expect(Object.keys(DEFAULT_JIRA_STATUS_MAPPINGS)).toEqual(LOCAL_TASK_STATUSES);
  });

  it('normalizes trimmed mapping tokens and falls back for malformed values', () => {
    expect(
      normalizeJiraStatusMappings({
        Open: [' 10000 ', '', 'To Do'],
        'In Progress': ['3'],
        Unknown: ['bad'],
      })
    ).toEqual({
      ...DEFAULT_JIRA_STATUS_MAPPINGS,
      Open: ['10000', 'To Do'],
      'In Progress': ['3'],
    });
    expect(normalizeJiraStatusMappings(null)).toEqual(DEFAULT_JIRA_STATUS_MAPPINGS);
    expect(normalizeJiraStatusMappings({ Open: '10000' })).toEqual(
      DEFAULT_JIRA_STATUS_MAPPINGS
    );
  });

  describe('Rule 1: Cancelled', () => {
    it('maps statuses containing cancel, reject, or won\'t do to Cancelled', () => {
      expect(mapJiraStatusToLocalTaskStatus('Cancelled')).toBe('Cancelled');
      expect(mapJiraStatusToLocalTaskStatus('Rejected by PO')).toBe('Cancelled');
      expect(mapJiraStatusToLocalTaskStatus("Won't Do")).toBe('Cancelled');
      expect(mapJiraStatusToLocalTaskStatus("Won't Fix")).toBe('Cancelled');
      expect(mapJiraStatusToLocalTaskStatus('Cancel Task', 'done')).toBe('Cancelled');
    });
  });

  describe('Rule 2: Done', () => {
    it('maps done category or names containing done, closed, complete to Done', () => {
      expect(mapJiraStatusToLocalTaskStatus('Closed', 'done')).toBe('Done');
      expect(mapJiraStatusToLocalTaskStatus('Done')).toBe('Done');
      expect(mapJiraStatusToLocalTaskStatus('Completed', 'indeterminate')).toBe('Done');
      expect(mapJiraStatusToLocalTaskStatus('Released to Prod', 'done')).toBe('Done');
    });
  });

  describe('Rule 3: Pending', () => {
    it('maps status names containing pending, waiting, or on hold to Pending', () => {
      expect(mapJiraStatusToLocalTaskStatus('Pending')).toBe('Pending');
      expect(mapJiraStatusToLocalTaskStatus('Waiting for Customer')).toBe('Pending');
      expect(mapJiraStatusToLocalTaskStatus('On Hold')).toBe('Pending');
    });
  });

  describe('Rule 4: Resolved', () => {
    it('maps status names containing test, qa, uat, resolved, verify to Resolved', () => {
      expect(mapJiraStatusToLocalTaskStatus('Resolved')).toBe('Resolved');
      expect(mapJiraStatusToLocalTaskStatus('Testing in UAT', 'indeterminate')).toBe('Resolved');
      expect(mapJiraStatusToLocalTaskStatus('QA Verification')).toBe('Resolved');
      expect(mapJiraStatusToLocalTaskStatus('Verify Fix')).toBe('Resolved');
    });
  });

  describe('Rule 5: In Review', () => {
    it('maps status names containing review, pr, peer review to In Review', () => {
      expect(mapJiraStatusToLocalTaskStatus('PR Review', 'indeterminate')).toBe('In Review');
      expect(mapJiraStatusToLocalTaskStatus('Code Review')).toBe('In Review');
      expect(mapJiraStatusToLocalTaskStatus('Peer Review')).toBe('In Review');
    });
  });

  describe('Rule 6: In Progress', () => {
    it('maps indeterminate category or names containing in progress, developing, doing to In Progress', () => {
      expect(mapJiraStatusToLocalTaskStatus('In Progress')).toBe('In Progress');
      expect(mapJiraStatusToLocalTaskStatus('Developing', 'indeterminate')).toBe('In Progress');
      expect(mapJiraStatusToLocalTaskStatus('Doing')).toBe('In Progress');
      expect(mapJiraStatusToLocalTaskStatus('Custom Work', 'indeterminate')).toBe('In Progress');
    });
  });

  describe('Rule 7: Open / To Do', () => {
    it('maps new category or names containing to do, open, backlog to Open', () => {
      expect(mapJiraStatusToLocalTaskStatus('Backlog', 'new')).toBe('Open');
      expect(mapJiraStatusToLocalTaskStatus('To Do')).toBe('Open');
      expect(mapJiraStatusToLocalTaskStatus('Open')).toBe('Open');
      expect(mapJiraStatusToLocalTaskStatus('Awaiting Triage', 'new')).toBe('Open');
    });
  });

  describe('Fallback', () => {
    it('returns null when status name and category do not match any known pattern', () => {
      expect(mapJiraStatusToLocalTaskStatus('Unmapped State', 'unknown_cat')).toBeNull();
      expect(mapJiraStatusToLocalTaskStatus('Mystery')).toBeNull();
    });
  });
});
