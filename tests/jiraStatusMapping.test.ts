import { describe, it, expect } from 'vitest';
import type { JiraTransitionItem, JiraStatusMapping } from '../src/services/jira/types';
import {
  findReachableTransitions,
  resolveLocalStatusFromMapping,
  isStatusMismatch,
} from '../src/services/jira/statusMapping';

describe('Jira Status Mapping & Transition Resolver', () => {
  const sampleTransitions: JiraTransitionItem[] = [
    {
      id: '11',
      name: 'To Do',
      to: { id: '10001', name: 'Open', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
    },
    {
      id: '21',
      name: 'Start Progress',
      to: { id: '10002', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    },
    {
      id: '31',
      name: 'Peer Review',
      to: { id: '10003', name: 'Peer Review', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    },
    {
      id: '32',
      name: 'Code Review',
      to: { id: '10004', name: 'Code Review', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    },
    {
      id: '41',
      name: 'Testing / QA',
      to: { id: '10005', name: 'QA Testing', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    },
    {
      id: '51',
      name: 'Done',
      to: { id: '10006', name: 'Closed', statusCategory: { id: 3, key: 'done', name: 'Done' } },
    },
  ];

  const mappings: JiraStatusMapping = {
    Open: ['10001'],
    'In Progress': ['10002'],
    'In Review': ['10003', '10004'], // One-to-many: both Peer Review & Code Review map to In Review
    Resolved: ['10005'],
    Done: ['10006'],
    Cancelled: ['10007'],
  };

  it('filters reachable transitions matching mapped Jira status IDs for local TaskStatus (D-08, D-09)', () => {
    // Single match
    const inProgressTargets = findReachableTransitions(sampleTransitions, 'In Progress', mappings);
    expect(inProgressTargets).toHaveLength(1);
    expect(inProgressTargets[0]?.id).toBe('21');
    expect(inProgressTargets[0]?.name).toBe('Start Progress');

    // One-to-many match: In Review matches 2 transitions (Peer Review and Code Review)
    const reviewTargets = findReachableTransitions(sampleTransitions, 'In Review', mappings);
    expect(reviewTargets).toHaveLength(2);
    expect(reviewTargets.map((t) => t.id)).toEqual(['31', '32']);
  });

  it('returns empty array when no mapped transition is reachable (D-10)', () => {
    const limitedTransitions: JiraTransitionItem[] = [
      {
        id: '21',
        name: 'Start Progress',
        to: { id: '10002', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
      },
    ];

    const doneTargets = findReachableTransitions(limitedTransitions, 'Done', mappings);
    expect(doneTargets).toHaveLength(0);
  });

  it('resolves local status from mappings without heuristic guessing (D-11)', () => {
    expect(resolveLocalStatusFromMapping('10003', mappings)).toBe('In Review');
    expect(resolveLocalStatusFromMapping('10004', mappings)).toBe('In Review');
    expect(resolveLocalStatusFromMapping('10006', mappings)).toBe('Done');

    // Unmapped Jira status ID: returns null, strictly no guessing
    expect(resolveLocalStatusFromMapping('99999', mappings)).toBeNull();
  });

  it('detects status mismatch between local status and cached Jira status correctly (D-07, D-10)', () => {
    // Matching case
    expect(isStatusMismatch('In Review', '10003', mappings)).toBe(false);
    expect(isStatusMismatch('In Review', '10004', mappings)).toBe(false);

    // Mismatched case: local is In Progress but remote is 10006 (Closed)
    expect(isStatusMismatch('In Progress', '10006', mappings)).toBe(true);

    // No Jira status cached yet -> not considered mismatch
    expect(isStatusMismatch('In Progress', undefined, mappings)).toBe(false);

    // Local status has no mappings configured -> considered mismatch
    const emptyMappings: JiraStatusMapping = {};
    expect(isStatusMismatch('In Progress', '10002', emptyMappings)).toBe(true);
  });
});
