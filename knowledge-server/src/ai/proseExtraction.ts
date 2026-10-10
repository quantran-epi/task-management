import { z } from 'zod';
import type { Root, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { parseMarkdownToAst } from '../parser/markdownAst.js';
import type { ProjectionSnapshot } from '../indexing/incrementalProjector.js';
import {
  ProseSegment,
  SourceRange,
  FactAssertion,
  GraphEvidenceRecord,
  QuarantinedIdentifier,
  ResolvedNode,
  RELATION_TYPES,
} from '../types/graphProtocol.js';
import { ONTOLOGY_VERSION } from '../graph/ontology.js';
import { buildFactKey } from '../graph/identity.js';
import { sha256Hex } from '../indexing/chunkHashPolicy.js';

export const MAX_INPUT_CHARS = 12_000;
export const MAX_OUTPUT_TOKENS = 1_200;
export const MAX_RESPONSE_CHARS = 100_000;
export const TIMEOUT_MS = 30_000;
export const MAX_CANDIDATES = 40;

function deterministicUuid(seed: string): string {
  const hash = sha256Hex(seed);
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = '4' + hash.slice(13, 16);
  const part4 = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.slice(18, 20);
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

/**
 * Checks whether an interval [startA, endA] overlaps with [startB, endB].
 */
function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.max(startA, startB) < Math.min(endA, endB);
}

/**
 * Traverses markdown AST and collects uncovered paragraphs that do not overlap with consumedRanges.
 */
export function collectUncoveredProse(
  snapshot: ProjectionSnapshot,
  consumedRanges: Map<string, SourceRange[]>
): ProseSegment[] {
  const segments: ProseSegment[] = [];

  for (const doc of snapshot.documents) {
    const docConsumed = consumedRanges.get(doc.documentId) || [];
    const fullBody = doc.chunks.map((c) => c.rawContent).join('');
    const ast: Root = parseMarkdownToAst(fullBody);

    let currentHeadingPath: string[] = [];

    function walk(node: RootContent | Root) {
      if (node.type === 'heading') {
        const text = toString(node).trim();
        const depth = (node as any).depth;
        if (depth === 1) {
          currentHeadingPath = [text];
        } else if (depth === 2) {
          currentHeadingPath = [text];
        } else if (depth === 3) {
          const parent = currentHeadingPath[0];
          currentHeadingPath = parent ? [parent, text] : [text];
        }
      } else if (node.type === 'paragraph') {
        const startOffset = node.position?.start?.offset ?? 0;
        const endOffset = node.position?.end?.offset ?? 0;
        const startLine = node.position?.start?.line ?? 1;
        const endLine = node.position?.end?.line ?? 1;

        // Check if paragraph overlaps with any consumed range
        const isConsumed = docConsumed.some((r) =>
          intervalsOverlap(startOffset, endOffset, r.startOffset, r.endOffset)
        );

        if (!isConsumed && startOffset < endOffset) {
          const text = fullBody.slice(startOffset, endOffset).trim();
          if (text.length > 0) {
            const segmentId = deterministicUuid(`${doc.documentId}:${startOffset}:${endOffset}`);
            segments.push({
              segmentId,
              documentId: doc.documentId,
              documentTitle: doc.title,
              sectionHeadingPath: [...currentHeadingPath],
              startOffset,
              endOffset,
              startLine,
              endLine,
              text,
            });
          }
        }
      }

      if ('children' in node && Array.isArray((node as any).children)) {
        for (const child of (node as any).children) {
          walk(child);
        }
      }
    }

    walk(ast);
  }

  return segments;
}

export const ProseCandidateSchema = z
  .object({
    subjectUrn: z.string().trim().min(1).max(500),
    relation: z.enum(RELATION_TYPES),
    objectUrn: z.string().trim().min(1).max(500),
    qualifiers: z
      .object({
        operation: z.string().trim().min(1).max(120).optional(),
        condition: z.string().trim().min(1).max(240).optional(),
      })
      .strict()
      .default({}),
    evidence: z
      .object({
        segmentId: z.string().min(1).max(128),
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
        quote: z.string().min(1).max(2000),
      })
      .strict(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type ProseCandidate = z.infer<typeof ProseCandidateSchema>;

export const ProseExtractionResponseSchema = z
  .object({
    candidates: z.array(ProseCandidateSchema).max(MAX_CANDIDATES),
  })
  .strict();

export type ProseExtractionResponse = z.infer<typeof ProseExtractionResponseSchema>;

export interface ProseFallbackResult {
  facts: FactAssertion[];
  evidence: GraphEvidenceRecord[];
  quarantines: QuarantinedIdentifier[];
  error?: string;
}

export interface ExtractProseCandidatesInput {
  endpoint: string;
  apiKey?: string;
  model: string;
  segments: ProseSegment[];
  resolvedEndpoints: ResolvedNode[];
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}

/**
 * Executes a single bounded call to OpenAI-compatible endpoint with zero retries.
 * Validates endpoints, closed ontology, exact quotes, and labels valid candidates as INFERRED.
 */
export async function extractProseCandidatesOnce(
  input: ExtractProseCandidatesInput
): Promise<ProseFallbackResult> {
  const { endpoint, apiKey, model, segments, resolvedEndpoints, signal, fetchFn = fetch } = input;

  const validEndpointUrns = new Set(resolvedEndpoints.map((n) => n.urn));
  const segmentsById = new Map<string, ProseSegment>();
  for (const seg of segments) {
    segmentsById.set(seg.segmentId, seg);
  }

  // Filter segments to stay under MAX_INPUT_CHARS
  let totalChars = 0;
  const eligibleSegments: ProseSegment[] = [];
  const quarantinedSegments: ProseSegment[] = [];

  for (const seg of segments) {
    if (totalChars + seg.text.length <= MAX_INPUT_CHARS) {
      eligibleSegments.push(seg);
      totalChars += seg.text.length;
    } else {
      quarantinedSegments.push(seg);
    }
  }

  const quarantines: QuarantinedIdentifier[] = [];
  for (const qSeg of quarantinedSegments) {
    quarantines.push({
      rawIdentifier: qSeg.segmentId,
      reason: 'Prose input ceiling exceeded (12,000 characters cap)',
      documentId: qSeg.documentId,
      sectionHeadingPath: qSeg.sectionHeadingPath,
      startLine: qSeg.startLine,
      endLine: qSeg.endLine,
      extractionMethod: 'LLM_PROSE',
      possibleMatches: [],
    });
  }

  if (eligibleSegments.length === 0) {
    return { facts: [], evidence: [], quarantines };
  }

  // Build strict prompt
  const systemPrompt = `You are a strict knowledge graph extractor using a closed ontology.
You extract ONLY semantic relations between the provided known node URNs from the provided text segments.
Output JSON matching the schema: {"candidates": [{"subjectUrn": "...", "relation": "...", "objectUrn": "...", "qualifiers": {}, "evidence": {"segmentId": "...", "startOffset": 0, "endOffset": 10, "quote": "..."}, "confidence": 0.9}]}.
Rules:
1. ONLY use subjectUrn and objectUrn from the allowed endpoints list.
2. ONLY use relation from: ${RELATION_TYPES.join(', ')}.
3. The evidence quote MUST be an exact verbatim substring from the segment text.
4. startOffset and endOffset must be exact 0-based character offsets of the quote within that segment's text.
5. If no valid relations exist, return {"candidates": []}.`;

  const userPayload = {
    ontologyVersion: ONTOLOGY_VERSION,
    allowedEndpoints: resolvedEndpoints.map((n) => ({ urn: n.urn, kind: n.kind, name: n.canonicalName })),
    segments: eligibleSegments.map((s) => ({
      segmentId: s.segmentId,
      headingPath: s.sectionHeadingPath.join(' > '),
      text: s.text,
    })),
  };

  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const url = `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let rawResponseBody = '';
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: false,
      }),
      signal: combinedSignal,
    });

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }

    rawResponseBody = await res.text();
    if (rawResponseBody.length > MAX_RESPONSE_CHARS) {
      throw new Error('RESPONSE_TOO_LARGE');
    }
  } catch (err: any) {
    // Zero-retry behavior: quarantine all eligible segments and return
    const errorMsg = err?.message || 'LLM_REQUEST_FAILED';
    for (const seg of eligibleSegments) {
      quarantines.push({
        rawIdentifier: seg.segmentId,
        reason: `LLM request failed: ${errorMsg}`,
        documentId: seg.documentId,
        sectionHeadingPath: seg.sectionHeadingPath,
        startLine: seg.startLine,
        endLine: seg.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: [],
      });
    }
    return { facts: [], evidence: [], quarantines, error: errorMsg };
  }

  // Parse JSON with zero retries
  let parsedJson: unknown;
  try {
    const data = JSON.parse(rawResponseBody);
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('NO_CONTENT_IN_CHOICE');
    }
    parsedJson = JSON.parse(content);
  } catch {
    for (const seg of eligibleSegments) {
      quarantines.push({
        rawIdentifier: seg.segmentId,
        reason: 'Malformed JSON from LLM response',
        documentId: seg.documentId,
        sectionHeadingPath: seg.sectionHeadingPath,
        startLine: seg.startLine,
        endLine: seg.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: [],
      });
    }
    return { facts: [], evidence: [], quarantines, error: 'MALFORMED_JSON' };
  }

  const schemaValidation = ProseExtractionResponseSchema.safeParse(parsedJson);
  if (!schemaValidation.success) {
    for (const seg of eligibleSegments) {
      quarantines.push({
        rawIdentifier: seg.segmentId,
        reason: 'LLM response failed schema validation',
        documentId: seg.documentId,
        sectionHeadingPath: seg.sectionHeadingPath,
        startLine: seg.startLine,
        endLine: seg.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: [],
      });
    }
    return { facts: [], evidence: [], quarantines, error: 'SCHEMA_INVALID' };
  }

  const facts: FactAssertion[] = [];
  const evidenceList: GraphEvidenceRecord[] = [];

  // Validate each candidate
  for (const cand of schemaValidation.data.candidates) {
    const segment = segmentsById.get(cand.evidence.segmentId);
    if (!segment) {
      quarantines.push({
        rawIdentifier: cand.evidence.segmentId,
        reason: 'Unknown segment referenced in candidate',
        documentId: eligibleSegments[0]?.documentId || '00000000-0000-0000-0000-000000000000',
        sectionHeadingPath: [],
        startLine: 1,
        endLine: 1,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: [],
      });
      continue;
    }

    // Endpoint validation per D-13, D-16
    if (!validEndpointUrns.has(cand.subjectUrn)) {
      quarantines.push({
        rawIdentifier: cand.subjectUrn,
        reason: 'Candidate subject URN not in resolved endpoints',
        documentId: segment.documentId,
        sectionHeadingPath: segment.sectionHeadingPath,
        startLine: segment.startLine,
        endLine: segment.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: Array.from(validEndpointUrns).slice(0, 5),
      });
      continue;
    }

    if (!validEndpointUrns.has(cand.objectUrn)) {
      quarantines.push({
        rawIdentifier: cand.objectUrn,
        reason: 'Candidate object URN not in resolved endpoints',
        documentId: segment.documentId,
        sectionHeadingPath: segment.sectionHeadingPath,
        startLine: segment.startLine,
        endLine: segment.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: Array.from(validEndpointUrns).slice(0, 5),
      });
      continue;
    }

    // Exact quote verification against segment text
    const { startOffset, endOffset, quote } = cand.evidence;
    if (startOffset >= endOffset || endOffset > segment.text.length) {
      quarantines.push({
        rawIdentifier: quote,
        reason: 'Candidate evidence range out of bounds',
        documentId: segment.documentId,
        sectionHeadingPath: segment.sectionHeadingPath,
        startLine: segment.startLine,
        endLine: segment.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: [],
      });
      continue;
    }

    const actualSlice = segment.text.slice(startOffset, endOffset);
    if (actualSlice !== quote) {
      quarantines.push({
        rawIdentifier: quote,
        reason: `Evidence quote mismatch: expected "${actualSlice}", received "${quote}"`,
        documentId: segment.documentId,
        sectionHeadingPath: segment.sectionHeadingPath,
        startLine: segment.startLine,
        endLine: segment.endLine,
        extractionMethod: 'LLM_PROSE',
        possibleMatches: [actualSlice],
      });
      continue;
    }

    // Candidate validated! Build fact and evidence
    const qualifiers: Record<string, string> = {};
    if (cand.qualifiers.operation) qualifiers['operation'] = cand.qualifiers.operation;
    if (cand.qualifiers.condition) qualifiers['condition'] = cand.qualifiers.condition;

    const factKey = buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: cand.subjectUrn,
      relation: cand.relation,
      objectUrn: cand.objectUrn,
      qualifiers,
    });

    facts.push({
      factKey,
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: cand.subjectUrn,
      relation: cand.relation,
      objectUrn: cand.objectUrn,
      qualifiers,
      classification: 'INFERRED',
    });

    const absoluteStart = segment.startOffset + startOffset;
    const absoluteEnd = segment.startOffset + endOffset;
    const evidenceSeed = `${segment.documentId}:${factKey}:${absoluteStart}:${absoluteEnd}`;

    evidenceList.push({
      evidenceId: deterministicUuid(evidenceSeed),
      factKey,
      documentId: segment.documentId,
      documentTitle: segment.documentTitle,
      sectionHeadingPath: segment.sectionHeadingPath,
      startLine: segment.startLine,
      endLine: segment.endLine,
      startOffset: absoluteStart,
      endOffset: absoluteEnd,
      rawSnippet: quote,
      extractionMethod: 'LLM_PROSE',
      classification: 'INFERRED',
      confidence: cand.confidence ?? 0.8,
      observedAt: '2026-10-10T00:00:00.000Z',
    });
  }

  return {
    facts,
    evidence: evidenceList,
    quarantines,
  };
}
