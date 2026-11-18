# Phase 37: Runtime reliability + concurrency - Pattern Map

**Mapped:** 2026-11-11
**Files analyzed:** 25 (3 new, 22 modified)
**Analogs found:** 23 / 25 (1 partial: no existing outbox/queue UI; 1 modified file has no prompt-rule analog)

## Anchor corrections (read before planning)

CONTEXT.md line/version numbers were verified against the tree. **Do not inherit these stale anchors:**

| CONTEXT claim | Actual tree | Note |
|---|---|---|
| Ledger = Dexie **V20** (D-22) | V20 and V21 are **already taken** by post-36 repairs (`src/db/schema.ts:143-146`, `src/db/index.ts:561-621`). Next is **V22**. `LATEST_SCHEMA_VERSION = 21` (`schema.ts:150`). | Planner must write `SCHEMA_V22` + `this.version(22)`. |
| `AiOfficeExplorer.handleDeleteTeam` (`:82-86`) | File lives at **`src/workbench/toolwindows/AiOfficeExplorer.tsx`**, not `src/components/ai/office/`. Handler at `:84-88`. | Path correction. |
| `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:194-198`) | Actual `:194-199`; the recursive regex gate is `:201-219`. | Also: `diagnostics` is a banned *key*, but regex `diagnostic` does **not** match `diagnosticDetail` (verified). `error`, `stack`, `prompt` are banned both ways. |
| `registerTeamTurn` "`:562-571` registers and never finishes" | Correct — `:562-571`, registration call site `:793` inside `send()`. | No drift. |
| `runBatch` `:872-930` | Correct; `Promise.allSettled(started)` `:900`, `await Promise.all(deferreds)` `:903-905`. | Replace both with scheduler. |
| Pitfall 9 in `PITFALLS.md` cites `:462-471` / `:289-291` | Stale. Live lines are `:562-571` / `:335-337`. | PITFALLS.md is research, not authority (CONTEXT already says so). |
| Pitfall 23 says "four lists" | **Five** lists + a parity test now exists: `tests/db/tableListParity.test.ts`. | `SCHEMA_V18` in that pitfall is also stale (now V21→V22). |
| `teamRunCoordinator.test.ts` "45+ tests" | **44** `it(` blocks in the file. | Extend, keep all. |
| D-02 "default 3 matches `ghostDevConfig.ts` range" | Range matches (clamp **1–12**), but ghost-dev's *default* is **6**, not 3 (`ghostDevConfig.ts:13`, clamp `:54`). | Only the range is shared; default 3 is a Phase 37 choice. |

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/services/ai/office/scheduler.ts` **(NEW)** | service (queue/semaphore) | event-driven / request-response | `src/services/ai/office/budgetGate.ts` | exact (park + abort-aware wait) |
| `src/services/ai/office/teamRunManager.ts` **(NEW)** | service (module-level registry) | request-response | `src/services/ai/runtime/tabRuntimes.ts` + `TeamWorkspace.tsx:62-74` | exact (move-out) |
| `src/db/repositories/aiTeamRunRepo.ts` **(NEW)** — `aiTeamBatches` + `aiTeamAssignments` | repo | CRUD + append-only ledger | `src/db/repositories/aiSkillVersionRepo.ts` (append-only) + `publishAttemptRepo.ts` (bounded history, rw tx) | role-match |
| `src/db/repositories/teamTranscriptRepo.ts` (modify) | repo | CRUD | itself (`saveTeamMessage :42-68`) | exact |
| `src/types/aiOffice.ts` (modify) | model/contract | — | `AiSkillVersion` block `:105-120` | exact |
| `src/types/models.ts` (modify `ChatMessage :281-303`) | model | — | `:292-302` attribution fields | exact |
| `src/db/schema.ts` + `src/db/index.ts` (modify, **V22**) | config/migration | — | `SCHEMA_V19` `:137-140`, `version(19)` `index.ts:554` | exact |
| `src/db/repositories/aiTeamRepo.ts` (modify) | repo | CRUD, Dexie `rw` read-then-write | itself `lockLeader :275-303`, `deleteTeam :306-325` | exact |
| `src/services/ai/office/teamRunCoordinator.ts` (modify) | service (state machine) | event-driven | itself | exact |
| `src/services/ai/office/teamTools.ts` (modify) | service (tool schema) | request-response | itself `:292-321` | exact |
| `src/services/ai/office/teamPrompts.ts` (modify) | utility (prompt build) | transform | itself `:155-170` | exact |
| `src/components/ai/office/TeamWorkspace.tsx` (modify) | component | request-response | itself `:386-414`, `:694-752` | exact |
| `src/components/ai/office/TeamSettingsDrawer.tsx` (modify) | component | CRUD form | itself `:20-25`, `:55-74`, `:155-170` | exact |
| `src/workbench/toolwindows/AiOfficeExplorer.tsx` (modify) | component | request-response | itself `:84-88` | exact |
| `src/validation/aiOfficeSchemas.ts` (modify) | validation | — | `AiTeamInputSchema` `:86-95`, `AiTeamUpdateSchema` `:96-104` | exact |
| `src/validation/backupSchemas.ts` (modify) | validation | — | `BackupAiTeamRecordSchema` `:617-629` | exact |
| `src/types/backup.ts` (modify) | model | — | `BackupTableData` `:45-74` | exact |
| `src/services/backup/exportBackup.ts` (modify) | service | file-I/O | itself 3 blocks `:191-197`, `:252-281`, `:283-312` | exact |
| `src/services/backup/restoreBackup.ts` (modify) | service | file-I/O | itself 3 blocks `:26-56`, `:59-67`, `:229-296` | exact |
| `src/services/backup/validateBackup.ts` (modify) | service | transform | itself `:232-243`, `:588-622` | exact |
| `src/services/localSqlitePersistence.ts` (modify) | config | file-I/O | `SQLITE_DOMAIN_TABLES` `:14-34` | exact |
| `src-tauri/src/sqlite_persistence.rs` (modify) | config | file-I/O | `ALLOWED_TABLES` `:5-28` | exact |
| `tests/services/ai/office/teamRunCoordinator.test.ts` (extend) | test | — | harness `:89-181` | exact |
| `tests/db/tableListParity.test.ts` (extend) | test | — | itself `:45-84` | exact |
| Outbox UI (inside `TeamWorkspace.tsx`) | component | event-driven queue | **none** — no queue UI exists in repo | no analog |

---

## Pattern Assignments

### `src/services/ai/office/scheduler.ts` (NEW — service, queue)

**Analog:** `src/services/ai/office/budgetGate.ts` (88 lines, exact structural match for the park)
**Secondary:** `src/services/ai/office/teamRunRegistry.ts` (59 lines, idempotent `clear()`/`abortAll()` shape)

D-07 says mirror `budgetGate.ts`'s contract. The parts to copy verbatim in *shape*: deferred-resolver installed **before** publishing, abort listener with `{ once: true }`, immediate reject when the signal is already aborted.

**Park/resolve core** (`budgetGate.ts:33-61`):
```ts
return {
  close() { closed = true; },
  open() { closed = false; release(); },          // release() reads+nulls the resolver first
  isClosed() { return closed; },
  wait(signal?: AbortSignal) {
    if (!closed) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        resolver = null;
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      resolver = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
    });
  },
};
```

**Hooks the scheduler needs from the same file:** `release()` nulls the slot *before* invoking it (`:27-31`) — the scheduler's `release()` must be idempotent for the same reason (settle can be reached twice: `onCompleted` and `finally`).

**`clear()` bulk-abort shape** (`teamRunRegistry.ts:48-54`):
```ts
abortAll() { for (const runtime of entries.values()) runtime.abort(); },
clear() {
  for (const runtime of entries.values()) runtime.abort();
  entries.clear();
},
```

**Scheduler contract (D-07):** `acquire(signal) → handle`, `release(handle)` idempotent, `setLimit(n)` drains FIFO, `cancel(handle)` for a queued assignment. Queue order is **plan order** (D-05) — an array of handles, not a priority structure. Slot release must happen **after `settleAgent`** (Pitfall 10), not after `start()` returns.

**Test analog:** `tests/services/ai/office/budgetGate.test.ts:9-50` — node env, no DB, `await Promise.resolve()` to assert a promise is still parked.

---

### `src/services/ai/office/teamRunManager.ts` (NEW — service, module-level registry)

**Analog (the thing being moved):** `src/components/ai/office/TeamWorkspace.tsx:62-74`
**Analog (the target shape):** `src/services/ai/runtime/tabRuntimes.ts:26-60`

**Current registry to evacuate** (`TeamWorkspace.tsx:62-74`):
```ts
interface CoordinatorEntry {
  coordinator: TeamRunCoordinator;
  threadId: string;
}

