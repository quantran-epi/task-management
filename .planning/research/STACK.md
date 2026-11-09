# Stack Research — Milestone v1.4 "Unified AI Office"

**Domain:** Chat-first multi-agent orchestration added to an existing offline-first React 19 + Dexie + Ant Design + Tauri desktop app
**Researched:** 2026-11-09
**Confidence:** HIGH

## Headline Verdict

**Zero new npm dependencies.** Every capability the milestone needs — leader→N-agent orchestration, hard token budgets, configurable concurrency, skill versioning, skill diff approval — is already covered by the installed set (`dexie`, `dexie-react-hooks`, `zod`, `zustand`, `antd`, `@tanstack/react-virtual`, `react-resizable-panels`) plus platform primitives (`AbortSignal`, `Promise`, `Map`, `crypto.randomUUID`, Web Crypto). The work is **schema + service + UI**, not dependencies.

Anything proposed as a new package below is listed in "What NOT to Add" with the exact existing replacement.

## Existing Stack (verified in `package.json`, no changes)

| Technology | Installed | Role in v1.4 |
|------------|-----------|--------------|
| React / react-dom | ^19.3.0 | Explorer + editor center + team workspace |
| antd | ^6.6.5 | Explorer tree, drawers, modals, `Progress`, `Statistic`, `Alert` for budget UI |
| dexie | ^4.4.6 | New `aiSkillVersions` store; budget/skill persistence |
| dexie-react-hooks | ^4.4.0 | `useLiveQuery` for live budget bars and skill version lists |
| zod | ^4.6.5 | Boundary schemas for new entities (`aiOfficeSchemas.ts`, `backupSchemas.ts`) |
| zustand | ^5.0.16 | Ephemeral UI state (selected team, concurrency draft) — never domain data |
| @tanstack/react-virtual | ^3.14.26 | Virtualize conversation list (C-08 removes the team cap → unbounded lists) |
| react-resizable-panels | ^2.1.9 | Already used by workbench; reuse for explorer/editor split |
| dayjs | ^1.11.23 | Timestamps on skill versions / budget events |
| @tauri-apps/api | ^2.2.0 | Desktop lifecycle; no new plugin needed |

No version bumps required. Node 24 LTS / Vite 8 / Vitest 5 / TypeScript 7 remain valid.

## Capability → Implementation Map (no new package)

### (a) Token accounting and hard budget gating

**Already built — extend, do not replace.**

| Piece | Location | Status |
|-------|----------|--------|
| `ChatTokenUsage { promptTokens, completionTokens, totalTokens }` | `src/types/models.ts:274` | Sufficient for "input + output" (C-11) |
| Per-round accumulation | `src/services/ai/aiOrchestratorLoop.ts:305-345,515-521` | Sums prompt/completion/total per round |
| Per-turn cumulative usage hook | `src/components/ai/runtime/chatTurnRuntime.ts:115,340-346` | `onUsage` already cumulative — coordinator must not re-sum |
| Delta accounting + 80% bucket rule | `src/services/ai/office/budgetGate.ts:68-86` | `bucketOf`, `shouldNotifyPause`, `normalizeUsageTotal` |
| Pause gate (no abort) | `src/services/ai/office/budgetGate.ts:23-62` | `createBudgetGate` — resolver installed before publish, abort-safe |
| Per-agent + team gates | `src/services/ai/office/teamRunCoordinator.ts:223-264,413-460,499-507` | Wired at `beforeToolRound` |
| Persisted budget home | `AiTeam.budgetTokens`, `AiTeamMember.budgetTokens/usedTokens` (`src/types/aiOffice.ts:67-89`) | Per-row writes, never a JSON array (D-32) |

**Gaps to close in code (not stack):**

