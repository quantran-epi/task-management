# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion - Research

**Researched:** 2026-10-08
**Domain:** Knowledge Server Foundation, Client-Side DLP Scanning, Markdown MDAST Section Chunking, SHA-256 Incremental Projection, Atomic Snapshot Activation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Existing publish-flow decisions retained
- **D-01:** `Document set` is the primary publish unit. A set stores an explicit ordered membership snapshot of stable document UUIDs; folder membership is used only to initialize a set.
- **D-02:** Local edits mark affected documents and sets as `Local changes`; publishing remains manual and never runs from document auto-save.
- **D-03:** Removing previously published membership appears in change preview and requires confirmation before server unpublishing. Local Markdown is never deleted.
- **D-04:** Pre-send preview distinguishes added, changed, removed, and unchanged documents/chunks.

#### Server contract
- **D-05:** Configure one user-entered knowledge-server `base URL`. Client derives fixed versioned routes under `/api/v1`; do not expose separate endpoint fields or add discovery-manifest machinery in Phase 16.
- **D-06:** Use an `Async attempt resource`: after preview, DLP scan, and any required confirmation, client performs one content-bearing POST, receives `attemptId`, then polls that attempt to a terminal state.
- **D-07:** Protect content-bearing API routes with HTTPS, a session-only `Bearer token`, and an exact CORS origin allow-list. Web/PWA token stays in memory and never enters IndexedDB, localStorage, logs, backups, or deployed configuration.
- **D-08:** Knowledge server is authoritative for remote attempt, candidate, and active-snapshot state. IndexedDB stores last-known remote state for offline inspection and reconciles from server when connectivity returns.
- **D-09:** Client generates a unique `attemptKey`; retrying the initial POST with the same key is idempotent and returns the same server attempt rather than starting duplicate work.

#### Publish concurrency and recovery
- **D-10:** Each attempt freezes an immutable input snapshot at confirmation time. User may continue editing local documents while publish runs; later edits remain `Local changes` and belong to a new preview, DLP scan, and attempt.
- **D-11:** Permit only one active attempt per document set. Server rejects a second attempt for that set with structured `SET_PUBLISH_IN_PROGRESS`; different sets may publish concurrently.
- **D-12:** Phase 16 does not support server-side cancellation after the content-bearing POST is accepted. Closing UI only stops polling; server attempt continues to a terminal state and reconciles on reopen.
- **D-13:** Connection loss never implies server failure. Keep primary state `Publishing` with a connection-warning substatus such as “Mất kết nối — chưa xác định kết quả”; reconcile by `attemptId` when online. Only an explicit terminal server result becomes `Failed`.
- **D-14:** Candidate snapshot activates only after every document completes successfully. Any failure keeps prior active snapshot unchanged and records failed candidate details.

#### DLP baseline
- **D-15:** Keep Phase 16 DLP deliberately simple, deterministic, and client-side. Use PAN pattern plus Luhn validation and clear keyword/context rules for CVV, PIN/PIN block, HSM keys, credentials, and customer PII.
- **D-16:** Do not add ML/NLP classification, entropy scoring, custom rule editors, allow-lists, trusted-document rules, or persistent finding suppression. False positives are handled by masked warning plus fresh explicit confirmation.
- **D-17:** Scan every outbound user-authored string before any content-bearing request: document title, Markdown body, tags, document-set name, and any other user-entered text in payload. UUIDs, hashes, timestamps, and generated protocol metadata do not require scanning.
- **D-18:** Rule set has a fixed version for repeatable tests and audit correlation. Audit stores version, timestamp, document IDs, categories/counts, and content hashes only—never matched values or excerpts.
- **D-19:** Findings display category, document, line/column when applicable, and masked context. Collapse overlapping matches for the same source range into one displayed finding, preferring the more specific category; planner may choose exact deterministic precedence.

#### AST chunk semantics
- **D-20:** Content before first H2/H3 becomes a preamble chunk, including H1 when present. H2/H3 open normal semantic sections. H4–H6 remain within nearest H2/H3 parent and contribute to heading path rather than opening top-level chunks.
- **D-21:** A document without H2/H3 uses one synthetic section, then splits at AST block boundaries only if over target size. Synthetic structure is server metadata and never mutates source Markdown.
- **D-22:** Hash normalization canonicalizes `CRLF` and `CR` to `LF` only. Preserve all other spaces, blank lines, case, and Markdown syntax because whitespace can be semantic in tables, code, SQL, and ASCII diagrams.
- **D-23:** Keep exact raw source slices and offsets against the immutable published snapshot even though hashes use newline normalization. Source ranges must reconstruct snapshot content exactly.
- **D-24:** Separate reusable content identity from evidence occurrence identity. `contentHash` supports unchanged-content reuse; duplicate occurrences in one document each retain independent `occurrenceId`, heading path, and exact source range. Never deduplicate away evidence occurrences.
- **D-25:** Use versioned server constants: target chunk size `6,000 characters`; hard atomic-block limit `50,000 characters`. No user-facing setting. Atomic blocks may exceed target but must reject the document when over hard limit; never truncate.
- **D-26:** Record `chunkingPolicyVersion` with each snapshot so future policy changes can trigger explicit reprojection rather than silently mixing chunk semantics.

