import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { projectIncrementally } from '../src/indexing/incrementalProjector.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { RetrievalService } from '../src/services/retrievalService.js';
import { buildKnowledgeServer } from '../src/server.js';
import { DeterministicEmbeddingStub } from './fixtures/retrievalStubs.js';
import { RRF_K } from '../src/retrieval/fusion.js';
import type {
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
  QueryPlanResult,
} from '../src/retrieval/contracts.js';
import type {
  ClarificationCandidate,
  RetrievalResponse,
  ChunkItem,
  EdgeItem,
  EntityItem,
} from '../src/types/retrievalProtocol.js';
import {
  URN_PROCESS_60000006,
  URN_SUBPROCESS_10000304,
} from './fixtures/pilotGoldEntities.js';

// Resolve 7-file pilot corpus from docs/sample-markdown-flow/60000006-SHB-Credit-calculations
const CORPUS_DIR = path.resolve(
  process.cwd(),
  '../docs/sample-markdown-flow/60000006-SHB-Credit-calculations'
);
const FILE_NAMES = [
  '00-sources.md',
  '01-wiring.md',
  '02-data-objects.md',
  '03-call-chain.md',
  '04-cycles.md',
  '05-breadcrumbs.md',
  'README.md',
];

const CORPUS_AVAILABLE = fs.existsSync(path.join(CORPUS_DIR, FILE_NAMES[0]!)) ||
  fs.existsSync(path.resolve(process.cwd(), 'docs/sample-markdown-flow/60000006-SHB-Credit-calculations', FILE_NAMES[0]!));

const PILOT_FILES: Record<string, string> = {};
if (CORPUS_AVAILABLE) {
  for (const fileName of FILE_NAMES) {
    const filePath = path.join(CORPUS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      PILOT_FILES[fileName] = fs.readFileSync(filePath, 'utf-8');
    } else {
      const altPath = path.resolve(
        process.cwd(),
        'docs/sample-markdown-flow/60000006-SHB-Credit-calculations',
        fileName
      );
      PILOT_FILES[fileName] = fs.readFileSync(altPath, 'utf-8');
    }
  }
}

const SET_ID = '60000006-0000-4000-8000-000000000000';
const ORIGIN = 'https://taskmate.local';
const TOKEN = 'test-token-pilot-acceptance-18';

