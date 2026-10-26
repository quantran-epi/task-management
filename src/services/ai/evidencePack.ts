import type {
  FederatedRetrievalResponse,
  ChunkItem,
  ConflictGroup,
} from '../knowledge/retrievalProtocol';
import type { GroundedAnswer } from './groundedAnswerSchemas';
import type { LocalGroundedResult } from '../search/localGroundedRetrieval';
import type { McpEvidenceRecord } from './mcpEvidence';

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
  readonly evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'mcp_tool' | 'other' | undefined;
  readonly conflictGroupId?: string | undefined;
  readonly mcpMetadata?: {
    readonly serverId: string;
    readonly serverName: string;
    readonly toolName: string;
  } | undefined;
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
  readonly modalities?: readonly ('fulltext' | 'vector' | 'graph')[] | undefined;
  /** Atomic MCP record id (M* citations only); lets digests map back to records. */
  readonly recordId?: string | undefined;
  readonly serverName?: string | undefined;
  readonly toolName?: string | undefined;
}

/** Seed entity carried alongside citations; never converted into a citation (D-02). */
export interface PackedEntity {
  readonly urn: string;
  readonly canonicalName: string;
  readonly kind: string;
  readonly snapshotId: string;
  readonly setId: string;
  readonly evidenceClass?: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | undefined;
}

export interface GraphCounts {
  readonly entity: number;
  readonly edge: number;
  readonly path: number;
}

export interface EvidencePack {
  readonly authority: 'server' | 'local';
  readonly citations: Readonly<Record<string, SourceRecord>>;
  readonly paths: Readonly<Record<string, ValidatedPath>>;
  readonly conflicts: readonly ConflictGroup[];
  readonly entities?: readonly PackedEntity[] | undefined;
  readonly graphCounts?: GraphCounts | undefined;
  readonly promptEvidence: readonly PromptEvidenceItem[];
  readonly contextTruncated: boolean;
  readonly coverageWarnings: readonly string[];
}

export interface PackEvidenceInput {
  readonly authority: 'server' | 'local';
  readonly serverResponse?: FederatedRetrievalResponse;
  readonly localResult?: LocalGroundedResult;
  readonly mcpRecords?: readonly McpEvidenceRecord[];
}

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
  readonly evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'mcp_tool' | 'other' | undefined;
  readonly originalChunkId?: string | undefined;
  readonly conflictGroupId?: string | undefined;
  readonly isIdentifierMatch?: boolean | undefined;
  readonly score?: number | undefined;
  readonly mcpMetadata?: {
    readonly serverId: string;
    readonly serverName: string;
    readonly toolName: string;
  } | undefined;
  readonly modalities?: readonly ('fulltext' | 'vector' | 'graph')[] | undefined;
}

/**
 * Packs every retrieved source into prompt evidence. Nothing is dropped for size or
 * relevance: accuracy and completeness outrank token economy, and synthesis reduces
 * the payload only through completeness-checked batches (see groundedSynthesis).
 */
export function packEvidence(input: PackEvidenceInput): EvidencePack {
  const authority = input.authority;
  const isServer = authority === 'server';

  const rawCandidates: RawCandidateCitation[] = [];
  const coverageWarnings: string[] = [];
  const entities: PackedEntity[] = [];
  let graphCounts: GraphCounts = { entity: 0, edge: 0, path: 0 };

  if (isServer && input.serverResponse) {
    const resp = input.serverResponse;
    if (resp.diagnostics?.coverageWarnings) {
      for (const cw of resp.diagnostics.coverageWarnings) {
        coverageWarnings.push(cw.message);
      }
    }

    const graphStatus = resp.modalityStatus?.graph;
    graphCounts = {
      entity: graphStatus?.entityCount ?? 0,
      edge: graphStatus?.edgeCount ?? 0,
      path: graphStatus?.pathCount ?? 0,
    };

    const seenEntities = new Set<string>();
    for (const fedItem of resp.items) {
      const item = ((fedItem as any).item ?? fedItem) as {
        readonly type?: string;
        readonly urn?: string;
        readonly canonicalName?: string;
        readonly kind?: string;
        readonly snapshotId?: string;
        readonly evidenceClass?: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED';
      };
      if (item?.type !== 'entity' || !item.urn || !item.canonicalName || !item.kind) continue;
      if (entities.length >= 50) break;
      const setId = (fedItem as any).setId ?? 'default_set';
      const dedupKey = `${setId}:${item.urn}`;
      if (seenEntities.has(dedupKey)) continue;
      seenEntities.add(dedupKey);
      const snapshotId =
        (fedItem as any).snapshotId ?? item.snapshotId ?? (resp as any).snapshotId ?? '';
      entities.push({
        urn: item.urn,
        canonicalName: item.canonicalName,
        kind: item.kind,
        snapshotId,
        setId,
        ...(item.evidenceClass ? { evidenceClass: item.evidenceClass } : {}),
      });
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
        const excerpt = chunk.rawSnippet ?? '';

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
          modalities: chunk.modalitiesContributed,
        });
      }
    }
  } else if (!isServer && input.localResult) {
    for (const r of input.localResult.ranges) {
      const dedupKey = `${r.documentId}:${r.lineStart}:${r.lineEnd}:local`;
      const excerpt = r.rawSnippet ?? '';
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

  // Every candidate is packed, in encounter order. No relevance sorting, no budget drop:
  // the model sees all evidence from all sources and decides what matters.
  const finalPromptEvidence: PromptEvidenceItem[] = [];
  const contextTruncated = false;

  for (const { candidate, citationId } of dedupedMap.values()) {
    finalPromptEvidence.push({
      id: citationId,
      text: candidate.citedExcerpt,
      score: candidate.score ?? 0,
      documentTitle: candidate.documentTitle,
      sectionAnchor: candidate.sectionAnchor || undefined,
      ...(candidate.modalities ? { modalities: candidate.modalities } : {}),
    });
  }

  // One citation per atomic MCP record: faithful text, full provenance, no char cap.
  if (input.mcpRecords && input.mcpRecords.length > 0) {
    let mcpIndex = 1;
    for (const record of input.mcpRecords) {
      const cId = `M${mcpIndex++}`;
      const provenance = record.provenance[0]!;
      const docTitle = `[MCP] ${provenance.serverName} - ${provenance.toolName}`;
      const mcpCitation: SourceRecord = {
        citationId: cId,
        documentId: `mcp:${provenance.serverId}:${provenance.toolName}:${record.recordId}`,
        documentTitle: docTitle,
        sectionAnchor: JSON.stringify(provenance.args).slice(0, 200),
        lineStart: 1,
        lineEnd: 1,
        authority: 'server',
        evidenceClass: 'OBSERVED',
        snapshotId: 'mcp_live',
        publishedContentHash: null,
        citedExcerpt: record.text,
        setMemberships: [],
        evidenceKind: 'mcp_tool',
        mcpMetadata: {
          serverId: provenance.serverId,
          serverName: provenance.serverName,
          toolName: provenance.toolName,
        },
      };

      citations[cId] = mcpCitation;
      finalPromptEvidence.push({
        id: cId,
        text: record.text,
        documentTitle: docTitle,
        sectionAnchor: mcpCitation.sectionAnchor,
        recordId: record.recordId,
        serverName: provenance.serverName,
        toolName: provenance.toolName,
      });
    }
  }

  return {
    authority,
    citations,
    paths,
    conflicts,
    entities,
    graphCounts,
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
  }

  // 5. Hypotheses validation for Schema V2 (D-10)
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