#### Publish and status presentation retained
- **D-27:** Primary set states remain exactly `Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, and `Failed`. Connectivity uncertainty is subordinate text/banner, not a seventh primary state.
- **D-28:** Show set status and history in document-set management; show compact per-document badges in existing Docs workspace.
- **D-29:** Keep 10 newest attempts per set with timestamp, duration, changed/unchanged/removed counts, warning count, and error summary. Store no document content or DLP excerpt in history.

### Claude's Discretion
- Exact deterministic precedence for overlapping DLP categories and exact masked-context length.
- Poll interval/backoff details, request/response field names, structured error envelope, and retry ceiling, provided decisions above hold.
- Exact visual treatment and accessible colors for statuses, following existing Ant Design and Vietnamese-copy patterns.
- Parser/library choice and exact source-offset convention, provided chunks reconstruct exact published snapshot slices and tests cover Unicode plus CRLF/LF handling.

### Deferred Ideas (OUT OF SCOPE)
- Full-text, BM25-server, semantic/vector, and hybrid retrieval indexes (Phase 18).
- Ontology extraction, deterministic relationship extraction, LLM extraction, Neo4j entities/relations (Phase 17).
- Assistant answer generation, citations, graph-path cards, conflicts, and abstention (Phase 19).
- Whole card-system corpus beyond process `60000006` as formal acceptance corpus.
- Arbitrary filesystem Markdown publishing (Phase 16 publishes PlannerMate Docs notes).
- Automatic publish-on-save, background folder-query membership, or persistent DLP trust bypass.
- Mutation or deletion of canonical local Markdown during publish/unpublish.
- Interactive graph canvas or manual graph editor.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGEST-01 | User can publish selected normalized Markdown documents from PlannerMate to an optional knowledge server without changing local canonical copies. | Research defines Document Set entity, Dexie schema V10, folder-snapshot initiation, client-side transport service, and immutability guarantees preserving local `Note` records. |
| INGEST-02 | Before any document content leaves PlannerMate, user receives masked finding details when pre-ingestion checks detect PAN, CVV, PIN data, HSM keys, credentials, or customer PII, and each affected publish attempt requires fresh explicit confirmation before it may continue. | Research establishes deterministic client-side DLP engine: regex rules + Luhn validation, categorical precedence, masked excerpt formatter, confirmation modal, and zero-content audit logging. |
| INGEST-03 | Published documents preserve headings, tables, code blocks, SQL, ASCII diagrams, and exact source ranges as retrievable evidence chunks. | Research defines `unified` + `remark-parse` + `remark-gfm` MDAST pipeline: H2/H3 section-first splitting, preamble capture, atomic block boundaries (tables/fenced code), 6k target, 50k hard reject limit, and character offset tracking. |
| INGEST-04 | Republish processes only changed documents or sections using stable IDs and SHA-256 hashes. | Research details two-level hash diffing: document SHA-256 and normalized chunk SHA-256 (`CRLF`/`CR` -> `LF`), stable composite chunk ID (`docId + contentHash`), and reuse of unchanged chunk representations. |
| INGEST-05 | User can inspect publish and indexing status for each document set. | Research designs six primary states (`Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, `Failed`), connection-warning substatus, Docs workspace compact badges, management drawer, and 10-attempt circular history store. |
</phase_requirements>

## Summary

Phase 16 establishes the foundational publishing bridge connecting PlannerMate's local-first Docs workspace to an optional external Knowledge Server daemon. PlannerMate remains completely functional offline without a knowledge server: local notes, editing, auto-save (500ms), and BM25 search are completely isolated and canonical. When enabled, the user creates named **Document Sets** containing explicit UUID membership (optionally initialized from a folder tree snapshot). Publishing is strictly **manual**; local edits mark documents and sets with `Local changes` state without triggering background network synchronization.

Before any document content leaves the browser or desktop app, a client-side **Data Loss Prevention (DLP)** scanner inspects all outbound user-authored strings (title, body, tags, set name) against banking-specific sensitive data categories: PAN (with Luhn check), CVV, PIN / PIN block, HSM keys, credentials, and customer PII (CCCD, email, phone). Because the server runs within the organization network, findings produce masked warnings requiring **fresh explicit user confirmation** per attempt. Full secrets and excerpts are never persisted or transmitted in audit logs.

The server ingestion daemon receives immutable snapshots via an asynchronous attempt API (`POST /api/v1/sets/:setId/attempts`), protected by session-only Bearer tokens and CORS allow-lists. Ingestion parses Markdown into an Abstract Syntax Tree (MDAST via `unified` + `remark-parse` + `remark-gfm`), producing section-first chunks (H2/H3 units, with H1 in the preamble). Markdown tables, fenced code/SQL, and ASCII flow diagrams remain strictly atomic. Any atomic block exceeding 50,000 characters triggers an explicit rejection with location details, preventing silent truncation. Projection uses SHA-256 hashes to incrementally process only added, modified, or removed chunks. The entire candidate snapshot activates **atomically**; any document failure leaves the prior active snapshot untouched.

