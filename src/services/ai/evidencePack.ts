import type {
  FederatedRetrievalResponse,
  ChunkItem,
  ConflictGroup,
} from '../knowledge/retrievalProtocol';
import type { GroundedAnswer } from './groundedAnswerSchemas';
import type { LocalGroundedResult } from '../search/localGroundedRetrieval';

export interface SourceRecord {
  readonly citationId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly sectionAnchor: string | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly authority: 'server' | 'local';
  readonly evidenceClass: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | 'LOCAL';
  readonly snapshotId: string | null;
  readonly publishedContentHash: string | null;
  readonly citedExcerpt: string;
  readonly relevanceReason?: string | undefined;
  readonly setMemberships: readonly { readonly setId: string; readonly setName: string }[];
  readonly evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'other' | undefined;
  readonly conflictGroupId?: string | undefined;
}

export interface ValidatedPath {
  readonly pathId: string;
  readonly snapshotId: string;
  readonly nodeUrns: readonly string[];
  readonly edgeFactKeys: readonly string[];
  readonly hopClassifications: readonly string[];
  readonly hopCitationIds: readonly (readonly string[])[];
  readonly classification: string;
  readonly hasConflict: boolean;
}

export interface PromptEvidenceItem {
  readonly id: string;
  readonly text: string;
  readonly score?: number | undefined;
  readonly documentTitle?: string | undefined;
  readonly sectionAnchor?: string | null | undefined;
}

export interface EvidencePack {
  readonly authority: 'server' | 'local';
  readonly citations: Readonly<Record<string, SourceRecord>>;
  readonly paths: Readonly<Record<string, ValidatedPath>>;
  readonly conflicts: readonly ConflictGroup[];
  readonly promptEvidence: readonly PromptEvidenceItem[];
  readonly contextTruncated: boolean;
  readonly coverageWarnings: readonly string[];
}

export interface PackEvidenceInput {
  readonly authority: 'server' | 'local';
  readonly serverResponse?: FederatedRetrievalResponse;
  readonly localResult?: LocalGroundedResult;
}

export interface PackEvidenceOptions {
  readonly maxEvidenceChars?: number;
  readonly maxPromptEvidenceCount?: number;
  readonly maxPerSnippetChars?: number;
}

export const OVERRIDE_TERMS = /(?:^|\P{L})(overrides?|supersed(e|es|ed|ing)|replaces?|thay thế|ghi đè)(?:\P{L}|$)/iu;

export const ALLOWED_EVIDENCE_KINDS = new Set<string>([
  'policy_change',
  'release_note',
  'migration_record',
]);

const CLASSIFICATION_ORDER: readonly string[] = [
  'LOCAL',
  'INFERRED',
  'OBSERVED',
  'BUSINESS_APPROVED',
];

export function nextCitationId(authority: 'server' | 'local', index: number): string {
  const prefix = authority === 'server' ? 'S' : 'L';
  return `${prefix}${index + 1}`;
}

export function nextPathId(index: number): string {
  return `P${index + 1}`;
}

export function computeWeakestClassification(classifications: readonly string[]): string {
  if (classifications.length === 0) return 'LOCAL';
  let weakest = classifications[0] ?? 'LOCAL';
  let weakestRank = CLASSIFICATION_ORDER.indexOf(weakest);
  if (weakestRank === -1) weakestRank = 0;

  for (let i = 1; i < classifications.length; i++) {
    const cur = classifications[i] ?? 'LOCAL';
    let curRank = CLASSIFICATION_ORDER.indexOf(cur);
    if (curRank === -1) curRank = 0;
    if (curRank < weakestRank) {
      weakest = cur;
      weakestRank = curRank;
    }
  }
  return weakest;
}

export function claimAssertsOverride(text: string): boolean {
  return OVERRIDE_TERMS.test(text);
}

interface RawCandidateCitation {
  readonly dedupKey: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly sectionAnchor: string | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly authority: 'server' | 'local';
  readonly evidenceClass: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | 'LOCAL';
  readonly snapshotId: string | null;
  readonly publishedContentHash: string | null;
  readonly citedExcerpt: string;
  readonly relevanceReason?: string | undefined;
  readonly setMemberships: readonly { readonly setId: string; readonly setName: string }[];
  readonly evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'other' | undefined;
  readonly originalChunkId?: string | undefined;
  readonly conflictGroupId?: string | undefined;
  readonly isIdentifierMatch?: boolean | undefined;
  readonly score?: number | undefined;
}