const coordinatorRegistry = new Map<string, CoordinatorEntry>();
const registryKey = (db: TaskPlannerDatabase, teamId: string) => `${db.name}:${teamId}`;
```

**Target API shape** (`tabRuntimes.ts:26-60` — `get`/`peek`/`discard`/`abortAll`/`getSnapshot`):
```ts
export interface TabTurnRegistry {
  get(tabId: string, threadId: string): ChatTurnRuntime;
  peek(tabId: string): ChatTurnRuntime | undefined;
  /** Aborts the tab's runtime and drops it, so the next `get` starts clean. */
  discard(tabId: string): void;
  ...
}
```

Map onto ARCHITECTURE.md §4 item 1: export `getOrCreateRun(...)`, `peekRun(teamId)`, `disposeRun(teamId)`. `disposeRun` is D-18's `dispose(teamId)` and must do, in order: abort inbox, `coordinator.abortAll()`, resolve deferreds (abortAll already settles+resolves), close ledger (`abortedBy:'team-deleted'`), `registry.clear()` via the coordinator, then drop the map entry.

**Call sites to rewrite:** `TeamWorkspace.tsx:233` (`get`), `:320` (`set`); `AiOfficeExplorer.tsx:84-88` gains `await disposeRun(team.id, db)` **before** `deleteTeam`.

---

### `src/db/repositories/aiTeamRunRepo.ts` (NEW — repo, append-only ledger)

**Primary analog:** `src/db/repositories/aiSkillVersionRepo.ts` (101 lines — most recent append-only versioned table)
**Secondary analog:** `src/db/repositories/publishAttemptRepo.ts` (`:24-128` bounded history in one `rw` tx)

**Append-only + monotonic-in-transaction pattern** (`aiSkillVersionRepo.ts:54-80`):
```ts
export async function createSkillVersion(
  input: AiSkillVersionDraft,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiSkillVersion> {
  const validated = AiSkillVersionInputSchema.parse(input);

  return db.transaction('rw', [db.aiSkillVersions, db.aiSkills], async () => {
    const skill = await db.aiSkills.get(validated.skillId);
    if (!skill) throw new Error(MISSING_SKILL_MESSAGE);

    const latest = await getLatestSkillVersion(validated.skillId, db);
    const row: AiSkillVersion = {
      id: generateId(),
      skillId: validated.skillId,
      version: (latest?.version ?? 0) + 1,
      ...
    };
    await db.aiSkillVersions.add(row);
    return row;
  });
}
```

`attemptNo` (D-23) is computed the same way: read `max(attemptNo)` for `retryOfAssignmentId`'s root inside the `rw` tx, insert `+1`. Never mutate an existing attempt row.

**Read-before-write transition guard** — this is exactly D-09's `transitionAssignment(id, from, to, patch)`. Copy `decideSkillVersion` (`aiSkillVersionRepo.ts:82-101`):
```ts
return db.transaction('rw', [db.aiSkillVersions], async () => {
  const existing = await db.aiSkillVersions.get(id);
  if (!existing) throw new Error(MISSING_VERSION_MESSAGE);
  // WR-08/D-16: the recorded decision is preserved, never flipped.
  if (existing.status !== 'pending') throw new Error(ALREADY_DECIDED_MESSAGE);

  const updated: AiSkillVersion = { ...existing, status, decidedAt: new Date().toISOString() };
  await db.aiSkillVersions.put(updated);
  return updated;
});
```
For Phase 37 the guard becomes `if (existing.runStatus !== from) return null;` (or a typed refusal — never a silent write), and `patch` carries `to` + fields.

**Compound-index read** (`aiSkillVersionRepo.ts:44-52`) is the pattern for `[batchId+agentId]` / `[batchId+attemptNo]`:
```ts
return db.aiSkillVersions
  .where('[skillId+version]')
  .between([skillId, 0], [skillId, Number.MAX_SAFE_INTEGER])
  .last();
```

**Index spec to declare in `SCHEMA_V22`** (following `aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt'`, `schema.ts:139`):
- `aiTeamBatches: 'id, teamId, threadId, [threadId+batchIndex], startedAt'`
- `aiTeamAssignments: 'id, batchId, agentId, [batchId+attemptNo], runStatus, retryOfAssignmentId'`

**Bounded/append history in one tx** (`publishAttemptRepo.ts:106-123`) — the precedent for "never prune the ledger for storage reasons" is the *opposite*: the ledger keeps every attempt (D-23), so do **not** copy the prune block; copy only the tx + sort discipline.

**Field-name constraints (D-17):** all proposed names were checked against `FORBIDDEN_BACKUP_KEYS` + the recursive regex (`backupSchemas.ts:194-219`). Safe: `runStatus`, `stopReason`, `diagnosticDetail`, `tokenUsage`, `toolCallCount`, `batchIndex`, `attemptNo`, `abortedBy`, `phaseAtEnd`, `planSnapshot`, `supersededByMessageId`. **Unsafe:** `error`, `stack`, `prompt`, `runtime`, `systemPrompt`, `diagnostics`.

---

### `src/types/aiOffice.ts` (modify — model/contract)

**Analog:** the `AiSkillVersion` block in the same file, `:105-120`.

**Contract shape to copy** (`:105-120`):
```ts
export type AiSkillVersionStatus = 'pending' | 'approved' | 'rejected';

export interface AiSkillVersion {
  id: string;
  skillId: string;
  /** 1-based, monotonic per skill. */
  version: number;
  status: AiSkillVersionStatus;
  ...
  createdAt: string;
  decidedAt?: string | undefined;
}
```

Add exports (names per D-22; field shapes are Claude's discretion per DISCUSSION-LOG "Tên field ledger"):

- `AiTeamBatchPhaseEnd`, `AiTeamBatchAbortedBy = 'user'|'team-deleted'|'app-exit'|'none'`
- `AiTeamAssignmentRunStatus = 'queued'|'running'|'done'|'stopped'|'error'|'skipped'|'blocked'|'needs-input'` (D-24 needs the last two representable)
- `AiTeamAssignmentStopReason = 'user-per-agent'|'user-abort'|'team-deleted'|'provider'|'tool-limit'|'budget-pause'|'none'`
- `AiTeamBatch`, `AiTeamAssignment` interfaces (D-22 fields verbatim)
- Team concurrency constant: `DEFAULT_TEAM_CONCURRENCY = 3`, `MIN_TEAM_CONCURRENCY = 1`, `MAX_TEAM_CONCURRENCY = 12`, and `clampTeamConcurrency(n)` — closer to `MAX_BATCH_SIZE` (`:138-141`) than to `ghostDevConfig.ts`.

**Do not** extend `AgentRunStatus` (`:33`) — that is the *UI* run status, consumed by `AgentStatusRow`. The ledger's `runStatus` is a separate union (D-22) because it carries `skipped`/`blocked`/`needs-input`.

**Delete:** `MAX_BATCH_SIZE` (`:138`) and its `// D-02` comment (D-06, one-way).

---

### `src/types/models.ts` (modify `ChatMessage`, `:281-303`)

**Analog:** the Phase 34 attribution block that sits directly above the insertion point (`:292-302`).

```ts
  // Phase 34 D-31: AI Office attribution. All optional so existing rows stay valid.
  agentId?: string | undefined;
  agentName?: string | undefined;
  agentKind?: 'lead' | 'employee' | undefined;
  messageKind?: 'instruction' | 'report' | 'synthesis' | 'plan' | undefined;
  targetAgentId?: string | undefined;
```

Same style for D-22 links: `batchId?`, `assignmentId?`, `attemptNo?`, `runStatus?`, `stopReason?`, `incomplete?`, `supersededByMessageId?`, `supersededAt?`. All optional, all `| undefined` (project uses `exactOptionalPropertyTypes` — `src/types/aiOffice.ts:76` precedent).

**Critical:** `BackupChatMessageRecordSchema` is a plain `z.object` (`backupSchemas.ts:291-329`) — undeclared keys are silently stripped on restore. Every new link field must be declared there too (comment at `:320-321` states exactly this failure mode).

---

### `src/db/schema.ts` + `src/db/index.ts` (modify — migration **V22**)

**Analog:** `SCHEMA_V19` (`schema.ts:137-140`) + `this.version(19)` (`index.ts:554`).

```ts
// Phase 36 (D-16, D-22): skill revisions. Purely additive — no existing store index spec
// is touched, so no index rebuild and no `.upgrade()` hook is needed.
export const SCHEMA_V19 = {
  ...SCHEMA_V18,
  aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt',
} as const;
```
```ts
this.version(19).stores(SCHEMA_V19);
```

Deliverables:
1. `SCHEMA_V22 = { ...SCHEMA_V21, aiTeamBatches: '...', aiTeamAssignments: '...' }` — additive, **no `.upgrade()` hook** (C-16: old data is test data; no backfill). Add a comment saying so, matching the V19/V20/V21 comment style.
2. `this.version(22).stores(SCHEMA_V22);` after `:621`, before the `this.on('blocked'...)` block at `:623`.
3. `LATEST_SCHEMA_VERSION = 22` (`schema.ts:150`).
4. Two `Table<>` declarations after `:96`.

**Gotcha from the tree:** V20/V21 both attach `.upgrade()` hooks tied to their own version numbers (`index.ts:561-577`, `:586-621`). Do not renumber them; append V22.

---

### `src/db/repositories/aiTeamRepo.ts` (modify — repo)

**Analog A — team-wide `rw` transaction with a read-then-write guard** (`:275-303`, `lockLeader`):
```ts
return db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
  const existing = await db.aiTeams.get(teamId);
  if (!existing) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
  if (existing.leaderLockedAt !== undefined) return existing;   // idempotent re-entry
  ...
  await db.aiTeams.put(updated);
  return updated;
});
```

**Analog B — the cascade + transaction list that `dispose` must precede** (`:306-325`, `deleteTeam`):
```ts
export async function deleteTeam(id: string, db: TaskPlannerDatabase = defaultDb): Promise<void> {
  await db.transaction(
    'rw',
    [db.aiTeams, db.aiTeamMembers, db.aiTeamLinks, db.chatThreads, db.chatMessages, db.chatTabs],
    async () => {
      const threads = await db.chatThreads.where('scopeKey').equals(`team:${id}`).toArray();
      for (const thread of threads) {
        await db.chatMessages.where('threadId').equals(thread.id).delete();
        await db.chatTabs.where('threadId').equals(thread.id).delete();
        await db.chatThreads.delete(thread.id);
      }
      await db.aiTeamMembers.where('teamId').equals(id).delete();
      await db.aiTeamLinks.where('teamId').equals(id).delete();
      await db.aiTeams.delete(id);
    }
  );
}
```

Phase 37 changes:
- Add `aiTeamBatches` + `aiTeamAssignments` to that transaction's table list and delete by `teamId` / `batchId` (D-18 closes the ledger with `abortedBy:'team-deleted'` *before* the delete; the delete then removes the rows).
- Add `AiTeam.concurrencyLimit?: number` handling to `updateTeam` (`:172-227`) — the `'autoSplitEnabled' in patch` idiom at `:203-215` is the precedent for optional-field add/remove semantics.

**Do not copy** `addUsedTokens` (`:457-468`) for ledger writes: it is `get` → `update` outside a transaction (Pitfall 16); ledger transitions must go through `transitionAssignment` (D-09).

---

### `src/services/ai/office/teamRunCoordinator.ts` (modify — service/state machine)

**Analog:** itself. Per-site excerpts:

**Deferred + settle (WR-01 shape to preserve, `:213-225`, `:322-343`):**
```ts
function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
```
```ts
function settleAgent(agentId: string, status: AgentRunStatus, report?: string): void {
  const state = agents.get(agentId);
  // WR-01: the status write and the deferred release are independent — a settle that
  // lands on an already-terminal agent must still release the batch's await.
  if (state && !TERMINAL_STATUSES.includes(state.status)) { ... }
  releaseLiveUse(agentId);
  agentDeferreds.get(agentId)?.resolve();
  agentDeferreds.delete(agentId);
  notify();
}
```

**Registration that leaks (D-19, `:562-571`):**
```ts
function registerTeamTurn(): void {
  aiTurnManager.registerTurn({
    id: teamTurnId, scopeKey: teamId, title: liveTeam.name, status: 'preparing',
    streamingStatusLabel: null, abort: () => abortAll(),
  });
}
```
Called at `:793` in `send()`; **no `finishTurn(teamTurnId)` anywhere**. Fix: `try { ... } finally { aiTurnManager.finishTurn(teamTurnId); }` around `send()`'s body.

**The unbounded dispatch to replace (D-01/D-07, `:872-905`):**
```ts
const started: Array<Promise<void>> = [];
for (const assignment of assignments) {
  const employee = roster.employees.find((row) => row.id === assignment.agentId);
  if (!employee) continue;
  await saveTeamMessage({ ... messageKind: 'instruction', targetAgentId: employee.id }, db);
  started.push(startEmployeeTurn(employee, assignment.task, lastUserRequest, priorBatchResults));
}

// Concurrency: one runtime per agent, so three turns really do run at once (D-02).
await Promise.allSettled(started);
await Promise.all([...agentDeferreds.values()].map((deferred) => deferred.promise));
```
Replace with: per-assignment `await scheduler.acquire(signal)` → ledger `transitionAssignment(id,'queued','running')` → `startEmployeeTurn` → `finally { settleAgent; scheduler.release(handle); }`. Keep the deferred await (it is what parks a budget-paused agent, D-30); the scheduler is an *additional* gate before `start()`, not a replacement.

**Throwing `start()` today (`:670-679`, employee) — D-16 target:**
```ts
try {
  outcome = await registry.get(employee.id).start(request);
} catch (err) {
  releaseLiveUse(employee.id);
  settleAgent(employee.id, 'error');
  throw err;                       // ← runBatch's allSettled swallows this; deferred resolves
}
```
The `settleAgent` already resolves the deferred — so the irreducible Phase 37 fix is the `finally` ledger transition + sanitized `diagnosticDetail`, not a new catch. Verify: nothing may `throw` past `startEmployeeTurn` before the deferred exists (`:666-668`).

**Global abort (D-11, `:982-991`):** `abortAll()` must additionally: settle every **queued** (never-started) assignment as `stopped`/`incomplete` through `finalizeAttempt`, abort each queued assignment's own `AbortController` (never `scheduler.cancel` — no handle exists before admission), `open()` both gates, and close the batch row with `abortedBy:'user'`.

**Per-agent stop on a queued agent (D-10):** `stopAgent` (`:972-980`) today only aborts a runtime + settles the in-memory state. Add: if the assignment is still `queued`, `finalizeAttempt(id, 'queued', 'stopped', 'user-per-agent', <copy>)` and abort its `AbortController` — never call `start()`, never `scheduler.cancel(handle)`.

> **Superseded by the plans.** Two mechanisms sketched in the earlier draft of this file are
> deliberately not implemented: `scheduler.cancel(handle)` for queued work (there is no handle
> before `acquire` resolves — cancellation is via a per-assignment `AbortController`), and
> `MAX_BATCH_SIZE`/`BATCH_TOO_LARGE` as live code (D-06 deletes both in 37-04). The PLAN files are
> the contract; this document is background.

---

### `src/services/ai/office/teamTools.ts` (modify — tool schema/validator)

**Analog:** itself, `:292-321`.

**Refusal helper** (`:38-47`):
```ts
export interface TeamToolRefusal {
  refused: true;
  code: TeamToolRefusalCode;
  message: string;
}
function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}
```

**Code to delete (D-06):**
```ts
if (assignments.length > MAX_BATCH_SIZE) {
  return JSON.stringify(
    refuse('BATCH_TOO_LARGE', `Mỗi lần chỉ được giao tối đa ${MAX_BATCH_SIZE} việc.`)
  );
}
```
Also: import at `:3`, `'BATCH_TOO_LARGE'` in the union at `:35`, and the two `${MAX_BATCH_SIZE}` interpolations in the tool description (`:127`) and the `assignments` param description (`:133`).

**Keep** `EMPTY_BATCH` (`:294-296`) and `AGENT_NOT_IN_ROSTER` (`:309-313`) — only the size cap goes.

**D-14 addition:** the *result* the coordinator returns (not this validator) must name unfinished agents. `delegate_batch` result is built in `runBatch` (`:907-930`); add the incomplete entries there.

---

### `src/services/ai/office/teamPrompts.ts` (modify — prompt transform)

**Analog:** itself, `:155-170`.

```ts
[
  '[QUY TẮC ĐIỀU HÀNH NHÓM]',
  '1. BẮT BUỘC: Luôn phân rã yêu cầu của người dùng thành các phần việc và giao cho nhân viên trong nhóm xử lý. ...',
  `2. BẮT BUỘC: Giao việc bằng cách gọi công cụ delegate_batch với danh sách assignments phù hợp, tối đa ${MAX_BATCH_SIZE} phân công mỗi lần.`,
  ...
].join('\n'),
```

D-06: drop `tối đa ${MAX_BATCH_SIZE} phân công mỗi lần` and the import at `:4`. D-14: add a rule forcing the lead to name incomplete parts in the synthesis (the `[KẾT QUẢ LÔ]` / batch-results segment is further down the same file — mirror its formatting style: a bracketed Vietnamese heading + numbered rules).

---

### `src/components/ai/office/TeamWorkspace.tsx` (modify — component)

**Analog:** itself.

**Coordinator acquisition block to replace with `getOrCreateRun` (`:233-238`, `:320-322`):**
```ts
const existing = coordinatorRegistry.get(registryKey(db, team.id));
if (existing && existing.threadId === thread.id) {
  setCoordinator(existing.coordinator);
  setSnapshot(existing.coordinator.getState());
  return;
}
...
coordinatorRegistry.set(registryKey(db, team.id), { coordinator: created, threadId: thread.id });
```

**Submit path (D-20, `:386-414`):**
```ts
const sendTurn = useCallback(async (text: string) => {
  if (!coordinator) return;
  setSendError(null);
  try {
    const persisted = await getTeam(team.id, db);
    if (persisted && persisted.leaderLockedAt === undefined && persisted.leadId !== undefined) {
      await lockLeader(team.id, db);
    }
  } catch (err) {
    setSendError({ code: 'LEADER_LOCK_FAILED', message: err instanceof Error ? err.message : String(err) });
    return;
  }
  await coordinator.send(text);
}, [coordinator, db, team.id]);

const handleSubmit = useCallback((text: string) => {
  lastUserTextRef.current = text;
  setDraft('');
  void sendTurn(text);                  // ← fire-and-forget; Pitfall 8
}, [sendTurn]);
```
D-20/D-21: `handleSubmit` no longer dispatches directly when a turn is live/parked — it appends `{id, text}` to a local outbox array and clears the draft. A small effect watches `snapshot.phase`; when the phase leaves `LIVE_PHASES` (`teamRunCoordinator.ts:175-180`) and the outbox is non-empty, it shifts one item and calls `sendTurn`. `LIVE_PHASES` is already exported — import it, do not re-declare the set.

**Outbox render slot:** `AiChatWidget` already exposes `statusExtensions?: React.ReactNode` rendered immediately above `ChatInputBar` (`AiChatWidget.tsx:89`, `:525`). Use it — no widget API change needed. Each chip needs a cancel button (D-20 "huỷ được").

**Composer / retry wiring (`:694-752`):**
```tsx
<AiChatWidget
  ...
  onSubmit={handleSubmit}
  onStop={() => coordinator?.abortAll()}
  onResolveApproval={(approved) => coordinator?.resolveApproval(approved)}
  onRetry={() => { if (lastUserTextRef.current) void sendTurn(lastUserTextRef.current); }}
  error={sendError}
  ...
  messageListExtensions={{
    agentDirectory,
    agentStatuses,
    ...(coordinator ? { onStopAgent: (agentId) => coordinator.stopAgent(agentId) } : {}),
  }}
/>
```
D-13's per-bubble "Chưa hoàn tất" + "Chạy lại" belongs in `AgentStatusRow` (`AgentAttributionRow.tsx:60-114`), which already switches on `AgentRunStatus` and renders the per-agent Stop (`:100-111`). Add a retry callback through `messageListExtensions` → `ChatMessageList` → `ChatMessageBubble` (the exact plumbing `onStopAgent` uses at `ChatMessageList.tsx:50-51, 170-186` and `ChatMessageBubble.tsx:94, 341, 1193`).

**Error surface already exists:** `runAction` (`:432-435`) + `actionError` Alert (`:672-681`) — reuse for dispose/ledger failures instead of adding a second error channel.

---

### `src/components/ai/office/TeamSettingsDrawer.tsx` (modify — CRUD form)

**Analog:** itself.

**Props + save payload (`:20-25`):**
```ts
onSave: (input: {
  budgetTokens: number;
  budgets: Record<string, number>;
  autoSplitEnabled: boolean;
  autoApproveMutations: boolean;
}) => void;
```
**Local state pattern (`:70-73`):**
```ts
const [total, setTotal] = useState<number>(team.budgetTokens);
const [autoSplit, setAutoSplit] = useState(team.autoSplitEnabled === true);
const [autoApprove, setAutoApprove] = useState(team.autoApproveMutations === true);
```
**Save call (`:155-170`):** `onSave({ budgetTokens: total, budgets, autoSplitEnabled: autoSplit, autoApproveMutations: autoApprove })`.

Add `concurrencyLimit` to all three sites. Use Ant Design `InputNumber` with `min={1} max={12}` (D-02), but **clamp again at the trust boundary** — `updateTeam`/zod (`aiOfficeSchemas.ts`), not only in the input. Clamp precedent: `ghostDevConfig.ts:54` `Math.max(1, Math.min(12, ...))`, and the read-side validation at `:37-41`.

Consumer: `TeamWorkspace.tsx:437-467` `handleSaveSettings` → `updateTeam(...)` + `coordinator?.setTeamSettings(...)`. Add `concurrencyLimit` to both, and call `scheduler.setLimit(n)` (D-04 live change).

---

### `src/workbench/toolwindows/AiOfficeExplorer.tsx` (modify — component)

**Analog:** itself, `:84-88`.

```ts
const handleDeleteTeam = async (team: AiTeam) => {
  await deleteTeam(team.id, db);
  const workspaceTab = openTabs.find((tab) => tab.id === `team_workspace:${team.id}`);
  if (workspaceTab) closeTab(workspaceTab.id);
};
```
D-18: insert `await disposeRun(team.id, db);` **before** `deleteTeam` — this path never mounts `TeamWorkspace`, which is why the registry must leave the component. Import at `:12` is the neighboring-import precedent.

---

### `src/validation/aiOfficeSchemas.ts` (modify — validation)

**Analog:** `AiTeamInputSchema` `:86-95` / `AiTeamUpdateSchema` `:96-104`.

```ts
export const AiTeamInputSchema = z.object({
  name: nameSchema,
  leadId: uuidSchema.optional(),
  status: AiTeamStatusSchema.default('active'),
  budgetTokens: budgetSchema.default(0),
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
});

export const AiTeamUpdateSchema = z.object({
  ...
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
});
```

Add on both:
```ts
concurrencyLimit: z.number().int().min(1).max(12).optional(),
```
Then `updateTeam` (`aiTeamRepo.ts:203-215`) must copy the `'autoSplitEnabled' in patch` idiom so clearing the field is expressible.

Also add zod schemas for the ledger draft inputs, following `AiSkillVersionInputSchema` usage in `aiSkillVersionRepo.ts:58` (`parse` before the transaction).

---

### `src/validation/backupSchemas.ts` (modify — validation)

**Analog:** `BackupAiTeamRecordSchema` `:617-629`, `BackupAiSkillVersionRecordSchema` `:649-660`.

```ts
export const BackupAiTeamRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  leadId: uuidSchema.optional(),
  leaderLockedAt: z.string().optional(),
  status: z.enum(['active', 'idle']),
  budgetTokens: aiTokensSchema,
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

Deliverables:
1. `concurrencyLimit: z.number().int().min(1).max(12).optional()` in `BackupAiTeamRecordSchema` (`strictObject` — omitting it strips the field on restore).
2. New `BackupAiTeamBatchRecordSchema` + `BackupAiTeamAssignmentRecordSchema`, `strictObject`, all D-22 fields; enums for `runStatus`/`stopReason`/`abortedBy` (must accept **every** value the runtime can write, including `blocked`/`needs-input`).
3. The 8 new `ChatMessage` link fields in `BackupChatMessageRecordSchema` (`:291-329`) — plain `z.object`, so undeclared = silently stripped.
4. `BACKUP_SCHEMA_VERSION` 12 → **13** (`:663`) + comment noting which tables the bump adds. Envelope gate (`:665-673`) is `z.literal`; older envelopes are rejected outright (`validateBackup.ts:99-105`), so this is a coordinated one-way bump (D-22/D-26).
5. `assertNoLegacyTables` (`:683-692`) is unaffected.

**Forbidden-key gate is recursive over object KEYS** (`:201-219`): a `runStatus: 'error'` **value** is fine; a key named `error`/`diagnostics`/`prompt`/`stack` is not.

---

### `src/types/backup.ts` (modify — model)

**Analog:** `BackupTableData` `:45-74`, `BackupTableCounts` `:76-104`.

```ts
  aiTeamLinks?: AiTeamLink[];
  aiSkillVersions?: AiSkillVersion[];
}
```
Append `aiTeamBatches?: AiTeamBatch[]; aiTeamAssignments?: AiTeamAssignment[];` to **both** interfaces (counts are `number`).

---

### `src/services/backup/exportBackup.ts` (modify — service, 3 coordinated edits)

**Analog:** itself. Pitfall 23's "three separate places" is literal here.

1. **Destructure + `Promise.all`** (`:191-197` + `:220-226`):
```ts
    aiTeamLinks,
    aiSkillVersions,
  ] = await Promise.all([
    ...
    targetDb.aiTeamLinks.toArray(),
    targetDb.aiSkillVersions.toArray(),
  ]);
