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

reasoning_checkpoint:
  hypothesis: "When the resolved scope has no set assignments (catalog has no base sets, or was wiped by restoreBackup clear/conditional-add asymmetry), the server path (groundedTurn.ts:465) dispatches setTierAssignments: []. FederatedRetrievalRequestSchema.parse rejects this (.min(1)) inside knowledgeClient.ts:710 before any HTTP fetch occurs (zero network traffic). The resulting ZodError is not a KnowledgeClientError transport failure, so isFallbackAllowed returns false and groundedTurn.ts:653 rethrows, crashing the turn before synthesis. The existing D-37 empty-scope guard lived only inside executeLocalPath (lines 325-328), leaving the server path completely unprotected."
  confirming_evidence:
    - "BAD HAR files show INTENT stage and MCP tool loop run, but exactly zero requests to 10.4.97.70:30080 (not even OPTIONS preflight)."
    - "GOOD HAR files show retrieve request with setTierAssignments: [{setId: 'adbc5da3-...', tier: 'REQUIRED', roleGroup: 'baseline'}]."
    - "knowledgeClient.ts:710 executes FederatedRetrievalRequestSchema.parse(body) before fetch."
    - "retrievalProtocol.ts:586 requires setTierAssignments: z.array(...).min(1).max(50)."
    - "isTransportFailure/isFallbackAllowed only catches KnowledgeClientError (NETWORK_ERROR/TIMEOUT/REMOTE_ERROR>=500) and TypeError; ZodError propagates to groundedTurn.ts:653 which re-throws."
    - "Commit ba9094c (12:52Z) and 09d0ac0 (12:30Z) postdate error_llm.har (11:32Z); c2c2c87 only adds preRoutedIntent reuse."
  falsification_test: "If an empty resolvedScope with serverEnabled=true causes retrieveFederated to be called or crashes the turn, hypothesis is false. Verified: after hoisting guard, returns {kind: 'clarify_intent'} and retrieveFederated is never invoked."
  fix_rationale: "Hoisting the D-37 empty-scope guard to immediately follow routeScope (line 295) protects both server and local paths, returning clarify_intent when no document set baseline exists. Adding generic retrieve error degradation at line 656 prevents unhandled exceptions from killing future turns."
  blind_spots: "Catalog population in local IndexedDB is the upstream requirement for auto-retrieval without explicit set mentions. restoreBackup.ts clear-always vs conditional-bulkAdd asymmetry can leave documentSets empty if a backup without documentSets is restored."

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

**Verification:**
Ran `npx vitest run tests/ai/groundedTurn.test.ts` (34/34 passing) and `tests/ai/semanticScopeRouter.test.ts` (5/5 passing).

**Files changed:**
- `src/services/ai/groundedTurn.ts`
- `tests/ai/groundedTurn.test.ts`
- `.planning/debug/ai-chat-retrieve-not-called.md`

**Commit:** 12c5330
