# Phase 34: AI Office — AI Employees, Teams, and Skills — Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 24 new + 17 modified
**Analogs found:** 41 / 41 (every file has a real in-repo analog; zero new dependencies)

**Path convention used below:** `src/views/AiOfficeView.tsx` and `src/views/TeamsView.tsx` live in `src/views/` because `EditorArea.tsx` imports every routed view from `../views` (line 43-58). Sub-components live in `src/components/ai/office/`. The research's "Recommended Project Structure" put the views under `components/ai/office/`; that would force an import from a component folder into the routing switch and break the existing convention. This is the only structural deviation from 34-RESEARCH.md.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| **NEW** `src/types/aiOffice.ts` | model (types) | — | `src/types/agent.ts` | exact |
| **NEW** `src/db/repositories/aiOfficeRepo.ts` | repository | CRUD | `src/db/repositories/systemRepo.ts` | exact |
| **NEW** `src/db/repositories/aiTeamRepo.ts` | repository | CRUD + transaction | `src/db/repositories/chatTabRepo.ts` | role-match (child rows under a parent) |
| **NEW** `src/db/repositories/teamTranscriptRepo.ts` | repository | CRUD + BM25 read | `src/db/repositories/chatRepo.ts` | exact |
| **NEW** `src/services/ai/office/teamRunRegistry.ts` | service (registry) | event-driven | `src/components/ai/runtime/tabRuntimes.ts` | exact |
| **NEW** `src/services/ai/office/budgetGate.ts` | utility | event-driven (promise gate) | `chatTurnRuntime.ts:374-403` approval park | role-match |
| **NEW** `src/services/ai/office/teamRunCoordinator.ts` | service (orchestrator) | event-driven / batch | `createTabTurnRegistry` + `chatTurnRuntime.ts` | partial (no orchestrator exists) |
| **NEW** `src/services/ai/office/teamPrompts.ts` | service (transform) | transform | `src/services/ai/sdlcPromptComposer.ts`, `contextCompaction.ts:205` | role-match |
| **NEW** `src/services/ai/office/teamTools.ts` | service (tool handlers) | request-response | `aiTools.ts:2482-2600` (`get_item_details`) + `:4487-4522` (BM25) | exact |
| **NEW** `src/views/AiOfficeView.tsx` | view | request-response (UI) | `src/views/SystemCatalogView.tsx` | exact |
| **NEW** `src/views/TeamsView.tsx` | view | request-response (UI) | `src/views/SystemCatalogView.tsx` (list) + `AgentControlView.tsx` (splitter) | exact |
| **NEW** `src/components/ai/office/*Card.tsx` (Employee/Lead/Skill/Team) | component | request-response | `SystemCatalogView.tsx:108-154` toolbar/card strip | role-match |
| **NEW** `src/components/ai/office/*EditorDrawer.tsx` | component | CRUD form | `AgentControlView.tsx:246-256` (Drawer) + `SystemModal` form | role-match |
| **NEW** `src/components/ai/office/TeamWorkspace.tsx` | component | streaming | `AgentControlView.tsx:139-240` | role-match |
| **NEW** `src/components/ai/office/TeamSidebar.tsx` | component | request-response | `AgentControlView.tsx:158-170` (left panel) | role-match |
| **NEW** `src/components/ai/office/AssignmentPlanCard.tsx` | component | request-response (park) | `widget/MutationApprovalCard.tsx` | exact |
| **NEW** `src/components/ai/office/AgentPausedBanner.tsx` | component | request-response | `MutationApprovalCard.tsx` (card shell) + antd `Alert` | role-match |
| **NEW** `src/components/ai/office/BudgetTopUpModal.tsx` | component | CRUD form | `MutationApprovalCard.tsx` shell + antd `Modal` | role-match |
| **NEW** `src/components/ai/office/LinkedItemsList.tsx` / `LinkedItemPicker.tsx` | component | CRUD | `SystemCatalogView.tsx` toolbar/empty-state | role-match |
| **NEW** `src/components/ai/office/AgentAttributionRow.tsx` | component | request-response | `ChatMessageBubble.tsx:1168-1180` | role-match |
| **MOD** `src/db/schema.ts` | config | — | `SCHEMA_V16` (lines 112-117) | exact |
| **MOD** `src/db/index.ts` | config | — | `this.version(16)` (lines 316-473) | exact |
| **MOD** `src/components/ai/runtime/chatTurnRuntime.ts` | service (runtime) | event-driven | itself | exact |
| **MOD** `src/services/ai/aiOrchestratorLoop.ts` | service (loop) | event-driven | itself | exact |
| **MOD** `src/services/ai/chatTurnTools.ts` | utility | transform | itself | exact |
| **REUSE-ONLY** `src/services/ai/aiTools.ts` | service (tool registry) | request-response | itself | exact — read for `AI_DATABASE_TOOLS` / `MUTATION_TOOLS` / `dispatchAiToolCall` names only; **no plan modifies this file** (the `delegate_batch` interception path deliberately avoids the 5 280-line switch, see §`teamTools.ts`) |
| **MOD** `src/components/ai/ChatMessageList.tsx` | component | streaming | itself | exact |
| **MOD** `src/components/ai/ChatMessageBubble.tsx` | component | streaming | itself | exact |
| **MOD** `src/components/ai/ActiveAiTurnIndicator.tsx` | component | event-driven | itself | exact |
| **MOD** `src/types/models.ts` | model | — | itself | exact |
| **MOD** `src/workbench/store/layoutStore.ts` | store | — | itself | exact |
| **MOD** `src/workbench/EditorArea.tsx` | route | — | itself (3 separate places) | exact |
| **MOD** `src/workbench/WorkbenchLayout.tsx` | route | — | itself (titles map) | exact |
| **MOD** `src/workbench/TitleBar.tsx` | component | — | itself (Ghost Dev button) | exact |
| **MOD** `src/services/backup/exportBackup.ts` | service | file-I/O | itself | exact |
| **MOD** `src/services/backup/restoreBackup.ts` | service | file-I/O | itself | exact |
| **MOD** `src/services/backup/validateBackup.ts` | service | file-I/O | itself | exact |
| **MOD** `src/validation/backupSchemas.ts` | config (zod) | — | itself | exact |
| **MOD** `src/types/backup.ts` | model | — | itself | exact |
| **MOD** `src/services/localSqlitePersistence.ts` | config | — | itself (table allowlist) | exact |
| **MOD** `tests/db.test.ts` | test | — | itself (exact table list) | exact |

