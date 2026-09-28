# Phase 09: Banking IT Domain Fields & Work Types - Research

**Researched:** 2026-09-28
**Domain:** IndexedDB schema migration, multi-entry indexing, domain modeling, tag inheritance, Ant Design 6 tag inputs, categorical badge rendering, backup schema versioning
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Tag Input & Suggestions (Ops Owner & BA)
- **D-01:** Ant Design `Select mode="tags"` for both `opsOwners` and `businessAnalysts` inputs across `ProjectModal`, `MilestoneModal`, and `TaskDrawer`. Users can type freeform names and press Enter to create tags on the fly.
- **D-02:** Dynamic autocomplete: suggest existing names by querying distinct tags across all projects, milestones, and tasks in IndexedDB.
- **D-03:** Tag normalization: trim leading and trailing whitespace; perform case-insensitive deduplication (e.g. `NamNV` and `namnv` are treated as the same tag, preserving first-entered casing).
- **D-04:** Tag limits: maximum 50 characters per tag name, maximum 10 tags per field on any single record.
- **D-05:** Compact table display: in `TaskTable` and `ProjectTable`, render up to 2 tags with a `+N` overflow badge and Ant Design Tooltip/Popover on hover displaying the complete list.

#### Inheritance & Override Semantics
- **D-06:** Nearest-ancestor inheritance resolution for tasks:
  - Task with `milestoneId`: checks Milestone first. If Milestone has tags, inherit them. If Milestone tags are empty, checks parent Project. If Project tags are empty, tag list is empty.
  - Standalone task with `projectId`: checks parent Project. If Project tags are empty, tag list is empty.
  - Standalone task without project or milestone: tag list is empty.
  - Milestone: checks parent Project.
- **D-07:** Explicit replacement override semantics: adding any tag directly to a child record completely replaces inherited tags from ancestors (not additive/union). Removing all explicit tags from a child restores inheritance.
- **D-08:** Visual inheritance styling: inherited tags render with a dashed border / ghost tag style, small link/origin indicator, and a tooltip indicating the exact origin (e.g., `Inherited from Milestone: Core Banking Upgrade` or `Inherited from Project: SHB Digital Transformation`). Explicitly assigned tags render with standard solid tag styling.
- **D-09:** Form editing inheritance placeholder: in `TaskDrawer` and `MilestoneModal`, when a record has no explicit tags, the tag `Select` field starts empty with a placeholder displaying active inherited values (e.g., `Inherited: [NamNV, LinhPT] (from Milestone)`). Entering any tag converts the record to an explicit override.

#### Work Type Badges & Defaults
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

#### Schema v2 Migration & v1 Compatibility
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SHB-01** | User can add and edit multiple Ops Owner names (`opsOwners: string[]`) on Project, Milestone, and Task. | Ant Design `Select mode="tags"` input in `ProjectModal`, `MilestoneModal`, and `TaskDrawer`. Zod schemas and TypeScript models updated with string array fields, 10-tag limit, 50-char length validation, and case-insensitive normalization. |
| **SHB-02** | User can add and edit multiple Business Analyst names (`businessAnalysts: string[]`) on Project, Milestone, and Task. | Identical multi-tag pattern as SHB-01 for Business Analysts. Repositories update Dexie tables with array fields. |
| **SHB-03** | Tasks and milestones visually display inherited Ops Owner and BA tags from parent project/milestone when not overridden. | Nearest-ancestor resolution engine (`resolveInheritedTags`) checks Milestone then Project. Visual rendering distinguishes inherited tags via dashed border (`1px dashed token.colorBorder`), opacity `0.75`, `<LinkOutlined />` icon, and origin tooltip. |
| **SHB-04** | User can assign a Work Type (`workType: 'code' \| 'document' \| 'meeting' \| 'support_testing' \| 'investigate' \| 'configuration' \| 'review_code'`) to each Task with visual badge and filter support. | Dedicated `WorkTypeBadge` component pairing Ant Design preset categorical colors, icons, and localized Vietnamese labels (triple encoding). Selector integrated into `TaskDrawer` and `QuickAddBar` defaulted to `'code'`. Column added to `TaskTable`. |
| **SHB-05** | Database upgrades to schema v2 with multi-entry indexes for `*opsOwners`, `*businessAnalysts`, and index for `workType`, preserving v1 data and backup compatibility. | Dexie `version(2).stores(SCHEMA_V2).upgrade()` backfills empty arrays and default `'code'`. Two-stage backup validator accepts `schemaVersion` 1 and 2, normalizing v1 backup payloads to v2 structures on restore. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Actionable directives extracted from `CLAUDE.md`:
- **Local offline-first behavior**: 100% local application behavior — no application server. All domain operations run in the browser. [VERIFIED: CLAUDE.md:12]
- **Ant Design UI**: Fixed UI decision is Ant Design 6 (React 19). Bundle includes types; do NOT install `@types/antd`. No third-party UI libraries (Tailwind, shadcn, MUI forbidden). [VERIFIED: CLAUDE.md:27, 185]
- **IndexedDB via Dexie**: Working data store is IndexedDB wrapped by Dexie 4.4.6 with `dexie-react-hooks` (`useLiveQuery`). Migrations must use `db.version(n).stores(...).upgrade(...)`. Multi-table changes wrapped in Dexie transactions. [VERIFIED: CLAUDE.md:28-29, 109, 110]
- **Identifiers**: Stable client-generated RFC 4122 v4 UUIDs using browser native `crypto.randomUUID()`. Never install `uuid` npm package. [VERIFIED: CLAUDE.md:18, 107, 186]
- **Dates**: Persist calendar days as `YYYY-MM-DD` strings, never `Date` objects, to eliminate timezone drift. [VERIFIED: CLAUDE.md:108]
- **Strict TypeScript**: Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Preserved in repositories by using conditional assignment rather than spreading undefined values. [VERIFIED: CLAUDE.md:32, 59]
- **Data safety & Backup format**: Backup import must validate format with Zod and avoid replacing good local data without explicit confirmation. Pre-import snapshot required. [VERIFIED: CLAUDE.md:17, 114]
- **Zero new dependencies**: Zero additional dependencies for milestone v1.1. Native browser and installed libraries only. [VERIFIED: CLAUDE.md:37-53; STATE.md:61]