**Primary recommendation:** Implement client DLP, document-set repo, and change preview inside the existing React/Dexie codebase under `src/services/dlp/` and `src/services/knowledge/`, and establish the companion server daemon in `knowledge-server/` using Fastify 5 and unified/remark-parse with Vitest fixtures verifying process `60000006` sample documents.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Document Set Membership & Local Changes | Browser / Client (Dexie) | — | Document sets and notes live locally in IndexedDB; membership is a stable list of UUIDs. |
| Pre-send Change Preview & Member Diffing | Browser / Client | — | Computes added/changed/removed/unchanged sets locally by comparing note `updatedAt` / local content hash with active snapshot metadata. |
| Pre-send Sensitive-Data Scanning (DLP) | Browser / Client | — | Must run **before** content leaves the client machine; zero network transmission if cancelled. |
| Masked Finding Display & Fresh Confirmation | Browser / Client (AntD Modal) | — | User inspects masked findings (`411111••••1111`) and explicitly confirms current attempt. |
| Publish Attempt Orchestration & Polling | Browser / Client | Knowledge Server API | Client creates attempt with idempotent `attemptKey`, then polls `/api/v1/attempts/:id` until terminal state. |
| Ingestion Authentication & CORS Enforcement | Knowledge Server (Fastify) | — | Validates in-memory session Bearer token and enforces exact origin header. |
| Markdown AST Parsing & Semantic Chunking | Knowledge Server (unified/remark) | — | Server owns MDAST parsing, section splitting, atomic block preservation, and offset tracking. |
| Oversized Atomic Block Safety (50k limit) | Knowledge Server | — | Enforces hard 50k char boundary; generates exact line/col error and rejects candidate activation. |
| SHA-256 Hashing & Incremental Chunk Projection | Knowledge Server | — | Computes normalized chunk hashes, determines delta against previous active snapshot, builds candidate. |
| Atomic Snapshot Activation & History | Knowledge Server | Browser / Client (Cache) | Server atomically promotes candidate to active; client caches last-known state in IndexedDB for offline UI. |
| Document-Level & Set-Level Status Badges | Browser / Client (React UI) | — | Displays six primary states in Notes workspace and set management drawer. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 5.12.5 | Knowledge Server HTTP runtime | [VERIFIED: npm registry] Node 24 native ESM, ultra-low overhead (<15MB RAM), built-in JSON schema validation, first-class async route handling. |
| @fastify/cors | 11.3.0 | CORS headers & origin validation | [VERIFIED: npm registry] Official Fastify plugin for strict cross-origin control between Vite/PWA and server daemon. |
| unified | 11.0.5 | Syntax tree processing engine | [VERIFIED: npm registry] Modern ESM AST ecosystem; strictly typed, composable pipeline standard across JavaScript ecosystem. |
| remark-parse | 11.0.0 | Markdown to MDAST compiler | [VERIFIED: npm registry] Produces compliant MDAST syntax tree with exact node line, column, and character offset positions. |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown plugin | [VERIFIED: npm registry] Parses GFM tables, task lists, and strikethroughs natively without custom regex hacks. |
| mdast-util-to-string | 4.0.0 | AST text extraction helper | [VERIFIED: npm registry] Extracts raw plaintext from headings and AST nodes safely without markup artifacts. |
| zod | 4.6.5 | Schema validation | [VERIFIED: codebase] Already installed in PlannerMate; ensures strict type boundaries for API payloads and DB models. |
| dotenv | 18.0.6 | Environment variable loader | [VERIFIED: npm registry] Standard zero-dependency env loader for server port, host, and token configuration. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fake-indexeddb | 6.2.5 | IndexedDB test shim | [VERIFIED: codebase] Already installed; used for Vitest tests of Dexie Schema V10 migrations and set repos. |
| dayjs | 1.11.23 | ISO timestamp & duration formatting | [VERIFIED: codebase] Already installed; formats attempt start times and elapsed durations. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fastify 5 | Express 4/5 | Express has higher latency, lacks native modern ESM/TypeScript ergonomics, and requires ad-hoc schema validation plugins. |
| remark-parse | Custom Regex Slicer | Regex fails catastrophically on nested code fences, multiline tables, escaped pipes, and Unicode offsets. |
| remark-parse | markdown-it | markdown-it produces tokens, not a unified AST tree, making hierarchical section and heading traversal more complex. |
| Web Crypto API (Client) | crypto-js | Browser native `crypto.subtle.digest('SHA-256')` is built-in, fast, and eliminates external bundle bloat. |

**Installation:**
```bash
# In knowledge-server/
npm init -y
npm install fastify@^5.12.5 @fastify/cors@^11.3.0 unified@^11.0.5 remark-parse@^11.0.0 remark-gfm@^4.0.1 mdast-util-to-string@^4.0.0 zod@^4.6.5 dotenv@^18.0.6
npm install -D typescript@^7.0.2 tsx@^4.23.15 @types/node@^24.0.0 vitest@^5.0.2
```

## Package Legitimacy Audit

