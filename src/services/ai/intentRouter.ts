import { z } from 'zod';
import {
  completeJson as defaultCompleteJson,
  NineRouterClientError,
} from './nineRouterClient';

/**
 * Fixed, app-defined intent taxonomy (Bug 2 / vision hard gate).
 *
 * The AI chat is a natural-language front for ONE non-technical user. Intent MUST be
 * reasoned by the LLM against this app-defined contract. There are deliberately NO verb
 * lists and NO keyword/regex routing anywhere in this module — the old
 * DEFAULT_OPERATIONAL_VERBS / DEFAULT_KNOWLEDGE_HINTS / matchTerms heuristics were removed.
 *
 * - operate_taskmate  mutate work data (create/update/status/worklog/pause/resume/finish/assign/move)
 * - query_taskmate    READ work data / status questions ("tình hình click to pay như nào rồi")
 * - query_knowledge   ask documented processes / knowledge graph
 * - mixed             both operate + knowledge
 * - clarify           too vague — ask the user back
 */
export const INTENT_TAXONOMY = [
  'operate_taskmate',
  'query_taskmate',
  'query_knowledge',
  'mixed',
  'clarify',
] as const;

export type IntentLabel = (typeof INTENT_TAXONOMY)[number];

/**
 * Strict output schema the LLM must return. Validated with Zod; off-schema output is
 * rejected and retried once, then the feature is treated as UNAVAILABLE (no fallback).
 */
export const IntentResultSchema = z.strictObject({
  intent: z.enum(INTENT_TAXONOMY),
  confidence: z.number().min(0).max(1),
  entities: z.array(z.string().trim().min(1).max(200)).max(20),
  language: z.string().trim().min(2).max(16),
  needs_clarification: z.boolean(),
  clarify_question: z.string().trim().min(1).max(500).nullable(),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

/** Back-compat alias: groundedTurn consumes the rich result as the routing decision. */
export type RouteIntentResult = IntentResult;

export interface RouteIntentDeps {
  completeJson?: typeof defaultCompleteJson;
  completeJsonArgs?: {
    endpoint: string;
    apiKey?: string | undefined;
    model: string;
  };
  signal?: AbortSignal;
}

/**
 * Thrown when the LLM endpoint is not configured/reachable or keeps returning off-schema
 * output. Per the confirmed constraint: LLM down => AI feature UNAVAILABLE, no routing
 * fallback (distinct from graph/knowledge-server down, which keeps BM25 fallback alive).
 */
export class IntentRouterUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'IntentRouterUnavailableError';
  }
}

const INTENT_SYSTEM_PROMPT = `You are the intent classifier for TaskMate, a personal task & knowledge assistant used by ONE non-technical person. Classify the user's message into EXACTLY ONE intent from this fixed taxonomy and return STRICT JSON. Never invent intents outside the taxonomy. Never add commentary.

Taxonomy:
- "operate_taskmate": the user wants to CHANGE their own work data in TaskMate (create/update/delete a task, project or milestone; set status; log work time; start/pause/finish a timer; plan an allocation; assign or move items). Any mutation of personal work data.
- "query_taskmate": the user wants to READ their own work data or ask about its STATUS/PROGRESS (e.g. "how is X going", "what tasks are due today", "tình hình click to pay như nào rồi", "mấy việc hôm nay"). No change is requested — only reading TaskMate data.
- "query_knowledge": the user asks about documented knowledge — processes, business flows, how a system works, definitions, dependencies — i.e. information that lives in the knowledge documents / knowledge graph, NOT in their personal task list.
- "mixed": the message clearly requires BOTH operating/reading TaskMate work data AND consulting documented knowledge.
- "clarify": the message is too vague, ambiguous, or underspecified to classify or act on confidently.

Rules:
1. "confidence" is your calibrated confidence in the chosen intent, a number from 0 to 1.
2. "entities" is a short list of the salient subjects mentioned (feature names, task/project titles, process names). Use the user's own words. Empty array if none.
3. "language" is the BCP-47-ish code of the user's message language (e.g. "vi", "en"). Detect it from the message.
4. Set "needs_clarification" true ONLY when you cannot classify confidently or cannot act without more detail; then "intent" should be "clarify" and "clarify_question" MUST be a single, specific follow-up question written IN THE USER'S LANGUAGE. Otherwise "needs_clarification" is false and "clarify_question" is null.
5. A status/progress/read question about the user's own work is ALWAYS "query_taskmate", never "clarify", even if it is short.
6. Output ONLY a JSON object matching the required schema. No markdown, no prose.`;

const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...INTENT_TAXONOMY] },
    confidence: { type: 'number' },
    entities: { type: 'array', items: { type: 'string' } },
    language: { type: 'string' },
    needs_clarification: { type: 'boolean' },
    clarify_question: { type: ['string', 'null'] },
  },
  required: [
    'intent',
    'confidence',
    'entities',
    'language',
    'needs_clarification',
    'clarify_question',
  ],
  additionalProperties: false,
} as const;

/**
 * Normalizes the Zod-validated output so downstream branches are consistent:
 * if intent === 'clarify' we force needs_clarification true, and vice-versa.
 */
function normalizeIntent(result: IntentResult): IntentResult {
  if (result.intent === 'clarify') {
    return { ...result, needs_clarification: true };
  }
  if (result.needs_clarification) {
    return { ...result, intent: 'clarify' };
  }
  return { ...result, clarify_question: null };
}

/**
 * LLM-reasoned intent routing against the fixed app contract.
 *
 * Validates the model output with Zod. On off-schema output it retries ONCE with an
 * explicit repair instruction. If the LLM is unconfigured/unreachable or still off-schema
 * after the retry, it throws IntentRouterUnavailableError (AI feature UNAVAILABLE — there
 * is deliberately no keyword fallback).
 */
export async function routeIntent(
  query: string,
  deps?: RouteIntentDeps
): Promise<IntentResult> {
  const args = deps?.completeJsonArgs;
  if (!args || !args.endpoint || !args.model) {
    throw new IntentRouterUnavailableError(
      'LLM endpoint is not configured; intent routing is unavailable.'
    );
  }

  const complete = deps?.completeJson ?? defaultCompleteJson;
  const signal = deps?.signal ?? new AbortController().signal;

  const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'user', content: query },
  ];

  const responseFormat = {
    type: 'json_schema' as const,
    json_schema: {
      name: 'taskmate_intent_v1',
      strict: true as const,
      schema: INTENT_JSON_SCHEMA as unknown as Record<string, unknown>,
    },
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages =
      attempt === 0
        ? baseMessages
        : [
            ...baseMessages,
            {
              role: 'user' as const,
              content:
                'Your previous reply did not match the required JSON schema. Reply again with ONLY a JSON object that exactly matches the schema (intent from the fixed taxonomy, confidence 0..1, entities array, language code, needs_clarification boolean, clarify_question string or null).',
            },
          ];

    try {
      const raw = await complete({
        endpoint: args.endpoint,
        apiKey: args.apiKey,
        model: args.model,
        temperature: 0,
        maxTokens: 400,
        messages,
        responseFormat,
        signal,
      });

      const parsed = IntentResultSchema.safeParse(raw);
      if (parsed.success) {
        return normalizeIntent(parsed.data);
      }
      lastError = parsed.error;
    } catch (err) {
      // Abort propagates immediately; other transport/parse errors get one retry.
      if (err instanceof NineRouterClientError && err.code === 'ABORTED') {
        throw err;
      }
      lastError = err;
    }
  }

  throw new IntentRouterUnavailableError(
    'Intent router could not produce schema-valid output after retry.',
    lastError
  );
}
