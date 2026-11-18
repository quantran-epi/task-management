# Pitfalls Research

**Domain:** Deleting a large shared-service feature (SDLC Studio) and rebuilding a multi-agent, budgeted, concurrent AI workspace inside an existing offline-first Dexie + Tauri app
**Researched:** 2026-11-09
**Confidence:** HIGH for code-verified findings (file:line cited); MEDIUM for general multi-agent/budget patterns applied to this stack

**Scope note:** Phase 34 was marked complete with **zero automated tests referencing any AI Office module** (`find src -name "*.test.ts*"` → 72 files, none reference `teamRunCoordinator`, `budgetGate`, `executeTeamTool`, `aiTeamRepo`, `aiOfficeRepo`, `TeamWorkspace`). "Phase 34 complete" is an assertion, not evidence. Every pitfall below that says "already present" was verified by reading the shipped code, and several are live defects the v1.4 walkthrough must reproduce before they are "fixed".

---

## Critical Pitfalls

### Pitfall 1: Deleting SDLC Studio by deleting files instead of auditing shared services

**What goes wrong:**
`src/components/sdlc/**`, `src/services/wizard/**`, `src/views/ChangeRequestSdlcView.tsx` are the obvious deletion targets. But the *surviving* AI chat stack imports SDLC code on its hot path:

| Surviving module | Depends on SDLC code |
|---|---|
| `src/components/ai/runtime/chatTurnRuntime.ts:19` | `services/ai/sdlcArtifactTools` (`ArtifactPatchProposal`) |
| `src/services/ai/aiTools.ts:74` | `executeSdlcArtifactTool` (registered in `AI_DATABASE_TOOLS`) |
| `src/components/ai/AiChatWidget.tsx:491` | `ArtifactDiffApprovalCard` (ordinary chat renders it) |
| `src/components/ai/AIChatDrawer.tsx:51` | `buildConventionsSegment` from `sdlcPromptComposer` |
| `src/workbench/editor/RemoteFileViewer.tsx:17` | `components/sdlc/diff/DiffSyntaxHighlighter` |
| `src/validation/knowledgeSchemas.ts:3` | `SdlcDocumentSetMetadataSchema` (knowledge publish path) |
| `src/services/ai/chatTurnTools.ts:66` | `get_artifact`, `patch_artifact_section`, `propose_subsystems`, `propose_research` |

The failure mode is not a crash — it is a cascade of "temporary" stubs, `any` casts, and dead branches that silently degrade ordinary chat (artifact approval card, conventions segment, diff rendering) while the build goes green.

**Why it happens:**
The SDLC feature was built as a *layer on top of* the shared chat engine (Phases 25.2/25.3/27), so its modules are not leaves.

**How to avoid:**
Do the shared-service audit **before** the first deletion, and record the verdict per module: `delete` / `move to shared` / `keep schema only`.
- `sdlcArtifactTools` → split: the *proposal/approval* mechanism stays (chat needs it), the *SDLC artifact kinds* go.
- `sdlcPromptComposer.buildConventionsSegment` → move to a neutral prompt module; conventions are org-wide, not SDLC-only.
- `DiffSyntaxHighlighter` → move to `src/components/common/diff/` (RemoteFileViewer is not SDLC).
- `SdlcDocumentSetMetadataSchema` → keep as a **read-only legacy schema** for existing `documentSets` rows; do not delete (see Pitfall 6).
- `get_artifact` / `patch_artifact_section` / `propose_*` → decide explicitly; `AiChatWidget`'s approval card path must keep a working tool or the card becomes unreachable dead UI.

**Warning signs:**
- PR diff deletes a file and adds `// TODO: replace` in the same commit.
- Type errors "fixed" by `as any`, `@ts-expect-error`, or empty stub exports.
- `chatTurnTools.ts` allowlist references a tool name that no longer exists (runtime then routes it to the dynamic-MCP path and throws "unknown MCP server" — see `teamRunCoordinator.ts:173-183` for the guard that documents this exact drift).

**Phase to address:**
Phase 35 (SDLC Studio removal) — audit task must be plan 1, before any deletion.

---

### Pitfall 2: Persisted SDLC rows survive the code deletion and poison backup validation

**What goes wrong:**
Deleting the UI does not delete IndexedDB rows. Three persisted artifacts remain:
1. `chatTabs` rows with `type: 'sdlc'` (`src/db/repositories/chatTabRepo.ts:90-127`).
2. `chatThreads` rows with `scopeKey = 'cr:<id>:sdlc'` (`chatRepo.ts:getOrCreateSdlcThread`).
3. `settings` rows keyed `sdlc_workflow:<crId>:<threadId>` (`services/wizard/workflowCoordinator.ts:40`), read by `ChangeRequestDetailView.tsx:117` and `SystemDetailView.tsx:215`.

The backup validator still enforces SDLC invariants (`validateBackup.ts:392-418`): a tab's `scopeKey` must match the thread's `cr:<id>:sdlc` derivation, and **exactly one** `type: 'sdlc'` tab per CR scope. Worse, `restoreBackup.ts:legacyTabRows` **actively creates** an SDLC thread + tab for every CR when `chatTabs` is absent, and `replaceTables` mirrors `workflowState` into `sdlc_workflow:*` settings (`restoreBackup.ts:298-310`).

Result: the user's own next export → import cycle can fail validation, or restore resurrects SDLC tabs and threads for a feature that no longer exists.

**Why it happens:**
Validation and restore were written to *guarantee* SDLC shape. Removing the feature without removing its invariants leaves a validator that rejects its own product.

**How to avoid:**
Add a Dexie migration (new `version(18)`) that, atomically:
- deletes `chatTabs` where `type === 'sdlc'`;
- deletes `chatThreads` where `scopeKey` ends with `:sdlc` (and their `chatMessages`);
- deletes `settings` keys starting `sdlc_workflow:`;
- **keeps** `notes` rows that carry `sdlcArtifact` (they are user documents — see Pitfall 5).
Then remove the SDLC invariants from `validateBackup.ts` and the SDLC generators from `restoreBackup.ts`. Keep the migration idempotent: it must be safe on a DB that never had SDLC rows.

**Warning signs:**
- Export → import round-trip on a pre-v1.4 DB fails with "ChatTab scope does not match chat thread".
- After restore, an "SDLC Workflow" tab appears in a CR that the user never opened.
- `db.chatTabs.where('type').equals('sdlc').count()` is non-zero after the migration.

**Phase to address:**
Phase 35 (removal) — migration ships in the same phase as the deletion, not later.

---

### Pitfall 3: Removing `'sdlc'` from the backup enum invalidates every existing backup

**What goes wrong:**
`BackupChatTabRecordSchema.type` is `z.enum(['chat', 'sdlc'])` (`backupSchemas.ts:240`). The intuitive cleanup — change it to `z.enum(['chat'])` — makes every backup exported before v1.4 **fail validation**, and `restoreBackupPayload` throws before touching the DB (`restoreBackup.ts:325-331`). The user loses their only restore path.

**Why it happens:**
The backup schema is treated as "the current app model" rather than "every model this app has ever written".