Audited via `slopcheck` v0.6.1 and verified against npm registry:

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| fastify | npm | 8 yrs | ~5.8M/wk | github.com/fastify/fastify | [OK] | Approved |
| @fastify/cors | npm | 7 yrs | ~2.1M/wk | github.com/fastify/fastify-cors | [OK] | Approved |
| unified | npm | 9 yrs | ~34M/wk | github.com/unifiedjs/unified | [OK] | Approved |
| remark-parse | npm | 9 yrs | ~28M/wk | github.com/remarkjs/remark | [OK] | Approved |
| remark-gfm | npm | 5 yrs | ~16M/wk | github.com/remarkjs/remark-gfm | [OK] | Approved |
| mdast-util-to-string | npm | 8 yrs | ~48M/wk | github.com/syntax-tree/mdast-util-to-string | [OK] | Approved |
| dotenv | npm | 11 yrs | ~42M/wk | github.com/motdotla/dotenv | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[ Local User Action: Publish Document Set ]
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Change Preview & Hash Delta Calculation                 │
│    - Compare Note.updatedAt & local hash against snapshot   │
│    - Classify: Added, Changed, Removed, Unchanged           │
│    - If removals detected -> Prompt unpublish confirmation  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Deterministic Client-Side DLP Scan (Pre-Send Gate)       │
│    - Scan user strings: Title, Body, Tags, Set Name         │
│    - Categories: PAN (Luhn), CVV, PIN, HSM, Creds, PII      │
│    - Findings present?                                      │
│      ├─ NO  ──► Proceed directly to step 4                  │
│      └─ YES ──► Step 3: Confirmation Dialog                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. DLP Warning & Fresh Confirmation Modal                   │
│    - Display masked excerpt: "411111••••1111" + line/col    │
│    - Cancelled ──► ABORT: Zero network requests sent        │
│    - Confirmed ──► Store content-free audit record          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Freeze Snapshot & POST /api/v1/sets/:setId/attempts      │
│    - Freeze immutable Note bodies in memory payload         │
│    - Headers: Authorization: Bearer <sessionToken>          │
│               X-Attempt-Key: <uniqueUuid>                   │
│    - Server responds with 202 Accepted: { attemptId }       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Asynchronous Server Ingestion Pipeline                  │
│    - Check active attempt for set (reject if conflict)      │
│    - Parse Markdown via unified + remark-parse + remark-gfm │
│    - Chunking: Section-first (H2/H3), Preamble (H1)         │
│    - Atomic blocks: Tables, Code/SQL, Diagrams              │
│    - Check Hard Limit: Any atomic block > 50k chars?        │
│      ├─ YES ──► Mark attempt FAILED, leave active snapshot  │
│      └─ NO  ──► Continue                                    │
│    - Normalize newlines (CRLF->LF) & compute SHA-256 hashes │
│    - Diff against Active Snapshot: mutate only changed      │
│    - Build Candidate Snapshot                               │
│    - All docs succeed?                                      │
│      ├─ NO  ──► Attempt FAILED, previous active remains     │
│      └─ YES ──► Atomically promote Candidate to ACTIVE      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Client Polling & Status Reconciliation                   │
│    - Poll GET /api/v1/attempts/:attemptId (backoff 1s..5s)  │
│    - Disconnect? -> State remains "Publishing" (warn banner)│
│    - On Terminal Success -> Update local DB attempt cache   │
│    - Update Badges: Set = "In sync", Docs = "Published"     │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
task-management/
├── src/
│   ├── types/
│   │   ├── models.ts                    # Extends with DocumentSet, PublishAttempt, PublishedSnapshot
│   │   └── dlp.ts                       # DlpFinding, DlpCategory, DlpAuditRecord
│   ├── db/
│   │   ├── schema.ts                    # SCHEMA_V10 definitions
│   │   ├── index.ts                     # Dexie v10 migration upgrade
│   │   └── repositories/
│   │       ├── documentSetRepo.ts       # Document set CRUD & folder-snapshot creation
│   │       └── publishAttemptRepo.ts    # Local bounded attempt history (max 10)
│   ├── services/
│   │   ├── dlp/
│   │   │   ├── dlpScanner.ts            # Client-side regex rules + Luhn algorithm
│   │   │   ├── dlpMasker.ts             # Excerpt & token masking utilities
│   │   │   └── dlpAudit.ts              # Content-free audit metadata recording
│   │   └── knowledge/
│   │       ├── knowledgeClient.ts       # HTTP gateway for /api/v1 routes + attemptKey
│   │       ├── knowledgeConfig.ts       # Server base URL & session-token state
│   │       └── changePreview.ts         # Delta calculator (added, changed, removed, unchanged)
│   ├── components/
│   │   └── knowledge/
│   │       ├── DocumentSetDrawer.tsx    # Document set management, create, edit members
│   │       ├── PublishPreviewModal.tsx  # Pre-send change breakdown + removal warning
│   │       ├── DlpWarningModal.tsx      # Masked findings review & fresh confirmation
│   │       ├── AttemptHistoryList.tsx   # 10 recent attempts with duration/metrics
│   │       └── DocPublishBadge.tsx      # Compact badge in Docs workspace & DocEditorPane
│   └── views/
│       └── NotesView.tsx                # Integrates set entry point and DocPublishBadge
│
└── knowledge-server/                    # Companion ingestion daemon
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── server.ts                    # Fastify app bootstrap & CORS configuration
    │   ├── routes/
    │   │   ├── attempts.ts              # POST /api/v1/sets/:id/attempts, GET /attempts/:id
    │   │   └── snapshots.ts             # GET /api/v1/sets/:id/snapshot
    │   ├── parser/
    │   │   ├── markdownAst.ts           # Unified + remark-parse + remark-gfm parser
    │   │   ├── sectionChunker.ts        # Section-first splitting (H2/H3, preamble, 6k target)
    │   │   └── atomicBlockValidator.ts  # Hard 50k limit enforcement & error generation
    │   ├── indexing/
    │   │   ├── chunkHasher.ts           # CRLF normalization + SHA-256 chunk/doc hashing
    │   │   ├── incrementalProjector.ts  # Delta projection against active snapshot
    │   │   └── snapshotStore.ts         # Atomic candidate promotion & rollback-by-retention
    │   └── types/
    │       └── protocol.ts              # Shared API contract schemas & error envelopes
    └── tests/
        ├── fixtures/                    # Process 60000006 pilot markdown files
        ├── sectionChunker.test.ts       # AST chunk verification against tables/diagrams
        ├── atomicBlock.test.ts          # 50k rejection verification
        └── incrementalHasher.test.ts    # Hash stability across CRLF and line moves
