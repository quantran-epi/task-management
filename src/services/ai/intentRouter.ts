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
  speculation_requested: z.boolean(),
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
  recentTurns?: readonly { role: 'user' | 'assistant'; content: string }[];
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

export const INTENT_SYSTEM_PROMPT = `You are the intent classifier for TaskMate, a personal task and knowledge assistant used by ONE non-technical person.
Classify the user's message into EXACTLY ONE intent from the fixed taxonomy and return STRICT JSON matching the schema.
Never invent intents outside the taxonomy. Never add conversational text or markdown code fences outside JSON.

TAXONOMY:
- "operate_taskmate": User wants to CHANGE or CREATE personal work data in TaskMate (create/update/delete task, project, milestone; change status; log work hours; start/pause/finish timer; plan daily allocation; create/remove links). Any mutation.
- "query_taskmate": User wants to READ personal work data, schedules, or asks about progress/status (e.g., "how is X going", "what tasks are due today", "tình hình click to pay như nào rồi", "tiến độ milestone"). Status checks are ALWAYS query_taskmate.
- "query_knowledge": User asks about documented knowledge, business processes, system architecture, database objects, code logic, or provides a technical identifier (e.g., "MAIN1.FCL_CYCLE_COUNTER", "PRC_PROCESS:60000006", "quy trình tính phí"). Information lives in documents/graph.
- "mixed": User explicitly asks to BOTH inspect/operate TaskMate items AND inspect documented knowledge in the same turn.
- "clarify": User's request is genuinely ambiguous, fragmented, or lacks critical parameters required to identify what they want.

RULES:
1. "confidence": Calibrated number between 0.0 and 1.0.
2. "entities": List of key subjects, identifiers, task names, or process names mentioned. Empty array [] if none.
3. "language": BCP-47 language tag detected from input (e.g., "vi" or "en").
4. "needs_clarification": Set to true ONLY when intent is "clarify". Then "clarify_question" MUST contain a single, polite, targeted follow-up question in the user's detected language. When needs_clarification is false, "clarify_question" MUST be null.
5. "speculation_requested": Set to true IF AND ONLY IF the user explicitly asks to guess, hypothesize, speculate, or imagine possibilities (e.g., "đoán xem", "nếu giả sử", "speculate why", "what might happen if"). If user asks factual questions, this MUST be false.
6. TECHNICAL IDENTIFIER RULE: A bare technical identifier, database table, column name, or system code (e.g., "MAIN1.FCL_CYCLE_COUNTER", "PKG_SETTLEMENT", "60000006") is ALWAYS "query_knowledge", NEVER "clarify".
7. READ VS CLARIFY RULE: A progress/status question about work is ALWAYS "query_taskmate", even if concise.
8. CONVERSATION CONTINUITY & ANAPHORA RULE: When past conversation turns are provided in context, resolve pronouns and anaphoric references ("nó", "đó", "cái này", "bước tiếp theo", "quy trình này", "task đó") against the recent turns. If the previous discussion was about a knowledge entity or process, follow-up questions inquiring about it are "query_knowledge", NEVER "clarify". If previous turn discussed a task or project, follow-up questions are "query_taskmate" or "operate_taskmate".

FEW-SHOT EXAMPLES:

User: "tình hình click to pay như nào rồi"
{"intent":"query_taskmate","confidence":0.95,"entities":["click to pay"],"language":"vi","needs_clarification":false,"clarify_question":null,"speculation_requested":false}

User: "tạo task làm báo cáo quyết toán hạn thứ 6 tuần này"
{"intent":"operate_taskmate","confidence":0.98,"entities":["làm báo cáo quyết toán"],"language":"vi","needs_clarification":false,"clarify_question":null,"speculation_requested":false}

User: "MAIN1.FCL_CYCLE_COUNTER"
{"intent":"query_knowledge","confidence":0.99,"entities":["MAIN1.FCL_CYCLE_COUNTER"],"language":"en","needs_clarification":false,"clarify_question":null,"speculation_requested":false}

User: "Chu kỳ tính lãi container 60000006 hoạt động như thế nào?"
{"intent":"query_knowledge","confidence":0.96,"entities":["Chu kỳ tính lãi","container 60000006"],"language":"vi","needs_clarification":false,"clarify_question":null,"speculation_requested":false}

User: "xem quy trình 60000006 rồi tạo task review cấu hình này cho tôi"
{"intent":"mixed","confidence":0.94,"entities":["quy trình 60000006","review cấu hình"],"language":"vi","needs_clarification":false,"clarify_question":null,"speculation_requested":false}

User: "cái đó sao rồi"
{"intent":"clarify","confidence":0.90,"entities":[],"language":"vi","needs_clarification":true,"clarify_question":"Bạn đang muốn hỏi tiến độ của công việc hay tài liệu quy trình nào cụ thể?","speculation_requested":false}

User: "Đoán xem tại sao bước tính phí container 60000006 có thể bị chậm nếu cơ sở dữ liệu quá tải?"
{"intent":"query_knowledge","confidence":0.92,"entities":["bước tính phí","container 60000006","cơ sở dữ liệu"],"language":"vi","needs_clarification":false,"clarify_question":null,"speculation_requested":true}

User: "What tasks are blocked today and can you speculate what happens if we delay them?"
{"intent":"query_taskmate","confidence":0.91,"entities":["tasks"],"language":"en","needs_clarification":false,"clarify_question":null,"speculation_requested":true}`;

const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...INTENT_TAXONOMY] },
    confidence: { type: 'number' },
    entities: { type: 'array', items: { type: 'string' } },
    language: { type: 'string' },
    needs_clarification: { type: 'boolean' },
    clarify_question: { type: ['string', 'null'] },
    speculation_requested: { type: 'boolean' },
  },
  required: [
    'intent',
    'confidence',
    'entities',
    'language',
    'needs_clarification',
    'clarify_question',
    'speculation_requested',
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

  let queryContent = query;
  if (deps?.recentTurns && deps.recentTurns.length > 0) {
    const formattedHistory = deps.recentTurns
      .slice(-4)
      .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n');
    queryContent = `<recent_dialogue>\n${formattedHistory}\n</recent_dialogue>\n\nCurrent User Message: ${query}`;
  }

  const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'user', content: queryContent },
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
                'Your previous reply violated the strict JSON schema. Return ONLY a valid JSON object matching the required schema with keys: intent, confidence, entities, language, needs_clarification, clarify_question, speculation_requested.',
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