**How to avoid:**
Backup schemas are **import-tolerant, export-strict**:
- Keep `'sdlc'` in the *input* enum for at least one milestone; on import, drop SDLC tabs (the migration already removed them locally) instead of rejecting the payload.
- Never bump `CURRENT_SCHEMA_VERSION` (`exportBackup.ts:7`, still `11`) for an additive model change — `BackupEnvelopeSchema` uses `z.literal(11)`, so a bump rejects all history (this is D-34's rule; keep it).
- Add a validator test that feeds a fixture containing `type: 'sdlc'` and asserts `valid: true` with the tab dropped.

**Warning signs:**
- Any change to `BACKUP_SCHEMA_VERSION` or `CURRENT_SCHEMA_VERSION` in the v1.4 diff.
- A new `z.enum` that lost a member.
- No fixture test for "old backup still imports".

**Phase to address:**
Phase 35.

---

### Pitfall 4: Persisted layout tabs point at deleted view types

**What goes wrong:**
`layoutStore` persists `openTabs` and `activeTabId` to `localStorage['taskmate_workbench_layout_v2']` (`layoutStore.ts:106,342-380`). `partialize` validates *types* but not *membership* in `EditorViewType`. After `'sdlc'` is removed from the union and from `EditorArea`'s switch, a persisted `{ viewType: 'sdlc' }` tab hits the `default:` branch and renders **TasksView** inside a tab titled "SDLC Studio". `activeTabId` still points at it, so the user lands on the wrong view on every launch.

The same hazard applies to v1.4's navigation restructure: `'teams'`, `'team_workspace'`, `'agents'` may be collapsed into one "AI Office" trigger, and `'staff_detail'` may move. All of them are persisted strings.

**Why it happens:**
`persist` has no `version`/`migrate` configured, so there is no hook for "drop tabs whose viewType no longer exists".

**How to avoid:**
- Add `version: 3` + `migrate` to the persist config (or bump `LAYOUT_STORAGE_KEY` to `_v3`), filtering `openTabs` against a runtime `KNOWN_VIEW_TYPES` set and re-pointing `activeTabId` to the first surviving tab.
- Keep the `default:` branch of `EditorArea` rendering an explicit "view removed" placeholder rather than `TasksView` — silent wrong-content is worse than a visible message.
- Add a unit test: hydrate the store with `{ viewType: 'sdlc' }` and assert the tab is dropped and `activeTabId` is valid.

**Warning signs:**
- A tab labelled SDLC Studio shows a task list.
- `openTabs` contains a `viewType` not present in `EditorViewType`.
- No `migrate` function in `layoutStore.ts`.

**Phase to address:**
Phase 35 (drop `'sdlc'`) and Phase 40 (final navigation shape).

---

### Pitfall 5: Deleting `sdlcArtifact` metadata destroys user documents or silently strips them on import

**What goes wrong:**
SDLC artifacts are stored as **notes** with `note.sdlcArtifact` (`types/models.ts:205`, written by `services/wizard/artifactRepo.ts`). Two wrong moves:
- **Delete notes** whose `sdlcArtifact` is set → the user loses PL01/PL02/PL03B/PL07 documents that are real content, not SDLC scaffolding.
- **Remove the field from the type and the backup schema** → `BackupNoteRecordSchema` is a plain `z.object` (`backupSchemas.ts:143`), so the field is *silently stripped* on import. The documents survive but their version/CR/thread linkage is gone, and `artifactRepo`'s idempotency keys (`idempotencyKey`, `inputHash`) vanish with them.

The same decision applies to `documentSets.sdlc` (`types/models.ts:377`) and `knowledgeSchemas.ts:123`.

**Why it happens:**
"SDLC Studio" is treated as one thing, but its *data* is a mix of scaffolding (workflow state, step tabs) and user content (documents, document sets).

**How to avoid:**
Classify before deleting:

| Data | Verdict |
|---|---|
| `chatTabs.type='sdlc'`, `cr:*:sdlc` threads, `sdlc_workflow:*` settings, `chatTabs.workflowState`, `chatTabs.checkpoint` | Delete (scaffolding) |
| `notes` with `sdlcArtifact` | **Keep the note**; keep the metadata field as optional-legacy, or migrate it into a neutral `artifact` field |
| `documentSets.sdlc` | Keep the schema; stop writing new values |
| `publishedDocuments` / `knowledgeLinks` referencing those sets | Keep (knowledge pipeline is live) |

If the field is retired, add an explicit migration that rewrites `sdlcArtifact` → the new shape **before** removing it from the type, and keep both accepted by the backup schema.

**Warning signs:**
- A migration that does `db.notes.where(...).delete()`.
- Backup diff showing `noteAttachments`/`notes` counts dropping after a round-trip.
- `sdlcArtifact` removed from `types/models.ts` with no data migration.

**Phase to address:**
Phase 35.

---

### Pitfall 6: The knowledge pipeline imports SDLC schemas — deleting them breaks publish/validate

**What goes wrong:**
`src/validation/knowledgeSchemas.ts:3` imports `SdlcDocumentSetMetadataSchema` and validates `documentSets.sdlc` on the publish path. Deleting `services/ai/wizardSchemas.ts` because "it is SDLC" breaks knowledge publishing for existing sets — and the knowledge server is an explicitly supported, independently deployed component.

**Why it happens:**
The schema file is named after the feature, not after the data it describes.

**How to avoid:**
Move the schema to a neutral module (`src/validation/documentSetMetadataSchemas.ts`) and keep it as a legacy-tolerant optional. Do not delete knowledge-side validation in the same phase as the Studio deletion.

**Warning signs:**
`grep -rn "wizardSchemas\|SdlcDocumentSetMetadata" src` still returns hits after the deletion phase.

**Phase to address:**
Phase 35 (move), verified in Phase 40 walkthrough.

---

### Pitfall 7: A thrown agent start leaves the batch awaiting a deferred that never resolves — permanent stuck run

**What goes wrong (already present in shipped code):**
`startEmployeeTurn` creates the deferred **before** starting the runtime:

```ts
// teamRunCoordinator.ts:563-567
if (!agentDeferreds.has(employee.id)) {
  agentDeferreds.set(employee.id, createDeferred());
}
const outcome = await registry.get(employee.id).start(request);   // can throw TURN_IN_PROGRESS
```

`runBatch` starts agents with `Promise.allSettled(started)` (`:758`), which **swallows** the rejection, then awaits every deferred (`:761-763`). The rejected agent's deferred is never resolved or deleted (`settleAgent` is the only resolver and is never reached). The lead's `delegate_batch` tool call never returns, `phase` stays `batch-running`, and the run is hung with no error surfaced.

Triggers: the same agent already has a live turn (`chatTurnRuntime.ts:220` throws `TURN_IN_PROGRESS`), a Dexie read failure in `listAssignmentHistory`/`listRecentTurns`, or a mention turn still running for that agent.

**Why it happens:**
The deferred is treated as "created by start", but it is created *before* the call that can fail. `allSettled` was chosen to keep a batch alive when one agent fails — correct intent, missing compensation.

**How to avoid:**
- Wrap `startEmployeeTurn`'s body in `try/catch/finally`; on any throw, `settleAgent(employee.id, 'error', SANITIZED_TURN_ERROR)` and delete the deferred.
- Replace the unconditional `await Promise.all(deferreds)` with a bounded wait that also rejects/aborts on coordinator abort, or assert `phase !== 'batch-running'` after `allSettled` and fail the batch explicitly.
- Add a watchdog: if `phase === 'batch-running'` and no agent has emitted a delta for N seconds, surface a recoverable error and offer Stop (which currently only works if the user finds the button).
- Regression test: make `registry.start` throw for one of three agents and assert `runBatch` resolves with that agent `status: 'error'`.

**Warning signs:**
- Lead status bar stuck on "đang tổng hợp"/"đang chạy" indefinitely.
- `Promise.allSettled` followed by `Promise.all` over the same deferred set.
- No test that injects a failing agent.

**Phase to address:**
Phase 37 (group-chat delegation runtime) — this is a blocker for any concurrency work.

---

### Pitfall 8: No reentrancy guard on `send()` — concurrent sends corrupt run state

**What goes wrong (already present):**
`TeamWorkspace.handleSubmit` calls `void coordinator?.send(text)` (`TeamWorkspace.tsx:317-324`) with no in-flight check and no `await`. A second submit while the lead is thinking reaches `startLeadTurn` → `registry.get(lead.id).start(...)` → `TURN_IN_PROGRESS` throw. Because the promise is `void`-discarded, this is an unhandled rejection: the user message was already persisted (`send` saves it at `:653`), the lead turn never runs, and `phase` stays `lead-thinking` forever. The composer also passes `error={null}` (`:576`), so nothing is displayed.

**Why it happens:**
The coordinator exposes an async API and the UI treats it as fire-and-forget. The runtime's single-turn guard is the only protection, and it throws instead of queueing.

**How to avoid:**
- Coordinator owns the queue: `send()` returns a discriminated result (`{accepted} | {rejected, reason}`) or throws a typed `RUN_BUSY`; the UI disables submit while `phase` is any active phase.
- Persist the user message **after** the turn is accepted, or mark it pending and reconcile — never write a message that has no turn.
- Surface errors: pass a real `error` value to `ChatInputBar` instead of `null`.
- Test: two `send()` calls in the same tick → second is rejected, exactly one user message row, phase returns to `ready`.

**Warning signs:**
- `void coordinator?.send(` anywhere.
- Duplicate consecutive user messages in the transcript.
- Phase stuck at `lead-thinking` with no active turn in `aiTurnManager`.

**Phase to address:**
Phase 37.

---

### Pitfall 9: `teamTurnId` is registered but never finished — the status bar shows a phantom run forever

**What goes wrong (already present):**
`registerTeamTurn()` registers `aiTurnManager` turn `team:<teamId>` with status `'preparing'` (`teamRunCoordinator.ts:462-471`). `finishTurn` is only ever called for `agentTurnId(agentId)` (`:289-291`). `ACTIVE_AI_STATUSES` includes `preparing` (`aiTurnManager.ts:5-11`), so `useActiveAiTurns` reports a permanently active team turn. The bottom indicator never clears, and any "is something running?" decision based on that hook is wrong.

**Why it happens:**
The team turn was added for the indicator but the lifecycle was copied only for agents.

**How to avoid:**
Either finish `teamTurnId` in `send()`/`abortAll()`'s `finally`, or delete the team-level registration and derive the indicator from `snapshot.phase`. Add a test asserting `aiTurnManager.getActiveTurns()` is empty after a completed run.

**Warning signs:**
`getActiveTurns().length > 0` with `snapshot.phase === 'ready'`.

**Phase to address:**
Phase 37.

---

### Pitfall 10: "Configurable concurrency" implemented as a counter, not a queue

**What goes wrong:**
`startEmployeeTurn` sets `status: 'running'` and registers the runtime immediately (`:554-567`). With unlimited agents per group and a configurable limit N, a naive semaphore that *counts* without *queueing* produces:
- agents marked `running` while not actually started (UI lies, Stop targets a non-running runtime);
- `agentDeferreds` created for agents that never start;
- N+1 live `ChatTurnRuntime` instances, each holding a full message array (memory), each with an open SSE stream (browser per-origin connection limits, Tauri webview limits);
- budget accounting that charges agents that never ran.

**Why it happens:**
Concurrency is usually added at the `Promise.all` site, but the state machine and the runtime registry are the real concurrency boundary.

**How to avoid:**
- Model a per-team run queue: `queued → running → settled`, with the semaphore releasing a slot **after** `settleAgent`, not after `start()` returns.
- Only call `registry.get(agentId).start(...)` when a slot is acquired; `queued` agents have no runtime and no deferred.
- Make the limit a team setting persisted on `aiTeams` (not localStorage), applied live via `setTeamSettings`, and clamp it to `MAX_BATCH_SIZE`-independent bounds (e.g. 1..8).
- Test: limit 2, batch of 5 → at most 2 `running` at any observation, all 5 settle, order of completion irrelevant.

**Warning signs:**
- `running` count exceeds the configured limit in a snapshot.
- Runtimes created for agents whose status is `queued`.
- Concurrency setting read from `localStorage` (violates the "per-tab/team config is the only durable settings source" rule in 34-CONTEXT).

**Phase to address:**
Phase 37.

---

### Pitfall 11: Two group chats of the same team create two coordinators that double-spend and collide

**What goes wrong:**
`coordinatorRegistry` is keyed `${db.name}:${teamId}` (`TeamWorkspace.tsx:60-62`) and every chat for that team would resolve the same coordinator — but v1.4 wants *many group chats per team*, each with its own transcript and possibly its own run. If each chat builds its own coordinator:
- both construct with `teamUsed = sum(member.usedTokens)` (`teamRunCoordinator.ts:407`) → each believes the full budget is available;
- both write `aiTeamMembers.usedTokens` via non-transactional read-modify-write (`aiTeamRepo.ts:addUsedTokens`);
- both hold a `ChatTurnRuntime` per agent → `TURN_IN_PROGRESS` on collision;
- the per-team budget gate is duplicated, so "hard" budget becomes 2× budget.

**Why it happens:**
The v1.3 model is 1 team = 1 run = 1 transcript. Multi-chat breaks the identity.

**How to avoid:**
Pick one and document it:
- **(A) One run per team, chats are views.** All chats of a team share one coordinator; only one chat can be "active" for sending, others are read-only history. Simplest, preserves the budget invariant.
- **(B) One run per chat, one budget ledger.** Coordinator keyed `${teamId}:${chatId}`; move budget accounting into a Dexie transaction (`db.transaction('rw', aiTeamMembers, ...)` with a compare-and-set), and gate on the *team* ledger, not a per-coordinator counter.

Either way: `addUsedTokens` must become a transactional increment, and `ensureMembers` must re-read usage before every batch, not once at construction.

**Warning signs:**
- `coordinatorRegistry` keyed by team only while the UI opens multiple chats.
- Budget consumed > configured total with no top-up.
- `TURN_IN_PROGRESS` in the console when two chats run.

**Phase to address:**
Phase 36 (data model) decides; Phase 38 (budget) implements the ledger.

---

### Pitfall 12: Missing usage data means unlimited spend — the gate never closes

**What goes wrong:**
`normalizeUsageTotal` returns `totalTokens ?? prompt + completion` (`budgetGate.ts:84-86`). If a provider omits `usage` entirely (common with some proxies, some streaming modes, and abort/error paths), `onUsage` never fires (`aiOrchestratorLoop.ts:305-314`), `handleUsage` never runs, `teamUsed` stays flat, and the 80% crossing never happens. The "hard budget" is unbounded for that provider.

Also: `nineRouterClient.ts:333-335` maps only `prompt_tokens`/`completion_tokens`/`total_tokens`. Anthropic-style payloads carrying `cache_read_input_tokens` / `cache_creation_input_tokens` / `input_tokens` / `output_tokens` map to `undefined` → total 0.

**Why it happens:**
Usage is treated as guaranteed telemetry. It is optional in the OpenAI-compatible surface.

**How to avoid:**
- Define an explicit unknown-usage policy and implement it: estimate from prompt+completion character counts (`~4 chars/token`) and charge the estimate, flagged `estimated: true`; or refuse to continue past a threshold without a real usage report.
- Extend the usage mapper to accept `input_tokens`/`output_tokens` and to fold cache fields **once** (see Pitfall 14).
- Surface "usage unknown" in the budget UI — a silent zero is a lie.
- Test: a stream with no usage chunk still increments `usedTokens` by the estimate and still triggers the pause at the threshold.

**Warning signs:**
- `usedTokens` unchanged after a completed turn.
- Provider configs where `stream_options.include_usage` is ignored.
- Budget UI showing 0 used after real spend.

**Phase to address:**
Phase 38.

---

### Pitfall 13: Retries and multi-round turns reset or double the accounting baseline

**What goes wrong:**
Two independent baselines exist:
- `chatTurnRuntime` accumulates `tokenUsage` per `start()` (`:273`, `:340-346`) and calls `deps.onUsage(tokenUsage)` with a **cumulative** value.
- `teamRunCoordinator.handleUsage` diffs against `usageTotals.get(agentId)` and resets it only in `startEmployeeTurn`/`startLeadTurn` (`:553`, `:613`).

`ChatTurnRuntime.retry()` (`:531-537`) calls `start()` again, which resets the runtime's local `tokenUsage` to `{}` — but **does not** reset the coordinator's `usageTotals`. The first post-retry usage is smaller than the stored baseline → `delta <= 0` → `return` (`:418`). Every retried turn is free.

Symmetrically, the loop's "tools rejected, retry without tools" fallback (`aiOrchestratorLoop.ts:325-352`) re-streams the *same* prompt and adds its usage on top — that part is correct (real spend), but any future "retry the whole turn" wrapper that *replaces* rather than *adds* will double-count.

**Why it happens:**
Cumulative-vs-delta accounting is split across two layers with no shared identity for "a turn attempt".

**How to avoid:**
- Make the runtime emit **per-attempt deltas** (or an `attemptId` alongside the cumulative total) and have the coordinator key its baseline by `(agentId, attemptId)`.
- On `retry()`, explicitly signal a new attempt so the baseline resets.
- Charge the fallback attempt's usage (it is real spend) — never dedupe it.
- Test: turn → retry → assert `usedTokens` equals the sum of both attempts.

**Warning signs:**
- `delta <= 0` early-returns in `handleUsage` during normal operation.
- `usageTotals` only ever `delete`d at turn start.
- Budget audits that disagree with the provider dashboard.

**Phase to address:**
Phase 38.

---

### Pitfall 14: Cache tokens counted twice, or dropped

**What goes wrong:**
Providers differ:
- OpenAI-compatible: `prompt_tokens` **includes** cached tokens; `prompt_tokens_details.cached_tokens` is a subset. Summing them double-counts.
- Anthropic-style: `input_tokens` **excludes** `cache_read_input_tokens` and `cache_creation_input_tokens`. Not summing them under-counts.

`src/utils/agentMetrics.ts:26-31` sums `input + output + cacheRead + cacheCreate` — correct for Anthropic, wrong for OpenAI. `normalizeUsageTotal` (`budgetGate.ts:84`) does neither. With a hard budget, a 2× overcount pauses the run early; an undercount blows the budget.

**Why it happens:**
`ChatTokenUsage` has no field to express "is prompt inclusive of cache?".

**How to avoid:**
- Normalize at the client boundary (`nineRouterClient`) into a single canonical shape: `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens, promptIncludesCache: boolean }`.
- Compute `total = totalTokens ?? (promptIncludesCache ? input + output : input + output + cacheRead + cacheWrite)`.
- Make the budget charge **billed-equivalent** tokens if the user cares about cost, or raw tokens if they care about context. Pick one, write it in the UI label ("token" vs "token tính phí"), and test both provider shapes.
- Never let `agentMetrics.extractTokenCount` and `normalizeUsageTotal` diverge — one helper, two callers.

**Warning signs:**
- Two different token totals for the same turn in the UI and the transcript row.
- Budget consumed jumping 2× after enabling prompt caching.

**Phase to address:**
Phase 38.

---

### Pitfall 15: "Hard budget" enforced only at tool-round boundaries is not hard

**What goes wrong:**
`beforeToolRound` is awaited only when `loopCount > 1` (`aiOrchestratorLoop.ts:232`). Therefore:
- the **first** model call of every turn is unguarded;
- the round that crosses 80% completes in full before the gate is consulted;
- with concurrency C, overshoot is up to `C × one round` (each round can be a large tool-heavy prompt);
- a turn with no tool calls never hits a boundary at all — it runs to completion regardless of budget.

A user who sets a 100k budget can observe 300k+ spent.

**Why it happens:**
The only interruption point available is between rounds. Mid-stream aborts on a token counter are not implemented.

**How to avoid:**
- Charge a **reservation** before each model call: estimate `prompt tokens + max_output` and add it to a `reserved` counter; refuse the call if `used + reserved > budget`, releasing the reservation when real usage arrives. This makes the budget hard at call granularity.
- Check the gate **before round 1** too (a paused agent should not start a new turn).
- Define and display the enforcement semantics honestly: "budget is enforced before each model call; a single in-flight call may overshoot by up to its output limit".
- Test: budget smaller than one round's prompt → the turn is refused, not run.

**Warning signs:**
- Budget exceeded by more than one round's worth.
- `beforeToolRound` guarded by `loopCount > 1`.
- No `reserved` concept anywhere.

**Phase to address:**
Phase 38.

---

### Pitfall 16: Budget writes are fire-and-forget read-modify-write

**What goes wrong:**
`handleUsage` does `void addUsedTokens(memberId, delta, db).catch(() => {})` (`teamRunCoordinator.ts:454-459`). `addUsedTokens` is `get` → `+delta` → `update` **without a transaction** (`aiTeamRepo.ts:addUsedTokens`). Two writers to the same member row (two chats, two tabs, a restore, a second coordinator) lose updates. Errors are swallowed, so a failed write is invisible and the persisted budget silently diverges from the in-memory one.

**Why it happens:**
"Usage accounting must never break a turn" was implemented as "ignore all errors".

**How to avoid:**
- Use a Dexie transaction with a read-modify-write inside it (`db.transaction('rw', db.aiTeamMembers, ...)`) so IndexedDB serializes it.
- Batch deltas per turn and flush once at settle, rather than per usage chunk.
- Log (not throw) failures, and reconcile on next `ensureMembers` by preferring the persisted value when it is *higher*.
- Test: 20 concurrent `addUsedTokens` calls → final value equals the sum.

**Warning signs:**
- `void ... .catch(() => {})` around budget writes.
- Persisted `usedTokens` lower than the sum of transcript `tokenUsage`.

**Phase to address:**
Phase 38.

---

### Pitfall 17: Top-up and budget edit are not one transaction; gates can reopen on a decrease

**What goes wrong:**
`handleSaveSettings` (`TeamWorkspace.tsx:344-372`) does: `updateTeam(budget)` → `coordinator.setTeamBudget()` → a **loop** of `topUp`/`setMemberBudget` awaits. A failure mid-loop leaves the team total updated and some members not. `topUp` also opens the gate unconditionally for the agent scope (`:863`) and the team scope (`:878`) — if the amount is negative or the budget is still below the threshold, the turn resumes and immediately re-pauses (or, worse, spends past the threshold until the next crossing).

**Why it happens:**
Budget editing grew as a UI convenience layered over a top-up primitive designed for "add tokens".

**How to avoid:**
- One repository function `applyBudgetPlan(teamId, {total, perMember})` inside a single `rw` transaction over `aiTeams` + `aiTeamMembers`.
- Only open a gate when `bucketOf(used, budget) < 8` **and** the scope is not otherwise closed; reuse the existing `setTeamBudget` logic (`:809-820`) for every scope.
- Reject negative top-ups at the schema boundary (`budgetSchema` is non-negative, but `topUp(amount)` is unvalidated).

**Warning signs:**
- A `for` loop of awaits mutating budget after a separate `updateTeam`.
- `gate.open()` called without a bucket check.

**Phase to address:**
Phase 38.

---

### Pitfall 18: Skill edits mutate in place, so a running batch changes behavior mid-flight

**What goes wrong:**
`AiSkill` has a single `body` (`types/aiOffice.ts:58-65`); `read_skill` fetches the current row (`teamTools.ts:187-202`). If the user approves a new skill version while three agents are mid-batch, the next `read_skill` call returns the **new** body. Two agents in the same batch can work from different skill versions, and the lead's synthesis is unreproducible. There is no `version` field, no history, and no pinning.

**Why it happens:**
Skills were modeled as prompt templates, not as versioned artifacts. v1.4 adds versioning to the *UI* without adding it to the *runtime identity*.

**How to avoid:**
- Add `aiSkillVersions` (or `versions: SkillVersion[]` on the row, but a table is better for backup and size) with `{id, skillId, version, body, createdAt, approvedAt, approvedBy:'user'}`.
- Pin the version on the **assignment** (or on the run): `delegate_batch` records `skillVersionId`; `read_skill` serves the pinned version; the prompt states the version.
- Editing a skill creates a **draft**, never mutates the approved version.
- `aiEmployees.skillId` points at the skill; the *approved current version* is resolved at run start and frozen for the run.

**Warning signs:**
- `db.aiSkills.update(id, { body })` on an approved skill.
- `read_skill` reading `ctx.skillId` → `db.aiSkills.get` with no version argument.
- Two agents in one batch reporting different skill content.

**Phase to address:**
Phase 39.

---

### Pitfall 19: Skill enrichment writes directly, or claims approval it never received

**What goes wrong:**
"Agent proposes a lesson, user approves a new Markdown version" is exactly the shape that gets shortcut as: agent calls `update_skill` → row changes → UI says "đã cập nhật". This violates the project's standing constraint that AI edits are **proposals** requiring explicit user approval of a diff (PROJECT.md constraint "Studio artifact writes"; `ArtifactDiffApprovalCard` is the existing pattern), and it lets model output become future system-prompt content with no review.

Secondary hazard: an approved skill body is injected into future prompts. If enrichment output is not passed through `wrapUntrusted` / `neutralizeDelimiters` (`teamPrompts.ts:31-52`), a model-authored body can forge the delimiter and escape the untrusted block in later runs — a persistent prompt-injection channel.

**Why it happens:**
Enrichment feels like "the agent learning", which invites auto-save. And skill bodies are treated as trusted config because a human wrote the first one.

**How to avoid:**
- Enrichment produces a `SkillVersionProposal` row (status `pending`), rendered as a diff. Only `approveSkillVersion(proposalId, 'user')` creates an approved version.
- No AI tool may write an approved version. `update_skill`-style tools, if any, must be mutation-classified and parked on the approval card.
- Store `approvedBy`/`approvedAt` on the version; the UI must never display "approved" for a pending row.
- Keep `wrapUntrusted` on every skill body read, including approved versions (approved ≠ trusted for injection purposes).
- Test: agent proposes → version count unchanged → user approves → exactly one new approved version, previous still retrievable.

**Warning signs:**
- A tool named `update_skill` / `save_skill` / `learn` in `AI_DATABASE_TOOLS`.
- `approvedAt` set by anything other than an explicit user action.
- Skill body interpolated without `wrapUntrusted`.

**Phase to address:**
Phase 39.

---

### Pitfall 20: `strictObject` backup schemas make new skill fields forward-incompatible

**What goes wrong:**
`BackupAiSkillRecordSchema` is `z.strictObject` (`backupSchemas.ts:651-658`). Adding `versions`, `currentVersionId`, or `approvedAt` to the *export* means an older build (or a rollback) importing that payload gets `Unrecognized key` and rejects the **whole backup**. Conversely, adding the fields only to the export and not to the schema means they are rejected at export-validation time.

**Why it happens:**
`strictObject` was chosen deliberately (T-34-28) to stop silent stripping of `systemPrompt`-like fields. That is correct for *secrets*, but it also blocks additive evolution.

**How to avoid:**
- Keep `strictObject` for the security-sensitive tables, but bump the envelope version when adding required fields — and accept **both** versions on import (`z.union([v11Schema, v12Schema])` with a migration function).
- Prefer optional-absent fields (D-34's rule) so old payloads validate against the new schema and new payloads validate against the old one for the fields the old build knows.
- Add a fixture test: export with v1.4 → validate with the previous schema → assert it fails *only* on the new keys, then confirm the migration path handles it.

**Warning signs:**
- New required key in a `strictObject` without an envelope version bump.
- No "old build reads new backup" test.

**Phase to address:**
Phase 39 (with the backup work in Phase 36).

---

### Pitfall 21: Migrating one team transcript into many group chats breaks memory and search scoping

**What goes wrong:**
Every memory function is **thread-scoped**: `listRecentTurns(threadId)`, `listAssignmentHistory(threadId, agentId)`, `buildTeamBm25Docs(threadId)`, `getTeamTurn(threadId, turnId)` (`teamTranscriptRepo.ts`). Splitting a team into N group chats means:
- an agent's assignment history only covers the current chat — the lead's "every instruction ever given to it" (D-05/D-29) silently becomes "this chat";
- `search_team_history` only searches one chat, so cross-chat recall disappears;
- a turnId from another chat is refused (`TURN_NOT_IN_TEAM`), which is correct for isolation but wrong if the user expects team-wide memory.

Also structural: `chatThreads.scopeKey` is **unique** (`&scopeKey`, `schema.ts:64`), so a second thread for the same team needs `team:<teamId>:chat:<uuid>`; `chatTabs` has `&threadId` and `[scopeKey+active]`, so migration must preserve exactly one active tab per scope and one tab per thread.

**Why it happens:**
"Group chat" is a UI concept being added to a data model whose unit is "thread = memory scope".

**How to avoid:**
- Decide explicitly: **chat-scoped memory** (simple, matches the UI, but loses the "team remembers everything" promise) or **team-scoped memory with chat filter** (search across all team threads, recent window from the current chat). The v1.4 requirement "1 Leader + N agents, unlimited chats" implies the second.
- If team-scoped: add `listRecentTurnsByTeam(teamId, n)` (join threads by `scopeType='team'` + `entityId`), and make `search_team_history` search all team threads, returning `chatId` in each hit.
- Migration: for each existing `aiTeams` row, create one default group chat that **adopts** the existing `team:<teamId>` thread (do not create a new thread and orphan the transcript). Reuse the adoption pattern already in `chatTabRepo.getOrCreateActiveChatTab` (`:147-176`).
- Never re-point `chatMessages.threadId`; add the chat identity at the thread level.

**Warning signs:**
- A team's transcript shows only messages from after the migration.
- `search_team_history` returns nothing for pre-migration content.
- Two threads with the same `scopeKey` (unique index violation at migration time).

**Phase to address:**
Phase 36.

---

### Pitfall 22: `targetAgentId` is not in the backup schema — assignment history is lost on every restore

**What goes wrong (already present):**
`saveTeamMessage` persists `targetAgentId` (`teamTranscriptRepo.ts:57`), and `listAssignmentHistory` depends on it to attribute instruction rows to the assignee (`:101`). But `BackupChatMessageRecordSchema` (`backupSchemas.ts:300-333`) declares `agentId`, `agentName`, `agentKind`, `messageKind` — **not** `targetAgentId`. It is a plain `z.object`, so the field is silently stripped on import. After a restore, every instruction row looks like a lead message with no assignee: `listAssignmentHistory` falls back to `row.agentId === agentId`, which never matches, so agents lose their entire assignment history.

**Why it happens:**
The field was added in a review fix (CR-06) after the backup schema was written, and nothing tests the export→import round-trip for AI Office messages.

**How to avoid:**
- Add `targetAgentId: uuidSchema.optional()` to the backup message schema **now**, before any migration work.
- Add a round-trip test: save an instruction row → export → validate → restore → `listAssignmentHistory` returns it.
- Audit every field written by `saveTeamMessage` against the backup schema — this class of bug will recur with group-chat fields.

**Warning signs:**
- `grep targetAgentId src/validation` returns nothing.
- Post-restore agents behave as if they have no history.

**Phase to address:**
Phase 36 (fix immediately; it is a live data-loss bug).

---

### Pitfall 23: New tables silently vanish on restore (four lists must stay in sync)

**What goes wrong:**
Adding a table (e.g. `aiGroupChats`, `aiSkillVersions`, `aiSkillProposals`) requires **five** coordinated edits:
1. `src/db/schema.ts` (`SCHEMA_V18`) + `src/db/index.ts` (`version(18)` + `Table<>` declaration).
2. `exportBackup.ts` — the `Promise.all` array, the `tables` object, and the `counts` object (three separate places, easy to miss one).
3. `restoreBackup.ts` — `RESTORE_TABLES`, the clear list, and the `add(...)` calls.
4. `validateBackup.ts` — a `validateTable` call and referential checks.
5. `localSqlitePersistence.ts` `SQLITE_DOMAIN_TABLES` **and** `src-tauri/src/sqlite_persistence.rs` `ALLOWED_TABLES`.

Miss step 2/3: the table is exported (or not) and silently dropped on restore — `replaceTables` only adds known tables, and `BackupEnvelopeSchema.tables` is `z.record(z.string(), z.array(z.unknown()))`, so unknown keys pass validation. Miss step 5: the Tauri flush fails with `SQLITE_INVALID_TABLE`, or hydration silently `continue`s (`localSqlitePersistence.ts:255`) and the SQLite mirror loses the table.

**Why it happens:**
There is no single registry; the lists are hand-maintained in five files across two languages.

**How to avoid:**
- Create one `src/db/backupTableRegistry.ts` exporting `BACKUP_TABLES` and derive export/restore/validate/SQLite lists from it. The Rust side still needs its own list — add a test that asserts the TS list is a subset of the Rust list by parsing the `.rs` file (cheap, catches drift).
- Add a completeness test: for every key in `db.tables`, assert it appears in `BACKUP_TABLES` and in `SQLITE_DOMAIN_TABLES`.
- Round-trip test per new table: write one row → export → validate → restore → row present.

**Warning signs:**
- A new table appears in `schema.ts` but not in `exportBackup.ts`'s `counts`.
- `SQLITE_INVALID_TABLE` in the Tauri console.
- Restore reports a lower `totalRestored` than `counts`.

**Phase to address:**
Phase 36.

---

### Pitfall 24: Delete cascades leave dangling references that make the user's own backup invalid

**What goes wrong (already present):**
- `deleteLead` (`aiOfficeRepo.ts:151-156`) is a bare delete. `aiTeams.leadId` still points at it. `validateBackup.ts:628-632` rejects a team whose `leadId` is not in `aiLeads` → **the user's next export cannot be imported**.
- `deleteSkill` (`:204-209`) is a bare delete. `aiEmployees.skillId` dangles → `validateBackup.ts:643-647` rejects.
- `deleteEmployee` (`:88-93`) is a bare delete. `aiTeamMembers` rows survive; the backup validator does not check `member.agentId`, so it passes — but `runBatch` does `employees.find(...)` and `continue`s on miss (`teamRunCoordinator.ts:732-733`), silently dropping that assignment. The lead receives fewer results than it assigned, with no error.
- `deleteTeam` (`aiTeamRepo.ts`) removes team/members/links but **not** the `team:<id>` chat thread or its messages → an orphan transcript that no UI can reach, and the coordinator registry entry is never cleared.

**Why it happens:**
Repositories were written per-entity; referential integrity lives only in the backup validator, which runs at the wrong time (import, not delete).

**How to avoid:**
- Every delete becomes a transaction that either cascades or refuses:
  - lead in use → refuse with "lead đang được dùng bởi N nhóm" (the count helpers `countTeamsUsingEmployee` / `countAgentsUsingSkill` already exist and are unused);
  - skill in use → refuse or null out `skillId` explicitly;
  - employee in use → remove member rows in the same transaction;
  - team → delete thread + messages + settings + registry entry.
- Add a validation test that runs `validateBackupPayload` on an export taken **after** each delete path.

**Warning signs:**
- `db.aiTeams.toArray().filter(t => !leads.some(l => l.id === t.leadId))` non-empty.
- A batch returns fewer results than assignments with no error row.
- Orphan `chatThreads` with `scopeType='team'` and no matching `aiTeams` row.

**Phase to address:**
Phase 36 (data integrity), verified in Phase 40.

---

### Pitfall 25: Deleting a team or employee leaves a live coordinator running

**What goes wrong:**
`coordinatorRegistry` (`TeamWorkspace.tsx:60`) is a module-level `Map` with no eviction. Deleting a team, or removing an employee from a roster mid-run, leaves a coordinator holding runtimes with live streams writing to a deleted thread. The budget keeps being charged to deleted member rows (`addUsedTokens` throws, swallowed), and `aiTurnManager` keeps the phantom turns.

**Why it happens:**
The registry was added for "survive view switch" (D-22) and never got a teardown path.

**How to avoid:**
- `deleteTeam` / roster change must call `coordinator.abortAll()` and `registry.clear()` before the DB delete, and `coordinatorRegistry.delete(key)`.
- Add `dispose()` to `TeamRunCoordinator` (abort + clear + unsubscribe).
- Test: start a run, delete the team, assert no active turns and no further writes.

**Warning signs:**
- `coordinatorRegistry` grows across a session.
- Console writes to a threadId that no longer exists.

**Phase to address:**
Phase 37.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Stub SDLC imports instead of extracting shared modules | Build goes green in one commit | Ordinary chat silently loses approval card / conventions / diff rendering; every later change inherits the stub | Never |
| Delete SDLC rows without a Dexie migration | No migration code | Backup validator rejects the user's own export; restore resurrects SDLC tabs | Never |
| Keep "Phase 34 complete" as the quality baseline | No re-verification work | Ships known-broken flows; the v1.4 walkthrough finds them anyway, later and costlier | Never — the milestone brief explicitly forbids it |
| Enforce budget only at round boundaries | No reservation logic | Budget overshoots by `concurrency × one round`; "hard" is a lie | Only if the UI states "soft budget" |
| Fire-and-forget usage writes | Turn never blocked by accounting | Silent divergence between shown and persisted usage | Only with a reconciliation pass on next load |
| Per-team coordinator keyed by teamId while adding multi-chat | Zero refactor | Double spend, `TURN_IN_PROGRESS` collisions | Only if chats are read-only except one |
| `void coordinator.send()` | Simple UI code | Unhandled rejections, stuck phases, duplicate user messages | Never |
| One shared `ChatTokenUsage` shape for all providers | No per-provider code | Cache tokens double-counted or dropped | Only with a documented canonical mapping |
| `strictObject` on evolving tables | Blocks secret injection | Forward incompatibility on rollback | Acceptable with an envelope version bump |
| In-place skill body edits | No version table | Mid-run behavior change, unreproducible synthesis | Never once enrichment ships |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| Dexie migrations | Adding `version(18)` with `.stores()` only, no `.upgrade()` for data cleanup | `version(18).stores(SCHEMA_V18).upgrade(tx => ...)` to delete SDLC tabs/threads/settings atomically |
| Dexie unique index `chatThreads.&scopeKey` | Creating a second thread with `scopeKey = 'team:<id>'` | Use `team:<id>:chat:<uuid>`; adopt the legacy thread for the first chat |
| Dexie compound index `chatTabs.[scopeKey+active]` | Two active tabs after migration | Normalize one active per scope inside the migration transaction |
| Backup export | Adding a table to `tables` but not `counts` | Derive both from one registry; assert equality in a test |
| Backup import | `strictObject` + new required field | Optional-absent fields; envelope version union + migrate function |
| Backup restore | Assuming unknown table keys are preserved | `replaceTables` drops them — wire every table explicitly |
| Tauri SQLite mirror | Adding a Dexie table without `ALLOWED_TABLES` in Rust | Update `sqlite_persistence.rs` and `SQLITE_DOMAIN_TABLES` together; test the TS⊆Rust assertion |
| Tauri SQLite hydrate | Unknown `tableName` silently skipped | Fail loudly or assert coverage in a test |
| `aiTurnManager` | Registering a turn and never finishing it | Finish in `finally`; test `getActiveTurns()` is empty after completion |
| `ChatTurnRuntime` | Calling `start()` twice on one instance | One runtime per agent **and** per chat; queue instead of throwing |
| `notifyAIChatSync` (BroadcastChannel) | Cross-tab writes to budget rows without a transaction | Transactional increments; re-read on `storage`/sync events |
| `nineRouterClient` usage mapping | Assuming `prompt_tokens` includes cache | Normalize per provider; one canonical shape |
| `streamChatEvents` fallback | Treating the retry-without-tools attempt as free | Charge both attempts (real spend) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| `readThreadMessages` loads the whole thread then sorts in JS | Every agent turn reads the full transcript twice (`recent` + `assignmentHistory`); BM25 search reads it again | Add a compound index `[threadId+createdAt]` and use `.reverse().limit(n)`; cache per run | ~2k messages, or 3 agents × many rounds |
| `buildTeamBm25Docs` rebuilds the corpus per `search_team_history` call | Search latency grows linearly with transcript | Cache the corpus per thread per run; invalidate on new message | A few hundred turns |
| Unlimited agents per group, each with a full `ChatTurnRuntime` | Memory growth, many open SSE streams, browser connection limits | Concurrency queue (Pitfall 10) + bounded history | >5 concurrent agents |
| Per-usage-chunk Dexie writes | Write amplification during streaming | Batch deltas, flush at settle | Long tool-heavy turns |
| `aiTeamMembers` full-table reads in views (`db.aiTeamMembers.toArray()`) | Every write re-renders all views | Index by `teamId` (already) and query per team | Many teams/members |
| Coordinator constructed per render/effect re-run | Run torn down mid-flight (WR-06 comment documents a past instance) | Key the effect on `team.id` only; keep the registry | Any roster edit during a run |
| Restoring a large backup inside one transaction with per-row awaits | UI freeze | Bulk operations; chunked adds | >10k rows |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Skill body / enrichment output interpolated without `wrapUntrusted` | Persistent prompt injection into every future run | Keep `wrapUntrusted` + `neutralizeDelimiters` on every skill read, including approved versions |
| AI tool that writes an approved skill version | Model self-modifies its own instructions with no human review | Proposals only; approval is a user action, recorded on the version |
| `systemPrompt`/`persona` added to the backup payload | Backup schema rejects it (`FORBIDDEN_BACKUP_KEYS`) or leaks instruction text | Keep free text limited to `persona`/`body`; never add `systemPrompt` |
| New table exported without the secret denylist | Tokens land in an encrypted-but-public artifact | Route every new table through `isSafeBackupSetting`-style filtering; add a test |
| Group-chat titles / skill names rendered as HTML | Stored XSS in a Tauri webview | `renderSafeMarkdown` only; never `dangerouslySetInnerHTML` on raw model text |
| Deleting SDLC but keeping `sdlc_workflow:*` settings | Stale workflow state read by detail views | Migration deletes them; views stop reading them |
| Cross-chat `turnId` lookup | Data leak between group chats | `getTeamTurn` already checks `threadId`; keep the context-bound id rule for every new tool |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Paused run looks like a hang | User waits, then force-reloads and loses the run | Persistent banner naming the paused agent + one-click top-up (the `AgentPausedBanner` exists — verify it renders for the **team** gate too, not only agent gates) |
| Stopped agent's partial report treated as final | Lead synthesizes over incomplete data | `incomplete: true` is set (`:284`) — verify the lead's prompt and the transcript both show it |
| Composer stays enabled during a run | Duplicate sends, stuck phases | Disable submit while `phase` is active; show "đang chạy" |
| `error={null}` on the composer | Failures are invisible | Pass the real error; add a retry affordance |
| Assignment plan flashes away | User cannot tell what was approved | `lastPlan`/`lastPlanDecision` already persist — verify the card renders them |
| Budget UI shows a single number with no breakdown | User cannot tell who spent what | Show per-agent used/budget and team total; label estimated vs reported usage |
| Two "AI" entry points (SDLC button + AI Office) during transition | Confusing navigation | Single "AI Office" trigger in the same phase as the removal |
| Explorer two sections with no empty states | Feels broken on a fresh install | Empty state per section with a create CTA |
| Center editor opens a tab per click without dedupe | Tab explosion (cap 20, `MAX_OPEN_TABS`) | Reuse tab id per entity (`team_workspace:<teamId>`) — already the pattern |

---

## "Looks Done But Isn't" Checklist

- [ ] **SDLC removal:** `grep -rn "sdlc\|Sdlc\|SDLC" src` returns only legacy-schema and migration hits — verify no stubs, no `as any`, no dead allowlist entries.
- [ ] **SDLC data:** `db.chatTabs.where('type').equals('sdlc').count() === 0`, no `cr:*:sdlc` threads, no `sdlc_workflow:*` settings — verify on a DB that actually had SDLC data (seed one before migrating).
- [ ] **Backup round-trip:** export → validate → restore on a pre-v1.4 fixture **and** a v1.4 fixture — verify counts match and `targetAgentId` survives.
- [ ] **Layout migration:** launch with a persisted `viewType:'sdlc'` tab — verify it is dropped and `activeTabId` is valid.
- [ ] **Stuck run:** force one agent's `start()` to throw — verify the batch resolves with an error row, not a hang.
- [ ] **Reentrancy:** submit twice quickly — verify one user message, one turn, phase returns to `ready`.
- [ ] **Phantom turn:** complete a run — verify `aiTurnManager.getActiveTurns()` is empty.
- [ ] **Concurrency:** limit 2, batch 5 — verify at most 2 `running` and all 5 settle.
- [ ] **Budget with no usage:** provider returns no usage — verify `usedTokens` still increases (estimate) and the pause fires.
- [ ] **Budget with retry:** retry a turn — verify both attempts are charged.
- [ ] **Budget hard stop:** budget below one round's prompt — verify the call is refused, not run.
- [ ] **Cache tokens:** one OpenAI-shaped and one Anthropic-shaped usage payload — verify the same canonical total.
- [ ] **Skill pinning:** approve a new version mid-batch — verify running agents keep the pinned version.
- [ ] **Enrichment approval:** agent proposes — verify no approved version exists until the user approves, and the diff is shown.
- [ ] **Delete cascades:** delete a lead/skill/employee in use — verify refusal or cascade, and that a fresh export still validates.
- [ ] **Multi-chat memory:** create a second chat — verify `search_team_history` covers both (or the UI says it does not).
- [ ] **Tauri mirror:** add a table — verify flush succeeds (no `SQLITE_INVALID_TABLE`) and hydrate restores the rows.
- [ ] **Observed walkthrough:** every item above is confirmed by an actual UI walkthrough, not by reading code.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| SDLC rows poison backup validation | MEDIUM | Ship a migration that deletes SDLC tabs/threads/settings; relax the validator; re-export |
| Backup enum tightened | HIGH | Restore the enum member, add a tolerant import path; the user's old file is the only copy — offer a "repair" path |
| Documents deleted with SDLC | HIGH | Restore from `last_pre_import_snapshot` or the encrypted GitHub backup; then re-run the classified migration |
| Stuck batch run | LOW | Global Stop (`abortAll`) resolves the plan and settles agents; add the watchdog so the user does not have to find it |
| Double-spent budget | MEDIUM | Recompute `usedTokens` from `chatMessages.tokenUsage` sum per agent; write back in one transaction |
| Lost assignment history after restore | MEDIUM | Add `targetAgentId` to the schema; for already-restored data, reconstruct from `agentId` + adjacency (instruction immediately followed by report) — lossy, document it |
| Orphan team transcript | LOW | Re-link by `scopeType='team'` + `entityId`, or delete with confirmation |
| Skill version changed mid-run | LOW | Abort the batch and re-run with the pinned version; the transcript shows the divergence |
| SQLite mirror drift | MEDIUM | `hydrateDexieFromSqlite` prefers SQLite rows — do not run it blindly after a divergence; compare counts first |

---

## Pitfall-to-Phase Mapping

Proposed v1.4 phase numbering (roadmap not yet written; Phase 34 is the last shipped phase):

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 1 Shared-service audit before deletion | Phase 35 | Audit table committed; no stubs in the diff |
| 2 Persisted SDLC rows | Phase 35 | Migration test on a seeded SDLC DB |
| 3 Backup enum tolerance | Phase 35 | Fixture with `type:'sdlc'` validates |
| 4 Layout tab migration | Phase 35 (+ Phase 40 for final nav) | Store hydration test |
| 5 `sdlcArtifact` / document sets | Phase 35 | Note counts unchanged after migration |
| 6 Knowledge schema move | Phase 35 | Knowledge publish test still green |
| 7 Stuck batch run | Phase 37 | Failing-agent injection test |
| 8 `send()` reentrancy | Phase 37 | Double-submit test |
| 9 Phantom `teamTurnId` | Phase 37 | `getActiveTurns()` empty after run |
| 10 Concurrency queue | Phase 37 | Limit-2/batch-5 test |
| 11 Multi-chat coordinator/budget identity | Phase 36 (decide) + Phase 38 (ledger) | Two-chat spend test |
| 12 Missing usage | Phase 38 | No-usage stream test |
| 13 Retry baseline | Phase 38 | Retry accounting test |
| 14 Cache tokens | Phase 38 | Two provider shapes, one total |
| 15 Boundary-only budget | Phase 38 | Budget-below-one-round refusal test |
| 16 Fire-and-forget writes | Phase 38 | 20 concurrent increments test |
| 17 Top-up/edit atomicity | Phase 38 | Partial-failure test |
| 18 Skill version pinning | Phase 39 | Mid-batch approval test |
| 19 Enrichment approval | Phase 39 | Proposal→approve test |
| 20 `strictObject` evolution | Phase 39 (+ Phase 36 backup work) | Old-build-reads-new-backup test |
| 21 Multi-chat memory scoping | Phase 36 | Cross-chat search test |
| 22 `targetAgentId` backup gap | Phase 36 | Round-trip test |
| 23 Five-list table registration | Phase 36 | Registry completeness test |
| 24 Delete cascades | Phase 36 | Post-delete export validates |
| 25 Coordinator teardown | Phase 37 | Delete-during-run test |

**Ordering rationale:** Phase 35 (removal) must precede everything — the shared-service audit determines which modules the new workspace can reuse. Phase 36 (data model + migration) must precede the runtime work, because multi-chat identity decides whether budget is per-team or per-chat. Phase 37 (runtime reliability + concurrency) must precede budget enforcement, because a hung run cannot be budget-tested. Phase 38 (budget) precedes skill enrichment, because enrichment runs cost tokens. Phase 39 (skills) precedes the final UX phase. Phase 40 is the observed walkthrough that closes the milestone — no phase may be marked complete on code reading alone.

---

## Sources

Code-verified (this repository, 2026-11-09):
- `src/services/ai/office/teamRunCoordinator.ts` — deferred lifecycle (`:563-567`, `:758-763`), usage diffing (`:413-460`), gate wiring (`:499-507`), team turn registration (`:462-471`), settle (`:276-296`)
- `src/services/ai/office/budgetGate.ts` — `bucketOf`, `shouldNotifyPause`, `normalizeUsageTotal`
- `src/services/ai/office/teamTools.ts` — `read_skill` (`:187-202`), refusal codes, `delegate_batch` validation
- `src/services/ai/office/teamPrompts.ts` — `wrapUntrusted` / `neutralizeDelimiters` (`:31-52`)
- `src/services/ai/office/teamRunRegistry.ts` — one runtime per agent
- `src/components/ai/runtime/chatTurnRuntime.ts` — `TURN_IN_PROGRESS` (`:220`), cumulative usage (`:340-346`), `retry()` (`:531-537`)
- `src/services/ai/aiOrchestratorLoop.ts` — `beforeToolRound` only when `loopCount > 1` (`:232`), usage accumulation (`:305-314`), tools fallback (`:325-352`)
- `src/services/ai/nineRouterClient.ts` — usage mapping (`:333-335`, `:426-428`), `stream_options.include_usage` (`:192`, `:207`)
- `src/services/ai/aiTurnManager.ts` — `ACTIVE_AI_STATUSES`, `finishTurn`
- `src/db/schema.ts` — `SCHEMA_V16`/`SCHEMA_V17`, unique `chatThreads.&scopeKey`, `chatTabs` indexes
- `src/db/index.ts` — `version(14)` backfill creates SDLC tabs, `version(17)`
- `src/db/repositories/chatTabRepo.ts` — SDLC tab creation, tab/thread adoption
- `src/db/repositories/aiTeamRepo.ts` — non-transactional `addUsedTokens`, bare deletes
- `src/db/repositories/aiOfficeRepo.ts` — bare `deleteEmployee`/`deleteLead`/`deleteSkill`
- `src/db/repositories/teamTranscriptRepo.ts` — thread-scoped memory, `targetAgentId`
- `src/validation/backupSchemas.ts` — `type: ['chat','sdlc']` (`:240`), `targetAgentId` absent (`:300-333`), `strictObject` AI Office schemas (`:608-688`), `BACKUP_SCHEMA_VERSION = 11`
- `src/services/backup/exportBackup.ts` — `CURRENT_SCHEMA_VERSION = 11`, three parallel lists
- `src/services/backup/restoreBackup.ts` — `legacyTabRows` SDLC generation, `replaceTables` clear/add lists
- `src/services/backup/validateBackup.ts` — SDLC invariants (`:392-418`), AI Office referential checks (`:625-647`)
- `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` — two hand-maintained table lists
- `src/workbench/store/layoutStore.ts` — persisted `openTabs`, no `migrate`
- `src/workbench/EditorArea.tsx` — `'sdlc'` case and `default:` → `TasksView`
- `src/components/ai/office/TeamWorkspace.tsx` — module-level registry, `void send`, `error={null}`
- `src/components/ai/AiChatWidget.tsx`, `AIChatDrawer.tsx`, `workbench/editor/RemoteFileViewer.tsx`, `validation/knowledgeSchemas.ts` — surviving SDLC dependencies
- `.planning/phases/34-.../34-CONTEXT.md` — D-02/D-05/D-10/D-20/D-21/D-29/D-31/D-32/D-34 (hypotheses; several are implemented differently than described)

General patterns (MEDIUM confidence, applied from domain knowledge; no external source retrieved in this session):
- Multi-agent orchestration failure classes: unbounded delegation, missing termination, partial-result synthesis, non-deterministic batch ordering.
- Token accounting: optional usage telemetry, cache-token inclusion semantics differing per provider, retry double-counting, reservation-based hard limits.

---
*Pitfalls research for: v1.4 Unified AI Office — SDLC Studio removal, multi-agent group chats, hard token budgets, skill versioning*
*Researched: 2026-11-09*
