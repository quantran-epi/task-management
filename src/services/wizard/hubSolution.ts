import type { TaskPlannerDatabase } from '../../db';
import { saveSolutionVersion } from './artifactRepo';
import { defaultSha256 } from './workflowCoordinator';

export interface HubSolutionInput {
  db: TaskPlannerDatabase;
  projectId: string;
  threadId: string;
  sessionId: string;
  markdown: string;
  draftRevision: number;
  approvedAt?: string | undefined;
}

export interface HubSolutionResult {
  noteId: string;
  version: number;
  hash: string;
  created: boolean;
}

/**
 * Wizard-free SOLUTION writer: hash the markdown, write the Note, and return the
 * `noteId`/`version`/`hash` triple the change-pack and CAB steps pin against.
 *
 * Deliberately does NOT write workflow state. The caller owns `commitSolution` — if a
 * future caller skips that commit, `artifacts.solution` silently goes stale and step 4's
 * `SOLUTION_REQUIRED_FOR_CHANGE_PACK` gate fails.
 *
 * `draftRevision` is bookkeeping only: the addressed idempotency key is
 * `${sessionId}:SOLUTION:${inputHash}`, so the same markdown always replays to the same
 * Note, and the stored version is always `max(existing versions) + 1`.
 */
export async function saveHubSolution(input: HubSolutionInput): Promise<HubSolutionResult> {
  const markdown = input.markdown.trim();
  if (!markdown) throw new Error('SOLUTION_CONTENT_EMPTY');

  // Same hash the coordinator recomputes, so `persistConfirmedPack`'s solution pin holds.
  const hash = await defaultSha256(markdown);

  const result = await saveSolutionVersion({
    projectId: input.projectId,
    threadId: input.threadId,
    sessionId: input.sessionId,
    inputRevision: input.draftRevision,
    draftRevision: input.draftRevision,
    inputHash: hash,
    markdown,
    exportPayload: {},
    approvedAt: input.approvedAt ?? new Date().toISOString(),
  }, input.db);

  return {
    noteId: result.note.id,
    version: result.note.sdlcArtifact!.version,
    hash,
    created: result.created,
  };
}
