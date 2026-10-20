# Phase 22: Federated MCP Knowledge & Hybrid Tool Grounding - Research

**Researched:** 2026-10-20
**Domain:** Dynamic MCP Server Discovery, Intent Routing Expansion, Parallel Federated RAG + Tool Retrieval, Unified Grounded Synthesis, and Telegram Gateway Integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **1. Generic & Server-Agnostic**:
  - Không hardcode bất kỳ server ID nào: Mọi logic lấy MCP server đều dựa trên `getMcpServers(db).filter(s => s.enabled)`.
  - Đọc động toàn bộ tool list và instruction từ tất cả server đang enable qua `discoverAllMcpTools(db)` và `getEnabledMcpInstructions(db)`.
- **2. Intent Routing với Dynamic MCP Capabilities**:
  - Đưa metadata rút gọn của các server MCP đang bật (name, instruction/description, danh sách tool chính) vào prompt của `intentRouter`.
  - Mở rộng Zod schema `IntentResultSchema`:
    - `require_mcp: boolean`
    - `target_mcp_servers: string[]` (danh sách ID các MCP server phù hợp, rỗng nếu không cần)
  - Giữ nguyên các intent hiện tại (`operate_taskmate`, `query_taskmate`, `query_knowledge`, `mixed`, `clarify`), bổ sung khả năng kích hoạt MCP độc lập với intent đó.
- **3. Federated Parallel Execution (Docs RAG + MCP Tool Execution)**:
  - Khi `require_mcp = true`:
    - **Kênh A (Knowledge Docs)**: Tiếp tục chạy pipeline federated retrieval hiện tại (Knowledge Server Fastify hoặc BM25 local).
    - **Kênh B (MCP Tool Execution)**: Tự động chạy tool-calling loop đối với các tool của `target_mcp_servers` để thu thập dữ liệu thực tế (ví dụ: schema, bảng, cột, quan hệ...).
    - Cả hai kênh chạy song song (`Promise.allSettled`), có timeout bảo vệ để không làm treo luồng chat nếu MCP server phản hồi chậm.
- **4. Đóng gói Bằng chứng & Trích dẫn (Evidence Packing & Citations)**:
  - Chuẩn hóa kết quả trả về từ MCP tools vào `EvidencePack`:
    - Format citation ID: `M1`, `M2`... (hoặc URN `urn:mcp:serverName/toolName`), format citation UI tag: `[M1]` / `[M2]` tương đương `[S1]`, `[L1]`.
    - Phân loại bằng chứng (`OBSERVED`, authority: `server`).
  - UI hiển thị trích dẫn MCP rõ ràng trên Chat Bubble (chip/badge phân biệt giữa Knowledge Doc và Live MCP data).
- **5. Đồng bộ Telegram Bot Gateway**:
  - Nạp động các MCP tools đang bật vào luồng xử lý của `telegramHeadlessWorker.ts` và `telegramMutationSession.ts`.
  - Hỗ trợ user Telegram có quyền tra cứu/thao tác thông qua MCP song song với tài liệu TaskMate.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-ROUTE-01 | `intentRouter` accepts dynamic MCP server capabilities and returns `require_mcp` + `target_mcp_servers` | Schema extension in `IntentResultSchema`, compact server capability summarizer, system prompt injection with zero context blowup, strict JSON schema update. |
| MCP-FEDERATED-01 | `groundedTurn` runs parallel Knowledge Docs retrieval and dynamic MCP tool execution loop | Parallel execution in `groundedTurn.ts` via `Promise.allSettled` with fail-soft isolation and 15s timeout budget; dynamic agent loop for MCP tool-calling. |
| MCP-SYNTH-01 | `EvidencePack` packs MCP evidence with citations, synthesis integrates both Docs and MCP findings | `packEvidence` extended with `M1`, `M2`... citation format, `PersistedCitationSchema` allows `documentId` URN/UUID and `evidenceKind: 'mcp_tool'`, `CitationChip` and `SourcesPanel` render distinct MCP tags. |
| MCP-TELE-01 | Telegram assistant uses dynamic MCP tools alongside local data for authorized users | `telegramHeadlessWorker.ts` and `telegramMutationSession.ts` inject dynamic MCP tools into system prompt and tool dispatcher, honoring `dataScope` and admin permissions. |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

