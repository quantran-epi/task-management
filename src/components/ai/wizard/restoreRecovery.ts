import type { SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';

export interface MissingSource {
  id: string;
  title: string;
}

/**
 * Sources a restored workflow points at but that no longer exist locally (D-30).
 * `artifacts.driftResult` is a reconciliation result, not an artifact ref, so it is skipped
 * by the `noteId` shape check rather than by key name.
 */
export function deriveMissingSources(
  state: SdlcWorkflowState | undefined,
  existingNoteIds: ReadonlySet<string>
): MissingSource[] {
  const missing = new Map<string, string>();
  for (const value of Object.values(state?.artifacts ?? {})) {
    if (!value || typeof value !== 'object' || !('noteId' in value)) continue;
    const noteId = (value as { noteId?: unknown }).noteId;
    if (typeof noteId !== 'string' || !noteId || existingNoteIds.has(noteId)) continue;
    if (missing.has(noteId)) continue;
    const title = typeof (value as { title?: unknown }).title === 'string'
      ? (value as { title: string }).title
      : (value as { kind?: string }).kind ?? noteId;
    missing.set(noteId, title);
  }
  return [...missing].map(([id, title]) => ({ id, title }));
}