---

## Pattern Assignments

### `src/types/aiOffice.ts` (model)

**Analog:** `src/types/agent.ts` (whole file, 60+ lines)

Project convention: domain types live in their own `src/types/<domain>.ts` when they are not part of the core `models.ts` schema surface. `agent.ts` is the closest precedent — a self-contained union + record set for a non-core domain. Do **not** add these to `models.ts` except for the two edits listed below (`ChatScopeType`, `ChatMessage`).

```ts
// src/types/agent.ts:1-22 — union-first, then records
export type AgentRole = 'master' | 'worker';
export type AgentStatus = 'idle' | 'running' | 'paused' | 'awaiting_approval' | 'done' | 'error' | 'interrupted';

export interface WorkerSession {
  workerId: string;
  role: string;
  pid: number;
  model: string;
  status: AgentStatus;
  startedAt: string;
}
```

**Deviation for this phase:**
- Records: `AiEmployee`, `AiLead`, `AiSkill`, `AiTeam`, `AiTeamMember`, `AiTeamLink`.
- `TeamRunPhase` is a **new union** (D-35) — never extend `ChatTurnStatus`:
  `'idle' | 'ready' | 'lead-thinking' | 'awaiting-plan' | 'batch-running' | 'awaiting-budget' | 'awaiting-mutation-approval' | 'lead-synthesizing' | 'error'`.
- `AgentRunState`: `{ agentId, status: 'queued'|'running'|'paused'|'stopped'|'error'|'done', streamingText, startedAt }`.
- Persisted date fields are ISO strings (project rule); persisted calendar days are `YYYY-MM-DD`.
- **Forbidden field names**: never `systemPrompt` / `prompt` on any persisted row — `backupSchemas.ts:200-225` rejects them. Use `persona` (employee) and `body` (skill).

---

### `src/db/repositories/aiOfficeRepo.ts` (repository, CRUD)

**Analog:** `src/db/repositories/systemRepo.ts:74-90`

```ts
// src/db/repositories/systemRepo.ts:74-90
export async function createSystem(
  input: SystemInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<System> {
  const validated = SystemInputSchema.parse(input);
  const now = new Date().toISOString();

  assertParentHasNoRepoFields(validated);
  await assertParentIsLogicalGroup(validated.parentId ?? null, db);
  await assertCodeAvailable(validated.code, undefined, db);

  const system: System = { id: generateId(), name: validated.name, code: validated.code, /* … */ };
```

Copy exactly: `input → zod.parse → now → generateId() → object literal with explicit fields → db.table.add`, and the `db: TaskPlannerDatabase = defaultDb` default parameter on every export.

**Deviation:** validation schemas go in `src/validation/aiOfficeSchemas.ts` (new, mirrors `src/validation/schemas.ts:195-215` shape) rather than inline. Required rules from the UI-SPEC: `name` ≤60, `role` ≤60, `capability` ≤300, `persona` required, `model` required, `skillId` optional. Enforce "at most one skill per agent" structurally by making `skillId` a scalar (not an array) — no extra check needed.

---

### `src/db/repositories/aiTeamRepo.ts` (repository, CRUD + transaction)

**Analog:** `src/db/repositories/chatTabRepo.ts:149-196` — the exact parent-with-child-rows shape this phase needs (`aiTeams` → `aiTeamMembers`, `aiTeamLinks`), including the "single transaction so two racing callers cannot create two active rows" comment.

```ts
// src/db/repositories/chatTabRepo.ts:149-196
export async function getOrCreateActiveChatTab(
  input: CreateChatTabInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatTab> {
  // Single transaction: reading the tab list and inserting the first tab outside one races the
  // drawer bootstrap against `createChatTab`, which leaves a scope with two active tabs …
  return db.transaction('rw', [db.chatThreads, db.chatTabs], async () => {
    const tabs = await listTabsByScope(input.scopeKey, db);
    const existing = tabs.find((tab) => tab.active) ?? tabs[0];
    if (existing) return existing;
    // …
    await db.chatTabs.where('scopeKey').equals(input.scopeKey).modify({ active: false });
    await db.chatTabs.add(tab);
    return tab;
  });
}
```

**Deviation:** `activateTeam(teamId, db)` must run inside `db.transaction('rw', [db.aiTeams], …)`, count `status === 'active'`, throw `new Error('Đã có 3 nhóm đang hoạt động…')` at 3 (D-15), and then `update(teamId, { status: 'active', updatedAt })`. Same for `addTeamMember` (roster cap 3 employees + 1 lead, D-16). Budget writes are **single-row updates on `aiTeamMembers`** (D-32) — never read-modify-write a JSON array:
```ts
await db.aiTeamMembers.update(memberRowId, { usedTokens: newUsed });
```
Even split helper: `floor(total / memberCount)` per row, remainder to the lead row (UI-SPEC §8a, AIO-BUDGET-01).

---

### `src/db/repositories/teamTranscriptRepo.ts` (repository, CRUD + BM25 read)

