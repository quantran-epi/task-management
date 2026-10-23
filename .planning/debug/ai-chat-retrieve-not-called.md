---
status: awaiting_human_verify
trigger: "After recent fix commits, AI chat drawer is comprehensively broken and no longer calls retrieve API."
created: 2026-10-22
updated: 2026-10-23
goal: find_and_fix
branch: master
---

# Debug Session: AI Chat Retrieve Not Called

## Symptoms

- AI chat drawer broke after recent fix commits.
- Retrieve API appears not to be called after fixes.
- BEFORE HAR: `docs/tauri.localhost_error_llm.har`.
- AFTER HAR: `docs/tauri.localhost_error_llm_2.har`.
- Suspect commits: `ba9094c`, `09d0ac0`, `c2c2c87`.
- HAR request pattern: In working runs (`tauri.localhost_issue_date.har`), retrieve endpoint `POST 10.4.97.70:30080/api/v1/retrieve` was called with `setTierAssignments: [{"setId": "adbc5da3-...", "tier": "REQUIRED", "roleGroup": "baseline"}]` followed by `taskmate_grounded_answer_v2` synthesis. In broken runs (`tauri.localhost_error_llm.har`, `error_llm_2.har`), intent and MCP tool loops completed normally, but NO retrieve call occurred, NO `taskmate_grounded_answer_v2` synthesis ran, and the turn terminated silently before reaching any Telegram reply or answer persistence.

## Relevant Prior Context

- `.planning/debug/ai-chat-federated-degraded.md`
- `.planning/debug/ai-chat-flow-regression.md`
- `.planning/debug/ai-chat-request-amplification.md`
- `.planning/debug/ai-chat-loses-session-context.md`

## Current Focus

hypothesis: "12c5330 hoisted the D-37 empty-scope guard to run before MCP is considered (right after routeScope). That is too early: a turn with no document sets but a configured MCP target is a valid MCP-only retrieval and must not clarify. Correct contract is docs scope and MCP as independent sources: docs+MCP parallel, docs-only, MCP-only, clarify only when neither available."
test: "Targeted groundedTurn tests covering the four routing matrix cases, parallel docs+MCP dispatch, and one-source failure degradation."
expecting: "MCP-only never calls retrieveFederated with setTierAssignments: []; neither-source clarifies; one-source failure still synthesizes remaining evidence and marks degraded."
status: "Root cause CONFIRMED by code trace. Fix in progress: provider-independent orchestration restructure in runGroundedTurn."

reasoning_checkpoint:
  hypothesis: "The hoisted guard at groundedTurn.ts:297 returns clarify_intent whenever routeScope yields empty setTierAssignments, even when intent routing selected a configured MCP source. MCP-only turns therefore terminate before any retrieval, reproducing the no-retrieve/no-synthesis symptom."
  confirming_evidence:
    - "Commit 12c5330 added the guard immediately after deps.routeScope, before require_mcp/target_mcp_servers are read at old lines 464-465."
    - "The former MCP dispatch was coupled to a mandatory Docs retrieve: docsRetrievalPromise was built unconditionally with resolvedScope.setTierAssignments, so empty scope would have thrown ZodError client-side (FederatedRetrievalRequestSchema.min(1))."
    - "INTENT_SYSTEM_PROMPT explicitly routes live external/MCP queries to require_mcp; such queries need not match any local document set."
  falsification_test: "An MCP-only turn (require_mcp true, target_mcp_servers non-empty, setTierAssignments empty) returning clarify_intent or calling retrieveFederated would disprove the fix."
  fix_rationale: "Compute source availability once (hasDocsScope, hasConfiguredMcp), clarify only when neither exists, start Docs and MCP promises independently via Promise.allSettled, synthesize whichever succeeds, and degrade rather than crash on a single-source failure."
  blind_spots: "Live Tauri HAR rerun not performed; MCP-only behavior verified at unit level. UI loading-status hooks still assume retrieve runs; cosmetic only."

## Upstream Cause Investigation (2026-10-23)