```
2. **`tables` object** (`:252-281`) — append the two keys.
3. **`counts` object** (`:283-312`) — append `.length` for both.

---

### `src/services/backup/restoreBackup.ts` (modify — service, 4 coordinated edits)

**Analog:** itself.

1. `RESTORE_TABLES` (`:26-56`) — add both `db.*` entries.
2. `AI_OFFICE_TABLE_KEYS` (`:59-67`) — add both keys. **Note the all-or-nothing guard** (`:229-236`): a payload with *some* AI Office keys is refused whole. Adding keys here means an older Phase-36 export (7 keys, no ledger) becomes a "partial" payload and is **rejected** — which is correct under the version bump, but the test at `officeBackup.test.ts:389-412` asserts `valid: true` for a 7-key payload and will need updating together with the version bump.
3. Clear list (`:250-256`) — add `.clear()` for both inside `clearAiOffice`.
4. `await add(targetDb.*, tables.*)` (`:288-295`) — add both.

---

### `src/services/backup/validateBackup.ts` (modify — service)

**Analog:** itself.

- Table validation block (`:232-243`):
```ts
  const aiSkillVersions = rawTables.aiSkillVersions !== undefined
    ? validateTable('aiSkillVersions', BackupAiSkillVersionRecordSchema, rawTables.aiSkillVersions)
    : undefined;
