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
      'Translate user questions into a JSON LogicalQueryPlan matching the schema below.',
      'RULES:',
      '1. NEVER generate or accept Cypher statements, SQL, or arbitrary code.',
      '2. seedUrns MUST only contain URNs from the provided resolved candidates.',
      '3. traversalSteps MUST only use registered relation types and obey max hops.',
      '4. Output ONLY valid JSON adhering strictly to LogicalQueryPlanSchema.',
      '',
      'RESOLVED CANDIDATES:',
      candidatesStr || 'None',
      '',
      'REGISTERED RELATION TYPES:',
      relationsStr,
      '',
      'SCHEMA FIELDS:',
      '- planId: UUID string',
      '- queryIntent: "LOOKUP" | "FLOW_TRAVERSAL" | "IMPACT_ANALYSIS" | "DEPENDENCY_CHECK"',
      '- seedUrns: array of URN strings (1..5)',
      '- traversalSteps: array of { relationType, direction ("OUTGOING"|"INCOMING"|"BOTH"), maxHops (1..3), targetKind? } (0..5)',
      '- overallMaxDepth: integer 1..3',
      '- includeInferred: boolean',
      '- fulltextKeywords: array of non-empty strings (>=1)',
      '- semanticQuery: non-empty string',
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
      const errText = await response.text().catch(() => '');
      throw new Error(`9router HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('9router returned empty completion content');
    }

    return JSON.parse(extractJsonContent(rawContent));
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

    let firstOutput: unknown;
    try {
      firstOutput = await this.executeCompletion(initialMessages, options);
    } catch (err) {
      return {
        type: 'unsupported',
        reason: 'PLANNER_SCHEMA_FAILURE',
        unsupportedConstructs: [err instanceof Error ? err.message : 'HTTP error'],
      };
    }

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
        content: `Repair this logical query plan. Schema and ontology validation errors: ${firstCheck.issues.join(
          '; '
        )}. Output ONLY corrected JSON.`,
      },
    ];

    let secondOutput: unknown;
    try {
      secondOutput = await this.executeCompletion(repairMessages, options);
    } catch (err) {
      return {
        type: 'unsupported',
        reason: 'PLANNER_SCHEMA_FAILURE',
        unsupportedConstructs: [
          ...firstCheck.issues,
          err instanceof Error ? err.message : 'HTTP error on repair',
        ],
      };
    }

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