1. `topUp({kind:'agent'})` writes only the member row; C-12 requires it to also raise `AiTeam.budgetTokens` by the same amount. Today only `setTeamBudget`/team-scope top-up move the team total (`teamRunCoordinator.ts:851-893`).
2. Cache tokens are dropped: `nineRouterClient.ts:333-335,426-428` maps only `prompt_tokens`/`completion_tokens`/`total_tokens`. If 9router returns Anthropic-style `cache_read_input_tokens` / `cache_creation_input_tokens`, extend `ChatTokenUsage` with optional `cacheReadTokens`/`cacheWriteTokens` and map them. `src/utils/agentMetrics.ts:24-30` already demonstrates the defensive parse. **Type change only — no dependency.**
3. Threshold value and count are open (R-03/R-04). Keep the bucket function pure and parameterize the threshold; store the setting in the existing `settings` table (`Setting { key, value }`, `src/types/models.ts:150`), e.g. `ai_office_budget_threshold`.
4. Missing-usage responses: `normalizeUsageTotal` returns 0 when all fields are absent → an unbudgeted call silently spends. Add a fallback estimate only if 9router can omit usage; otherwise surface a "usage unavailable" flag on the turn. Do **not** add a tokenizer package (see below).

**Do NOT** add token-count estimation libraries to "measure precisely" — precision comes from provider-reported usage, which the pipeline already consumes.

### (b) Concurrency control (C-10) — hand-rolled semaphore, ~40 lines

`runBatch` currently starts every assignment at once: `started.push(startEmployeeTurn(...))` then `Promise.allSettled` (`teamRunCoordinator.ts:730-763`). With C-09 (unlimited agents) that is unbounded parallel API calls.

**Recommended:** one new module `src/services/ai/office/semaphore.ts`:

```ts
export interface Semaphore {
  acquire(signal?: AbortSignal): Promise<() => void>; // returns idempotent release
  setLimit(next: number): void;                        // live re-tune from Settings
  readonly active: number;
  readonly pending: number;
}
export function createSemaphore(limit: number): Semaphore;
```

Requirements the implementation must meet (mirror `budgetGate.ts` conventions):
- FIFO waiter queue; `release()` hands the slot directly to the next waiter (no re-entrant race).
- `acquire(signal)` rejects with `DOMException('Aborted','AbortError')` and removes its waiter on abort — same contract as `BudgetGate.wait` (`budgetGate.ts:44-60`), so Stop never hangs.
- `setLimit` raises drain waiters immediately; lowering never revokes an in-flight slot.
- Release must be idempotent (double-release in `finally` + abort path must not free two slots).

Integration points:
- `runBatch`: wrap `startEmployeeTurn` in `const release = await sem.acquire(signal); try { … } finally { release(); }`.
- A per-team semaphore instance lives on the coordinator (same lifetime as `agentGates`), so a view switch does not reset it.
- Setting storage: `settings` row `ai_office_concurrency` (default 3, clamp 1–12 — same clamp shape as `ghostDevConfig.ts:37-40,54`). Read at run start, `setLimit` on change.
- `MAX_BATCH_SIZE = 3` (`src/types/aiOffice.ts:117`) must become derived from the concurrency setting or be removed; it currently caps `delegate_batch` at 3 assignments (`teamTools.ts:297`), contradicting C-09.

**Why not `p-limit` (7.3.3) or `p-queue` (10.0.0)?** Both are fine packages (verified on npm registry: `p-limit@7.3.3`, engines `node>=20`; `p-queue@10.0.0`, engines `node>=22`), but neither offers abort-aware `acquire`, live `setLimit` with FIFO drain, or an idempotent release token — the three properties this coordinator actually needs. Wrapping them costs more code than the 40-line semaphore and adds a supply-chain surface to a Tauri bundle.

**Why not `async-mutex` (0.5.0)?** Mutex ≠ semaphore; it serializes to 1 and has no queue-limit semantics.

### (c) Skill versioning + enrichment approval (C-13)

