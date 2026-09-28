---
phase: 11-jira-cloud-integration-task-lifecycle
reviewed: 2026-09-28T14:15:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - src/components/planner/TaskAllocationCard.tsx
  - src/components/settings/JiraConfigCard.tsx
  - src/components/tasks/CreateJiraIssueModal.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/tasks/TaskJiraSection.tsx
  - src/components/tasks/TaskTable.tsx
  - src/db/index.ts
  - src/db/repositories/taskRepo.ts
  - src/db/schema.ts
  - src/services/jira/adf.ts
  - src/services/jira/jiraApi.ts
  - src/services/jira/statusMapping.ts
  - src/services/jira/types.ts
  - src/types/models.ts
  - src/utils/filter.ts
  - src/utils/standup.ts
  - src/validation/schemas.ts
  - src/views/SettingsView.tsx
  - tests/components/TaskDrawer.test.tsx
  - tests/components/TaskTable.test.tsx
  - tests/components/planner/TaskAllocationCardJira.test.tsx
  - tests/components/settings/JiraConfigCard.test.tsx
  - tests/components/tasks/CreateJiraIssueModal.test.tsx
  - tests/components/tasks/TaskJiraSection.test.tsx
  - tests/db/schemaV2Migration.test.ts
  - tests/db/schemaV3Migration.test.ts
  - tests/services/jira/adf.test.ts
  - tests/services/jira/jiraApi.test.ts
  - tests/services/jira/statusMapping.test.ts
  - tests/utils/filter.test.ts
  - tests/utils/standup.test.ts
  - tests/validation/domainSchemas.test.ts
  - tests/views/SettingsView.test.tsx
findings:
  critical: 1
  warning: 5
  info: 5
  total: 11
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-28T14:15:00Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 11 implements Jira Cloud REST API v3 integration: Jira settings configuration card in IndexedDB, issue creation with ADF conversion, transition fetching and execution with smart status mapping, Jira Key micro-badges across TaskTable and TaskAllocationCard, Jira status filters, and Jira Key standup formatting.

1 Critical blocker finding was detected: `BackupTaskRecordSchema` in `src/validation/backupSchemas.ts` omitted `jiraKey`, which causes all imported/restored backups to permanently strip and delete `jiraKey` from tasks. 5 Warnings were identified (invalid empty ADF document creation, swallowed transition fetch errors, status mapping edge cases, unhandled "Sub-task" issue type, missing default database instance in TaskTable), and 5 Info quality/accessibility items.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `BackupTaskRecordSchema` lacks `jiraKey`, causing silent data loss on backup restore

