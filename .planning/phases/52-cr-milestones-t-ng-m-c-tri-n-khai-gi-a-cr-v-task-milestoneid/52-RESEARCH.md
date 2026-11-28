# Phase 52: CR Milestones — Research

**Researched:** 2026-11-28
**Domain:** Dexie schema/migration + backup versioning + Note entity union + React UI (Tauri-only, TypeScript)
**Confidence:** HIGH for codebase anchors (read directly this session); HIGH for environment probes (Chrome/cargo/Node present). No new packages; everything rides existing Dexie 4.4.6 / Zod 4.6.5.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: New Dexie table `crMilestones` (V31): `id: string` (crypto.randomUUID), `crId: string`, `name: string`, `targetDate?: string` (`YYYY-MM-DD`), `createdAt: string`, `updatedAt: string`. Index `id, crId`. Do NOT reuse the legacy store name `milestones`. Do NOT add a plain text note field.
- D-02: `Task.milestoneId?: string` is optional. No bulk migration of existing tasks; tasks without a milestone appear under a "Chưa gán mốc" group. Changing a task's `crId` clears `milestoneId` in the same way it clears `systemId`.
- D-03: Invariant: if `task.milestoneId` is set, the milestone must exist and `milestone.crId === task.crId`; `task.systemId` (if set) must still be in `cr.targets`. Enforce in `taskRepo` create/update and in backup referential validation.
- D-04: Deleting a milestone requires confirmation, then clears `milestoneId` on its tasks and detaches notes linked to it, inside one Dexie transaction. Tasks and notes survive. Deleting a CR still cascades `crMilestones` after its tasks.
- D-05: Extend `NoteEntityType` with `'crMilestone'` (camelCase, distinct from legacy `'milestone'`). Keep the single optional `entityType`/`entityId` pair on `Note`. Mount `EntityNotesSection` for a selected/expanded milestone in CR Detail and add `crMilestone` to note pickers (NoteEditor, QuickNotesPanel), note list filters (DocListPane, NotesPopoutView), note detail labels, and AI note-query enums for read parity.
- D-06: Do NOT add a chat scope, notification type, knowledge-link entity type, or reminder target for milestones. Notes attached to a milestone remain plain Notes; no new type of note.
- D-07: Bump `BACKUP_SCHEMA_VERSION` 14 → 15. Add `crMilestones` to backup envelope/count schemas, export/restore table lists, per-table validation, and import preview labels. Backups at v14 restore with `crMilestones` treated as empty — never reject them. Keep `assertNoLegacyTables` rejecting any payload containing `projects` or `milestones`.
- D-08: Update native SQLite mirror allowlists (`src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`) and their parity test. Rust is compile-unverified if cargo cannot run here; state that explicitly rather than claiming a cargo pass.
- D-09: CR Detail gains a "Mốc triển khai" section with inline create/edit/delete and an `EntityNotesSection` for the selected milestone. Task table gains a "Mốc" column; TaskDrawer gains a milestone `Select` filtered by current CR. Empty group label: "Chưa gán mốc". Use only `src/components/ui` wrappers and design tokens; no direct AntD import, no hardcoded token-valued inline styles.
- D-10: Preserve all pre-existing uncommitted work in the working tree (CR detail inline link editing from commit chain `261128-d1m`). Do not revert, stash away, or overwrite it. Layer new changes on top.
- D-11: Run focused tests only with scoped paths (NEVER the full Vitest suite — it exceeds an hour), plus `tsc`, lint, and build. Review the final diff and verify the UI in Chrome in light and dark before declaring done. Fix every critical/warning finding; report any unavoidable residual honestly.
- D-12 (Claude's Discretion, verbatim): Exact component decomposition inside CR Detail, modal/select wording, and whether the milestone section uses a compact table or collapsible cards, as long as D-09 holds.
- D-13 (Claude's Discretion, verbatim): Test file placement and exact assertions, as long as D-03/D-04/D-07 are covered.

### Deferred Ideas (OUT OF SCOPE)

- Milestone chat scope, milestone reminders/notifications, milestone knowledge links, milestones on systems outside a CR — explicitly out of scope.
- PWA/GitHub Pages behavior — out of scope per CLAUDE.md.

</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs mapped (TBD in ROADMAP). CONTEXT.md D-01–D-11 are the effective acceptance criteria. `REQUIREMENTS.md` has no milestone rows; do not invent IDs. The planner should key tasks to D-xx IDs from CONTEXT.md.

| Decision | Description | Research Support |
|----------|-------------|------------------|
| D-01/D-08 | `crMilestones` table at V31 + SQLite allowlist parity | `src/db/schema.ts`, `src/db/index.ts`, `src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`, `tests/db/tableListParity.test.ts` |
| D-02/D-03 | Optional `Task.milestoneId` + repo invariant | `src/types/models.ts:104-135`, `src/validation/schemas.ts:306-364`, `src/db/repositories/taskRepo.ts:17-109,277-305` |
| D-04 | Cascade + milestone delete | `src/db/repositories/cascadeRepo.ts:10-81`, `src/db/repositories/changeRequestRepo.ts:257-262` |
| D-05 | Note union propagation | `src/validation/schemas.ts:429-475`, `src/validation/backupSchemas.ts:145-156`, 8 UI surfaces listed below, `src/services/ai/aiTools.ts` enums |
| D-07 | Backup v14→15 without rejecting v14 | `src/validation/backupSchemas.ts:900-933`, `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts`, `src/types/backup.ts`, `ImportPreviewModal.tsx:29-38` |
| D-09 | UI wiring | `src/views/ChangeRequestDetailView.tsx`, `src/components/tasks/{TaskDrawer,TaskTable}.tsx`, `src/components/ui/*` |
| D-10/D-11 | Preserve uncommitted work; focused tests only | git status (see "Working-tree state"), `package.json` scripts, `tests/**` scoped paths |

</phase_requirements>

## Summary

Phase 52 is a vertical slice through six layers: (1) Dexie schema V31 + `Task.milestoneId` type/Zod, (2) `taskRepo` invariant + a new `crMilestoneRepo`, (3) cascade changes, (4) Note entity union widening across schema + ~8 UI surfaces + AI enums, (5) backup v14→15 with backward-compatible restore, and (6) CR Detail / TaskDrawer / TaskTable UI. The hard ordering constraint from Phase 31.2 D-52 still applies: schema/types/Zod/repo first, then cascade/backup, then UI, then tests.

The two highest-risk traps are both "looks additive, actually destructive": the legacy-table gate at `backupSchemas.ts:922-931` checks literal key `'milestones'`, so a new table named `crMilestones` is safe, but any accidental reuse of the string `milestones` makes every backup fail; and the backup version bump must not be paired with a strict `z.literal(15)` envelope validator — `validateBackupPayload` already does its own numeric range check (`validateBackup.ts:149-161`), and the canonical envelope constant is built unconditionally at `validateBackup.ts:752-755`. Backups at v14 must be normalized, not rejected.

Environment reality: `cargo 1.98.1` exists and there is a warm `src-tauri/target/debug`, so Rust compile is possible. Node 24.16.0 / npm 11.13.0 present. No new npm packages needed. All test commands must use scoped paths (project memory + D-11).

**Primary recommendation:** Implement in four waves — (W1) schema/types/Zod/repos/cascade/SQLite allowlist; (W2) backup envelope + normalization + preview; (W3) Note union surfaces + AI enums; (W4) CR Detail + TaskDrawer + TaskTable UI — then run the scoped test set, `tsc`, lint, build, cargo check, and a Chrome light/dark walkthrough. Never touch `milestones` as a literal outside historical migration code.

## Project Constraints (from CLAUDE.md)

- Mọi thảo diễn và trao đổi về dự án này đều bằng tiếng Việt; xưng "sếp"; giữ mã nguồn/tên định danh/đường dẫn/lệnh/thuật ngữ kỹ thuật nguyên dạng. Research output is Vietnamese prose with exact English identifiers.
- **Tauri-only runtime.** PWA/GitHub Pages work out of scope; do not add, debug, or validate service worker / base-path behavior.
- **IndexedDB via Dexie is canonical store**; stable client-generated UUIDs via `crypto.randomUUID()` / `generateId()`; hierarchy changes must not alter IDs.
- **UI:** Ant Design only through `src/components/ui/` wrappers (GUARD-01 ESLint blocks direct `antd`/`@ant-design/icons` imports outside wrappers). Use `var(--...)` design tokens, never hardcoded token-valued inline styles (TOKEN-04, ADOPT-02).
- **Data safety:** backup import must validate format and not replace good local data without explicit confirmation. `ImportPreviewModal` already requires typing `RESTORE` (`ImportPreviewModal.tsx:125,318-325`).
- **GSD workflow enforcement:** file changes only through GSD commands (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`). This research agent writes only RESEARCH.md as its canonical artifact.
- **Anti-read-loop:** one broad read per file; no repeated small-chunk reads. This session complied.
- **Skill:** `sketch-findings-task-management` is relevant to UI work: density 28px controls / 11–13px font / 4-8-12-16 spacing, palette from `src/styles/tokens.ts`, no new colors, inline progress/errors, empty state with CTA. The skill's design decisions target the DocSet workbench, so reuse its *token discipline*, not its rail+inspector layout.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `crMilestones` persistence + invariant | Database / Storage (Dexie V31) | API / Backend (`src/db/repositories`) | IndexedDB is canonical; repo layer enforces cross-store invariant the way `taskRepo` already enforces D-26. |
| CR → milestone → Task hierarchy | API / Backend (repos + types) | Browser / Client (CR Detail, TaskDrawer) | Tier ownership belongs to data model; UI only reads live queries and calls repo verbs. |
| Notes attached to milestone | Database / Storage (`Note.entityType`) | Browser / Client (note pickers/filters) | Existing single optional entity pair; no new note type (D-06). |
| Backup v14→15 normalization | API / Backend (`validateBackup`/`restoreBackup`) | Database / Storage (Dexie restore transaction) | Version gate and referential validation run before any write, preserving good local data. |
| Native SQLite mirror | Database / Storage (Rust `planner_rows`) | Browser / Client (`localSqlitePersistence` hooks) | Opaque `payload_json` rows; adding a table needs allowlist parity only, no SQLite DDL. |
| Milestone CRUD UI | Browser / Client (CR Detail) | — | One selected/expanded milestone drives inline create/edit/delete + `EntityNotesSection`. |
| Anti-Patterns to Avoid | — | — | See below. |

## Standard Stack

No packages are added. Everything below already installed and used by phase-target files.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.4.6 (installed; `[VERIFIED: npm registry]` package OK, no postinstall; version confirmed in project `CLAUDE.md`) | New V31 store, index `id, crId`, transactions | Repo already declares V1–V30; additive store follows same pattern as V17/V19/V22. `[VERIFIED: codebase]` |
| zod | 4.6.5 (installed; `[VERIFIED: npm registry]` OK) | `TaskInputSchema`/`TaskUpdateSchema` widen, `NOTE_ENTITY_TYPES` widen, `BackupCrMilestoneRecordSchema` | Existing Zod schemas own every trust boundary in these files. `[VERIFIED: codebase]` |
| dexie-react-hooks | 4.4.0 | `useLiveQuery` in CR Detail / EntityNotesSection / pickers | Already the only reactive read path. `[VERIFIED: codebase]` |
| dayjs | 1.11.23 | `targetDate` format/parse if UI uses DatePicker | Dates persisted as `YYYY-MM-DD` strings. `[VERIFIED: codebase]` |
| TypeScript | 7.0.2 (`CLAUDE.md`) | `CrMilestone` interface, `NoteEntityType` union | `strict`, `exactOptionalPropertyTypes` — optional fields must be added with conditional spread/delete, never `undefined` assignment. `[VERIFIED: codebase]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@testing-library/react` + `jsdom` | 16.3.3 / 30.1.1 | Focused CR Detail / UI behavior tests | Only scoped paths, never full suite. `[VERIFIED: codebase]` |
| `fake-indexeddb` | 6.2.5 | Repo/migration tests | Already installed globally via `tests/setup.ts:1`. `[VERIFIED: codebase]` |
| Vitest | 5.0.2 | Scoped test runner | `npm test -- <scoped paths> --bail=1`; `-x` rejected (STATE Phase 46.1 note). `[VERIFIED: codebase]` |
| cargo/rusqlite | cargo 1.98.1, rusqlite 0.40.2 bundled | Compile-check Rust allowlist change | `cargo check --manifest-path src-tauri/Cargo.toml` available; warm target cache. `[VERIFIED: this session]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `crMilestones` table at V31 | Reuse legacy `milestones` store | Rejected by D-01 and by `assertNoLegacyTables` literal gate; would break all backups. |
| `Task.milestoneId` required + bulk backfill | Optional + "Chưa gán mốc" bucket | D-02 locked; no bulk migration, no data rewrite. |
| New `MilestoneNote` type | Extend existing `NoteEntityType` | D-05/D-06 locked; single `entityType`/`entityId` pair already has all UI plumbing. |
| Separate SQLite DDL per table | Opaque `planner_rows` payload | Rust `ensure_schema` has one table; only `ALLOWED_TABLES` needs the new name. |
| `npm test` (full suite) | Scoped paths | Full suite exceeds an hour (project memory + D-11). |

**Installation:** None. No `npm install`, no new dependency.

**Version verification:** `[VERIFIED: npm registry]` `dexie` OK (published 2026-10-19, 3.58M weekly downloads, source repo, no postinstall), `zod` OK (published 2026-10-12, 451M weekly downloads, source repo, no postinstall). Both already in the project. No external package legitimacy gate needed beyond this because no installs occur.

## Package Legitimacy Audit

No external packages are installed by this phase. The two packages touched (`dexie`, `zod`) are already in the dependency tree.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| dexie | npm | published 2026-10-19 (current release) | 3,581,227/wk | github.com/dexie/Dexie.js | OK | Approved — already installed |
| zod | npm | published 2026-10-12 (current release) | 450,987,513/wk | github.com/colinhacks/zod | OK | Approved — already installed |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**postinstall network/path risk:** none for either package (seam returned `postinstall: null`).
**Packages discovered via WebSearch/training not verified:** none; no new package names appear in this research.

## Architecture Patterns

### System Architecture Diagram

```text
CR Detail view (Browser/Client)
   │  useLiveQuery(db.crMilestones.where('crId')), useLiveQuery(getTasksByCr)
   │  selected milestone ──► EntityNotesSection(entityType='crMilestone', entityId)
   │  inline create/edit/delete ──► crMilestoneRepo (one rw tx on delete)
   ▼
taskRepo / crMilestoneRepo (API/Backend)
   │  assertSystemInCrTargets + assertMilestoneMatchesCr
   │  create/update/delete tasks, milestones in Dexie transactions
   ▼
Dexie V31 (Database/Storage)  ── attachment hooks ──► localSqlitePersistence.ts
   │  stores: ...V30 + crMilestones; tasks gain optional milestoneId payload
   │                                          │
   │                                          ▼  tauri invoke sqlite_apply_changes
   │                                   Rust ALLOWED_TABLES (crMilestones added)
   ▼
Backup export/validate/restore (v14→15)
   export: tables.crMilestones + counts.crMilestones
   validate: v14 → treat crMilestones=[]; v15 → validate rows; referential check
   │  task.milestoneId ∈ crMilestones ∧ milestone.crId === task.crId
   │  note.entityType='crMilestone' → entityId ∈ crMilestones
   ▼
ImportPreviewModal (Browser/Client)  ← counts from validateBackup envelope
   "Mốc triển khai" row; require RESTORE before replaceTables
```

### Recommended Project Structure

```text
src/
├── db/
│   ├── schema.ts                     # + SCHEMA_V31, LATEST_SCHEMA_VERSION = 31
│   ├── index.ts                      # + import SCHEMA_V31, Table<CrMilestone>, this.version(31)
│   └── repositories/
│       ├── crMilestoneRepo.ts        # NEW: create/update/delete/list by crId
│       ├── taskRepo.ts               # milestoneId in create/update/reparent + invariant
│       └── cascadeRepo.ts            # CR cascade includes crMilestones; milestone delete
├── types/models.ts                   # CrMilestone, Task.milestoneId, NoteEntityType widen
├── validation/
│   ├── schemas.ts                    # NOTE_ENTITY_TYPES + Task{Input,Update}Schema
│   └── backupSchemas.ts              # BACKUP_SCHEMA_VERSION=15, record schema, envelope
├── services/backup/
│   ├── exportBackup.ts               # load/serialize crMilestones + counts
│   ├── restoreBackup.ts              # RESTORE_TABLES, snapshot, clear/add, assemble
│   └── validateBackup.ts             # v14 normalization + per-table + referential
├── services/localSqlitePersistence.ts# SQLITE_DOMAIN_TABLES += crMilestones
├── src-tauri/src/sqlite_persistence.rs # ALLOWED_TABLES += crMilestones
├── views/ChangeRequestDetailView.tsx # "Mốc triển khai" section + task table "Mốc" column
└── components/
    ├── tasks/TaskDrawer.tsx          # milestone Select filtered by selectedCrId
    ├── tasks/TaskTable.tsx           # Mốc column definition + customization
    ├── notes/NoteEditor.tsx          # entity option 'crMilestone'
    ├── notes/QuickNotesPanel.tsx     # segmented + entity name map
    ├── notes/DocListPane.tsx         # filter option
    ├── notes/EntityNotesSection.tsx  # no change needed — generic over NoteEntityType
    └── settings/ImportPreviewModal.tsx # TABLE_NAMES + current count query
```

### Pattern 1: Additive Dexie version with no upgrade hook

**What:** `SCHEMA_V31 = { ...SCHEMA_V30, crMilestones: 'id, crId' } as const;` plus `this.version(31).stores(SCHEMA_V31);` and `LATEST_SCHEMA_VERSION = 31`. No `.upgrade()` needed — new empty store, no backfill.
**When to use:** D-01 additive table, no legacy data reuse (C-16).
**Example:**
```typescript
// src/db/schema.ts — mirrors SCHEMA_V17/V19/V22 pattern
export const SCHEMA_V31 = {
  ...SCHEMA_V30,
  crMilestones: 'id, crId',
} as const;

export const LATEST_SCHEMA_VERSION = 31;
```
`SCHEMA_V16` at `src/db/schema.ts:112-117` is the counter-example: `projects: null, milestones: null` drops stores. **Never write `milestones: null` again** in V31 — `stores()` merges cumulatively, so omitting a key keeps the V15 store; re-declaring `milestones: null` would re-drop it (harmless today since already gone, but semantically wrong and risks the backup gate string check). Official Dexie docs: a Version declares the schema for that version and an optional upgrader function; earlier declarations must stay. `[CITED: https://dexie.org/docs/Version/Version]` `[CITED: https://dexie.org/docs/Version/Version.stores()]`

### Pattern 2: Repo invariant mirror (D-26 → D-03)

**What:** `assertSystemInCrTargets` at `taskRepo.ts:17-27` is the template. Add a sibling `assertMilestoneMatchesCr(crId, milestoneId, db)` that reads `db.crMilestones.get(milestoneId)` and checks `milestone.crId === crId`. Call from `createTask` (alongside line 36), from `updateTask` when `crId`/`milestoneId` touched (alongside lines 99-109), and from `reparentTask` (line 301) clearing `milestoneId` exactly as `systemId` is cleared at lines 295-299.
**When to use:** All task write paths; `TaskDrawer.handleSave` calls both `reparentTask` and `updateTask` (`TaskDrawer.tsx:328-333,349-387`), so the invariant must survive both calls.
**Example:**
```typescript
// conceptual shape; exact error text is Claude's discretion
async function assertMilestoneMatchesCr(
  crId: string,
  milestoneId: string | undefined,
  db: TaskPlannerDatabase
): Promise<void> {
  if (milestoneId === undefined) return;
  const milestone = await db.crMilestones.get(milestoneId);
  if (!milestone) throw new Error('Mốc triển khai không tồn tại.');
  if (milestone.crId !== crId) throw new Error('Mốc triển khai không thuộc CR đã chọn.');
}
```

### Pattern 3: Backup v14 → v15 normalization, never rejection

**What:** `validateBackup.ts:67-92` shows the established pattern (`normalizeLegacyLinks` for v13→v14). Add an analogous normalization that, when `schemaVersion < 15` and `rawTables.crMilestones === undefined`, injects `crMilestones: []` before `validateTable`, so the downstream `validEnvelope` (line 752) always emits v15 with the table present. The envelope validator `BackupEnvelopeSchema` uses `z.literal(BACKUP_SCHEMA_VERSION)` (`backupSchemas.ts:906-912`) but the actual `validateBackupPayload` does numeric range checks itself (`validateBackup.ts:149-161`), so bumping the constant does not retroactively reject v14. `assertNoLegacyTables` (`backupSchemas.ts:922-931`) must remain byte-identical in behavior — it rejects keys `projects`/`milestones`, never `crMilestones`.
**When to use:** All restore paths, including `restoreFailure.test.ts` and v2 compatibility tests.
**Warning:** `validateBackup.ts:225` currently computes `const legacyLinks = schemaVersion < 14`. After the bump, a v14 backup has `legacyLinks = false`; that is correct because v14 already carries unified links. Do not change that threshold to 15.

### Pattern 4: Cascade with one rw transaction

**What:** `cascadeRepo.ts:14-80` deletes a CR and everything scoped to it in one `db.transaction('rw', [tables...])`. Add `db.crMilestones` to the table list, collect milestone ids via `db.crMilestones.where('crId').equals(crId)`, include them in the note-detach `anyOf([...crId, ...taskIds, ...milestoneIds])` at lines 34-41, and `bulkDelete(milestoneIds)` just before `db.changeRequests.delete(crId)` at line 78. New `deleteCrMilestoneWithCascade(milestoneId)` mirrors `deleteTaskWithAllocations` (lines 86-142): clear `milestoneId` on tasks (use `.where('milestoneId').equals(milestoneId).modify(...)` — requires adding `milestoneId` to the tasks index in V31, see Pitfall 2), detach its notes, then delete the milestone row. Confirmation is UI-side via `useTaskMateModal().modal.confirm` as at `ChangeRequestDetailView.tsx:198-214`.

### Pattern 5: Note entity union is a fan-out, not a single edit

**What:** `NoteEntityType` is derived from `NOTE_ENTITY_TYPES` (`schemas.ts:429`) in `models.ts:198`. Widening the tuple and the Zod enums compiles the type layer, but leaves ~8 literal option lists and name maps stale. Verified sites:

| Surface | Anchor | Required change |
|---------|--------|-----------------|
| `NoteEditor` entity Select | `src/components/notes/NoteEditor.tsx:204-208` | add `{ label: 'Mốc triển khai (CR Milestone)', value: 'crMilestone' }`; extend `getEntityOptions` at 82-93 with `db.crMilestones.toArray()` load near 47-49 |
| `QuickNotesPanel` segmented + name map | `QuickNotesPanel.tsx:37-55,91-102,112-119` | add segmented option, add `db.crMilestones.toArray()` to `Promise.all` and `names.set(ms.id, { label: ms.name, type: 'crMilestone' })` |
| `DocListPane` filter | `DocListPane.tsx:291-296` | add `{ value: 'crMilestone', label: 'Mốc triển khai' }` |
| `NotesPopoutView` name map | `NotesPopoutView.tsx:206-219` | add `db.crMilestones.toArray()` and `map.set(\`crMilestone:${m.id}\`, m.name)`; filter at 229-231 already lowercases both sides so `'crmilestone'` matches `'crMilestone'` |
| `NoteDetailModal` label | `NoteDetailModal.tsx:48-61` | add `else if (note.entityType === 'crMilestone')` branch reading `db.crMilestones.get(...)` |
| AI `query_notes` | `aiTools.ts:447,455-458` | enum `['task','cr','system','crMilestone','standalone']`, description text, entityName map at 3330-3335/3421-3423 |
| AI note-write/diagram/reminder/link enums | `aiTools.ts:1281,1312,1337,1423,1681,1705,1725` | note-create/update/diagram enums need `'crMilestone'` for read/write parity per D-05; reminder and knowledge-link enums at 1681/1705/1725 stay untouched (D-06) |
| Backup note record | `backupSchemas.ts:151` | `z.enum(['task','cr','system','crMilestone']).optional()` |

`EntityNotesSection` itself (`EntityNotesSection.tsx:15-25`) needs no code change — it is generic over `NoteEntityType` and queries by `entityId` + `entityType`. `noteRepo.getNotesForEntity` (`noteRepo.ts:369-387`) is likewise generic. Do not create a new note component.

### Anti-Patterns to Avoid

- **Do not name the store `milestones`.** `backupSchemas.ts:922-931` rejects any payload with that literal key; D-01 locks `crMilestones`.
- **Do not set `BACKUP_SCHEMA_VERSION` without adding the table to every table list.** Export `tables`/`counts` (`exportBackup.ts:288-356`), restore `RESTORE_TABLES`/snapshot/`clear`/`add`/assemble (`restoreBackup.ts:26-62,186-216,236-334,377`), validate per-table + envelope + counts (`validateBackup.ts:230-334,752-823`), `BackupTableData`/`BackupTableCounts` (`types/backup.ts:48-117`), and `ImportPreviewModal.TABLE_NAMES` + count query (`ImportPreviewModal.tsx:29-38,60-95`). A missing list silently loses milestones on restore.
- **Do not reject v14 backups.** D-07: treat `crMilestones` as empty. `validateBackup.ts:155` rejects only `< 13`; `assertNoLegacyTables` is about table *names*, not version.
- **Do not add milestone chat scope / notification / knowledgeLink / reminder** (D-06). `chatTabRepo.ts:33`, `backupSchemas.ts:182`, `notificationRepo.ts:96-128`, `knowledgeLinkRepo.ts:69` all have closed enums — leave them.
- **Do not import AntD directly.** `ChangeRequestDetailView.tsx:2` and `TaskDrawer.tsx:2` already import from `../components/ui`; reuse `Select`, `Modal`, `Popconfirm`, `DatePicker`, `Table`, `Input`, `Button`, `useTaskMateModal` from there. GUARD-01 lint will fail on direct imports.
- **Do not hardcode token colors.** Use `var(--accent)`, `var(--border)`, `var(--gap-*)`, `var(--font-size-small)` as existing views do (`ChangeRequestDetailView.tsx:65,593-597`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID for milestone | Custom id generator | `generateId()` from `src/utils/uuid` (used at `taskRepo.ts:39`) | Stable client-generated UUID; CLAUDE.md locked. |
| Reactive milestone list | Custom subscription | `useLiveQuery(() => db.crMilestones.where('crId').equals(crId).toArray(), [crId, db])` | Existing pattern at `ChangeRequestDetailView.tsx:88-96`. |
| Delete confirmation UI | Custom modal | `useTaskMateModal().modal.confirm` (`ChangeRequestDetailView.tsx:73,198-214`) or wrapper `Popconfirm` (`EntityNotesSection.tsx:205-223`) | Wrappers own footer/close policy. |
| Date field | Custom date input | `<DatePicker>` from `../components/ui` + `.format('YYYY-MM-DD')` on save (`TaskDrawer.tsx:594-606`) | Persist `YYYY-MM-DD`, no timezone drift. |
| Cross-store delete atomicity | Sequential deletes | One `db.transaction('rw', [...])` (`cascadeRepo.ts:14-80`) | Partial delete would orphan tasks/notes and fail backup validation. |
| SQLite table mirroring | New SQL table / migration | Add name to `SQLITE_DOMAIN_TABLES` + Rust `ALLOWED_TABLES`; rows are opaque `payload_json` (`localSqlitePersistence.ts:106-117`, `sqlite_persistence.rs:77-92`) | No DDL needed; parity test guards membership. |
| Backup validation engine | New validator | Extend `validateBackupPayload` stages 1–3 (`validateBackup.ts:105-831`) | Existing two-stage + referential checks and safe-error UX. |

**Key insight:** every problem in this phase already has a sibling implementation. The shortest diff is a set of parallel additions to existing lists, not a new subsystem.

## Runtime State Inventory

Not a rename/refactor/migration of existing data in the strict sense — this is an additive table + optional column. Still, the canonical "what persists after source edits" answer:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing tasks carry no `milestoneId` (field never existed); legacy `milestones` store already dropped at V16 (`schema.ts:112-117`, `db/index.ts:360-517`) and V31 must not resurrect it. | None — D-02 forbids bulk migration. Tasks without milestone render under "Chưa gán mốc". |
| Live service config | No service config names a milestone. Knowledge daemon is optional and out of scope (CLAUDE.md). | None. |
| OS-registered state | None — Dexie data is origin-scoped; no OS registries embed milestone strings. Verified by codebase grep for "milestone" in `src-tauri/` (only SQL/SQLite, no scheduler). | None. |
| Secrets/env vars | None — no token or env key references milestones. | None. |
| Build artifacts | `src-tauri/target/debug` warm build cache; adding `crMilestones` to Rust `ALLOWED_TABLES` requires recompile. | Run `cargo check` after edit; artifact auto-updates. |

**Nothing found in category:** live service config, OS-registered state, secrets/env vars — each explicitly checked as shown above.

## Common Pitfalls

### Pitfall 1: Legacy-table gate false positive
**What goes wrong:** A payload containing `crMilestones` is mistaken for legacy `milestones`.
**Why it happens:** `assertNoLegacyTables` uses `'milestones' in candidate` (`backupSchemas.ts:927`) — exact string match, so `crMilestones` is actually safe; risk only arises if a developer copies the literal into a new allow/deny list or names the store wrong.
**How to avoid:** Use `crMilestones` everywhere; add a test asserting `assertNoLegacyTables({tables:{crMilestones:[]}})` does not throw and `{tables:{milestones:[]}}` does (existing test at `tests/services/backup/validateBackup.test.ts:169-172` covers the reject side).
**Warning signs:** All exports fail import with `LEGACY_BACKUP_MESSAGE` after a schema edit.

### Pitfall 2: `milestoneId` index decision for cascade
**What goes wrong:** `deleteCrMilestoneWithCascade` tries `db.tasks.where('milestoneId').equals(id)` but V31 task index spec does not include `milestoneId` → Dexie `SchemaError`.
**Why it happens:** V16 task spec is `'id, crId, systemId, status, ...'` (`schema.ts:116`). D-01 only specifies the `crMilestones` index, not a new tasks index.
**How to avoid:** Either (a) add `milestoneId` to the tasks index in `SCHEMA_V31` (requires an index rebuild — acceptable for additive version, no data migration, C-16), or (b) keep tasks index unchanged and use `db.tasks.filter(t => t.milestoneId === milestoneId).modify(...)` inside the rw transaction. Option (b) is the smaller diff and matches `removeSubsystemFromChangeRequest`'s `.where('crId').equals(crId).filter(...)` pattern (`changeRequestRepo.ts:247-253`). Planner should pick one; research recommends (b) unless performance demands the index.
**Warning signs:** `SchemaError: KeyPath milestoneId on object store tasks is not indexed` in focused repo tests.

### Pitfall 3: v14 backup rejected by strict envelope literal
**What goes wrong:** Bumping `BACKUP_SCHEMA_VERSION` to 15 makes `BackupEnvelopeSchema` reject real v14 files.
**Why it happens:** `BackupEnvelopeSchema.schemaVersion = z.literal(BACKUP_SCHEMA_VERSION)` (`backupSchemas.ts:908`). But `validateBackupPayload` does not use that schema directly; it checks `candidate.schemaVersion > CURRENT` and `< 13` (`validateBackup.ts:149-161`). The literal is used by other consumers/tests — check `tests/validation/backupSchemas.test.ts` before editing.
**How to avoid:** Bump the constant, add a v14 fixture with no `crMilestones`, assert `validateBackupPayload` returns `valid: true` with `envelope.tables.crMilestones === []` and `schemaVersion === 15`.
**Warning signs:** Existing backup fixtures start failing with "phiên bản không tương thích".

### Pitfall 4: `exactOptionalPropertyTypes` optional writes
**What goes wrong:** `milestoneId: undefined` written into a task row fails TypeScript or leaks into backup as an explicit undefined key.
**Why it happens:** Project enables `exactOptionalPropertyTypes` (CLAUDE.md stack section); existing code uses conditional assignment (`taskRepo.ts:51-70`) and `delete` for clearing (`taskRepo.ts:100-103`).
**How to avoid:** `if (validated.milestoneId !== undefined) task.milestoneId = validated.milestoneId;` in create; `if ('milestoneId' in patch) { ... else delete updated.milestoneId; }` in update; same in `handleCrChange` (`TaskDrawer.tsx:285-296`) — add `form.setFieldValue('milestoneId', '')` when CR changes.

### Pitfall 5: CR cascade forgets milestone-linked notes
**What goes wrong:** After deleting a CR, notes linked to `crMilestone` rows keep dangling `entityId`, failing backup referential validation (D-03/D-04).
**Why it happens:** `cascadeRepo.ts:34-41` detaches notes for `[crId, ...childTaskIds]` only.
**How to avoid:** Include `milestoneIds` in that `anyOf(...)` list; add a focused test that deletes a CR with a milestone + linked note and re-validates an exported envelope.
**Warning signs:** `exportBackup` output fails `validateBackupPayload` with "Note references ... not found".

### Pitfall 6: Uncommitted work overwritten
**What goes wrong:** Phase 52 edits clobber the in-progress CR detail link/reminder changes.
**Why it happens:** `git status` shows modified `src/views/ChangeRequestDetailView.tsx` and `src/views/ItemInsightView.tsx` plus recent commits `791ce77c`, `d99a6fd1` for link editing.
**How to avoid:** Layer milestone section as *new* code next to `secondaryBlocks` (`ChangeRequestDetailView.tsx:312-340`) and new columns next to existing task columns (663-755). Do not rewrite the link modal (468-496) or `handleSaveLink` (255-284). D-10 is explicit.
**Warning signs:** `git diff` shrinks rather than grows in those files.

### Pitfall 7: Full-suite test run
**What goes wrong:** `npm test` runs > 1 hour and stalls the phase.
**Why it happens:** Project memory + D-11; `package.json` `test` script is bare `vitest run`.
**How to avoid:** Always `npx vitest run <scoped paths> --bail=1`. Existing precedent: Phase 46.1 used `--bail=1` because Vitest 5 rejects `-x`.

## Code Examples

Verified patterns from this codebase (all anchors read this session):

### Additive schema version
```typescript
// src/db/schema.ts:212-216 (existing) → V31 target shape
export const SCHEMA_V30 = {
  ...SCHEMA_V29,
} as const;

export const LATEST_SCHEMA_VERSION = 30;
// Target: export const SCHEMA_V31 = { ...SCHEMA_V30, crMilestones: 'id, crId' } as const;
//        export const LATEST_SCHEMA_VERSION = 31;
```

### Repo invariant + CR change clearing (mirror, do not duplicate logic)
```typescript
// src/db/repositories/taskRepo.ts:100-109 (existing)
if ('systemId' in patch) {
  if (validated.systemId !== undefined) updated.systemId = validated.systemId;
  else delete updated.systemId;
}
if ('crId' in patch || 'systemId' in patch) {
  await assertSystemInCrTargets(updated.crId, updated.systemId, db);
}
// Add parallel milestoneId branch + assertMilestoneMatchesCr call.
```

### Cascade note detach pattern
```typescript
// src/db/repositories/cascadeRepo.ts:34-41 (existing)
await db.notes
  .where('entityId')
  .anyOf([crId, ...childTaskIds])
  .modify((note: Note) => {
    delete note.entityType;
    delete note.entityId;
    note.updatedAt = now;
  });
// Extend anyOf with ...milestoneIds.
```

### Backup normalization pattern
```typescript
// src/services/backup/validateBackup.ts:223-230 (existing)
const legacyLinks = typeof candidate.schemaVersion === 'number' && candidate.schemaVersion < 14;
const normalizedTasks = legacyLinks ? normalizeLegacyLinks(rawTables.tasks ?? []) : rawTables.tasks ?? [];
const tasks = validateTable('tasks', BackupTaskRecordSchema, normalizedTasks);
// Add: const legacyMilestones = candidate.schemaVersion < 15 && rawTables.crMilestones === undefined;
//      const crMilestones = validateTable('crMilestones', BackupCrMilestoneRecordSchema,
//        legacyMilestones ? [] : rawTables.crMilestones ?? []);
```

### UI wrapper usage (no direct AntD)
```typescript
// src/views/ChangeRequestDetailView.tsx:2-3 (existing)
import { Button, Dropdown, Empty, Input, Modal, Popconfirm, SearchInput, Select, Space, Table, Tag, Tooltip, useMessage, useTaskMateModal, Text, Title } from '../components/ui';
import { ... } from '../components/ui/icon';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy `milestones` table + `Task.milestoneId` indexed | Removed at Dexie V16 (Phase 31.2 D-27) | Phase 31.2, `schema.ts:112-117` | New table must be named `crMilestones`; legacy backups still rejected. |
| `Backup SCHEMA_V14` unified links | v15 adds `crMilestones` | This phase | v14 stays restorable via normalization, not rejection. |
| Flat task table with Subsystem column | Add Mốc column + "Chưa gán mốc" grouping | This phase | UI stays flat; no new hierarchy tier in CR Explorer (D-06). |
| `NoteEntityType = 'task'|'cr'|'system'` | + `'crMilestone'` | This phase | 8 UI surfaces + AI enums need updates; no new note type. |

**Deprecated/outdated:**
- Legacy `milestones` / `projects` table names: must not reappear in code, backup fixtures, or new table names.
- `ItemInsightType`, `ChatScopeType`, `TaskMateEntityType` legacy project/milestone variants: remain removed per Phase 31.2 D-47/D-48; D-06 forbids widening them.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | None — Chrome verified installed at `/Applications/Google Chrome.app` this session (not launched) | D-11, Validation | UI walkthrough itself is execution-time work; app launch needs Tauri/dev server. |
| A2 | `cargo check` succeeds with warm `src-tauri/target/debug` | Environment, D-08 | cargo exists; build not run during research. If it fails due to environment, report compile-unverified. |
| A3 | Milestone delete uses `.filter()` rather than new `milestoneId` index | Pitfall 2 | If planner picks index approach, add `milestoneId` to V31 tasks index; both are valid, D-01 only constrains `crMilestones` index. |
| A4 | AI note-create/update/diagram enums should widen for `'crMilestone'` | D-05 "AI note-query enums for read parity" | D-05 explicitly names read parity; widening mutation enums is a small superset. If owner prefers read-only, leave 1281/1312/1337 unchanged — flag as question. |

All other claims are `[VERIFIED: codebase]` from files read this session or `[CITED: official Dexie docs]`.

## Open Questions (RESOLVED)

1. **[RESOLVED — widen AI write enums] Does D-05 require widening AI mutation enums, or only `query_notes` read enum?**
   - What we know: D-05 says "AI note-query enums for read parity"; `query_notes` at `aiTools.ts:455-458` has `['task','cr','system','standalone']`, while create/update/diagram tools at 1281/1312/1337/1423 have `['task','cr','system']`.
   - What's unclear: "read parity" could mean only `query_notes` + entity-name map, or all note-touching tools.
   - Recommendation: widen note write/diagram enums too (small, harmless, keeps AI able to attach a note to a milestone). Leave reminder/knowledge-link enums at 1681/1705/1725 per D-06.
   - RESOLVED (planner): widen `query_notes` and note write/diagram enums to include `'crMilestone'`; reminder/knowledge-link enums stay unchanged. Adopted in 52-02 Task 2.

2. **[RESOLVED — use `.filter()` for cascade] Should V31 add `milestoneId` to the `tasks` index?**
   - What we know: V31 spec from D-01 only defines `crMilestones: 'id, crId'`; cascade needs to find tasks by milestone.
   - What's unclear: D-01 silence on tasks index is intentional minimalism or oversight.
   - Recommendation: use `.filter()` on `db.tasks` inside the delete transaction (Pitfall 2 option b). No index rebuild, no schema surprise.
   - RESOLVED (planner): use `.filter()`; V31 tasks index stays unchanged. Adopted in 52-01 Task 3.

3. **[RESOLVED — show 0 via `?? 0`] Import preview count source for `crMilestones`**
   - What we know: `ImportPreviewModal.tsx:61-95` hardcodes 8 count queries; adding `db.crMilestones.count()` is straightforward.
   - What's unclear: whether v14 backups (count key absent) should show 0 or "—".
   - Recommendation: show 0 via existing `?? 0` fallback at line 113 — consistent with how other optional counts render.
   - RESOLVED (planner): v14 payload missing the count renders 0 via `?? 0`. Adopted in 52-03 Task 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | 24.16.0 | — |
| npm | install already done | ✓ | 11.13.0 | — |
| Dexie / Zod / Vitest | phase code | ✓ | installed per `CLAUDE.md` | — |
| cargo | D-08 Rust compile check | ✓ | 1.98.1 (warm target cache) | Report compile-unverified if build fails |
| Chrome | D-11 UI verify light/dark | ✓ | `/Applications/Google Chrome.app` | — |
| fake-indexeddb | repo/migration tests | ✓ | via `tests/setup.ts:1` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — Chrome, cargo, Node, Dexie, Zod all present.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (per `CLAUDE.md` stack) |
| Config file | `vite.config.ts:25-26` — `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']` |
| Quick run command | `npx vitest run <scoped paths> --bail=1` |
| Full suite command | **DO NOT RUN** (>1 hour; D-11 + project memory) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | V31 `crMilestones` store + `LATEST_SCHEMA_VERSION = 31` | unit | `npx vitest run tests/db/tableListParity.test.ts --bail=1` | ✅ (update assertions) |
| D-02/D-03 | `Task.milestoneId` optional; invariant on create/update/reparent; CR change clears milestone | unit | `npx vitest run tests/db/taskRepo.test.ts tests/db/reparent.test.ts --bail=1` | ✅ (extend) |
| D-04 | CR cascade includes milestones + note detach; milestone delete clears tasks/notes in one tx | unit | `npx vitest run tests/db/cascadeRepo.test.ts tests/db/cascadeRepoTimer.test.ts --bail=1` | ✅ (extend) |
| D-05 | Note union widen across schemas + AI enums | unit/component | `npx vitest run tests/validation/backupSchemas.test.ts src/components/notes/__tests__/... --bail=1` | ⚠️ check existing note test paths |
| D-07 | Backup v14→15 normalization; v14 not rejected; legacy names still rejected | unit | `npx vitest run tests/services/backup/exportBackup.test.ts tests/services/backup/restoreBackup.test.ts tests/services/backup/validateBackup.test.ts --bail=1` | ✅ (extend) |
| D-08 | TS/Rust table parity after adding `crMilestones` | static + cargo | `npx vitest run tests/db/tableListParity.test.ts --bail=1` + `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ (extend) |
| D-09 | CR Detail section + Mốc column + TaskDrawer select | component | `npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx --bail=1` | ✅ (extend; preserve uncommitted) |
| D-11 | tsc + lint + build | static | `npx tsc --noEmit`, `npm run lint`, `npm run build` | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run <scoped files> --bail=1` + `npx tsc --noEmit` (fast; matches GUARD-02).
- **Per wave merge:** scoped test set for that wave + `npm run lint`.
- **Phase gate:** all scoped tests green, tsc/lint/build/cargo check green, Chrome light/dark verified, diff reviewed — then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/db/crMilestoneMigration.test.ts` (or extend existing migration test) — V31 adds empty store, `LATEST_SCHEMA_VERSION = 31`, legacy `milestones` not resurrected.
- [ ] `tests/db/crMilestoneRepo.test.ts` — create/list by crId, invariant, delete cascade clears task + detaches note.
- [ ] Extend `tests/db/taskRepo.test.ts` — `milestoneId` invariant + CR change clears milestone.
- [ ] Extend `tests/services/backup/validateBackup.test.ts` — v14 without `crMilestones` restores with empty table; `crMilestones` key does not trip legacy gate.
- [ ] Extend `tests/db/tableListParity.test.ts` — `crMilestones` in Dexie declarations, V31 stores, TS SQLite list, Rust allowlist.
- [ ] Extend `tests/views/ChangeRequestDetailView.test.tsx` — Mốc section + EntityNotesSection mount for selected milestone (keeping existing link/reminder tests intact).

**Note:** no new test framework; only extend existing files. Do not run `npm test`.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` in config — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Single-user, no login; no new surface. |
| V3 Session Management | no | Local-only. |
| V4 Access Control | no (single user) | Repo invariant is the authorization boundary; D-06 forbids milestone chat/knowledge scope. |
| V5 Input Validation | yes | Zod: `CrMilestoneInputSchema` (name length, `targetDate` calendar date, uuid ids) + `TaskInput/UpdateSchema.milestoneId` uuid + `BackupCrMilestoneRecordSchema` strict shape. |
| V6 Cryptography | no | Existing Web Crypto backup encryption unchanged; no new secret. |

### Known Threat Patterns for stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-CR milestone attachment (tampering) | Tampering | `assertMilestoneMatchesCr` in `taskRepo` create/update/reparent + backup referential check D-03. |
| Dangling `milestoneId` after milestone delete | Tampering / DoS | Single rw transaction clears task refs + detaches notes (D-04); backup validation rejects orphans. |
| Legacy backup mislabeling | Tampering | Keep `assertNoLegacyTables` literal gate (`backupSchemas.ts:922-931`); never reuse `milestones` name. |
| Backup import replacing good local data | Tampering / DoS | Existing `validateBackupPayload` pre-write gate + `ImportPreviewModal` `RESTORE` keyword + snapshot in `replaceTables` (`restoreBackup.ts:250-258`). |
| Direct AntD import bypassing wrappers | N/A (quality) | GUARD-01 ESLint; use `../components/ui` only. |

## Sources

### Primary (HIGH confidence)
- Codebase files read this session — exact anchors throughout: `src/db/schema.ts`, `src/db/index.ts`, `src/db/repositories/{taskRepo,cascadeRepo,changeRequestRepo,noteRepo}.ts`, `src/types/{models,backup}.ts`, `src/validation/{schemas,backupSchemas}.ts`, `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts`, `src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`, `tests/db/tableListParity.test.ts`, `tests/db/schemaV16Migration.test.ts`, `src/views/ChangeRequestDetailView.tsx`, `src/components/tasks/{TaskDrawer,TaskTable}.tsx`, `src/components/notes/{NoteEditor,EntityNotesSection,QuickNotesPanel,NoteDetailModal,DocListPane}.tsx`, `src/views/NotesPopoutView.tsx`, `src/services/ai/aiTools.ts`, `src/components/settings/ImportPreviewModal.tsx`, `52-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `CLAUDE.md`, `.claude/skills/sketch-findings-task-management/SKILL.md`.
- `[VERIFIED: npm registry]` package-legitimacy seam: `dexie` OK, `zod` OK (both already installed, no postinstall). Registry versions not re-checked via `npm view` (offline-safe; versions locked by existing lockfile).
- Environment probes: `cargo 1.98.1`, `node 24.16.0`, `npm 11.13.0`, warm `src-tauri/target/debug`.

### Secondary (MEDIUM confidence)
- `[CITED: https://dexie.org/docs/Version/Version]` — per-version schema + optional upgrader function; keep previous declarations.
- `[CITED: https://dexie.org/docs/Version/Version.stores()]` — `stores()` specifies tables added/altered/deleted in a version; page defers deletion detail.
- `[CITED: https://dexie.org/docs/Version/Version.upgrade()]` — upgrade callback receives transaction; used for data modification, not required by additive-store samples.
- classify-confidence seam: context7 → MEDIUM.

### Tertiary (LOW confidence)
- None — Chrome/cargo/Node availability verified by direct probe this session.
- Whether AI note mutation enums must widen — `[ASSUMED]` from D-05 wording; see Open Question 1.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions from CLAUDE.md installed; seam verified dexie/zod OK.
- Architecture: HIGH — every pattern has a sibling implementation read this session.
- Pitfalls: HIGH for data-layer traps (anchored in code); MEDIUM for the one AI-enum scope assumption (Open Question 1).
- External Dexie docs: MEDIUM — official pages fetched but did not explicitly state store carry-forward/null-drop; codebase V16/V17 is the authoritative local proof.

**Working-tree state (D-10, verified this session):** uncommitted `M .planning/ROADMAP.md`, `M .planning/STATE.md`, `M src/views/ItemInsightView.tsx`, `M tests/views/ItemInsightView.test.tsx`. `ChangeRequestDetailView.tsx` link editing from `261128-d1m` is already committed (HEAD `791ce77c`) — still preserve its behavior. Planner must layer on top, never revert/stash.

**Research date:** 2026-11-28
**Valid until:** 2026-12-28 (stable codebase contracts; re-verify if a new Dexie version lands or backup schema bumps again).
