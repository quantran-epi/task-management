import { z } from 'zod';
import { normalizeVietnamese, tokenize } from '../../utils/bm25';
import {
  completeJson as defaultCompleteJson,
  probeStructuredOutputCapability,
} from './nineRouterClient';
import type { IntentLabel } from './intentRouter';

export interface SetCatalogEntry {
  setId: string;
  canonicalName: string;
  domain: string;
  environment: string | null;
  version: string | null;
  aliases: readonly string[];
  relation: 'EXTENDS' | 'SUPPLEMENTS' | 'SUPERSEDES' | null;
  isBase: boolean;
}

export interface SetTierAssignment {
  setId: string;
  tier: 'REQUIRED' | 'LIKELY' | 'OPTIONAL';
  roleGroup: 'baseline' | 'scope_diff';
}

export interface ResolvedScope {
  setTierAssignments: SetTierAssignment[];
  comparisonMode: 'single' | 'baseline_vs_scope' | null;
  routerSource: 'llm' | 'alias' | 'base_default';
}

export interface RouteScopeInput {
  query: string;
  routedIntent?: IntentLabel;
}

export interface RouteScopeDeps {
  catalog: readonly SetCatalogEntry[];
  completeJson?: typeof defaultCompleteJson;
  completeJsonArgs?: {
    endpoint: string;
    apiKey?: string;
    model: string;
  };
  signal: AbortSignal;
}

const ScopeLlmResponseSchema = z.strictObject({
  domain: z.string().nullable(),
  environment: z.string().nullable(),
  version: z.string().nullable(),
  comparisonMode: z.enum(['single', 'baseline_vs_scope']).nullable(),
  subqueries: z.array(z.string()).max(5),
});

function resolveLlmOutput(
  output: z.infer<typeof ScopeLlmResponseSchema>,
  catalog: readonly SetCatalogEntry[]
): ResolvedScope | null {
  const assignments: SetTierAssignment[] = [];
  const assignedSetIds = new Set<string>();

  const targetDomain = output.domain?.trim().toLowerCase();
  const targetEnv = output.environment?.trim().toLowerCase();
  const targetVer = output.version?.trim().toLowerCase();

  // Find explicit scoped sets (environment or version or non-base match)
  const scopedEntries = catalog.filter((entry) => {
    if (entry.isBase) return false;
    const matchesDomain = !targetDomain || entry.domain.toLowerCase() === targetDomain;
    const matchesEnv = Boolean(
      targetEnv && entry.environment && entry.environment.toLowerCase() === targetEnv
    );
    const matchesVer = Boolean(
      targetVer && entry.version && entry.version.toLowerCase() === targetVer
    );
    return matchesDomain && (matchesEnv || matchesVer);
  });

  if (scopedEntries.length > 0) {
    for (const scoped of scopedEntries) {
      if (!assignedSetIds.has(scoped.setId)) {
        assignments.push({
          setId: scoped.setId,
          tier: 'REQUIRED',
          roleGroup: 'scope_diff',
        });
        assignedSetIds.add(scoped.setId);
      }
    }

    // Baseline sets for baseline_vs_scope comparison
    const baseEntries = catalog.filter((entry) => {
      if (!entry.isBase) return false;
      if (!targetDomain) return true;
      return entry.domain.toLowerCase() === targetDomain;
    });

    for (const base of baseEntries) {
      if (!assignedSetIds.has(base.setId)) {
        assignments.push({
          setId: base.setId,
          tier: 'REQUIRED',
          roleGroup: 'baseline',
        });
        assignedSetIds.add(base.setId);
      }
    }

    return {
      setTierAssignments: assignments,
      comparisonMode: 'baseline_vs_scope',
      routerSource: 'llm',
    };
  }

  // Domain-only or base match
  const domainEntries = catalog.filter((entry) => {
    if (!targetDomain) return false;
    return entry.domain.toLowerCase() === targetDomain;
  });

  if (domainEntries.length > 0) {
    for (const entry of domainEntries) {
      if (!assignedSetIds.has(entry.setId)) {
        assignments.push({
          setId: entry.setId,
          tier: 'REQUIRED',
          roleGroup: 'baseline',
        });
        assignedSetIds.add(entry.setId);
      }
    }

    return {
      setTierAssignments: assignments,
      comparisonMode: 'single',
      routerSource: 'llm',
    };
  }

  return null;
}

