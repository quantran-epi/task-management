import {
  FactAssertion,
  GraphApprovalRecord,
  GraphCandidate,
  GraphConflictRecord,
  GraphEvidenceRecord,
  GraphNode,
  GraphRelation,
  QuarantinedIdentifier,
  EvidenceClassification,
} from '../types/graphProtocol.js';
import { RELATION_SEMANTICS, ONTOLOGY_VERSION } from './ontology.js';
import { sha256Hex } from '../indexing/chunkHashPolicy.js';

export interface MergeFactsInput {
  graphSnapshotId: string;
  sourceSnapshotId: string;
  setId: string;
  ontologyVersion?: string;
  nodes: GraphNode[];
  deterministicFacts: FactAssertion[];
  deterministicEvidence: GraphEvidenceRecord[];
  inferredFacts?: FactAssertion[];
  inferredEvidence?: GraphEvidenceRecord[];
  approvals?: GraphApprovalRecord[];
  quarantines?: QuarantinedIdentifier[];
  createdAt?: string;
}

/**
 * Priority order for effective evidence classification per D-18:
 * BUSINESS_APPROVED > OBSERVED > INFERRED
 */
export function computeEffectiveClassification(
  evidenceList: GraphEvidenceRecord[],
  hasApproval: boolean
): EvidenceClassification {
  if (hasApproval) {
    return 'BUSINESS_APPROVED';
  }
  const hasObserved = evidenceList.some((e) => e.classification === 'OBSERVED');
  if (hasObserved) {
    return 'OBSERVED';
  }
  return 'INFERRED';
}

/**
 * Builds deterministic normalized projection hash over sorted canonical tuples (entities + facts).
 * Excludes build timestamps, session IDs, and evidence occurrence details per D-14, D-21.
 */
export function computeNormalizedProjectionHash(
  nodes: GraphNode[],
  relations: GraphRelation[]
): string {
  const sortedNodes = [...nodes].sort((a, b) => a.urn.localeCompare(b.urn));
  const sortedRelations = [...relations].sort((a, b) => a.factKey.localeCompare(b.factKey));

  const nodeTuples = sortedNodes.map((n) => [
    n.urn,
    n.kind,
    n.canonicalName,
    n.sourceSystem,
    n.nativeType,
    n.normalizedKey,
    n.subkind || '',
  ]);

  const relationTuples = sortedRelations.map((r) => [
    r.factKey,
    r.ontologyVersion,
    r.subjectUrn,
    r.relation,
    r.objectUrn,
    Object.entries(r.qualifiers || {}).sort(([k1], [k2]) => k1.localeCompare(k2)),
    r.effectiveClassification,
    r.hasConflict,
    r.sourceMissing,
  ]);

  const payload = JSON.stringify([nodeTuples, relationTuples]);
  return sha256Hex(payload);
}

/**
 * Deterministic candidate assembler:
 * 1. Deduplicates facts using stable factKey (links multiple evidence occurrences to 1 fact).
 * 2. Overlays exact approval ledger per D-19.
 * 3. Detects direct contradictions in FUNCTIONAL relation slots (D-12, D-18).
 * 4. Flags source-missing approved facts per D-20.
 * 5. Assembles complete immutable GraphCandidate with normalized projection hash.
 */
