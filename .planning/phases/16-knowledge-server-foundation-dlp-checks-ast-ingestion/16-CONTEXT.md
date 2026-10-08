# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 16 establishes an optional knowledge-server publishing pipeline for selected PlannerMate Markdown. It defines stable document sets, pre-send sensitive-data review, immutable asynchronous publish attempts, lossless AST evidence chunks, SHA-256 incremental candidate projection, atomic active-snapshot activation, and inspectable local status. Local Markdown remains canonical and unchanged by publishing; local Docs and BM25 search remain usable when the knowledge server is unavailable.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `16-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `16-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** Optional knowledge-server foundation; stable UUID-backed document sets; folder-snapshot set creation and manual membership adjustment; client-side DLP scan, masked findings, fresh confirmation, and content-free audit metadata; server-side AST chunking; SHA-256 document/chunk comparison; atomic candidate activation; set/document status and bounded attempt history; acceptance verification against process `60000006` fixtures.

**Out of scope (from SPEC.md):** Retrieval indexes and fusion; graph/ontology extraction; assistant answer generation; whole card-system corpus; arbitrary filesystem publishing; automatic publish-on-save; live folder-query membership; persistent DLP trust bypass; local Markdown mutation/deletion; interactive graph editing.

</spec_lock>

<decisions>
## Implementation Decisions

### Existing publish-flow decisions retained
- **D-01:** `Document set` is the primary publish unit. A set stores an explicit ordered membership snapshot of stable document UUIDs; folder membership is used only to initialize a set.
- **D-02:** Local edits mark affected documents and sets as `Local changes`; publishing remains manual and never runs from document auto-save.
- **D-03:** Removing previously published membership appears in change preview and requires confirmation before server unpublishing. Local Markdown is never deleted.
- **D-04:** Pre-send preview distinguishes added, changed, removed, and unchanged documents/chunks.

### Server contract
- **D-05:** Configure one user-entered knowledge-server `base URL`. Client derives fixed versioned routes under `/api/v1`; do not expose separate endpoint fields or add discovery-manifest machinery in Phase 16.
- **D-06:** Use an `Async attempt resource`: after preview, DLP scan, and any required confirmation, client performs one content-bearing POST, receives `attemptId`, then polls that attempt to a terminal state.
- **D-07:** Protect content-bearing API routes with HTTPS, a session-only `Bearer token`, and an exact CORS origin allow-list. Web/PWA token stays in memory and never enters IndexedDB, localStorage, logs, backups, or deployed configuration.
- **D-08:** Knowledge server is authoritative for remote attempt, candidate, and active-snapshot state. IndexedDB stores last-known remote state for offline inspection and reconciles from server when connectivity returns.
- **D-09:** Client generates a unique `attemptKey`; retrying the initial POST with the same key is idempotent and returns the same server attempt rather than starting duplicate work.

### Publish concurrency and recovery
- **D-10:** Each attempt freezes an immutable input snapshot at confirmation time. User may continue editing local documents while publish runs; later edits remain `Local changes` and belong to a new preview, DLP scan, and attempt.
- **D-11:** Permit only one active attempt per document set. Server rejects a second attempt for that set with structured `SET_PUBLISH_IN_PROGRESS`; different sets may publish concurrently.
- **D-12:** Phase 16 does not support server-side cancellation after the content-bearing POST is accepted. Closing UI only stops polling; server attempt continues to a terminal state and reconciles on reopen.
- **D-13:** Connection loss never implies server failure. Keep primary state `Publishing` with a connection-warning substatus such as “Mất kết nối — chưa xác định kết quả”; reconcile by `attemptId` when online. Only an explicit terminal server result becomes `Failed`.
- **D-14:** Candidate snapshot activates only after every document completes successfully. Any failure keeps prior active snapshot unchanged and records failed candidate details.