**Analog:** `src/db/repositories/chatRepo.ts:78-192`

```ts
// src/db/repositories/chatRepo.ts:152-181
const now = new Date().toISOString();
const message: ChatMessage = {
  id: generateId(),
  threadId: input.threadId,
  role: input.role,
  content: input.content,
  createdAt: now,
  ...(input.isContextBoundary ? { isContextBoundary: true } : {}),
  ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
  ...(input.tokenUsage ? { tokenUsage: input.tokenUsage } : {}),
  /* … */
};

await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
  await db.chatMessages.add(message);
  await db.chatThreads.update(input.threadId, { updatedAt: now });
});

notifyAIChatSync({ type: 'message_saved', threadId: input.threadId });
```

And the indexed read (`chatRepo.ts:183-192`): `db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt')` with the id tiebreak.

**Deviation:** this repo is a thin layer over the existing `chatMessages` table (research: reuse, do not create `aiTeamMessages`). It adds:
- `saveTeamMessage({ threadId, role, content, agentId, agentName, agentKind, messageKind, tokenUsage })` — extends `SaveMessageInput` fields; `chatMessages` already has `threadId` indexed so no schema change is needed for reads.
- `listRecentTurns(threadId, n = 10)` — last N rows, ordered; feed to `sanitizeHistoryTurns`.
- `listAssignmentHistory(teamId, agentId, cap = 50)` (D-29 constant `ASSIGNMENT_HISTORY_CAP = 50`).
- `buildTeamBm25Docs(threadId)` → `BM25Document[]` (see `teamTools.ts` below).
- `getTeamTurn(threadId, turnId)` — **must** verify `row.threadId === threadId` before returning (cross-team read guard, research §Security).

---

### `src/services/ai/office/teamRunRegistry.ts` (service, registry)

**Analog:** `src/components/ai/runtime/tabRuntimes.ts:27-60` — copy the whole shape.

```ts
// src/components/ai/runtime/tabRuntimes.ts:27-60
export function createTabTurnRegistry(
  createDeps: (tabId: string, threadId: string) => ChatTurnRuntimeDeps
): TabTurnRegistry {
  const entries = new Map<string, { threadId: string; runtime: ChatTurnRuntime }>();

  return {
    get(tabId, threadId) {
      const existing = entries.get(tabId);
      if (existing && existing.threadId === threadId) return existing.runtime;
      if (existing) existing.runtime.abort();
      const runtime = createChatTurnRuntime(createDeps(tabId, threadId));
      entries.set(tabId, { threadId, runtime });
      return runtime;
    },
    peek(tabId) { return entries.get(tabId)?.runtime; },
    discard(tabId) { /* abort + delete */ },
    abortTab(tabId) { entries.get(tabId)?.runtime.abort(); },
    abortAll() { for (const entry of entries.values()) entry.runtime.abort(); },
    getSnapshot() { return Object.fromEntries([...entries].map(([tabId, e]) => [tabId, e.runtime])); },
  };
}
```

**Deviation:** keyed by `agentId` only (one team run owns the registry; no `threadId` churn). Add `abort(agentId)` and keep `abortAll()` for the global stop (D-14). Do **not** import `createTabTurnRegistry` — it is tab-keyed and its `get` takes two args.

---

### `src/services/ai/office/budgetGate.ts` (utility, promise gate)

**Analog:** the `awaiting-approval` park in `src/components/ai/runtime/chatTurnRuntime.ts:374-403` — resolver installed before publishing, single resolver slot, abort path.

```ts
// src/components/ai/runtime/chatTurnRuntime.ts:371-403
parkedArtifactPatch = true;
// Resolver is installed before publishing so a synchronous subscriber
// cannot lose the click.
const approved = await new Promise<boolean>((resolve) => {
  approvalResolver = resolve;
  publish('awaiting-approval');
  deps.onAwaitingApproval?.({ toolName, summary, patch: proposal });
});
parkedArtifactPatch = false;
if (approved) return { proceed: true };
```

```ts
// src/components/ai/runtime/chatTurnRuntime.ts:189-196 — the abort path a parked gate must copy
const abort = () => {
  if (!running) return;
  controller?.abort();
  // A turn parked on an approval must not stay parked after abort.
  resolveApproval(false);
  declined = false;
  publish('aborted');
};
```

**Deviation:** `createBudgetGate()` returns `{ close, open, isClosed, wait(signal) }` where `wait` rejects with `new DOMException('Aborted', 'AbortError')` on signal abort (Pitfall 8 — a bare `await` with no abort path leaves the capsule stuck forever). 80% crossing detection is a pure function, no state: `bucketOf(used, budget) = Math.floor(used / budget * 10)`; notify when `bucket >= 8 && previousBucket < 8`. After a top-up the budget grows so the bucket drops and a later crossing re-notifies (D-20) with zero extra state.

---

### `src/services/ai/office/teamRunCoordinator.ts` (service, orchestrator)

**Analog:** no orchestrator exists. Compose from three sources:
1. `tabRuntimes.ts:27-60` — registry shape (above).
2. `chatTurnRuntime.ts:288-299` — the tool interception precedent inside `executeToolFn`.
3. `chatTurnRuntime.ts:316-322` — usage accumulation (the coordinator forwards, never re-sums).

```ts
// src/components/ai/runtime/chatTurnRuntime.ts:288-299 — interception precedent
executeToolFn: (name, args, toolDb, signal) => {
  const callId = currentCallId;
  const prepared = callId ? preparedPatches.get(callId) : undefined;
  if (prepared) return Promise.resolve(JSON.stringify(prepared));
  return dispatchAiToolCall(name, args, toolDb, signal, {
    allowMutation: request.autoApprove,
    /* … */
  });
},
```