**Storage: new Dexie store, schema V18.** Follow the established additive pattern (`src/db/schema.ts:121-129`, `src/db/index.ts:492` — `this.version(18).stores(SCHEMA_V18)`, no `.upgrade()` hook because nothing is backfilled).

```ts
export const SCHEMA_V18 = {
  ...SCHEMA_V17,
  aiSkillVersions: 'id, skillId, &[skillId+version], status, createdAt',
} as const;
```

```ts
export type AiSkillVersionStatus = 'proposed' | 'approved' | 'superseded';

export interface AiSkillVersion {
  id: string;
  skillId: string;
  version: number;            // 1-based, max+1 per skill
  description: string;        // ≤ 300, same cap as AiSkill
  body: string;               // Markdown
  status: AiSkillVersionStatus;
  source: 'enrichment' | 'manual';
  /** Agent-proposed lessons; user-approved text only. Never raw model output. */
  evidence?: string[] | undefined;
  proposedByAgentId?: string | undefined;
  threadId?: string | undefined;
  createdAt: string;
  approvedAt?: string | undefined;
}
```

`AiSkill` keeps `body` as the **approved head** (so `read_skill` in `teamTools.ts` and the prompt injection at `teamPrompts.ts:88-95` need no change); approving a version copies its `body`/`description` onto the `AiSkill` row and marks the previous version `superseded` inside one `db.transaction('rw', [db.aiSkills, db.aiSkillVersions], …)`.

Version numbering: copy the `max(version)+1` pattern from `src/services/wizard/artifactRepo.ts:170-186` — do not add a counter column.

Diff preview before approval: reuse `createUnifiedLineDiff` from `src/utils/lineDiff.ts:110` (already handles a `MAX_DIFF_CELLS` budget refusal) and render with `renderSafeMarkdown` (`src/utils/markdown.ts:137`). **No diff library.**

Backup integration (required, or versions are lost on restore): add `aiSkillVersions` to `exportBackup.ts` table list (`:192-221,273-304`), a `BackupAiSkillVersionRecordSchema` in `backupSchemas.ts` (mirror `BackupAiSkillRecordSchema` at `:651`), referential checks in `validateBackup.ts:625-640`, and bump `CURRENT_SCHEMA_VERSION`.

**Naming constraint (data-safety, non-obvious):** `FORBIDDEN_BACKUP_KEYS` in `src/validation/backupSchemas.ts:200-221` recursively rejects keys matching `prompt`, `error`, `stack`, `diagnostic`, `secret`, `token`, `runtime`, `partial`, `raw*response`. Do **not** name any persisted field `proposedPrompt`, `errorMessage`, `stackTrace`, or `runtimeInfo` — the backup export will refuse the record. `body` and `evidence` are safe (same free-text carrier class as `AiSkill.body`).

### (d) Explorer / UI (C-14)

- Two-tier explorer: Ant Design `Tree` or nested `Collapse` + `useLiveQuery`; virtualize the conversation list with the already-installed `@tanstack/react-virtual` because C-08 removes the team cap.
- Budget display ("đo lường chính xác, hiển thị chuẩn chỉ", R-19): `Progress` + `Statistic` with `promptTokens`/`completionTokens` shown separately; format via the existing `formatTokenCount` (`src/utils/agentMetrics.ts:70`).
- Live updates: `useLiveQuery` over `aiTeamMembers` for persisted usage; the in-flight coordinator snapshot (`getState()` + `subscribe`) for streaming usage. Do not poll.
- Concurrency + threshold settings: Ant Design `InputNumber`/`Slider` in the existing Settings surface, persisted to `settings`.

### (e) Removing SDLC Studio

