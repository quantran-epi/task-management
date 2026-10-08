# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion - Context

**Gathered:** 2026-10-08
**Status:** Context complete — requirement amendment applied before specification

<domain>
## Phase Boundary

Phase 16 establishes an optional knowledge-server publishing pipeline for selected PlannerMate Markdown. It defines document-set publishing, pre-ingestion sensitive-data checks, AST-based evidence chunks, SHA-256 incremental indexing, and user-visible publish/index status. Local Markdown remains canonical and unchanged by publishing; local Docs and BM25 search remain usable when the knowledge server is unavailable.

### Requirement amendment applied

DLP behavior changed from mandatory rejection to warning with explicit user override because the knowledge server runs inside the organization network rather than on the public Internet. Phase specification amended these artifacts before planning:

- `.planning/REQUIREMENTS.md` — `INGEST-02` and `QUAL-04`
- `.planning/ROADMAP.md` — Phase 16 summary, goal, success criteria 2–4, and Phase 20 success criterion 4
- `.planning/PROJECT.md` — sensitive-data constraint

Planning must follow amended warning, masking, pre-send scan, and fresh-confirmation semantics.

</domain>

<decisions>
## Implementation Decisions

### Publish flow
- **D-01:** `Document set` is the primary publish unit.
- **D-02:** User creates a set from a folder snapshot, then adjusts selected documents. The set stores stable document UUIDs, not a live folder query, so later folder moves do not silently change membership.
- **D-03:** Local edits after publish mark the affected document and set as `Local changes`; publishing remains manual. No publish-on-save.
- **D-04:** Removing a previously published document from a set produces a change preview and requires confirmation before unpublishing it from the server. Local Markdown is never deleted.

### DLP warning and override
- **D-05:** Pre-ingestion DLP scan remains required, but findings are warnings rather than hard rejection. User may explicitly override and continue because deployment is internal to the organization network.
- **D-06:** Every publish attempt with findings requires fresh confirmation. Do not persist trusted-document or trusted-finding bypass rules.
- **D-07:** Finding preview shows category, document, line/column, and masked excerpt/value. Never display the complete matched secret or sensitive value.
- **D-08:** An override records only timestamp, affected document IDs, finding categories/counts, and content hashes. Do not store matched values or excerpts in audit metadata.
- **D-09:** DLP scanning and confirmation happen before document content is sent to the knowledge server or any downstream indexing/embedding call.

### AST evidence chunks
- **D-10:** Chunk `section-first`: H2/H3 section is the normal semantic unit. Split an oversized section only at AST block boundaries.
- **D-11:** Markdown tables, fenced code/SQL blocks, and ASCII diagrams are atomic evidence blocks. Do not cut through a row or block. If one atomic block exceeds a hard safety limit, reject that document with exact location and guidance to split the source; never truncate evidence silently.
- **D-12:** Stable chunk identity derives from stable document UUID plus normalized chunk-content SHA-256 hash. Do not derive identity from line number, ordinal, or heading path alone.
- **D-13:** Each chunk carries heading path, start/end line, start/end character offset, and published document snapshot hash. This supports readable citations and exact snapshot verification.
- **D-14:** Incremental republish compares hashes and processes only added, changed, or removed chunks/documents; unchanged chunks retain their indexed representation.

### Publish and index status
- **D-15:** Document-set primary status uses six user-facing states: `Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, and `Failed`.
- **D-16:** Show set-level status and history in a document-set management panel. Show compact per-document status badges in the existing Docs workspace.
- **D-17:** Build a candidate snapshot separately and activate it only after the complete document set succeeds. If publishing/indexing fails, retain the previous active snapshot and mark the candidate attempt `Failed`.
- **D-18:** Keep the 10 most recent publish attempts per set. Store timestamp, duration, changed/unchanged/removed counts, warning count, and error summary; do not store document content or DLP excerpts in history.

### Claude's Discretion
- Exact chunk size and hard safety limit, informed by parser/index constraints during research.
- Exact visual treatment and colors for status badges, following existing Ant Design patterns and accessibility requirements.
- Retry mechanics and transport details, provided publishing remains manual and the previous active snapshot stays available on failure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/PROJECT.md` — v1.2 goals, Markdown-canonical constraint, offline behavior, evidence integrity, pilot scope, and current sensitive-data constraint requiring amendment.
- `.planning/REQUIREMENTS.md` — `INGEST-01` through `INGEST-05`; `INGEST-02` and `QUAL-04` require amendment before planning.
- `.planning/ROADMAP.md` — Phase 16 boundary, dependencies, and success criteria; DLP wording requires amendment before planning.

### Pilot corpus
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/README.md` — canonical entry point for pilot corpus structure; demonstrates headings, Markdown tables, fenced ASCII flow, exact identifiers, SQL/PLSQL references, and the `PRC_PROCESS:60000006` versus `PRC_CONTAINER:60000006` identity collision.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/models.ts` — `Note.id` is already a stable UUID; `Note.body` is canonical Markdown and `updatedAt` supports local-change detection.
- `src/db/repositories/noteRepo.ts` — validated note creation/update and Dexie access provide document lookup and snapshot inputs without mutating canonical content.
- `src/views/NotesView.tsx` — existing 3-column Docs workspace, document/folder selection, and Ant Design layout can host document-set entry points and status surfaces.
- `src/components/notes/DocEditorPane.tsx` — existing editor toolbar, auto-save state, and document context can display compact publish badges/actions without a new document editor.
- `src/utils/bm25.ts` — local lexical retrieval remains the offline fallback; knowledge-server work must not replace or block it.

### Established Patterns
- Domain records use stable client-generated UUIDs and ISO timestamps in IndexedDB.
- Dexie is local source of truth; reactive UI reads use `useLiveQuery`.
- Markdown editing auto-saves after 500 ms. Publish must not run from that save path; edits only mark published state stale.
- Ant Design components and Vietnamese user-facing copy are established UI patterns.
- Current dependencies do not include a Markdown AST parser or Fastify; research must justify minimum server/parser dependencies.

### Integration Points
- Extend IndexedDB schema beyond `SCHEMA_V9` for document sets, publish metadata/history, and per-document snapshot hashes.
- Add set management and status access around the Docs workspace in `src/views/NotesView.tsx`; add compact status near document rows/editor without disrupting local editing.
- Knowledge-server client must be optional and failure-isolated so `src/utils/bm25.ts` and local Docs continue working offline.
- Server-side ingestion owns AST parsing, chunk hashing, candidate snapshot construction, and later indexing integration; PlannerMate owns selection, pre-send DLP confirmation, and local status metadata.

</code_context>

<specifics>
## Specific Ideas

- Knowledge server and related infrastructure stay inside the organization network, not the public Internet. This is the reason DLP changed from hard rejection to warning + explicit override; it does not permit silent bypass.
- Example masked finding: PAN-like `4111111111111111` displays as `411111••••1111`, with document and line/column.
- Example failure semantics: if 11 of 12 documents build successfully but one fails parsing, the old active set snapshot remains queryable; the new candidate is not partially activated.
- Example set status: `60000006 Pilot` can show `Local changes` while individual document badges identify stale or failed members.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-Knowledge Server Foundation, DLP Checks & AST Ingestion*
*Context gathered: 2026-10-08*