```ts
// src/components/ai/runtime/chatTurnRuntime.ts:316-322 — cumulative usage
onUsage: (usage) => {
  tokenUsage = {
    promptTokens: (tokenUsage.promptTokens || 0) + (usage.promptTokens || 0),
    completionTokens: (tokenUsage.completionTokens || 0) + (usage.completionTokens || 0),
    totalTokens: (tokenUsage.totalTokens || 0) + (usage.totalTokens || 0),
  };
},
```

**Deviation (this is the only genuinely new logic in the phase, ~300 lines):**
- Owns `Map<agentId, ChatTurnRuntime>` via `createTeamRunRegistry`, plus `TeamRunPhase` state and per-agent `AgentRunState`.
- `delegate_batch` is intercepted in the **lead's** `executeToolFn` before `dispatchAiToolCall`:
  ```ts
  if (normalizeToolName(name) === 'delegate_batch') {
    return coordinator.runBatch(args.assignments, signal); // plan → approve → allSettled → JSON
  }
  ```
  This means `delegate_batch` never reaches `dispatchAiToolCall`, so it never falls through to `executeDynamicMcpTool` (Pitfall 4). **This is a deliberate deviation from research's "register in `AI_DATABASE_TOOLS` + add an `executeAiTool` case"** — the interception path is smaller (zero edits to the 5 280-line `aiTools.ts` switch) and strictly safer. Guard it with a test that every advertised team tool name resolves to a coordinator handler.
- Batch = `Promise.allSettled` over ≤3 `runtime.start()` promises. An entry settles only on a **terminal** state (`complete | stopped | error`); a budget-paused agent is non-terminal and keeps the batch pending (D-30, Pitfall 7).
- Stopped agent result carries `incomplete: true` in the JSON (D-14) — never prose-only.
- Registers one `aiTurnManager` turn per agent (`team:<teamId>:agent:<agentId>`) and one team turn (`team:<teamId>`) with `abort` closures (Pitfall 11 — never reuse a `scopeKey` as a turn id).
- Must **not** import React and must **not** live in a hook (D-22: survives view switches).

---

### `src/services/ai/office/teamPrompts.ts` (service, transform)

**Analog:** `src/services/ai/sdlcPromptComposer.ts` for segment composition; `src/services/ai/contextCompaction.ts:205-245` for the recent-window.

```ts
// src/services/ai/contextCompaction.ts:205-217
export function sanitizeHistoryTurns(
  messages: readonly ChatMessage[],
  excludeMessageId?: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const cleaned: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (excludeMessageId && m.id === excludeMessageId) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = extractMessageText(m).trim();
    if (!text) continue;
    cleaned.push({ role: m.role, content: text });
  }
  /* … drops orphaned / trailing user turns … */
}
```

**Deviation:** pure functions returning `{ systemMessages, history, text }` for `ChatTurnRequest` (D-04/D-05 mapping table in RESEARCH §Pattern 8). Employee `systemMessages` contain **only** `skill.description` — never `skill.body` (D-24, AIO-SKILL-02). Retrieved content (skill body, note/document body, transcript rows) is wrapped in a delimited untrusted-data segment (precedent: Phase 31 conventions segment). Assignment history is newest-first, capped at `ASSIGNMENT_HISTORY_CAP = 50`, with a prompt line stating older work is retrievable via `search_team_history` (D-29).

---

### `src/services/ai/office/teamTools.ts` (service, tool handlers)

**Analog:** `src/services/ai/aiTools.ts:2482-2600` (`get_item_details`) for full-context resolution, and `:4487-4522` for BM25.

```ts
// src/services/ai/aiTools.ts:2499-2511 — the not-found + notes resolution shape
if (!item) {
  return JSON.stringify({ error: `Not found: ${type} with id "${id}"` });
}
if (db.notes) {
  try {
    stickyNotes = await db.notes.where('entityId').equals(id)
      .filter((n) => n.entityType === type).toArray();
  } catch {}
}
```

```ts
// src/services/ai/aiTools.ts:4499-4516 — the exact BM25 mapping + snippet call to copy
const limit = Math.min(Math.max(1, Number(args.limit) || 5), 10);
const bm25Docs = docs.map((d: Note) => ({
  id: d.id, title: d.title || '', tags: d.tags || [], body: d.body || '', updatedAt: d.updatedAt,
}));
const scoredResults = rankBM25(args.query, bm25Docs, { limit });
const results = scoredResults.map((sr) => ({
  id: sr.doc.id,
  title: sr.doc.title,
  score: Math.round(sr.score * 100) / 100,
  snippet: extractRelevantSnippet(sr.doc.body, args.query, 1500),
  updatedAt: sr.doc.updatedAt,
}));
```

**Deviation:**
- Six handlers exported as `TEAM_TOOLS: AiToolDefinition[]` + `executeTeamTool(name, args, ctx)` where `ctx = { db, teamId, threadId, agentId, skillId }` — **team id comes from the request-bound context, never from model args** (research §Security: cross-team read).
- `search_team_history` returns `{ turnId, agent, timestamp, kind, excerpt }` with `extractRelevantSnippet(body, query, 400)` and `limit` clamped to ≤20.
- `read_team_turn` = `db.chatMessages.get(turnId)` **plus a `threadId` equality check**.
- `read_skill` returns `skill.body` verbatim.
- `list_linked_items` → `[{ itemId, itemType, name, code? }]`; `get_linked_context` returns **full** content: reuse `get_item_details`' resolution for task/CR/system, return `note.body` whole for note/document (D-27).
- `delegate_batch` handler validates `agentId ∈ roster` and `assignments.length ≤ 3` and returns the artifact-tool refusal shape:
  ```ts
  // src/services/ai/sdlcArtifactTools.ts:47-51 — the refusal contract to mirror (D-33)
  export interface ArtifactToolRefusal { refused: true; code: ArtifactToolRefusalCode; message: string; }
  ```
  i.e. `{ refused: true, code: 'AGENT_NOT_IN_ROSTER' | 'BATCH_TOO_LARGE', message }` — never a thrown error.