1. **No Backend / 100% Local**: PlannerMate core logic remains local in browser/Tauri. Knowledge server & MCP servers are optional external daemons; app must continue functioning if unreachable.
2. **Persistence**: IndexedDB (Dexie) is working data store. MCP servers stored in `db.settings.get('mcp_servers')`.
3. **UI**: Ant Design 6.x components. Consistent tags, theme tokens, and accessible interactive badges.
4. **Tool Anti-Loop & Anti-Hallucination**: LLM-first intent routing without keyword fallbacks. Never guess or extrapolate data without grounding.
5. **Fail-Soft Isolation**: If an external MCP server times out or fails with network errors, the chat pipeline must not crash; Knowledge Docs and local synthesis continue smoothly.

---

## Summary

Phase 22 unifies all enabled Model Context Protocol (MCP) servers (e.g. Graphiti Banking, Oracle DB, Filesystem, or any custom MCP server) into the grounded intelligence loop of TaskMate. Currently, MCP tools are only invoked during the operational fallback tool loop in `AIChatDrawer.tsx`, while `groundedTurn` only queries Fastify Knowledge Server or local BM25 notes. Furthermore, Telegram bot only accesses TaskMate tasks/notes or runs pure LLM/Knowledge Server without dynamic MCP tools.

By introducing:
1. **Dynamic MCP Server Capability Summaries** into `intentRouter`,
2. **A Parallel Retrieval Orchestrator** in `groundedTurn` combining Knowledge Docs RAG with a bounded Dynamic MCP Tool Calling Loop,
3. **Unified Evidence Packing & Citations** (`M1`, `M2`, ... with badge `[M1]` in UI and `SourcesPanel`), and
4. **Dynamic MCP Tool Exposure in Telegram Assistant**,

TaskMate achieves a complete, server-agnostic federated knowledge retrieval architecture.

**Primary recommendation**: Extend `IntentResultSchema` with `require_mcp: boolean` and `target_mcp_servers: string[]`. Implement an MCP Retrieval Runner in `src/services/ai/mcpRetrievalRunner.ts` that runs a lightweight 1-to-3 turn function calling loop against the enabled MCP servers within a 15-second budget. In `groundedTurn.ts`, run Docs retrieval and MCP retrieval via `Promise.allSettled`, pack both into `EvidencePack` using citation IDs `M1`, `M2`... (alongside `S1` and `L1`), and pass them to `groundedSynthesis`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dynamic MCP Server Config & Discovery | Client Service (`mcpClient.ts`) | Dexie DB (`settings`) | Stores server endpoints and cached tool lists in IndexedDB; communicates with Tauri proxy or HTTP. |
| Intent Classification with MCP Routing | AI Engine (`intentRouter.ts`) | LLM Endpoint (9router) | LLM reasons whether query requires MCP capabilities and names target servers based on dynamic capability prompt. |
| MCP Tool Execution Loop | Service (`mcpRetrievalRunner.ts`) | LLM + Tauri / HTTP proxy | Executes targeted MCP tools (schema lookup, fact search, episode read) up to 3 turns or 15s budget. |
| Parallel Federated Orchestrator | Service (`groundedTurn.ts`) | `groundedTurnDeps.ts` | Dispatches Knowledge Docs retrieval and MCP retrieval concurrently via `Promise.allSettled`. |
| Unified Evidence Normalization | Service (`evidencePack.ts`) | `groundedAnswerSchemas.ts` | Transforms raw MCP tool results into structured `SourceRecord`s with `M` citation IDs and OBSERVED authority. |
| Grounded Multi-Source Synthesis | AI Service (`groundedSynthesis.ts`) | LLM Endpoint | Synthesizes conclusion, claims, and citation reasons citing both `[S*]` docs and `[M*]` live tool observations. |
| Interactive MCP Citation Rendering | UI (`CitationChip`, `SourcesPanel`) | React / Ant Design | Distinguishes Live MCP evidence from document snapshots with an `MCP` badge and server tooltip. |
| Telegram Headless MCP Assistant | Service (`telegramHeadlessWorker.ts`) | Telegram Bot Gateway | Invokes dynamic MCP tools for authorized Telegram users when querying system or banking data. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.6.5 | Schema validation for intent and citations | Core trust boundary validator across TaskMate. [VERIFIED: npm registry] |
| `dexie` | 4.4.6 | Local IndexedDB persistence for MCP settings | Standard storage for settings (`mcp_servers`). [VERIFIED: npm registry] |
| `@tauri-apps/api` | 2.x | Native desktop MCP HTTP/IPC proxy | Required to avoid CORS and private network blocks when reaching local MCP daemons. [VERIFIED: npm registry] |