**File:** `src/validation/backupSchemas.ts:59-79`
**Issue:** `BackupTaskRecordSchema` defines the schema used by `validateBackup.ts` to validate and extract task records during backup import and snapshot rollback (`validateBackupEnvelope` -> `validateTable('tasks', BackupTaskRecordSchema, ...)`). Because Zod object parsing strips undeclared keys by default (`parsed.data`), any task imported from an encrypted or unencrypted backup file will have its `jiraKey` silently stripped. When the restored records are written to Dexie via `bulkAdd`, all Jira linkages are permanently destroyed.
**Fix:**
```typescript
// src/validation/backupSchemas.ts
import {
  PROJECT_STATUSES,
  MILESTONE_STATUSES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  tagListSchema,
  workTypeSchema,
  jiraKeySchema,
} from './schemas';

export const BackupTaskRecordSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema.optional(),
  milestoneId: uuidSchema.optional(),
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  actualStartDate: calendarDateSchema.optional(),
  actualEndDate: calendarDateSchema.optional(),
  status: z.enum(TASK_STATUSES),
  progress: z.number().int().min(0).max(100),
  priority: z.enum(TASK_PRIORITIES),
  estimateMinutes: z.number().int().min(0).max(6000),
  workType: workTypeSchema.optional(),
  jiraKey: jiraKeySchema.optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(httpUrlSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

---

## Warnings

### WR-01: `CreateJiraIssueModal` sends invalid empty ADF document `doc.content: []` when description is blank

**File:** `src/components/tasks/CreateJiraIssueModal.tsx:105-115` & `src/services/jira/adf.ts:17-24`
**Issue:** When a task has no description or notes, `textToAdf()` outputs `{ version: 1, type: 'doc', content: [] }`. Atlassian Document Format (ADF) specification strictly requires at least one block node in `doc.content` if `description` is provided. Jira REST API v3 rejects requests containing empty `doc.content` with HTTP 400 Bad Request (`Operation value must be an Atlassian Document with at least one block element`).
**Fix:**
```typescript
// src/components/tasks/CreateJiraIssueModal.tsx
const payload: JiraCreateIssuePayload = {
  fields: {
    project: { key: values.projectKey.trim().toUpperCase() },
    issuetype: { name: values.issueType },
    summary: values.summary.trim(),
    ...(values.description?.trim()
      ? { description: textToAdf(values.description) }
      : {}),
  },
};
```

### WR-02: `TaskJiraSection.fetchTransitions` silently swallows API errors, misrepresenting failures as no available transitions

**File:** `src/components/tasks/TaskJiraSection.tsx:108-113`
**Issue:** When `getJiraTransitions()` fails (e.g. 401 Unauthorized, CORS failure, Jira Cloud downtime, 404 Issue Not Found), `fetchTransitions` catches the error and silently sets `setTransitions([])` without recording any diagnostic state. The UI renders "Không có luồng chuyển trạng thái nào khả dụng từ trạng thái hiện tại", misleading the user into believing the task is in an un-transitionable status rather than alerting them to an authentication or network failure.
**Fix:**
```typescript
// src/components/tasks/TaskJiraSection.tsx
} catch (err: unknown) {
  setTransitions([]);
  setSelectedTransitionId(null);
  const msg = err instanceof Error ? err.message : 'Không thể tải luồng chuyển trạng thái Jira.';
  setTransitionError({ message: msg, isScreenError: false });
} finally {
```

### WR-03: `statusMapping.ts` does not check "won't fix", causing Jira "Won't Fix" resolutions to map to "Done"

**File:** `src/services/jira/statusMapping.ts:11-23`
**Issue:** In Jira classic workflows, "Won't Fix" and "Cannot Reproduce" are standard resolution statuses having Jira category `done`. Rule 1 only checks `"won't do"`, omitting `"won't fix"` and `"wont fix"`. Because Jira assigns them category `done`, Rule 2 triggers on `normCat === 'done'`, incorrectly mapping rejected work to local status `Done` instead of `Cancelled`.
**Fix:**
```typescript
// src/services/jira/statusMapping.ts
if (
  normName.includes('cancel') ||
  normName.includes('reject') ||
  normName.includes("won't do") ||
  normName.includes("won't fix") ||
  normName.includes('wont fix')
) {
  return 'Cancelled';
}
```

### WR-04: `TaskTable` omits default `db = defaultDb`, breaking deletion and Jira browsing if prop is omitted

**File:** `src/components/tasks/TaskTable.tsx:78`
**Issue:** Unlike `TaskAllocationCard`, `TaskDrawer`, `TaskJiraSection`, and `CreateJiraIssueModal`, `TaskTable` does not declare `db = defaultDb`. If `<TaskTable />` is mounted without `db`, `settingsDomain` is always undefined (`useLiveQuery` returns undefined), causing all Jira Key badges in the table to link to `https://atlassian.net/browse/...` (404) instead of the user's Jira tenant. Furthermore, deleting a task silently aborts (`if (!db) return;`).
**Fix:**
```typescript
// src/components/tasks/TaskTable.tsx
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  projects,
  milestones,
  selectedRowKeys,
  onSelectRows,
  onOpenDrawer,
  onSelectProject,
  isFiltered = false,
  db = defaultDb,
  loading = false,
  jiraDomain,
}) => {
```

### WR-05: Sub-task option offered in `CreateJiraIssueModal` and `JiraConfigCard` without parent issue field

**File:** `src/components/tasks/CreateJiraIssueModal.tsx:176-181` & `src/components/settings/JiraConfigCard.tsx:297-302`
**Issue:** Both components offer `"Sub-task"` in the issue type selection. In Jira Cloud REST API v3, creating an issue with `issuetype: "Sub-task"` strictly requires a `parent: { key: string }` object in payload fields. Because no parent field exists in the modal, creating a sub-task will always fail with HTTP 400 Bad Request (`The parent issue is required for sub-tasks`).
**Fix:** Remove `"Sub-task"` from the default options, or disable it until parent issue linking is supported:
```typescript
options={[
  { value: 'Task', label: 'Task' },
  { value: 'Bug', label: 'Bug' },
  { value: 'Story', label: 'Story' },
]}
```

---

## Info

### IN-01: Code duplication of Jira browse URL generator in `TaskJiraSection.tsx`

**File:** `src/components/tasks/TaskJiraSection.tsx:80-91`
**Issue:** `getJiraBrowseUrl` is already defined and exported from `src/services/jira/jiraApi.ts` and used across `TaskTable` and `TaskAllocationCard`. `TaskJiraSection` duplicates this logic in a local `useCallback` while omitting `encodeURIComponent(key)`.
**Fix:** Remove the duplicate `getBrowseUrl` and import `getJiraBrowseUrl` directly.

### IN-02: Deprecated `unescape()` used in Basic Auth header construction

**File:** `src/services/jira/jiraApi.ts:49`
**Issue:** `authHeader` uses `btoa(unescape(encodeURIComponent(credentials)))`. The `unescape()` function has been deprecated since ECMAScript 3.
**Fix:** Replace with standard `TextEncoder` encoding or helper:
```typescript
const authHeader = `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(credentials)))}`;
```

