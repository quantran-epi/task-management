import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { ProjectionSnapshot, ProjectedDocument } from '../indexing/incrementalProjector.js';
import {
  ResolvedNode,
  FactAssertion,
  GraphEvidenceRecord,
  QuarantinedIdentifier,
  RELATION_TYPES,
  RelationType,
  NODE_KINDS,
  NodeKind,
} from '../types/graphProtocol.js';
import { ONTOLOGY_VERSION, RETRIEVAL_ONTOLOGY_REGISTRY } from '../graph/ontology.js';
import { buildUrn, buildFactKey } from '../graph/identity.js';
import { sha256Hex } from '../indexing/chunkHashPolicy.js';

export const PROMPT_VERSION = '2026.10.1';

export function computeChunkCacheKey(
  chunkContentHash: string,
  model: string,
  promptVersion = PROMPT_VERSION
): string {
  return sha256Hex(`${chunkContentHash}:${model}:${promptVersion}`);
}

export const CHUNK_TARGET_CHARS = 2_500;
export const CHUNK_MAX_CHARS = 3_500;
export const LLM_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 3;

function deterministicUuid(seed: string): string {
  const hash = sha256Hex(seed);
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = '4' + hash.slice(13, 16);
  const part4 = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.slice(18, 20);
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

export interface TextChunk {
  chunkId: string;
  chunkContentHash: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  totalChunksInDoc: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkExtractionItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  totalChunksInDoc: number;
  status: 'PENDING' | 'EXTRACTING' | 'SUCCESS' | 'FAILED';
  error?: string | undefined;
  updatedAt: string;
  nodesCount: number;
  factsCount: number;
}

export interface ChunkCachedResult {
  chunkId: string;
  nodes: ResolvedNode[];
  facts: FactAssertion[];
  evidence: GraphEvidenceRecord[];
  quarantines: QuarantinedIdentifier[];
}

export class ChunkExtractionStore {
  readonly cacheDir: string;
  private chunksBySet = new Map<string, Map<string, ChunkExtractionItem>>();
  private cachedResults = new Map<string, Map<string, ChunkCachedResult>>();

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || process.env.EXTRACTION_CACHE_DIR || './data/cache/extraction';
  }

  private validateSetId(setId: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(setId)) {
      throw new Error(`INVALID_SET_ID: Set ID must be a valid UUID. Received "${setId}"`);
    }
  }

  async ensureSetCacheDir(setId: string): Promise<string> {
    this.validateSetId(setId);
    const targetDir = path.join(this.cacheDir, setId);
    await fs.mkdir(targetDir, { recursive: true });
    return targetDir;
  }

  async loadDiskCache(
    setId: string,
    chunkContentHash: string,
    model: string
  ): Promise<ChunkCachedResult | undefined> {
    this.validateSetId(setId);
    const cacheKey = computeChunkCacheKey(chunkContentHash, model, PROMPT_VERSION);
    if (!/^[0-9a-f]{64}$/.test(cacheKey)) {
      throw new Error(`INVALID_CACHE_KEY: Key must be 64-char hex string.`);
    }

    const filePath = path.join(this.cacheDir, setId, `${cacheKey}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (
        parsed?.version === 1 &&
        parsed?.chunkContentHash === chunkContentHash &&
        parsed?.model === model &&
        parsed?.promptVersion === PROMPT_VERSION &&
        parsed?.result
      ) {
        return parsed.result as ChunkCachedResult;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async saveDiskCache(
    setId: string,
    chunkContentHash: string,
    model: string,
    result: ChunkCachedResult
  ): Promise<void> {
    const dir = await this.ensureSetCacheDir(setId);
    const cacheKey = computeChunkCacheKey(chunkContentHash, model, PROMPT_VERSION);
    if (!/^[0-9a-f]{64}$/.test(cacheKey)) {
      throw new Error(`INVALID_CACHE_KEY: Key must be 64-char hex string.`);
    }

    const filePath = path.join(dir, `${cacheKey}.json`);
    const tmpPath = path.join(dir, `${cacheKey}.${deterministicUuid(String(Date.now()))}.tmp`);

    const payload = {
      version: 1,
      chunkContentHash,
      model,
      promptVersion: PROMPT_VERSION,
      cachedAt: new Date().toISOString(),
      result,
    };

    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  initChunks(setId: string, chunks: TextChunk[]): void {
    let itemMap = this.chunksBySet.get(setId);
    if (!itemMap) {
      itemMap = new Map();
      this.chunksBySet.set(setId, itemMap);
    }

    const now = new Date().toISOString();
    for (const c of chunks) {
      if (!itemMap.has(c.chunkId)) {
        itemMap.set(c.chunkId, {
          chunkId: c.chunkId,
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          chunkIndex: c.chunkIndex,
          totalChunksInDoc: c.totalChunksInDoc,
          status: 'PENDING',
          updatedAt: now,
          nodesCount: 0,
          factsCount: 0,
        });
      }
    }
  }

  setChunkStatus(
    setId: string,
    chunkId: string,
    status: ChunkExtractionItem['status'],
    error?: string,
    nodesCount = 0,
    factsCount = 0
  ): void {
    const itemMap = this.chunksBySet.get(setId);
    const item = itemMap?.get(chunkId);
    if (item) {
      item.status = status;
      item.error = error;
      item.updatedAt = new Date().toISOString();
      if (nodesCount) item.nodesCount = nodesCount;
      if (factsCount) item.factsCount = factsCount;
      if (status === 'FAILED') {
        this.cachedResults.get(setId)?.delete(chunkId);
        item.nodesCount = 0;
        item.factsCount = 0;
      }
    }
  }

  saveChunkResult(setId: string, chunkId: string, result: ChunkCachedResult): void {
    let resMap = this.cachedResults.get(setId);
    if (!resMap) {
      resMap = new Map();
      this.cachedResults.set(setId, resMap);
    }
    resMap.set(chunkId, result);
    this.setChunkStatus(setId, chunkId, 'SUCCESS', undefined, result.nodes.length, result.facts.length);
  }

  getChunkResult(setId: string, chunkId: string): ChunkCachedResult | undefined {
    return this.cachedResults.get(setId)?.get(chunkId);
  }

  getAllCachedResults(setId: string): ChunkCachedResult[] {
    const resMap = this.cachedResults.get(setId);
    return resMap ? Array.from(resMap.values()) : [];
  }

  getChunkItems(setId: string): ChunkExtractionItem[] {
    const itemMap = this.chunksBySet.get(setId);
    return itemMap ? Array.from(itemMap.values()) : [];
  }

  resetFailedChunks(setId: string, targetChunkIds?: string[]): void {
    const itemMap = this.chunksBySet.get(setId);
    if (!itemMap) return;
    for (const item of itemMap.values()) {
      if (item.status === 'FAILED') {
        if (!targetChunkIds || targetChunkIds.length === 0 || targetChunkIds.includes(item.chunkId)) {
          item.status = 'PENDING';
          item.error = undefined;
          item.updatedAt = new Date().toISOString();
        }
      }
    }
  }

  resetChunks(setId: string, targetChunkIds?: string[]): void {
    const itemMap = this.chunksBySet.get(setId);
    if (!itemMap) return;
    for (const item of itemMap.values()) {
      if (!targetChunkIds || targetChunkIds.length === 0) {
        if (item.status === 'FAILED') {
          item.status = 'PENDING';
          item.error = undefined;
          item.updatedAt = new Date().toISOString();
        }
      } else if (targetChunkIds.includes(item.chunkId)) {
        item.status = 'PENDING';
        item.error = undefined;
        item.updatedAt = new Date().toISOString();
        this.cachedResults.get(setId)?.delete(item.chunkId);
      }
    }
  }

  purgeSet(setId: string): void {
    this.chunksBySet.delete(setId);
    this.cachedResults.delete(setId);
  }
}

export const globalChunkStore = new ChunkExtractionStore();

/**
 * Splits document content into clean, semantic chunks (~2500 chars) preserving section boundaries.
 */
export function splitDocumentIntoChunks(doc: ProjectedDocument): TextChunk[] {
  const fullBody = doc.chunks.map((c) => c.rawContent).join('');
  if (!fullBody.trim()) return [];

  const chunks: TextChunk[] = [];
  const paragraphs = fullBody.split(/\n{2,}/);

  let currentText = '';
  let currentStart = 0;
  let runningOffset = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      runningOffset += para.length + 2;
      continue;
    }

    if (currentText.length + trimmed.length > CHUNK_MAX_CHARS && currentText.length >= CHUNK_TARGET_CHARS) {
      const idx = chunks.length;
      const cleanChunkText = currentText.trim();
      chunks.push({
        chunkId: `${doc.documentId}:${idx}`,
        chunkContentHash: sha256Hex(cleanChunkText),
        documentId: doc.documentId,
        documentTitle: doc.title,
        chunkIndex: idx,
        totalChunksInDoc: 0,
        text: cleanChunkText,
        startOffset: currentStart,
        endOffset: currentStart + currentText.length,
      });
      currentStart = runningOffset;
      currentText = trimmed + '\n\n';
    } else {
      if (!currentText) currentStart = runningOffset;
      currentText += trimmed + '\n\n';
    }
    runningOffset += para.length + 2;
  }

  if (currentText.trim()) {
    const idx = chunks.length;
    const cleanChunkText = currentText.trim();
    chunks.push({
      chunkId: `${doc.documentId}:${idx}`,
      chunkContentHash: sha256Hex(cleanChunkText),
      documentId: doc.documentId,
      documentTitle: doc.title,
      chunkIndex: idx,
      totalChunksInDoc: 0,
      text: cleanChunkText,
      startOffset: currentStart,
      endOffset: currentStart + currentText.length,
    });
  }

  const total = chunks.length;
  for (const c of chunks) {
    c.totalChunksInDoc = total;
  }

  return chunks;
}

export const ExtractedEntitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(NODE_KINDS),
  sourceSystem: z
    .string()
    .nullish()
    .transform((v) => (v ? v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'system')),
  nativeType: z
    .string()
    .nullish()
    .transform((v) => (v ? v.trim().replace(/[^A-Za-z0-9_-]/g, '_') : 'Generic')),
  description: z.string().nullish().transform((v) => v ?? undefined),
  aliases: z.array(z.string()).nullish().transform((v) => v ?? []),
});

export const ExtractedRelationSchema = z.object({
  sourceEntityName: z.string().trim().min(1),
  sourceKind: z.enum(NODE_KINDS),
  relation: z.enum(RELATION_TYPES),
  targetEntityName: z.string().trim().min(1),
  targetKind: z.enum(NODE_KINDS),
  operation: z.string().nullish().transform((v) => v ?? undefined),
  condition: z.string().nullish().transform((v) => v ?? undefined),
  evidenceQuote: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).default(0.9),
});

export const LLMExtractionPayloadSchema = z.object({
  entities: z.array(ExtractedEntitySchema).default([]),
  relations: z.array(ExtractedRelationSchema).default([]),
});

export type LLMExtractionPayload = z.infer<typeof LLMExtractionPayloadSchema>;

export interface LLMExtractionProgress {
  processedChunks: number;
  totalChunks: number;
  currentDocumentTitle?: string | undefined;
  stageMessage?: string | undefined;
}

export type ProgressCallback = (progress: LLMExtractionProgress) => void;

export interface LLMExtractorOptions {
  endpoint: string;
  model: string;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  fetchFn?: typeof fetch | undefined;
  onProgress?: ProgressCallback | undefined;
  targetChunkIds?: string[] | undefined;
  store?: ChunkExtractionStore | undefined;
}

export interface PureLLMExtractionResult {
  nodes: ResolvedNode[];
  facts: FactAssertion[];
  evidence: GraphEvidenceRecord[];
  quarantines: QuarantinedIdentifier[];
}

const SYSTEM_PROMPT = `You are an expert technical knowledge graph extractor.
Extract meaningful technical entities and domain relations from the provided document chunk into strict JSON.

CLOSED ONTOLOGY RULES:
Node Kinds allowed:
- ScheduledProcess (Batch job, daemon, cron process, e.g. PRC_SETTLEMENT, PRC_CLEARING)
- ProcessStep (Specific step inside a process. DO NOT CREATE DUMMY STEP_1, STEP_2 names. Only create if named or numbered in context, e.g. "Prepare Transaction File")
- SoftwareComponent (Procedure, class, microservice, module, e.g. ACC_ENTRY_PKG, BillingService, CardAuthorizer)
- DatabaseObject (Table, view, sequence, e.g. TBL_CARD_TRANSACTION, ACC_BALANCE)
- CycleType (Settlement cycle, processing schedule, e.g. CYTP1001, DailyCycle)
- Status (Processing or transaction status, e.g. READY, SUCCESS, FAILED)

Relations allowed:
- CONTAINS_STEP (ScheduledProcess -> ProcessStep)
- PRECEDES (ProcessStep -> ProcessStep)
- CALLS (SoftwareComponent -> SoftwareComponent)
- INVOKES (ProcessStep -> SoftwareComponent)
- READS_FROM (SoftwareComponent -> DatabaseObject)
- WRITES_TO (SoftwareComponent/ProcessStep -> DatabaseObject)
- EMITS (ProcessStep/SoftwareComponent -> CycleType)
- CONSUMES (ProcessStep/SoftwareComponent -> CycleType)
- USES_TYPE (ProcessStep/SoftwareComponent -> CycleType)
- HAS_STATUS (ProcessStep/SoftwareComponent -> Status)

CRITICAL SAFETY RULES:
1. NEVER create generic or dummy entities like "STEP_1", "STEP_2", "BƯỚC_1", "Step". Only extract real domain names.
2. A DatabaseObject NEVER writes to or inserts into another DatabaseObject directly. Only a SoftwareComponent or ProcessStep writes to a DatabaseObject!
3. If a table is inserted/updated, identify the process or procedure doing the writing, NOT the table itself!
4. evidenceQuote MUST be an exact phrase from the provided text verifying the relation.
5. sourceSystem MUST be lowercased alphanumeric without spaces, e.g. "oracle", "plsql", "smartvista", "system".
6. nativeType MUST be alphanumeric/underscore without spaces, e.g. "ORACLE_TABLE", "PLSQL_PROCEDURE", "Service".
7. If nothing matches the ontology, return empty arrays: {"entities": [], "relations": []}.
8. ENTITY NAMING CONSTRAINTS: Entity names MUST be concise, noun-centric identifiers or step labels (e.g. 'Xử lý merchant bị từ chối', 'Verify Card Expiry', 'PRC_SETTLEMENT'). NEVER extract full conversational sentences, instructions, or paragraphs as entity names. For ProcessStep entities, keep names under 80 characters.

Output MUST strictly be a single valid JSON object matching:
{
  "entities": [
    { "name": "...", "kind": "...", "sourceSystem": "oracle|plsql|system", "nativeType": "ORACLE_TABLE|PLSQL_PROCEDURE|Service", "description": "..." }
  ],
  "relations": [
    { "sourceEntityName": "...", "sourceKind": "...", "relation": "...", "targetEntityName": "...", "targetKind": "...", "operation": "INSERT|UPDATE|READ", "evidenceQuote": "..." }
  ]
}`;

async function callLLMWithRetry(
  promptUserContent: string,
  options: LLMExtractorOptions,
  signal?: AbortSignal
): Promise<LLMExtractionPayload> {
  const {
    endpoint,
    model,
    apiKey,
    timeoutMs = LLM_TIMEOUT_MS,
    maxRetries = MAX_RETRIES,
    fetchFn = fetch,
  } = options;

  const url = `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: promptUserContent },
          ],
          temperature: 0.1,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const statusText = await response.text().catch(() => '');
        throw new Error(`LLM_HTTP_${response.status}: ${statusText.slice(0, 300)}`);
      }

      const rawText = await response.text();
      let content = '';

      if (rawText.trim().startsWith('data:')) {
        let accumulated = '';
        for (const line of rawText.split('\n')) {
          const frame = line.trim();
          if (!frame.startsWith('data:')) continue;
          const payload = frame.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
            if (typeof delta === 'string') accumulated += delta;
          } catch {
            // ignore non-json SSE frames
          }
        }
        content = accumulated;
      } else {
        const body = JSON.parse(rawText) as any;
        content = body?.choices?.[0]?.message?.content ?? '';
      }

      if (!content || typeof content !== 'string') {
        throw new Error('LLM_EMPTY_RESPONSE: No content returned from LLM choice.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('LLM_MALFORMED_JSON: Failed to parse JSON response from LLM.');
        }
      }

      return LLMExtractionPayloadSchema.parse(parsed);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isAbort = combinedSignal.aborted && !signal?.aborted;
      const isRetryable =
        isAbort ||
        err instanceof z.ZodError ||
        err?.message?.includes('LLM_HTTP_429') ||
        err?.message?.includes('LLM_HTTP_500') ||
        err?.message?.includes('LLM_HTTP_502') ||
        err?.message?.includes('LLM_HTTP_503') ||
        err?.message?.includes('LLM_HTTP_504') ||
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('ECONNRESET');

      if (!isRetryable || attempt >= maxRetries) {
        throw new Error(
          `LLM extraction failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`
        );
      }

      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError ?? new Error('LLM extraction failed after retries.');
}