- code: `src/services/backup/restoreBackup.ts` cleared `documentSets` (and publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks) unconditionally in both `restoreBackupPayload` and `rollbackToSnapshot`, but repopulated only `if (backup.tables.documentSets?.length)`.
- code: `exportBackupPayload` always emits `documentSets` (even as `[]`); legacy backups omit it. `validateBackupPayload` preserves that distinction.
- consequence: importing an older/legacy backup silently destroys a valid catalog. Empty catalog -> `semanticScopeRouter` returns `setTierAssignments: []` for general queries -> D-37 guard returns clarify -> zero retrieve requests. Matches the reported symptom class.
- data: bytes from live `%LOCALAPPDATA%\com.personal.taskplanner\EBWebView\Default\IndexedDB\http_tauri.localhost_0.indexeddb.leveldb` (000134.ldb) contain zero `documentIds`/`isBase`/`aliases`/`canonicalName`/`documentSets` record markers; catalog is empty now.
- data: the orphaned IndexedDB blob `...indexeddb.blob/1/05/55c` holds a pre-import snapshot dated 2026-10-19T05:19:27Z whose tables include a document set (`isBase`, `documentIds`, `domain: General`, name `Chung`, id `0a518870-...`). So a valid catalog existed on Oct 19 and is gone now.
- data (limits causality): live `backupMetadata` has only 3 records (2026-10-02, 2026-10-02, 2026-10-18). A successful restore/rollback would add an entry with its snapshotTime. No entry exists near 2026-10-19T05:19Z or between the good 09:07Z and bad 11:32Z HAR captures. Therefore the exact erasure event is NOT evidenced; other paths (manual set delete) remain possible. The defect is confirmed independently of that event.
- HAR: good captures call `POST 10.4.97.70:30080/api/v1/retrieve` with `setId adbc5da3-...`; bad captures (`11:32Z`, `14:00Z`) contain only `ipc.localhost` intent/MCP proxy calls and zero requests to `10.4.97.70:30080`, consistent with the client-side ZodError-before-fetch root cause already fixed in 12c5330.



## Investigation Requirements

1. Use scientific method. Record each hypothesis, test, result, and conclusion.
2. Delegate heavy file discovery where useful, but keep source changes minimal.
3. Identify exact root cause for missing retrieve call.
4. Apply smallest working fix.
5. Run only smallest affected test files, never full suite.
6. Commit atomically with conventional fix(...) message ending with Co-Authored-By: Claude <noreply@anthropic.com>.
7. Preserve unrelated working-tree changes. Never revert or include unrelated files.

## Evidence

- timestamp: 2026-10-22T00:00:00Z
  source: user report
  observation: BEFORE and AFTER HAR captures bracket recent commits; AFTER reportedly contains no retrieve API call.
  implication: Network-sequence diff can locate earliest behavioral divergence.

- timestamp: 2026-10-22T00:00:01Z
  source: recent commit list
  observation: ba9094c is test-only by subject; 09d0ac0 changes AI MCP/docs fallback behavior; c2c2c87 targets Telegram.
  implication: Start regression analysis at 09d0ac0, while verifying actual diffs rather than trusting subjects.

- timestamp: 2026-10-22T21:00:00Z
  source: HAR analysis (harq.txt, harem.txt)
  observation: BAD HARs (error_llm.har @ 11:32Z, error_llm_2.har @ 14:00Z) contain intent routing + MCP loop, but zero requests to 10.4.97.70:30080. GOOD HARs (issue_date.har @ 09:07Z, tauri.localhost_1..3) show POST /api/v1/retrieve with setTierAssignments: [{setId: 'adbc5da3-...'}].
  implication: Retrieve was not blocked by network; client never dispatched it over the wire.

- timestamp: 2026-10-22T21:30:00Z
  source: code trace (knowledgeClient.ts:710 + retrievalProtocol.ts:586)
  observation: client.retrieveFederated parses body with FederatedRetrievalRequestSchema BEFORE fetch. Schema has setTierAssignments.min(1). When empty, Zod throws before fetch.
  implication: Empty setTierAssignments causes zero-traffic client-side crash.

- timestamp: 2026-10-22T22:00:00Z
  source: code trace (groundedTurn.ts:325 vs 465)
  observation: The D-37 empty scope guard lived only inside executeLocalPath (lines 325-328). The server retrieval dispatch (lines 465-493) had no guard and passed resolvedScope.setTierAssignments directly into retrieveFederated.
  implication: Server path was vulnerable to empty-scope crash.

- timestamp: 2026-10-22T22:15:00Z
  source: code trace (groundedTurn.ts:647-654)
  observation: isFallbackAllowed only covers KnowledgeClientError (NETWORK_ERROR, TIMEOUT, REMOTE_ERROR>=500) and TypeError. A ZodError or generic Error falls through to line 653: throw error, which terminates runGroundedTurn and prevents synthesis/Telegram reply.
  implication: Two-point vulnerability: missing server guard + unhandled retrieve error re-throw.

## Eliminated

