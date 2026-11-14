# Phase 39: Skill versioning + enrichment approval — Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 17 source + 9 test + 2 docs
**Analogs found:** 15 / 17 source (2 have no exact analog; closest given)

> Anchors below are the **RESEARCH.md corrected** ones, not CONTEXT.md originals.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/repositories/aiSkillVersionRepo.ts` | repository | CRUD + multi-table txn | `aiTeamRepo.incrementMemberUsage` (`:691-716`) | exact (txn shape) |
| `src/db/repositories/aiOfficeRepo.ts` (`updateSkill`) | repository | CRUD + version write | `deleteSkill` (`:276-298`, multi-table txn) | role-match |
| `src/types/aiOffice.ts` (`AiSkillVersion`) | type | — | existing `AiSkillVersion` (`:126-138`) | exact |
| `src/validation/aiOfficeSchemas.ts` | validation | transform | `AiSkillVersionInputSchema` (`:143-150`) | exact |
| `src/validation/backupSchemas.ts` | validation | transform | `BackupAiTeamMemberRecordSchema` (`:667-679`, optional fields) | exact |
| `src/services/backup/validateBackup.ts` | service | batch validate | existing duplicate guard (`:559-569`) | exact |
| `src/services/ai/office/teamTools.ts` (tool + handler) | service (tool) | request-response | `readSkill` (`:277-292`) + `amendAssignments` (`:417-453`) | exact |
| `src/services/ai/office/teamTools.ts` (`readSkill`) | service (tool) | request-response | itself (`:277-292`) | exact |
| `src/services/ai/office/teamPrompts.ts` | service (prompt) | transform | `buildEmployeeTurnRequest` skill block (`:89-98`) | exact |
| `src/services/ai/office/teamRunCoordinator.ts` | service (orchestrator) | event-driven | `createAssignment` sites (`:2298`, `:2852`, `:3240`) | exact |
| `src/services/ai/patchProposal.ts` (`prepareSkillVersionDiff`) | service (pure) | transform | `preparePatch` (`:191+`) + `createUnifiedLineDiff` (`lineDiff.ts:110`) | role-match |
| `src/components/ai/widget/PatchDiffApprovalCard.tsx` | component | request-response | itself (`:26-85`) | exact |
| `src/components/ai/office/PendingSkillProposals.tsx` | **NEW** component | event-driven (`useLiveQuery`) | `AssignmentPlanCard` + `TeamWorkspace.transcriptExtensions` (`:737-763`) | partial |
| `src/components/ai/office/SkillEditorDrawer.tsx` | component | request-response | itself (`:82-153`) + `Collapse` (`:141-150`) | exact |
| `src/components/ai/office/SkillCard.tsx` | component | request-response | itself (`:13-69`) | exact |
| `src/workbench/toolwindows/AiStaffExplorer.tsx` | component (explorer) | event-driven (`useLiveQuery`) | existing Leads/Employees sections (`:165-325`) | exact |
| `src/components/ai/office/TeamWorkspace.tsx` | component (host) | event-driven | `transcriptExtensions` (`:737-763`) | exact |
| `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` | docs | — | Phase 37/38 override wording | exact |

---

## Pattern Assignments

### 1. `src/db/repositories/aiSkillVersionRepo.ts` (repository, multi-table `rw` + numbered sequence)

**Analog:** `aiTeamRepo.incrementMemberUsage` (`src/db/repositories/aiTeamRepo.ts:691-716`) — the Phase 38 read-modify-write transaction.

**Transaction shape to copy** (`aiTeamRepo.ts:696-715`):
```ts
return db.transaction('rw', db.aiTeamMembers, async () => {
  const row = await db.aiTeamMembers.get(memberId);
  if (!row) throw new Error(`Không tìm thấy thành viên: ${memberId}`);
  const next: AiTeamMember = { ...row, usedTokens: (row.usedTokens ?? 0) + delta.inputTokens + ... };
  await db.aiTeamMembers.put(next);
  return next;
});
```

**What `decideSkillVersion` must copy:** the read → guard → compute → write-inside-one-`rw` shape. **What it must differ on:** the `rw` array must be `[db.aiSkillVersions, db.aiSkills]` (Pitfall 2 — adding `aiSkills.put` without adding it to the scope throws `NotFoundError`), and the number must be computed from a filtered query, not the row itself.

**Numbering query (verified shape, RESEARCH §Pitfall 3):**
```ts
const latestApproved = await db.aiSkillVersions
  .where('[skillId+version]')
  .between([existing.skillId, 0], [existing.skillId, Number.MAX_SAFE_INTEGER])
  .filter((row) => row.status === 'approved')
  .last();
