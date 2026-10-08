# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion — Specification

**Created:** 2026-10-08
**Ambiguity score:** 0.19 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

User can manually publish stable sets of selected PlannerMate Markdown documents to an optional knowledge server, with pre-send sensitive-data review, lossless AST evidence chunks, hash-based incremental projection, atomic snapshot activation, and inspectable local status while canonical Markdown and offline BM25 remain unaffected.

## Background

PlannerMate already stores documents as stable-UUID `Note` records with canonical Markdown bodies, edits them in the three-column Docs workspace, and searches them locally through BM25. IndexedDB currently reaches schema V9 and has no document-set, publish-attempt, snapshot, chunk, or per-document publish metadata. No knowledge server or Markdown AST parser exists. Phase 16 adds the publishing foundation and versioned evidence-chunk projection; full-text, vector, graph extraction, hybrid retrieval, and grounded answer synthesis belong to later phases.

## Requirements

1. **Stable document sets**: User can create and edit a named publish set containing selected PlannerMate document UUIDs, initially populated from a folder snapshot when requested.
   - Current: PlannerMate stores documents and folders but has no publish-set model or server publishing action.
   - Target: A set stores an explicit ordered membership snapshot of stable document UUIDs; later folder moves or membership changes do not silently alter the set.
   - Acceptance: Create a set from a folder, move a selected document afterward, and verify membership remains unchanged until user edits the set; local document content and hierarchy remain unchanged.

2. **Manual change preview and removal confirmation**: Publishing is manual and previews document additions, changes, removals, and unchanged content before transmission.
   - Current: Document edits auto-save locally after 500 ms and no publish lifecycle exists.
   - Target: Local edits mark affected document and set as `Local changes` without publishing; removing a previously published member requires confirmation before server unpublishing, while never deleting local Markdown.
   - Acceptance: Edit, add, and remove documents after a successful publish; verify no network publish occurs automatically, preview counts each change class correctly, cancellation preserves active server snapshot, and confirmed removal leaves local note intact.

3. **Pre-send sensitive-data warning**: Every affected publish attempt scans document content for PAN, CVV, PIN/PIN block, HSM keys, credentials, and customer PII before any content is sent externally.
   - Current: PlannerMate has no document-publishing DLP scan.
   - Target: Findings show category, document, line/column, and masked excerpt/value; user must provide fresh explicit confirmation for that attempt to continue. No trusted-document or trusted-finding bypass persists. Audit metadata stores timestamp, document IDs, categories/counts, and content hashes only.
   - Acceptance: Instrument transport and submit one document per finding category; verify zero document-content requests occur before confirmation, cancelling sends nothing, confirming permits that attempt, a later attempt asks again, displayed values are masked, and persisted metadata contains no matched value or excerpt.

4. **Lossless AST evidence chunks**: Server parses each published Markdown snapshot into section-first evidence chunks while preserving structural evidence and exact source locations.
   - Current: Markdown is rendered and searched as text, but no versioned AST evidence chunks exist.
   - Target: H2/H3 sections form normal semantic units; oversized sections split only at AST block boundaries. Tables, fenced code/SQL blocks, and ASCII diagrams stay atomic. Every chunk records heading path, start/end line, start/end character offset, and published document snapshot hash.
   - Acceptance: Parse pilot fixtures containing headings, tables, fenced code/SQL, and ASCII diagrams; reconstruct each chunk's source slice exactly, verify no atomic block is split, and verify recorded ranges address the published snapshot.

5. **Oversized atomic-block safety**: Evidence is never silently truncated when one atomic block exceeds the configured hard safety limit.
   - Current: No ingestion size policy exists.
   - Target: Server rejects that document with exact block location and guidance to split source; candidate set does not activate.
   - Acceptance: Publish a fixture with one oversized table or fenced block; verify explicit location/guidance, no truncated chunk, failed candidate status, and prior active snapshot remains available.

6. **Stable SHA-256 incremental projection**: Republish computes document and normalized chunk SHA-256 hashes and processes only added, changed, or removed documents/chunks.
   - Current: No persistent server-side document snapshots or chunk hashes exist.
   - Target: Chunk identity derives from stable document UUID plus normalized chunk-content SHA-256, never line number, ordinal, or heading path alone. Unchanged chunks retain their indexed representation; removed chunks are removed from candidate projection.
   - Acceptance: Publish baseline, republish unchanged content, then alter one section and delete another; verify unchanged republish performs zero chunk mutations and partial republish reports/mutates only exact added, changed, and removed chunks.

7. **Atomic versioned snapshots**: A document set's candidate snapshot becomes active only after complete parsing and projection succeeds.
   - Current: No server snapshot lifecycle exists.
   - Target: Any document failure marks candidate attempt `Failed` and leaves previous active snapshot unchanged and queryable; partial success never activates.
   - Acceptance: After one successful baseline, fail one document in a multi-document republish; verify active snapshot ID and all active chunk hashes equal baseline while failed candidate and error remain inspectable.