---

## Package Legitimacy Audit

No new external npm packages are required for Phase 22. All tools and dependencies (`zod`, `dexie`, Ant Design, Dayjs) are already present in `package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
                    +------------------------------------+
                    | User Prompt (Chat Drawer / Telegram)
                    +-----------------+------------------+
                                      |
                                      v
                    +------------------------------------+
                    |        routeIntent(query)          |
                    | (Includes Dynamic MCP Capabilities)|
                    +-----------------+------------------+
                                      |
                 +--------------------+--------------------+
                 |                                         |
     require_mcp = false                       require_mcp = true
                 |                                         |
                 v                                         v
       +-------------------+               +-------------------------------+
       | Knowledge Docs RAG|               | Promise.allSettled Parallel:  |
       | (Server or Local) |               | - Channel A: Knowledge Docs   |
       +---------+---------+               | - Channel B: MCP Tool Runner  |
                 |                         +---------------+---------------+
                 |                                         |
                 +--------------------+--------------------+
                                      |
                                      v
                    +------------------------------------+
                    |       packEvidence(...)            |
                    |  (Docs: S1,S2 / L1,L2; MCP: M1,M2) |
                    +-----------------+------------------+
                                      |
                                      v
                    +------------------------------------+
                    |    synthesizeGroundedAnswer(...)   |
                    | Strict Claims & Citation Reasoning |
                    +-----------------+------------------+
                                      |
                                      v
                    +------------------------------------+
                    | UI Rendering / Telegram Response   |
                    | [S1] Document  vs  [M1] Live MCP   |
                    +------------------------------------+
```

### Component Details & File Modifications

#### 1. `src/services/ai/intentRouter.ts`
- **Goal**: Allow `routeIntent` to accept dynamic MCP server capability summaries without context blowup, evolving schema while remaining 100% backward-compatible.
- **Dynamic Capabilities Input**:
  Introduce interface `McpServerCapabilitySummary`:
  ```typescript
  export interface McpServerCapabilitySummary {
    id: string;
    name: string;
    description: string;
    tools: readonly string[]; // Top 5-10 key tool names
  }
  ```
- **Zod Schema Evolution**:
  ```typescript
  export const IntentResultSchema = z.strictObject({
    intent: z.enum(INTENT_TAXONOMY),
    confidence: z.number().min(0).max(1),
    entities: z.array(z.string().trim().min(1).max(200)).max(20),
    language: z.string().trim().min(2).max(16),
    needs_clarification: z.boolean(),
    clarify_question: z.string().trim().min(1).max(500).nullable(),
    speculation_requested: z.boolean(),
    require_mcp: z.boolean().default(false),
    target_mcp_servers: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  });
  ```
  Note: Default values ensure existing tests and callers without `require_mcp` continue to pass cleanly.