export function mergeFactsDeterministicFirst(input: MergeFactsInput): GraphCandidate {
  const {
    graphSnapshotId,
    sourceSnapshotId,
    setId,
    ontologyVersion = ONTOLOGY_VERSION,
    nodes,
    deterministicFacts,
    deterministicEvidence,
    inferredFacts = [],
    inferredEvidence = [],
    approvals = [],
    quarantines = [],
    createdAt = new Date().toISOString(),
  } = input;

  // 1. Group evidence by factKey
  const evidenceByFactKey = new Map<string, GraphEvidenceRecord[]>();
  for (const ev of [...deterministicEvidence, ...inferredEvidence]) {
    const list = evidenceByFactKey.get(ev.factKey) || [];
    list.push(ev);
    evidenceByFactKey.set(ev.factKey, list);
  }

  // 2. Map approvals by factKey
  const approvalByFactKey = new Map<string, GraphApprovalRecord>();
  for (const app of approvals) {
    approvalByFactKey.set(app.factKey, app);
  }

  // 3. Collect unique facts (deterministic first, then inferred)
  const factsByKey = new Map<string, FactAssertion>();
  for (const fact of deterministicFacts) {
    factsByKey.set(fact.factKey, fact);
  }
  for (const fact of inferredFacts) {
    if (!factsByKey.has(fact.factKey)) {
      factsByKey.set(fact.factKey, fact);
    }
  }

  // Check for D-20: Approved facts that have no evidence in source
  // If an approval exists for a factKey not in current extraction, retain it
  // with sourceMissing = true, drop false OBSERVED status, and classification BUSINESS_APPROVED.
  for (const app of approvals) {
    if (!factsByKey.has(app.factKey) && (app as any).fact) {
      const retainedFact = (app as any).fact as FactAssertion;
      factsByKey.set(app.factKey, {
        ...retainedFact,
        classification: 'BUSINESS_APPROVED',
      });
    }
  }

  // 4. Functional conflict detection per D-12
  // A functional conflict occurs when the same subjectUrn has multiple distinct objectUrns for a FUNCTIONAL relation slot.
  const functionalSlotBuckets = new Map<string, FactAssertion[]>();
  for (const fact of factsByKey.values()) {
    const semanticSlot = RELATION_SEMANTICS[fact.relation];
    if (semanticSlot === 'FUNCTIONAL') {
      const bucketKey = `${fact.subjectUrn}:${fact.relation}`;
      const bucket = functionalSlotBuckets.get(bucketKey) || [];
      bucket.push(fact);
      functionalSlotBuckets.set(bucketKey, bucket);
    }
  }

  const conflicts: GraphConflictRecord[] = [];
  const conflictingFactKeys = new Set<string>();

  for (const [_, bucket] of functionalSlotBuckets.entries()) {
    if (bucket.length > 1) {
      const distinctObjects = new Set(bucket.map((b) => b.objectUrn));
      if (distinctObjects.size > 1) {
        for (let i = 0; i < bucket.length; i++) {
          for (let j = i + 1; j < bucket.length; j++) {
            const factA = bucket[i]!;
            const factB = bucket[j]!;
            if (factA.objectUrn !== factB.objectUrn) {
              conflictingFactKeys.add(factA.factKey);
              conflictingFactKeys.add(factB.factKey);

              const evA = evidenceByFactKey.get(factA.factKey)?.[0] || {
                evidenceId: '00000000-0000-0000-0000-000000000000',
                factKey: factA.factKey,
                documentId: '00000000-0000-0000-0000-000000000000',
                documentTitle: 'Synthetic',
                sectionHeadingPath: [],
                startLine: 1,
                endLine: 1,
                startOffset: 0,
                endOffset: 0,
                rawSnippet: '',
                extractionMethod: 'MANUAL_ASSERTION',
                classification: factA.classification,
                confidence: 1,
                observedAt: createdAt,
              };

              const evB = evidenceByFactKey.get(factB.factKey)?.[0] || {
                evidenceId: '00000000-0000-0000-0000-000000000000',
                factKey: factB.factKey,
                documentId: '00000000-0000-0000-0000-000000000000',
                documentTitle: 'Synthetic',
                sectionHeadingPath: [],
                startLine: 1,
                endLine: 1,
                startOffset: 0,
                endOffset: 0,
                rawSnippet: '',
                extractionMethod: 'MANUAL_ASSERTION',
                classification: factB.classification,
                confidence: 1,
                observedAt: createdAt,
              };

              const conflictSeed = `${factA.factKey}:${factB.factKey}`;
              const conflictHash = sha256Hex(conflictSeed);
              const conflictId = `${conflictHash.slice(0, 8)}-${conflictHash.slice(8, 12)}-4${conflictHash.slice(13, 16)}-8${conflictHash.slice(17, 20)}-${conflictHash.slice(20, 32)}`;

              conflicts.push({
                conflictId,
                factKeyA: factA.factKey,
                factKeyB: factB.factKey,
                subjectUrn: factA.subjectUrn,
                relation: factA.relation,
                conflictType: 'DIRECT_CONTRADICTION',
                evidenceA: evA,
                evidenceB: evB,
                detectedAt: createdAt,
                resolved: false,
              });
            }
          }
        }
      }
    }
  }

  // 5. Build GraphRelation records
  const relations: GraphRelation[] = [];
  for (const fact of factsByKey.values()) {
    const evList = evidenceByFactKey.get(fact.factKey) || [];
    const hasApproval = approvalByFactKey.has(fact.factKey);
    const effectiveClassification = computeEffectiveClassification(evList, hasApproval);
    const hasConflict = conflictingFactKeys.has(fact.factKey);
    const sourceMissing = evList.length === 0;

    relations.push({
      factKey: fact.factKey,
      ontologyVersion: fact.ontologyVersion,
      subjectUrn: fact.subjectUrn,
      relation: fact.relation,
      objectUrn: fact.objectUrn,
      qualifiers: fact.qualifiers,
      effectiveClassification,
      hasConflict,
      sourceMissing,
    });
  }

  // 6. Compute normalized hash
  const normalizedProjectionHash = computeNormalizedProjectionHash(nodes, relations);

  // 7. Flatten all evidence
  const allEvidence: GraphEvidenceRecord[] = [];
  for (const evs of evidenceByFactKey.values()) {
    allEvidence.push(...evs);
  }

  return {
    graphSnapshotId,
    sourceSnapshotId,
    setId,
    ontologyVersion,
    normalizedProjectionHash,
    nodes,
    relations,
    evidence: allEvidence,
    conflicts,
    approvals,
    quarantines,
    createdAt,
  };
}
