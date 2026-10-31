import type {
  RevisionPreview,
  SdlcArtifactKind,
  SdlcStepId,
  SdlcWorkflowState,
} from '../../../services/wizard/workflowSchemas';

export type RevisionModalPreview = {
  diff: { before: string; after: string };
  sources: { title: string; shortHash?: string; version?: number }[];
  impactSteps: SdlcStepId[];
};

export type WorkflowArtifacts = SdlcWorkflowState['artifacts'];

const ARTIFACT_KEY_BY_KIND: Partial<Record<SdlcArtifactKind, keyof WorkflowArtifacts>> = {
  PL01: 'pl01',
  PL02: 'pl02',
  SOLUTION: 'solution',
  CODE_GUIDE: 'codeGuide',
  CHANGE_PACK: 'changePack',
  PL03B: 'pl03b',
  PL07: 'pl07',
  CAB: 'cab',
};

/** Artifacts invalidated by each step id, per the staleness DAG. */
const ARTIFACT_KEYS_BY_STEP: Record<SdlcStepId, (keyof WorkflowArtifacts)[]> = {
  INTAKE: ['pl01', 'pl02'],
  SOLUTION: ['solution'],
  CODE_GUIDE: ['codeGuide'],
  CHANGE_PACK: ['changePack'],
  TECH_DOCS: ['pl03b', 'pl07'],
  CAB: ['cab'],
};

export function previousArtifactContent(
  state: SdlcWorkflowState | undefined,
  kind: SdlcArtifactKind
): string {
  const key = ARTIFACT_KEY_BY_KIND[kind];
  if (!state || !key) return '';
  const artifact = state.artifacts[key];
  return artifact && 'content' in artifact ? artifact.content ?? '' : '';
}

export function toRevisionModalPreview(
  preview: RevisionPreview,
  previousContent: string
): RevisionModalPreview {
  return {
    diff: { before: previousContent, after: preview.markdown },
    sources: preview.sources.map((source) => ({
      title: source.kind,
      shortHash: source.hash.slice(0, 8),
      version: source.version,
    })),
    impactSteps: preview.impactSteps,
  };
}

/**
 * Drops every artifact named in `staleSteps` before it reaches the SDLC wrapper prompt, so a
 * stale artifact can never become the baseline for a new step. Returns the input untouched.
 */
export function stripStaleArtifacts(
  state: SdlcWorkflowState | undefined
): WorkflowArtifacts | undefined {
  if (!state) return undefined;
  const staleKeys = new Set(
    state.staleSteps.flatMap((step) => ARTIFACT_KEYS_BY_STEP[step] ?? [])
  );
  if (staleKeys.size === 0) return state.artifacts;
  const next: WorkflowArtifacts = { ...state.artifacts };
  for (const key of staleKeys) delete next[key];
  return next;
}
