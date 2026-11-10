# Phase 36: Data model, multi-chat identity, backup/migration - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 26 (11 new-surface, 15 modified) + 11 test touchpoints
**Analogs found:** 26 / 26 (0 no-analog)

Mọi analog dưới đây là file git-tracked trong worktree này (`git ls-files` đã kiểm). Không có mirror `.gsd/capabilities/**`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` | config (schema) | migration | `src/db/schema.ts:119-133` (SCHEMA_V17/V18) | exact (self-precedent) |
| `src/db/index.ts` | config (db init) | migration | `src/db/index.ts:491-545` (version 17/18) | exact (self-precedent) |
| `src/types/aiOffice.ts` | model | transform | `src/types/aiOffice.ts:67-89,115-120` | exact (self-precedent) |
| `src/types/backup.ts` | model | transform | `src/types/backup.ts:44-102` | exact (self-precedent) |
| `src/validation/aiOfficeSchemas.ts` | validation | request-response | `src/validation/aiOfficeSchemas.ts:86-116` | exact (self-precedent) |
| `src/validation/backupSchemas.ts` | validation | request-response | `src/validation/backupSchemas.ts:598-704` | exact (self-precedent) |
| `src/db/repositories/aiSkillVersionRepo.ts` **(NEW)** | repository | CRUD | `src/db/repositories/aiOfficeRepo.ts` (full) | exact |
| `src/db/repositories/aiOfficeRepo.ts` | repository | transaction + guard | `src/db/repositories/aiTeamRepo.ts:113-143,184-203` | exact |
| `src/db/repositories/aiTeamRepo.ts` | repository | transaction + guard | self (deleteTeam/createTeam) | exact (self-precedent) |
| `src/services/ai/office/liveUseRegistry.ts` **(NEW)** | service (in-memory registry) | event-driven | `src/services/ai/office/teamRunRegistry.ts:1-59` | role-match |
| `src/services/ai/office/teamRunCoordinator.ts` | service | streaming/batch | self (`:198-312` closure + `:578-610` lead turn) | exact (self-precedent) |
| `src/services/backup/exportBackup.ts` | service | batch/serialize | self (`:163-327`) | exact (self-precedent) |
| `src/services/backup/validateBackup.ts` | service | request-response | self (`:48-127`, `:132-160`, `:469-497`) | exact (self-precedent) |
| `src/services/backup/restoreBackup.ts` | service | batch/transaction | self (`:26-65`, `:218-285`) | exact (self-precedent) |
| `src/services/localSqlitePersistence.ts` | service | event-driven (table hooks) | self (`:14-36`, `:273-302`) | exact (self-precedent) |
| `src-tauri/src/sqlite_persistence.rs` | config (allowlist) | file I/O | self (`:6-27`) | exact (self-precedent) |
| `src/components/ai/office/TeamSettingsDrawer.tsx` | component | request-response (form) | self (`:50-139`) + `TeamEditorDrawer.tsx:121-179` (Select) | exact |
| `src/components/ai/office/TeamEditorDrawer.tsx` | component | request-response (form) | self | exact (self-precedent) |
| `src/components/ai/office/TeamCard.tsx` | component | render | self (`:24,47`) | exact (self-precedent) |
| `src/components/ai/office/EmployeeCard.tsx` (+LeadCard) / `SkillCard.tsx` | component | render | self (`EmployeeCard.tsx:81-91,142-152`, `SkillCard.tsx:55-65`) | exact (self-precedent) |
| `src/views/TeamsView.tsx` | view | render | self (`:39,118`) | exact (self-precedent) |
| `src/views/AiOfficeView.tsx` | view | request-response | self (`:117-125`) | exact (self-precedent) |
| `src/components/ai/office/TeamWorkspace.tsx` | component (host) | event-driven | self (`:171-264`) | exact (self-precedent) |
| `tests/db/schemaV19Migration.test.ts` **(NEW)** | test | migration | `tests/db/schemaV17Migration.test.ts` (full) | exact |
| `tests/db/tableListParity.test.ts` **(NEW)** | test | static analysis | `tests/services/ai/office/teamRunCoordinator.test.ts:337-344` (readFileSync) | role-match |
| `tests/services/ai/office/aiSkillVersionRepo.test.ts` **(NEW)** | test | CRUD | `tests/services/ai/office/aiOfficeRepo.test.ts` | exact |

---

## Pattern Assignments

### `src/db/schema.ts` (config, migration)

**Analog:** `src/db/schema.ts:119-133`

**Pattern — additive version, no `.upgrade()`:**
```ts
// Phase 34 (D-18, D-23, D-25, D-32): AI Office stores. Purely additive — no existing
// store index spec is touched, so no index rebuild and no `.upgrade()` hook is needed.
export const SCHEMA_V17 = {
  ...SCHEMA_V16,
  aiEmployees: 'id, name, skillId, model, createdAt',
  aiLeads: 'id, name, model, createdAt',
  aiSkills: 'id, name, createdAt',
  aiTeams: 'id, name, leadId, status, createdAt',
  aiTeamMembers: 'id, teamId, agentId, role',
  aiTeamLinks: 'id, teamId, itemType, itemId',
} as const;

