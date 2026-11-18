// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createTeamRunRegistry } from '../../../../src/services/ai/office/teamRunRegistry';
import type { ChatTurnRuntimeDeps } from '../../../../src/components/ai/runtime/chatTurnRuntime';

function makeDeps(agentId: string): ChatTurnRuntimeDeps {
  return {
    agentId,
    runLoop: vi.fn(),
    saveMessage: vi.fn(),
    describeMutation: vi.fn(),
    db: {} as ChatTurnRuntimeDeps['db'],
  } as unknown as ChatTurnRuntimeDeps;
}

describe('teamRunRegistry (D-02, D-14, Pitfall 1, T-34-20)', () => {
  it('returns the same runtime instance for repeated get on one agentId', () => {
    const registry = createTeamRunRegistry(makeDeps);
    const first = registry.get('agent-a');
    expect(registry.get('agent-a')).toBe(first);
  });

  it('returns distinct instances for different agentIds', () => {
    const registry = createTeamRunRegistry(makeDeps);
    expect(registry.get('agent-a')).not.toBe(registry.get('agent-b'));
    expect(Object.keys(registry.getSnapshot())).toEqual(['agent-a', 'agent-b']);
  });

  it('builds deps with the agentId it was asked for', () => {
    const seen: string[] = [];
    const registry = createTeamRunRegistry((agentId) => {
      seen.push(agentId);
      return makeDeps(agentId);
    });

    registry.get('agent-a');
    registry.get('agent-b');
    registry.get('agent-a');

    expect(seen).toEqual(['agent-a', 'agent-b']);
  });

  it('aborts only the named agent', () => {
    const registry = createTeamRunRegistry(makeDeps);
    const a = registry.get('agent-a');
    const b = registry.get('agent-b');
    const abortA = vi.spyOn(a, 'abort');
    const abortB = vi.spyOn(b, 'abort');

    registry.abort('agent-a');

    expect(abortA).toHaveBeenCalledTimes(1);
    expect(abortB).not.toHaveBeenCalled();
  });

  it('aborts every instance on abortAll', () => {
    const registry = createTeamRunRegistry(makeDeps);
    const a = registry.get('agent-a');
    const b = registry.get('agent-b');
    const abortA = vi.spyOn(a, 'abort');
    const abortB = vi.spyOn(b, 'abort');

    registry.abortAll();

    expect(abortA).toHaveBeenCalledTimes(1);
    expect(abortB).toHaveBeenCalledTimes(1);
    expect(Object.keys(registry.getSnapshot())).toHaveLength(2);
  });

  it('clear aborts and drops every entry', () => {
    const registry = createTeamRunRegistry(makeDeps);
    const a = registry.get('agent-a');
    const abortA = vi.spyOn(a, 'abort');

    registry.clear();

    expect(abortA).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot()).toEqual({});
    expect(registry.peek('agent-a')).toBeUndefined();
  });

  it('peek returns undefined before any get and never creates an instance', () => {
    const createDeps = vi.fn(makeDeps);
    const registry = createTeamRunRegistry(createDeps);

    expect(registry.peek('agent-a')).toBeUndefined();
    expect(createDeps).not.toHaveBeenCalled();

    const runtime = registry.get('agent-a');
    expect(registry.peek('agent-a')).toBe(runtime);
  });
});