- **Compact Prompt Injection**:
  If `mcpCapabilities` are passed in `RouteIntentDeps`:
  Append a compact XML block `<enabled_mcp_servers>`:
  ```
  <enabled_mcp_servers>
  - ID: "graphiti-banking" | Name: "Graphiti Banking MCP" | Tools: [search_nodes, search_memory_facts, list_advertised_groups] | Scope: SmartVista card, CMS, Switch, database schemas SVFE_SHB, MAIN1.
  - ID: "oracle-db" | Name: "Oracle Database MCP" | Tools: [query_sql, describe_table] | Scope: Real-time database inspection.
  </enabled_mcp_servers>
  ```
  Instruct LLM: Set `require_mcp: true` and add relevant IDs to `target_mcp_servers` whenever the query asks for live database schemas, technical catalog objects, transaction status, or facts supported by an enabled MCP server.

#### 2. `src/services/ai/mcpRetrievalRunner.ts` (NEW SERVICE)
- **Goal**: Run a bounded, fail-safe dynamic tool loop to retrieve facts from `target_mcp_servers`.
- **Budget**: Max 3 tool execution turns or 15,000ms overall timeout.
- **Steps**:
  1. Filter enabled tools belonging to `target_mcp_servers` using `toolToServerMap` or `fetchServerTools`.
  2. Use `completeJson` or OpenAI tool calling format with system prompt instructing model to retrieve necessary context (e.g. `list_advertised_groups`, then `search_nodes`).
  3. Execute tool via `executeDynamicMcpTool(name, args, db)`.
  4. Aggregate raw tool results into structured items:
     ```typescript
     export interface McpRetrievedItem {
       serverId: string;
       serverName: string;
       toolName: string;
       args: Record<string, unknown>;
       rawResult: string;
       timestamp: string;
     }
     ```
  5. Fail-soft: If an MCP call times out or throws an error, return partial results or an empty array with a diagnostic warning; never throw or abort the entire chat turn.

#### 3. `src/services/ai/evidencePack.ts` & `groundedAnswerSchemas.ts`
- **Citation Format**:
  Extend `CitationIdSchema`:
  ```typescript
  export const CitationIdSchema = z.string().regex(/^(S|L|M)[1-9][0-9]*$/);
  ```
  Where `M` prefix denotes **MCP live tool citation** (`M1`, `M2`, ...).
- **PersistedCitationSchema**:
  Allow `evidenceKind: 'mcp_tool'`.
  When citation is an MCP result:
  - `authority`: `'server'`
  - `evidenceClass`: `'OBSERVED'`
  - `documentId`: UUID generated or stable deterministic hash of `server:tool:args`.
  - `documentTitle`: `[MCP] ${serverName} - ${toolName}`
  - `sectionAnchor`: Tool argument summary or group ID.
  - `snapshotId`: `'mcp_live'` (or ISO timestamp).
  - `publishedContentHash`: SHA-256 hash of tool response string.
- **PackEvidence Input**:
  Accept optional `mcpResults?: readonly McpRetrievedItem[]`.
  Assign citation IDs `M1`, `M2`, ... for MCP items and place them into prompt evidence with their snippet.

#### 4. `src/services/ai/groundedTurn.ts` & `groundedTurnDeps.ts`
- **Parallel Dispatch**:
  When `routedIntent.require_mcp` is `true`:
  ```typescript
  const [docsResult, mcpResult] = await Promise.allSettled([
    executeDocsRetrieval(...),
    deps.runMcpRetrieval({
      query: input.query,
      serverIds: routedIntent.target_mcp_servers,
      signal: input.signal,
    }),
  ]);
  ```