// Phase 35 (C-16): SDLC rows are purged in the V18 upgrade hook. No index changes —
// the purge is a row delete, not a schema reshape.
export const SCHEMA_V18 = { ...SCHEMA_V17 } as const;
```
V19 nối tiếp đúng hình dạng: `{ ...SCHEMA_V18, aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt' }`. `aiTeams`/`aiTeamMembers` index spec **không đổi** (đã có `leadId`, `agentId`) → không cần `.upgrade()`.

---

### `src/db/index.ts` (config, migration)

**Analog:** `src/db/index.ts:491-545` + khai báo Table `:86-91`

**Table declaration pattern** (`:86-91`):
```ts
  aiEmployees!: Table<AiEmployee, string>;
  aiLeads!: Table<AiLead, string>;
  aiSkills!: Table<AiSkill, string>;
  aiTeams!: Table<AiTeam, string>;
  aiTeamMembers!: Table<AiTeamMember, string>;
  aiTeamLinks!: Table<AiTeamLink, string>;
```

**Version registration pattern** (`:491-499`):
```ts
    // Phase 34 (D-18, D-23, D-25, D-32): AI Office stores. Purely additive — nothing to
    // backfill, so no `.upgrade()` hook.
    this.version(17).stores(SCHEMA_V17);

    // Phase 35 (C-16, D-05): SDLC is deleted. Purge its rows — tab, thread, message, and
    // workflow-state settings — so no removed surface can be re-read after the upgrade.
    this.version(18)
      .stores(SCHEMA_V18)
      .upgrade(async (tx) => { /* ... */ });
```
V19 = `this.version(19).stores(SCHEMA_V19);` — một dòng, không hook. Thêm `aiSkillVersions!: Table<AiSkillVersion, string>;` và import type.

---

### `src/types/aiOffice.ts` (model, transform)

**Analog:** `src/types/aiOffice.ts:67-89` và `:115-120`

**Team shape hiện tại — chỗ phải mở optional + thêm lock:**
```ts
export interface AiTeam {
  id: string;
  name: string; // ≤ 60
  leadId: string;            // → leadId?: string | undefined (D-05)
  status: AiTeamStatus;
  budgetTokens: number;
  autoSplitEnabled?: boolean | undefined;
  autoApproveMutations?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
}
```

**Cap constants — hai dòng phải xóa, bốn dòng phải giữ:**
```ts
export const MAX_ACTIVE_TEAMS = 3; // D-15      ← XÓA (D-06)
export const MAX_EMPLOYEES_PER_TEAM = 3; // D-16 ← XÓA (D-06)
export const MAX_BATCH_SIZE = 3; // D-02        ← GIỮ (Phase 37)
export const RECENT_WINDOW_TURNS = 10; // D-10
export const ASSIGNMENT_HISTORY_CAP = 50; // D-29
export const BUDGET_PAUSE_THRESHOLD = 0.8; // D-20
```
`AiSkillVersion`/`AiSkillVersionStatus` mới: theo khối trong 36-RESEARCH.md §Code Examples, dùng đúng style file này (union type trên, interface dưới, `?: T | undefined` cho optional — `exactOptionalPropertyTypes` bật).

---

### `src/types/backup.ts` (model, transform)

**Analog:** `src/types/backup.ts:44-72` (tables) + `:74-102` (counts)

```ts
export interface BackupTableData {
  tasks: Task[];
  /* ... */
  aiEmployees?: AiEmployee[];
  aiLeads?: AiLead[];
  aiSkills?: AiSkill[];
  aiTeams?: AiTeam[];
  aiTeamMembers?: AiTeamMember[];
  aiTeamLinks?: AiTeamLink[];
}
```
Thêm một dòng `aiSkillVersions?: AiSkillVersion[];` vào **cả hai** interface (`BackupTableData` và `BackupTableCounts`), cùng import type từ `./aiOffice`.

---

### `src/validation/aiOfficeSchemas.ts` (validation, request-response)

**Analog:** `src/validation/aiOfficeSchemas.ts:86-116`

```ts
export const AiTeamInputSchema = z.object({
  name: nameSchema,
  leadId: uuidSchema,        // → uuidSchema.optional()
  status: AiTeamStatusSchema.default('active'),
  budgetTokens: budgetSchema,
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
});

export const AiTeamMemberInputSchema = z.object({
  teamId: uuidSchema,
  agentId: uuidSchema,
  role: AiTeamMemberRoleSchema,
  budgetTokens: budgetSchema,
  usedTokens: budgetSchema.default(0),
});
```
Pattern tái dùng cho `AiSkillVersionInputSchema`: cùng file có sẵn `nameSchema`, `skillDescriptionSchema`, `uuidSchema` (`:16-34`) — không tạo schema mới.

---

### `src/validation/backupSchemas.ts` (validation, request-response)

**Analog:** `src/validation/backupSchemas.ts:598-704`

**strictObject pattern cho bảng mới** (`:641-648`) — bảng strict thì key lạ bị **reject**, không strip:
```ts
export const BackupAiSkillRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  description: aiSkillDescriptionSchema,
  body: z.string().trim().min(1, 'Body is required'),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

**Plain `z.object` + comment cảnh báo strip** (`:319-325`) — đúng lỗ mà D-18 phải vá:
```ts
    // Phase 34 D-31: AI Office attribution. Declared explicitly — this is a plain z.object,
    // so an undeclared key is silently stripped and restored messages render unattributed.
    agentId: uuidSchema.optional(),
    agentName: z.string().max(60).optional(),
    agentKind: z.enum(['lead', 'employee']).optional(),
    messageKind: z.enum(['instruction', 'report', 'synthesis', 'plan']).optional(),
    // Phase 36 D-18: targetAgentId: uuidSchema.optional(),
```

**Envelope literal** (`:679-686`):
```ts
/** D-49: the current backup envelope contract. Version 11 is CR-centric; older versions are rejected. */
export const BACKUP_SCHEMA_VERSION = 11 as const;export const BackupEnvelopeSchema = z.object({
  app: z.literal('personal-task-planner'),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.unknown())),
  counts: z.record(z.string(), z.number()),
});
```
Bump 11 → 12 **trong cùng change set** với `leaderLockedAt` + `leadId` optional trên `BackupAiTeamRecordSchema` (`:650-660`), nếu không build cũ reject bằng "unexpected key" (RESEARCH Pitfall 2).

`FORBIDDEN_BACKUP_KEYS` (`:193-198`) chặn key `prompt`/`rawModelResponse`/`partialBuffer` — field mới phải tránh các tên đó; `evidence`/`leaderLockedAt` an toàn.

---

### `src/db/repositories/aiSkillVersionRepo.ts` (NEW — repository, CRUD)

**Analog:** `src/db/repositories/aiOfficeRepo.ts` (toàn file)

**Signature + validation + explicit-undefined pattern** (`:39-60`):
```ts
export async function createEmployee(
  input: AiEmployeeInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiEmployee> {
  const validated = AiEmployeeInputSchema.parse(input);
  const now = new Date().toISOString();

  const employee: AiEmployee = {
    id: generateId(),
    name: validated.name,
    /* ... */
    createdAt: now,
    updatedAt: now,
  };
  if (validated.skillId !== undefined) employee.skillId = validated.skillId;

  await db.aiEmployees.add(employee);
  return employee;
}
```
Bắt buộc theo: `db: TaskPlannerDatabase = defaultDb` làm tham số cuối; `generateId()` từ `../../utils/uuid`; Zod parse ở đầu; `byCreatedAt` local helper (`:27-31`) thay vì util mới.

Repo mới ~60 dòng: `listSkillVersions(skillId)`, `createSkillVersion(input)` (tính `version = max(version trong skill) + 1` trong `db.transaction('rw', [db.aiSkillVersions], ...)`), `decideSkillVersion(id, status)` chỉ ghi `decidedAt` + `status`. Không expose qua AI tool.

---

### `src/db/repositories/aiOfficeRepo.ts` (repository, transaction + guard)

**Analog:** `src/db/repositories/aiTeamRepo.ts:113-143` (transaction + count-inside) và `:184-190` (multi-table delete)

**Count-inside-transaction pattern** (`:113-117`, `:196-202`):
```ts
  await db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => {
    if (team.status === 'active') {
      const activeCount = await db.aiTeams.where('status').equals('active').count();
      if (activeCount >= MAX_ACTIVE_TEAMS) throw new Error(ACTIVE_TEAM_CAP_MESSAGE);
    }
    await db.aiTeams.add(team);
```
```ts
  // Single transaction: counting outside one lets two racing callers both see 2 active teams.
  return db.transaction('rw', [db.aiTeams], async () => {
    await assertCanActivate(teamId, db);
    const now = new Date().toISOString();
    await db.aiTeams.update(teamId, { status: 'active', updatedAt: now });
    /* ... */
  });
```

**Multi-table delete in one transaction** (`:184-190`):
```ts
export async function deleteTeam(id: string, db: TaskPlannerDatabase = defaultDb): Promise<void> {
  await db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiTeamLinks], async () => {
    await db.aiTeamMembers.where('teamId').equals(id).delete();
    await db.aiTeamLinks.where('teamId').equals(id).delete();
    await db.aiTeams.delete(id);
  });
}
```

**Refuse-by-value (không throw chuỗi thô)** — analog `src/services/ai/office/teamTools.ts:38-47`:
```ts
/** Mirrors `ArtifactToolRefusal`: a refusal is a returned value, never a thrown error. */
export interface TeamToolRefusal {
  refused: true;
  code: TeamToolRefusalCode;
  message: string;
}

