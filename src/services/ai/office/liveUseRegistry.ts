/**
 * In-flight live-use registry (D-13, D-19).
 *
 * Runtime state only: never persisted, never exported, never restored. A turn claims the
 * profile (and skill) it runs with when it starts and releases them when it settles, so a
 * delete guard can still see the profile in use after it left the roster.
 *
 * Every read is synchronous on purpose: a Dexie `rw` transaction can consult it without
 * awaiting anything, so the guard and the write stay atomic (D-15).
 */

interface LiveUseEntry {
  /** Refcount: nested or duplicate starts must not release early. */
  count: number;
  skillIds: Set<string>;
}

const entries = new Map<string, LiveUseEntry>();

export function beginTurn(agentId: string, skillIds: string[]): void {
  const existing = entries.get(agentId);
  if (existing) {
    existing.count += 1;
    for (const skillId of skillIds) existing.skillIds.add(skillId);
    return;
  }
  entries.set(agentId, { count: 1, skillIds: new Set(skillIds) });
}

export function endTurn(agentId: string): void {
  const existing = entries.get(agentId);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) entries.delete(agentId);
}

export function isAgentInUse(agentId: string): boolean {
  return entries.has(agentId);
}

export function isSkillInUse(skillId: string): boolean {
  for (const entry of entries.values()) {
    if (entry.skillIds.has(skillId)) return true;
  }
  return false;
}

/** Test isolation only — production never clears a live run's claims. */
export function reset(): void {
  entries.clear();
}