- **Fail-soft Handling**:
  If `mcpResult.status === 'rejected'`, log warning, add coverage warning `Máy chủ MCP không phản hồi kịp thời`, and continue synthesis using Docs evidence.
  If both channels yield evidence, pack both into `serverPack` and run `synthesizeGroundedAnswer`.

#### 5. `src/components/ai/grounded/SourcesPanel.tsx` & `CitationChip.tsx`
- **UI Distinctions**:
  - In `CitationChip`: When citation ID starts with `M` (e.g. `[M1]`), render with a distinctive Purple/Cyan badge: `MCP: ${toolName}` instead of `Local` or doc title.
  - In `SourcesPanel`: Show badge `LIVE MCP` with server name and tool invocation parameters. Clicking opens a drawer/modal showing the raw MCP JSON payload.
  - In `GroundedAnswerCard`: Citation regex updated from `/\[(S\d+|L\d+)\]/g` to `/\[(S\d+|L\d+|M\d+)\]/g`.

#### 6. `src/services/telegram/telegramHeadlessWorker.ts`
- In Step 5 (Intent Routing): Pass dynamic MCP capabilities into `routeIntent`.
- If `require_mcp` is true:
  - Check whitelist user scope (if `dataScope === 'tasks_only'`, refuse MCP knowledge access per scope security policy).
  - In Step 6, run federated turn including MCP retrieval.
  - In `formatGroundedAnswerForTelegram`, format `[M1]` citations with tool source: `🔌 **Dữ liệu thực tế từ MCP:** ${toolName}`.
- In Step 5b / Mutation: For admin users, make dynamic MCP mutation tools available if enabled.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP Protocol & JSON-RPC | Custom WebSocket / STDIO parser | Existing `src/services/ai/mcpClient.ts` | Already supports JSON-RPC 2.0, SSE, Tauri Rust proxy (`graphiti_mcp_request`), session IDs, and web fetch. |
| Tool loop timeout | Custom timeout promises | `AbortController` + `setTimeout` | Standard, clean abort propagation across LLM and Tauri commands. |
| Intent routing taxonomy | Keyword regex matching | LLM-reasoned classification in `intentRouter.ts` | CLAUDE.md and Phase 19.2 mandate zero keyword/verb lists. |
| Citation ID collisions | Random string citation IDs | Strict `S*`, `L*`, `M*` monotonic numbering | Enforces strict Zod validation and closure checks in `validateGroundedAnswerClosure`. |

---

## Common Pitfalls

### Pitfall 1: Intent Prompt Context Blowup
- **What goes wrong**: Dumping full JSON schemas and descriptions of 50+ tools from 5 MCP servers directly into the intent classification prompt, causing massive latency, token cost, or hitting model context limits.
- **Why it happens**: Uncontrolled concatenation of raw `tools/list` output.
- **How to avoid**: Pre-summarize MCP server capabilities: only pass Server ID, Name, Description, and top 5-8 tool names. Detailed tool input schemas are ONLY passed during Step 2 (in `mcpRetrievalRunner`), not in Step 1 (`intentRouter`).

### Pitfall 2: MCP Timeout Hanging the Entire Chat Drawer
- **What goes wrong**: An MCP server is offline or slow (e.g. remote VPN connection), causing the entire turn to hang indefinitely.
- **Why it happens**: Waiting on `Promise.all` without an independent timeout.
- **How to avoid**: Wrap `mcpRetrievalRunner` with an explicit 15-second `AbortController.timeout` and use `Promise.allSettled`. If MCP fails or times out, proceed immediately with Knowledge Docs results and an informative warning badge.

### Pitfall 3: Citation Closure Failure in `validateGroundedAnswerClosure`
- **What goes wrong**: LLM synthesis returns claim citing `[M1]`, but `EvidencePack` didn't register `M1` in `citations` dictionary or Zod schema rejects `M1`.
- **Why it happens**: `CitationIdSchema` previously only matched `/^(S|L)[1-9][0-9]*$/`.
- **How to avoid**: Update `CitationIdSchema` to `/^(S|L|M)[1-9][0-9]*$/`. Ensure every MCP snippet is registered in `pack.citations` before synthesis.

