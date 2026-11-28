# Phase 52: CR Milestones — Context

**Gathered:** 2026-11-28
**Status:** Ready for planning
**Source:** Owner decisions in conversation + read-only codebase mapping

<domain>
## Phase Boundary

Reintroduce a lightweight logical grouping layer between Change Request and Task:
`CR → crMilestones → Task`. A CR may have many golive/rollout milestones. System stays
on Task (`task.systemId`, must be in `cr.targets`); milestone has no system. Milestones
can be linked to real Notes through the existing `Note.entityType`/`entityId` mechanism.
This deliberately reverses the Phase 31.2 decision that removed the old `milestones`
table; the new table MUST be named `crMilestones` so the legacy-table backup gate keeps
working. Tauri runtime only — no PWA/GitHub Pages work.
</domain>

<decisions>
## Implementation Decisions

### Data shape
- D-01: New Dexie table `crMilestones` (V31): `id: string` (crypto.randomUUID), `crId: string`, `name: string`, `targetDate?: string` (`YYYY-MM-DD`), `createdAt: string`, `updatedAt: string`. Index `id, crId`. Do NOT reuse the legacy store name `milestones`. Do NOT add a plain text note field.
- D-02: `Task.milestoneId?: string` is optional. No bulk migration of existing tasks; tasks without a milestone appear under a "Chưa gán mốc" group. Changing a task's `crId` clears `milestoneId` in the same way it clears `systemId`.
- D-03: Invariant: if `task.milestoneId` is set, the milestone must exist and `milestone.crId === task.crId`; `task.systemId` (if set) must still be in `cr.targets`. Enforce in `taskRepo` create/update and in backup referential validation.
- D-04: Deleting a milestone requires confirmation, then clears `milestoneId` on its tasks and detaches notes linked to it, inside one Dexie transaction. Tasks and notes survive. Deleting a CR still cascades `crMilestones` after its tasks.

### Notes
- D-05: Extend `NoteEntityType` with `'crMilestone'` (camelCase, distinct from legacy `'milestone'`). Keep the single optional `entityType`/`entityId` pair on `Note`. Mount `EntityNotesSection` for a selected/expanded milestone in CR Detail and add `crMilestone` to note pickers (NoteEditor, QuickNotesPanel), note list filters (DocListPane, NotesPopoutView), note detail labels, and AI note-query enums for read parity.
- D-06: Do NOT add a chat scope, notification type, knowledge-link entity type, or reminder target for milestones. Notes attached to a milestone remain plain Notes; no new type of note.

### Backup / migrations
- D-07: Bump `BACKUP_SCHEMA_VERSION` 14 → 15. Add `crMilestones` to backup envelope/count schemas, export/restore table lists, per-table validation, and import preview labels. Backups at v14 restore with `crMilestones` treated as empty — never reject them. Keep `assertNoLegacyTables` rejecting any payload containing `projects` or `milestones`.
- D-08: Update native SQLite mirror allowlists (`src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`) and their parity test. Rust is compile-unverified if cargo cannot run here; state that explicitly rather than claiming a cargo pass.

### UI
- D-09: CR Detail gains a "Mốc triển khai" section with inline create/edit/delete and an `EntityNotesSection` for the selected milestone. Task table gains a "Mốc" column; TaskDrawer gains a milestone `Select` filtered by current CR. Empty group label: "Chưa gán mốc". Use only `src/components/ui` wrappers and design tokens; no direct AntD import, no hardcoded token-valued inline styles.
- D-10: Preserve all pre-existing uncommitted work in the working tree (CR detail inline link editing from commit chain `261128-d1m`). Do not revert, stash away, or overwrite it. Layer new changes on top.

### Verification
- D-11: Run focused tests only with scoped paths (NEVER the full Vitest suite — it exceeds an hour), plus `tsc`, lint, and build. Review the final diff and verify the UI in Chrome in light and dark before declaring done. Fix every critical/warning finding; report any unavoidable residual honestly.

### Claude's Discretion
- Exact component decomposition inside CR Detail, modal/select wording, and whether the milestone section uses a compact table or collapsible cards, as long as D-09 holds.
- Test file placement and exact assertions, as long as D-03/D-04/D-07 are covered.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules
- `CLAUDE.md` — Tauri-only runtime, IndexedDB/Dexie, Ant Design through wrappers, Vietnamese discussion, GSD workflow enforcement.
- `.planning/ROADMAP.md` — Phase 31.2 lines 1586/1591 record the old milestone removal; Phase 52 reverses it intentionally.
- `.claude/skills/sketch-findings-task-management/SKILL.md` — validated UI patterns for this repo.

### Data / repo
- `src/types/models.ts` — `ChangeRequest`, `Task`, `NoteEntityType`, `Note`.
- `src/db/schema.ts`, `src/db/index.ts` — Dexie versions V1–V30; V16 dropped legacy `milestones`.
- `src/db/repositories/taskRepo.ts`, `src/db/repositories/cascadeRepo.ts`, `src/db/repositories/noteRepo.ts`.
- `src/validation/schemas.ts`, `src/validation/backupSchemas.ts`, `src/types/backup.ts`.

### UI
- `src/views/ChangeRequestDetailView.tsx`, `src/components/tasks/TaskDrawer.tsx`, `src/components/tasks/TaskTable.tsx`.
- `src/components/notes/NoteEditor.tsx`, `src/components/notes/QuickNotesPanel.tsx`, `src/components/notes/EntityNotesSection.tsx`, `src/components/notes/DocListPane.tsx`, `src/views/NotesPopoutView.tsx`.

### Backup / native mirror
- `src/services/backup/exportBackup.ts`, `src/services/backup/restoreBackup.ts`, `src/services/backup/validateBackup.ts`.
- `src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`, `tests/db/tableListParity.test.ts`.
</canonical_refs>

<specifics>
## Specific Ideas

- "Một CR có thể có nhiều mốc golive" → one CR, many `crMilestones` rows, each grouping a subset of the CR's tasks.
- `milestoneId` stays optional so existing data needs no rewrite.
- Notes on a milestone use the same Notes editor/popout as notes on a CR or task.
</specifics>

<deferred>
## Deferred Ideas

- Milestone chat scope, milestone reminders/notifications, milestone knowledge links, milestones on systems outside a CR — explicitly out of scope.
- PWA/GitHub Pages behavior — out of scope per CLAUDE.md.
</deferred>

---

*Phase: 52-cr-milestones-t-ng-m-c-tri-n-khai-gi-a-cr-v-task-milestoneid*
*Context gathered: 2026-11-28*
