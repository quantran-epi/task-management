---
phase: 28
phase_name: Query-Only Knowledge Retrieval
status: secured
threats_open: 0
asvs_level: 1
block_on: high
verified_at: 2026-11-17
---

# Phase 28 Security Verification

**Verdict:** SECURED — 21/21 consolidated threats closed, `threats_open: 0`.

The threat register was authored at plan time in `28-01-PLAN.md` through `28-05-PLAN.md`. `T-28-SC` appears in all five plans as the same supply-chain/install threat and is consolidated here once. An independent security audit verified every mitigation against the implemented code and focused tests.

## Trust Boundaries

1. Client → `POST /api/v1/retrieve`: untrusted JSON crosses into the strict wire Zod parser.
2. SnapshotStore → lexical retriever: published Markdown remains untrusted data even when stored locally by the server.
3. Published-set count → fan-out: server state controls how much work one request can trigger.
4. Model → `retrieve_knowledge` tool args: model-supplied query, limit and setIds are untrusted.
5. Server fan-out → client evidence pack → rendered source panel: server content crosses into the DOM.
6. Server outcome code → live chat surfaces: structured codes drive application-owned UI copy.
7. End-to-end test doubles → real route/pack/render: test doubles must not replace the contract under test.

## Verified Threat Register

| Threat ID | Category | Severity | Status | Evidence |
|---|---|---:|---|---|
| T-28-01 | Tampering | high | CLOSED | `ChunkItemSchema` fixes evidence shape; `rawSnippet` is inert string data; no HTML sink in server retrieval path. |
| T-28-02 | Denial of Service | high | CLOSED | `DEFAULT_QUERY_ONLY_BUDGETS` caps concurrency 4 / maxSets 15 / maxItems 60 / maxEvidenceChars 56000 / elapsedMs 20000; enumeration overflow marked `NOT_SEARCHED_BUDGET`. |
| T-28-03 | Information Disclosure | high | CLOSED | Explicit `setIds` exact-match only; unknown IDs become `UNAVAILABLE` coverage; no broadening. |
| T-28-16 | Repudiation | high | CLOSED | All-unknown `setIds` returns HTTP 200 `DEGRADED` with a full `UNAVAILABLE` ledger and non-ok modalities; E2E rejects empty `NO_EVIDENCE`. |
| T-28-04 | Tampering | high | CLOSED | Client tool result carries machine-readable `outcome` / `status.code`; excerpts remain delimited data fields. |
| T-28-05 | Information Disclosure | high | CLOSED | Client forwards explicit `setIds` verbatim; no catalog filtering or widening. |
| T-28-06 | Denial of Service | medium | CLOSED | `limit` clamped to 10..50; `setIds` max 50; no client-side fan-out loop. |
| T-28-17 | Tampering | high | CLOSED | Existing AI-engine regression cases pass; `aiOrchestratorLoop.ts` and `groundedTurnDeps.ts` byte-identical to pre-phase base. |
| T-28-07 | Denial of Service | high | CLOSED | Deadline checked before each queued task; skipped work never calls `retrievePerSet`; character cap applies to first item. |
| T-28-08 | Tampering | high | CLOSED | Server `superRefine` rejects hop citations absent from same-set chunks; client drops unclosed paths as a second layer. |
| T-28-09 | Repudiation | high | CLOSED | Ledger carries published vs retrieval snapshot with `staleIndex`; retrieval snapshot null for failed/skipped sets; STALE warning on mismatch. |
| T-28-10 | Information Disclosure | medium | CLOSED | Quick preview remote excerpt rendered as text node; `Open in Docs` disabled with no local note; no auto-import. |
| T-28-15 | Tampering | medium | CLOSED | `publishedSnapshotIdBySet` is internal-only; `retrievalSnapshotId` is null unless the set actually responded. |
| T-28-18 | Tampering | high | CLOSED | Local/MCP packs and local-note preview cases stay green; new schema fields default to empty; routing flags unchanged. |
| T-28-11 | Spoofing | high | CLOSED | One canonical notice constant is the only source of the Vietnamese literal; host code renders it byte-identically on AI Chat and Telegram from grounded and tool-driven paths. |
| T-28-12 | Tampering | medium | CLOSED | `detectKnowledgeToolOutcome` uses tool-name allowlist, defensive JSON parsing, fixed enum and null for unrecognized input. |
| T-28-13 | Repudiation | high | CLOSED | Local fallback keeps `authority:'local'`, renders in a separate labeled row after the notice, never merged with server evidence. |
| T-28-14 | Information Disclosure | low | CLOSED | Telegram prepends only the fixed constant; no query, excerpt or set name enters the notice path. |
| T-28-19 | Tampering | high | CLOSED | `aiOrchestratorLoop.ts` byte-identical; pre-existing grounded/tool/Telegram cases green; pre-existing drawer failure set did not grow and is documented in `deferred-items.md`. |
| T-28-20 | Tampering | high | CLOSED | E2E tests mock only per-set retrieval/store contents, not route/resolver/pack/render; assertions use observable HTTP/body/rendered text. |
| T-28-SC | Tampering | high | CLOSED | No new dependency; human-approved install used the existing lockfile; all package manifests remained git-unchanged; later plans performed no installs. |

## Accepted Risks / Open Threats

None. `threats_open: 0`.

## Audit Notes

- ASVS level 1; block threshold high.
- Focused verification included server query-only E2E (5 passed), client zero-local-docs E2E (5 passed), knowledgeOutcome (18 passed across two focused files), 96 client and 90 server non-regression tests, and `tsc --noEmit` exit 0.
- Byte-identical non-regression claims were checked against pre-phase base `146c444a564f0db32acb568fafa4be8fdd582152`.
- No source changes were made during the security audit.