### DLP baseline
- **D-15:** Keep Phase 16 DLP deliberately simple, deterministic, and client-side. Use PAN pattern plus Luhn validation and clear keyword/context rules for CVV, PIN/PIN block, HSM keys, credentials, and customer PII.
- **D-16:** Do not add ML/NLP classification, entropy scoring, custom rule editors, allow-lists, trusted-document rules, or persistent finding suppression. False positives are handled by masked warning plus fresh explicit confirmation.
- **D-17:** Scan every outbound user-authored string before any content-bearing request: document title, Markdown body, tags, document-set name, and any other user-entered text in payload. UUIDs, hashes, timestamps, and generated protocol metadata do not require scanning.
- **D-18:** Rule set has a fixed version for repeatable tests and audit correlation. Audit stores version, timestamp, document IDs, categories/counts, and content hashes only—never matched values or excerpts.
- **D-19:** Findings display category, document, line/column when applicable, and masked context. Collapse overlapping matches for the same source range into one displayed finding, preferring the more specific category; planner may choose exact deterministic precedence.

### AST chunk semantics
- **D-20:** Content before first H2/H3 becomes a preamble chunk, including H1 when present. H2/H3 open normal semantic sections. H4–H6 remain within nearest H2/H3 parent and contribute to heading path rather than opening top-level chunks.
- **D-21:** A document without H2/H3 uses one synthetic section, then splits at AST block boundaries only if over target size. Synthetic structure is server metadata and never mutates source Markdown.
- **D-22:** Hash normalization canonicalizes `CRLF` and `CR` to `LF` only. Preserve all other spaces, blank lines, case, and Markdown syntax because whitespace can be semantic in tables, code, SQL, and ASCII diagrams.
- **D-23:** Keep exact raw source slices and offsets against the immutable published snapshot even though hashes use newline normalization. Source ranges must reconstruct snapshot content exactly.
- **D-24:** Separate reusable content identity from evidence occurrence identity. `contentHash` supports unchanged-content reuse; duplicate occurrences in one document each retain independent `occurrenceId`, heading path, and exact source range. Never deduplicate away evidence occurrences.
- **D-25:** Use versioned server constants: target chunk size `6,000 characters`; hard atomic-block limit `50,000 characters`. No user-facing setting. Atomic blocks may exceed target but must reject the document when over hard limit; never truncate.
- **D-26:** Record `chunkingPolicyVersion` with each snapshot so future policy changes can trigger explicit reprojection rather than silently mixing chunk semantics.