export function packEvidence(
  input: PackEvidenceInput,
  options: PackEvidenceOptions = {}
): EvidencePack {
  const authority = input.authority;
  const isServer = authority === 'server';
  const defaultMaxChars = isServer ? 8000 : 6000;
  const defaultMaxCount = isServer ? 20 : 5;
  const maxEvidenceChars = options.maxEvidenceChars ?? defaultMaxChars;
  const maxPromptEvidenceCount = options.maxPromptEvidenceCount ?? defaultMaxCount;
  const maxPerSnippetChars = options.maxPerSnippetChars ?? 1200;

  const rawCandidates: RawCandidateCitation[] = [];
  const coverageWarnings: string[] = [];

  if (isServer && input.serverResponse) {
    const resp = input.serverResponse;
    if (resp.diagnostics?.coverageWarnings) {
      for (const cw of resp.diagnostics.coverageWarnings) {
        coverageWarnings.push(cw.message);
      }
    }

    for (const fedItem of resp.items) {
      const chunk = ((fedItem as any).item ?? fedItem) as unknown as ChunkItem & {
        readonly evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'other';
        readonly matchType?: string;
        readonly snapshotId?: string;
        readonly setId?: string;
      };

      if (chunk && chunk.type === 'chunk') {
        const dedupKey = `${chunk.sourceDocumentId}:${chunk.lineStart}:${chunk.lineEnd}:${chunk.publishedContentHash}`;
        let excerpt = chunk.rawSnippet ?? '';
        if (excerpt.length > maxPerSnippetChars) {
          excerpt = excerpt.slice(0, maxPerSnippetChars);
        }

        const isId =
          chunk.matchType === 'identifier' ||
          (Array.isArray(chunk.modalitiesContributed) &&
            chunk.modalitiesContributed.includes('fulltext') &&
            chunk.score > 100);

        const snapshotId = (fedItem as any).snapshotId ?? chunk.snapshotId ?? (resp as any).snapshotId ?? null;
        const setId = (fedItem as any).setId ?? chunk.setId ?? 'default_set';

        rawCandidates.push({
          dedupKey,
          documentId: chunk.sourceDocumentId,
          documentTitle: chunk.sourceDocumentTitle,
          sectionAnchor: chunk.sectionAnchor || null,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId,
          publishedContentHash: chunk.publishedContentHash,
          citedExcerpt: excerpt,
          setMemberships: [{ setId, setName: setId }],
          evidenceKind: chunk.evidenceKind ?? 'other',
          originalChunkId: chunk.id,
          conflictGroupId: chunk.conflictGroupId,
          isIdentifierMatch: isId,
          score: typeof (chunk as any).score === 'number' ? (chunk as any).score : 0,
        });
      }
    }
  } else if (!isServer && input.localResult) {
    for (const r of input.localResult.ranges) {
      const dedupKey = `${r.documentId}:${r.lineStart}:${r.lineEnd}:local`;
      let excerpt = r.rawSnippet ?? '';
      if (excerpt.length > maxPerSnippetChars) {
        excerpt = excerpt.slice(0, maxPerSnippetChars);
      }
      rawCandidates.push({
        dedupKey,
        documentId: r.documentId,
        documentTitle: r.documentTitle,
        sectionAnchor: r.sectionAnchor,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        authority: 'local',
        evidenceClass: 'LOCAL',
        snapshotId: null,
        publishedContentHash: null,
        citedExcerpt: excerpt,
        setMemberships: r.setMemberships,
        evidenceKind: 'other',
        score: typeof (r as any).score === 'number' ? (r as any).score : 0,
      });
    }
  }

  // Deduplicate candidates preserving encounter order, merge setMemberships (D-39)
  const dedupedMap = new Map<string, { candidate: RawCandidateCitation; citationId: string }>();
  const chunkIdToCitationId = new Map<string, string>();
  const citations: Record<string, SourceRecord> = {};
  let citationCounter = 0;

  for (const c of rawCandidates) {
    const existing = dedupedMap.get(c.dedupKey);
    if (existing) {
      // Merge set memberships if not already present
      const currentSets = new Map(existing.candidate.setMemberships.map((s) => [s.setId, s.setName]));
      for (const m of c.setMemberships) {
        if (!currentSets.has(m.setId)) {
          currentSets.set(m.setId, m.setName);
        }
      }
      const mergedMemberships = Array.from(currentSets.entries()).map(([setId, setName]) => ({
        setId,
        setName,
      }));
      const updatedCandidate: RawCandidateCitation = {
        ...existing.candidate,
        setMemberships: mergedMemberships,
      };
      existing.candidate = updatedCandidate;
      citations[existing.citationId] = {
        citationId: existing.citationId,
        documentId: updatedCandidate.documentId,
        documentTitle: updatedCandidate.documentTitle,
        sectionAnchor: updatedCandidate.sectionAnchor,
        lineStart: updatedCandidate.lineStart,
        lineEnd: updatedCandidate.lineEnd,
        authority: updatedCandidate.authority,
        evidenceClass: updatedCandidate.evidenceClass,
        snapshotId: updatedCandidate.snapshotId,
        publishedContentHash: updatedCandidate.publishedContentHash,
        citedExcerpt: updatedCandidate.citedExcerpt,
        relevanceReason: updatedCandidate.relevanceReason,
        setMemberships: updatedCandidate.setMemberships,
        evidenceKind: updatedCandidate.evidenceKind,
        conflictGroupId: updatedCandidate.conflictGroupId,
      };
      if (c.originalChunkId) {
        chunkIdToCitationId.set(c.originalChunkId, existing.citationId);
      }
    } else {
      const cId = nextCitationId(authority, citationCounter++);
      dedupedMap.set(c.dedupKey, { candidate: c, citationId: cId });
      if (c.originalChunkId) {
        chunkIdToCitationId.set(c.originalChunkId, cId);
      }
      citations[cId] = {
        citationId: cId,
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        sectionAnchor: c.sectionAnchor,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        authority: c.authority,
        evidenceClass: c.evidenceClass,
        snapshotId: c.snapshotId,
        publishedContentHash: c.publishedContentHash,
        citedExcerpt: c.citedExcerpt,
        setMemberships: c.setMemberships,
        evidenceKind: c.evidenceKind,
        conflictGroupId: c.conflictGroupId,
      };
    }
  }

  // Paths processing (server authority only per D-38)
  const paths: Record<string, ValidatedPath> = {};
  const pathCitationIds = new Set<string>();

  if (isServer && input.serverResponse?.paths) {
    let pathCounter = 0;
    for (const fedPath of input.serverResponse.paths) {
      const p = fedPath.path;
      // Map original hop chunk IDs to assigned citation IDs
      let closureValid = true;
      const mappedHopCitations: string[][] = [];

      for (const hopIds of p.hopCitationIds) {
        const mappedHop: string[] = [];
        for (const origId of hopIds) {
          const mapped = chunkIdToCitationId.get(origId);
          if (mapped && citations[mapped]) {
            mappedHop.push(mapped);
          } else if (citations[origId]) {
            mappedHop.push(origId);
          }
        }
        if (mappedHop.length === 0) {
          closureValid = false;
          break;
        }
        mappedHopCitations.push(mappedHop);
      }

      if (closureValid) {
        const pId = nextPathId(pathCounter++);
        const validatedPath: ValidatedPath = {
          pathId: pId,
          snapshotId: p.snapshotId,
          nodeUrns: p.nodeUrns,
          edgeFactKeys: p.edgeFactKeys,
          hopClassifications: p.hopClassifications,
          hopCitationIds: mappedHopCitations,
          classification: p.classification,
          hasConflict: p.hasConflict,
        };
        paths[pId] = validatedPath;
        for (const hop of mappedHopCitations) {
          for (const cid of hop) {
            pathCitationIds.add(cid);
          }
        }
      }
    }
  }

  // Conflicts
  const conflicts: ConflictGroup[] = [];
  const conflictCitationIds = new Set<string>();
  if (isServer && input.serverResponse?.conflictGroups) {
    for (const fedConflict of input.serverResponse.conflictGroups) {
      conflicts.push(fedConflict.conflictGroup);
    }
  }

  // Find all citations referenced by conflict branches
  for (const item of dedupedMap.values()) {
    if (item.candidate.conflictGroupId) {
      conflictCitationIds.add(item.citationId);
    }
  }

  // Packing order (AI-SPEC §4b):
  // (a) every citation referenced by a conflict branch
  // (b) exact identifier/title hits
  // (c) citations supporting any complete ValidatedPath
  // (d) remaining ranked items sorted by relevance score
  const bucketA: PromptEvidenceItem[] = [];
  const bucketB: PromptEvidenceItem[] = [];
  const bucketC: PromptEvidenceItem[] = [];
  const bucketD: PromptEvidenceItem[] = [];

  for (const { candidate, citationId } of dedupedMap.values()) {
    const promptItem: PromptEvidenceItem = {
      id: citationId,
      text: candidate.citedExcerpt,
      score: candidate.score ?? 0,
      documentTitle: candidate.documentTitle,
      sectionAnchor: candidate.sectionAnchor || undefined,
    };
    if (conflictCitationIds.has(citationId)) {
      bucketA.push(promptItem);
    } else if (candidate.isIdentifierMatch) {
      bucketB.push(promptItem);
    } else if (pathCitationIds.has(citationId)) {
      bucketC.push(promptItem);
    } else {
      bucketD.push(promptItem);
    }
  }

  // Sort remaining general chunks by relevance score descending so that top-ranking documents
  // across any document set are not starved by the 20-chunk budget cap
  bucketD.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const orderedPromptEvidence = [...bucketA, ...bucketB, ...bucketC, ...bucketD];

  // Budget drop: whole units dropped when exceeding maxEvidenceChars or maxPromptEvidenceCount (D-03)
  const finalPromptEvidence: PromptEvidenceItem[] = [];
  let totalChars = 0;
  let droppedCount = 0;
  let contextTruncated = false;

  for (const item of orderedPromptEvidence) {
    if (finalPromptEvidence.length >= maxPromptEvidenceCount) {
      droppedCount++;
      contextTruncated = true;
      continue;
    }
    if (totalChars + item.text.length > maxEvidenceChars) {
      droppedCount++;
      contextTruncated = true;
      continue;
    }
    finalPromptEvidence.push(item);
    totalChars += item.text.length;
  }

  if (contextTruncated && droppedCount > 0) {
    coverageWarnings.push(`${droppedCount} lowest-ranked chunks omitted for budget`);
  }

  return {
    authority,
    citations,
    paths,
    conflicts,
    promptEvidence: finalPromptEvidence,
    contextTruncated,
    coverageWarnings,
  };
}

