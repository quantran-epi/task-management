import { describe, it, expect } from 'vitest';
import { mapJiraStatusToLocalTaskStatus } from '../../../src/services/jira/statusMapping';

describe('Smart Status Mapping (statusMapping.ts - D-10)', () => {
  describe('Rule 1: Cancelled', () => {
    it('maps statuses containing cancel, reject, or won\'t do to Cancelled', () => {
      expect(mapJiraStatusToLocalTaskStatus('Cancelled')).toBe('Cancelled');
      expect(mapJiraStatusToLocalTaskStatus('Rejected by PO')).toBe('Cancelled');
      expect(mapJiraStatusToLocalTaskStatus("Won't Do")).toBe('Cancelled');
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

  describe('Rule 3: Resolved', () => {
    it('maps status names containing test, qa, uat, resolved, verify to Resolved', () => {
      expect(mapJiraStatusToLocalTaskStatus('Resolved')).toBe('Resolved');
      expect(mapJiraStatusToLocalTaskStatus('Testing in UAT', 'indeterminate')).toBe('Resolved');
      expect(mapJiraStatusToLocalTaskStatus('QA Verification')).toBe('Resolved');
      expect(mapJiraStatusToLocalTaskStatus('Verify Fix')).toBe('Resolved');
    });
  });

  describe('Rule 4: In Review', () => {
    it('maps status names containing review, pr, peer review to In Review', () => {
      expect(mapJiraStatusToLocalTaskStatus('PR Review', 'indeterminate')).toBe('In Review');
      expect(mapJiraStatusToLocalTaskStatus('Code Review')).toBe('In Review');
      expect(mapJiraStatusToLocalTaskStatus('Peer Review')).toBe('In Review');
    });
  });

  describe('Rule 5: In Progress', () => {
    it('maps indeterminate category or names containing in progress, developing, doing to In Progress', () => {
      expect(mapJiraStatusToLocalTaskStatus('In Progress')).toBe('In Progress');
      expect(mapJiraStatusToLocalTaskStatus('Developing', 'indeterminate')).toBe('In Progress');
      expect(mapJiraStatusToLocalTaskStatus('Doing')).toBe('In Progress');
      expect(mapJiraStatusToLocalTaskStatus('Custom Work', 'indeterminate')).toBe('In Progress');
    });
  });

  describe('Rule 6: Open / To Do', () => {
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
