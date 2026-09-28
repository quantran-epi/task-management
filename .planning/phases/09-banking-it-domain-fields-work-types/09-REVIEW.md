---
phase: 09-banking-it-domain-fields-work-types
reviewed: 2026-09-28T07:30:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - src/components/common/TagListDisplay.tsx
  - src/components/common/TagSelect.tsx
  - src/components/projects/MilestoneModal.tsx
  - src/components/projects/ProjectModal.tsx
  - src/components/projects/ProjectTable.tsx
  - src/components/tasks/QuickAddBar.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/tasks/WorkTypeBadge.tsx
  - src/db/index.ts
  - src/db/repositories/milestoneRepo.ts
  - src/db/repositories/projectRepo.ts
  - src/db/repositories/tagRepo.ts
  - src/db/repositories/taskRepo.ts
  - src/db/schema.ts
  - src/domain/inheritance.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/validateBackup.ts
  - src/types/models.ts
  - src/validation/backupSchemas.ts
  - src/validation/schemas.ts
  - src/views/ProjectsView.tsx
  - tests/components/ProjectMilestoneModalAndTable.test.tsx
  - tests/components/TaskDrawerAndQuickAdd.test.tsx
  - tests/components/TaskTable.test.tsx
  - tests/components/WorkTypeBadge.test.tsx
  - tests/db/repos.test.ts
  - tests/db/schemaV2Migration.test.ts
  - tests/domain/inheritance.test.ts
  - tests/services/backup/exportBackup.test.ts
  - tests/services/backup/v2Compatibility.test.ts
  - tests/services/backup/validateBackup.test.ts
  - tests/setup.ts
  - tests/validation/domainSchemas.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-09-28T07:30:00Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 09 introduces Banking IT domain fields (`workType`, `opsOwners`, `businessAnalysts`), Dexie schema v2 migration with multi-entry indexing, nearest-ancestor inheritance resolution, and UI integration across TaskTable, ProjectTable, QuickAddBar, TaskDrawer, and Project/Milestone modals.

One critical blocker was identified: when clearing tags in `ProjectModal`, `MilestoneModal`, and `TaskDrawer`, empty tag arrays are mapped to `undefined`. Because repositories follow partial-update semantics (`if (validated.opsOwners !== undefined)`), `undefined` leaves the existing record unchanged in IndexedDB, making it impossible for users to remove tags once set. Three warnings were identified: an unchecked nullish iteration in `TagSelect.handleChange` when Ant Design's `allowClear` fires, type signatures omitting domain fields in `ProjectsView.tsx`, and inline duplication of inheritance logic in `ProjectTable.tsx`.

## Critical Issues

### CR-01: Impossible to Remove All Tags in Modals Due to Undefined Patch Conversion

**File:** `src/components/projects/ProjectModal.tsx:92-94`, `src/components/projects/MilestoneModal.tsx:113-115`, `src/components/tasks/TaskDrawer.tsx:258-260`
**Issue:** When a user removes all tags from `opsOwners` or `businessAnalysts` in `ProjectModal`, `MilestoneModal`, or `TaskDrawer`, the submit handlers evaluate `(values.opsOwners ?? []).length > 0 ? values.opsOwners : undefined`. When the array is empty (`length === 0`), `undefined` is passed in the update payload. In `projectRepo.ts:58`, `milestoneRepo.ts:59`, and `taskRepo.ts:75`, partial-update guards check `if (validated.opsOwners !== undefined) updated.opsOwners = validated.opsOwners;`. Because `undefined` means "do not modify", the repository skips the field and preserves the existing tags in IndexedDB. Users can never clear tags once saved, violating requirement D-07 ("clearing all explicit tags reverts to inheritance display").

**Fix:** Pass `values.opsOwners ?? []` and `values.businessAnalysts ?? []` directly so the repository receives an empty array and persists the cleared state.

In `src/components/projects/ProjectModal.tsx`:
```typescript
      await onSave({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        notes: values.notes?.trim() || undefined,
        status: values.status,
        opsOwners: values.opsOwners ?? [],
        businessAnalysts: values.businessAnalysts ?? [],
      });
```

In `src/components/projects/MilestoneModal.tsx`:
```typescript
      await onSave({
        projectId,
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        status: values.status,
        opsOwners: values.opsOwners ?? [],
        businessAnalysts: values.businessAnalysts ?? [],
      });
```