export interface ClosureIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ClosureValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ClosureIssue[];
}

export function validateGroundedAnswerClosure(
  answer: GroundedAnswer,
  pack: EvidencePack
): ClosureValidationResult {
  const issues: ClosureIssue[] = [];

  for (let i = 0; i < answer.claims.length; i++) {
    const claim = answer.claims[i]!;

    // 1. Every claim.citationIds[i] must exist in pack.citations (D-01)
    for (let cIdx = 0; cIdx < claim.citationIds.length; cIdx++) {
      const cid = claim.citationIds[cIdx]!;
      if (!pack.citations[cid]) {
        issues.push({
          path: `claims[${i}].citationIds[${cIdx}]`,
          code: 'unknown_citation_id',
          message: `Citation ID '${cid}' does not exist in evidence pack`,
        });
      }
    }

    // 2. INFERRED claim requires validated pathId and closure (D-02)
    if (claim.classification === 'INFERRED') {
      if (!claim.pathId) {
        issues.push({
          path: `claims[${i}].pathId`,
          code: 'inferred_requires_path',
          message: 'INFERRED claim requires a validated pathId',
        });
      } else {
        const p = pack.paths[claim.pathId];
        if (!p) {
          issues.push({
            path: `claims[${i}].pathId`,
            code: 'unknown_path_id',
            message: `Path ID '${claim.pathId}' does not exist in evidence pack`,
          });
        } else {
          // Every edge in path must have at least one citation present in claim.citationIds or path's hopCitationIds
          const claimCitationsSet = new Set(claim.citationIds);
          let allEdgesSupported = true;
          for (let hopIdx = 0; hopIdx < p.hopCitationIds.length; hopIdx++) {
            const hopIds = p.hopCitationIds[hopIdx]!;
            const hopHasCitation = hopIds.some(
              (id) => claimCitationsSet.has(id) || pack.citations[id] !== undefined
            );
            if (!hopHasCitation) {
              allEdgesSupported = false;
              break;
            }
          }
          if (!allEdgesSupported) {
            issues.push({
              path: `claims[${i}].pathId`,
              code: 'path_hop_unsupported',
              message: `Path '${claim.pathId}' contains hop without supporting citation`,
            });
          }
        }
      }
    }

    // 3. DIRECT claim must have null pathId (D-30)
    if (claim.classification === 'DIRECT' && claim.pathId !== null) {
      issues.push({
        path: `claims[${i}].pathId`,
        code: 'direct_claim_has_path',
        message: 'DIRECT claim must not carry a pathId',
      });
    }

    // 4. Conflict branch bias check (D-28)
    const claimCitSet = new Set(claim.citationIds);
    for (const conflict of pack.conflicts) {
      // Find branch citations if conflict carries branches, or group citations by conflictGroupId
      const branchLists: string[][] = [];
      const untypedConflict = conflict as unknown as { branches?: readonly { citationIds: readonly string[] }[] };
      if (untypedConflict.branches && Array.isArray(untypedConflict.branches)) {
        for (const b of untypedConflict.branches) {
          branchLists.push([...b.citationIds]);
        }
      }

      // If branches not explicitly structured on conflict, group pack citations by conflictGroupId
      if (branchLists.length === 0) {
        const matchingCits = Object.values(pack.citations).filter(
          (c) => c.conflictGroupId === conflict.conflictGroupId
        );
        if (matchingCits.length >= 2) {
          // Two separate citations representing separate conflict branches
          for (const c of matchingCits) {
            branchLists.push([c.citationId]);
          }
        }
      }

      if (branchLists.length >= 2) {
        const branchesTouched: number[] = [];
        branchLists.forEach((bCits, bIdx) => {
          if (bCits.some((cid) => claimCitSet.has(cid))) {
            branchesTouched.push(bIdx);
          }
        });

        if (branchesTouched.length === 1) {
          issues.push({
            path: `claims[${i}].citationIds`,
            code: 'conflict_branch_bias',
            message: `Claim uses citations from only branch ${branchesTouched[0]} of conflict group '${conflict.conflictGroupId}'`,
          });
        }
      }
    }

    // 5. D-26 override-language guard (server authority only; local authority has no server conflict metadata)
    if (pack.authority !== 'local' && claimAssertsOverride(claim.text)) {
      let allowed = false;

      // Condition 1: SUPERSEDES metadata
      for (const conflict of pack.conflicts) {
        if (conflict.scopeProof?.overrideRelation === 'SUPERSEDES') {
          const conflictCids = new Set<string>();
          const untypedConflict = conflict as unknown as { branches?: readonly { citationIds: readonly string[] }[] };
          if (untypedConflict.branches && Array.isArray(untypedConflict.branches)) {
            for (const b of untypedConflict.branches) {
              for (const cid of b.citationIds) conflictCids.add(cid);
            }
          }
          for (const c of Object.values(pack.citations)) {
            if (c.conflictGroupId === conflict.conflictGroupId) {
              conflictCids.add(c.citationId);
            }
          }

          if (claim.citationIds.some((cid: string) => conflictCids.has(cid))) {
            allowed = true;
            break;
          }
        }
      }

      // Condition 2: allowlisted evidenceKind
      if (!allowed && claim.citationIds.length >= 1) {
        const allKindsAllowed = claim.citationIds.every((cid: string) => {
          const rec = pack.citations[cid];
          return rec?.evidenceKind && ALLOWED_EVIDENCE_KINDS.has(rec.evidenceKind);
        });
        if (allKindsAllowed) {
          allowed = true;
        }
      }

      if (!allowed) {
        issues.push({
          path: `claims[${i}].text`,
          code: 'override_language_without_proof',
          message:
            'Claim asserts override/supersede without SUPERSEDES metadata or cited policy_change/release_note/migration_record evidence',
        });
      }
    }
  }

  // 6. Hypotheses validation for Schema V2 (D-10)
  if (answer.schemaVersion === 2 && answer.hypotheses) {
    for (let hIdx = 0; hIdx < answer.hypotheses.length; hIdx++) {
      const hyp = answer.hypotheses[hIdx]!;
      // Hypotheses must never have citations
      if ((hyp as unknown as { citationIds?: unknown }).citationIds !== undefined) {
        issues.push({
          path: `hypotheses[${hIdx}]`,
          code: 'hypothesis_has_citations',
          message: 'Hypotheses must not contain citation IDs',
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
