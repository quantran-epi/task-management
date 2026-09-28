# Phase 9: Banking IT Domain Fields & Work Types - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable tracking of Banking IT operational ownership and work classification across all work hierarchy levels (Project, Milestone, Task) with non-destructive schema migration. Delivers Ops Owner and Business Analyst (BA) tag management with nearest-ancestor inheritance, 7-value task work type classification with visual badges, Dexie schema v2 upgrade with multi-entry indexes, and full v1/v2 backup import/export compatibility.

</domain>

<decisions>
## Implementation Decisions

### Tag Input & Suggestions (Ops Owner & BA)
- **D-01:** Ant Design `Select mode="tags"` for both `opsOwners` and `businessAnalysts` inputs across `ProjectModal`, `MilestoneModal`, and `TaskDrawer`. Users can type freeform names and press Enter to create tags on the fly.
- **D-02:** Dynamic autocomplete: suggest existing names by querying distinct tags across all projects, milestones, and tasks in IndexedDB.
- **D-03:** Tag normalization: trim leading and trailing whitespace; perform case-insensitive deduplication (e.g. `NamNV` and `namnv` are treated as the same tag, preserving first-entered casing).
- **D-04:** Tag limits: maximum 50 characters per tag name, maximum 10 tags per field on any single record.
- **D-05:** Compact table display: in `TaskTable` and `ProjectTable`, render up to 2 tags with a `+N` overflow badge and Ant Design Tooltip/Popover on hover displaying the complete list.

### Inheritance & Override Semantics
- **D-06:** Nearest-ancestor inheritance resolution for tasks:
  - Task with `milestoneId`: checks Milestone first. If Milestone has tags, inherit them. If Milestone tags are empty, checks parent Project. If Project tags are empty, tag list is empty.
  - Standalone task with `projectId`: checks parent Project. If Project tags are empty, tag list is empty.
  - Standalone task without project or milestone: tag list is empty.
  - Milestone: checks parent Project.
- **D-07:** Explicit replacement override semantics: adding any tag directly to a child record completely replaces inherited tags from ancestors (not additive/union). Removing all explicit tags from a child restores inheritance.
- **D-08:** Visual inheritance styling: inherited tags render with a dashed border / ghost tag style, small link/origin indicator, and a tooltip indicating the exact origin (e.g., `Inherited from Milestone: Core Banking Upgrade` or `Inherited from Project: SHB Digital Transformation`). Explicitly assigned tags render with standard solid tag styling.
- **D-09:** Form editing inheritance placeholder: in `TaskDrawer` and `MilestoneModal`, when a record has no explicit tags, the tag `Select` field starts empty with a placeholder displaying active inherited values (e.g., `Inherited: [NamNV, LinhPT] (from Milestone)`). Entering any tag converts the record to an explicit override.

### Work Type Badges & Defaults
- **D-10:** Work type enum expanded to 7 values with dedicated colors and icons:
  1. `code`: Lập trình (Blue, `<CodeOutlined />`)
  2. `document`: Tài liệu / SRS / Thiết kế (Green, `<FileTextOutlined />`)
  3. `meeting`: Họp hành / Thảo luận (Purple, `<TeamOutlined />`)
  4. `support_testing`: Hỗ trợ SIT / UAT (Orange, `<CheckCircleOutlined />`)
  5. `investigate`: Điều tra lỗi / R&D / Phân tích (Magenta / Red, `<BugOutlined />`)
  6. `configuration`: Cấu hình hệ thống (Cyan / Geekblue, `<SettingOutlined />`)
  7. `review_code`: Review code (Gold / Yellow, `<EyeOutlined />`)
- **D-11:** Default work type: new tasks default to `'code'` across all creation paths (`QuickAddBar`, `TaskDrawer`, programmatic).
- **D-12:** Visual presentation: render as a custom `WorkTypeBadge` (Ant Design `Tag` with icon + localized label) in `TaskTable`, `TaskDrawer`, planning allocation cards, and dashboard.
- **D-13:** QuickAddBar integration: include a compact `workType` dropdown selector in `QuickAddBar` defaulted to `'code'` for instant classification during rapid task capture.

### Schema v2 Migration & v1 Compatibility
- **D-14:** Dexie Schema v2 definition: define `SCHEMA_V2` in `src/db/schema.ts` with multi-entry indexes for array fields and a single-field index for `workType`:
  - `projects`: `'id, status, deadline, *opsOwners, *businessAnalysts'`
  - `milestones`: `'id, projectId, status, deadline, *opsOwners, *businessAnalysts'`
  - `tasks`: `'id, projectId, milestoneId, status, priority, deadline, workType, *opsOwners, *businessAnalysts'`
- **D-15:** Non-destructive DB migration: in `db.version(2).stores(SCHEMA_V2).upgrade(tx => ...)`, backfill existing records:
  - Projects: set `opsOwners: []`, `businessAnalysts: []` if missing.
  - Milestones: set `opsOwners: []`, `businessAnalysts: []` if missing.
  - Tasks: set `opsOwners: []`, `businessAnalysts: []`, and `workType: 'code'` if missing.