---

## Code Examples

### 1. Schema Extension in `intentRouter.ts`
```typescript
// Source: src/services/ai/intentRouter.ts
export const IntentResultSchema = z.strictObject({
  intent: z.enum(INTENT_TAXONOMY),
  confidence: z.number().min(0).max(1),
  entities: z.array(z.string().trim().min(1).max(200)).max(20),
  language: z.string().trim().min(2).max(16),
  needs_clarification: z.boolean(),
  clarify_question: z.string().trim().min(1).max(500).nullable(),
  speculation_requested: z.boolean(),
  require_mcp: z.boolean().default(false),
  target_mcp_servers: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
});
```

### 2. Citation ID Schema Extension in `groundedAnswerSchemas.ts`
```typescript
// Source: src/services/ai/groundedAnswerSchemas.ts
export const CitationIdSchema = z.string().regex(/^(S|L|M)[1-9][0-9]*$/);

export const PersistedCitationSchema = z.strictObject({
  citationId: CitationIdSchema,
  documentId: z.string(), // Relaxed to accept UUID or URN
  documentTitle: z.string().min(1).max(400),
  sectionAnchor: z.string().min(1).max(256).nullable(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  authority: z.enum(['server', 'local']),
  evidenceClass: EvidenceClassificationSchema.or(z.literal('LOCAL')),
  snapshotId: SnapshotIdSchema.nullable(),
  publishedContentHash: HashSchema.nullable(),
  citedExcerpt: z.string().min(1).max(2000),
  relevanceReason: z.string().min(1).max(1000).optional(),
  evidenceKind: z.enum(['policy_change', 'release_note', 'migration_record', 'mcp_tool', 'other']).optional(),
  mcpMetadata: z.strictObject({
    serverId: z.string(),
    serverName: z.string(),
    toolName: z.string(),
  }).optional(),
});
```

---

## State of the Art

| Old Approach | Current Phase 22 Approach | Impact |
|--------------|---------------------------|--------|
| Hardcoded Graphiti MCP checks in `AIChatDrawer.tsx` | Server-agnostic discovery across all enabled MCP servers | Any custom MCP server (SQL, filesystem, git) is immediately usable. |
| MCP tools only called in operational fallback loop | Parallel federated retrieval: Docs RAG + MCP in `groundedTurn` | Knowledge questions can pull live facts from external databases/MCP. |
| Citations only support Server (`S*`) and Local (`L*`) | Citations support Live MCP (`M*`) with dedicated chip badge | Complete audit trail for live external data. |
| Telegram bot had no MCP integration | Telegram assistant supports dynamic MCP tools with permission checks | Remote users can query banking schemas or live tools via Telegram. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MCP retrieval loop can complete within 15 seconds over local/Tauri proxy | Architecture Patterns | If slow, turn might complete with only Docs RAG. Mitigated by `Promise.allSettled`. |
| A2 | Users running Telegram bot want MCP tool access governed by `isAdmin` and `dataScope` | Telegram Integration | Low risk; unauthorized users will be blocked from executing tools. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Tauri Desktop API | Local MCP Proxy (`graphiti_mcp_request`) | ✓ | Tauri v2 | Web `fetch` fallback for HTTP MCP servers |
| 9router AI API | Intent classification & synthesis | ✓ | Active | Error handled cleanly |
| Fastify Knowledge Server | Knowledge Docs RAG | ✓ | Active | Local BM25 fallback |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/ai/intentRouter.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-ROUTE-01 | `intentRouter` returns `require_mcp` and `target_mcp_servers` | Unit | `npx vitest run tests/ai/intentRouter.test.ts` | Existing (extend) |
| MCP-FEDERATED-01 | `groundedTurn` executes Docs and MCP in parallel with timeout isolation | Unit / Integration | `npx vitest run tests/ai/groundedTurn.test.ts` | Existing (extend) |
| MCP-SYNTH-01 | `EvidencePack` packs `M1`, `M2` citations and synthesis validates closure | Unit | `npx vitest run tests/ai/evidencePack.test.ts` | Existing (extend) |
| MCP-SYNTH-01 | UI components render `[M1]` chips with MCP badge | Component | `npx vitest run tests/ai/ChatMessageBubble.test.tsx` | Existing (extend) |
| MCP-TELE-01 | Telegram worker invokes dynamic MCP tools for authorized users | Unit | `npx vitest run tests/telegram/telegramHeadlessWorker.test.ts` | Existing (extend) |