```
- Referential checks (`:534-540`) — pattern: assignment `batchId` must resolve; attempt `retryOfAssignmentId` must resolve; **agent/skill/model are snapshots and must NOT be live-validated** (same rule as `targetAgentId`, `backupSchemas.ts:326-328`).
- Envelope passthrough (`:588-622`) — append both `...(x !== undefined ? {x} : {})` entries to `tables` **and** `counts`.

---

### `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` (modify — config parity)

**Analog:** `SQLITE_DOMAIN_TABLES` (`localSqlitePersistence.ts:14-34`) and `ALLOWED_TABLES` (`sqlite_persistence.rs:5-28`).

```ts
export const SQLITE_DOMAIN_TABLES = [
  ...
  'aiTeamLinks',
  'aiSkillVersions',
] as const;
```
```rust
const ALLOWED_TABLES: &[&str] = &[
    ...
    "aiTeamLinks",
    "aiSkillVersions",
    ...
];
```
Add `'aiTeamBatches'`, `'aiTeamAssignments'` / `"aiTeamBatches"`, `"aiTeamAssignments"` to both. `tests/db/tableListParity.test.ts:45-84` enforces TS ⊆ Rust and will fail loudly if one side is missed — extend its `aiOffice` list (`:65-73`) and its Dexie-declaration check, but do **not** replace the regex readers.

---

### `tests/services/ai/office/teamRunCoordinator.test.ts` (extend — test)

**Analog:** itself. Harness at `:89-181` already provides 3 employees, a skill, a scripted `runLoop` per model, and the `loadRoster` seam.

Key harness pieces to reuse:
```ts
const createRuntimeDeps = (agentId: string): Partial<ChatTurnRuntimeDeps> => ({
  runLoop: ((loopOptions: AiOrchestratorLoopOptions) => {
    const script = options.scripts[loopOptions.model];
    if (!script) throw new Error(`No script for model ${loopOptions.model} (agent ${agentId})`);
    return script(loopOptions);
  }) as unknown as ChatTurnRuntimeDeps['runLoop'],
});
```
```ts
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> { ... }
function deferred(): { promise: Promise<void>; release: () => void } { ... }
```
44 existing `it(` blocks. New cases (D-27), one per criterion:
- `runLoop` throws for one of three agents → `runBatch` resolves, that agent `error`, siblings `done`.
- limit 2 + 5 assignments → never more than 2 `running` in any snapshot; all 5 settle.
- second `send()` while live → one user row, text in outbox.
- `aiTurnManager.getActiveTurns()` empty after a run (mirror `:286-307` which asserts registration).
- delete mid-run → no active turns, no writes after.
- stop queued agent → never started (assert its `runLoop` script never called), `stopped`+`incomplete`.
- retry → new attempt row, old report `supersededByMessageId`, lead called again once.

---

## Shared Patterns

### Abort-aware park (every queue/wait in this phase)
**Source:** `src/services/ai/office/budgetGate.ts:44-60`
**Apply to:** `scheduler.acquire`, any new deferred wait, `beforeToolRoundFor` composition (`teamRunCoordinator.ts:600-608`).

```ts
if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
return new Promise<void>((resolve, reject) => {
  const onAbort = () => { resolver = null; reject(new DOMException('Aborted', 'AbortError')); };
  signal?.addEventListener('abort', onAbort, { once: true });
  resolver = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
});
```

### Dexie `rw` read-then-write
**Source:** `src/db/repositories/aiTeamRepo.ts:275-303` (`lockLeader`), `aiSkillVersionRepo.ts:82-101` (`decideSkillVersion`)
**Apply to:** `transitionAssignment`, `attemptNo` allocation, batch open/close, `concurrencyLimit` writes.

### Sanitized user-facing error
**Source:** `src/components/ai/runtime/chatTurnRuntime.ts:143-144`
```ts
export const SANITIZED_TURN_ERROR =
  "Không thể xử lý yêu cầu: lỗi kết nối nhà cung cấp AI. Bấm 'Thử lại' để gửi lại lượt này mà không mất ngữ cảnh.";
```
**Apply to:** every `start()` failure path. Raw detail goes to `diagnosticDetail` on the ledger row only (D-17) — never to transcript, never to backup-facing keys.

### Recursive forbidden-key gate
**Source:** `src/validation/backupSchemas.ts:194-219`
**Apply to:** any new backup schema. Verified safe names: `runStatus`, `stopReason`, `diagnosticDetail`, `tokenUsage`, `toolCallCount`, `abortedAt`.

### Five-list table sync (+ parity test)
**Source:** `schema.ts` / `exportBackup.ts` / `restoreBackup.ts` / `validateBackup.ts` / `localSqlitePersistence.ts` + `sqlite_persistence.rs` + `tests/db/tableListParity.test.ts`
**Apply to:** `aiTeamBatches`, `aiTeamAssignments`. Plus `types/backup.ts` (`BackupTableData` + `BackupTableCounts`) and `backupSchemas.ts` version bump — 8 touch points total.

### Fire-and-forget error routing in the component
**Source:** `TeamWorkspace.tsx:432-435` + `:672-681`
**Apply to:** dispose, ledger close, outbox dispatch failures — never a bare `void promise`.

---

## No Analog Found

| File / concern | Role | Data Flow | Reason | Fallback |
|---|---|---|---|---|
| Outbox queue UI (inside `TeamWorkspace.tsx`) | component | event-driven queue | No client-side message queue exists anywhere in `src/` (grep for `outbox`/`pendingMessages` returns nothing) | Design from D-20/D-21; mount via existing `AiChatWidget.statusExtensions` slot (`AiChatWidget.tsx:89, 525`) |
| "Lead must name incomplete parts" prompt rule (D-14) | utility (prompt text) | transform | No comparable conditional-instruction block exists | Extend `teamPrompts.ts` `[QUY TẮC ĐIỀU HÀNH NHÓM]` list (`:160-166`); feed incomplete entries through the existing batch-results segment |

---

## Metadata

**Analog search scope:** `src/services/ai/office/`, `src/services/ai/runtime/`, `src/db/repositories/`, `src/db/`, `src/components/ai/`, `src/workbench/toolwindows/`, `src/services/backup/`, `src/validation/`, `src/services/localSqlitePersistence.ts`, `src-tauri/src/`, `tests/`
**Files read (full or targeted):** 30
**All analog paths verified git-tracked** (`git ls-files`) — no `.gsd/capabilities` mirrors exist in this repo
**Pattern extraction date:** 2026-11-11
