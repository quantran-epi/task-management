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
  readonly issues: readonly string[];
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

  private validatePlan(candidate: unknown, context: QueryPlannerContext): ValidationResult {
    const parsed = LogicalQueryPlanSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        valid: false,
        issues: parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`),
      };
    }

    const plan = parsed.data;
    const issues: string[] = [];
    const allowedUrns = new Set(context.resolvedCandidates.map((c) => c.urn));

    // Seed URNs check against server-resolved allowlist
    for (const seed of plan.seedUrns) {
      if (!allowedUrns.has(seed)) {
        issues.push(`Seed URN ${seed} is not in server-resolved candidate allowlist`);
      }
    }

    // Traversal steps bounds: max 5
    if (plan.traversalSteps.length > 5) {
      issues.push(`Traversal steps count ${plan.traversalSteps.length} exceeds maximum 5`);
    }

    // Overall max depth 1..3
    if (plan.overallMaxDepth < 1 || plan.overallMaxDepth > 3) {
      issues.push(`Overall max depth ${plan.overallMaxDepth} outside permitted range 1..3`);
    }

    // Traversal steps relation and direction checks
    for (let i = 0; i < plan.traversalSteps.length; i++) {
      const step = plan.traversalSteps[i]!;
      const registryEntry = RETRIEVAL_ONTOLOGY_REGISTRY[step.relationType];
      if (!registryEntry) {
        issues.push(`Unknown relation type ${step.relationType} at step ${i}`);
        continue;
      }

      if (step.maxHops < 1 || step.maxHops > 3) {
        issues.push(`Step ${i} maxHops ${step.maxHops} outside range 1..3`);
      }
      if (step.maxHops > registryEntry.maxHops) {
        issues.push(`Step ${i} maxHops ${step.maxHops} exceeds ontology ceiling ${registryEntry.maxHops}`);
      }

      if (step.targetKind && !NODE_KINDS.includes(step.targetKind)) {
        issues.push(`Step ${i} targetKind ${step.targetKind} not in allowed NODE_KINDS`);
      }
    }

    return {
      valid: issues.length === 0,
      plan: issues.length === 0 ? plan : undefined,
      issues,
    };
  }

  private composeSystemPrompt(context: QueryPlannerContext): string {
    const candidatesStr = context.resolvedCandidates
      .map((c) => `- ${c.urn} (${c.kind}): ${c.canonicalName}`)
      .join('\n');

    const relationsStr = context.registeredRelationTypes
      .map((r) => {
        const reg = RETRIEVAL_ONTOLOGY_REGISTRY[r];
        return `- ${r}: maxHops=${reg ? reg.maxHops : 1}`;
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
      '- seedUrns: 1..5 values copied exactly from RESOLVED CANDIDATES.',
      '- traversalSteps: 0..5 objects with only relationType, direction, maxHops, and optional targetKind.',
      '- direction: exactly OUTGOING, INCOMING, or BOTH.',
      '- maxHops: integer 1..3 and no greater than registered relation maxHops.',
      '- overallMaxDepth: integer 1..3 and at least the complete requested path depth.',
      '- includeInferred: boolean; never enable unless user explicitly requests inferred evidence.',
      '- fulltextKeywords: at least one non-empty string.',
      '- semanticQuery: non-empty string preserving user meaning.',
      '',
      'INTENT CONTRACT:',
      '- LOOKUP: entity properties, catalog details, data tables, or calculation cycles. Use zero traversal steps unless a direct relation is required.',
      '- FLOW_TRAVERSAL: ordered execution steps or flow from one component to another. Use ordered traversal steps matching the flow.',
      '- IMPACT_ANALYSIS: upstream/downstream effects of changing an entity. Use relation directions that discover affected dependents. For DatabaseObject seeds, use reverse INCOMING steps: READS_FROM or WRITES_TO to SoftwareComponent, then CALLS to SoftwareComponent, then INVOKES to ProcessStep.',
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
      'REGISTERED RELATION TYPES:',
      relationsStr,
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
    const initialMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.query },
    ];

    const firstOutput = await this.executeCompletion(initialMessages, options);

    const firstCheck = this.validatePlan(firstOutput, context);
    if (firstCheck.valid && firstCheck.plan) {
      return {
        type: 'plan',
        plan: firstCheck.plan,
        repaired: false,
      };
    }

    // Exactly one bounded repair attempt (D-15, D-16)
    const repairMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      ...initialMessages,
      { role: 'assistant', content: JSON.stringify(firstOutput) },
      {
        role: 'user',
        content: `Return one complete corrected LogicalQueryPlan JSON object only. Do not return prose, Markdown, or a partial patch. Schema and ontology validation errors: ${firstCheck.issues.join(
          '; '
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
      unsupportedConstructs: secondCheck.issues.length > 0 ? secondCheck.issues : firstCheck.issues,
    };
  }
}