---

## Summary

Phase 09 establishes the Banking IT domain capabilities in the Personal Task & Workload Planner, addressing requirements **SHB-01** through **SHB-05**. In enterprise banking IT workflows (such as SHB), tasks and projects require clear operational accountability (Ops Owners for deployment and production support) and business alignment (Business Analysts for requirements and acceptance). Furthermore, work must be classified into distinct operational buckets (`code`, `document`, `meeting`, `support_testing`, `investigate`, `configuration`, `review_code`) to understand workload distribution.

To support this cleanly without performance overhead or data loss, the data layer advances from Dexie Schema v1 to v2. Dexie's multi-entry indexes (`*opsOwners`, `*businessAnalysts`) allow indexing individual array elements, enabling instantaneous distinct tag retrieval for autocomplete and high-performance multi-criteria querying in Phase 10. The migration function non-destructively backfills missing fields on existing records. Backup import/export is updated to accept both schema versions 1 and 2, normalizing v1 backups upon import with safe defaults.

In the user interface, Ant Design 6's `Select mode="tags"` is embedded into `ProjectModal`, `MilestoneModal`, and `TaskDrawer` with client-side trimming, deduplication, and limit enforcement (max 10 tags, 50 chars each). Inheritance is evaluated using nearest-ancestor semantics ($O(1)$ in-memory lookup during render), displaying inherited tags with a distinct dashed border (`1px dashed token.colorBorder`), `<LinkOutlined />` icon, and origin tooltip. Tasks receive a default work type of `'code'` with quick selection in `QuickAddBar` and rich triple-encoded visual presentation via `WorkTypeBadge`.

**Primary recommendation:** Define `SCHEMA_V2` in `src/db/schema.ts`, implement atomic backfill inside `db.version(2).upgrade()`, create a zero-dependency `resolveInheritedTags` domain helper, and build `WorkTypeBadge` using Ant Design preset categorical colors matching `09-UI-SPEC.md`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ops Owner & BA persistence | Browser Storage (IndexedDB/Dexie) | Domain Model Types | Persistent storage of string arrays across Project, Milestone, and Task entities. |
| Multi-entry indexing | IndexedDB Engine (Dexie v2 schema) | — | Multi-entry indexes (`*opsOwners`, `*businessAnalysts`) enable IndexedDB to index individual string values inside arrays for distinct key lookups and filtering. |
| Distinct tag autocomplete | Database Index (`table.orderBy().uniqueKeys()`) | Client React state | Directly scans IndexedDB multi-entry index keys without deserializing entity records. |
| Tag input & normalization | Client Form (`Select mode="tags"`) | Zod Validation Layer | Freeform input on Enter; trims whitespace, deduplicates case-insensitively, enforces max 10 tags and 50 characters. |
| Nearest-ancestor inheritance | Client Domain Helper (`resolveInheritedTags`) | Memoized Table Maps | Pure functional evaluation: Task checks Milestone then Project; Milestone checks Project. Evaluates in $O(1)$ time during render without DB round-trips. |
| Work type classification | Client Domain Model (`WorkType` enum) | Database Index (`workType`) | 7-value discrete classification defaulted to `'code'` on creation; single-field index supports fast filtering. |
| Work type visualization | Client UI Component (`WorkTypeBadge`) | Ant Design ConfigProvider | Triple encoding: Ant preset color + icon + Vietnamese label. Reads theme tokens; exempt from 10% accent rule as categorical palette. |
| Schema v2 upgrade | Dexie Migration Engine (`db.version(2).upgrade`) | — | Executes non-destructively on database boot; modifies records in-place without clearing user data. |
| Backup v1/v2 compatibility | Backup Service (`validateBackup`, `exportBackup`) | Zod Backup Record Schemas | Exports schemaVersion 2; accepts schemaVersion 1 and 2; normalizes v1 payloads by filling missing v2 fields. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dexie` | 4.4.6 | IndexedDB storage, schema v2, multi-entry indexes | Established project persistence standard; native support for `version(n).stores().upgrade()` and `*arrayField` multi-entry indexes. [VERIFIED: CLAUDE.md:28] |
| `antd` | 6.6.5 | Component system (`Select`, `Tag`, `Tooltip`, `Popover`, `Form`, `Dropdown`, `Badge`) | Established UI standard. Bundles TypeScript definitions. Native `Select mode="tags"` handles freeform tag creation without extra libraries. [VERIFIED: CLAUDE.md:27] |
| `@ant-design/icons` | 6.3.4 | Iconography for work types and inheritance link glyph | Established icon set. Icons imported individually to preserve tree-shaking. [VERIFIED: CLAUDE.md:43] |
| `zod` | 4.6.5 | Runtime schema validation at form and backup boundaries | Established boundary validation library; validates string arrays, tag limits, and enum types. [VERIFIED: CLAUDE.md:39] |
| `react` & `react-dom` | 19.3.0 | Application view layer | Core React framework. [VERIFIED: CLAUDE.md:25] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dexie-react-hooks` | 4.4.0 | Reactive live queries (`useLiveQuery`) | Reactively re-renders when tasks, projects, or milestones update. [VERIFIED: CLAUDE.md:29] |
| `dayjs` | 1.11.23 | Date formatting / parsing | Used for deadline display and date comparisons. [VERIFIED: CLAUDE.md:40] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie multi-entry index (`*field`) | Comma-separated string index | Comma-separated strings require regex or full table scans for matching; multi-entry index provides $O(\log N)$ native index lookups for individual tags. |
| Pure in-memory inheritance calculation | Denormalized ancestor tags stored on Task | Storing ancestor tags on child records requires complex cascading updates whenever a parent project or milestone changes; dynamic evaluation is $O(1)$ in-memory and always fresh. |
| External tag input library | Ant Design `Select mode="tags"` | Adding external tag input package violates the "zero new dependencies" constraint and creates UI styling inconsistency. |