- `ponytail:` comment on `search_team_history`: `rankBM25` tokenizes the whole candidate set per call; cap to the last 2 000 rows if a transcript ever gets that large.

---

### `src/views/AiOfficeView.tsx` (view)

**Analog:** `src/views/SystemCatalogView.tsx:90-184` — header + toolbar strip + grid + empty state, verbatim geometry.

```tsx
// src/views/SystemCatalogView.tsx:90-154
<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
  <PageHeader title="…" subtitle="…" extra={<Button type="primary" icon={<PlusOutlined />} …/>} />
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'var(--bg-island, #ffffff)', borderRadius: 8,
                border: '1px solid var(--border, #e9eaee)' }}>
    <Space size="middle">
      <Input prefix={<SearchOutlined … />} placeholder="…" value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)} allowClear style={{ width: 280 }} />
    </Space>
    <Button icon={<ReloadOutlined />} onClick={reset}>Đặt lại bộ lọc</Button>
  </div>
  {/* body */}
</div>
```

**Deviation:** `'agents'` becomes a shell: outer `Segmented` `[Văn phòng AI][Ghost Dev]` (default Văn phòng AI), inner `Segmented` `[Nhân viên][Lead][Kỹ năng]` (one list + type filter — UI-SPEC §1 resolved the discretion item). Ghost Dev must stay reachable: render the existing `<AgentControlView />` unchanged for that segment. `data-testid`: `ai-office-view`, `ai-office-segment-{employees|leads|skills}`. Card grid uses `gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'; gap: 16` (UI-SPEC §1).

---

### `src/views/TeamsView.tsx` (view)

**Analog:** `SystemCatalogView.tsx:90-184` for the list mode; `src/views/AgentControlView.tsx:139-240` for the workspace mode.

```tsx
// src/views/AgentControlView.tsx:148-170
<Splitter style={{ height: '100%', boxShadow: token.boxShadowSecondary, borderRadius: 8,
                   overflow: 'hidden', backgroundColor: token.colorBgContainer }}>
  <Splitter.Panel defaultSize="22%" min="220px">
    <AgentSessionList … />
  </Splitter.Panel>
  <Splitter.Panel defaultSize="45%" min="400px">…</Splitter.Panel>
</Splitter>
```

**Deviation:** two modes in one view (list ↔ workspace) driven by local state, not routing. Left panel is `TeamSidebar` at `defaultSize="300px" min="260px" max="380px"` (UI-SPEC §5b). Right panel is `AiChatWidget` + the attribution layer. `data-testid`: `teams-view`, `team-card-{id}`, `team-activate-{id}`, `team-pause-{id}`, `team-workspace`, `team-workspace-header`.

---

### `src/components/ai/office/AssignmentPlanCard.tsx` (component, park)

**Analog:** `src/components/ai/widget/MutationApprovalCard.tsx:17-69` — copy the container geometry and the "card IS the wait state" doc comment.

```tsx
// src/components/ai/widget/MutationApprovalCard.tsx:25-67
<div data-testid="ai-mutation-approval"
     style={{ margin: '8px 0 16px', padding: 16, backgroundColor: token.colorWarningBg,
              border: `1px solid ${token.colorWarningBorder}`, borderRadius: 8,
              display: 'flex', flexDirection: 'column', gap: 8 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, … }}>…</div>
  <div className="chat-markdown-body" style={{ fontSize: 14, lineHeight: 1.5, … }} … />
  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
    <Button danger onClick={onReject}>Từ chối</Button>
    <Button type="primary" onClick={onApprove}>Chấp thuận</Button>
  </div>
</div>
```

**Deviation (UI-SPEC §7):** background `token.colorBgContainer` (NOT warning), `borderLeft: '3px solid ' + token.colorPrimary`, header `TeamOutlined` in `colorPrimary` + `Kế hoạch phân việc` + `<Tag>Lô {n}</Tag>`. No spinner, no auto-dismiss while awaiting. After decision, replace buttons with a `role="status"` line. `data-testid`: `assignment-plan-card`, `assignment-plan-approve`, `assignment-plan-reject`.

---

### `src/components/ai/office/AgentPausedBanner.tsx` (component)

**Analog:** antd `Alert type="warning" showIcon` + the card spacing from `MutationApprovalCard.tsx:26-37` (`margin: '8px 0 16px'`, `borderRadius: 8`).

**Deviation:** `role="status"`, `data-testid="agent-paused-banner"`. **Forbidden in this state:** `Spin`, `SyncOutlined spin`, shimmer, "Đang xử lý…". The waiting state is text + `Tạm dừng` badge only (UI-SPEC §8c).

---

### `src/components/ai/office/BudgetTopUpModal.tsx` (component)

**Analog:** antd `Modal` usage inside `ChatMessageList.tsx:287-334` (popout modal) for the shell; `MutationApprovalCard` footer button pair for the action row.

**Deviation:** `width={480}`, `Descriptions size="small" column={1}` for `Đã dùng` / `Ngân sách hiện tại` / `Ngưỡng cảnh báo (80%)`, `InputNumber min={1000} step={1000}`, preview line with the new total. `data-testid`: `budget-topup-modal`, `budget-topup-confirm`.

---

### `src/components/ai/office/TeamSidebar.tsx` (component)

**Analog:** `AgentControlView.tsx:158-170` (left splitter panel content) for the vertical stack; `SystemCatalogView.tsx:157-184` for the empty-state block.