### IN-03: Invalid `orientation="horizontal"` prop on Ant Design `<Space>` components

**File:** `src/components/tasks/TaskFilterBar.tsx:195, 218, 251, 280, 312, 327, 366, 383, 403` & `src/components/tasks/TaskTable.tsx:427`
**Issue:** Ant Design's `<Space>` component accepts `direction="horizontal" | "vertical"`, not `orientation`. `orientation` belongs to `<Divider>`. Passing `orientation` is ignored by `<Space>` and triggers console warnings in React.
**Fix:** Remove `orientation="horizontal"` (horizontal is the default) or replace with `direction="horizontal"`.

### IN-04: Jira Key badges in `TaskTable` and `TaskAllocationCard` lack keyboard accessibility

**File:** `src/components/tasks/TaskTable.tsx:251-264` & `src/components/planner/TaskAllocationCard.tsx:253-274`
**Issue:** `TaskJiraSection.tsx` implements `role="link"`, `tabIndex={0}`, and `onKeyDown` handlers on its Jira badge. In `TaskTable` and `TaskAllocationCard`, the Jira badge only handles `onClick`, making it inaccessible to keyboard users navigating with Tab and Enter.
**Fix:** Add `role="link"`, `tabIndex={0}`, and `onKeyDown={(e) => { if (e.key === 'Enter') { ... } }}` to the Jira `Tag` elements.

### IN-05: Unsafe `fallbackTextareaRef.current?.select()` call on Ant Design `Input.TextArea` instance

**File:** `src/components/tasks/TaskTable.tsx:88, 125, 529`
**Issue:** Ant Design's `Input.TextArea` component exposes a `TextAreaRef` object (`{ resizableTextArea: { textArea: HTMLTextAreaElement } }`), not a raw `HTMLTextAreaElement`. In the clipboard fallback modal, calling `fallbackTextareaRef.current?.select()` can throw a TypeError at runtime.
**Fix:**
```typescript
fallbackTextareaRef.current?.resizableTextArea?.textArea?.select();
```

---

_Reviewed: 2026-09-28T14:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