function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}
```

Ba hàm thay thế (`deleteEmployee:88-93`, `deleteLead:151-156`, `deleteSkill:204-209` — hiện là bare delete kèm comment "no cascade" trái D-10..D-12) dùng index có sẵn: `aiTeams.leadId`, `aiTeamMembers.agentId`, `aiEmployees.skillId`. `deleteSkill` cascade `aiSkillVersions` trong cùng transaction sau khi guard pass (RESEARCH A3). Giữ `countTeamsUsingEmployee:95-100` / `countAgentsUsingSkill:211-216` cho UI copy — guard **không** dựa vào chúng.

---

### `src/db/repositories/aiTeamRepo.ts` (repository, transaction + guard)

**Analog:** self.

- Xóa `:3` import cap, `:24-25` `ACTIVE_TEAM_CAP_MESSAGE`, `:43-50` `assertCanActivate` (hoặc rút gọn bỏ nhánh cap), `:94-96` và `:244-247` nhánh đếm employee, `:113-117` nhánh cap trong `createTeam`, `:175-178` nhánh cap trong `updateTeam`.
- **Giữ** `:241-243` "một lead/nhóm" trong `addTeamMember`; **giữ** `:249-258` row-shape.
- `assignLeader`/`lockLeader` mới theo đúng pattern `activateTeam:196-202`: một transaction ghi cả `aiTeams` và `aiTeamMembers` (Pitfall 5 — hai nguồn sự thật phải ghi cùng transaction).
- Import `MAX_EMPLOYEES_PER_TEAM` phải xóa cùng lúc với hằng số, nếu không `tsc --noEmit` đỏ.

---

### `src/services/ai/office/liveUseRegistry.ts` (NEW — service, in-memory)

**Analog:** `src/services/ai/office/teamRunRegistry.ts:1-59`

**Module-level Map + factory pattern** (`:22-40`):
```ts
export function createTeamRunRegistry(
  createDeps: (agentId: string) => ChatTurnRuntimeDeps
): TeamRunRegistry {
  const entries = new Map<string, ChatTurnRuntime>();

  return {
    get(agentId) {
      const existing = entries.get(agentId);
      if (existing) return existing;
      const runtime = createChatTurnRuntime(createDeps(agentId));
      entries.set(agentId, runtime);
      return runtime;
    },
```
Registry mới ~30 dòng, export singleton (module Map như `coordinatorRegistry` ở `TeamWorkspace.tsx:60`): `beginTurn(agentId, skillIds)`, `endTurn(agentId)`, `holdersOf(agentId): string[]`. Không persist, không backup (D-19). Đọc **đồng bộ** được trong transaction guard.

---

### `src/services/ai/office/teamRunCoordinator.ts` (service, streaming/batch)

**Analog:** self.

**Closure chụp roster — chỗ phải thay bằng snapshot theo lượt** (`:198-201`):
```ts
export function createTeamRunCoordinator(
  options: TeamRunCoordinatorOptions
): TeamRunCoordinator {
  const { db, team, lead, employees, skills } = options;
  const teamId = team.id;
```

**Options interface để thêm `loadRoster?`** (`:107-121`):
```ts
export interface TeamRunCoordinatorOptions {
  db: TaskPlannerDatabase;
  team: AiTeam;
  lead: AiLead;
  employees: AiEmployee[];
  skills: AiSkill[];
  threadId: string;
  model: string;
  endpoint: string;
  apiKey: string;
  mcpTools?: AiToolDefinition[] | undefined;
  /** Test seam: production omits it and the coordinator uses the default chat-turn deps. */
  createRuntimeDeps?: ((agentId: string) => Partial<ChatTurnRuntimeDeps>) | undefined;
}
```
`createRuntimeDeps?` là tiền lệ đúng cho optional seam — `loadRoster?` theo cùng kiểu (`?: (() => Promise<...>) | undefined`).

**Điểm đọc roster phải chuyển sang `turnRoster`:** `:299` (`toolContext`), `:310-312` (`skillFor`), `:586` (`buildLeadTurnRequest({ roster: employees })`), `:636-640` (`parseMentionTarget`), `:696`, `:732`, `:766`, `:914`. `TeamRunSnapshot` (`:86-103`) **không đổi** (tránh phá `TeamsView`/`TeamWorkspace`).

**Wiring host:** `TeamWorkspace.tsx:199-255` tạo coordinator một lần; effect deps comment "WR-06: roster arrays are read at construction only" — chỗ này production truyền `loadRoster` đọc repo, test truyền mảng tĩnh.

---

### `src/services/backup/exportBackup.ts` (service, serialize)

**Analog:** self `:7` + `:163-327`

**Version constant + destructure/Promise.all/tables/counts — bốn chỗ song song:**
```ts
export const CURRENT_SCHEMA_VERSION = 11 as const;   // → 12
```
```ts
  const [ /* ... 27 tên ... */ aiTeamLinks] = await Promise.all([
    /* ... 27 lời gọi toArray() ... */
  ]);
```
```ts
  const tables = { /* ... */ aiTeamMembers, aiTeamLinks };
  const counts = { /* ... */ aiTeamMembers: aiTeamMembers.length, aiTeamLinks: aiTeamLinks.length };
```
Thêm `aiSkillVersions` vào **cả bốn** vị trí — thiếu một chỗ là export/validate lệch ngay (RESEARCH Pitfall 3).

---

### `src/services/backup/validateBackup.ts` (service, request-response)

**Analog:** self `:48-127` (envelope gate), `:216-239` (per-table), `:469-497` (live refs), `:508-569` (envelope out).

**Envelope gate đứng trước mọi ghi** (`:48-64`, `:92-105`) — giữ nguyên thứ tự `assertNoLegacyTables` → envelope:
```ts
export function validateBackupPayload(raw: unknown): BackupValidationResult {
  // D-49: reject a pre-31.2 payload at the envelope stage, before any table validation
  // and therefore before any write. Local data is untouched.
  try {
    assertNoLegacyTables(raw);
  } catch (err) { /* ... return { valid:false, errors:[...] } */ }
```
```ts
  if (typeof candidate.schemaVersion !== 'number' || candidate.schemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push({ table: 'envelope', field: 'schemaVersion',
      message: `Phiên bản sơ đồ (${String(candidate.schemaVersion)}) không tương thích (chỉ hỗ trợ phiên bản ${CURRENT_SCHEMA_VERSION})` });
  } else if (candidate.schemaVersion < CURRENT_SCHEMA_VERSION) {
    // D-49: older envelopes are not normalized — they are rejected outright.
    errors.push({ table: 'envelope', field: 'schemaVersion', message: LEGACY_BACKUP_MESSAGE });
  }
```

**Per-table validate — dòng cho bảng mới** (`:237-239` là khuôn):
```ts
  const aiTeamLinks = rawTables.aiTeamLinks !== undefined
    ? validateTable('aiTeamLinks', BackupAiTeamLinkRecordSchema, rawTables.aiTeamLinks)
    : undefined;
```
Thêm `aiSkillVersions` theo đúng khuôn, + vào `validEnvelope.tables` (`:534-539`) và `.counts` (`:563-568`).

**Stage 5 live refs — chỗ thêm ràng buộc** (`:469-493`):
```ts
  // Stage 5: AI Office referential integrity (T-34-31). `replaceTables` bulk-adds, so the
  // repository guards never run on import — the payload itself must be checked.
  const aiTeamIds = new Set((aiTeams ?? []).map((team) => team.id));
  const aiLeadIds = new Set((aiLeads ?? []).map((lead) => lead.id));
  const aiSkillIds = new Set((aiSkills ?? []).map((skill) => skill.id));
  for (const team of aiTeams ?? []) {
    if (!aiLeadIds.has(team.leadId)) {
      errors.push({ table: 'aiTeams', recordId: team.id, field: 'leadId',
        message: `AiTeam references leadId "${team.leadId}" not found in aiLeads` });
    }
  }
```
Sửa `!aiLeadIds.has(team.leadId)` → chỉ khi `team.leadId !== undefined`. Thêm: `aiTeamMembers.agentId ∈ aiEmployees ∪ aiLeads`, `aiSkillVersions.skillId ∈ aiSkills`, `(skillId,version)` unique, invariant lead-row (Pitfall 5), `chatThreads` team scope. **Không** validate `chatMessages.targetAgentId` — historical (D-14/D-18), thêm comment tại chỗ.

---

### `src/services/backup/restoreBackup.ts` (service, batch/transaction)

**Analog:** self `:26-65`, `:180-202`, `:218-285`

**Hai danh sách phải sửa cùng lúc** (`:26-65`):
```ts
const RESTORE_TABLES = (db: TaskPlannerDatabase) => [
  db.tasks, /* ... */ db.aiTeamMembers, db.aiTeamLinks,
  db.settings, db.backupMetadata,
];

/** Phase 34: the six AI Office tables, cleared and re-added as one group. */
const AI_OFFICE_TABLE_KEYS = [
  'aiEmployees', 'aiLeads', 'aiSkills', 'aiTeams', 'aiTeamMembers', 'aiTeamLinks',
] as const;
```

**Clear-guard + add group** (`:236-242`, `:274-279`):
```ts
    // Phase 34: same rule for AI Office — a payload that predates the tables must not wipe them.
    const clearAiOffice = AI_OFFICE_TABLE_KEYS.some((key) => tables[key] !== undefined)
      ? [
          targetDb.aiEmployees.clear(), targetDb.aiLeads.clear(), targetDb.aiSkills.clear(),
          targetDb.aiTeams.clear(), targetDb.aiTeamMembers.clear(), targetDb.aiTeamLinks.clear(),
        ]
      : [];
```
```ts
    await add(targetDb.aiTeams, tables.aiTeams);
    await add(targetDb.aiTeamMembers, tables.aiTeamMembers);
    await add(targetDb.aiTeamLinks, tables.aiTeamLinks);
```
`aiSkillVersions` phải vào **năm** chỗ: `RESTORE_TABLES`, `AI_OFFICE_TABLE_KEYS`, `clearAiOffice`, `add(...)`, và `captureSnapshot` (`:183-201`). Restore giữ nguyên `status` đã lưu — không chuẩn hóa pending → approved (D-16).

---

### `src/services/localSqlitePersistence.ts` (service, event-driven)

**Analog:** self `:14-36`, `:273-302`

```ts
export const SQLITE_DOMAIN_TABLES = [
  'systems', 'changeRequests', 'tasks', /* ... */
  'aiTeams', 'aiTeamMembers', 'aiTeamLinks',
] as const;

export const SQLITE_LOCAL_TABLES = ['settings', 'backupMetadata', 'activeTimers'] as const;
export const SQLITE_TABLES = [...SQLITE_DOMAIN_TABLES, ...SQLITE_LOCAL_TABLES] as const;
```
Chỉ thêm `'aiSkillVersions'` vào `SQLITE_DOMAIN_TABLES`. `attachSqliteTableHooks` (`:273-302`) tự phủ bảng mới qua `SQLITE_TABLES` — không viết hook mới.

---

### `src-tauri/src/sqlite_persistence.rs` (config, file I/O)

**Analog:** self `:6-27`

```rust
const ALLOWED_TABLES: &[&str] = &[
    "projects",
    "milestones",
    "tasks",
    /* ... */
    "aiTeamMembers",
    "aiTeamLinks",
];
```
Thêm `"aiSkillVersions"` + ba bảng đang thiếu (`"chatTabs"`, `"systems"`, `"changeRequests"`). Giữ `"projects"`/`"milestones"` để test Rust dòng ~201/212 không phải sửa (RESEARCH §A.9).

---

### `src/components/ai/office/TeamSettingsDrawer.tsx` (component, form)

**Analog:** self `:50-139` + `TeamEditorDrawer.tsx:121-179`

**Seeded-once-per-open pattern** (`:88-117`) — bắt buộc giữ khi thêm khối roster, nếu không `useLiveQuery` members reset edit giữa lượt:
```tsx
  // WR-08: seed only when the drawer opens (or the team changes). `members` is a live
  // query whose identity changes on every usage write, which would otherwise reset the
  // user's in-progress edits mid-run.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { seededFor.current = null; return; }
    if (seededFor.current === team.id) return;
    seededFor.current = team.id;
    /* setTotal/setRows/... */
  }, [open, team.id]);
```

**Select pattern cho roster/leader** (`TeamEditorDrawer.tsx:121-141`):
```tsx
          <Select
            showSearch
            style={{ width: '100%' }}
            value={leadId ?? null}
            onChange={(value: string) => setLeadId(value)}
            options={leads.map((lead) => ({ label: `${lead.name} · ${lead.role}`, value: lead.id }))}
            optionFilterProp="label"
            aria-label="Lead"
            placeholder="Chọn lead"
          />
```
Leader `Select` thêm `disabled={Boolean(team.leaderLockedAt)}`. Nút gỡ member dùng `Popconfirm` theo `EmployeeCard.tsx:81-91`.

---

### `src/components/ai/office/TeamEditorDrawer.tsx` (component, form)

**Analog:** self

**Chỗ phải bỏ cap + nới valid** (`:51-54`):
```tsx
  const capReached = activeCount >= 3;
  const memberCount = (leadId ? 1 : 0) + employeeIds.length;
  const total = budget ?? 0;
  const valid = name.trim().length > 0 && Boolean(leadId) && budget !== null && budget >= 0;
```
→ `const valid = name.trim().length > 0;` (D-05: chỉ tên là bắt buộc). Xóa `capReached`/`Tooltip` ở `:199-206`, `maxCount={3}` ở `:147`, placeholder "tối đa 3" ở `:157`, import `ACTIVE_TEAM_CAP_MESSAGE` ở `:4`. Giữ `Alert` error ở `:109` và `data-testid` hooks.

---

### `src/components/ai/office/TeamCard.tsx` (component, render)

**Analog:** self `:24,47`

```tsx
const ROSTER_CAP = 4;   // GIỮ — chỉ là số avatar hiển thị, không phải cap dữ liệu
/* ... */
  const capReached = activeCount >= 3;   // XÓA cùng Tooltip ACTIVE_TEAM_CAP_MESSAGE
```
Xóa import `ACTIVE_TEAM_CAP_MESSAGE` (`:4`) và nhánh tooltip; giữ `ROSTER_CAP` + overflow logic (`:48-49`).

---

### `src/components/ai/office/EmployeeCard.tsx` (+ `LeadCard`) / `SkillCard.tsx` (component, render)

**Analog:** self `EmployeeCard.tsx:81-91,142-152`, `SkillCard.tsx:55-65`

Copy hiện tại hứa cascade — trái D-11/D-12:
```tsx
        <Popconfirm
          title={`Xóa nhân viên: «${employee.name}» sẽ bị xóa khỏi mọi nhóm đang dùng. Lịch sử hội thoại vẫn được giữ.`}
```
→ đổi sang "phải gỡ khỏi các nhóm trước". `LeadCard` và `SkillCard` sửa cùng đợt.

---

### `src/views/TeamsView.tsx` (view, render)

**Analog:** self `:39,118`

```tsx
  const activeCount = teams.filter((team) => team.status === 'active').length;
  /* ... */
        <Tag color={activeCount === 3 ? 'warning' : 'default'}>{`Đang hoạt động ${activeCount}/3`}</Tag>
```
→ `{`Đang hoạt động ${activeCount}`}`; bỏ `activeCount === 3`. `activeCount` vẫn truyền xuống `TeamCard`/`TeamEditorDrawer` (`:162,181`) — sau khi bỏ cap, prop này thành thừa ở hai consumer; gỡ cùng lúc để `tsc` sạch.

---

### `src/views/AiOfficeView.tsx` (view, request-response)

**Analog:** self `:117-125`

```tsx
  const handleDeleteEmployee = (employee: AiEmployee) => {
    void deleteEmployee(employee.id, db);
  };
```
→ `async` + đọc kết quả `{deleted:false, code:'IN_USE', usedBy}` và hiện `Alert`/`message.error` nêu tên nhóm (D-10/D-11). Không nêu UUID (ASVS V7). Ba handler cùng khuôn.

---

### `src/components/ai/office/TeamWorkspace.tsx` (host, event-driven)

**Analog:** self `:171-264`

Coordinator tạo một lần với `employees`, `skills` là prop chụp tại effect (`:212-213`); deps comment "WR-06: roster arrays are read at construction only" (`:264`). Production truyền `loadRoster: () => Promise<...>` đọc repo; không đổi key registry (`:60`) hay `createRuntimeDeps` seam (`:218`).

---

### `tests/db/schemaV19Migration.test.ts` (NEW — test, migration)

**Analog:** `tests/db/schemaV17Migration.test.ts` (toàn file)

**Seed ở version trước rồi mở DB thật** (`:26-30`, `:92-118`):
```ts
async function seedV16Database(dbName: string): Promise<void> {
  const v16Db = new Dexie(dbName);
  v16Db.version(16).stores(SCHEMA_V16);
  await v16Db.open();
  /* bulkAdd rows ... */
  await v16Db.close();
}

describe('Dexie SCHEMA_V17 Migration (Phase 34)', () => {
  beforeEach(() => { dbName = 'TestSchemaV17MigrationDB_' + Math.random().toString(36).slice(2); });
  afterEach(async () => { /* upgraded.delete(); Dexie.delete(dbName); */ });

  async function openAtCurrentVersion(): Promise<TaskPlannerDatabase> {
    await seedV16Database(dbName);
    upgraded = new TaskPlannerDatabase(dbName);
    await upgraded.open();
    return upgraded;
  }
```
V19: seed bằng `new Dexie(name).version(18).stores(SCHEMA_V18)` → mở `TaskPlannerDatabase`; assert `db.verno === 19`, row V18 còn nguyên, `aiSkillVersions` tồn tại và rỗng; thêm case leader-lock round-trip. Comment "tests/setup.ts đã cài shim — never re-import it" (`:12`).

---

### `tests/db/tableListParity.test.ts` (NEW — test, static analysis)

**Analog:** `tests/services/ai/office/teamRunCoordinator.test.ts:337-344` (đọc source bằng `readFileSync`)

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
/* ... */
    it('has no React import', () => {
      const source = readFileSync(
        new URL('../../../../src/services/ai/office/teamRunCoordinator.ts', import.meta.url),
        'utf8'
      );
      expect(source).not.toMatch(/from ['"]react['"]/);
    });
```
Dùng cùng kỹ thuật với `new URL(..., import.meta.url)` cho cả `src/services/localSqlitePersistence.ts` và `src-tauri/src/sqlite_persistence.rs`; parse hai list bằng regex, assert TS ⊆ Rust và `aiSkillVersions` có ở cả hai.

---

### `tests/services/ai/office/aiSkillVersionRepo.test.ts` (NEW — test, CRUD)

**Analog:** `tests/services/ai/office/aiOfficeRepo.test.ts`

Pattern: DB riêng mỗi test + delete trong `afterEach`; assert bằng `toEqual` trên row đầy đủ, không `toMatchObject` (Pitfall 1). Case: create pending → `status` vẫn `'pending'`; `version` tăng đơn điệu; decide approved/rejected không đổi row khác.

---

### Test sửa (đỏ có chủ đích, không phải regression)

| File | Analog để sửa theo | Ghi chú |
|---|---|---|
| `tests/services/ai/office/aiOfficeRepo.test.ts:85-102,118-132` | chính nó | đổi "deletes ... without cascading" → refuse `{deleted:false, code:'IN_USE'}` |
| `tests/services/ai/office/aiTeamRepo.test.ts:76-115` | chính nó | bỏ 3 case cap; thêm >3 nhóm và >3 agent pass |
| `tests/services/backup/officeBackup.test.ts:172-217` | chính nó | `schemaVersion` 11 → 12; thêm `aiSkillVersions`, `targetAgentId`, `leaderLockedAt` vào seed + `toEqual` |
| `tests/services/backup/validateBackup.test.ts:90` | — | mốc 11 → 12 |
| `tests/services/backup/v2Compatibility.test.ts:24-25` | — | `CURRENT_SCHEMA_VERSION` 11 → 12 |
| `tests/services/backup/restoreBackup.test.ts` | `officeBackup.test.ts:219-234` | thêm case payload có `aiSkillVersions` phải clear trước add |
| `tests/services/ai/office/teamRunCoordinator.test.ts` | `:59-70` Harness + `:331-344` | thêm case `loadRoster` tươi theo lượt, guard D-13 |
| `tests/services/ai/office/teamTranscriptRepo.test.ts` | — | D-17 rename không đổi `agentName` cũ |
| `tests/views/TeamsView.test.tsx` | — | bỏ `'Đang hoạt động 1/3'`, cap tooltip, `maxCount` |
| `tests/views/AiOfficeView.test.tsx` | — | delete refuse hiện alert |
| `tests/services/localSqlitePersistence.test.ts` | — | `aiSkillVersions` vào queue, không rò secret |

Thứ tự bắt buộc: viết case `targetAgentId` **trước** khi sửa schema → chạy → phải đỏ (AIO-VERIFY-02 reproduce-before-fix).

---

## Shared Patterns

### Optional-field convention (`exactOptionalPropertyTypes`)
**Source:** `src/types/aiOffice.ts:42,74-76`; `src/db/repositories/aiOfficeRepo.ts:56,78-81`
**Apply to:** mọi field mới trên `AiTeam`, `AiSkillVersion`, `TeamRunCoordinatorOptions`
```ts
  skillId?: string | undefined;
  autoSplitEnabled?: boolean | undefined;
/* ... */
  if (validated.skillId !== undefined) employee.skillId = validated.skillId;
  if ('skillId' in patch) { if (validated.skillId) updated.skillId = validated.skillId; else delete updated.skillId; }
```

### Typed refusal instead of thrown strings
**Source:** `src/services/ai/office/teamTools.ts:38-47`
**Apply to:** `deleteEmployee` / `deleteLead` / `deleteSkill`
```ts
export interface TeamToolRefusal { refused: true; code: TeamToolRefusalCode; message: string; }
function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}
```

### Atomic multi-table write
**Source:** `src/db/repositories/aiTeamRepo.ts:113,185,197`
**Apply to:** assignLeader/lockLeader, delete guard, deleteSkill cascade
```ts
  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers], async () => { /* check + write */ });
```

### Test DB lifecycle
**Source:** `tests/db/schemaV17Migration.test.ts:92-106`, `tests/services/backup/officeBackup.test.ts:162-170`
**Apply to:** 3 test file mới
```ts
  beforeEach(async () => { sourceDb = new TaskPlannerDatabase(`X_${crypto.randomUUID()}`); await sourceDb.open(); });
  afterEach(async () => { await Promise.all([sourceDb.delete(), restoredDb.delete()]); });
```

### Không chạy full suite
Focused run + `npx tsc --noEmit` (memory rule + RESEARCH §Validation Architecture). Không `npm test`.

---

## No Analog Found

Không có. Mọi file đều có analog cùng role + data flow.

---

## Metadata

**Analog search scope:** `src/db/`, `src/db/repositories/`, `src/types/`, `src/validation/`, `src/services/backup/`, `src/services/ai/office/`, `src/components/ai/office/`, `src/views/`, `src-tauri/src/`, `tests/db/`, `tests/services/`, `tests/views/`
**Files scanned:** 26 source + 11 test
**Tracked-source gate:** tất cả 26 analog đã xác nhận qua `git ls-files` trong worktree này
**Pattern extraction date:** 2026-11-10
