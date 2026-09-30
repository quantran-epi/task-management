---
slug: 260930-dii-day-insight-per-task-plan-vs-actual
type: quick
status: in-progress
created: 2026-09-30
---

# Day Insight — Per-Task Planned vs Actual (single day)

## Goal

For a single calendar date D, show:

- Per task (rows) on date D: `plannedMinutes` (from `plannedAllocations`) and `actualMinutes` (sum of `workSessions.durationMinutes` where `date = D`).
- Totals: `totalPlanned`, `totalActual`, `capacityMinutes` for D.
- Ratios: planned vs capacity, actual vs capacity, actual vs planned.

Read-only view. No schema change. No new persisted fields.

## Non-goals

- No editing planned or actual from this view (existing edit flows already cover both).
- No multi-day rollup (already covered by dashboard/planner).
- No new work-type breakdown or charts.

## Data sources (already exist)

- `plannedAllocations` — indexed by `date`. Fetch: `getAllocationsForDate(date)` in `src/db/repositories/allocationRepo.ts` (joins task, exposes `isActive`).
- `workSessions` — indexed by `date` (schema V5, `src/db/schema.ts:47`). No repo function yet returns "all sessions for a date joined with task". Need one thin helper.
- `capacityRules` + `capacityOverrides` — resolve via `getEffectiveDailyCapacity(date, rules, overrides)` in `src/utils/capacity.ts`.

## Row merge rule

Union of taskIds appearing in planned OR actual for date D. Each row:

```
{
  taskId,
  taskName,
  projectName?,       // resolved from task.projectId → projects
  isActive,           // from task.status via isTaskActive()
  plannedMinutes,     // 0 if no allocation that day
  actualMinutes,      // 0 if no sessions that day
  deltaMinutes,       // actual - planned (signed)
}
```

Sort: `actualMinutes` desc, then `plannedMinutes` desc, then `taskName` asc.

Handle deleted / unknown task the same way `getAllocationsForDate` already does (fallback name "Deleted / Unknown Task").

## Implementation steps

### 1. Add repo function `getWorkSessionsForDate`

File: `src/db/repositories/workSessionRepo.ts`

```ts
export interface WorkSessionWithTask extends WorkSession {
  task: Task;
}

export async function getWorkSessionsForDate(
  date: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<WorkSessionWithTask[]>
```

- Query: `db.workSessions.where('date').equals(date).toArray()`.
- Batch-load tasks via `db.tasks.where('id').anyOf(uniqueTaskIds).toArray()`.
- Fallback task same shape as `getAllocationsForDate` for missing tasks.

Also add a small aggregator:

```ts
export async function getActualMinutesByTaskForDate(
  date: string,
  db?: TaskPlannerDatabase
): Promise<Map<string, number>>
```

Returns `taskId → sum(durationMinutes)` for D. Built on top of `getWorkSessionsForDate` (or a lighter query without task join if perf matters — for one day it does not).

### 2. Add hook `useDayInsight`

File: `src/hooks/useDayInsight.ts`

- Signature: `useDayInsight(date: string, db?: TaskPlannerDatabase)`.
- Uses `useLiveQuery` on: `plannedAllocations` (by date), `workSessions` (by date), `capacityRules`, `capacityOverrides`.
- Also loads `projects` to resolve `projectName` per row (small table; live query is fine).
- Returns:

```ts
interface DayInsightData {
  date: string;
  capacityMinutes: number;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  rows: DayInsightRow[]; // merged & sorted
  loading: boolean;
}
```

Pure merge/sort logic goes in `src/utils/dayInsight.ts` so it is unit-testable without React.

### 3. Add UI component `DayInsightPanel`

File: `src/components/planner/DayInsightPanel.tsx`

Ant Design layout (matches existing planner card patterns):

- Header:
  - `formatDate(D)` (dayjs `ddd, DD/MM/YYYY`).
  - Three summary tags:
    - `Sức chứa: {formatMinutes(capacity)}`
    - `Kế hoạch: {formatMinutes(totalPlanned)} ({percent vs capacity})`
    - `Thực tế: {formatMinutes(totalActual)} ({percent vs capacity})`
  - Delta tag: `Chênh lệch: ±{formatMinutes(|totalActual − totalPlanned|)}` (green if within ±15%, warning if outside; keep threshold in a const at top of file).