const version = (latestApproved?.version ?? 0) + 1;
```

**Existing code the executor must replace** (`aiSkillVersionRepo.ts:54-80` and `:82-101`) — full current bodies are in RESEARCH `## Code Examples`. Do not add a new file; rewrite in place.

**`listSkillVersions` sort fix** (current `:40`): `rows.sort((a, b) => b.version - a.version)` → `(b.version ?? 0) - (a.version ?? 0)` with a `createdAt` tiebreak (research Focus Area 2 #1).

**New reader for the UI:** `listPendingSkillVersions(db)` — `where('status').equals('pending')`, ordered `createdAt` desc. `status` is already indexed (`schema.ts:139`); no Dexie bump.

---

### 2. `src/db/repositories/aiOfficeRepo.ts` — `updateSkill` creates an approved version (D-09)

**Analog:** `deleteSkill` (`:276-298`) — the existing multi-table `rw` in this file.

**Copy** (`:280`): `db.transaction('rw', [db.aiSkills, db.aiEmployees, db.aiSkillVersions], async () => {...})` — the array-of-tables form and the "re-check after the last await" comment at `:290`.

**Differ:** `updateSkill` (`:253-270`) currently does `db.aiSkills.put(updated)` bare. D-09 requires the `aiSkills` put **and** an `aiSkillVersions.add` with `status: 'approved'`, `decidedAt: now`, `version: max(approved)+1`, `baseVersion: max(approved)` — in the same transaction. The version row must carry the **new** name/description/body.

**Do not change:** `createSkill` (`:233-251`) must stay version-free (D-10 implicit baseline). `deleteSkill` cascade (`:294`) is already correct (D-28).

---

### 3. `src/types/aiOffice.ts` — optional `version`, new `baseVersion`

**Analog:** the same interface, `:126-138`.

```ts
export interface AiSkillVersion {
  id: string;
  skillId: string;
  /** 1-based, monotonic per skill. */
  version: number;          // → version?: number | undefined
  status: AiSkillVersionStatus;
  name: string;
  description: string;
  body: string;
  evidence?: string | undefined;
  createdAt: string;
  decidedAt?: string | undefined;
  // + baseVersion?: number | undefined
}
```

**Copy:** the existing `?: T | undefined` idiom (used by `evidence`, `decidedAt`) — `exactOptionalPropertyTypes` is on, so `| undefined` is mandatory.

---

### 4. `src/validation/backupSchemas.ts` — optional field on a `strictObject`

**Analog:** `BackupAiTeamMemberRecordSchema` (`:667-679`) — already carries three optional fields added by Phase 38.

```ts
export const BackupAiTeamMemberRecordSchema = z.strictObject({
  ...
  /** Phase 38 D-23: split usage. Optional so a pre-38 export still restores. */
  inputTokens: aiTokensSchema.optional(),
  outputTokens: aiTokensSchema.optional(),
  usageEstimated: z.boolean().optional(),
});
```

**Copy:** the `z.number()...optional()` idiom and the one-line comment naming the phase that added it.

**Change in `BackupAiSkillVersionRecordSchema` (`:690-701`):**
```ts
version: z.number().int().positive().optional(),        // was .positive() required
baseVersion: z.number().int().nonnegative().optional(), // NEW
```
**Differ:** `version` becomes optional (pending omits it). `baseVersion` is `nonnegative()` because `0` is a legal baseline value. **Do not** bump `BACKUP_SCHEMA_VERSION` (`:846`) — both fields are optional-absent (research Focus Area 3).

**`FORBIDDEN_BACKUP_KEYS`** (`:194-198`): `baseVersion` verified to pass. No edit.

---

### 5. `src/services/backup/validateBackup.ts` — duplicate guard must skip unnumbered rows

**Analog:** the existing loop (`:559-569`).

```ts
const seenVersions = new Set<string>();
for (const version of aiSkillVersions ?? []) {
  ...
  const key = `${version.skillId}:${version.version}`;
  if (seenVersions.has(key)) { errors.push({...}); }
  seenVersions.add(key);
}
```

**Differ:** two pendings both key `S:undefined` and collide. Guard must become `if (version.version === undefined) continue;` before the key computation (or scope the key to `status === 'approved'`). Everything else in the loop stays.

---

### 6. `src/services/ai/office/teamTools.ts` — `propose_skill_version` tool + handler

**Analog:** `readSkill` (`:277-292`) for the refusal shape, `amendAssignments` (`:417-453`) for argument validation.

**Definition entry — copy the `TEAM_TOOL_DEFINITIONS` shape** (`:53-210`, e.g. `:93-104`):
```ts
{
  type: 'function',
  function: {
    name: 'read_skill',
    description: 'Đọc toàn văn kỹ năng được gán cho bạn. ...',
    parameters: { type: 'object', properties: {}, },
  },
},
```
New entry: `name: 'propose_skill_version'`, `parameters` with `name`/`description`/`body` required and `evidence` optional.

**Refusal convention** (`:42-51`): refusal is a **returned value**, never a throw.
```ts
export interface TeamToolRefusal { refused: true; code: TeamToolRefusalCode; message: string; }
function refuse(code, message) { return { refused: true, code, message }; }
```
Reuse `SKILL_NOT_ASSIGNED` (`:32`) — already in the union. Do **not** add a new code for the empty-skill case.

**Handler shape to copy** (`readSkill`, `:277-284`):
```ts
async function readSkill(ctx: TeamToolContext): Promise<string> {
  if (!ctx.skillId) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  ...
}
```

**Dispatch switch** (`:490-516`) — add one case:
```ts
case 'read_skill': return readSkill(ctx);
```

**Payload placement (D-06):** do **not** add to `LEAD_ONLY_TEAM_TOOLS` (`:216-219`). `EMPLOYEE_TEAM_TOOLS` derives from `TEAM_TOOL_DEFINITIONS` minus that set (`teamRunCoordinator.ts:324-327`), so adding the definition is sufficient.

**Must NOT touch:** `MUTATION_TOOLS` in `aiTools.ts:4707-4752` (D-05).

---

### 7. `src/services/ai/office/teamTools.ts` — `readSkill` pinned-version read (D-18)

**Analog:** itself (`:277-292`).

```ts
async function readSkill(ctx: TeamToolContext): Promise<string> {
  if (!ctx.skillId) { return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', '...')); }
  const skill = await ctx.db.aiSkills.get(ctx.skillId);
  if (!skill) { return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', '...')); }
  return JSON.stringify({
    name: skill.name,
    description: skill.description,
    body: wrapUntrusted(`KỸ NĂNG ${skill.name}`, skill.body),
  });
}
```

**Differ:** insert the exact-match lookup **before** the `aiSkills` fallback:
```ts
const pinned = ctx.skillVersion
  ? await ctx.db.aiSkillVersions.where('[skillId+version]').equals([ctx.skillId, ctx.skillVersion]).first()
  : undefined;
const row = pinned?.status === 'approved' ? pinned : undefined;  // tamper guard
const skill = row ?? (await ctx.db.aiSkills.get(ctx.skillId));
```
**Do not** use `.between(...).last()` (Pitfall 5). Also wrap `description` (research Focus Area 8 #8) — the description is model-writable post-approval.

**`TeamToolContext`** (`:21-28`) gains `skillVersion?: number | undefined`, same `?: T | undefined` idiom as `skillId`.

---

### 8. `src/services/ai/office/teamPrompts.ts` — wrap description + amend read-only copy (D-21)

**Analog:** the existing skill block (`:89-98`) and `wrapUntrusted` (`:47-54`).

```ts
// D-24 / AIO-SKILL-02: the description enters the prompt, the body never does.
if (skill) {
  parts.push([
    `[KỸ NĂNG — ${skill.name}]`,
    skill.description,
    'Khi cần quy trình chi tiết, gọi công cụ read_skill để đọc toàn văn.',
  ].join('\n'));
}
```
**Differ:** `skill.description` → `wrapUntrusted(\`MÔ TẢ KỸ NĂNG ${skill.name}\`, skill.description)`. `wrapUntrusted` already neutralizes delimiters internally (`:51`) — do not re-implement.

**Read-only policy copy** (`:81-86`):
```ts
[
  '[CHÍNH SÁCH CHỈ ĐỌC]',
  'Bạn chỉ được đọc dữ liệu. Mọi thao tác ghi đều bị từ chối tự động và không có thay đổi nào được thực hiện.',
  ...
]
```
**Differ:** the second sentence is now false — `propose_skill_version` writes a pending row. Amend to name the one permitted write. Add a prompt test asserting the new sentence (research Focus Area 5 ⚠).

---

### 9. `src/services/ai/office/teamRunCoordinator.ts` — pin at creation, thread to context

**Analog:** the three existing `createAssignment` sites.

**Dispatch site** (`:2852-2862`) — the **only** site that computes:
```ts
const skill = skillFor(employee);
const attemptRow = await createAssignment(
  {
    batchId: batch.id,
    agentId: employee.id,
    agentName: employee.name,
    ...(skill ? { skillId: skill.id } : {}),
    model: employee.model || options.model,
    task: assignment.task,
  },
  db
);
```
**Differ:** add `...(pinned !== undefined && pinned > 0 ? { skillVersion: pinned } : {})` — **omit at baseline**, because `BackupAiTeamAssignmentRecordSchema.skillVersion` is `positive()` (`backupSchemas.ts:753`). Compute `pinned` with a new `getLatestApprovedVersionNumber(skill.id, db)` helper.

**Amend site** (`:2298-2311`) — **inherit**, copy as-is:
```ts
...(row.skillVersion !== undefined ? { skillVersion: row.skillVersion } : {}),
```

**Retry site** (`:3240-3252`) — currently inherits `source.skillVersion` (`:3246`). **D-19a (locked): recompute**, do not inherit. Replace that spread with a fresh `getLatestApprovedVersionNumber(...)`.

**`AttemptRef`** (`:1712-1718`) gains `skillVersion?: number | undefined`.

**`toolContext`** (`:1060-1070`) — copy the optional-spread idiom:
```ts
function toolContext(agentId: string): TeamToolContext {
  const employee = roster.employees.find((row) => row.id === agentId);
  const skillId = employee?.skillId;
  return { db, teamId, threadId: options.threadId, agentId, ...(skillId ? { skillId } : {}) };
}
```
**Differ:** add `...(pinnedSkillVersion.get(agentId) !== undefined ? { skillVersion: pinnedSkillVersion.get(agentId) } : {})`. Set the map in `startEmployeeTurn` beside `activeAssignmentByAgent.set(...)` (`:1844-1848`), delete in `finalizeAttempt` (`:1049-1051`).

**Do not** change `employeeTools()` (`:1092-1094`) — the new tool arrives via `EMPLOYEE_TEAM_TOOLS` automatically.

---

### 10. `src/services/ai/patchProposal.ts` — `prepareSkillVersionDiff` (three-field diff)

**Analog:** `preparePatch` (`:191+`) for the refusal shape + `createUnifiedLineDiff` (`utils/lineDiff.ts:110`).

**Copy:** `PATCH_LINE_CAP` (`:15`), the `refuse('NO_CHANGES', ...)` / `refuse('DIFF_BUDGET_EXCEEDED', ...)` codes (`:33-34`), and the `ArtifactPatchProposal` return type (`:60-73`).

**Differ:** no `sectionId`/`expectedHeading`/`baseHash`/`operation` args (D-03). Build `diffText` from up to three hunks in fixed order `name → description → body`, each only when changed, labels `--- a/skill:{id}/{field} ({baseLabel})` / `+++ b/skill:{id}/{field} (đề xuất)`. `addedLines`/`removedLines` are the sums. `sectionId: 'skill'`, `sectionTitle: <skill name>`, `target: 'skill'`.

**Why this file, not a new office module:** `verify-team-chat-architecture.sh:60-73` fails on any `src/services/ai/office/*.ts` with zero production importers (research Focus Area 8 #14).

---

### 11. `src/components/ai/widget/PatchDiffApprovalCard.tsx` — skill variant

**Analog:** itself (`:26-85`).

**Props to copy** (`:6-14`):
```ts
export interface PatchDiffApprovalCardProps {
  patch: ArtifactPatchProposal;
  stale?: boolean | undefined;
  applying?: boolean | undefined;
  error?: string | undefined;
  decision?: 'approved' | 'rejected' | undefined;
  onApprove: () => void;
  onReject: () => void;
}
```
**Add:** `variant?: 'patch' | 'skill'`, `subtitle?: string`, `evidence?: string`, `staleReason?: 'document-changed' | 'newer-version-approved'` — all optional with defaults preserving today's note behaviour (5 existing tests stay green).

**Copy the stale mechanism verbatim** (`:55-56`, `:76-81`):
```tsx
{stale && <Alert type="warning" showIcon role="alert" style={{ fontSize: 12 }} title="..." />}
<Tooltip title={stale ? 'Không thể áp dụng vì tài liệu đã thay đổi' : undefined}>
  <span tabIndex={stale ? 0 : undefined} aria-label={stale ? '...' : undefined}>
    <Button type="primary" disabled={stale || applying} onClick={onApprove}>Chấp thuận</Button>
  </span>
</Tooltip>
```
**Differ:** the copy strings switch on `variant`/`staleReason`; the subtitle line (`:46-49`) renders `subtitle` when set (skill variant must not print a UUID); add the `Collapse` evidence panel after the diff region. **Reject stays enabled when stale** (`:75` — only `applying` disables it).

**Do not** change: `data-testid="patch-diff-approval"`, the `role="region"` diff block (`:58-70`), the `+/−` chips (`:50-54`).

---

### 12. `src/components/ai/office/PendingSkillProposals.tsx` — NEW transcript extension

**No exact analog.** Closest: `AssignmentPlanCard` (`src/components/ai/office/AssignmentPlanCard.tsx`, whole file) for the card-in-transcript shape, and `TeamWorkspace.transcriptExtensions` (`:737-763`) for the slot.

**Slot signature to copy** (`TeamWorkspace.tsx:737-763`):
```tsx
const transcriptExtensions = (
  <>
    <TeamActivityIndicator ... />
    {(snapshot.pendingPlan ?? snapshot.lastPlan) && (
      <AssignmentPlanCard plan={...} decision={...} onApprove={...} onReject={...} />
    )}
  </>
);
```
Passed to `<AiChatWidget transcriptExtensions={transcriptExtensions} />` (`:988`); the widget renders it at `AiChatWidget.tsx:413` (`{transcriptExtensions}`). `transcriptExtensions?: React.ReactNode` (`AiChatWidget.tsx:89`). **No new widget API.**

**`useLiveQuery` shape to copy** — `AiStaffExplorer.tsx:39-40`:
```ts
const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
```

**Differ:** the component owns its own `useLiveQuery(() => listPendingSkillVersions(db), [db])`, filters by the team roster's skill ids, caps at 3 cards, and holds a local `Map<versionId, 'approved' | 'rejected'>` overlay so a decided card stays mounted with its `role="status"` line (UI-SPEC §1). Renders `null` at zero pendings.

**Do not** render from `turn.pendingApproval` — nothing populates it for a non-parking tool (research Focus Area 6 ⚠, Pitfall 6).

---

### 13. `src/components/ai/office/SkillEditorDrawer.tsx` — pending + history sections

**Analog:** itself (`:82-153`).

**Copy the `Collapse` idiom** (`:141-150`):
```tsx
<Collapse
  size="small"
  items={[{ key: 'preview', label: 'Xem trước', children: <MarkdownContentRenderer content={body} /> }]}
/>
```

**Copy the save path** (`:71-80`):
```tsx
const handleSave = async () => {
  setSaving(true);
  try {
    if (skill) await updateSkill(skill.id, { name, description, body }, db);
    else await createSkill({ name, description, body }, db);
    onSaved();
  } finally { setSaving(false); }
};
```
**Unchanged** — D-09 makes the *repo* create the version; the drawer still saves immediately. Do not add an approval step here (Pitfall 9).

**Differ:** insert `Chờ duyệt ({n})` (only when `skill !== null && n > 0`) after the preview collapse, then `Lịch sử phiên bản ({n})` (decided rows only, newest first, `Collapse` items). Rejected rows render `Đề xuất bị từ chối` — never `v0`/`vundefined`. Body renders through `MarkdownContentRenderer` (T-34-47 — the only permitted path). Add the title `Tag` badge and the save hint line.

**Create mode** (`skill === null`): sections 3/4/5 do not render — the drawer is exactly today's component.

---

### 14. `src/components/ai/office/SkillCard.tsx` — `pendingCount` badge

**Analog:** itself (`:13-69`).

**Copy the caption slot** (`:47-49`):
```tsx
<div style={{ fontSize: 12, color: token.colorTextSecondary }}>
  {`Đang dùng bởi ${agentCount} nhân viên`}
</div>
```
**Differ:** add `pendingCount?: number | undefined` to `SkillCardProps` (`:5-10`) and render `<Tag color="warning" style={{ fontSize: 12, margin: 0 }}>{n} chờ duyệt</Tag>` above the caption when `n > 0`. Optional prop keeps the dead `AiOfficeView` compiling (D-32).

---

### 15. `src/workbench/toolwindows/AiStaffExplorer.tsx` — "Kỹ năng" section

**Analog:** the existing Leads/Employees sections (`:165-325`).

**Copy the section header** (`:167-181`):
```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '4px 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  color: 'var(--fg-secondary, #5f6269)', letterSpacing: '0.04em' }}>
  <span>AI Leads ({filteredLeads.length})</span>
</div>
```

**Copy the empty state** (`:183-186`):
```tsx
<div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-muted, #8c8f9c)' }}>
  Chưa có AI Lead
</div>
```

**Copy `confirmDelete`** (`:71-80`) and `applyRefusal` (`:65`) — the refusal Alert at `:328-339` (`data-testid="ai-staff-delete-error"`) is reused unchanged.

**Copy the toolbar button shape** (`:146-154`):
```tsx
<Tooltip title="Thêm Nhân viên AI">
  <Button size="small" type="text" icon={<PlusOutlined />}
    onClick={() => setCreateKind('employee')} aria-label="Thêm Nhân viên AI" />
</Tooltip>
```

**Differ:** third section appended after Employees, rendered with `SkillCard` (not a compact row) in a `flexDirection: 'column'; gap: 8` container. `createKind` union gains `'skill'`. Search placeholder changes to `Tìm lead, nhân viên, kỹ năng...` (the existing test asserting `'Tìm staff...'` must be updated in the same change). New `useLiveQuery` for pending counts grouped by `skillId`.

**⚠ Discrepancy to resolve at plan time:** UI-SPEC §5 says delete uses the existing `confirmDelete(name, ...)` helper, but the live `confirmDelete` uses `Modal.confirm` (`:72`), while `SkillCard` owns its own `Popconfirm` (`SkillCard.tsx:55-65`). The card's Popconfirm fires first; `confirmDelete` is only needed if the explorer wraps it. Follow the live code, not the spec's wording.

**Do not touch:** `src/views/AiOfficeView.tsx` (D-32).

---

### 16. `src/components/ai/office/TeamWorkspace.tsx` — host the new extension

**Analog:** `transcriptExtensions` (`:737-763`).

**Differ:** append `<PendingSkillProposals team={team} members={liveMembers} db={db} />` **after** `AssignmentPlanCard` inside the fragment. Nothing else changes.

---

### 17. Docs — D-30 override

**Analog:** the Phase 37/38 override wording already in `.planning/ROADMAP.md` §Phase 37/38 and `.planning/REQUIREMENTS.md`.

Edit `ROADMAP.md` §Phase 39 success criterion 1 and `REQUIREMENTS.md` `AIO-SKILL-01` to read skill-CRUD-only, leader/agent CRUD → Phase 40.

---

## Shared Patterns

### Multi-table Dexie transaction
**Source:** `src/db/repositories/aiTeamRepo.ts:696-715` (`incrementMemberUsage`), `aiOfficeRepo.ts:280-297` (`deleteSkill`)
**Apply to:** `decideSkillVersion`, `createSkillVersion`, `updateSkill`, `deleteSkill` (unchanged)
```ts
return db.transaction('rw', [db.aiSkillVersions, db.aiSkills], async () => {
  const row = await db.aiSkillVersions.get(id);
  if (!row) throw new Error(MISSING_VERSION_MESSAGE);
  await db.aiSkillVersions.put(next);
  await db.aiSkills.put(skill);
  return next;
});
```
Rule: every table written inside the callback must be in the `rw` array (Pitfall 2).

### Refusal is a returned value, never a throw
**Source:** `src/services/ai/office/teamTools.ts:42-51`
**Apply to:** `propose_skill_version` handler
```ts
function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}
```
Messages carry no ids (T-36-15) — names only.

### Untrusted-data wrapping
**Source:** `src/services/ai/office/teamPrompts.ts:47-54`
**Apply to:** `buildEmployeeTurnRequest` description, `readSkill` description + body
```ts
export function wrapUntrusted(label: string, body: string): string { ... neutralizeDelimiters(body) ... }
```
Approved ≠ trusted (AIO-SKILL-06).

### Optional backup field for forward-compat
**Source:** `src/validation/backupSchemas.ts:667-679`
**Apply to:** `BackupAiSkillVersionRecordSchema`
`strictObject` rejects undeclared keys — the field must be **declared optional**, not merely absent.

### `useLiveQuery` reactive read
**Source:** `src/workbench/toolwindows/AiStaffExplorer.tsx:39-40`
**Apply to:** `PendingSkillProposals`, `AiStaffExplorer` skills section, `SkillEditorDrawer` pending/history
```ts
const rows = useLiveQuery(() => listPendingSkillVersions(db), [db]) ?? [];
```

### `?: T | undefined` optional property idiom
**Source:** `src/types/aiOffice.ts:135-137`, `teamTools.ts:27`, `teamRunCoordinator.ts:1717`
**Apply to:** every new optional field (`version`, `baseVersion`, `skillVersion`, `variant`, `subtitle`, `evidence`, `staleReason`, `pendingCount`)
`exactOptionalPropertyTypes` is on — `field?: T` alone does not accept an explicit `undefined`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/components/ai/office/PendingSkillProposals.tsx` | component | event-driven | No existing component reads pending rows from Dexie and renders a multi-card decision queue. Closest is `AssignmentPlanCard` (single card, host-supplied state) + `transcriptExtensions` slot. Follow UI-SPEC §2 for the layout contract. |

`prepareSkillVersionDiff` has no exact analog (the existing `preparePatch` is section-based), but its refusal/return shape is fully specified by `patchProposal.ts:60-73` + `:191+`.

---

## Metadata

**Analog search scope:** `src/db/repositories/`, `src/services/ai/`, `src/services/ai/office/`, `src/services/backup/`, `src/components/ai/`, `src/components/ai/office/`, `src/components/ai/widget/`, `src/workbench/toolwindows/`, `src/validation/`, `src/types/`, `tests/`
**Files scanned:** ~30 (17 source + 9 test + docs)
**Pattern extraction date:** 2026-11-14