### Publish and status presentation retained
- **D-27:** Primary set states remain exactly `Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, and `Failed`. Connectivity uncertainty is subordinate text/banner, not a seventh primary state.
- **D-28:** Show set status and history in document-set management; show compact per-document badges in existing Docs workspace.
- **D-29:** Keep 10 newest attempts per set with timestamp, duration, changed/unchanged/removed counts, warning count, and error summary. Store no document content or DLP excerpt in history.

### Claude's Discretion
- Exact deterministic precedence for overlapping DLP categories and exact masked-context length.
- Poll interval/backoff details, request/response field names, structured error envelope, and retry ceiling, provided decisions above hold.
- Exact visual treatment and accessible colors for statuses, following existing Ant Design and Vietnamese-copy patterns.
- Parser/library choice and exact source-offset convention, provided chunks reconstruct exact published snapshot slices and tests cover Unicode plus CRLF/LF handling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked phase contract
- `.planning/phases/16-knowledge-server-foundation-dlp-checks-ast-ingestion/16-SPEC.md` — Locked requirements, boundaries, constraints, and acceptance criteria; MUST read first.

### Milestone scope
- `.planning/PROJECT.md` — Markdown-canonical constraint, optional-server isolation, offline behavior, pilot scope, and sensitive-data policy.
- `.planning/REQUIREMENTS.md` — `INGEST-01` through `INGEST-05` and milestone quality constraints.
- `.planning/ROADMAP.md` — Phase 16 goal, dependencies, success criteria, and boundaries from Phases 17–20.

### Pilot corpus
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/README.md` — Entry point for pilot fixtures and representative headings, tables, fenced ASCII flow, exact identifiers, and identity collision context.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/00-sources.md` — Source/evidence fixture.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/01-wiring.md` — Structured wiring/config fixture.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/02-data-objects.md` — Table-heavy data-object fixture.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/03-call-chain.md` — Process flow and code/SQL fixture.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/04-cycles.md` — Cycle table and dispatch fixture.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/05-breadcrumbs.md` — Logs, SQL, and diagnostic fixture.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/models.ts` — `Note.id` is stable UUID; `Note.body` is canonical Markdown; `updatedAt` supports local-change comparison.
- `src/db/schema.ts` — Current Dexie schema ends at `SCHEMA_V9`; Phase 16 needs additive document-set and publish-metadata tables.
- `src/db/repositories/noteRepo.ts` — Validated note CRUD and folder queries provide immutable publish snapshot inputs without modifying canonical content.
- `src/views/NotesView.tsx` — Existing three-column Docs workspace, folder snapshot selection, Ant Design modals, and Vietnamese UI copy are integration anchors.
- `src/components/notes/DocEditorPane.tsx` — Existing 500 ms auto-save and editor status surfaces can host compact publish badges without coupling save to publish.
- `src/utils/bm25.ts` — Local BM25 remains independent offline fallback; knowledge-server availability must not enter this path.

### Established Patterns
- Domain records use stable client-generated UUIDs and ISO timestamps in IndexedDB.
- Dexie is local source of truth for canonical app data; reactive reads use `useLiveQuery`.
- Markdown editor auto-saves after 500 ms. Publish must use frozen copies and never intercept or block local save.
- Ant Design and Vietnamese user-facing copy are established UI conventions.
- Current app has no knowledge-server client or Markdown AST parser; research must choose minimum dependencies and isolate server package/runtime from static PWA build.

### Integration Points
- Add schema beyond `SCHEMA_V9` for document sets, ordered memberships, last-known remote status, per-document published hashes, and bounded local attempt cache.
- Add knowledge-server settings and session-token input without persisting credentials in local domain data or backup.
- Add set management and status/history around `src/views/NotesView.tsx`; add compact badges to document list/editor surfaces.
- Keep client orchestration separate from `updateNote` and `DocEditorPane` auto-save callbacks.
- Server owns AST parsing, hashes, candidate/active snapshot state, idempotent attempt handling, and exact projection diff. PlannerMate owns selection, preview, DLP scan/confirmation, and local cache.

</code_context>

<specifics>
## Specific Ideas

- Example server configuration: base URL `https://knowledge.internal.example`; fixed routes under `/api/v1`.
- Example recovery: POST response is lost, client retries same `attemptKey`, server returns original `attemptId` rather than creating duplicate candidate.
- Example mid-publish edit: attempt publishes hash `H1`; user edits local document to `H2`; attempt may succeed while UI correctly remains `Local changes`.
- Example connectivity text: primary badge `Publishing`, secondary message `Mất kết nối — chưa xác định kết quả`.
- Example duplicate evidence: identical status tables under two headings share content representation but retain separate occurrence ranges and heading paths.
- DLP is compliance baseline, not a primary product area; keep implementation deterministic and small.

</specifics>

<deferred>
## Deferred Ideas

- Manual active-snapshot rollback after activation — separate future capability if operational need emerges.
- Enterprise SSO/OIDC — add only if organization deployment requires centralized identity.
- Discovery manifest and multi-server capability negotiation — add only when multiple server implementations or API versions coexist.
- Advanced DLP with ML/NLP, entropy detection, editable rules, or approved allow-lists — add only if baseline proves inadequate.

</deferred>

---

*Phase: 16-Knowledge Server Foundation, DLP Checks & AST Ingestion*
*Context gathered: 2026-10-08*
