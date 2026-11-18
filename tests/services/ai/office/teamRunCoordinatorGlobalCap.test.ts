import { describe, it, expect } from 'vitest';
import {
  MAX_LIVE_STEPS,
  capStepsGlobally,
} from '../../../../src/services/ai/office/teamRunCoordinator';
import type { AgentLiveStep } from '../../../../src/types/aiOffice';

describe('teamRunCoordinator - global live-step cap', () => {
  const step = (id: string): AgentLiveStep => ({
    id,
    label: 'step ' + id,
    at: '2026-01-01T00:00:00.000Z',
  });

  it('caps the TOTAL steps across all agents, not 200 per agent', () => {
    const agents = new Map<string, { steps?: AgentLiveStep[] | undefined }>();
    const agentCount = 5;
    for (let a = 0; a < agentCount; a += 1) {
      agents.set(`agent-${a}`, {
        steps: Array.from({ length: MAX_LIVE_STEPS }, (_, i) => step(`a${a}-s${i}`)),
      });
    }
    const totalBefore = [...agents.values()].reduce((sum, s) => sum + (s.steps?.length ?? 0), 0);
    expect(totalBefore).toBe(agentCount * MAX_LIVE_STEPS);

    capStepsGlobally(agents);

    const totalAfter = [...agents.values()].reduce((sum, s) => sum + (s.steps?.length ?? 0), 0);
    expect(totalAfter).toBeLessThanOrEqual(MAX_LIVE_STEPS);
    // Newest steps win regardless of which agent produced them.
    const all = [...agents.values()].flatMap((s) => s.steps ?? []);
    expect(all.some((s) => s.id === `a${agentCount - 1}-s${MAX_LIVE_STEPS - 1}`)).toBe(true);
    expect(all.some((s) => s.id === 'a0-s0')).toBe(false);
  });

  it('is a no-op when the total is already under the cap', () => {
    const agents = new Map<string, { steps?: AgentLiveStep[] | undefined }>([
      ['a', { steps: [step('s1'), step('s2')] }],
    ]);
    capStepsGlobally(agents);
    expect(agents.get('a')?.steps).toHaveLength(2);
  });
});
