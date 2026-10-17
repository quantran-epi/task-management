import type { CaseEvaluationResult } from './evaluatorCore';

export interface GateThresholds {
  readonly aggregatePassRate: number;
  readonly categoryPassRate: number;
  readonly threeHopPassRate: number;
  readonly pathFidelityRate: number;
  readonly maxInvariantViolations: 0;
}

export const DEFAULT_GATE_THRESHOLDS: GateThresholds = {
  aggregatePassRate: 0.9,
  categoryPassRate: 0.8,
  threeHopPassRate: 0.9,
  pathFidelityRate: 1.0,
  maxInvariantViolations: 0,
};

export interface GateScoreItem {
  readonly total: number;
  readonly passed: number;
  readonly passRate: number;
  readonly passedGate: boolean;
}

export interface GatePathFidelityItem {
  readonly totalEvaluated: number;
  readonly passed: number;
  readonly fidelityRate: number;
  readonly passedGate: boolean;
}

export interface GateVerdict {
  readonly passedGate: boolean;
  readonly aggregatePassRate: number;
  readonly passesAggregate: boolean;
  readonly categoryScores: Record<string, GateScoreItem>;
  readonly passesCategories: boolean;
  readonly threeHopScore: GateScoreItem;
  readonly passesThreeHop: boolean;
  readonly pathFidelity: GatePathFidelityItem;
  readonly passesPathFidelity: boolean;
  readonly invariantViolations: readonly { readonly caseId: string; readonly violation: string }[];
  readonly passesInvariants: boolean;
}

export function evaluateReleaseGate(
  results: readonly CaseEvaluationResult[],
  thresholds: GateThresholds = DEFAULT_GATE_THRESHOLDS
): GateVerdict {
  const totalCases = results.length;
  const passedCases = results.filter((r) => r.passed).length;
  const aggregatePassRate = totalCases > 0 ? passedCases / totalCases : 0;
  const passesAggregate = aggregatePassRate >= thresholds.aggregatePassRate;

  // Category scores
  const categoryGroups = new Map<string, CaseEvaluationResult[]>();
  for (const r of results) {
    const list = categoryGroups.get(r.category) ?? [];
    list.push(r);
    categoryGroups.set(r.category, list);
  }

  const categoryScores: Record<string, GateScoreItem> = {};
  let passesCategories = true;

  for (const [cat, items] of categoryGroups.entries()) {
    const total = items.length;
    const passed = items.filter((i) => i.passed).length;
    const passRate = total > 0 ? passed / total : 0;
    const passedGate = passRate >= thresholds.categoryPassRate;
    if (!passedGate) {
      passesCategories = false;
    }
    categoryScores[cat] = {
      total,
      passed,
      passRate: Number(passRate.toFixed(4)),
      passedGate,
    };
  }

  // 3-hop score
  const threeHopCases = results.filter((r) => r.isThreeHop);
  const threeHopTotal = threeHopCases.length;
  const threeHopPassed = threeHopCases.filter((r) => r.passed).length;
  const threeHopRate = threeHopTotal > 0 ? threeHopPassed / threeHopTotal : 1.0;
  const passesThreeHop = threeHopRate >= thresholds.threeHopPassRate;
  const threeHopScore: GateScoreItem = {
    total: threeHopTotal,
    passed: threeHopPassed,
    passRate: Number(threeHopRate.toFixed(4)),
    passedGate: passesThreeHop,
  };

  // Path fidelity
  const pathCases = results.filter((r) => r.hasExpectedPaths);
  const pathTotal = pathCases.length;
  const pathPassed = pathCases.filter((r) => r.pathFidelityPassed).length;
  const pathFidelityRate = pathTotal > 0 ? pathPassed / pathTotal : 1.0;
  const passesPathFidelity = pathFidelityRate >= thresholds.pathFidelityRate;
  const pathFidelity: GatePathFidelityItem = {
    totalEvaluated: pathTotal,
    passed: pathPassed,
    fidelityRate: Number(pathFidelityRate.toFixed(4)),
    passedGate: passesPathFidelity,
  };

  // Zero-Tolerance Invariants
  const invariantViolations: { caseId: string; violation: string }[] = [];
  for (const r of results) {
    for (const v of r.invariantViolations) {
      invariantViolations.push(v);
    }
  }
  const passesInvariants = invariantViolations.length <= thresholds.maxInvariantViolations;

  const passedGate =
    passesAggregate &&
    passesCategories &&
    passesThreeHop &&
    passesPathFidelity &&
    passesInvariants;

  return {
    passedGate,
    aggregatePassRate: Number(aggregatePassRate.toFixed(4)),
    passesAggregate,
    categoryScores,
    passesCategories,
    threeHopScore,
    passesThreeHop,
    pathFidelity,
    passesPathFidelity,
    invariantViolations,
    passesInvariants,
  };
}
