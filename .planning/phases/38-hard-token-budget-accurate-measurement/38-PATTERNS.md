# Phase 38: Hard token budget + accurate measurement — Pattern Map

**Mapped:** 2026-11-13
**Files analyzed:** 27 (8 new/created, 19 modified)
**Analogs found:** 25 / 27 (2 have no exact in-repo analog: `tokenEstimate.ts`, `budgetWarning.ts`)

All analog paths below verified git-tracked (`git ls-files -- <path>` non-empty).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/repositories/aiTeamRepo.ts` (rewrite `addUsedTokens`, `topUpMemberBudget`, `writeEvenSplit`, `applyTopUp`) | repository | CRUD + atomic RMW | `src/db/repositories/aiTeamRunRepo.ts:110-199` (read-modify-write inside `rw` txn) | exact (role + flow) |
| two-table member+team write | repository | multi-table txn | `src/db/repositories/aiTeamRepo.ts:176-228` (`updateTeam`), `src/db/repositories/aiOfficeRepo.ts:117-150` | exact |
| `src/services/ai/office/budgetSplit.ts` (new) | utility (pure) | transform | `src/db/repositories/aiTeamRepo.ts:69-91` + `TeamSettingsDrawer.tsx:48-59` | exact (the two copies to merge) |
| `src/services/ai/office/tokenEstimate.ts` (new) | service | transform, lazy init | `src/services/ai/graphitiMcpClient.ts:33-36` (lazy promise singleton) | role-match (no tokenizer exists) |
| `src/services/ai/office/budgetWarning.ts` (new, optional) | service | event-driven | `src/hooks/useTeamChatNotifications.ts:20-96` + `src/utils/desktopNotification.ts:89-193` | role-match |
| `src/services/ai/office/budgetGate.ts` (threshold math only) | utility (pure) | transform | itself (`:78-96`) | self |
| `src/services/ai/office/teamRunCoordinator.ts` (`handleUsage`, `finalizeAttempt`, `topUp`, `getState`) | service | event-driven + streaming | itself (`:1242-1285`, `:787-881`, `:3179-3217`, `:3230-3251`) | self |
| `src/db/schema.ts` (`SCHEMA_V25`) | config/schema | — | `SCHEMA_V24` at `:171-177` | exact |
| `src/db/index.ts` (`version(25)`) | config | — | `:642-644` | exact |
| `src/types/aiOffice.ts` | model | — | `AiTeam` `:78-95`, `AiTeamMember` `:98-105`, `AiTeamAssignment` `:199-231` | self |
| `src/types/models.ts` (`ChatTokenUsage`) | model | — | `:270-274` | self |
| `src/validation/aiOfficeSchemas.ts` | validation | — | `AiTeamInput/UpdateSchema` `:92-114`, `budgetSchema` `:34` | exact |
| `src/validation/backupSchemas.ts` | validation | — | `BackupAiTeamRecordSchema` `:642-656`, `BackupAiTeamMemberRecordSchema` `:658-665`, `aiTokensSchema` `:608` | exact |
| `src/services/backup/exportBackup.ts` | service | file-I/O | itself `:12-53` (`isSafeBackupSetting`), `:200-340` (table lists) | self |
| `src/services/backup/restoreBackup.ts` | service | file-I/O | itself `:38-73`, `:188-212`, `:300-315` | self |
| `src/services/backup/validateBackup.ts` | service | validation | itself `:245-268`, `:505-560` | self |
| `src/services/localSqlitePersistence.ts` | service | file-I/O | itself `:14-42`, `:106-112` | self (no change projected) |
| `src/services/ai/nineRouterClient.ts` (cache-token mapping) | client | request-response/streaming | itself `:634-644` | self |
| `src/components/ai/runtime/chatTurnRuntime.ts` (`onUsage`) | hook/runtime | streaming | itself `:351-358` | self |
| `src/components/ai/office/TeamSidebar.tsx` | component | request-response (live query) | itself `:54-57`, `:115-121`, `:140-154` | self |
| `src/components/ai/office/TeamWorkspace.tsx` | component | live state | itself `:379-383` (subscribe), `:686-722`, `:758-774` | self |
| `src/components/ai/office/TeamSettingsDrawer.tsx` | component | CRUD form | itself `:48-59` (delete the copy), `:101-158` | self |
| `src/components/ai/office/BudgetTopUpModal.tsx` | component | form | itself `:3,71` (hard-coded 80%) | self |
| `src/components/ai/office/AgentPausedBanner.tsx` | component | presentational | itself `:27-43` | self (copy rewrite) |
| `src/components/ai/office/TeamCard.tsx` | component | presentational | itself `:124-132` (hard-coded 0.8) | self |
| new Settings card for `budgetWarnThresholdPct` | component | form | `src/components/settings/NineRouterConfigCard.tsx:66-80,215-230` | role-match |
| `tests/services/ai/office/aiTeamRepo.test.ts` | test | unit (real Dexie) | itself `:1-70` | self |
| `tests/services/ai/office/budgetGate.test.ts` | test | unit | itself `:1-30` | self |
| `tests/db/tableListParity.test.ts:101`, `tests/db/schemaV22Migration.test.ts:70` | test | — | both assert literal 23 (red at 24 today) | fix |

## Pattern Assignments

### 1. Atomic increment — `src/db/repositories/aiTeamRepo.ts::addUsedTokens`

**Anti-pattern to replace** (`aiTeamRepo.ts:496-508`) — get and `update` are two separate transactions:
```typescript
/** D-32: single-row write so three concurrent completions cannot lose usage. */
export async function addUsedTokens(
  memberId: string,
  delta: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);

  const usedTokens = row.usedTokens + delta;
  await db.aiTeamMembers.update(memberId, { usedTokens });
  return { ...row, usedTokens };
}
```
The docstring is false: 20 concurrent callers all read the same value (RESEARCH reproduced total = 1).

**Analog for the replacement** — read-modify-write inside one `rw` scope. Best in-repo shape: `aiTeamRunRepo.ts:109-116` (attempt-number allocation) and `workSessionRepo.ts:34-45`:
```typescript
// aiTeamRunRepo.ts:113-117
return db.transaction('rw', [db.aiTeamAssignments, db.aiTeamBatches], async () => {
  const batch = await db.aiTeamBatches.get(input.batchId);
  if (!batch) throw new Error(MISSING_BATCH_MESSAGE);
  ...
```
```typescript
// workSessionRepo.ts:34-39 — get → mutate → put, all inside the txn
return await db.transaction('rw', [db.workSessions, db.tasks], async () => {
  const task = await db.tasks.get(validated.taskId);
  if (!task) throw new Error(`Task not found: ${validated.taskId}`);
  const now = new Date().toISOString();
  task.updatedAt = now;
  await db.tasks.put(task);
```
Apply: `db.transaction('rw', db.aiTeamMembers, async () => { get → spread row with `inputTokens +=` / `outputTokens +=` / `usageEstimated ||= delta.estimated` → put → return row })`. Note `db.transaction('rw', <single table>, …)` (not array) is already used at `aiTeamRepo.ts:372, 463`.

Signature change is required: `delta: number` → `delta: { inputTokens: number; outputTokens: number; estimated: boolean }` (D-09, D-10, D-23). Existing coalesce rule for old rows (A5): `row.inputTokens ?? 0`, `row.outputTokens ?? 0`, `row.usageEstimated === true`.

---

### 2. Two-table (member + team) transaction — `topUp` / `applyTopUp`

**Anti-pattern** (`teamRunCoordinator.ts:3179-3212`): agent branch calls `topUpMemberBudget` (single-table, non-txn, `aiTeamRepo.ts:466-480`); team branch calls `updateTeam` only and never touches member rows (D-16 bug).
```typescript
// aiTeamRepo.ts:467-480 — single row, no transaction, does not raise the team total
export async function topUpMemberBudget(
  memberId: string,
  added: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamMember> {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);
  const budgetTokens = Math.max(0, row.budgetTokens + added);
  await db.aiTeamMembers.update(memberId, { budgetTokens });
  return { ...row, budgetTokens };
}
```

**Analog** — `updateTeam` (`aiTeamRepo.ts:183-227`) is the in-repo proof that `aiTeams` + `aiTeamMembers` + `aiLeads` can be written in one `rw` scope, with a fresh in-transaction read:
```typescript
export async function updateTeam(
  id: string,
  patch: AiTeamUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeam> {
  const validated = AiTeamUpdateSchema.parse(patch);

  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiLeads], async () => {
    const existing = await db.aiTeams.get(id);
    if (!existing) throw new Error(`Không tìm thấy nhóm: ${id}`);
    ...
    await db.aiTeams.put(updated);
    return updated;
  });
}
```
Second analog for "fresh roster read inside the txn" (D-18/WR-13): `aiOfficeRepo.ts:117-122` — the comment at `:117-120` states Dexie serialises overlapping transactions. Use `db.aiTeamMembers.where('teamId').equals(teamId).toArray()` (`aiTeamRepo.ts:78`, `:237`, `:300`) INSIDE the transaction, never `ensureMembers()` (`teamRunCoordinator.ts:1212-1217` early-returns on `membersLoaded`).

Return `{ team, members }` so the coordinator can recompute `memberBudgets` from the rows rather than patching one entry (Pitfall 6).

---

### 3. One shared split rule — `budgetSplit.ts` (new)

Two copies exist today. Repo (`aiTeamRepo.ts:68-91`):
```typescript
/** UI-SPEC §8a: floor per row, remainder on the lead row so the sum is exact. */
function splitBudget(total: number, memberCount: number): number {
  return memberCount > 0 ? Math.floor(total / memberCount) : 0;
}

async function writeEvenSplit(
  teamId: string, totalTokens: number, db: TaskPlannerDatabase
): Promise<AiTeamMember[]> {
  const members = await db.aiTeamMembers.where('teamId').equals(teamId).toArray();
  if (members.length === 0) return [];
  const perRow = splitBudget(totalTokens, members.length);
  const remainder = totalTokens - perRow * members.length;
  const updated: AiTeamMember[] = [];
  for (const member of members) {
    const budgetTokens = member.role === 'lead' ? perRow + remainder : perRow;
    await db.aiTeamMembers.update(member.id, { budgetTokens });
    updated.push({ ...member, budgetTokens });
  }
  return updated;
}
```
Drawer copy (`TeamSettingsDrawer.tsx:47-59`):
```typescript
/** UI-SPEC §8a. Even split with the remainder on the lead row, per-row override allowed. */
export function evenSplitRows(
  total: number,
  rows: Array<Omit<SplitRow, 'budgetTokens' | 'usedTokens'> & { usedTokens: number }>
): SplitRow[] {
  const count = rows.length;
  const perRow = count > 0 ? Math.floor(total / count) : 0;
  const remainder = total - perRow * count;
  return rows.map((row) => ({
    ...row,
    budgetTokens: row.role === 'lead' ? perRow + remainder : perRow,
  }));
}
```
Recommendation: one pure function (e.g. `splitEvenly(total, rows: {id|memberId, role}[]) => Map|Array<{id, budgetTokens}>`) in `src/services/ai/office/budgetSplit.ts`; repo and drawer both import it. Keep `evenSplitRows` exported as a thin wrapper — `tests/views/TeamsView.test.tsx:362-366` imports it.

**Architecture-gate constraint:** a new file under `src/services/ai/office/` must have a production importer or `bash .planning/scripts/verify-team-chat-architecture.sh` fails (dead-module loop, script lines ~52-66). `budgetSplit.ts` imported by `aiTeamRepo.ts` and `TeamSettingsDrawer.tsx` satisfies it.

---

### 4. Threshold math in `budgetGate.ts` (warning-only)

Current constants/edge logic (`budgetGate.ts:78-96`):
```typescript
export function bucketOf(used: number, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  if (!Number.isFinite(used) || used <= 0) return 0;
  return Math.floor((used / budget) * 10);
}

export function shouldNotifyPause(previousBucket: number, currentBucket: number): boolean {
  return currentBucket >= 8 && previousBucket < 8;
}

export function normalizeUsageTotal(usage: ChatTokenUsage): number {
  return usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
}
```
Replacement shape (D-05 configurable percent, D-09 split retained):
```typescript
export interface UsageSplit {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;      // inferred rather than reported
  splitInferred: boolean;  // total known, per-side split unknown → charge to input
}

export function splitUsage(usage: ChatTokenUsage): UsageSplit { ... }
export function resolveThresholdPct(team: AiTeam, globalPct: number | undefined): number { ... } // clamp 1..100
export function isAtThreshold(used: number, budget: number, pct: number): boolean {
  return budget > 0 && used >= (budget * pct) / 100;
}
```
Callers currently hard-code the crossing: `teamRunCoordinator.ts:1261` / `:1272` (`shouldNotifyPause`), plus the literal 0.8 at `types/aiOffice.ts:260` (`BUDGET_PAUSE_THRESHOLD`), `TeamSidebar.tsx:146`, `TeamCard.tsx:129`, `BudgetTopUpModal.tsx:71`. All four display sites must read the resolved value.

Do NOT delete `budgetGate.ts` — the dead-module gate (script) requires any office module to keep an importer; `teamRunCoordinator.ts` stays its importer. Keep `'awaiting-budget'` in `TeamRunPhase` (`types/aiOffice.ts:37`) and in the backup enum (`backupSchemas.ts:717-728`); stop producing it (RESEARCH trap 2).

---

### 5. Warning dispatch — reuse, do not build

`sendDesktopNotification` (`src/utils/desktopNotification.ts:89-193`) — Tauri → service worker → `window.Notification` fallback, returns `boolean`. Permission gate at `:33-49`.

Dedupe analog (`src/hooks/useTeamChatNotifications.ts:21-22, 78-92`):
```typescript
/** Ids already notified, so a re-render or a republish cannot notify twice. */
const notifiedRef = useRef<Set<string>>(new Set());
...
for (const row of toNotify) {
  if (cancelled) return;
  if (row.teamId === currentFocusedTeam() || notifiedRef.current.has(row.id)) continue;
  notifiedRef.current.add(row.id);
  try {
    const sent = await sendDesktopNotification({
      title: `${names.get(row.from) ?? 'Nhóm'} · ${row.teamName}`,
      body: row.content.slice(0, 160),
      tag: row.id,
    });
    if (!sent) notifiedRef.current.delete(row.id);
  } catch {
    notifiedRef.current.delete(row.id);
  }
}
```
Port the shape to the coordinator as a module-level `Set<string>` keyed `budget:${teamId}:member:${agentId}` / `budget:${teamId}:team`, cleared by `topUp` and by a new turn (D-06). Use the `tag` field for OS-level coalescing.

In-app surface analog (`AgentPausedBanner.tsx:27-43`) — `Alert type="warning" showIcon role="status"`, copy rewrite only:
```typescript
<Alert
  type="warning"
  showIcon
  role="status"
  data-testid="agent-paused-banner"
  style={{ margin: '8px 0 16px', borderRadius: 8 }}
  message={message}
  description={description}
  action={<Button size="small" type="primary" onClick={onTopUp}>Cấp thêm token</Button>}
/>
```
Note `tests/ai/office/AgentOfficeComponents.test.tsx:66-88` asserts the current copy verbatim ("Đã dùng 80% ngân sách…"). Rewriting the copy is a deliberate same-task test edit.

---

### 6. Live-state subscribe seam

Producer (`teamRunCoordinator.ts:516, 571-580, 3223-3228, 3268`):
```typescript
const listeners = new Set<() => void>();
...
const notify = () => {
  for (const listener of listeners) {
    try { listener(); } catch { /* a subscriber must never break the run */ }
  }
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
```
Consumer (`TeamWorkspace.tsx:379-383`):
```typescript
useEffect(() => {
  if (!coordinator) return undefined;
  setSnapshot(coordinator.getState());
  return coordinator.subscribe(() => setSnapshot(coordinator.getState()));
}, [coordinator]);
```
Snapshot contract (`teamRunCoordinator.ts:117-134`) and `getState()` (`:3230-3251`) must gain live per-member `{inputTokens, outputTokens, estimated}` + resolved threshold. Live state already declared at `:532-541` (`memberUsed`, `teamUsed`, `lastBuckets`, `lastTeamBucket`); `memberUsed` becomes `memberUsedInput`/`memberUsedOutput` (or one map of the split object).

Dexie half of the UI (authoritative numbers) — `TeamWorkspace.tsx:192-193`:
```typescript
const links = useLiveQuery(() => listTeamLinks(team.id, db), [db, team.id]) ?? [];
const liveMembers = useLiveQuery(() => listTeamMembers(team.id, db), [db, team.id]) ?? members;
```

---

### 7. Repo-to-UI derivation (granted / used / remaining, split by input/output)

Current derivation (`TeamSidebar.tsx:54-57` team, `:118-120` member):
```typescript
const statusByAgent = new Map(snapshot.agents.map((row) => [row.agentId, row.status]));
const teamUsed = members.reduce((sum, row) => sum + row.usedTokens, 0);
const teamTotal = team.budgetTokens;
const ratio = teamTotal > 0 ? Math.min(teamUsed / teamTotal, 1) : 0;
...
{`${member.usedTokens}/${member.budgetTokens} token`}
```
Team panel `:140-154` (`Progress` + `strokeColor={ratio >= 0.8 …}`) is the template for the split header; member line `:118-120` is the template for the sidebar split.

Rule: UI must NOT recompute even-split. It reads `member.budgetTokens` rows written by the repo. The only duplicated rule being removed is the drawer preview (`TeamSettingsDrawer.tsx:48-59`) → `budgetSplit.ts` (§3). `TeamCard.tsx:124-132` shows the same `ratio >= 0.8` literal and needs the resolved threshold.

Number rendering: `BudgetTopUpModal.tsx:63-67` already uses `toLocaleString()`:
```typescript
<Descriptions.Item label="Đã dùng">{used.toLocaleString()} token</Descriptions.Item>
<Descriptions.Item label="Ngân sách hiện tại">{budget.toLocaleString()} token</Descriptions.Item>
```
Reuse for D-21; `~` prefix + `title`/tooltip for D-24.

---

### 8. Schema/list touchpoints — exact shapes to clone

**(a) Dexie version** — `src/db/schema.ts:168-177`:
```typescript
export const SCHEMA_V24 = {
  ...SCHEMA_V23,
} as const;

// Bump with every new `this.version(n)` in db/index.ts. Migration tests assert
// against this instead of a literal, so a schema bump never silently breaks them.
export const LATEST_SCHEMA_VERSION = 24;
```
and `src/db/index.ts:638-644`:
```typescript
// Phase 37 (D-22): run ledger. Purely additive — nothing to backfill, so no
// `.upgrade()` hook. The V20/V21 repair hooks stay attached to their own versions.
this.version(22).stores(SCHEMA_V22);

// 37.1 rework: the unified team-chat model. Purely additive, nothing to backfill.
this.version(23).stores(SCHEMA_V23);
this.version(24).stores(SCHEMA_V24);
```
New columns are unindexed → `SCHEMA_V25 = { ...SCHEMA_V24 } as const`, `this.version(25).stores(SCHEMA_V25)`, literal → 25. No `.upgrade()`.

**(b) Export** — table list `exportBackup.ts:205-206 / 238-239 / 298-299 / 333`: `aiTeams` and `aiTeamMembers` flow through whole, so no structural edit; verify the projection helper `:165-168` (assignment `diagnosticDetail` stripping, mirrored at `restoreBackup.ts:195`) still strips only that one key.

**(c) Restore** — `restoreBackup.ts:63-73` (`AI_OFFICE_TABLE_KEYS`), `:300-301`:
```typescript
await add(targetDb.aiTeams, tables.aiTeams);
await add(targetDb.aiTeamMembers, tables.aiTeamMembers);
```
settings whitelist at `:314`:
```typescript
for (const setting of tables.settings ?? []) if (isSafeBackupSetting(setting.key)) await targetDb.settings.put(setting);
```

**(d) Validate** — new columns ride on these declarations. Member shape (`backupSchemas.ts:658-665`):
```typescript
export const BackupAiTeamMemberRecordSchema = z.strictObject({
  id: uuidSchema,
  teamId: uuidSchema,
  agentId: uuidSchema,
  role: z.enum(['lead', 'employee']),
  budgetTokens: aiTokensSchema,
  usedTokens: aiTokensSchema,
});
```
`aiTokensSchema` (`:608`):
```typescript
const aiTokensSchema = z.number().int().nonnegative('Token count must be zero or greater');
```
Team shape (add `budgetWarnThresholdPct`) — `:642-656`, clone the `concurrencyLimit` line (`:652-653`):
```typescript
/** Phase 37 D-03/D-02: per-team run concurrency. Absent means the default; range 1-12. */
concurrencyLimit: z.number().int().min(1).max(12).optional(),
```
Assignment shape (`:732-780`) already has `tokenUsage`; add `inputTokens`/`outputTokens`/`usageEstimated` there per D-11.

Envelope literal (`:812-821`) — bump both together:
```typescript
export const BACKUP_SCHEMA_VERSION = 13 as const;

export const BackupEnvelopeSchema = z.object({
  ...
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
```
→ 14. Anyone restoring a 13 backup is rejected by design (D-49, C-16).

Key-name gate (`backupSchemas.ts:194-219`): `findForbiddenBackupKey` rejects `/…|prompt|…/i`. Safe verified names: `inputTokens`, `outputTokens`, `usageEstimated`, `budgetWarnThresholdPct`. Never `promptTokens`.

**(e) SQLite TS + Rust** — `localSqlitePersistence.ts:14-39` lists `aiTeams`/`aiTeamMembers`; payloads are opaque JSON (`:106-112`):
```typescript
function serializePayload(tableName: SqliteTableName, value: unknown): string {
  if (tableName === 'noteAttachments' && value && typeof value === 'object') {
    const { data: _ignored, ...rest } = value as Record<string, unknown>;
    return JSON.stringify(rest);
  }
  return JSON.stringify(value ?? null);
}
```
Rust `src-tauri/src/sqlite_persistence.rs:6-34` `ALLOWED_TABLES` — no new table → no Rust edit.

**(f) Types** — `AiTeam` (`types/aiOffice.ts:78-95`) clone the `concurrencyLimit` idiom (`:91-92`):
```typescript
/** Phase 37 D-03: per-team run concurrency; absent means `DEFAULT_TEAM_CONCURRENCY`. */
concurrencyLimit?: number | undefined;
```
`AiTeamMember` (`:98-105`) — add `inputTokens: number; outputTokens: number; usageEstimated?: boolean | undefined;` and keep `usedTokens` for old rows.

**(g) Zod write boundary** — `aiOfficeSchemas.ts:34, 40, 92-114`:
```typescript
const budgetSchema = z.number().int().nonnegative('Budget must be zero or greater');

/** Phase 37 D-02: per-team run concurrency, 1–12. Rejects out-of-range and fractional values
 * at the trust boundary before the repo write; `clampTeamConcurrency` is the runtime belt. */
const concurrencyLimitSchema = z.number().int().min(1).max(12).optional();
```
Clone that comment/triplet for a `warnThresholdPctSchema = z.number().int().min(1).max(100).optional()`, then mirror the `'…' in patch` add/remove idiom at `aiTeamRepo.ts:210-218`.

**(h) Repo init/carry** — new columns must be seeded at `aiTeamRepo.ts:133-155` (member seed) and `:431-438` (`addTeamMember`), and carried in `writeLeadRow`'s `carried` object (`:242-245`) which today only carries two fields:
```typescript
const carried =
  previous && previous.agentId === leadId
    ? { budgetTokens: previous.budgetTokens, usedTokens: previous.usedTokens }
    : { budgetTokens: 0, usedTokens: 0 };
```

---

### 9. Settings whitelist + global numeric setting

Whitelist (`exportBackup.ts:12-53`):
```typescript
export const UNSAFE_OR_EPHEMERAL_SETTING_KEYS = new Set<string>([
  'jira_api_token', 'github_pat', 'github_token', 'github_passphrase', 'backup_passphrase',
  'ninerouter_api_key', 'knowledge_server_token', 'image_api_key', ...
]);

export function isSafeBackupSetting(key: string): boolean {
  if (UNSAFE_OR_EPHEMERAL_SETTING_KEYS.has(key)) return false;
  const lower = key.toLowerCase();
  if (
    lower.endsWith('_token') || lower.endsWith('_key') || lower.endsWith('_passphrase') ||
    lower.endsWith('_secret') || lower.endsWith('_pat')
  ) return false;
  return true;
}
```
`ai_budget_warn_threshold_pct` passes both checks → no whitelist edit, only a row.

Read/write template (`nineRouterTokenService.ts:102-130`) — `Settings` rows are `{ key, value }` (`types/models.ts:148-151`), numbers read with a `typeof === 'number'` guard + default:
```typescript
export async function getNineRouterConfig(db: TaskPlannerDatabase = defaultDb): Promise<NineRouterConfig> {
  const [endpointRec, modelRec, charLimitRec, contextWindowRec] = await Promise.all([
    db.settings.get('ninerouter_endpoint'),
    db.settings.get('ninerouter_default_model'),
    db.settings.get('ninerouter_char_limit'),
    db.settings.get('ninerouter_context_window_tokens'),
  ]);
  return {
    ...
    charLimit:
      typeof charLimitRec?.value === 'number' && charLimitRec.value > 0
        ? charLimitRec.value
        : DEFAULT_NINEROUTER_CHAR_LIMIT,
    contextWindowTokens:
      typeof contextWindowRec?.value === 'number' && contextWindowRec.value > 0
        ? contextWindowRec.value
        : DEFAULT_CONTEXT_WINDOW_TOKENS,
  };
}
```
Settings UI template — `NineRouterConfigCard.tsx:66-73, 122-123, 219-231`:
```typescript
const [contextWindowTokens, setContextWindowTokens] = useState<number>(DEFAULT_CONTEXT_WINDOW_TOKENS);
...
setContextWindowTokens(config.contextWindowTokens || DEFAULT_CONTEXT_WINDOW_TOKENS);
...
await setNineRouterConfig({ endpoint, defaultModel, charLimit, contextWindowTokens }, db);
```
Default-constant idiom to clone for `DEFAULT_BUDGET_WARN_THRESHOLD_PCT = 80` — `types/aiOffice.ts:260-274` (`BUDGET_PAUSE_THRESHOLD`, `DEFAULT_TEAM_CONCURRENCY`, `clampTeamConcurrency`).

---

### 10. Usage plumbing (input/output split retention)

`chatTurnRuntime.ts:351-358` — the only funnel; it accumulates but drops cache fields:
```typescript
onUsage: (usage) => {
  tokenUsage = {
    promptTokens: (tokenUsage.promptTokens || 0) + (usage.promptTokens || 0),
    completionTokens: (tokenUsage.completionTokens || 0) + (usage.completionTokens || 0),
    totalTokens: (tokenUsage.totalTokens || 0) + (usage.totalTokens || 0),
  };
  deps.onUsage?.(tokenUsage);
},
```
Provider mapping to extend — `nineRouterClient.ts:634-644`:
```typescript
if (json?.usage && req.onUsage) {
  try {
    req.onUsage({
      promptTokens: json.usage.prompt_tokens ?? json.usage.promptTokens,
      completionTokens: json.usage.completion_tokens ?? json.usage.completionTokens,
      totalTokens: json.usage.total_tokens ?? json.usage.totalTokens,
    });
  } catch { /* Ignore usage callback error */ }
}
```
`ChatTokenUsage` (`types/models.ts:270-274`) — add optional cache fields (A1: probe, default 0):
```typescript
export interface ChatTokenUsage {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
}
```
Coordinator delta + write site (`teamRunCoordinator.ts:1242-1284`) — keep the baseline-delta rule (D-24 Phase 37.1), replace `normalizeUsageTotal` with `splitUsage`, and replace the bare `void addUsedTokens(...)` at `:1279-1284` with a chained promise (`usageWriteChain = usageWriteChain.then(...)`) so `finalizeAttempt` can await it (Pitfall 2).

`finalizeAttempt` (`:787-881`) — the terminal ledger writer; its transition patch (`:865-877`) is where the attempt's `inputTokens`/`outputTokens`/`usageEstimated` belong. Pattern is already there: one `rw` over `[db.chatMessages, db.aiTeamAssignments]` with a compare-and-set guard on `from`.

---

### 11. New module: lazy tokenizer (`tokenEstimate.ts`)

No in-repo tokenizer; closest structural analog is the lazy-promise singleton in `graphitiMcpClient.ts:33-36`:
```typescript
let sessionId: string | undefined;
let requestId = 0;
let discoveryPromise: Promise<AiToolDefinition[]> | undefined;
const groupResultCache = new Map<string, Promise<string>>();
```
and its reset-for-tests export (`:333`):
```typescript
export function resetGraphitiMcpClientForTests(): void {
```
Target shape (from RESEARCH, `js-tiktoken/lite` + `ranks/o200k_base`, dynamic import → separate chunk, sync constructor):
```typescript
let encoderPromise: Promise<{ encode: (text: string) => number[] }> | null = null;

async function getEncoder() {
  encoderPromise ??= (async () => {
    const [{ Tiktoken }, ranks] = await Promise.all([
      import('js-tiktoken/lite'),
      import('js-tiktoken/ranks/o200k_base'),
    ]);
    return new Tiktoken(ranks.default);
  })();
  return encoderPromise;
}

export async function estimateTokens(text: string): Promise<number> { ... }
export function resetTokenEstimatorForTests(): void { encoderPromise = null; }
```
`js-tiktoken` is NOT installed today (`package.json` has no entry). Install is gated behind a `checkpoint:human-verify` task (RESEARCH package audit: SUS verdict, user already approved D-07).

---

### 12. Test analogs

Harness — `tests/services/ai/office/aiTeamRepo.test.ts:1-70` (real Dexie, no mocks):
```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
...
describe('aiTeamRepo (AIO-BUDGET-01, D-05, D-06, D-09, D-17, D-19, D-26, D-32)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;
  beforeEach(async () => {
    dbName = 'TestAiTeamRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
    ...
  });
  afterEach(async () => { await db.delete(); });
```
`fake-indexeddb/auto` is loaded globally by `tests/setup.ts:1`. Do not mock Dexie — the atomicity assertion is meaningless otherwise.

Concurrency style (in-repo): `tests/services/ai/office/scheduler.test.ts:88,110,138` (`Promise.all` of handles) and `tests/db/aiTeamRunRepo.test.ts:76` (`const [a, b] = await Promise.all([...])`). New test: `await Promise.all(Array.from({length:20}, () => addUsedTokens(id, delta, db)))` then assert exact `start + 20 × delta`.

Focused-run naming convention — every phase test command uses `-t "<word>"`:
`npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "concurrent"`, `… -t "top-up"`, `… -t "remainder"`, `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "budget"`. Existing `describe`/`it` titles embed decision ids in parens (e.g. `'… (D-09)'`), so name new ones `(AIO-BUDGET-04, D-13)`.

Wave-0 red literals to repair (verified red at 24):
- `tests/db/tableListParity.test.ts:101` — `expect(Number(match![1])).toBe(23);` → `toBe(LATEST_SCHEMA_VERSION)` or `>= 24`.
- `tests/db/schemaV22Migration.test.ts:70` — `expect(LATEST_SCHEMA_VERSION).toBe(23);` → same treatment.

## Shared Patterns

### `db.transaction('rw', …)` usage
| Concern | Source | Apply to |
|---|---|---|
| Single-store RMW | `aiTeamRunRepo.ts:113`, `workSessionRepo.ts:34`, `aiTeamRepo.ts:372` | `addUsedTokens` |
| Multi-store RMW | `aiTeamRepo.ts:183` (`updateTeam`), `aiOfficeRepo.ts:117` | `applyTopUp` |
| Fresh read inside txn | `aiTeamRepo.ts:78,237,300` | top-up roster (D-18/WR-13) |
| Rollback semantics | Dexie guarantees; verified in RESEARCH (two-table throw leaves both untouched) | all budget writes |

### Error handling / messages
Vietnamese user-facing strings with ids interpolated only where a row is genuinely missing (`aiTeamRepo.ts:65,185,473,489,503`). Repo throws; UI catches and renders (`TeamSettingsDrawer.tsx:92-99`; `TeamWorkspace.tsx:186-188,680-683`).
```typescript
const runRosterAction = async (action: () => Promise<void> | void) => {
  setRosterError(null);
  try { await action(); } catch (err) {
    setRosterError(err instanceof Error ? err.message : String(err));
  }
};
```

### Validation
Zod at every write boundary (`AiTeamInputSchema.parse` at repo entry, `aiTeamRepo.ts:108,181,408,521`), `strictObject` at every backup boundary. New columns: parse in `aiTeamRepo`, validate in `backupSchemas`, clamp again at runtime (mirrors `clampTeamConcurrency`, `types/aiOffice.ts:273+`).

### A11y
`role="status"` + `data-testid` + `aria-label` on non-text status indicators: `AgentPausedBanner.tsx:35`, `TeamSidebar.tsx:124,130,178,187`. New badges follow.

### Notifications
`sendDesktopNotification` + `isNotificationPermissionGranted` only; never a second channel (`useTeamChatNotifications.ts:73,83`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/services/ai/office/tokenEstimate.ts` | service | transform | No tokenizer anywhere in repo; only chars÷4 heuristics (`aiOrchestratorLoop.ts:217`). Use RESEARCH §Code Examples shape + `graphitiMcpClient.ts` lazy-singleton structure. |
| `src/services/ai/office/budgetWarning.ts` | service | event-driven | No service-level notification dispatcher exists — only a React hook (`useTeamChatNotifications`). If kept separate, copy the dedupe structure from that hook and call `sendDesktopNotification` directly (non-React safe per A3). |

## Metadata

**Analog search scope:** `src/db/repositories/`, `src/services/ai/` (incl. `office/`), `src/services/backup/`, `src/validation/`, `src/components/{ai/office,settings,ai/runtime}/`, `src/utils/`, `src-tauri/src/`, `tests/{db,services/ai/office,ai/office,views}/`
**Files scanned:** ~40 (transactions grepped in 14 repo files, 40 `rw` sites)
**Pattern extraction date:** 2026-11-13
**Not run:** full Vitest suite (project rule)