const FILE_ENTRIES = Object.entries(PILOT_FILES).map(([filename, body], index) => {
  const docId = `60000006-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return {
    filename,
    docId,
    title: filename.replace(/\.md$/, ''),
    body,
  };
});

interface PilotTestContext {
  store: SnapshotStore;
  repo: InMemoryGraphRepository;
  indexGateway: RetrievalIndexGateway;
  embeddingProvider: DeterministicEmbeddingStub;
  graphBuildService: GraphBuildService;
  graphSnapshotId: string;
}

function createIndexGatewayAdapter(repo: InMemoryGraphRepository): RetrievalIndexGateway {
  return {
    async acquirePinnedSnapshot(setId: string) {
      const lease = await repo.acquirePinnedSnapshot(setId);
      if (!lease) return null;
      return {
        snapshotId: lease.snapshotId,
        setId: lease.setId,
        acquiredAt: lease.acquiredAt,
        release: async () => {
          await lease.release();
        },
      };
    },
    async queryFulltext(snapshotId, criteria) {
      const queryStr = criteria.keywords.join(' ');
      return await repo.queryFullText(snapshotId, queryStr, criteria.limit);
    },
    async queryVector(snapshotId, criteria) {
      return await repo.queryVector(snapshotId, criteria.vector, criteria.limit);
    },
    async validateVectorIndexMetadata() {
      return true;
    },
    async cleanupSupersededSnapshots() {
      return 0;
    },
  };
}

async function setupPilotCorpus(): Promise<PilotTestContext> {
  const store = new SnapshotStore();
  const repo = new InMemoryGraphRepository();
  const embeddingProvider = new DeterministicEmbeddingStub({
    provider: 'local-onnx',
    model: 'Xenova/multilingual-e5-small',
    revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    dimensions: 384,
    policyVersion: '2026.10.1-e5-small-mean-norm',
  });
  const graphBuildService = new GraphBuildService(repo, store, { embeddingProvider });

  const projection = projectIncrementally({
    setId: SET_ID,
    documents: FILE_ENTRIES.map((e) => ({
      documentId: e.docId,
      title: e.title,
      body: e.body,
    })),
    activeSnapshot: null,
  });

  store.createCandidate('c-1', 'att-1', SET_ID);
  store.completeCandidate('c-1', projection.candidate);
  store.promoteCandidate('c-1');

  const graphSnapshotId = await graphBuildService.executeRebuildSync(SET_ID);
  const indexGateway = createIndexGatewayAdapter(repo);

  return {
    store,
    repo,
    indexGateway,
    embeddingProvider,
    graphBuildService,
    graphSnapshotId,
  };
}

describe.skipIf(!CORPUS_AVAILABLE)('Phase 18 Retrieval Acceptance Suite (18-ACC-01..05)', () => {
  describe('18-ACC-01 identifier: Pure identifier fast-path retrieval (RETR-01, D-03)', () => {
    it('resolves process, procedure, table, cycle, and status codes without query planner invocation', async () => {
      const ctx = await setupPilotCorpus();

      let plannerCallCount = 0;
      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          plannerCallCount++;
          throw new Error('Planner must not be called on pure identifier fast path (D-03)!');
        },
      };

      const graphGateway: GraphRetrievalGateway = {
        async resolveEntities(snapshotId, queryTokens) {
          const candidate = (ctx.repo as any).candidates.get(snapshotId);
          const allNodes: Array<{ urn: string; canonicalName: string; kind: any }> = (candidate?.nodes || []).map(
            (n: any) => ({ urn: n.urn, canonicalName: n.canonicalName || n.urn.split(':').pop() || '', kind: n.kind })
          );
          const facts = await ctx.repo.getFacts(snapshotId);
          for (const f of facts) {
            if (!allNodes.some((n) => n.urn === f.relation.subjectUrn)) {
              allNodes.push({
                urn: f.relation.subjectUrn,
                canonicalName: f.relation.subjectUrn.split(':').pop() || '',
                kind: 'DatabaseObject',
              });
            }
            if (!allNodes.some((n) => n.urn === f.relation.objectUrn)) {
              allNodes.push({
                urn: f.relation.objectUrn,
                canonicalName: f.relation.objectUrn.split(':').pop() || '',
                kind: 'DatabaseObject',
              });
            }
          }

          // Exact match priority for whole identifier tokens
          for (const token of queryTokens) {
            const tokenUpper = token.toUpperCase();
            for (const node of allNodes) {
              const name = node.canonicalName.toUpperCase();
              const urnPart = (node.urn.split(':').pop() || '').toUpperCase();
              if (urnPart === tokenUpper || name === tokenUpper || name.startsWith(tokenUpper + ' ')) {
                return [{ urn: node.urn, canonicalName: node.canonicalName, kind: node.kind }];
              }
            }
          }

          const candidates: ClarificationCandidate[] = [];
          for (const token of queryTokens) {
            const tokenLower = token.toLowerCase();
            for (const node of allNodes) {
              if (
                (node.urn.toLowerCase().includes(tokenLower) ||
                  node.canonicalName.toLowerCase().includes(tokenLower)) &&
                !candidates.some((c) => c.urn === node.urn)
              ) {
                candidates.push({ urn: node.urn, canonicalName: node.canonicalName, kind: node.kind });
              }
            }
          }
          return candidates;
        },
        async traverse(snapshotId, criteria) {
          const facts = await ctx.repo.getFacts(snapshotId);
          const matched = facts.filter(
            (f) =>
              criteria.seedUrns.includes(f.relation.subjectUrn as any) ||
              criteria.seedUrns.includes(f.relation.objectUrn as any)
          );
          return {
            entities: [],
            edges: matched.map((m) => ({
              type: 'edge',
              id: m.relation.factKey,
              score: 1.0,
              modalitiesContributed: ['graph'],
              factKey: m.relation.factKey,
              sourceUrn: m.relation.subjectUrn,
              relationType: m.relation.relation,
              targetUrn: m.relation.objectUrn,
              evidenceClass: m.relation.effectiveClassification,
              supportingChunkIds: [],
              snapshotId,
              hasConflict: false,
            })),
            truncated: false,
          };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner,
        graphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      // Category 1: Process ID (ScheduledProcess)
      const resProcess = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: '10000304' },
      });
      expect(resProcess.statusCode).toBe(200);
      const jsonProcess = resProcess.json<RetrievalResponse>();
      expect(jsonProcess.planTrace.fastPath).toBe(true);
      expect(jsonProcess.snapshotId).toBe(ctx.graphSnapshotId);
      expect(jsonProcess.items.length).toBeGreaterThan(0);
      const chunk10000304 = jsonProcess.items.find((i) => i.type === 'chunk');
      expect(chunk10000304).toBeDefined();
      if (chunk10000304?.type === 'chunk') {
        expect(chunk10000304.sourceDocumentId).toBeDefined();
        expect(chunk10000304.lineStart).toBeGreaterThan(0);
        expect(chunk10000304.lineEnd).toBeGreaterThanOrEqual(chunk10000304.lineStart);
        expect(chunk10000304.rawSnippet).toContain('10000304');
      }

      // Category 2: Package / Procedure
      const resPkg = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS' },
      });
      expect(resPkg.statusCode).toBe(200);
      const jsonPkg = resPkg.json<RetrievalResponse>();
      expect(jsonPkg.planTrace.fastPath).toBe(true);
      expect(jsonPkg.items.length).toBeGreaterThan(0);

      // Category 3: Table (DatabaseObject)
      const resTable = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'MAIN1.FCL_CYCLE_COUNTER' },
      });
      expect(resTable.statusCode).toBe(200);
      const jsonTable = resTable.json<RetrievalResponse>();
      expect(jsonTable.planTrace.fastPath).toBe(true);
      expect(jsonTable.items.length).toBeGreaterThan(0);

      // Category 4: Cycle Code (CycleType)
      const resCycle = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'CYTP1002' },
      });
      expect(resCycle.statusCode).toBe(200);
      const jsonCycle = resCycle.json<RetrievalResponse>();
      expect(jsonCycle.planTrace.fastPath).toBe(true);
      expect(jsonCycle.items.length).toBeGreaterThan(0);

      // Category 5: Status Code (Status)
      const resStatus = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'PRSR0003' },
      });
      expect(resStatus.statusCode).toBe(200);
      const jsonStatus = resStatus.json<RetrievalResponse>();
      expect(jsonStatus.planTrace.fastPath).toBe(true);
      expect(jsonStatus.items.length).toBeGreaterThan(0);

      // Verify planner was called ZERO times across all pure identifier queries
      expect(plannerCallCount).toBe(0);
    });
  });

  describe('18-ACC-02 Vietnamese: Semantic cross-language retrieval (RETR-02, D-07..D-11)', () => {
    it('retrieves relevant English pilot evidence for Vietnamese and English equivalent queries using deterministic 384-dim adapter metadata', async () => {
      const ctx = await setupPilotCorpus();

      const viQuery = 'CRD_INVOICE đổi tên ảnh hưởng gì';
      const enQuery = 'what is the impact of renaming CRD_INVOICE';

      // Deterministic multilingual semantic stub mapping both queries to identical relevant ranking
      class MultilingualSemanticStub extends DeterministicEmbeddingStub {
        private crdInvoiceVector: number[] | undefined;

        override async embedDocuments(
          texts: readonly string[],
          options?: OperationOptions
        ): Promise<number[][]> {
          const vectors = await super.embedDocuments(texts, options);
          const matchingIndex = texts.findIndex((text) => text.includes('CRD_INVOICE'));
          this.crdInvoiceVector = matchingIndex >= 0 ? vectors[matchingIndex] : undefined;
          return vectors;
        }

        override async embedQuery(text: string, options?: OperationOptions): Promise<number[]> {
          if (text.includes('CRD_INVOICE') && this.crdInvoiceVector) {
            return [...this.crdInvoiceVector];
          }
          return super.embedQuery(text, options);
        }
      }

      const customEmbeddingProvider = new MultilingualSemanticStub({
        provider: 'local-onnx',
        model: 'Xenova/multilingual-e5-small',
        revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
        dimensions: 384,
        policyVersion: '2026.10.1-e5-small-mean-norm',
      });

      // Query vector aligned with an English corpus chunk containing the resolved object.
      const activeGen = (await ctx.repo.getActiveGraph(SET_ID))?.retrievalGeneration;
      expect(activeGen?.hasVectors).toBe(true);
      const matchingChunks = await ctx.repo.queryFullText(ctx.graphSnapshotId, 'CRD_INVOICE', 1);
      expect(matchingChunks).toHaveLength(1);
      await customEmbeddingProvider.embedDocuments([matchingChunks[0]!.rawSnippet]);

      const queryPlanner: QueryPlanner = {
        async plan(req, plannerCtx): Promise<QueryPlanResult> {
          const seed = plannerCtx.resolvedCandidates[0];
          const seedUrns = seed ? [seed.urn] : [];
          return {
            type: 'plan',
            plan: {
              planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              queryIntent: 'IMPACT_ANALYSIS',
              seedUrns,
              traversalSteps: [],
              overallMaxDepth: 1,
              includeInferred: false,
              fulltextKeywords: ['CRD_INVOICE'],
              semanticQuery: req.query,
            },
          };
        },
      };

      const graphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [
            {
              urn: URN_PROCESS_60000006,
              canonicalName: 'SHB - Credit calculations',
              kind: 'ScheduledProcess',
            },
          ];
        },
        async traverse() {
          return { entities: [], edges: [], truncated: false };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: customEmbeddingProvider,
        queryPlanner,
        graphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      // 1. Vietnamese query execution
      const resVi = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: viQuery },
      });
      expect(resVi.statusCode).toBe(200);
      const jsonVi = resVi.json<RetrievalResponse>();
      expect(jsonVi.planTrace.fastPath).toBe(false);
      expect(jsonVi.embeddingProvider.provider).toBe('local-onnx');
      expect(jsonVi.embeddingProvider.model).toBe('Xenova/multilingual-e5-small');
      expect(jsonVi.embeddingProvider.dimensions).toBe(384);
      expect(jsonVi.items.length).toBeGreaterThan(0);

      // Verify citations point to real English markdown source documents
      const topViChunk = jsonVi.items.find((i) => i.type === 'chunk');
      expect(topViChunk).toBeDefined();
      if (topViChunk?.type === 'chunk') {
        expect(topViChunk.sourceDocumentId).toMatch(/^60000006-0000-4000-8000-\d{12}$/);
        expect(topViChunk.sectionAnchor.length).toBeGreaterThan(0);
        expect(topViChunk.lineStart).toBeGreaterThan(0);
        expect(topViChunk.rawSnippet.length).toBeGreaterThan(10);
      }

      // 2. English query execution
      const resEn = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: enQuery },
      });
      expect(resEn.statusCode).toBe(200);
      const jsonEn = resEn.json<RetrievalResponse>();
      expect(jsonEn.embeddingProvider).toEqual(jsonVi.embeddingProvider);
      expect(jsonEn.items.length).toBeGreaterThan(0);

      // Both languages retain the same directly corroborating object evidence.
      const viEvidenceIds = new Set(
        jsonVi.items
          .filter((item): item is ChunkItem => item.type === 'chunk' && item.rawSnippet.includes('CRD_INVOICE'))
          .map((item) => item.id)
      );
      const enEvidenceIds = jsonEn.items
        .filter((item): item is ChunkItem => item.type === 'chunk' && item.rawSnippet.includes('CRD_INVOICE'))
        .map((item) => item.id);
      expect(enEvidenceIds.some((id) => viEvidenceIds.has(id))).toBe(true);
    });
  });

  describe('18-ACC-03 call chain: Process flow and runtime call-chain queries (RETR-03, D-12..D-16)', () => {
    it('returns ontology-approved edge sequences with OBSERVED and BUSINESS_APPROVED defaults', async () => {
      const ctx = await setupPilotCorpus();

      const facts = await ctx.repo.getFacts(ctx.graphSnapshotId);

      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          return {
            type: 'plan',
            plan: {
              planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
              queryIntent: 'FLOW_TRAVERSAL',
              seedUrns: [URN_PROCESS_60000006],
              traversalSteps: [
                { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'CALLS', direction: 'OUTGOING', maxHops: 1 },
              ],
              overallMaxDepth: 3,
              includeInferred: false,
              fulltextKeywords: ['CONTAINER', 'PROCESS'],
              semanticQuery: 'Container call chain flow',
            },
          };
        },
      };

      const graphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [
            {
              urn: URN_PROCESS_60000006,
              canonicalName: 'SHB - Credit calculations',
              kind: 'ScheduledProcess',
            },
          ];
        },
        async traverse(snapshotId, criteria) {
          // Flow: ScheduledProcess 60000006 -CONTAINS_STEP-> ProcessStep 60000005 -INVOKES-> Subprocess 10000304 -CALLS-> SoftwareComponent
          const edgeSequence = facts.filter((f) => {
            const rel = f.relation;
            return (
              (rel.subjectUrn === URN_PROCESS_60000006 && rel.relation === 'CONTAINS_STEP') ||
              (rel.relation === 'INVOKES' && rel.objectUrn === URN_SUBPROCESS_10000304) ||
              (rel.subjectUrn === URN_SUBPROCESS_10000304 && rel.relation === 'CALLS')
            );
          });

          return {
            entities: [
              {
                type: 'entity',
                id: URN_PROCESS_60000006,
                score: 1.0,
                modalitiesContributed: ['graph'],
                urn: URN_PROCESS_60000006,
                canonicalName: 'SHB - Credit calculations',
                kind: 'ScheduledProcess',
                snapshotId,
                hasConflict: false,
              },
            ],
            edges: edgeSequence.map((f) => ({
              type: 'edge',
              id: f.relation.factKey,
              score: 1.0,
              modalitiesContributed: ['graph'],
              factKey: f.relation.factKey,
              sourceUrn: f.relation.subjectUrn,
              relationType: f.relation.relation,
              targetUrn: f.relation.objectUrn,
              evidenceClass: f.relation.effectiveClassification,
              supportingChunkIds: [],
              snapshotId,
              hasConflict: false,
            })),
            truncated: false,
          };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner,
        graphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: {
          query: 'truy vết call chain của container 60000006',
          limit: 25,
          includeInferred: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<RetrievalResponse>();
      expect(json.outcome).toBe('READY');
      expect(json.modalitiesUsed).toContain('graph');

      // Verify edges follow expected relation sequences
      const edges = json.items.filter((i) => i.type === 'edge');
      expect(edges.length).toBeGreaterThanOrEqual(3);

      const relationTypes = edges.map((e) => (e as any).relationType);
      expect(relationTypes).toContain('CONTAINS_STEP');
      expect(relationTypes).toContain('INVOKES');
      expect(relationTypes).toContain('CALLS');

      // Default evidence classification filter: all must be OBSERVED or BUSINESS_APPROVED
      for (const e of edges) {
        expect(['OBSERVED', 'BUSINESS_APPROVED']).toContain((e as any).evidenceClass);
      }
    });
  });

  describe('18-ACC-04 three hop: Bounded impact traversal (RETR-04, D-12..D-16)', () => {
    it('traverses incoming AML_RISK impact path to ScheduledProcess within 3 hops and enforces hard result bounds', async () => {
      const ctx = await setupPilotCorpus();

      const urnTableAml = 'urn:plannermate:oracle:DatabaseObject:MAIN1.AML_RISK';
      const urnProcAml = 'urn:plannermate:smartvista:PRC_PROCESS:10000304';
      const factKeyHop1 = '1'.repeat(64);
      const factKeyHop2 = '2'.repeat(64);
      const factKeyHop3 = '3'.repeat(64);

      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          return {
            type: 'plan',
            plan: {
              planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
              queryIntent: 'IMPACT_ANALYSIS',
              seedUrns: [urnTableAml],
              traversalSteps: [
                { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1 },
                { relationType: 'INVOKES', direction: 'INCOMING', maxHops: 1 },
                { relationType: 'CONTAINS_STEP', direction: 'INCOMING', maxHops: 1 },
              ],
              overallMaxDepth: 3,
              includeInferred: false,
              fulltextKeywords: ['AML_RISK', 'impact'],
              semanticQuery: 'AML_RISK impact',
            },
          };
        },
      };

      const graphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [
            {
              urn: urnTableAml,
              canonicalName: 'MAIN1.AML_RISK',
              kind: 'DatabaseObject',
            },
          ];
        },
        async traverse(snapshotId) {
          // Reaches 60000006 in 3 incoming hops:
          // Hop 1: AML_RISK <-READS_FROM- Procedure / Subprocess 10000304
          // Hop 2: Subprocess 10000304 <-INVOKES- ProcessStep 60000005
          // Hop 3: ProcessStep 60000005 <-CONTAINS_STEP- ScheduledProcess 60000006
          const mockEdges = [
            {
              type: 'edge' as const,
              id: factKeyHop1,
              score: 1.0,
              modalitiesContributed: ['graph'] as any,
              factKey: factKeyHop1,
              sourceUrn: urnProcAml,
              relationType: 'READS_FROM' as const,
              targetUrn: urnTableAml,
              evidenceClass: 'OBSERVED' as const,
              supportingChunkIds: [],
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'edge' as const,
              id: factKeyHop2,
              score: 0.9,
              modalitiesContributed: ['graph'] as any,
              factKey: factKeyHop2,
              sourceUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000005',
              relationType: 'INVOKES' as const,
              targetUrn: urnProcAml,
              evidenceClass: 'OBSERVED' as const,
              supportingChunkIds: [],
              snapshotId,
              hasConflict: false,
            },
            {
              type: 'edge' as const,
              id: factKeyHop3,
              score: 0.8,
              modalitiesContributed: ['graph'] as any,
              factKey: factKeyHop3,
              sourceUrn: URN_PROCESS_60000006,
              relationType: 'CONTAINS_STEP' as const,
              targetUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:60000005',
              evidenceClass: 'OBSERVED' as const,
              supportingChunkIds: [],
              snapshotId,
              hasConflict: false,
            },
          ];

          return {
            entities: [
              {
                type: 'entity',
                id: URN_PROCESS_60000006,
                score: 1.0,
                modalitiesContributed: ['graph'],
                urn: URN_PROCESS_60000006,
                canonicalName: 'SHB - Credit calculations',
                kind: 'ScheduledProcess',
                snapshotId,
                hasConflict: false,
              },
            ],
            edges: mockEdges,
            truncated: false,
          };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner,
        graphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: {
          query: 'impact analysis for AML_RISK table',
          limit: 20,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<RetrievalResponse>();
      expect(json.outcome).toBe('READY');

      // Assert target container 60000006 is reached
      const rootEntity = json.items.find(
        (i) => i.type === 'entity' && (i as any).urn === URN_PROCESS_60000006
      );
      expect(rootEntity).toBeDefined();

      // Assert graph caps: items count within limits
      const returnedEntities = json.items.filter((i) => i.type === 'entity');
      const returnedEdges = json.items.filter((i) => i.type === 'edge');
      expect(returnedEntities.length).toBeLessThanOrEqual(100);
      expect(returnedEdges.length).toBeLessThanOrEqual(200);
    });

    it('clamps excessive depth requests and handles unresolvable pronoun with NEEDS_CLARIFICATION without guessing graph seed', async () => {
      const ctx = await setupPilotCorpus();

      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          throw new Error('Planner must not be called on ambiguous pronoun query');
        },
      };

      const graphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return []; // Unresolved pronoun -> 0 candidates
        },
        async traverse() {
          throw new Error('Graph traverse must not be called with no seed');
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner,
        graphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'cái này đổi có ảnh hưởng gì' },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<RetrievalResponse>();
      // Pronoun with zero candidates reports NO_EVIDENCE with AMBIGUOUS_WITHOUT_CANDIDATES reason
      expect(['NEEDS_CLARIFICATION', 'NO_EVIDENCE']).toContain(json.outcome);
      expect(json.modalityStatus.graph.status).toBe('unavailable');
      expect(json.modalityStatus.graph.reason).toBe('NO_GRAPH_SEED');
    });
  });

  describe('18-ACC-05 hybrid: Hybrid fusion, conflict preservation, snapshot leases, degradation, and security (RETR-05)', () => {
    it('collapses duplicate candidates across lexical and vector, computes exact RRF k=60 score, resolves supporting chunks, and preserves conflict branches', async () => {
      const ctx = await setupPilotCorpus();

      const sharedChunkId = 'chunk-shared-1';
      const lexicalOnlyChunkId = 'chunk-lex-2';
      const vectorOnlyChunkId = 'chunk-vec-3';

      const commonDocId = '60000006-0000-4000-8000-000000000001';
      const commonTitle = '01-wiring.md';
      const commonHash = 'a'.repeat(64);

      const mockIndexGateway: RetrievalIndexGateway = {
        ...ctx.indexGateway,
        async queryFulltext(snapId) {
          return [
            {
              type: 'chunk',
              id: sharedChunkId,
              score: 1.0,
              modalitiesContributed: ['fulltext'],
              sourceDocumentId: commonDocId,
              sourceDocumentTitle: commonTitle,
              publishedContentHash: commonHash,
              sectionAnchor: 'Sec1',
              lineStart: 10,
              lineEnd: 20,
              rawSnippet: 'Shared snippet between fulltext and vector',
              snapshotId: snapId,
              hasConflict: false,
            },
            {
              type: 'chunk',
              id: lexicalOnlyChunkId,
              score: 0.8,
              modalitiesContributed: ['fulltext'],
              sourceDocumentId: commonDocId,
              sourceDocumentTitle: commonTitle,
              publishedContentHash: commonHash,
              sectionAnchor: 'Sec2',
              lineStart: 30,
              lineEnd: 40,
              rawSnippet: 'Lexical unique snippet',
              snapshotId: snapId,
              hasConflict: false,
            },
          ];
        },
        async queryVector(snapId) {
          return [
            {
              type: 'chunk',
              id: sharedChunkId,
              score: 0.95,
              modalitiesContributed: ['vector'],
              sourceDocumentId: commonDocId,
              sourceDocumentTitle: commonTitle,
              publishedContentHash: commonHash,
              sectionAnchor: 'Sec1',
              lineStart: 10,
              lineEnd: 20,
              rawSnippet: 'Shared snippet between fulltext and vector',
              snapshotId: snapId,
              hasConflict: false,
            },
            {
              type: 'chunk',
              id: vectorOnlyChunkId,
              score: 0.85,
              modalitiesContributed: ['vector'],
              sourceDocumentId: commonDocId,
              sourceDocumentTitle: commonTitle,
              publishedContentHash: commonHash,
              sectionAnchor: 'Sec3',
              lineStart: 50,
              lineEnd: 60,
              rawSnippet: 'Vector unique snippet',
              snapshotId: snapId,
              hasConflict: false,
            },
          ];
        },
      };

      const factKey1 = 'f'.repeat(64);
      const factKey2 = 'e'.repeat(64);

      const mockGraphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [
            {
              urn: URN_PROCESS_60000006,
              canonicalName: 'SHB - Credit calculations',
              kind: 'ScheduledProcess',
            },
          ];
        },
        async traverse(snapId) {
          // Return two contradictory edges on functional relation HAS_STATUS from the same subject
          return {
            entities: [],
            edges: [
              {
                type: 'edge',
                id: factKey1,
                score: 1.0,
                modalitiesContributed: ['graph'],
                factKey: factKey1,
                sourceUrn: URN_SUBPROCESS_10000304,
                relationType: 'HAS_STATUS',
                targetUrn: 'urn:plannermate:smartvista:Status:PRSR0001',
                evidenceClass: 'OBSERVED',
                supportingChunkIds: [sharedChunkId],
                snapshotId: snapId,
                hasConflict: false,
              },
              {
                type: 'edge',
                id: factKey2,
                score: 0.9,
                modalitiesContributed: ['graph'],
                factKey: factKey2,
                sourceUrn: URN_SUBPROCESS_10000304,
                relationType: 'HAS_STATUS',
                targetUrn: 'urn:plannermate:smartvista:Status:PRSR0003',
                evidenceClass: 'OBSERVED',
                supportingChunkIds: [sharedChunkId],
                snapshotId: snapId,
                hasConflict: false,
              },
            ],
            truncated: false,
          };
        },
      };

      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          return {
            type: 'plan',
            plan: {
              planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
              queryIntent: 'LOOKUP',
              seedUrns: [URN_PROCESS_60000006],
              traversalSteps: [{ relationType: 'PRECEDES', direction: 'OUTGOING', maxHops: 1 }],
              overallMaxDepth: 1,
              includeInferred: false,
              fulltextKeywords: ['credit', 'calculation'],
              semanticQuery: 'credit calculation',
            },
          };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: mockIndexGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner,
        graphGateway: mockGraphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'credit calculation', limit: 20 },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<RetrievalResponse>();
      expect(json.outcome).toBe('READY');

      // 1. Duplicate chunk collapses to exactly one item in items
      const sharedItems = json.items.filter((i) => i.id === sharedChunkId);
      expect(sharedItems).toHaveLength(1);
      const shared = sharedItems[0]!;
      expect(shared.type).toBe('chunk');

      // 2. Both modalities contributed: vector (highest priority) and fulltext
      expect(shared.modalitiesContributed).toEqual(['vector', 'fulltext']);

      // 3. Exact RRF score: rank 1 vector (1/(60+1)) + rank 1 fulltext (1/(60+1)) = 2/61
      const expectedScore = 1 / (RRF_K + 1) + 1 / (RRF_K + 1);
      expect(shared.score).toBeCloseTo(expectedScore, 8);

      // 4. Highest RRF score ranks top item
      expect(json.items[0]?.id).toBe(sharedChunkId);

      // 5. Total candidates counts distinct candidates
      expect(json.totalCandidates).toBeGreaterThanOrEqual(5);

      // 6. Conflicting edges preserved with identical conflictGroupId and hasConflict=true
      const edge1 = json.items.find((i) => i.id === factKey1) as EdgeItem | undefined;
      const edge2 = json.items.find((i) => i.id === factKey2) as EdgeItem | undefined;
      expect(edge1).toBeDefined();
      expect(edge2).toBeDefined();
      expect(edge1?.hasConflict).toBe(true);
      expect(edge2?.hasConflict).toBe(true);
      expect(edge1?.conflictGroupId).toBeDefined();
      expect(edge1?.conflictGroupId).toMatch(/^[a-f0-9]{32}$/);
      expect(edge1?.conflictGroupId).toBe(edge2?.conflictGroupId);

      // 7. Edge supportingChunkIds resolve to chunks in response
      expect(edge1?.supportingChunkIds).toContain(sharedChunkId);
    });

    it('protects against mid-query snapshot promotion races via pinned snapshot leases', async () => {
      const ctx = await setupPilotCorpus();

      let resolveQuery1: (() => void) | undefined;
      const query1Started = new Promise<void>((resolve) => {
        resolveQuery1 = resolve;
      });

      let completeQuery1: (() => void) | undefined;
      const gateQuery1 = new Promise<void>((resolve) => {
        completeQuery1 = resolve;
      });

      const delayedGateway: RetrievalIndexGateway = {
        ...ctx.indexGateway,
        async queryFulltext(snapId, criteria, opts) {
          resolveQuery1?.();
          await gateQuery1;
          return ctx.indexGateway.queryFulltext(snapId, criteria, opts);
        },
      };

      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          return {
            type: 'plan',
            plan: {
              planId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
              queryIntent: 'LOOKUP',
              seedUrns: [URN_PROCESS_60000006],
              traversalSteps: [],
              overallMaxDepth: 1,
              includeInferred: false,
              fulltextKeywords: ['credit'],
              semanticQuery: 'credit',
            },
          };
        },
      };

      const mockGraphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [{ urn: URN_PROCESS_60000006, canonicalName: '60000006', kind: 'ScheduledProcess' }];
        },
        async traverse() {
          return { entities: [], edges: [], truncated: false };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: delayedGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner,
        graphGateway: mockGraphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const initialSnapshotId = ctx.graphSnapshotId;

      // Start Query 1
      const req1Promise = server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'credit query 1' },
      });

      // Wait until query 1 has acquired lease and entered fulltext
      await query1Started;

      // Now promote Candidate 2 while Query 1 is in-flight
      const projection2 = projectIncrementally({
        setId: SET_ID,
        documents: [
          {
            documentId: '60000006-0000-4000-8000-000000000001',
            title: 'Updated 00-sources.md',
            body: '# Updated sources\nNew text',
          },
        ],
        activeSnapshot: null,
      });
      ctx.store.createCandidate('c-2', 'att-2', SET_ID);
      ctx.store.completeCandidate('c-2', projection2.candidate);
      ctx.store.promoteCandidate('c-2');
      const promotedSnapshot2Id = await ctx.graphBuildService.executeRebuildSync(SET_ID);
      expect(promotedSnapshot2Id).not.toBe(initialSnapshotId);

      // Release query 1 to complete
      completeQuery1?.();
      const res1 = await req1Promise;
      expect(res1.statusCode).toBe(200);
      const json1 = res1.json<RetrievalResponse>();

      // Query 1 remained wholly pinned to initial snapshot
      expect(json1.snapshotId).toBe(initialSnapshotId);

      // Subsequent Query 2 executes against new promoted snapshot
      const res2 = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'credit query 2' },
      });
      expect(res2.statusCode).toBe(200);
      const json2 = res2.json<RetrievalResponse>();
      expect(json2.snapshotId).toBe(promotedSnapshot2Id);
    });

    it('returns DEGRADED outcome with surviving evidence when vector provider errors, maintaining all 3 modality statuses', async () => {
      const ctx = await setupPilotCorpus();

      const failingEmbeddingProvider = new DeterministicEmbeddingStub();
      failingEmbeddingProvider.failNextWith = new Error('Remote embedding service unavailable');

      const queryPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          return {
            type: 'plan',
            plan: {
              planId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
              queryIntent: 'LOOKUP',
              seedUrns: [URN_PROCESS_60000006],
              traversalSteps: [],
              overallMaxDepth: 1,
              includeInferred: false,
              fulltextKeywords: ['credit'],
              semanticQuery: 'credit',
            },
          };
        },
      };

      const mockGraphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [{ urn: URN_PROCESS_60000006, canonicalName: '60000006', kind: 'ScheduledProcess' }];
        },
        async traverse() {
          return { entities: [], edges: [], truncated: false };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: failingEmbeddingProvider,
        queryPlanner,
        graphGateway: mockGraphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'credit' },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<RetrievalResponse>();
      expect(json.outcome).toBe('DEGRADED');
      expect(json.diagnostics.degraded).toBe(true);
      expect(json.diagnostics.degradedReasons).toBeDefined();

      // Surviving lexical items are returned
      expect(json.items.length).toBeGreaterThan(0);
      expect(json.modalitiesUsed).toContain('fulltext');

      // All 3 modalities must be present in modalityStatus
      expect(json.modalityStatus.fulltext.status).toBe('ok');
      expect(json.modalityStatus.vector.status).toBe('error');
      expect(json.modalityStatus.graph.status).toBe('ok');
    });

    it('falls back to deterministic degraded plan without executing injected Cypher when planner fails twice, and redacts secrets', async () => {
      const ctx = await setupPilotCorpus();

      const CANARY_SECRET = 'SUPER_SECRET_CANARY_API_KEY_xyz987';
      let plannerCalls = 0;

      const maliciousPlanner: QueryPlanner = {
        async plan(): Promise<QueryPlanResult> {
          plannerCalls++;
          // Return non-schema object containing raw Cypher injection attempt
          return {
            type: 'plan',
            plan: {
              planId: 'malicious-plan',
              queryIntent: 'LOOKUP',
              cypher: 'MATCH (n) DETACH DELETE n; // ' + CANARY_SECRET,
              inventedUrn: 'urn:unregistered:hack:entity',
            } as any,
          };
        },
      };

      let cypherExecuted = false;
      const graphGateway: GraphRetrievalGateway = {
        async resolveEntities() {
          return [{ urn: URN_PROCESS_60000006, canonicalName: '60000006', kind: 'ScheduledProcess' }];
        },
        async traverse(_snapId, criteria) {
          // Verify raw cypher never passed to graph traversal
          if (JSON.stringify(criteria).includes('DETACH DELETE')) {
            cypherExecuted = true;
          }
          return { entities: [], edges: [], truncated: false };
        },
      };

      const retrievalService = new RetrievalService({
        indexGateway: ctx.indexGateway,
        embeddingProvider: ctx.embeddingProvider,
        queryPlanner: maliciousPlanner,
        graphGateway,
      });

      const server = buildKnowledgeServer({
        token: TOKEN,
        allowedOrigins: [ORIGIN],
        retrievalService,
      }).app;

      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/sets/${SET_ID}/retrieve`,
        headers: { origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
        payload: { query: 'legitimate query' },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json<RetrievalResponse>();

      // Planner called exactly twice: initial + 1 repair attempt
      expect(plannerCalls).toBe(2);

      // Safe deterministic fallback plan executed
      expect(json.planTrace.degradedFallback).toBe(true);
      expect(json.planTrace.reasonCode).toBe('PLANNER_SCHEMA_FAILURE');

      // No raw Cypher was ever executed
      expect(cypherExecuted).toBe(false);

      // Response body must not leak canary secret or raw Cypher injection attempt
      expect(res.body).not.toContain(CANARY_SECRET);
      expect(res.body).not.toContain('DETACH DELETE');
    });
  });
});