**Installation:**
No installation required. All dependencies are already installed in `package.json`.

---

## Package Legitimacy Audit

> **Required** whenever external packages are installed. Phase 09 installs **zero** new external packages.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `antd` | npm | 9+ yrs | ~1.5M/wk | github.com/ant-design/ant-design | [OK] | Already installed (6.6.5) |
| `@ant-design/icons` | npm | 6+ yrs | ~1.2M/wk | github.com/ant-design/ant-design-icons | [OK] | Already installed (6.3.4) |
| `dexie` | npm | 10+ yrs | ~800k/wk | github.com/dexie/Dexie.js | [OK] | Already installed (4.4.6) |
| `zod` | npm | 4+ yrs | ~15M/wk | github.com/colinhacks/zod | [OK] | Already installed (4.6.5) |

**Packages removed due to [SLOP] verdict:** None.
**Packages flagged as suspicious [SUS]:** None.

---

## Architecture Patterns

### System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                 USER INTERFACE                                    |
|                                                                                   |
|  [QuickAddBar]          [TaskDrawer]         [ProjectModal]     [MilestoneModal]  |
|  - workType select      - opsOwners (tags)   - opsOwners (tags) - opsOwners (tags)|
|  (default: 'code')      - BAs (tags)         - BAs (tags)       - BAs (tags)      |
|                         - workType (select)                                       |
+------------------------------+---------------------+-------------------+----------+
                               |                     |                   |
                               v                     v                   v
+-----------------------------------------------------------------------------------+
|                           INPUT VALIDATION & NORMALIZATION                        |
|                                                                                   |
|  normalizeTags(): trim, case-insensitive dedup, max 10 tags, max 50 chars        |
|  Zod Schemas: ProjectInputSchema, MilestoneInputSchema, TaskInputSchema           |
+----------------------------------------------------+------------------------------+
                                                     |
                                                     v
+-----------------------------------------------------------------------------------+
|                        TRANSACTIONAL REPOSITORIES (v2)                            |
|                                                                                   |
|  createTask() / updateTask()       createProject() / updateProject()              |
|  createMilestone() / updateMilestone()                                            |
|  * exactOptionalPropertyTypes compliance: conditional assignment                  |
+----------------------------------------------------+------------------------------+
                                                     |
                                                     v
+-----------------------------------------------------------------------------------+
|                     INDEXEDDB / DEXIE DATABASE LAYER (v2)                         |
|                                                                                   |
|  projects:   id, status, deadline, *opsOwners, *businessAnalysts                  |
|  milestones: id, projectId, status, deadline, *opsOwners, *businessAnalysts      |
|  tasks:      id, projectId, milestoneId, status, priority, deadline,              |
|              workType, *opsOwners, *businessAnalysts                              |
|                                                                                   |
|  db.version(2).upgrade(tx): Non-destructive backfill for existing records         |
|  getDistinctOpsOwners() / getDistinctBAs(): table.orderBy().uniqueKeys()          |
+----------------------------------------------------+------------------------------+
                                                     |
                                                     v