function resolveDeterministicFallback(
  query: string,
  catalog: readonly SetCatalogEntry[]
): ResolvedScope {
  const normQuery = normalizeVietnamese(query);
  const queryTokens = tokenize(query);

  const assignments: SetTierAssignment[] = [];
  const assignedSetIds = new Set<string>();

  let hasScopedMatch = false;

  for (const entry of catalog) {
    const normCanonical = normalizeVietnamese(entry.canonicalName);
    const canonicalTokens = tokenize(entry.canonicalName);

    const isFullCanonical =
      normCanonical.length > 0 &&
      (normQuery.includes(normCanonical) ||
        (canonicalTokens.length > 0 &&
          canonicalTokens.every((token) => queryTokens.includes(token))));

    let matchedTier: 'REQUIRED' | 'LIKELY' | null = null;

    if (isFullCanonical) {
      matchedTier = 'REQUIRED';
    } else {
      for (const alias of entry.aliases) {
        const normAlias = normalizeVietnamese(alias);
        const aliasTokens = tokenize(alias);
        if (normAlias.length === 0 || aliasTokens.length === 0) continue;

        if (
          normQuery.includes(normAlias) ||
          aliasTokens.every((token) => queryTokens.includes(token))
        ) {
          matchedTier = 'REQUIRED';
          break;
        } else if (
          aliasTokens.length >= 2 &&
          aliasTokens.filter((token) => queryTokens.includes(token)).length /
            aliasTokens.length >=
            0.75
        ) {
          matchedTier = 'LIKELY';
        }
      }
    }

    if (matchedTier) {
      const isScoped = !entry.isBase || entry.environment !== null || entry.version !== null;
      if (isScoped) {
        hasScopedMatch = true;
      }
      assignments.push({
        setId: entry.setId,
        tier: matchedTier,
        roleGroup: isScoped ? 'scope_diff' : 'baseline',
      });
      assignedSetIds.add(entry.setId);
    }
  }

  // D-21/D-22: Scoped match requires baseline role group
  if (hasScopedMatch) {
    const baseEntries = catalog.filter((entry) => entry.isBase);
    for (const base of baseEntries) {
      if (!assignedSetIds.has(base.setId)) {
        assignments.push({
          setId: base.setId,
          tier: 'REQUIRED',
          roleGroup: 'baseline',
        });
        assignedSetIds.add(base.setId);
      }
    }

    // Add related domains by relation edge (EXTENDS / SUPPLEMENTS) -> OPTIONAL
    for (const entry of catalog) {
      if (
        !assignedSetIds.has(entry.setId) &&
        (entry.relation === 'EXTENDS' || entry.relation === 'SUPPLEMENTS')
      ) {
        assignments.push({
          setId: entry.setId,
          tier: 'OPTIONAL',
          roleGroup: 'baseline',
        });
        assignedSetIds.add(entry.setId);
      }
    }

    return {
      setTierAssignments: assignments,
      comparisonMode: 'baseline_vs_scope',
      routerSource: 'alias',
    };
  }

  // If alias matches were found without scoped differences
  if (assignments.length > 0) {
    return {
      setTierAssignments: assignments,
      comparisonMode: 'single',
      routerSource: 'alias',
    };
  }

  // General question with no explicit scope (D-21): resolve to isBase === true sets
  const baseEntries = catalog.filter((entry) => entry.isBase);
  if (baseEntries.length > 0) {
    for (const base of baseEntries) {
      assignments.push({
        setId: base.setId,
        tier: 'REQUIRED',
        roleGroup: 'baseline',
      });
    }
    return {
      setTierAssignments: assignments,
      comparisonMode: 'single',
      routerSource: 'base_default',
    };
  }

  // Catalog with no isBase and general query returns empty
  return {
    setTierAssignments: [],
    comparisonMode: null,
    routerSource: 'alias',
  };
}

export async function routeScope(
  input: RouteScopeInput,
  deps: RouteScopeDeps
): Promise<ResolvedScope> {
  const completeFn = deps.completeJson;
  const completeArgs = deps.completeJsonArgs;

  if (completeFn && completeArgs) {
    try {
      const probe = await probeStructuredOutputCapability(
        completeArgs.endpoint,
        completeArgs.model,
        completeArgs.apiKey,
        deps.signal
      );

      if (probe.ok && probe.strictJsonSchema) {
        // Build catalog payload with NO setId sent to model (D-19)
        const sanitizedCatalog = deps.catalog.map(
          ({ setId: _omittedSetId, ...entryWithoutSetId }) => entryWithoutSetId
        );

        const raw = await completeFn({
          endpoint: completeArgs.endpoint,
          apiKey: completeArgs.apiKey,
          model: completeArgs.model,
          temperature: 0,
          maxTokens: 500,
          messages: [
            {
              role: 'system',
              content:
                'Return only canonical scope values from the supplied CATALOG. Never invent setId. Never include free-form text.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                query: input.query,
                catalog: sanitizedCatalog,
              }),
            },
          ],
          responseFormat: {
            type: 'json_schema',
            json_schema: {
              name: 'semantic_scope_v1',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  domain: { type: ['string', 'null'] },
                  environment: { type: ['string', 'null'] },
                  version: { type: ['string', 'null'] },
                  comparisonMode: {
                    type: ['string', 'null'],
                    enum: ['single', 'baseline_vs_scope', null],
                  },
                  subqueries: {
                    type: 'array',
                    items: { type: 'string' },
                    maxItems: 5,
                  },
                },
                required: [
                  'domain',
                  'environment',
                  'version',
                  'comparisonMode',
                  'subqueries',
                ],
                additionalProperties: false,
              },
            },
          },
          signal: deps.signal,
        });

        // Strict invariant (D-19, T-19-13): Model MUST NOT invent setId
        if (raw && typeof raw === 'object' && 'setId' in raw) {
          throw new Error('LLM response containing a setId field is forbidden');
        }

        const parsed = ScopeLlmResponseSchema.safeParse(raw);
        if (parsed.success) {
          const resolved = resolveLlmOutput(parsed.data, deps.catalog);
          if (resolved) {
            return resolved;
          }
        }
      }
    } catch {
      // Degraded fallback to deterministic alias router (D-20)
    }
  }

  return resolveDeterministicFallback(input.query, deps.catalog);
}