8. **Inspectable status and bounded history**: User can inspect set-level and document-level publish state without losing local/offline use.
   - Current: Docs workspace has local editing/search state but no publish status.
   - Target: Set management shows `Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, or `Failed`; Docs workspace shows compact per-document badges. Keep 10 latest attempts per set with timestamp, duration, changed/unchanged/removed counts, warning count, and error summary, excluding content and DLP excerpts. Server unavailability does not block document CRUD or BM25 search.
   - Acceptance: Exercise every state, complete 11 attempts, and verify current set/document status, exactly 10 newest history records, required metrics, no forbidden content, and working local edit/search while server is unreachable.

## Boundaries

**In scope:**
- Optional knowledge-server foundation for manually publishing selected PlannerMate documents.
- Explicit document sets backed by stable document UUID membership.
- Folder-snapshot set creation and manual membership adjustment.
- Client-side pre-send sensitive-data scan, masked findings, fresh confirmation, and content-free audit metadata.
- Server-side Markdown AST parsing into versioned evidence chunks.
- SHA-256 document/chunk comparison and incremental candidate projection.
- Atomic active-snapshot activation and rollback-by-retention on failed candidate.
- Set management, per-document status badges, and bounded attempt history.
- Acceptance verification against `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/` fixtures.

**Out of scope:**
- Full-text, BM25-server, semantic/vector, and hybrid retrieval indexes — Phase 18 owns retrieval engines and fusion.
- Ontology extraction, deterministic relationship extraction, LLM extraction, Neo4j entities/relations, and evidence classifications — Phase 17 owns graph projection.
- Assistant answer generation, citations, graph-path cards, conflicts, and abstention — Phase 19 owns answer experience.
- Whole card-system corpus beyond process `60000006` as formal acceptance corpus — deferred until pilot proves quality.
- Arbitrary filesystem Markdown publishing — Phase 16 publishes selected documents already stored in PlannerMate Docs.
- Automatic publish-on-save, background folder-query membership, or persistent DLP trust bypass — excluded to preserve explicit user control.
- Mutation or deletion of canonical local Markdown during publish/unpublish — Markdown remains source of truth.
- Interactive graph canvas or manual graph editor — deferred beyond MVP.

## Constraints

- PlannerMate remains static, local-first, GitHub Pages compatible, and fully usable without knowledge server.
- Markdown in IndexedDB remains canonical; server chunks and later indexes are rebuildable projections.
- Publish set membership uses stable document UUIDs, not paths, names, or live folder queries.
- Sensitive-data scan and any required confirmation complete before first content-bearing request to knowledge server or downstream indexing service.
- Complete matched secrets or PII never appear in UI, logs, history, or audit metadata.
- Publishing remains manual; local document auto-save must not call server.
- Failed candidate must not modify active snapshot.
- AST chunks must preserve exact snapshot ranges; atomic blocks cannot be split or truncated.
- Server projection in this phase stops at versioned chunks and hashes; later retrieval indexes must not be pulled forward.
- User-facing UI follows existing Ant Design and Vietnamese-copy patterns and remains keyboard/accessibility usable.
- Exact chunk-size and atomic hard-limit values remain implementation decisions, but tests must cover both normal splitting and over-limit rejection.

## Acceptance Criteria

- [ ] User can create a named set from a folder snapshot, adjust membership, and retain membership across later folder moves.
- [ ] Publishing never mutates or deletes local canonical Markdown.
- [ ] Local edits create `Local changes` state and never trigger automatic network publishing.
- [ ] Publish preview distinguishes added, changed, removed, and unchanged documents/chunks.
- [ ] Previously published removal requires explicit confirmation and cancellation preserves active server content.
- [ ] Every configured sensitive-data category yields document, category, line/column, and masked finding details.
- [ ] No document content leaves PlannerMate before scan completion and fresh confirmation for attempts with findings.
- [ ] DLP confirmation is requested again on every affected attempt; no persisted trust bypass exists.
- [ ] Audit/history data contains no matched sensitive value, excerpt, or document body.
- [ ] Pilot fixtures produce section-first chunks preserving headings, tables, fenced code/SQL, ASCII diagrams, and exact ranges.
- [ ] Oversized atomic blocks fail with exact location and split guidance; no evidence is truncated.
- [ ] Unchanged republish performs zero chunk mutations; partial changes mutate only added, changed, and removed chunks.
- [ ] Chunk identity remains stable when source movement changes line number or heading path but normalized chunk content does not change.
- [ ] Multi-document candidate activates only after all documents succeed; any failure leaves previous active snapshot unchanged.
- [ ] UI exposes six set states and compact per-document status in Docs workspace.
- [ ] Each set retains exactly 10 newest attempts with required metrics after an 11th attempt.
- [ ] Local document CRUD and BM25 search remain functional when knowledge server is unreachable.
- [ ] No full-text, vector, graph, or assistant-answer implementation is required for Phase 16 completion.

## Ambiguity Report

| Dimension | Score | Min | Status | Notes |
|---|---:|---:|:---:|---|
| Goal Clarity | 0.90 | 0.75 | ✓ | Manual selected-document publishing and concrete outputs locked. |
| Boundary Clarity | 0.82 | 0.70 | ✓ | Chunk projection separated from Phases 17–19; pilot is verification corpus, not product restriction. |
| Constraint Clarity | 0.72 | 0.65 | ✓ | Pre-send DLP, atomic activation, offline isolation, and canonical-source constraints explicit. |
| Acceptance Criteria | 0.75 | 0.70 | ✓ | Failure, incremental, DLP, status, and offline cases are pass/fail. |
| **Ambiguity** | **0.19** | **≤0.20** | **✓** | Gate passed after round 1. |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|---|---|---|---|
| 1 | Researcher | What DLP outcome applies to sensitive findings? | Warn with masked details; require fresh explicit confirmation for each affected attempt. |
| 1 | Researcher | What does indexed mean before retrieval phase? | Versioned chunk projection and hashes only; retrieval indexes remain Phase 18. |
| 1 | Researcher | Which Markdown can be published? | User-selected PlannerMate Docs; process `60000006` is formal verification corpus. |

---

*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Spec created: 2026-10-08*
*Next step: /gsd-discuss-phase 16 — implementation decisions (how to build what's specified above)*