+-----------------------------------------------------------------------------------+
|                      INHERITANCE & VISUAL PRESENTATION                            |
|                                                                                   |
|  resolveInheritedTags(field, task, { project, milestone })                        |
|    - Direct tags present? -> source: 'direct' (solid tag)                         |
|    - Milestone tags present? -> source: 'milestone' (dashed tag + tooltip)        |
|    - Project tags present? -> source: 'project' (dashed tag + tooltip)            |
|    - Neither? -> source: 'none' (empty/dash)                                      |
|                                                                                   |
|  WorkTypeBadge: 7 categorical colors + icons + localized labels                   |
|  Compact Tag Rendering: 2 tags + (+N) Popover for overflow                        |
+-----------------------------------------------------------------------------------+
```

### Recommended Project Structure
```
src/
├── types/
│   ├── models.ts              # Extended: WorkType union, opsOwners?, businessAnalysts?, workType?
│   └── backup.ts              # BackupTableData matches updated models
├── db/
│   ├── schema.ts              # Added: SCHEMA_V2 with multi-entry and workType indexes
│   ├── index.ts               # Added: db.version(2).stores(SCHEMA_V2).upgrade(...)
│   └── repositories/
│       ├── taskRepo.ts        # Updated: handles opsOwners, businessAnalysts, workType
│       ├── projectRepo.ts     # Updated: handles opsOwners, businessAnalysts
│       ├── milestoneRepo.ts   # Updated: handles opsOwners, businessAnalysts
│       └── tagRepo.ts         # NEW: getDistinctOpsOwners, getDistinctBusinessAnalysts
├── domain/
│   └── inheritance.ts         # NEW: resolveInheritedTags pure functional engine
├── validation/
│   ├── schemas.ts             # Updated: normalizeTags, tagListSchema, WORK_TYPES
│   └── backupSchemas.ts       # Updated: optional v2 fields across projects, milestones, tasks
├── services/
│   └── backup/
│       ├── exportBackup.ts    # Updated: CURRENT_SCHEMA_VERSION = 2
│       ├── validateBackup.ts  # Updated: accepts schemaVersion 1 & 2, normalizes v1 records
│       └── restoreBackup.ts   # Seamless restore of normalized v1/v2 records
└── components/
    ├── common/
    │   ├── TagSelect.tsx      # NEW/Shared: Select mode="tags" with autocomplete & inheritance placeholder
    │   └── TagListDisplay.tsx # NEW/Shared: Compact 2-tag display with (+N) popover and dashed inherited tags
    ├── tasks/
    │   ├── WorkTypeBadge.tsx  # NEW: Ant Design Tag with icon + categorical color + VN label
    │   ├── QuickAddBar.tsx    # Updated: includes workType compact selector
    │   ├── TaskDrawer.tsx     # Updated: opsOwners, businessAnalysts, workType fields
    │   └── TaskTable.tsx      # Updated: Work Type column and Ops/BA tag column with overflow
    └── projects/
        ├── ProjectModal.tsx   # Updated: opsOwners, businessAnalysts tag inputs
        ├── MilestoneModal.tsx # Updated: opsOwners, businessAnalysts tag inputs with inheritance placeholder
        └── ProjectTable.tsx   # Updated: compact Ops Owner / BA tag rendering