```

### Pattern 1: Deterministic Client-Side DLP Pipeline with Masked Findings & Luhn Validation
**What:** Scans text strings for sensitive data categories before transport. Matches are evaluated in deterministic priority order:
1. `PAN`: 13–19 digits validated with Luhn algorithm (`4[0-9]{12}(?:[0-9]{3})?`, `5[1-5][0-9]{14}`, etc.).
2. `CVV`: 3–4 digits adjacent to CVV/CVC/CID keywords.
3. `PIN`: 4–6 digit clear PIN or 16–32 char PIN blocks.
4. `HSM_KEY`: Hex keys associated with ZPK, LMK, ZMK, BDK, PEK, etc.
5. `CREDENTIAL`: Passwords, Bearer tokens, private keys (`-----BEGIN PRIVATE KEY-----`).
6. `PII`: Vietnamese Citizen Identity Card (CCCD: 12 digits starting with valid prefix), email addresses, phone numbers.

**When to use:** In `src/services/dlp/dlpScanner.ts` on all outbound user fields.
```typescript
// Luhn check for PAN validation
export function isValidLuhn(digitsOnly: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let n = parseInt(digitsOnly.charAt(i), 10);
    if (isNaN(n)) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
```

### Pattern 2: Section-First MDAST Block Chunking with Atomic Bounds
**What:** Traverses Markdown AST tree:
- Nodes before first `heading` with depth 2 or 3 form the **Preamble Chunk** (including document title `# H1`).
- Each `heading` with depth 2 or 3 initiates a new semantic section chunk.
- Headings with depth 4–6 do not split; they append to the active section's heading path (e.g. `["Credits calculation", "Sub-process A"]`).
- Atomic blocks (`table`, `code` fence containing SQL or ASCII diagrams, `blockquote`) cannot be divided across chunks.
- If a section exceeds the target 6,000 chars, it may split **only** at AST block boundaries (between paragraphs or list items).
- If an individual atomic block exceeds 50,000 characters, it triggers rejection:
```typescript
if (isAtomicNode(node) && nodeContent.length > HARD_ATOMIC_BLOCK_LIMIT) {
  throw new OversizedAtomicBlockError({
    line: node.position?.start.line ?? 0,
    column: node.position?.start.column ?? 0,
    length: nodeContent.length,
    message: `Khối dữ liệu không thể chia nhỏ (dòng ${node.position?.start.line}) vượt quá giới hạn an toàn 50,000 ký tự. Vui lòng chia nhỏ tài liệu nguồn.`
  });
}
```

### Pattern 3: SHA-256 Normalized Chunk Identity vs Evidence Occurrence Identity
**What:** Distinguishes content identity from location/occurrence identity.
- Normalize chunk text: canonicalize `\r\n` and `\r` to `\n`. Leave all indentation, spaces, and punctuation intact.
- Calculate `contentHash = sha256(normalizedText)`.
- Reusable chunk identity: `chunkKey = sha256("${documentUuid}:${contentHash}")`.
- If the same section appears twice in a document, both retain independent `occurrenceId` (e.g. `uuid()`), exact snapshot character offsets `[startOffset, endOffset]`, and heading path, while sharing `contentHash`.

### Pattern 4: Two-Phase Snapshot Activation with Rollback-by-Retention
**What:** State machine ensuring candidate snapshot activates only when all documents in the set parse and project successfully:
1. Candidate snapshot created with `status: 'candidate'`.
2. As documents are parsed and chunks projected, any failure immediately updates candidate to `status: 'failed'` with structured error details.
3. Active snapshot remains untouched and serves read queries.
4. When all documents succeed, a single atomic pointer swap promotes candidate to `status: 'active'`.

### Anti-Patterns to Avoid
- **Publish-on-save:** Auto-save occurs every 500ms; publishing must remain strictly user-initiated.
- **Regex-based Markdown slicing:** Slicing raw strings by regex breaks tables with pipes, fenced code with backticks, and diagrams.
- **Silent chunk truncation:** Truncating an oversized table drops bank financial evidence. Reject with source line and split guidance instead.
- **Storing full matched values in audit:** Storing unmasked PAN or passwords in audit records defeats the purpose of DLP. Store only counts, categories, and hashes.
- **Interpreting network timeout as server failure:** If client loses connection while polling an attempt, server may still be indexing. Keep state as `Publishing` with warning substatus until server responds.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown AST parsing | Custom Regex line parser | `unified` + `remark-parse` + `remark-gfm` | Markdown tables, fenced blocks, escaped characters, and nested lists have hundreds of edge cases; AST provides exact node offsets. |
| Ingestion Server HTTP | Raw Node `http.createServer` | Fastify 5 + `@fastify/cors` | Fastify provides typed routing, request validation, structured error handling, and robust CORS management. |
| Client Cryptographic Hashing | Custom SHA-256 JS library | Web Crypto API `crypto.subtle.digest` | Native browser API is hardware-accelerated, timing-attack safe, and zero-bundle weight. |
| Server Cryptographic Hashing | Custom hashing | Node.js `node:crypto` (`createHash`) | Built into Node runtime, highly optimized. |
| Client Schema Validation | Custom if/else validators | Zod 4.6.5 (`z.object(...)`) | Already used throughout PlannerMate for model boundaries and safe migrations. |

## Common Pitfalls

### Pitfall 1: CRLF vs LF Newline Mismatch in Chunk Hashing
**What goes wrong:** Files edited on Windows have `\r\n`, while files edited in browser/Mac have `\n`. A document re-saved without content changes gets different chunk hashes, triggering false republishes.
**Why it happens:** Raw string hashing includes carriage return bytes `0x0D`.
**How to avoid:** Normalize newlines before hashing: `text.replace(/\r\n|\r/g, '\n')`.
**Warning signs:** Unchanged documents show as `Changed` in preview.

### Pitfall 2: Offset Drift Between Normalized and Raw Source
**What goes wrong:** Exact chunk slice reconstruction `source.slice(startOffset, endOffset)` becomes offset by N characters if offsets are calculated after newline normalization.
**Why it happens:** Replacing `\r\n` with `\n` shortens the string length by 1 character per line.
**How to avoid:** `remark-parse` provides node positions against the **original raw source string**. Record these raw byte/character offsets directly against the immutable snapshot. Use normalization **only** for the SHA-256 hash calculation.

### Pitfall 3: Splitting Through Atomic Blocks (Tables & Code)
**What goes wrong:** An oversized section is naively split at character 6,000, cutting through a Markdown table row or SQL block.
**Why it happens:** Naive chunkers slice strings by length instead of AST block boundaries.
**How to avoid:** The AST chunker only breaks between top-level sibling AST nodes. An atomic node (`table`, `code`, `blockquote`) is never divided.

### Pitfall 4: Memory Leak / Key Exposure via Session Token
**What goes wrong:** Knowledge server bearer token is written to `localStorage` or IndexedDB settings and gets exported in backup files.
**Why it happens:** Treating server tokens like normal settings.
**How to avoid:** Store session token strictly in React memory state (or session-only closure). Explicitly filter it in `isSafeBackupSetting()`.

### Pitfall 5: Concurrent Publish Race Condition
**What goes wrong:** User clicks publish twice or two tabs attempt to publish the same set simultaneously, corrupting candidate snapshots.
**Why it happens:** Missing set-level locking on server and missing idempotent attempt keys.
**How to avoid:** Client generates a unique `attemptKey` per publish click. Server enforces one active attempt per set (`SET_PUBLISH_IN_PROGRESS`) and deduplicates by `attemptKey`.

## Code Examples

### 1. Deterministic Client DLP Scanner & Masking
```typescript
// Source: src/services/dlp/dlpScanner.ts
import { isValidLuhn } from './luhn';

export interface DlpFinding {
  id: string;
  category: 'PAN' | 'CVV' | 'PIN' | 'HSM_KEY' | 'CREDENTIAL' | 'PII';
  documentId: string;
  line: number;
  column: number;
  maskedExcerpt: string;
}

export function scanTextForDlp(text: string, documentId: string): DlpFinding[] {
  const findings: DlpFinding[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? '';

    // 1. PAN check: 13 to 19 digits with optional spaces/dashes
    const panRegex = /\b(?:\d[ -]?){13,19}\b/g;
    let match: RegExpExecArray | null;
    while ((match = panRegex.exec(line)) !== null) {
      const raw = match[0].replace(/[\s-]/g, '');
      if (isValidLuhn(raw)) {
        findings.push({
          id: crypto.randomUUID(),
          category: 'PAN',
          documentId,
          line: lineIdx + 1,
          column: match.index + 1,
          maskedExcerpt: maskPan(raw),
        });
      }
    }

    // 2. CVV check: 3-4 digits following cvv/cvc keywords
    const cvvRegex = /(?:\b(?:cvv\d?|cvc\d?|cid|security\s*code)\b[\s:=]+)([0-9]{3,4})\b/gi;
    while ((match = cvvRegex.exec(line)) !== null) {
      findings.push({
        id: crypto.randomUUID(),
        category: 'CVV',
        documentId,
        line: lineIdx + 1,
        column: match.index + 1,
        maskedExcerpt: 'CVV: •••',
      });
    }

    // 3. Credentials check: private keys or passwords
    if (/-----BEGIN [A-Z ]+ PRIVATE KEY-----/.test(line)) {
      findings.push({
        id: crypto.randomUUID(),
        category: 'CREDENTIAL',
        documentId,
        line: lineIdx + 1,
        column: 1,
        maskedExcerpt: '-----BEGIN PRIVATE KEY [REDACTED]-----',
      });
    }
  }

  return findings;
}

function maskPan(pan: string): string {
  if (pan.length < 10) return '••••';
  const prefix = pan.slice(0, 6);
  const suffix = pan.slice(-4);
  const dots = '•'.repeat(Math.max(4, pan.length - 10));
  return `${prefix}${dots}${suffix}`;
}
```

### 2. AST Markdown Section-First Chunker
```typescript
// Source: knowledge-server/src/parser/sectionChunker.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString } from 'mdast-util-to-string';
import type { Root, RootContent, Heading } from 'mdast';

export interface AstEvidenceChunk {
  chunkIndex: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  rawContent: string;
  normalizedContentHash: string;
}

const TARGET_CHUNK_SIZE = 6000;
const HARD_ATOMIC_BLOCK_LIMIT = 50000;

export function parseMarkdownToChunks(rawMarkdown: string, documentId: string): AstEvidenceChunk[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(rawMarkdown) as Root;
  const chunks: AstEvidenceChunk[] = [];
  
  let currentHeadingPath: string[] = [];
  let currentNodes: RootContent[] = [];
  let currentStartOffset = 0;
  let currentStartLine = 1;

  for (const node of tree.children) {
    // Check hard limit on atomic blocks
    if (node.type === 'table' || node.type === 'code' || node.type === 'blockquote') {
      const nodeLength = (node.position?.end.offset ?? 0) - (node.position?.start.offset ?? 0);
      if (nodeLength > HARD_ATOMIC_BLOCK_LIMIT) {
        throw new Error(
          `Khối ${node.type} vượt quá giới hạn an toàn 50,000 ký tự tại dòng ${node.position?.start.line}.`
        );
      }
    }

    // Check section boundary (H2 or H3)
    if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) {
      if (currentNodes.length > 0) {
        flushChunk();
      }
      const headingText = toString(node).trim();
      if (node.depth === 2) {
        currentHeadingPath = [headingText];
      } else {
        currentHeadingPath = [currentHeadingPath[0] ?? '', headingText].filter(Boolean);
      }
      currentStartOffset = node.position?.start.offset ?? 0;
      currentStartLine = node.position?.start.line ?? 1;
    }

    currentNodes.push(node);
  }

  if (currentNodes.length > 0) {
    flushChunk();
  }

  function flushChunk() {
    const first = currentNodes[0];
    const last = currentNodes[currentNodes.length - 1];
    const start = first?.position?.start.offset ?? currentStartOffset;
    const end = last?.position?.end.offset ?? rawMarkdown.length;
    const slice = rawMarkdown.slice(start, end);
    const normalized = slice.replace(/\r\n|\r/g, '\n');

    chunks.push({
      chunkIndex: chunks.length,
      headingPath: [...currentHeadingPath],
      startLine: first?.position?.start.line ?? currentStartLine,
      endLine: last?.position?.end.line ?? currentStartLine,
      startOffset: start,
      endOffset: end,
      rawContent: slice,
      normalizedContentHash: computeSha256(normalized),
    });
    currentNodes = [];
  }

  return chunks;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Naive character sliding window (e.g. 1000 chars + 200 overlap) | AST section-first chunking with atomic blocks | Modern RAG (2024+) | Preserves syntax integrity of SQL blocks, tables, and flowcharts without corrupting syntax or splitting rows. |
| Mandatory DLP rejection | Warning + explicit fresh confirmation | 2026-10-08 (SPEC amendment) | Fits internal organization network topology while maintaining zero trust bypass. |
| Persistent server sync on save | Manual document-set publish | Phase 16 architecture | Guarantees local-first offline isolation; local edits remain canonical and unblocked. |
| Full repository re-indexing | SHA-256 chunk-level incremental projection | Modern GraphRAG | Re-indexing takes milliseconds when only 1 section changes in a 50-page document. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Knowledge Server daemon runs on `http://127.0.0.1:3001` or configurable port | Architecture | Minimal; user-configurable base URL handles any local/remote host. |
| A2 | Session bearer token is entered or generated once per user session | Security | None; session tokens can be persisted in memory or securely generated. |

## Resolved Questions

1. **RESOLVED — Knowledge Server deployment model:** Use an optional, independently deployed Node.js daemon for both Web/PWA and Tauri clients. PlannerMate remains static/offline and fully usable when daemon is absent or unreachable. Phase 16 accesses daemon over configured HTTP(S); it does not start, supervise, bundle, or require the daemon. Tauri sidecar packaging is deferred beyond Phase 16 and is not planned here.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Fastify daemon & build | ✓ | 24 LTS | — |
| npm | Package manager | ✓ | 12.x | — |
| Python | slopcheck & tools | ✓ | 3.14.6 | slopcheck marked [ASSUMED] |
| Vitest | Unit & Integration testing | ✓ | 5.0.2 | — |
| Web Crypto API | Client SHA-256 hashing | ✓ | Browser / Node native | — |
| Fastify daemon port | HTTP API v1 | ✓ | Port 3001 configurable | Custom port setting |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- tests/knowledge` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGEST-01 | Document set creation from folder, stable UUID membership across folder moves | unit | `npm test -- tests/knowledge/documentSetRepo.test.ts` | ❌ Wave 0 |
| INGEST-02 | DLP detection of PAN (Luhn), CVV, PIN, HSM keys, credentials, PII with masked output | unit | `npm test -- tests/knowledge/dlpScanner.test.ts` | ❌ Wave 0 |
| INGEST-02 | Fresh confirmation enforcement; zero network calls when cancelled | integration | `npm test -- tests/knowledge/publishDlpGate.test.ts` | ❌ Wave 0 |
| INGEST-03 | Lossless AST evidence chunking of pilot corpus 60000006 with atomic tables & diagrams | integration | `npm test -- tests/knowledge/astChunker.test.ts` | ❌ Wave 0 |
| INGEST-03 | Rejection of atomic blocks exceeding 50,000 characters | unit | `npm test -- tests/knowledge/atomicLimit.test.ts` | ❌ Wave 0 |
| INGEST-04 | Stable SHA-256 incremental projection; unchanged chunks have zero mutations | unit | `npm test -- tests/knowledge/incrementalHasher.test.ts` | ❌ Wave 0 |
| INGEST-05 | Set and document publish status states (6 states) and bounded 10-attempt history | unit | `npm test -- tests/knowledge/publishStatus.test.ts` | ❌ Wave 0 |
| QUAL-04 | Local Docs CRUD and BM25 search remain fully functional when server is offline | integration | `npm test -- tests/knowledge/offlineIsolation.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- tests/knowledge`
- **Per wave merge:** `npm test`
- **Phase gate:** Full test suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/knowledge/documentSetRepo.test.ts` — covers INGEST-01 (Dexie schema V10, set CRUD, folder snapshot)
- [ ] `tests/knowledge/dlpScanner.test.ts` — covers INGEST-02 (Luhn PAN, CVV, PIN, HSM, Creds, PII rules, masking)
- [ ] `tests/knowledge/astChunker.test.ts` — covers INGEST-03 (unified/remark-parse section chunking against `60000006` fixtures)
- [ ] `tests/knowledge/incrementalHasher.test.ts` — covers INGEST-04 (SHA-256 delta calculation, CRLF normalization)
- [ ] `tests/knowledge/publishStatus.test.ts` — covers INGEST-05 (6 states, 10-attempt bounded history)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session-only Bearer token in HTTP header for `/api/v1` routes; token never persisted. |
| V3 Session Management | no | Token is ephemeral personal daemon secret; no multi-user session state. |
| V4 Access Control | yes | Daemon listens on loopback/private host with strict CORS origin check. |
| V5 Input Validation | yes | Zod schema validation on all incoming attempt payloads and Dexie models. |
| V6 Cryptography | yes | Web Crypto API / Node `crypto` SHA-256; Luhn algorithm for PAN check. |
| V8 Data Protection | yes | Pre-send DLP scan; masked findings; zero sensitive excerpts or raw secrets in audit metadata. |

### Known Threat Patterns for Ingestion Daemon

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sensitive banking data egress | Information Disclosure | Pre-send client DLP scan with fresh confirmation modal before transmission. |
| Token exposure in backups | Information Disclosure | Exclude session token from IndexedDB, settings repo, and backup export (`UNSAFE_OR_EPHEMERAL_SETTING_KEYS`). |
| Ingestion payload tampering / MITM | Tampering | HTTPS / local loopback transport with SHA-256 snapshot integrity validation. |
| Malicious AST payload DoS | Denial of Service | Hard atomic-block limit (50,000 characters) rejects oversized nodes immediately. |
| Cross-site script injection via finding | Tampering | Sanitize and escape all DLP finding displays using Ant Design typography. |

## Sources

### Primary (HIGH confidence)
- Official Fastify documentation (`fastify.dev`) - route handlers, schema validation, CORS setup.
- Official unified / remark documentation (`unifiedjs.com`) - `remark-parse`, `remark-gfm`, node positions.
- MDN Web Crypto API (`developer.mozilla.org`) - `crypto.subtle.digest` SHA-256 implementation.
- Project specifications: `16-SPEC.md` and `16-CONTEXT.md`.

### Secondary (MEDIUM confidence)
- Pilot corpus fixtures: `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`.
- Existing PlannerMate repositories: `src/db/schema.ts`, `src/utils/bm25.ts`, `src/services/backup/exportBackup.ts`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Fastify 5 and unified 11 are industry-standard, verified on npm registry and slopchecked.
- Architecture: HIGH - Fully aligned with locked D-01..D-29 decisions and SPEC.md acceptance criteria.
- Pitfalls: HIGH - Documented exact edge cases for CRLF newline normalization and atomic block integrity.

**Research date:** 2026-10-08
**Valid until:** 2026-11-08 (30 days)