- **D-16:** Backup import v1 backward compatibility: update `validateBackupPayload` in `src/services/backup/validateBackup.ts` to accept `schemaVersion` 1 or 2. Normalize v1 records during import so missing `opsOwners`, `businessAnalysts`, and `workType` are safely backfilled with defaults (`[]` and `'code'`).
- **D-17:** Backup export version bump: bump `CURRENT_SCHEMA_VERSION = 2` in `src/services/backup/exportBackup.ts`. Exported payloads include full v2 structures.

### Claude's Discretion
- Exact styling details of dashed border for inherited tags (border style, opacity).
- Ordering of tag suggestions in dropdown (frequency-based or alphabetical).
- Ant Design icon selection for UI buttons and tag badges.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone & Phase Scope
- `.planning/ROADMAP.md` § Phase 9 — Phase 9 goal, dependencies, and success criteria
- `.planning/REQUIREMENTS.md` § Banking IT Domain Fields (SHB) — Requirements SHB-01 through SHB-05
- `.planning/PROJECT.md` § Current Milestone: v1.1 Banking IT Enhancements & Jira Integration — Context and constraints

### Database & Schema
- `src/db/schema.ts` — Existing Dexie `SCHEMA_V1` definition
- `src/db/index.ts` — `TaskPlannerDatabase` class, version registration, and concurrency event handlers
- `src/types/models.ts` — TypeScript model definitions (`Project`, `Milestone`, `Task`)
- `src/validation/schemas.ts` — Zod input/update schemas for domain entities

### Backup & Validation
- `src/services/backup/validateBackup.ts` — Two-stage backup payload validator and referential integrity check
- `src/services/backup/exportBackup.ts` — Backup payload builder, `APP_MARKER`, and `CURRENT_SCHEMA_VERSION`
- `src/validation/backupSchemas.ts` — Zod record schemas for backup envelope validation

### UI Forms & Tables
- `src/components/tasks/TaskDrawer.tsx` — Task detail and edit drawer form
- `src/components/tasks/TaskTable.tsx` — Main task list table view
- `src/components/tasks/QuickAddBar.tsx` — Quick task creation bar
- `src/components/projects/ProjectModal.tsx` — Project creation and edit modal
- `src/components/projects/MilestoneModal.tsx` — Milestone creation and edit modal

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/shell/StatusBadge.tsx`: established pattern for rendering color-coded Ant Design tags with status text; can be adapted or cloned for `WorkTypeBadge`.
- `src/utils/focus.ts`: `createFocusRestorer()` used across all modals and drawers to maintain keyboard accessibility.
- `src/context/FormGuardContext.tsx`: `useRegisterActiveForm` must wrap the updated forms in `TaskDrawer`, `ProjectModal`, and `MilestoneModal` to prevent dirty form loss during PWA updates.
- `src/utils/filter.ts`: utility filters that can be extended in Phase 10 to query against the new multi-entry indexes.

### Established Patterns
- Zod schema validation at boundary layers (`src/validation/schemas.ts`).
- Dexie repository functions (`src/db/repositories/*.ts`) managing transactional mutations.
- `useLiveQuery` from `dexie-react-hooks` providing zero-boilerplate reactivity to IndexedDB writes.
- Ant Design 6 form controls with `Form.useWatch` for dynamic validation and reactive state.

### Integration Points
- `src/types/models.ts`: add `opsOwners?: string[]`, `businessAnalysts?: string[]` to `Project`, `Milestone`, `Task`, and `workType?: WorkType` to `Task`.
- `src/db/schema.ts`: add `SCHEMA_V2` with multi-entry `*opsOwners`, `*businessAnalysts`, and `workType` index.
- `src/db/index.ts`: register `this.version(2).stores(SCHEMA_V2).upgrade(...)`.
- `src/components/tasks/QuickAddBar.tsx`: add `workType` selector.
- `src/components/tasks/TaskDrawer.tsx`: add Ops Owner, BA tag inputs, and Work Type selector.
- `src/components/projects/ProjectModal.tsx` & `MilestoneModal.tsx`: add Ops Owner and BA tag inputs.
- `src/components/tasks/TaskTable.tsx`: add Work Type column and Ops Owner / BA tag rendering with compact `+N` popover.
- `src/services/backup/`: bump schema version to 2 and support v1 migration during import.

</code_context>

<specifics>
## Specific Ideas
- Work types expanded to 7 based on user requirements: `code`, `document`, `meeting`, `support_testing`, `investigate`, `configuration`, and `review_code`.
- Inherited tags visually indicated with dashed/ghost borders and clear origin tooltips so the user immediately knows whether a tag is defined locally or comes from a parent Milestone/Project.
- Quick task creation in `QuickAddBar` should allow selecting `workType` with a single click without having to open the full `TaskDrawer`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-banking-it-domain-fields-work-types*
*Context gathered: 2026-09-28*