```

---

### In-Repo Discrete Values (Verbatim Source Quotes)

The following discrete values are quoted verbatim from the existing source files opened with `Read` this session:

#### 1. Existing Dexie Schema V1
`[VERIFIED: src/db/schema.ts:1-10]`
```typescript
export const SCHEMA_V1 = {
  projects: 'id, status, deadline',
  milestones: 'id, projectId, status, deadline',
  tasks: 'id, projectId, milestoneId, status, priority, deadline',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;
```

#### 2. Existing Statuses and Priorities
`[VERIFIED: src/validation/schemas.ts:11-39]`
```typescript
export const PROJECT_STATUSES: [ProjectStatus, ...ProjectStatus[]] = [
  'Open',
  'In Progress',
  'Done',
  'Cancelled',
];

export const MILESTONE_STATUSES: [MilestoneStatus, ...MilestoneStatus[]] = [
  'Open',
  'In Progress',
  'Done',
  'Cancelled',
];

export const TASK_STATUSES: [TaskStatus, ...TaskStatus[]] = [
  'Open',
  'In Progress',
  'Resolved',
  'In Review',
  'Done',
  'Cancelled',
];

export const TASK_PRIORITIES: [TaskPriority, ...TaskPriority[]] = [
  'Low',
  'Medium',
  'High',
  'Urgent',
];
```

#### 3. Existing Backup Constants
`[VERIFIED: src/services/backup/exportBackup.ts:5-6]`
```typescript
export const APP_MARKER = 'personal-task-planner' as const;
export const CURRENT_SCHEMA_VERSION = 1 as const;
```

#### 4. Existing Task Model Interface
`[VERIFIED: src/types/models.ts:29-46]`
```typescript
export interface Task {
  id: string; // RFC 4122 v4 UUID
  projectId?: string; // Optional reference to Project.id
  milestoneId?: string; // Optional reference to Milestone.id
  name: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  actualStartDate?: string; // YYYY-MM-DD
  actualEndDate?: string; // YYYY-MM-DD
  status: TaskStatus;
  progress: number; // Integer percentage 0 - 100
  priority: TaskPriority;
  estimateMinutes: number; // Non-negative integer minutes
  documentLinks?: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

### Pattern 1: Multi-Entry Indexed Dexie Schema v2 & Atomic Upgrade

**What:** Dexie supports multi-entry indexing for array fields by prefixing the index key with `*`. During upgrade from version 1 to version 2, Dexie executes the upgrade callback in a transaction, modifying existing records to ensure schema consistency.
**When to use:** In `src/db/schema.ts` and `src/db/index.ts`.

```typescript
// Source: Dexie.js Official Documentation (dexie.org/docs/MultiEntry-Index)
export const SCHEMA_V2 = {
  projects: 'id, status, deadline, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

// In TaskPlannerDatabase constructor:
this.version(1).stores(SCHEMA_V1);
this.version(2)
  .stores(SCHEMA_V2)
  .upgrade(async (tx) => {
    // Non-destructive backfill of existing records
    await tx.table('projects').toCollection().modify((proj) => {
      if (!proj.opsOwners) proj.opsOwners = [];
      if (!proj.businessAnalysts) proj.businessAnalysts = [];
    });
    await tx.table('milestones').toCollection().modify((ms) => {
      if (!ms.opsOwners) ms.opsOwners = [];
      if (!ms.businessAnalysts) ms.businessAnalysts = [];
    });
    await tx.table('tasks').toCollection().modify((task) => {
      if (!task.opsOwners) task.opsOwners = [];
      if (!task.businessAnalysts) task.businessAnalysts = [];
      if (!task.workType) task.workType = 'code';
    });
  });
```

---

### Pattern 2: Nearest-Ancestor Inheritance Resolution

**What:** Pure functional helper that checks an entity for explicit tags; if empty, inspects the nearest ancestor (Milestone first, then Project).
**When to use:** In `TaskTable`, `TaskDrawer`, `MilestoneModal`, and workload views.

```typescript
export interface TagInheritanceResult {
  tags: string[];
  source: 'direct' | 'milestone' | 'project' | 'none';
  originName?: string;
}

export function resolveInheritedTags(
  field: 'opsOwners' | 'businessAnalysts',
  item: { opsOwners?: string[]; businessAnalysts?: string[]; milestoneId?: string; projectId?: string },
  ancestors: {
    project?: { name: string; opsOwners?: string[]; businessAnalysts?: string[] };
    milestone?: { name: string; projectId?: string; opsOwners?: string[]; businessAnalysts?: string[] };
  }
): TagInheritanceResult {
  const direct = item[field];
  if (direct && direct.length > 0) {
    return { tags: direct, source: 'direct' };
  }

  if (ancestors.milestone) {
    const msTags = ancestors.milestone[field];
    if (msTags && msTags.length > 0) {
      return { tags: msTags, source: 'milestone', originName: ancestors.milestone.name };
    }
  }

  if (ancestors.project) {
    const projTags = ancestors.project[field];
    if (projTags && projTags.length > 0) {
      return { tags: projTags, source: 'project', originName: ancestors.project.name };
    }
  }

  return { tags: [], source: 'none' };
}
```

---

### Pattern 3: WorkTypeBadge Triple Encoding

**What:** Custom badge encoding work type with Ant Design preset categorical color, icon, and Vietnamese label.
**When to use:** In `TaskTable`, `TaskDrawer`, `QuickAddBar`, and planning views.

```typescript
import React from 'react';
import { Tag } from 'antd';
import {
  CodeOutlined,
  FileTextOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  BugOutlined,
  SettingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { WorkType } from '../../types/models';

export const WORK_TYPE_CONFIG: Record<
  WorkType,
  { label: string; color: string; icon: React.ReactElement }
> = {
  code: { label: 'Lập trình', color: 'blue', icon: <CodeOutlined /> },
  document: { label: 'Tài liệu', color: 'green', icon: <FileTextOutlined /> },
  meeting: { label: 'Họp hành', color: 'purple', icon: <TeamOutlined /> },
  support_testing: { label: 'Hỗ trợ SIT / UAT', color: 'orange', icon: <CheckCircleOutlined /> },
  investigate: { label: 'Điều tra lỗi / R&D', color: 'magenta', icon: <BugOutlined /> },
  configuration: { label: 'Cấu hình hệ thống', color: 'cyan', icon: <SettingOutlined /> },
  review_code: { label: 'Review code', color: 'gold', icon: <EyeOutlined /> },
};

export interface WorkTypeBadgeProps {
  workType?: WorkType;
  style?: React.CSSProperties;
}

export const WorkTypeBadge: React.FC<WorkTypeBadgeProps> = ({ workType = 'code', style }) => {
  const config = WORK_TYPE_CONFIG[workType] ?? WORK_TYPE_CONFIG.code;
  return (
    <Tag
      color={config.color}
      icon={config.icon}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        margin: 0,
        fontWeight: 500,
        ...style,
      }}
    >
      {config.label}
    </Tag>
  );
};
```

---

### Pattern 4: Strict `exactOptionalPropertyTypes` Repository Mutation

**What:** When updating records in Dexie repositories under `exactOptionalPropertyTypes: true`, avoid assigning `undefined` to optional properties. Use conditional assignment.
**When to use:** In `createTask`, `updateTask`, `createProject`, `updateProject`, `createMilestone`, `updateMilestone`.

```typescript
// Correct: exactOptionalPropertyTypes safe pattern
const task: Task = {
  id: generateId(),
  name: validated.name,
  status: validated.status,
  progress: validated.progress,
  priority: validated.priority,
  estimateMinutes: validated.estimateMinutes,
  workType: validated.workType ?? 'code',
  createdAt: now,
  updatedAt: now,
};

if (validated.opsOwners !== undefined) task.opsOwners = validated.opsOwners;
if (validated.businessAnalysts !== undefined) task.businessAnalysts = validated.businessAnalysts;
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag input UI | Custom input with chips and keydown listeners | Ant Design `<Select mode="tags" />` | Native support for enter-to-add, token removal, backspace deletion, accessible dropdown focus, and max-tag handling. |
| Multi-entry indexing | Comma-separated strings or custom join tables | Dexie `*fieldName` index | Native IndexedDB multi-entry index creates individual index entries per array element with index-level uniqueness scans (`table.orderBy().uniqueKeys()`). |
| Database migration | Custom manual table copy script | Dexie `db.version(2).stores().upgrade()` | Guaranteed atomic transaction managed by the browser; rolls back on failure; blocks conflicting tabs cleanly. |
| Categorical tag colors | Random hex generator or CSS inline styles | Ant Design preset color names (`blue`, `green`, `purple`, `orange`, `magenta`, `cyan`, `gold`) | Preset names automatically adapt between Ant Design light and dark algorithms without contrast failures. |
| Tag deduplication | Complex regex or lodash dependency | Native `Set` with `.toLowerCase()` comparison | 5 lines of native TypeScript; zero dependencies; preserves casing of first occurrence. |

---

## Common Pitfalls

### Pitfall 1: Breaking `exactOptionalPropertyTypes` with Undefined Properties
**What goes wrong:** Setting `{ opsOwners: undefined }` on a model causes TypeScript compiler errors when `exactOptionalPropertyTypes` is enabled in `tsconfig.json`.
**Why it happens:** In strict TypeScript, optional properties (`field?: T`) cannot be explicitly assigned `undefined` unless declared as `field?: T | undefined`.
**How to avoid:** Use `if (validated.opsOwners !== undefined) entity.opsOwners = validated.opsOwners;` instead of spreading `{ ...existing, opsOwners: validated.opsOwners }`.

### Pitfall 2: Dexie Multi-Entry Index Star Prefix Omission
**What goes wrong:** Declaring `opsOwners` instead of `*opsOwners` creates an index on the entire array object rather than its individual string elements.
**Why it happens:** Omitting `*` indexes the array by reference or compound value, making single-tag queries (`equals('NamNV')`) fail completely.
**How to avoid:** Always prefix array indexes with an asterisk: `'*opsOwners, *businessAnalysts'`.

### Pitfall 3: Additive vs. Replacement Override Semantics
**What goes wrong:** Child record tags are merged with ancestor tags instead of replacing them.
**Why it happens:** Developers assume inheritance is a union operation.
**How to avoid:** Adhere strictly to **D-07**: an explicit tag on a child completely overrides/replaces parent tags. Removing all tags restores inheritance.

### Pitfall 4: Backup Import Schema Version Rejection
**What goes wrong:** Users importing existing v1 backups receive a validation error: "Phiên bản sơ đồ (1) không tương thích".
**Why it happens:** The backup validator was previously written with `candidate.schemaVersion > CURRENT_SCHEMA_VERSION`. If not updated to accept `schemaVersion: 1`, v1 backups will be rejected.
**How to avoid:** Allow `schemaVersion === 1 || schemaVersion === 2` in `validateBackupPayload`, and backfill missing v2 fields (`opsOwners: []`, `businessAnalysts: []`, `workType: 'code'`) during validation/restore.

### Pitfall 5: Hardcoded Colors in Dark Mode
**What goes wrong:** Using hardcoded hex values for tags or borders causes low contrast or unreadable text when dark mode is enabled.
**Why it happens:** Forgetting that `src/App.tsx` dynamically switches between `defaultAlgorithm` and `darkAlgorithm`.
**How to avoid:** Use Ant Design preset color names for `WorkTypeBadge` and read `token.colorBorder` / `token.colorTextTertiary` from `theme.useToken()` for inherited tag dashed borders.

---

## Code Examples

### 1. Tag Normalization Function
```typescript
// Pure native helper, zero dependencies
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(trimmed);
    }
  }

  return normalized;
}
```

### 2. Autocomplete Distinct Tags Query
```typescript
import { db as defaultDb, type TaskPlannerDatabase } from '../index';

