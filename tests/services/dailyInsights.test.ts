import { describe, it, expect } from 'vitest';
import {
  generateDeterministicBriefing,
  generateDeterministicDebriefing,
  buildBriefingPrompt,
  buildDebriefingPrompt,
  type BriefingInput,
  type DebriefingInput,
} from '../../src/services/ai/dailyInsightService';
import type { PlannedAllocationWithTask } from '../../src/db/repositories/allocationRepo';

function makeAlloc(
  name: string,
  allocatedMinutes: number,
  status: 'Open' | 'In Progress' | 'Done' | 'Cancelled' = 'Open',
  priority: 'High' | 'Medium' | 'Low' = 'Medium'
): PlannedAllocationWithTask {
  return {
    id: `alloc-${name}`,
    taskId: `task-${name}`,
    date: '2026-10-18',
    allocatedMinutes,
    isActive: true,
    task: {
      id: `task-${name}`,
      name,
      status,
      priority,
      progress: status === 'Done' ? 100 : status === 'In Progress' ? 50 : 0,
      estimateMinutes: allocatedMinutes,
      createdAt: '2026-10-18T08:00:00Z',
      updatedAt: '2026-10-18T08:00:00Z',
    },
  };
}

describe('dailyInsightService', () => {
  describe('generateDeterministicBriefing', () => {
    it('calculates balanced workload when planned <= capacity', () => {
      const input: BriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 480,
        allocations: [
          makeAlloc('Task A', 120, 'Open', 'High'),
          makeAlloc('Task B', 180, 'In Progress', 'Medium'),
        ],
      };

      const result = generateDeterministicBriefing(input);
      expect(result.plannedMinutes).toBe(300);
      expect(result.capacityMinutes).toBe(480);
      expect(result.loadPercent).toBe(63);
      expect(result.isOverCapacity).toBe(false);
      expect(result.highPriorityCount).toBe(1);
      expect(result.activeTaskCount).toBe(2);
      expect(result.status).toBe('balanced');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('detects over-capacity when planned exceeds capacity', () => {
      const input: BriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 240,
        allocations: [
          makeAlloc('Task A', 180, 'Open', 'High'),
          makeAlloc('Task B', 120, 'Open', 'High'),
        ],
      };

      const result = generateDeterministicBriefing(input);
      expect(result.plannedMinutes).toBe(300);
      expect(result.loadPercent).toBe(125);
      expect(result.isOverCapacity).toBe(true);
      expect(result.status).toBe('overloaded');
      expect(result.recommendations.some((r) => r.includes('quá tải') || r.includes('giảm bớt'))).toBe(true);
    });

    it('handles zero capacity or empty allocations gracefully', () => {
      const input: BriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 0,
        allocations: [],
      };

      const result = generateDeterministicBriefing(input);
      expect(result.plannedMinutes).toBe(0);
      expect(result.capacityMinutes).toBe(0);
      expect(result.loadPercent).toBe(0);
      expect(result.isOverCapacity).toBe(false);
      expect(result.status).toBe('empty');
    });
  });

  describe('generateDeterministicDebriefing', () => {
    it('calculates completion rate and rollover suggestions', () => {
      const input: DebriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 480,
        loggedMinutes: 420,
        allocations: [
          makeAlloc('Task A', 120, 'Done', 'High'),
          makeAlloc('Task B', 180, 'In Progress', 'Medium'),
          makeAlloc('Task C', 60, 'Open', 'Low'),
        ],
      };

      const result = generateDeterministicDebriefing(input);
      expect(result.loggedMinutes).toBe(420);
      expect(result.capacityMinutes).toBe(480);
      expect(result.capacityPercent).toBe(88);
      expect(result.completedCount).toBe(1);
      expect(result.incompleteCount).toBe(2);
      expect(result.completionRate).toBe(33);
      expect(result.rolloverSuggestions.length).toBe(2);
    });

    it('detects all tasks completed day', () => {
      const input: DebriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 300,
        loggedMinutes: 300,
        allocations: [
          makeAlloc('Task A', 150, 'Done', 'High'),
          makeAlloc('Task B', 150, 'Done', 'Medium'),
        ],
      };

      const result = generateDeterministicDebriefing(input);
      expect(result.completedCount).toBe(2);
      expect(result.incompleteCount).toBe(0);
      expect(result.completionRate).toBe(100);
      expect(result.rolloverSuggestions).toHaveLength(0);
    });
  });

  describe('Prompt Builders', () => {
    it('builds briefing prompt with tasks and duration without secret leaks', () => {
      const input: BriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 480,
        allocations: [makeAlloc('Fix auth bug', 90, 'Open', 'High')],
      };

      const { systemPrompt, userPrompt } = buildBriefingPrompt(input);
      expect(systemPrompt).toContain('trợ lý');
      expect(userPrompt).toContain('Fix auth bug');
      expect(userPrompt).toContain('2026-10-18');
      expect(userPrompt).toContain('480 phút');
      expect(userPrompt).not.toContain('Bearer');
      expect(userPrompt).not.toContain('apiKey');
    });

    it('builds debriefing prompt with logged hours and rollover info', () => {
      const input: DebriefingInput = {
        date: '2026-10-18',
        capacityMinutes: 480,
        loggedMinutes: 360,
        allocations: [
          makeAlloc('Finished doc', 120, 'Done'),
          makeAlloc('Unfinished API', 120, 'In Progress'),
        ],
      };

      const { systemPrompt, userPrompt } = buildDebriefingPrompt(input);
      expect(systemPrompt).toContain('tổng kết');
      expect(userPrompt).toContain('360 phút');
      expect(userPrompt).toContain('Finished doc');
      expect(userPrompt).toContain('Unfinished API');
    });
  });
});