**Deviation:** four sections (Thành viên / Ngân sách nhóm / Liên kết / Chế độ) with 6px status dots, `Progress` + `Cấp thêm token`, linked-items list, two `Switch` rows. `data-testid`: `team-sidebar`, `team-budget-panel`, `team-linked-items`, `team-mode-toggles`.

---

### `src/components/ai/office/AgentAttributionRow.tsx` (component)

**Analog:** `src/components/ai/ChatMessageBubble.tsx:1168-1180` — the bubble layout the attribution row must sit above without restyling it.

```tsx
// src/components/ai/ChatMessageBubble.tsx:1168-1180
alignItems: isUser ? 'flex-end' : 'flex-start',
maxWidth: isUser ? '85%' : '95%',
backgroundColor: isUser ? token.colorPrimary : token.colorFillAlter,
borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
border: isUser ? 'none' : `1px solid ${token.colorBorderSecondary}`,
padding: isUser ? '8px 12px' : '12px 16px',
```

**Deviation:** attribution row = `<Avatar size={24} shape={isLead ? 'square' : 'circle'}>` + name (12/600) + role (12 secondary) + `CrownOutlined` for lead, `marginBottom: 4`, `gap: 6`. Deterministic avatar color: `charCodeSum(agentId) % 6` over the six-token palette (UI-SPEC §Avatar). Status/stop row below the bubble; Stop is `22×22`, `type="text" danger`, `aria-label={`Dừng ${name}`}`, `data-testid={`agent-stop-${agentId}`}`, no confirmation.

---

## Shared Patterns

### 1. Dexie migration — additive only

**Source:** `src/db/schema.ts:112-117` + `src/db/index.ts:316-318`

```ts
// src/db/schema.ts:112-117
export const SCHEMA_V16 = {
  ...SCHEMA_V15,
  projects: null,
  milestones: null,
  tasks: 'id, crId, systemId, status, priority, deadline, workType, jiraKey, reminderDate, *opsOwners, *businessAnalysts',
} as const;
```

```ts
// src/db/index.ts:316-318
this.version(16)
  .stores(SCHEMA_V16)
  .upgrade(async (tx) => { /* … */ });
```

**Apply to:** `schema.ts` (append `SCHEMA_V17`), `db/index.ts` (append `this.version(17).stores(SCHEMA_V17)` with **no** `.upgrade()`), `db/index.ts:52-76` (add six `Table<>` declarations), `db/index.ts:20-44` (add six type imports).

```ts
export const SCHEMA_V17 = {
  ...SCHEMA_V16,
  aiEmployees: 'id, name, skillId, model, createdAt',
  aiLeads: 'id, name, model, createdAt',
  aiSkills: 'id, name, createdAt',
  aiTeams: 'id, name, leadId, status, createdAt',
  aiTeamMembers: 'id, teamId, agentId, role',
  aiTeamLinks: 'id, teamId, itemType, itemId',
} as const;
```

**Hard rules:** never alter an existing store's index spec (forces a full index rebuild); never add an index to `chatMessages` — `where('threadId')` is already indexed, filter `agentId`/`messageKind` in JS. Also add the six names to `SQLITE_DOMAIN_TABLES` (`src/services/localSqlitePersistence.ts:14-27`) and the Rust `ALLOWED_TABLES` (`src-tauri/src/sqlite_persistence.rs`), otherwise the mirror silently skips them.

### 2. Runtime request extension (additive optional fields)

**Source:** `src/components/ai/runtime/chatTurnRuntime.ts:57-104`

```ts
export interface ChatTurnRequest {
  /* …existing… */
  /** Trusted, request-bound SDLC artifact scope. Never read from a global registry. */
  artifactContext?: ArtifactToolContext;
  /** WR-19: CR this turn is bound to; tool calls outside it are rejected. */
  crScopeId?: string;
}
```

**Apply to:** `chatTurnRuntime.ts` (request fields `agentId?`, `agentName?`, `agentKind?`, `messageKind?`, `persistUserMessage?`, `mutationPolicy?: 'approve' | 'read-only'`; deps `onUsage?`).

Three exact edits, each at a pinned line:
1. `chatTurnRuntime.ts:237-243` — wrap the user-message write in `if (request.persistUserMessage !== false)` (Pitfall 2).
2. `chatTurnRuntime.ts:348-350` — insert the read-only refusal **before** the artifact branch (D-12, Pitfall 3):
   ```ts
   onMutationCheck: async (toolName, args) => {
     if (request.mutationPolicy === 'read-only') {
       return { proceed: false, cancellationResult: READ_ONLY_REFUSAL };
     }
     // …existing artifact-patch → auto-approve → explicit-wait order, unchanged…
   ```
3. `chatTurnRuntime.ts:316-322` — forward cumulative usage: `deps.onUsage?.(tokenUsage)` after re-summing.
4. `chatTurnRuntime.ts:456-466` — forward `agentId`/`agentName`/`agentKind`/`messageKind` into the `saveMessage` call.

**Never touch:** `ChatTurnStatus` (21-31), `ACTIVE_AI_STATUSES` (`aiTurnManager.ts:4-10`), `TURN_STATUS_TO_TAB` (`AIChatDrawer.tsx:124`), `AiChatWidget`'s `ACTIVE_STAGES` (`AiChatWidget.tsx:119-124`), `stageLabelFor` (`useChatTurn.ts:33-49`). D-35.

### 3. Loop round-boundary callback

**Source:** `src/services/ai/aiOrchestratorLoop.ts:52-99` (options) + `:220-221` (loop head) + `:467` (round end)

```ts
// src/services/ai/aiOrchestratorLoop.ts:220-222
while (loopCount < maxLoops) {
  loopCount++;
  fullResponse = '';
```