Pure deletion + shared-code extraction — no stack impact. Audit list already exists in `.planning/MILESTONE-CONTEXT.md` (R-13). Known shared item: `SafeMarkdown` (`src/components/sdlc/common/SafeMarkdown.tsx`) is a thin wrapper over `renderSafeMarkdown`; relocate it to `src/components/common/` rather than delete, and `buildConventionsSegment` from `sdlcPromptComposer.ts` must be checked against `AIChatDrawer` imports before removal.

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `p-limit` / `p-queue` | No abort-aware acquire, no live limit re-tune, no idempotent release token; ~40-line semaphore is smaller and exact | `src/services/ai/office/semaphore.ts` (new, hand-rolled) |
| `async-mutex` | Mutex serializes to 1; wrong primitive | Same semaphore |
| `js-tiktoken` / `tiktoken` / `gpt-tokenizer` | ~22 MB unpacked (verified `js-tiktoken@1.0.21`, unpackedSize 22,432,828 B); provider already reports exact usage; model-agnostic tokenizer would be wrong for 9router's mixed providers | `ChatTokenUsage` from the provider + `normalizeUsageTotal` |
| `langchain` / `langgraph` / `@langchain/*` | Brings its own agent/state/memory model that would fork the existing `runAiOrchestratorLoop` + `ChatTurnRuntime` + `aiTurnManager` design; violates "composition, not reimplementation" already documented in `teamRunCoordinator.ts:64-72` | Existing loop + coordinator |
| `ai` (Vercel AI SDK) / `openai` SDK | Duplicates `nineRouterClient.ts` (SSE parsing, tool-call accumulation, usage mapping, key redaction) | `src/services/ai/nineRouterClient.ts` |
| `xstate` / any state-machine lib | `TeamRunPhase` union + coordinator is already a working explicit machine; a library adds a second source of truth | `TeamRunPhase` in `src/types/aiOffice.ts:19-28` |
| `bullmq` / `piscina` / Web Worker pool libs | No server; worker framework premature (CLAUDE.md already says profile first) | Semaphore; native module Worker only if profiling demands |
| `react-query` / `@tanstack/query` | Dexie + `useLiveQuery` already own local state/reactivity | `useLiveQuery` |
| `uuid` | Native `crypto.randomUUID` via `src/utils/uuid.ts` | `generateId()` |
| `diff` / `jsdiff` / `diff-match-patch` | `src/utils/lineDiff.ts` already implements a budgeted unified diff | `createUnifiedLineDiff` |
| `marked` / `react-markdown` / `remark-react` | `renderSafeMarkdown` is the sanctioned escaped-HTML boundary | `src/utils/markdown.ts` |
| `dexie-cloud` / sync add-ons | Local-only app; encrypted GitHub backup already exists | Existing backup pipeline |
| New Dexie wrapper / ORM | Dexie is the store | Direct `db.transaction` |
| Separate DB for AI Office | Would break backup, restore, and multi-tab `versionchange` handling | Extend `TaskPlannerDatabase` |
| Any token/cost dashboard library | Ant Design `Statistic`/`Progress` is enough | antd |
| Persisting raw model output or prompts in skill versions | Backup denylist rejects those keys; also leaks instruction text | Persist only approved `body`/`description`/`evidence` |

## Installation

```bash
# No new dependencies.
# No version bumps.
```

Only file-level additions:

| File | Change |
|------|--------|
| `src/db/schema.ts` | `SCHEMA_V18` with `aiSkillVersions` |
| `src/db/index.ts` | `this.version(18).stores(SCHEMA_V18)` + `aiSkillVersions` table type |
| `src/types/aiOffice.ts` | `AiSkillVersion`, status union, threshold/concurrency constants |
| `src/validation/aiOfficeSchemas.ts` | `AiSkillVersionInputSchema` / approval schema |
| `src/db/repositories/aiOfficeRepo.ts` | version list/approve/supersede (transactional) |
| `src/services/ai/office/semaphore.ts` | new |
| `src/services/ai/office/teamRunCoordinator.ts` | semaphore in `runBatch`, per-agent top-up raises team total, threshold from settings |
| `src/services/ai/office/budgetGate.ts` | parameterize threshold (keep pure helpers) |
| `src/validation/backupSchemas.ts`, `exportBackup.ts`, `validateBackup.ts` | `aiSkillVersions` round-trip + schema version bump |
| `src/services/ai/nineRouterClient.ts`, `src/types/models.ts` | optional cache-token fields (only if 9router emits them) |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hand-rolled semaphore | `p-limit` | Only if you drop abort-aware acquire and live re-tuning requirements |
| Extend `settings` table for threshold/concurrency | New `aiOfficeSettings` store | Only if settings become per-team and queryable by team index |
| `aiSkillVersions` store keyed by `skillId` | Version rows as `Note` with `sdlcArtifact`-style metadata | Only if versions must appear in the Notes UI; couples AI Office to the notes domain |
| Approved `body` copied onto `AiSkill` | Read head version via join on every prompt build | Only if audit requires immutable head; adds a read to every employee turn |
| Provider-reported usage | Local tokenizer | Only if a provider omits usage entirely — and then prefer a documented chars/token heuristic over a 22 MB tokenizer |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| dexie 4.4.6 | Compound unique index `&[skillId+version]` | Supported; no upgrade hook needed for an additive store |
| dexie-react-hooks 4.4.0 | New `aiSkillVersions` table | `useLiveQuery` reacts to any table on the same `db` instance |
| zod 4.6.5 | New boundary schemas | Follow existing `*Input`/`*Update` pair convention |
| antd 6.6.5 | `Progress`, `Statistic`, `Tree`, `Alert` | No extra icon package beyond installed `@ant-design/icons` |
| @tanstack/react-virtual 3.14.26 | Unbounded conversation list | Already a dependency; no new install |
| TypeScript 7.0.2 `strict` + `exactOptionalPropertyTypes` | Optional fields on `AiSkillVersion` | Use `?: T \| undefined` exactly as `AiEmployee` does |
| Tauri 2 (`rusqlite` bundled) | No new plugin | IndexedDB remains the store; no SQLite migration for AI Office |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Zero-new-dependency verdict | HIGH | Every needed capability traced to an existing module in the repo |
| Token accounting approach | HIGH | Usage plumbing verified end-to-end (client → loop → runtime → coordinator → budgetGate) |
| Semaphore design | HIGH | Contract mirrors the proven abort-safe `BudgetGate`; no library needed |
| Skill versioning schema | HIGH | Mirrors the repo's own `max(version)+1` artifact pattern and additive Dexie versioning |
| Cache-token extension | MEDIUM | Depends on whether 9router surfaces cache fields; current client maps only three fields |
| Concurrency default value | LOW | R-05 open; recommendation (3, clamp 1–12) is a proposal, not a decision |

## Sources

- Repo evidence: `package.json`, `src/types/aiOffice.ts`, `src/db/schema.ts:121-129`, `src/db/index.ts:492`, `src/services/ai/office/{budgetGate,teamRunCoordinator,teamRunRegistry,teamPrompts,teamTools}.ts`, `src/components/ai/runtime/chatTurnRuntime.ts:115,340-346`, `src/services/ai/aiOrchestratorLoop.ts:305-345,515-521`, `src/services/ai/nineRouterClient.ts:333-335,426-428`, `src/utils/{agentMetrics,lineDiff,markdown,uuid}.ts`, `src/services/wizard/artifactRepo.ts:170-186`, `src/validation/backupSchemas.ts:200-221,651-658`, `src/services/backup/{exportBackup,validateBackup}.ts`.
- npm registry (only for rejected alternatives): `p-limit@7.3.3` (engines `node>=20`), `p-queue@10.0.0` (engines `node>=22`), `js-tiktoken@1.0.21` (unpackedSize 22,432,828 B), `async-mutex@0.5.0`.
- `.planning/MILESTONE-CONTEXT.md` (git `HEAD`) for C-01..C-15 and R-01..R-21.
