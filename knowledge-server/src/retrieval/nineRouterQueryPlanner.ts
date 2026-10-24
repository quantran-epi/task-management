import type {
  OperationOptions,
  QueryPlanner,
  QueryPlannerContext,
  QueryPlanResult,
} from './contracts.js';
import {
  LogicalQueryPlanSchema,
  type LogicalQueryPlan,
  type RetrievalRequest,
} from '../types/retrievalProtocol.js';
import {
  NODE_KINDS,
  RETRIEVAL_ONTOLOGY_REGISTRY,
} from '../graph/ontology.js';
import {
  LooseLogicalQueryPlanSchema,
  TRAVERSAL_PLAN_LIMITS,
  validateOverallDepth,
  validateStepAgainstRegistry,
  type PlanValidationReasonCode,
} from './retrievalPlanDerivation.js';

export interface NineRouterPlannerConfig {
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
  readonly allowedHosts: readonly string[];
  readonly timeoutMs?: number | undefined;
}

function extractJsonContent(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

interface ValidationResult {
  readonly valid: boolean;
  readonly plan?: LogicalQueryPlan | undefined;
  readonly reasonCodes: readonly PlanValidationReasonCode[];
}

export class PlannerTransportError extends Error {
  constructor() {
    super('PLANNER_TRANSPORT_FAILURE');
    this.name = 'PlannerTransportError';
  }
}

export class NineRouterQueryPlanner implements QueryPlanner {
  private readonly config: NineRouterPlannerConfig;
  private readonly fetchFn: typeof fetch;

  constructor(
    config: NineRouterPlannerConfig,
    fetchFn: typeof fetch = fetch
  ) {
    if (!config.endpoint || !config.endpoint.trim()) {
      throw new Error('PLANNER_CONFIG_INVALID: Missing endpoint');
    }
    if (!config.model || !config.model.trim()) {
      throw new Error('PLANNER_CONFIG_INVALID: Missing model');
    }
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error('PLANNER_CONFIG_INVALID: Missing API key');
    }

    let url: URL;
    try {
      url = new URL(config.endpoint);
    } catch {
      throw new Error(`PLANNER_CONFIG_INVALID: Invalid endpoint URL "${config.endpoint}"`);
    }

    if (!config.allowedHosts.includes(url.hostname)) {
      throw new Error(
        `PLANNER_CONFIG_INVALID: Remote endpoint host "${url.hostname}" is not in approved allowed hosts list`
      );
    }

    this.config = { ...config };
    this.fetchFn = fetchFn;
  }

  /**
   * Validates planner output through the loose candidate schema first so unknown
   * relations and over-depth values reach semantic validation with stable codes
   * (D-11, D-14). Only a fully valid candidate is re-parsed into the strict plan.
   */
  private validatePlan(candidate: unknown, context: QueryPlannerContext): ValidationResult {
    const parsed = LooseLogicalQueryPlanSchema.safeParse(candidate);
    if (!parsed.success) {
      return { valid: false, reasonCodes: ['PLAN_REJECTED'] };
    }

    const loose = parsed.data;
    const reasonCodes: PlanValidationReasonCode[] = [];
    const candidatesByUrn = new Map(context.resolvedCandidates.map((entry) => [entry.urn, entry]));
    const survivingKinds = loose.seedUrns
      .map((urn) => candidatesByUrn.get(urn)?.kind)
      .filter((kind): kind is NonNullable<typeof kind> => Boolean(kind));

    if (survivingKinds.length === 0) {
      return { valid: false, reasonCodes: ['SEED_NOT_FOUND'] };
    }

    const depthReason = validateOverallDepth(loose.overallMaxDepth);
    if (depthReason) reasonCodes.push(depthReason);

    for (const step of loose.traversalSteps) {
      const kinds = step.seedUrn
        ? [candidatesByUrn.get(step.seedUrn)?.kind].filter(
            (kind): kind is NonNullable<typeof kind> => Boolean(kind)
          )
        : survivingKinds;

      if (kinds.length === 0) {
        reasonCodes.push('SEED_NOT_FOUND');
        continue;
      }

      const codes = kinds.map((kind) => validateStepAgainstRegistry(step, kind));
      if (!codes.includes(null)) {
        reasonCodes.push(codes.find((code) => code !== null) ?? 'PLAN_REJECTED');
      }
    }

    if (reasonCodes.length > 0) {
      return { valid: false, reasonCodes: [...new Set(reasonCodes)] };
    }

    const strict = LogicalQueryPlanSchema.safeParse(candidate);
    if (!strict.success) {
      return { valid: false, reasonCodes: ['PLAN_REJECTED'] };
    }

    return { valid: true, plan: strict.data, reasonCodes: [] };
  }

  private composeSystemPrompt(context: QueryPlannerContext): string {
    const candidatesStr = context.resolvedCandidates
      .map((c) => `- ${c.urn} (${c.kind}): ${c.canonicalName}`)
      .join('\n');

    const relationsStr = context.registeredRelationTypes
      .map((r) => {
        const reg = RETRIEVAL_ONTOLOGY_REGISTRY[r];
        if (!reg) return `- ${r}`;
        return [
          `- ${r}`,
          `sources=[${reg.allowedSourceKinds.join(',')}]`,
          `targets=[${reg.allowedTargetKinds.join(',')}]`,
          `defaultDirection=${reg.defaultDirection}`,
          `maxHops=${reg.maxHops}`,
        ].join(' ');
      })
      .join('\n');

    return [
      'You are a deterministic query planner for a banking IT knowledge assistant.',
      'Return exactly one complete JSON object. Never return Markdown fences, commentary, partial patches, Cypher, SQL, code, or unknown fields.',
      '',
      'REQUIRED JSON SHAPE:',
      '{',
      '  "planId": "00000000-0000-4000-8000-000000000000",',
      '  "queryIntent": "LOOKUP",',
      '  "seedUrns": ["<one of the resolved candidate URNs below>"],',
      '  "traversalSteps": [],',
      '  "overallMaxDepth": 1,',
      '  "includeInferred": false,',
      '  "fulltextKeywords": ["non-empty search phrase"],',
      '  "semanticQuery": "non-empty semantic search text"',
      '}',
      '',
      'FIELD CONTRACT:',
      '- planId: valid UUID.',
      '- queryIntent: exactly LOOKUP, FLOW_TRAVERSAL, IMPACT_ANALYSIS, or DEPENDENCY_CHECK.',
      `- seedUrns: 1..${TRAVERSAL_PLAN_LIMITS.MAX_SEEDS} values copied exactly from RESOLVED CANDIDATES.`,
      `- traversalSteps: 0..${TRAVERSAL_PLAN_LIMITS.MAX_STEPS} objects with only relationType, direction, maxHops, optional targetKind, and optional seedUrn.`,
      '- direction: exactly OUTGOING, INCOMING, or BOTH; it must be legal for that step\'s seed kind and relation.',
      '- maxHops: integer 1..3 and no greater than the relation maxHops below.',
      `- overallMaxDepth: integer 1..${TRAVERSAL_PLAN_LIMITS.MAX_DEPTH} and at least the complete requested path depth.`,
      '- includeInferred: boolean; never enable unless user explicitly requests inferred evidence.',
      '- fulltextKeywords: at least one non-empty string.',
      '- semanticQuery: non-empty string preserving user meaning.',
      '',
      'INTENT CONTRACT:',
      '- LOOKUP: entity properties, catalog details, data tables, or calculation cycles. Use zero traversal steps unless a direct relation is required.',
      '- FLOW_TRAVERSAL: ordered execution steps or flow from one component to another. Use ordered traversal steps matching the flow.',
      '- IMPACT_ANALYSIS: upstream/downstream effects of changing an entity. Select the relations whose target kinds are the entities affected by the change; every step must remain legal for its seed kind.',
      '- DEPENDENCY_CHECK: whether named entities have a direct dependency. Do not use for general property or catalog questions.',
      '',
      'EXAMPLES OF INTENT ONLY; replace every value with allowed runtime values:',
      '- "What data tables and calculation cycles belong to this container?" => LOOKUP.',
      '- "What execution steps run from Scheduler to PL/SQL?" => FLOW_TRAVERSAL.',
      '- "What packages and processes are affected if this table changes?" => IMPACT_ANALYSIS.',
      '- "Does package A directly read table B?" => DEPENDENCY_CHECK.',
      '',
      'RESOLVED CANDIDATES (only allowed seedUrns):',
      candidatesStr || 'None',
      '',
      'NODE KINDS:',
      NODE_KINDS.join(', '),
      '',
      'CLOSED RELATION ONTOLOGY (relation sourceKinds targetKinds defaultDirection maxHops):',
      relationsStr,
      '',
      `BOUNDS: at most ${TRAVERSAL_PLAN_LIMITS.MAX_STEPS} steps, depth 1..${TRAVERSAL_PLAN_LIMITS.MAX_DEPTH}, at most ${TRAVERSAL_PLAN_LIMITS.MAX_SEEDS} seeds.`,
      '',
      'If multiple candidates exist, select only candidates supported by the question. Output JSON only.',
    ].join('\n');
  }

  private async executeCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: OperationOptions
  ): Promise<unknown> {
    const cleanEndpoint = this.config.endpoint.replace(/\/+$/, '').replace(/\/v1$/, '');
    const url = `${cleanEndpoint}/v1/chat/completions`;

    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs ?? 15_000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    const payload = {
      model: this.config.model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.0,
      stream: false,
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });

    if (!response.ok) {
      throw new PlannerTransportError();
    }

    let rawText: string;
    try {
      rawText = await response.text();
    } catch {
      throw new PlannerTransportError();
    }
    let rawContent: string | undefined;

    // Some approved proxies stream despite stream=false. Require every SSE data frame to parse.
    if (rawText.trim().startsWith('data:')) {
      let accumulated = '';
      for (const line of rawText.split('\n')) {
        const frame = line.trim();
        if (!frame.startsWith('data:')) continue;
        const payload = frame.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
          if (typeof content === 'string') accumulated += content;
        } catch {
          throw new PlannerTransportError();
        }
      }
      rawContent = accumulated;
    } else {
      try {
        const data = JSON.parse(rawText) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawContent = data.choices?.[0]?.message?.content;
      } catch {
        throw new PlannerTransportError();
      }
    }

    if (!rawContent) {
      throw new PlannerTransportError();
    }

    try {
      return JSON.parse(extractJsonContent(rawContent));
    } catch {
      // Completed model output with invalid JSON is schema failure and gets one repair.
      return rawContent;
    }
  }

  async plan(
    request: RetrievalRequest,
    context: QueryPlannerContext,
    options?: OperationOptions
  ): Promise<QueryPlanResult> {
    const systemPrompt = this.composeSystemPrompt(context);
    const baseMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.query },
    ];

    // The coordinator owns the single repair attempt and passes stable codes only (D-11).
    if (context.repair) {
      const repairMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        ...baseMessages,
        {
          role: 'user',
          content: `Return one complete corrected LogicalQueryPlan JSON object only. Do not return prose, Markdown, or a partial patch. Violations cleared by server validation: ${context.repair.reasonCodes.join(
            ', '
          )}.`,
        },
      ];
      const output = await this.executeCompletion(repairMessages, options);
      const check = this.validatePlan(output, context);
      if (check.valid && check.plan) {
        return { type: 'plan', plan: check.plan, repaired: true };
      }
      return {
        type: 'unsupported',
        reason: 'PLANNER_SCHEMA_FAILURE',
        unsupportedConstructs: [...check.reasonCodes],
      };
    }

    const firstOutput = await this.executeCompletion(baseMessages, options);
    const firstCheck = this.validatePlan(firstOutput, context);
    if (firstCheck.valid && firstCheck.plan) {
      return {
        type: 'plan',
        plan: firstCheck.plan,
        repaired: false,
      };
    }

    // Exactly one bounded repair attempt (D-15, D-16) carrying stable codes only.
    const repairMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      ...baseMessages,
      {
        role: 'user',
        content: `Return one complete corrected LogicalQueryPlan JSON object only. Do not return prose, Markdown, or a partial patch. Violations cleared by server validation: ${firstCheck.reasonCodes.join(
          ', '
        )}.`,
      },
    ];

    const secondOutput = await this.executeCompletion(repairMessages, options);

    const secondCheck = this.validatePlan(secondOutput, context);
    if (secondCheck.valid && secondCheck.plan) {
      return {
        type: 'plan',
        plan: secondCheck.plan,
        repaired: true,
      };
    }

    return {
      type: 'unsupported',
      reason: 'PLANNER_SCHEMA_FAILURE',
      unsupportedConstructs:
        secondCheck.reasonCodes.length > 0 ? [...secondCheck.reasonCodes] : [...firstCheck.reasonCodes],
    };
  }
}
