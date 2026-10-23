---
status: resolved
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

hypothesis: "restoreBackupPayload and rollbackToSnapshot unconditionally called documentSets.clear() but only bulkAdd incoming sets when the payload field existed and was non-empty. Any legacy backup (schemaVersion <= 9) or pre-v10 snapshot omitting documentSets permanently erased the local catalog, leaving routeScope with no isBase entries, hence setTierAssignments: [] and the D-37 clarify path instead of retrieve."
test: "Code inspection of both clear sites, byte inspection of live Tauri IndexedDB, targeted restore/rollback tests with absent vs explicitly-empty documentSets."
expecting: "Absent field preserves existing knowledge tables; explicit empty array still clears; legacy snapshot rollback preserves sets."
status: "Data-loss defect CONFIRMED by code and reversible by tests. Causal link to the Oct 22 11:32Z HAR window NOT proven: live backupMetadata contains no restore entry between the good 09:07Z capture and the bad 11:32Z capture, and only three backupMetadata records total (all Oct 2/Oct 18). Treat asymmetry as a real upstream contributor that can produce the observed empty-catalog state, not as the proven trigger for this specific HAR."

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

**Root cause:**
When `semanticScopeRouter.routeScope` returns `setTierAssignments: []` (which occurs when no document sets exist in the local catalog with `isBase === true` and no set aliases match the query, e.g. after database restore wiped documentSets via clear-without-repopulate asymmetry), the server retrieval path (`groundedTurn.ts:465`) dispatched a request body with an empty assignments array. `FederatedRetrievalRequestSchema.parse` (`knowledgeClient.ts:710`) enforces `.min(1)` and throws a ZodError before any HTTP fetch occurs (zero network traffic). The existing D-37 empty-scope guard existed ONLY inside `executeLocalPath` (lines 325-328), leaving the server path unprotected. Because `isFallbackAllowed` does not recognize Zod errors, `groundedTurn.ts:653` re-threw the error, crashing the turn before synthesis.

**Fix:**
1. Hoisted D-37 empty-scope guard in `src/services/ai/groundedTurn.ts` to immediately follow `deps.routeScope` (line 295), returning `{ kind: 'clarify_intent', clarifyQuestion: '...' }` before any retrieval dispatch.
2. Removed duplicate guard inside `executeLocalPath`.
3. In `groundedTurn.ts` retrieve error handler, degraded unhandled non-transport retrieve errors to `executeLocalPath('NETWORK_ERROR', ...)` instead of hard re-throwing.
4. Added tests `16b` (server enabled + empty scope returns clarify without retrieve) and `16c` (non-transport retrieve error degrades to local fallback) in `tests/ai/groundedTurn.test.ts`.
5. Data-loss fix in `src/services/backup/restoreBackup.ts`: knowledge tables (`documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits`, `knowledgeLinks`) are now cleared only when the payload/snapshot explicitly carries a `documentSets` field. Legacy payloads omitting the field preserve the live catalog; an explicit `documentSets: []` still clears, preserving existing behavior for intentional empties.
6. Updated `tests/services/backup/knowledgeBackupRestore.test.ts`: legacy restore preserves the catalog; explicit-empty clears it; rolling back a pre-v10 snapshot preserves the catalog.

**Verification:**
Ran `npx vitest run tests/ai/groundedTurn.test.ts` (34/34 passing) and `tests/ai/semanticScopeRouter.test.ts` (5/5 passing) for 12c5330. Ran `vitest run tests/services/backup/knowledgeBackupRestore.test.ts` (10/10) and `restoreBackup.test.ts`, `restoreFailure.test.ts`, `backupChatGrounding.test.ts`, `exportBackup.test.ts` (20/20 combined) for the restore fix.

**Caveat:** The empty catalog in the live DB is real and the restore/rollback asymmetry could have caused it, but no restore metadata record documents the event. Logged as a real data-loss bug, not proven as this HAR's trigger.

**Files changed:**
- `src/services/ai/groundedTurn.ts`
- `tests/ai/groundedTurn.test.ts`
- `src/services/backup/restoreBackup.ts`
- `tests/services/backup/knowledgeBackupRestore.test.ts`
- `.planning/debug/ai-chat-retrieve-not-called.md`

**Commits:** `12c5330` (retrieve guard), `c32b702` (debug state), `2427fc2` (legacy backup catalog preservation).