export async function getDistinctOpsOwners(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  const [projKeys, msKeys, taskKeys] = await Promise.all([
    db.projects.orderBy('opsOwners').uniqueKeys(),
    db.milestones.orderBy('opsOwners').uniqueKeys(),
    db.tasks.orderBy('opsOwners').uniqueKeys(),
  ]);

  const all = [...projKeys, ...msKeys, ...taskKeys] as string[];
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}
```

### 3. Inherited Tag Renderer with Dashed Style & Tooltip
```typescript
import React from 'react';
import { Tag, Tooltip, theme } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import type { TagInheritanceResult } from '../../domain/inheritance';

interface InheritedTagProps {
  name: string;
  inheritance: TagInheritanceResult;
}

export const InheritedTag: React.FC<InheritedTagProps> = ({ name, inheritance }) => {
  const { token } = theme.useToken();
  const isInherited = inheritance.source !== 'direct' && inheritance.source !== 'none';

  if (!isInherited) {
    return <Tag style={{ margin: 0 }}>{name}</Tag>;
  }

  const tooltipTitle =
    inheritance.source === 'milestone'
      ? `Kế thừa từ Milestone: ${inheritance.originName ?? ''}`
      : `Kế thừa từ Dự án: ${inheritance.originName ?? ''}`;

  return (
    <Tooltip title={tooltipTitle} trigger={['hover', 'focus']}>
      <Tag
        style={{
          margin: 0,
          borderStyle: 'dashed',
          borderColor: token.colorBorder,
          opacity: 0.75,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <LinkOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
        <span>{name}</span>
      </Tag>
    </Tooltip>
  );
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dexie Schema v1 without domain ownership | Dexie Schema v2 with `*opsOwners`, `*businessAnalysts`, `workType` | Phase 09 (Milestone v1.1) | Enables Banking IT operational ownership and work classification across all work hierarchy levels. |
| Hardcoded tags or freeform text fields | Ant Design `Select mode="tags"` with dynamic multi-entry autocomplete | Phase 09 | Autocompletes across existing DB entities while allowing on-the-fly tag creation on Enter. |
| Single-table task attributes | Nearest-ancestor inheritance (Task -> Milestone -> Project) | Phase 09 | Eliminates redundant tag re-entry across related tasks; changes at parent level propagate automatically. |
| Uncategorized tasks | 7-value discrete `WorkType` enum with triple-encoded `WorkTypeBadge` | Phase 09 | Clear visual distinction in task lists, planning ledgers, and future analytics. |
| Backup schema version 1 | Backup schema version 2 with backward-compatible v1 migration | Phase 09 | Preserves existing user backup files while supporting new fields in exports. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Autocomplete distinct tag ordering by alphabetical `localeCompare` satisfies user needs. | Architecture Patterns | Low — ordering can be adjusted to frequency-based if requested. [ASSUMED] |
| A2 | Dashed border styling (`1px dashed token.colorBorder`) with `0.75` opacity provides sufficient visual distinction for inherited tags. | Architecture Patterns | Low — styling detail left to Claude's discretion in CONTEXT.md. [ASSUMED] |

---

## Open Questions

1. **Tag autocomplete ordering: alphabetical vs. frequency-based**
   - What we know: CONTEXT.md marks tag ordering as Claude's discretion.
   - What's unclear: In small personal datasets (1-50 tags), frequency differences are negligible, whereas alphabetical sorting makes finding specific names predictable.
   - Recommendation: Default to alphabetical sorting using `localeCompare()`; if a future phase introduces dozens of tags, frequency sorting can be layered on.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & test runner | ✓ | v20.17.0 (x64) | Meets build requirements; Node 24 LTS recommended in CLAUDE.md. |
| npm | Package management | ✓ | 10.8.2 | Standard package manager. |
| Vite | Dev server & bundle | ✓ | 8.3.1 | Core build tooling. |
| IndexedDB | Runtime persistence | ✓ | Native Browser / fake-indexeddb 6.2.5 | Functional in browser and test environment. |
| Web Crypto API | UUID generation | ✓ | Native `crypto.randomUUID()` | Functional in browser and Node 20+. |
| Vitest | Unit / integration tests | ✓ | 5.0.2 | Test runner. (Note: Node 20.17 x64 requires `@rolldown/binding-darwin-x64` installed for local execution; Node >= 20.19.0 / Node 22+ runs without ESM loader issues). |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 with `@testing-library/react` 16.3.3 and `fake-indexeddb` 6.2.5 |
| Config file | `vite.config.ts` (`test.environment: 'jsdom'`, `test.setupFiles: ['./tests/setup.ts']`) |
| Quick run command | `npx vitest run tests/schema.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **SHB-01** | User can add/edit `opsOwners` on Project, Milestone, and Task with tag validation (max 10, max 50 chars, trimmed, deduplicated) | Unit / Integration | `npx vitest run tests/db/repos.test.ts` | ❌ Wave 0 gap (needs update for opsOwners) |
| **SHB-02** | User can add/edit `businessAnalysts` on Project, Milestone, and Task | Unit / Integration | `npx vitest run tests/db/repos.test.ts` | ❌ Wave 0 gap (needs update for BAs) |
| **SHB-03** | Nearest-ancestor inheritance resolves Milestone then Project tags when child tags are empty; visual dashed styling and origin tooltip | Unit / Component | `npx vitest run tests/domain/inheritance.test.ts` & `npx vitest run tests/components/TaskTable.test.tsx` | ❌ Wave 0 gap (new test file for inheritance) |
| **SHB-04** | Tasks default to `workType: 'code'`; user can assign any of 7 work types; `WorkTypeBadge` renders triple-encoded label/icon/color | Unit / Component | `npx vitest run tests/components/WorkTypeBadge.test.tsx` | ❌ Wave 0 gap (new test file for WorkTypeBadge) |
| **SHB-05** | Dexie schema upgrades to v2 with multi-entry indexes `*opsOwners`, `*businessAnalysts`, and `workType`; backfills existing data; backup export uses schemaVersion 2; import supports v1 migration | Integration | `npx vitest run tests/db/schemaV2Migration.test.ts` & `npx vitest run tests/services/backup/validateBackup.test.ts` | ❌ Wave 0 gap (new migration test file) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/domain/inheritance.test.ts` (or relevant test target)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/domain/inheritance.test.ts` — covers SHB-03 inheritance resolution logic across task, milestone, and project combinations
- [ ] `tests/components/WorkTypeBadge.test.tsx` — covers SHB-04 triple encoding, color mappings, and icons for all 7 work types
- [ ] `tests/db/schemaV2Migration.test.ts` — covers SHB-05 Dexie v1 -> v2 upgrade, multi-entry indexing, and record backfilling
- [ ] `tests/services/backup/v2Compatibility.test.ts` — covers SHB-05 backup export schemaVersion 2 and backward-compatible v1 payload import/backfill

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Zod schemas validate tag length (≤50 chars), tag count (≤10 tags), and enum bounds (`WorkType` in 7 declared values). XSS prevention via React DOM text node rendering (no `dangerouslySetInnerHTML`). |
| V8 Data Protection | Yes | IndexedDB remains origin-scoped. Backup files encrypted via Web Crypto (AES-GCM-256) per established Phase 8 security architecture. |
| V13 API and Web Service | No | App is 100% offline-first local behavior with no application server. |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded tag creation causing IndexedDB storage exhaustion | Denial of Service | Enforce maximum 10 tags per field and 50 characters per tag name in Zod input schemas. [VERIFIED: CONTEXT.md:20] |
| Malicious script injection via tag names | Tampering | Ant Design `Select` and `Tag` components render strings as React text nodes, escaping HTML entities automatically. |
| Data corruption during schema migration | Tampering | Dexie executes `.upgrade(tx)` inside an atomic IndexedDB transaction; failure automatically rolls back database state. [VERIFIED: CLAUDE.md:110] |
| Corrupt v1 backup payload import crashing v2 database | Denial of Service | Two-stage backup validation parses structural schema and referential foreign keys before triggering Dexie import. [VERIFIED: CLAUDE.md:114] |

---

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` — Existing `SCHEMA_V1` definition `[VERIFIED: src/db/schema.ts:1-10]`
- `src/db/index.ts` — Dexie versioning and table definitions `[VERIFIED: src/db/index.ts:14-43]`
- `src/types/models.ts` — Core TypeScript domain interfaces `[VERIFIED: src/types/models.ts:1-79]`
- `src/validation/schemas.ts` — Zod input/update schemas `[VERIFIED: src/validation/schemas.ts:1-152]`
- `src/services/backup/exportBackup.ts` — Backup export metadata, `APP_MARKER`, and `CURRENT_SCHEMA_VERSION` `[VERIFIED: src/services/backup/exportBackup.ts:5-6]`
- `src/services/backup/validateBackup.ts` — Two-stage backup validation engine `[VERIFIED: src/services/backup/validateBackup.ts:1-215]`
- `CLAUDE.md` — Project architecture, constraints, and standard stack `[VERIFIED: CLAUDE.md:1-236]`
- `.planning/phases/09-banking-it-domain-fields-work-types/09-CONTEXT.md` — Locked decisions D-01 through D-17 `[VERIFIED: 09-CONTEXT.md:1-140]`
- `.planning/phases/09-banking-it-domain-fields-work-types/09-UI-SPEC.md` — Visual design contract, color palette, and copywriting `[VERIFIED: 09-UI-SPEC.md:1-169]`

### Secondary (MEDIUM confidence)
- Dexie.js MultiEntry Index documentation (`dexie.org/docs/MultiEntry-Index`) — `*` prefix syntax and `.uniqueKeys()` indexing behavior.
- Ant Design 6 `Select` documentation (`ant.design/components/select`) — `mode="tags"` behavior and token-based styling.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already installed and verified against project requirements.
- Architecture: HIGH — Clear non-destructive Dexie migration, pure functional inheritance resolution, and Ant Design 6 patterns.
- Pitfalls: HIGH — Root causes identified for `exactOptionalPropertyTypes`, multi-entry indexing, and backup compatibility.

**Research date:** 2026-09-28
**Valid until:** 2026-10-28 (30 days — stable local architecture)
