import type { TaskPlannerDatabase } from '../../db';
import { listDocumentSets } from '../../db/repositories/documentSetRepo';
import { getNineRouterApiKey, getNineRouterConfig } from '../ai/nineRouterTokenService';
import { createKnowledgeClient } from '../knowledge/knowledgeClient';
import { runLocalGroundedRetrieval } from '../search/localGroundedRetrieval';
import { readNoteMarkdown } from '../../utils/noteBody';
import {
  collectWizardEvidence,
  type WizardEvidence,
  type WizardEvidenceDeps,
  type WizardEvidenceInput,
  type WizardEvidenceItem,
  type WizardModel,
} from '../ai/wizardService';

/** Stable code the step views surface as "configure a model in Settings" (D-20). */
export function wizardModelUnconfiguredError(): Error & { code: string } {
  const error = new Error('WIZARD_MODEL_UNCONFIGURED') as Error & { code: string };
  error.name = 'SdlcWizardRuntimeError';
  error.code = 'WIZARD_MODEL_UNCONFIGURED';
  return error;
}

export interface SdlcWizardRuntime {
  /** Provider config for `runWizardStage`; read from persisted router settings only. */
  model: WizardModel;
  collectEvidence: (input: WizardEvidenceInput) => Promise<WizardEvidence>;
  /** Real published set ids for the project. Never a placeholder and never silently `[]`. */
  resolveSetIds: (changeRequestId: string) => Promise<readonly string[]>;
}

export interface CreateSdlcWizardRuntimeInput {
  db: TaskPlannerDatabase;
  knowledgeBaseUrl?: string | undefined;
  knowledgeToken?: string | undefined;
}

const RETRIEVAL_BUDGETS = {
  concurrency: 4,
  elapsedMs: 60_000,
  maxSets: 10,
  maxItems: 50,
  maxEvidenceChars: 80_000,
} as const;

/**
 * The router defaults (`DEFAULT_NINEROUTER_ENDPOINT`/`DEFAULT_NINEROUTER_MODEL`) always make
 * `getNineRouterConfig` return *something*, so "configured" means the user actually persisted an
 * endpoint, a model, or an API key. Otherwise the stage would post to a guessed localhost endpoint
 * and fail with an opaque transport error instead of the actionable setup guard.
 */
async function resolveModel(db: TaskPlannerDatabase): Promise<WizardModel> {
  const [endpointRec, modelRec, apiKey] = await Promise.all([
    db.settings.get('ninerouter_endpoint'),
    db.settings.get('ninerouter_default_model'),
    getNineRouterApiKey(db),
  ]);

  const persistedEndpoint =
    typeof endpointRec?.value === 'string' && endpointRec.value.trim().length > 0;
  const persistedModel =
    typeof modelRec?.value === 'string' && modelRec.value.trim().length > 0;
  const key = apiKey.trim();
  if (!persistedEndpoint && !persistedModel && !key) throw wizardModelUnconfiguredError();

  const config = await getNineRouterConfig(db);
  return {
    endpoint: config.endpoint,
    ...(key ? { apiKey: key } : {}),
    model: config.defaultModel,
  };
}

/**
 * Local BM25 seam, mirroring `createDefaultGroundedTurnDeps().localBm25Deps`: set membership from
 * `db.documentSets`, bodies from `db.notes` unwrapped through `readNoteMarkdown`.
 */
function localBm25Deps(db: TaskPlannerDatabase): Parameters<typeof runLocalGroundedRetrieval>[1] {
  return {
    loadSetMembers: async (setIds) => {
      const sets = await db.documentSets.where('id').anyOf([...setIds]).toArray();
      return sets.flatMap((set) =>
        (set.documentIds ?? []).map((documentId) => ({
          setId: set.id,
          setName: set.name,
          documentId,
        })));
    },
    loadNoteBody: async (documentId) => {
      const note = await db.notes.get(documentId);
      if (!note) return null;
      return { title: note.title, body: readNoteMarkdown(note.body), updatedAt: note.updatedAt };
    },
  };
}

function toRemoteEvidenceItem(
  setId: string,
  chunk: {
    id: string;
    sourceDocumentId: string;
    sourceDocumentTitle: string;
    lineStart: number;
    lineEnd: number;
    rawSnippet: string;
    publishedContentHash: string;
  },
): WizardEvidenceItem {
  return {
    id: `remote-${setId}-${chunk.id}`,
    source: 'remote',
    documentId: chunk.sourceDocumentId,
    documentTitle: chunk.sourceDocumentTitle,
    contentHash: chunk.publishedContentHash,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    // Federated chunk payloads carry line ranges but no character offsets; 0 keeps the range
    // non-degenerate without inventing positions the server never sent.
    startOffset: 0,
    endOffset: 0,
    excerpt: chunk.rawSnippet,
  };
}

function createRemoteRetrieval(
  client: ReturnType<typeof createKnowledgeClient>,
): NonNullable<WizardEvidenceDeps['retrieveRemote']> {
  return async (input, signal) => {
    const response = await client.retrieveFederated({
      query: input.query,
      setTierAssignments: input.resolvedSetIds.map((setId) => ({
        setId,
        tier: 'REQUIRED' as const,
        roleGroup: 'baseline' as const,
      })),
      comparisonMode: 'single' as const,
      budgets: RETRIEVAL_BUDGETS,
      limit: 20,
      includeInferred: false,
      recentTurns: [],
    }, signal);

    return response.items.flatMap((entry) =>
      entry.item.type === 'chunk'
        ? [toRemoteEvidenceItem(entry.setId, entry.item)]
        : []);
  };
}

/**
 * Production wiring for PL03B/PL07/CAB generation (D-14, D-15): the `WizardModel`, evidence
 * collector, and published set ids that `generateHubTechDocDraft`/`generateHubCabDraft` require.
 *
 * Pure wiring: writes no Notes and performs no approval. `retrieveMcp` is deliberately omitted —
 * `WIZARD_STABLE_SYSTEM_PREFIX` forbids tool requests from the wizard stage.
 */
export async function createSdlcWizardRuntime(
  input: CreateSdlcWizardRuntimeInput,
): Promise<SdlcWizardRuntime> {
  const { db } = input;
  const model = await resolveModel(db);

  const deps: WizardEvidenceDeps = {
    runLocalBm25: (bm25Input) => runLocalGroundedRetrieval(bm25Input, localBm25Deps(db)),
  };
  if (input.knowledgeBaseUrl && input.knowledgeToken) {
    try {
      const client = createKnowledgeClient({
        baseUrl: input.knowledgeBaseUrl,
        token: input.knowledgeToken,
        db,
      });
      deps.retrieveRemote = createRemoteRetrieval(client);
    } catch {
      // An unreachable/invalid knowledge server degrades to local-only evidence, never a hard fail.
    }
  }

  return {
    model,
    collectEvidence: (evidenceInput) => collectWizardEvidence(evidenceInput, deps),
    resolveSetIds: async (changeRequestId) => {
      const sets = await listDocumentSets(db);
      const projectSets = sets.filter(
        (set) => set.sdlc?.changeRequestId === changeRequestId && set.sdlc.purpose === 'sdlc');
      if (projectSets.length > 1) throw new Error('DUPLICATE_PROJECT_SDLC_SET');
      // Project SDLC set first, then base/baseline sets every project may ground on. Other
      // project-scoped sets stay out so one project cannot cite another's artifacts.
      const baseSetIds = sets
        .filter((set) => set.isBase && set.sdlc === undefined)
        .map((set) => set.id);
      return Array.from(new Set([...projectSets.map((set) => set.id), ...baseSetIds]));
    },
  };
}