**Apply to:** `aiOrchestratorLoop.ts` — add `beforeToolRound?: (round: number, signal?: AbortSignal) => Promise<void>` to `AiOrchestratorLoopOptions`, destructure it, and insert after `loopCount++`:

```ts
if (loopCount > 1 && beforeToolRound) {
  await beforeToolRound(loopCount, signal);   // the gate observes this signal, so a Stop while parked rejects
  signal?.throwIfAborted();
}
```

The hook takes the loop's own `AbortSignal` as its second argument. A gate parked inside the hook must be able to reject on abort — passing the signal is what makes `gate.wait(signal)` settle instead of hanging (Pitfall 8). Do not document or implement a one-argument form.

The boundary at `:467` is after every tool result is appended and before the next model call — in-flight tool completes, message list intact, resume continues exactly where it stopped (D-21).

### 4. Tool payload + read-only allowlist

**Source:** `src/services/ai/chatTurnTools.ts:17-36`

```ts
export function getToolsForTurn(
  effectiveAnalysisMode: boolean,
  dynamicMcpTools: AiToolDefinition[] = [],
  allowedToolNames?: readonly string[]
): AiToolDefinition[] {
  const allowed = allowedToolNames === undefined ? undefined : new Set(allowedToolNames.map(normalizeToolName));
  return [
    ...AI_DATABASE_TOOLS.filter((tool) =>
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      /* … */ &&
      (!effectiveAnalysisMode || allowed === undefined || !isMutationTool(normalizeToolName(tool.function.name)))),
    ...dynamicMcpTools.filter(/* … */),
  ];
}
```

**Apply to:** `chatTurnTools.ts` — export two named allowlists:
- `EMPLOYEE_READ_ONLY_ALLOWLIST` — every read tool (`query_tasks`, `query_change_requests`, `query_systems`, `query_notes`, `get_item_details`, `retrieve_knowledge`, `read_file`, `search_team_history`, `read_team_turn`, `read_skill`) + `getToolsForTurn(true, mcp, EMPLOYEE_READ_ONLY_ALLOWLIST)`.
- `LEAD_TOOL_ALLOWLIST` — the ordinary read set + `list_linked_items`, `get_linked_context`, `delegate_batch`.
Never include `delegate_batch` in the employee list (Pitfall 10). Assert it in a test.

### 5. Backup — five-file contract, envelope stays v11

**Source:** `src/services/backup/exportBackup.ts:7` + `:237-283`; `src/types/backup.ts:55-77`; `src/validation/backupSchemas.ts:298-328`; `src/services/backup/validateBackup.ts:161-182`; `src/services/backup/restoreBackup.ts:26-49` + `:221-267`.

```ts
// src/services/backup/exportBackup.ts:7
export const CURRENT_SCHEMA_VERSION = 11 as const;
```

```ts
// src/services/backup/validateBackup.ts:177-182 — the optional-absent pattern to copy for new tables
const chatMessages = rawTables.chatMessages !== undefined
  ? validateTable('chatMessages', BackupChatMessageRecordSchema, rawTables.chatMessages)
  : undefined;
```

**Apply to all five files.** New tables go in as `optional` in `BackupTableData`/`BackupTableCounts`, `rawTables.X !== undefined ? validateTable(...) : undefined` in `validateBackup`, and `if (rows?.length) await table.bulkAdd(rows)` in `restoreBackup`. Mirror `clearKnowledge`'s "absent means the payload predates them" rule (`restoreBackup.ts:226-231`). **Do not bump `CURRENT_SCHEMA_VERSION`** — `validateBackup.ts:92-99` rejects every older envelope (Pitfall 5; `tests/services/backup/v2Compatibility.test.ts:24` pins `=== 11`).

**Pitfall 6 — message attribution is stripped on restore** because `BackupChatMessageRecordSchema` is a plain `z.object` (`backupSchemas.ts:298`), not `.passthrough()`. Add explicit optional `agentId`, `agentName`, `agentKind`, `messageKind` fields, or restored messages render unattributed.

**Forbidden field names** on every new row: `backupSchemas.ts:200-225` rejects `systemPrompt`/`prompt`/`token`/`secret`/… recursively. Use `persona` and `body`.

### 6. Workbench view registration — four files, five edit sites

**Source:** `layoutStore.ts:6-21`; `EditorArea.tsx:65-99` (icons) + `:495-517` (rendering) + `:558-568` (internal titles map); `WorkbenchLayout.tsx:174-197`; `TitleBar.tsx:282-307`.

```ts
// src/workbench/store/layoutStore.ts:6-21
export type EditorViewType = 'tasks' | 'notes' | … | 'agents' | … | 'remote_file';
```

```tsx
// src/workbench/EditorArea.tsx:516-517
case 'agents':
  return <AgentControlView />;
```

**Apply to:**
1. `layoutStore.ts` — add `'teams'` to `EditorViewType`.
2. `EditorArea.tsx:65-99` `getEditorTabIcon` — `case 'teams': return <JetBrainsAgentsIcon size={size} />;`
3. `EditorArea.tsx:495-517` `renderViewContent` — `case 'teams': return <TeamsView {...dbProp} />;` and change `case 'agents':` to `<AiOfficeView {...dbProp} />`.
4. `EditorArea.tsx:558-568` **internal** `titles` map (inside the `insight` branch) — add `teams: 'AI Office — Nhóm'`. **The UI checker flagged this: it is a second, separate place; missing it means the tab title falls back to the raw key.**
5. `WorkbenchLayout.tsx:176-188` `handleOpenView` titles — `teams: 'AI Office — Nhóm'`.
6. `TitleBar.tsx` after the Ghost Dev button (`:282-307`) — a new nav button labelled **AI Office** with `<TeamOutlined size={14}/>`.

