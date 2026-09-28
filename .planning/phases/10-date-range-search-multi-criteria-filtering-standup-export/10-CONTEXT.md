# Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable querying scheduled work across execution date windows (planned allocations) and deadline ranges alongside multi-criteria filters (status, priority, workType, project, milestone, Ops Owner, BA), with one-click export of filtered task results as a formatted Markdown standup summary to clipboard. Delivers reactive date-range filtering, collapsible advanced filter bar UI, and standardized banking IT standup formatting.

</domain>

<decisions>
## Implementation Decisions

### Search UI Placement & Filter Layout
- **D-01:** Expand existing `TaskFilterBar` with a collapsible advanced filter section toggled via an "Bộ lọc nâng cao" button with an active filter count badge. Avoids separate drawer or modal fragmentation and keeps filtering inline with the table.
- **D-02:** Ant Design `DatePicker.RangePicker` for both execution date range and deadline date range inputs using standard `YYYY-MM-DD` strings to prevent timezone drift.
- **D-03:** Advanced filter controls include:
  - `milestoneId`: Select dropdown filtered by selected project (or all milestones).
  - `opsOwners`: Select `mode="tags"` / multiselect for filtering tasks matching any selected Ops Owner (supporting inheritance matching).
  - `businessAnalysts`: Select `mode="tags"` / multiselect for filtering tasks matching any selected BA (supporting inheritance matching).
  - `workType`: Multiselect for 7 work types (`code`, `document`, `meeting`, `support_testing`, `investigate`, `configuration`, `review_code`).
  - `executionDateRange`: `[startDate, endDate]` range picker.
  - `deadlineRange`: `[startDate, endDate]` range picker.
- **D-04:** Single "Xóa bộ lọc" (Reset) button resets all filter criteria (both basic and advanced) back to `DEFAULT_TASK_FILTER_STATE`.

### Execution Date Query & Reactivity Strategy
- **D-05:** Reactive execution date query using Dexie `db.plannedAllocations.where('date').between(start, end, true, true)` via `useLiveQuery` in a dedicated hook or filter pipeline. Extracts unique `taskId` Set matching planned hours in the range.
- **D-06:** Tasks without planned hours in the selected execution date range are excluded (filtered out of the table), not dimmed.
- **D-07:** Task row display stays focused on task attributes; does not compute or display cumulative allocated hours in range inside table cells (pure filtering).

### Standup Export Format & Trigger
- **D-08:** Standup export action button ("📋 Sao chép Standup") placed on the toolbar / header row of `TaskTable` / `TaskFilterBar`. Clicking writes formatted Markdown text to clipboard via `navigator.clipboard.writeText()` with Ant Design `message.success` confirmation.
- **D-09:** Standup grouping by status categories:
  - `### ✅ Đã hoàn thành` for `Done` tasks.
  - `### 🔄 Đang thực hiện` for `In Progress`, `In Review`, `Resolved` tasks.
  - `### 📋 Kế hoạch / Đang chờ` for `Open` tasks.
  - Exclude `Cancelled` tasks from export.
- **D-10:** Per-task standup item format:
  - `- [WorkTypeLabel] Task Title (Dự án: ProjectName | Hạn: YYYY-MM-DD | Phụ trách: Ops / BA)`
  - Uses Vietnamese labels tailored to SHB banking IT daily standup reporting via Teams/Slack/Email.

### Claude's Discretion
- Exact layout spacing, flex wrap thresholds, and collapse animation of the advanced filter container.
- Specific icons for the advanced filter toggle and standup export buttons.
- Fallback behavior when `navigator.clipboard` is unavailable (e.g. non-HTTPS iframe / fallback prompt).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone & Phase Scope
- `.planning/ROADMAP.md` § Phase 10 — Phase 10 goal, dependencies, and success criteria
- `.planning/REQUIREMENTS.md` § Date-Range Search & Multi-Criteria Filtering — Requirements SRCH-01 through SRCH-04
- `.planning/PROJECT.md` § Current Milestone: v1.1 Banking IT Enhancements & Jira Integration

### Prior Phase Decisions
- `.planning/phases/09-banking-it-domain-fields-work-types/09-CONTEXT.md` — Ops Owner, BA inheritance rules, 7 WorkType definitions, Schema v2 multi-entry indexes

### Filtering & Task Model
- `src/utils/filter.ts` — `TaskFilterState`, `DEFAULT_TASK_FILTER_STATE`, `filterTasks`, `matchesHorizon`
- `src/hooks/useTaskFilters.ts` — Filter state management, search debounce, sort handling
- `src/components/tasks/TaskFilterBar.tsx` — Current filter bar component
- `src/components/tasks/TaskTable.tsx` — Main task list table view
- `src/db/schema.ts` — Dexie schema v2 with `*opsOwners`, `*businessAnalysts`, `workType`
- `src/db/index.ts` — Dexie database instance and tables (`plannedAllocations`, `tasks`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/utils/filter.ts`: Central place for pure filtering logic; expand `TaskFilterState` and `filterTasks` with new criteria.
- `src/hooks/useTaskFilters.ts`: Central hook controlling filter state, debounce, and filtered task list.
- `src/components/tasks/TaskFilterBar.tsx`: Well-structured flex container ready for collapsible advanced filter row.
- `src/utils/date.ts`: Date utilities (`getTodayDateString`, formatting).
- `src/types/models.ts`: Full domain definitions including `WorkType`, `Task`, `Project`, `Milestone`.

### Established Patterns
- Calendar dates always handled as `YYYY-MM-DD` strings to avoid UTC/local offset drift.
- Dexie `useLiveQuery` for reactive IndexedDB state updates without custom event emitters.
- Ant Design theme tokens (`theme.useToken()`) for colors, borders, and backgrounds.

### Integration Points
- `src/utils/filter.ts`: add `executionDateRange?: [string, string]`, `deadlineRange?: [string, string]`, `milestoneId?: string | null`, `opsOwners?: string[]`, `businessAnalysts?: string[]`, `workTypes?: WorkType[]` to `TaskFilterState`.
- `src/hooks/useTaskFilters.ts`: accept execution matching task ID set or hook into `plannedAllocations` table.
- `src/components/tasks/TaskFilterBar.tsx`: add expandable section with RangePickers and multi-select tags.
- `src/utils/standup.ts` (new): pure utility function formatting filtered tasks into Markdown standup text.
- `src/components/tasks/TaskTable.tsx`: add standup copy button to toolbar and integrate with clipboard.

</code_context>

<specifics>
## Specific Ideas
- Standup markdown format tailored for quick pasting into SHB internal chat channels (Teams/Skype/Mattermost) or email daily reports.
- Advanced filter badge clearly signals to the user how many non-default filter conditions are currently active.

</specifics>

<deferred>
## Deferred Ideas

### Save and reuse preferred filter combinations
- Deferred to PROD-01 (Next Milestone candidate). User mentioned interest in saved presets, but out of scope for Phase 10.

</deferred>

---

*Phase: 10-date-range-search-multi-criteria-filtering-standup-export*
*Context gathered: 2026-09-28*