In `src/components/tasks/TaskDrawer.tsx`:
```typescript
      const updated = await updateTask(
        taskId,
        {
          name: values.name.trim(),
          status: values.status,
          priority: values.priority,
          workType: values.workType || 'code',
          opsOwners: values.opsOwners ?? [],
          businessAnalysts: values.businessAnalysts ?? [],
          estimateMinutes,
          progress: values.progress ?? 0,
          deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
          actualStartDate: values.actualStartDate
            ? values.actualStartDate.format('YYYY-MM-DD')
            : undefined,
          actualEndDate: values.actualEndDate
            ? values.actualEndDate.format('YYYY-MM-DD')
            : undefined,
          documentLinks: cleanedLinks.length > 0 ? cleanedLinks : undefined,
          notes: values.notes?.trim() ? values.notes : undefined,
          projectId: targetProjectId,
          milestoneId: targetMilestoneId,
        },
        db
      );
```

## Warnings

### WR-01: Nullish Iteration Crash in TagSelect When Clearing Input

**File:** `src/components/common/TagSelect.tsx:56-61`
**Issue:** `handleChange` accepts `newVals: string[]` and immediately executes `for (const raw of newVals)`. When Ant Design `Select` `allowClear` button is clicked in `mode="tags"`, the underlying `rc-select` component can emit `undefined` or `null` to `onChange`. If `newVals` is not an array, `for..of` throws an unhandled `TypeError: newVals is not iterable` at runtime.

**Fix:** Default `newVals` to an empty array before iterating:
```typescript
  const handleChange = (newVals?: string[] | null) => {
    // Trim, case-insensitive deduplication, length check, max 10
    const processed: string[] = [];
    const seenLower = new Set<string>();

    for (const raw of (newVals ?? [])) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
```

### WR-02: ProjectsView Save Handlers Drop Domain Fields in Type Signatures

**File:** `src/views/ProjectsView.tsx:58-64, 106-112`
**Issue:** `handleSaveProject` and `handleSaveMilestone` declare explicit parameter types that omit `opsOwners` and `businessAnalysts`. Although JavaScript passes the runtime object through, TypeScript's contract drifts from `ProjectModalProps['onSave']` and `MilestoneModalProps['onSave']`. Destructuring or refactoring inside these handlers will silently drop the domain fields.

**Fix:** Add `opsOwners` and `businessAnalysts` to parameter types:
```typescript
  const handleSaveProject = async (values: {
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    notes?: string | undefined;
    status: ProjectStatus;
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
  }) => {
```
and:
```typescript
  const handleSaveMilestone = async (values: {
    projectId: string;
    name: string;
    description?: string | undefined;
    deadline?: string | undefined;
    status: MilestoneStatus;
    opsOwners?: string[] | undefined;
    businessAnalysts?: string[] | undefined;
  }) => {
```

### WR-03: Duplicate Inline Inheritance Logic in ProjectTable

**File:** `src/components/projects/ProjectTable.tsx:140-155, 160-175`
**Issue:** `ProjectTable` re-implements fallback tag inheritance with manual `if/else` checks for milestone rows instead of reusing `resolveInheritedTags()` from `src/domain/inheritance.ts`. This duplicates domain logic and creates risk of divergence from `TaskTable` and `TaskDrawer`.

**Fix:** Use `resolveInheritedTags()`:
```typescript
      {
        title: 'Ops Owner',
        key: 'opsOwners',
        width: 130,
        render: (_, record) => {
          const res = resolveInheritedTags('opsOwners', record, {
            project: { name: project.name, opsOwners: project.opsOwners },
          });
          return <TagListDisplay tags={res.tags} source={res.source} originName={res.originName} />;
        },
      },
```

## Info

### IN-01: Redundant Warning Message in TagSelect Limit Check

**File:** `src/components/common/TagSelect.tsx:81-86, 91-96`
**Issue:** When `processed.length === MAX_TAG_COUNT` and `newVals.length > MAX_TAG_COUNT`, `message.warning({ content: 'Tối đa 10 thẻ cho mỗi trường', key: 'tag-count-warning' })` is invoked inside the loop at line 82, and the exact same condition is checked and executed again at line 91 outside the loop.
**Fix:** Remove lines 91-96.

### IN-02: TagSelect Does Not Accept Optional db Prop for Database Isolation

**File:** `src/components/common/TagSelect.tsx:21-36`
**Issue:** `TagSelect` hardcodes calls to `getDistinctOpsOwners()` and `getDistinctBusinessAnalysts()` against the global `defaultDb`. When rendered inside `TaskDrawer` which accepts an isolated `db?: TaskPlannerDatabase` instance, suggestions cannot be loaded from that isolated instance.
**Fix:** Add `db?: TaskPlannerDatabase` to `TagSelectProps` and pass it to the tag repository query functions.

---

_Reviewed: 2026-09-28T07:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