### 7. Chat message attribution

**Source:** `ChatMessageList.tsx:139-177` (map) + `:190-203` (single streaming bubble); `ChatMessageBubble.tsx:81-93` (props) + `:122-123` (mention regex).

```tsx
// src/components/ai/ChatMessageList.tsx:162-175
<React.Fragment key={msg.id}>
  <ChatMessageBubble message={msg} canAddToChecklist={…} … />
</React.Fragment>
```

**Apply to:** `ChatMessageList.tsx` gains `agentDirectory?: Map<string, AgentIdentity>` and passes `agent` per message; `ChatMessageBubble.tsx` gains `agent?`, `agentStatus?`, `onStopAgent?`. The mention regex at `:123` gains an `agent:` alternative and renders an agent pill. **N concurrent streaming bubbles** cannot use `ChatMessageList`'s single `streamingText` prop (`:191-203`) — the team workspace renders live bubbles from the coordinator's per-agent state via `AiChatWidget`'s `transcriptExtensions` prop (`AiChatWidget.tsx:96`), keyed by `agentId` and removed on settle so the persisted row replaces it without duplication.

### 8. Background turn registration

**Source:** `src/services/ai/aiTurnManager.ts:67-101`

```ts
registerTurn(turn: Omit<ActiveAiTurn, 'startedAt' | 'toolEvents' | 'streamingText'> & { … }) { … }
updateTurn(id: string, patch: Partial<Omit<ActiveAiTurn, 'id' | 'abort'>>) { … }
finishTurn(id: string, finalStatus: ChatTurnStatus = 'complete') { … }
abortTurn(id: string) { … }
```

**Apply to:** `teamRunCoordinator.ts` — `aiTurnManager.registerTurn({ id: `team:${teamId}:agent:${agentId}`, scopeKey: teamId, title, status, abort: () => registry.abort(agentId) })` and one team-level turn `team:${teamId}` with `abort: () => coordinator.abortAll()`. `ActiveAiTurnIndicator.tsx:50-120` already renders the capsule, ticker and abort path unchanged; only the icon differs (`TeamOutlined` instead of `SyncOutlined spin`) and the global stop gains a `Popconfirm` (UI-SPEC §11).

---

## No Analog Found

| File | Role | Data Flow | Reason / Guidance |
|---|---|---|---|
| `src/services/ai/office/teamRunCoordinator.ts` (the orchestration body) | service | event-driven batch | No multi-agent orchestrator exists. Use RESEARCH §Pattern 1/2/5 as the design, and the three analogs above for every primitive it composes. Keep it ~300 lines: if a plan task writes a new loop, a new search index, or a new approval mechanism, that is a red flag. |
| `src/services/ai/office/budgetGate.ts` (the 80% crossing rule) | utility | event-driven | No gate exists; the approval park is the closest resolver-promise precedent. The crossing rule is a pure function — do not add state for it. |
| `src/views/TeamsView.tsx` (workspace mode) | view | streaming | No view hosts a multi-agent live transcript. Compose: list mode from `SystemCatalogView`, workspace mode from `AgentControlView`'s `Splitter`, transcript from `AiChatWidget`. |

---

## Test File Patterns

| New test | Analog | What to copy |
|---|---|---|
| `tests/services/ai/office/teamRunCoordinator.test.ts` | `tests/ai/chatTurnRuntime.test.ts:26-100` | `makeRequest(overrides)` factory, `LoopScript` fake `runLoop`, `runtimeWith(runLoop, extra)`, `beforeEach` creates `new TaskPlannerDatabase(\`test-turn-${Date.now()}-${Math.random()}\`)`, `afterEach` `db.delete()` |
| `tests/services/ai/office/budgetGate.test.ts` | `tests/ai/chatTurnRuntime.test.ts:219-240` (approval park) | resolver-installed-before-publish; assert `getStatus() === 'aborted'` after pause → abort |
| `tests/db/schemaV17Migration.test.ts` | `tests/db/schemaV16Migration.test.ts:1-70` | `seedV15Database`-style fixture built with a raw `new Dexie(name)` at the prior version, then open `TaskPlannerDatabase` and assert V16 data survives + six new tables exist |
| `tests/services/ai/office/aiTeamRepo.test.ts` | `tests/db.test.ts:19-46` + `chatTabRepo` transaction semantics | 4th activation rejected, roster >3 rejected, reactivation keeps transcript |
| `tests/ai/ChatMessageListAttribution.test.tsx` | `tests/ai/ChatMessageBubble.test.tsx` | render with `agentDirectory`, assert avatar/name/stop testids |
| `tests/views/TeamsView.test.tsx`, `tests/views/AiOfficeView.test.tsx` | `tests/views/SystemCatalogView`-style view tests (`tests/views/*.test.tsx`) | route + segment defaults; Ghost Dev still reachable |
| **MOD** `tests/db.test.ts:19-46` | itself | the exact sorted table list **will fail** — add the six new table names |

Never run the full suite; always pass scoped paths (`npx vitest run tests/services/ai/office …`).

---

## Metadata

**Analog search scope:** `src/db/`, `src/db/repositories/`, `src/services/ai/`, `src/services/backup/`, `src/components/ai/`, `src/components/common/`, `src/views/`, `src/workbench/`, `src/types/`, `src/validation/`, `tests/ai/`, `tests/db/`, `tests/views/`
**Files scanned:** 31
**Pattern extraction date:** 2026-11-08
**Zero new dependencies confirmed:** every analog is in-repo or an already-installed package (dexie 4.4.6, antd 6.6.5, zod 4.6.5, dexie-react-hooks 4.4.0).