### Sampling Rate
- **Per task commit**: Targeted vitest file (`npx vitest run tests/ai/...`)
- **Per wave merge**: All AI and Telegram test suites
- **Phase gate**: All suites pass before `/gsd-verify-work`

### Wave Breakdown for Planning
- **Wave 1 (Contracts & Intent Routing)**:
  - Extend `IntentResultSchema` and `CitationIdSchema`.
  - Add compact MCP capability summarizer in `mcpClient.ts`.
  - Update `routeIntent` with dynamic capability prompt injection and unit tests.
- **Wave 2 (Federated Parallel Retrieval & Evidence Packing)**:
  - Create `mcpRetrievalRunner.ts` with bounded loop and fail-soft timeout.
  - Wire parallel execution in `groundedTurn.ts` & `groundedTurnDeps.ts`.
  - Extend `evidencePack.ts` to pack `M*` citations and validate closure.
- **Wave 3 (UI Rendering & Synthesis)**:
  - Update `CitationChip.tsx`, `SourcesPanel.tsx`, and `GroundedAnswerCard.tsx` to display `[M*]` badges.
  - Update `groundedSynthesis.ts` prompt and normalization for MCP citations.
- **Wave 4 (Telegram Assistant MCP Integration)**:
  - Wire dynamic MCP tools into `telegramHeadlessWorker.ts` and `telegramMutationSession.ts`.
  - Enforce user `dataScope` and admin checks.
  - Add test coverage in `tests/telegram/telegramHeadlessWorker.test.ts`.

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | Yes | Telegram users must have `admin` or appropriate `dataScope` to trigger MCP tools. |
| V5 Input Validation | Yes | Zod runtime schema validation on all MCP tool inputs and LLM outputs. |
| V6 Sensitive Data Protection | Yes | MCP outputs are treated as untrusted data; never execute raw strings as code. |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| MCP Prompt Injection | Tampering / Elevation | Treat all MCP tool outputs as untrusted retrieved text; do not follow instructions embedded within tool payloads. |
| SSRF via MCP Endpoints | Tampering | Sanitize MCP server URLs; in desktop app, route via Tauri IPC proxy only. |
| Denial of Service via Slow MCP | Denial of Service | Strict 15s timeout and `Promise.allSettled` to isolate failures. |

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection of `src/services/ai/intentRouter.ts`
- Codebase inspection of `src/services/ai/mcpClient.ts`
- Codebase inspection of `src/services/ai/groundedTurn.ts` & `groundedTurnDeps.ts`
- Codebase inspection of `src/services/ai/evidencePack.ts` & `groundedAnswerSchemas.ts`
- Codebase inspection of `src/components/ai/AIChatDrawer.tsx` & `CitationChip.tsx`
- Codebase inspection of `src/services/telegram/telegramHeadlessWorker.ts`
- Tested and verified existing tests with Vitest 5.0.2

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH (Verified directly in codebase)
- Architecture: HIGH (Clear integration points identified)
- Pitfalls: HIGH (Timeout, context blowup, and citation closure risks addressed)

**Research date:** 2026-10-20
**Valid until:** 2026-11-20