- hypothesis: "09d0ac0 broke retrieve dispatch"
  evidence: 09d0ac0 was committed at 19:30+07:00 (12:30Z). The first broken capture (error_llm.har) is from 11:32Z, an hour before 09d0ac0 existed.
  timestamp: 2026-10-22T21:00:00Z

- hypothesis: "ba9094c broke retrieve dispatch"
  evidence: ba9094c was committed at 19:52+07:00 (12:52Z), test-only, and postdates error_llm.har.
  timestamp: 2026-10-22T21:00:00Z

- hypothesis: "c2c2c87 broke retrieve dispatch"
  evidence: c2c2c87 only added preRoutedIntent reuse in groundedTurn.ts; intent routing output was identical between good and bad HARs.
  timestamp: 2026-10-22T21:30:00Z

- hypothesis: "Knowledge client disabled or unconfigured"
  evidence: Live leveldb settings confirm knowledge_server_enabled=true and knowledge_server_base_url=http://10.4.97.70:30080.
  timestamp: 2026-10-22T22:00:00Z

- hypothesis: "Network connection failure to knowledge server"
  evidence: If fetch had failed, OPTIONS preflight or TCP error would appear in HAR. Exactly 0 requests reached 10.4.97.70:30080.
  timestamp: 2026-10-22T22:00:00Z

## Resolution

**Root cause (corrected 2026-10-23):**
Two defects stacked on the same orchestration path.

1. Original: server retrieval dispatched `setTierAssignments: []` into `FederatedRetrievalRequestSchema` (`.min(1)`), throwing ZodError before fetch; `isFallbackAllowed` did not recognize it, so the turn crashed (silent zero-traffic failure). Fixed in 12c5330.
2. Regression introduced by 12c5330: the empty-scope guard was hoisted to immediately after `deps.routeScope`, before `require_mcp` / `target_mcp_servers` are evaluated. Any MCP-only turn (intent routed `require_mcp: true`, valid target server, but no matching document set) was converted to `clarify_intent` and terminated before MCP dispatch — reproducing the no-retrieve / no-synthesis symptom class for MCP-served queries. The former docs dispatch was also unconditional, so docs and MCP were not independent sources.

**Corrected contract (confirmed):**
- document sets + configured MCP: Docs `/retrieve` and MCP run in parallel, then synthesize.
- document sets only: Docs retrieval only.
- no document sets + configured MCP: MCP only; never issue `setTierAssignments: []`.
- neither: `clarify_intent`.
- one configured source fails while other succeeds: synthesize remaining evidence, mark degraded, never crash.

**Fix:**
1. `src/services/ai/groundedTurn.ts`: source availability computed once (`hasDocsScope`, `hasConfiguredMcp`). Clarify only when neither exists. Docs promise starts only when `serverEnabled && hasDocsScope`; MCP promise starts only when MCP configured. Both settle via `Promise.allSettled`.
2. Single-source failure degradation: MCP rejected while Docs enabled -> warning + Docs response marked `DEGRADED`; Docs rejected while MCP yielded items -> warning + synthetic empty `DEGRADED` response so MCP evidence still synthesizes; both failing -> existing fallback/loc error path.
3. Added `emptyRetrievalResponse(outcome)` helper for the MCP-only and docs-failed degraded cases. No new deps or abstractions beyond this local helper.
4. Retrieve error handler from 12c5330 retained (unhandled non-transport errors degrade to local path instead of throwing).
5. Preserved backup data-loss fix from 2427fc2 unchanged.

**Verification:**
- `npx vitest run tests/ai/groundedTurn.test.ts` — 39/39 passing (includes new routing-matrix suite: MCP-only, Docs-only, parallel Docs+MCP start, Docs-fail/MCP-succeed degraded, neither-source clarify).
- `npx vitest run src/services/knowledge/__tests__/knowledgeClient.fallback.test.ts` — 14/14 passing.
- `npx tsc --noEmit -p tsconfig.json` — clean.

**Caveat:** The empty catalog in the live DB is real and the restore/rollback asymmetry could have caused it, but no restore metadata record documents the event. Live Tauri HAR rerun not performed; MCP-only behavior verified at unit level.

**Files changed:**
- `src/services/ai/groundedTurn.ts`
- `tests/ai/groundedTurn.test.ts`
- `src/services/backup/restoreBackup.ts` (earlier 2427fc2)
- `tests/services/backup/knowledgeBackupRestore.test.ts` (earlier 2427fc2)
- `.planning/debug/ai-chat-retrieve-not-called.md`

**Commits:** `12c5330` (initial retrieve guard, superseded orchestration), `c32b702` (debug state), `2427fc2` (legacy backup catalog preservation), current commit (independent source orchestration).