/**
 * Pure LLM Extractor with per-chunk caching & selective retry capability.
 */
export async function extractWithLLMPure(
  snapshot: ProjectionSnapshot,
  options: LLMExtractorOptions,
  signal?: AbortSignal
): Promise<PureLLMExtractionResult> {
  const store = options.store || globalChunkStore;
  const setId = snapshot.setId;
  const nodesMap = new Map<string, ResolvedNode>();
  const factsMap = new Map<string, FactAssertion>();
  const evidenceList: GraphEvidenceRecord[] = [];
  const quarantinesList: QuarantinedIdentifier[] = [];

  // 1. Add SourceDocument nodes directly (clean anchors)
  for (const doc of snapshot.documents) {
    const docUrn = buildUrn('markdown', 'SourceDocument', doc.documentId);
    nodesMap.set(docUrn, {
      urn: docUrn,
      kind: 'SourceDocument',
      canonicalName: doc.title,
      sourceSystem: 'markdown',
      nativeType: 'SourceDocument',
      normalizedKey: doc.documentId,
      properties: {
        documentId: doc.documentId,
        title: doc.title,
      },
      aliases: [doc.title],
    });
  }

  // 2. Collect and initialize all chunks
  const allChunks: TextChunk[] = [];
  for (const doc of snapshot.documents) {
    const docChunks = splitDocumentIntoChunks(doc);
    allChunks.push(...docChunks);
  }

  store.initChunks(setId, allChunks);

  const totalChunks = allChunks.length;
  if (totalChunks === 0) {
    return {
      nodes: Array.from(nodesMap.values()),
      facts: [],
      evidence: [],
      quarantines: [],
    };
  }

  const targetChunkIds = options.targetChunkIds;

  options.onProgress?.({
    processedChunks: 0,
    totalChunks,
    stageMessage: `Khởi tạo trích xuất ${totalChunks} phần...`,
  });

  let processedCount = 0;

  // 3. Process each chunk (skipping already cached ones if not targeted for retry)
  for (const chunk of allChunks) {
    if (signal?.aborted) {
      throw new Error('EXTRACTION_ABORTED_BY_USER');
    }

    const isExplicitlyTargeted = Boolean(targetChunkIds && targetChunkIds.includes(chunk.chunkId));
    let cached = store.getChunkResult(setId, chunk.chunkId);

    // If not in memory and not explicitly targeted for retry, check durable disk cache
    if (!cached && !isExplicitlyTargeted && chunk.chunkContentHash) {
      const diskCached = await store.loadDiskCache(setId, chunk.chunkContentHash, options.model);
      if (diskCached) {
        cached = diskCached;
        store.saveChunkResult(setId, chunk.chunkId, diskCached);
      }
    }

    // If chunk is already cached (in-memory or loaded from disk) and not explicitly targeted, reuse cache
    if (cached && !isExplicitlyTargeted) {
      for (const n of cached.nodes) nodesMap.set(n.urn, n);
      for (const f of cached.facts) factsMap.set(f.factKey, f);
      evidenceList.push(...cached.evidence);
      quarantinesList.push(...cached.quarantines);
      processedCount++;
      continue;
    }

    // If targetChunkIds was provided, only process chunks in targetChunkIds
    if (targetChunkIds && targetChunkIds.length > 0 && !targetChunkIds.includes(chunk.chunkId)) {
      processedCount++;
      continue;
    }

    store.setChunkStatus(setId, chunk.chunkId, 'EXTRACTING');
    options.onProgress?.({
      processedChunks: processedCount,
      totalChunks,
      currentDocumentTitle: chunk.documentTitle,
      stageMessage: `Đang trích xuất "${chunk.documentTitle}" (${processedCount + 1}/${totalChunks})...`,
    });

    const chunkNodes: ResolvedNode[] = [];
    const chunkFacts: FactAssertion[] = [];
    const chunkEvidence: GraphEvidenceRecord[] = [];
    const chunkQuarantines: QuarantinedIdentifier[] = [];

    try {
      const userPrompt = `Document: "${chunk.documentTitle}" (chunk ${chunk.chunkIndex + 1}/${chunk.totalChunksInDoc})\n\nContent:\n${chunk.text}`;
      const extraction = await callLLMWithRetry(userPrompt, options, signal);

      const entityNameToUrn = new Map<string, { urn: string; kind: NodeKind }>();

      for (const ent of extraction.entities) {
        const normName = ent.name.trim();
        if (/^STEP[_\s-]*\d+$/i.test(normName) || /^BUOC[_\s-]*\d+$/i.test(normName)) {
          chunkQuarantines.push({
            rawIdentifier: normName,
            reason: 'Dummy step entity rejected',
            documentId: chunk.documentId,
            sectionHeadingPath: [chunk.documentTitle],
            startLine: 1,
            endLine: 1,
            extractionMethod: 'LLM_PROSE',
            possibleMatches: [],
          });
          continue;
        }

        const sourceSystem = ent.sourceSystem || 'system';
        const nativeType = ent.nativeType || ent.kind;
        const urn = buildUrn(sourceSystem, ent.kind, normName);

        const nodeObj: ResolvedNode = {
          urn,
          kind: ent.kind,
          canonicalName: normName,
          sourceSystem,
          nativeType,
          normalizedKey: normName,
          properties: ent.description ? { description: ent.description } : {},
          aliases: Array.from(new Set([normName, ...ent.aliases])),
        };

        chunkNodes.push(nodeObj);
        nodesMap.set(urn, nodeObj);
        entityNameToUrn.set(normName.toLowerCase(), { urn, kind: ent.kind });
      }

      for (const rel of extraction.relations) {
        const srcKey = rel.sourceEntityName.trim().toLowerCase();
        const tgtKey = rel.targetEntityName.trim().toLowerCase();

        const ontologyEntry = RETRIEVAL_ONTOLOGY_REGISTRY[rel.relation];
        if (!ontologyEntry) continue;

        if (
          !ontologyEntry.allowedSourceKinds.includes(rel.sourceKind) ||
          !ontologyEntry.allowedTargetKinds.includes(rel.targetKind)
        ) {
          chunkQuarantines.push({
            rawIdentifier: `${rel.sourceEntityName}(${rel.sourceKind})-[${rel.relation}]->${rel.targetEntityName}(${rel.targetKind})`,
            reason: `Relation ${rel.relation} does not allow sourceKind ${rel.sourceKind} or targetKind ${rel.targetKind}`,
            documentId: chunk.documentId,
            sectionHeadingPath: [chunk.documentTitle],
            startLine: 1,
            endLine: 1,
            extractionMethod: 'LLM_PROSE',
            possibleMatches: [],
          });
          continue;
        }

        const sourceInfo = entityNameToUrn.get(srcKey) || {
          urn: buildUrn('system', rel.sourceKind, rel.sourceEntityName.trim()),
          kind: rel.sourceKind,
        };
        const targetInfo = entityNameToUrn.get(tgtKey) || {
          urn: buildUrn('system', rel.targetKind, rel.targetEntityName.trim()),
          kind: rel.targetKind,
        };

        if (!nodesMap.has(sourceInfo.urn)) {
          const sNode: ResolvedNode = {
            urn: sourceInfo.urn,
            kind: sourceInfo.kind,
            canonicalName: rel.sourceEntityName.trim(),
            sourceSystem: 'system',
            nativeType: sourceInfo.kind,
            normalizedKey: rel.sourceEntityName.trim(),
            properties: {},
            aliases: [rel.sourceEntityName.trim()],
          };
          chunkNodes.push(sNode);
          nodesMap.set(sourceInfo.urn, sNode);
        }

        if (!nodesMap.has(targetInfo.urn)) {
          const tNode: ResolvedNode = {
            urn: targetInfo.urn,
            kind: targetInfo.kind,
            canonicalName: rel.targetEntityName.trim(),
            sourceSystem: 'system',
            nativeType: targetInfo.kind,
            normalizedKey: rel.targetEntityName.trim(),
            properties: {},
            aliases: [rel.targetEntityName.trim()],
          };
          chunkNodes.push(tNode);
          nodesMap.set(targetInfo.urn, tNode);
        }

        const qualifiers: Record<string, string> = {};
        if (rel.operation) qualifiers.operation = rel.operation;
        if (rel.condition) qualifiers.condition = rel.condition;

        const factKey = buildFactKey({
          ontologyVersion: ONTOLOGY_VERSION,
          subjectUrn: sourceInfo.urn,
          relation: rel.relation,
          objectUrn: targetInfo.urn,
          qualifiers,
        });

        const factObj: FactAssertion = {
          factKey,
          ontologyVersion: ONTOLOGY_VERSION,
          subjectUrn: sourceInfo.urn,
          relation: rel.relation as RelationType,
          objectUrn: targetInfo.urn,
          qualifiers,
          classification: 'INFERRED',
        };

        if (!factsMap.has(factKey)) {
          factsMap.set(factKey, factObj);
        }
        chunkFacts.push(factObj);

        const quote = rel.evidenceQuote.trim();
        const evidenceSeed = `${chunk.documentId}:${factKey}:${chunk.startOffset}:${quote.slice(0, 40)}`;
        const evidenceId = deterministicUuid(evidenceSeed);

        const evObj: GraphEvidenceRecord = {
          evidenceId,
          factKey,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          sectionHeadingPath: [chunk.documentTitle],
          chunkIndex: chunk.chunkIndex,
          startLine: 1,
          endLine: 1,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          rawSnippet: quote,
          extractionMethod: 'LLM_PROSE',
          classification: 'INFERRED',
          confidence: rel.confidence,
          observedAt: new Date().toISOString(),
        };

        chunkEvidence.push(evObj);
        evidenceList.push(evObj);
      }

      quarantinesList.push(...chunkQuarantines);

      const chunkCachedResult: ChunkCachedResult = {
        chunkId: chunk.chunkId,
        nodes: chunkNodes,
        facts: chunkFacts,
        evidence: chunkEvidence,
        quarantines: chunkQuarantines,
      };

      // Save chunk to in-memory store
      store.saveChunkResult(setId, chunk.chunkId, chunkCachedResult);

      // Save chunk to durable disk cache
      if (chunk.chunkContentHash) {
        try {
          await store.saveDiskCache(
            setId,
            chunk.chunkContentHash,
            options.model,
            chunkCachedResult
          );
        } catch (saveErr) {
          console.warn(`[CHUNK_CACHE_SAVE_FAILED] Failed to persist cache for chunk ${chunk.chunkId}:`, saveErr);
        }
      }
    } catch (err: any) {
      if (signal?.aborted) {
        throw new Error('EXTRACTION_ABORTED_BY_USER');
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      store.setChunkStatus(setId, chunk.chunkId, 'FAILED', errMsg);
      console.warn(
        `[CHUNK_EXTRACTION_FAILED] Document "${chunk.documentTitle}" chunk ${chunk.chunkIndex + 1}/${chunk.totalChunksInDoc} failed: ${errMsg}`
      );
    }

    processedCount++;
    options.onProgress?.({
      processedChunks: processedCount,
      totalChunks,
      currentDocumentTitle: chunk.documentTitle,
      stageMessage: `Đã hoàn thành ${processedCount}/${totalChunks} phần.`,
    });
  }

  // Final merge of all cached results
  const allCached = store.getAllCachedResults(setId);
  for (const c of allCached) {
    for (const n of c.nodes) nodesMap.set(n.urn, n);
    for (const f of c.facts) factsMap.set(f.factKey, f);
    for (const ev of c.evidence) {
      if (!evidenceList.some((e) => e.evidenceId === ev.evidenceId)) {
        evidenceList.push(ev);
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    facts: Array.from(factsMap.values()),
    evidence: evidenceList,
    quarantines: quarantinesList,
  };
}