- Ant `Table`, columns:
  - Tác vụ (name + `Tag` for project + inactive dim style)
  - Kế hoạch (`formatMinutes`)
  - Thực tế (`formatMinutes`)
  - Chênh lệch (signed `+/-` with color: green ≤ 0 planned-covered, red if over-planned by > 0 and no actual, neutral if both zero — see empty-state rules below)
- Empty rows / states:
  - No planned AND no actual anywhere → show `Empty` with description "Không có kế hoạch và không có thời gian log cho ngày này."
  - `capacityMinutes === 0` → subtle info banner "Ngày nghỉ / không có sức chứa" above the summary tags. Still render table if there are rows.

Language: Vietnamese, matching existing planner UI strings (e.g. `DateInspectionBreakdown.tsx`, `DayColumnHeader.tsx`).

Reuse `formatMinutes()` from `src/utils/time.ts`. Reuse `isTaskActive` from `allocationRepo.ts`.

### 4. Wire entry point

Single entry point: click the date/`Sức chứa` area of a planner `DayColumnHeader`? Already used for "edit capacity". Do NOT overload it.

Add a new small icon button on `DayColumnHeader` next to the capacity tag: `<Tooltip title="Chi tiết ngày (kế hoạch vs thực tế)"><Button size="small" type="text" icon={<BarChartOutlined />} onClick={() => onOpenInsight?.(date)} /></Tooltip>`.

Open a modal (`Modal` from AntD) containing `DayInsightPanel`. Modal state lives in `PlannerView.tsx`.

Also add a secondary entry from `TodaySummaryCard` on Dashboard: existing "Xem lịch" style link → add a button "Chi tiết hôm nay" that opens the same modal for `forecast.todayDate`. Optional in this task — do it only if the diff stays small; otherwise skip and leave a `ponytail:` note.

### 5. Tests

- Unit: `src/utils/dayInsight.test.ts` — merge/sort/delta pure function with fixtures (planned-only row, actual-only row, both, deleted task, inactive task ordering).
- Repo: `tests/db/workSessionRepoDayInsight.test.ts` (fake-indexeddb) — `getWorkSessionsForDate` returns joined rows and empty array for a date with no sessions.
- Component (Vitest + Testing Library): render `DayInsightPanel` with a fixture prop-driven variant (bypass live query for the component test by extracting a presentational sub-component `DayInsightView` that takes `DayInsightData` as prop). Assert totals, delta color, and empty state.

## Files touched

New:
- `src/hooks/useDayInsight.ts`
- `src/utils/dayInsight.ts`
- `src/utils/dayInsight.test.ts`
- `src/components/planner/DayInsightPanel.tsx`
- `tests/db/workSessionRepoDayInsight.test.ts`

Edited:
- `src/db/repositories/workSessionRepo.ts` — add 2 exports.
- `src/components/planner/DayColumnHeader.tsx` — add insight button prop + render.
- `src/views/PlannerView.tsx` — modal state + wire callback.
- (optional) `src/components/dashboard/TodaySummaryCard.tsx` — add button.

## Risk / edge cases

- Timezone drift: `workSessions.date` is derived from `startTime` via `toCalendarDateString` using local wall clock (`getFullYear/getMonth/getDate`). Consistent with `plannedAllocations.date` semantics (calendar day). No conversion needed.
- Large per-day session counts (unlikely for personal app): query is date-indexed, cheap.
- Task deletion: covered by fallback task.
- Multiple sessions for one task on the same day: summed at aggregate step.

## Skipped (deliberate)

`ponytail:` no charts / trend across days — the planner already handles multi-day view. Add later if a weekly delta report is needed.

`ponytail:` no CSV export from this modal. Add when a user actually asks.

`ponytail:` no per-work-type split. Row-level is enough for v1; expand only if reporting needs it.

## Verification

- `npm run typecheck`
- `npm run test` (unit + repo tests pass)
- Manual: seed a day with 2 planned tasks + log 2 work sessions (one matching, one for a task with no planned) → open modal → see 3 rows, correct totals, correct delta signs.

## Commit plan

1. `test(quick-260930-dii): add failing day insight util + repo tests`
2. `feat(quick-260930-dii): add getWorkSessionsForDate and day insight merge util`
3. `feat(quick-260930-dii): add useDayInsight hook and DayInsightPanel component`
4. `feat(quick-260930-dii): wire day insight modal from planner day header`
5. `docs(quick-260930-dii): SUMMARY`
