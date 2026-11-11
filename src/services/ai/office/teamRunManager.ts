import type { TaskPlannerDatabase } from '../../../db';
import type { TeamRunCoordinator } from './teamRunCoordinator';

/**
 * Module-level run manager (Phase 37, D-18, AIO-RUNTIME-04).
 *
 * `TeamWorkspace` used to own `coordinatorRegistry`, so a delete path that never mounts
 * the workspace (the AI Office explorer) could not tear a run down. Moving ownership to a
 * module-level service makes teardown reachable from anywhere, and keeps exactly ONE
 * coordinator per (database, team) — the same instance the workspace and the explorer see.
 */
export interface TeamRunEntry {
  coordinator: TeamRunCoordinator;
  threadId: string;
}

const runs = new Map<string, TeamRunEntry>();

/** Keyed by database name too, so a test database never inherits another one's run. */
export const runKey = (db: TaskPlannerDatabase, teamId: string): string =>
  `${db.name}:${teamId}`;

/**
 * Async for exactly one reason: an entry whose `threadId` changed has to be disposed
 * BEFORE the replacement is constructed and stored, otherwise two live coordinators for
 * one team would coexist and the stale run could overlap its own successor.
 */
export async function getOrCreateRun(
  db: TaskPlannerDatabase,
  teamId: string,
  threadId: string,
  create: () => TeamRunCoordinator
): Promise<TeamRunCoordinator> {
  const key = runKey(db, teamId);
  const existing = runs.get(key);
  if (existing && existing.threadId === threadId) return existing.coordinator;

  if (existing) {
    runs.delete(key);
    await existing.coordinator.dispose();
  }

  const coordinator = create();
  runs.set(key, { coordinator, threadId });
  return coordinator;
}

export function peekRun(db: TaskPlannerDatabase, teamId: string): TeamRunCoordinator | undefined {
  return runs.get(runKey(db, teamId))?.coordinator;
}

/**
 * D-18 teardown order: dispose completes before the entry is dropped, and the entry is
 * dropped even when disposal throws — a half-disposed coordinator must never be handed
 * out again. The error still reaches the caller after cleanup.
 */
export async function disposeRun(db: TaskPlannerDatabase, teamId: string): Promise<void> {
  const key = runKey(db, teamId);
  const entry = runs.get(key);
  if (!entry) return;

  try {
    await entry.coordinator.dispose();
  } finally {
    runs.delete(key);
  }
}

/** App teardown and tests: dispose every retained coordinator. */
export async function disposeAllRuns(): Promise<void> {
  const entries = [...runs.values()];
  runs.clear();
  await Promise.allSettled(entries.map((entry) => entry.coordinator.dispose()));
}
