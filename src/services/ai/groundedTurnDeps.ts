import type {
  GroundedTurnDeps,
  GroundedTurnInput,
  GroundedTurnResult,
} from './groundedTurn';
import {
  runGroundedTurn as baseRunGroundedTurn,
  synthesizeFromStoredEvidence as baseSynthesizeFromStoredEvidence,
  createFreshLookupTurn as baseCreateFreshLookupTurn,
} from './groundedTurn';
import { routeIntent } from './intentRouter';
import { routeScope } from './semanticScopeRouter';
import { runLocalGroundedRetrieval } from '../search/localGroundedRetrieval';
import { packEvidence } from './evidencePack';
import { synthesizeGroundedAnswer } from './groundedSynthesis';
import { createKnowledgeClient } from '../knowledge/knowledgeClient';
import { runMcpRetrieval } from './mcpRetrievalRunner';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { ChatMessageGrounding } from './groundedAnswerSchemas';
import { getKnowledgeLinksForEntity } from '../../db/repositories/knowledgeLinkRepo';

export interface GroundedTurnRuntimeHooks {
  runGroundedTurn?: (
    input: GroundedTurnInput,
    deps: GroundedTurnDeps
  ) => Promise<GroundedTurnResult>;
  synthesizeFromStoredEvidence?: (
    storedGrounding: ChatMessageGrounding,
    deps: GroundedTurnDeps,
    options?: {
      query?: string;
      endpoint?: string;
      apiKey?: string;
      model?: string;
      promptVersion?: string;
      signal?: AbortSignal;
    }
  ) => Promise<GroundedTurnResult>;
  createFreshLookupTurn?: typeof baseCreateFreshLookupTurn;
  depsFactory?: (options: {
    knowledgeBaseUrl: string;
    knowledgeToken: string;
    db?: TaskPlannerDatabase;
  }) => GroundedTurnDeps;
}

let activeHooks: GroundedTurnRuntimeHooks = {};

export function setGroundedTurnTestHooks(hooks: GroundedTurnRuntimeHooks): void {
  activeHooks = { ...hooks };
}

export function clearGroundedTurnTestHooks(): void {
  activeHooks = {};
}

export function createDefaultGroundedTurnDeps(options: {
  knowledgeBaseUrl: string;
  knowledgeToken: string;
  db?: TaskPlannerDatabase;
}): GroundedTurnDeps {
  if (activeHooks.depsFactory) {
    return activeHooks.depsFactory(options);
  }

  const database = options.db ?? defaultDb;
  let client: ReturnType<typeof createKnowledgeClient> | null = null;
  if (options.knowledgeBaseUrl) {
    try {
      client = createKnowledgeClient({
        baseUrl: options.knowledgeBaseUrl,
        token: options.knowledgeToken,
        db: database,
      });
    } catch {
      client = null;
    }
  }

  return {
    routeIntent: (q, d) => routeIntent(q, d),
    routeScope: (inp, d) => routeScope(inp, d),
    retrieveFederated: async (req, signal) => {
      if (!client) {
        throw new Error('Knowledge client unconfigured');
      }
      return client.retrieveFederated(req, signal);
    },
    runLocalBm25: (inp, d) => runLocalGroundedRetrieval(inp, d),
    localBm25Deps: {
      loadSetMembers: async (setIds) => {
        const sets = await database.documentSets.where('id').anyOf(setIds).toArray();
        const entries: { setId: string; setName: string; documentId: string }[] = [];
        for (const s of sets) {
          for (const docId of s.documentIds ?? []) {
            entries.push({ setId: s.id, setName: s.name, documentId: docId });
          }
        }
        return entries;
      },
      loadNoteBody: async (docId) => {
        const note = await database.notes.get(docId);
        if (!note) return null;
        return { title: note.title, body: note.body, updatedAt: note.updatedAt };
      },
    },
    packEvidence: (inp, opt) => packEvidence(inp, opt),
    synthesizeGroundedAnswer: (inp) => synthesizeGroundedAnswer(inp),
    runMcpRetrieval: (inp) => runMcpRetrieval(inp),
    loadKnowledgeLinks: (entityType, entityId) => getKnowledgeLinksForEntity(entityType, entityId, database),
    now: () => new Date().toISOString(),
  };
}

export async function executeGroundedTurn(
  input: GroundedTurnInput,
  deps: GroundedTurnDeps
): Promise<GroundedTurnResult> {
  if (activeHooks.runGroundedTurn) {
    return activeHooks.runGroundedTurn(input, deps);
  }
  return baseRunGroundedTurn(input, deps);
}

export async function executeSynthesizeFromStoredEvidence(
  storedGrounding: ChatMessageGrounding,
  deps: GroundedTurnDeps,
  options?: {
    query?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    promptVersion?: string;
    signal?: AbortSignal;
  }
): Promise<GroundedTurnResult> {
  if (activeHooks.synthesizeFromStoredEvidence) {
    return activeHooks.synthesizeFromStoredEvidence(storedGrounding, deps, options);
  }
  return baseSynthesizeFromStoredEvidence(storedGrounding, deps, options);
}

export function executeCreateFreshLookupTurn(
  prevGrounding: ChatMessageGrounding,
  newInput: GroundedTurnInput,
  deps?: GroundedTurnDeps
): GroundedTurnInput {
  if (activeHooks.createFreshLookupTurn) {
    return activeHooks.createFreshLookupTurn(prevGrounding, newInput, deps);
  }
  return baseCreateFreshLookupTurn(prevGrounding, newInput, deps);
}
