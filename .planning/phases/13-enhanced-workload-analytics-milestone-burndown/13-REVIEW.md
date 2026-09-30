---
phase: 13-enhanced-workload-analytics-milestone-burndown
reviewed: 2026-09-30T11:25:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/App.tsx
  - src/components/analytics/BurndownSvgChart.tsx
  - src/components/analytics/StackedStatusBar.tsx
  - src/components/analytics/VelocityTrendChart.tsx
  - src/components/analytics/WorkloadProportionBar.tsx
  - src/components/projects/ProjectTable.tsx
  - src/components/shell/Navigation.tsx
  - src/hooks/useHashRoute.ts
  - src/types/analytics.ts
  - src/types/navigation.ts
  - src/utils/analytics.ts
  - src/views/AnalyticsView.tsx
  - src/views/ProjectsView.tsx
findings:
  critical: 2
  warning: 2
  info: 3
  total: 7
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-09-30T11:25:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed all 13 source files implementing Phase 13 (Enhanced Workload Analytics & Milestone Burndown). Implementation establishes the native SVG analytics components, mathematical burndown and rolling velocity calculations, stakeholder workload aggregators, and deep linking from `ProjectsView` to `AnalyticsView`.

Adversarial analysis revealed 2 Critical blockers, 2 Warnings, and 3 Info-level defects:
1. **CR-01 (BLOCKER):** Dropdown milestone selector in `AnalyticsView` is permanently locked when navigating to Analytics with a `milestoneId` URL parameter, preventing user selection of other milestones.
2. **CR-02 (BLOCKER):** Cancelled tasks in milestones are included in `totalScope` but excluded from `completedScope` in `calculateMilestoneBurndown()`, creating ghost remaining work that prevents the actual burndown line from ever reaching zero.
3. **WR-01 (WARNING):** Section 3 (Stakeholder Workload) reuses `burndownUnit` from Section 1 for its proportion bar, causing a visual conflict between the bar width (task count) and the detailed table percentage directly below it (hours).
4. **WR-02 (WARNING):** Inconsistent status categorization for `Resolved` tasks between Velocity/Burndown (treated as completed per D-08) and Project Status Metrics (treated as open remaining hours).

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Milestone dropdown selector locked when navigating via route parameter

**File:** `src/views/AnalyticsView.tsx:75-88`
**Issue:** When navigating to Analytics from `ProjectsView` (e.g. `#/analytics?milestoneId=ms-1`), `initialMilestoneId` is set to `'ms-1'`. The synchronization `useEffect` includes `selectedMilestoneId` in its dependency array. Whenever the user chooses a different milestone from the dropdown, `setSelectedMilestoneId('ms-2')` triggers the effect. The effect evaluates `if (initialMilestoneId && milestones.some(m => m.id === initialMilestoneId))` first, which is still true, and immediately calls `setSelectedMilestoneId(initialMilestoneId)` with `'ms-1'`. The UI instantly resets back to the initial milestone, locking the user out of selecting other milestones.
**Fix:**
Track `initialMilestoneId` prop changes with a ref and update the route hash when the user explicitly selects a new milestone:

```tsx
  const prevInitialIdRef = useRef(initialMilestoneId);

  useEffect(() => {
    // Only synchronize initialMilestoneId when the prop itself changes (e.g. deep navigation)
    if (initialMilestoneId !== prevInitialIdRef.current) {
      prevInitialIdRef.current = initialMilestoneId;
      if (initialMilestoneId && milestones.some((m) => m.id === initialMilestoneId)) {
        setSelectedMilestoneId(initialMilestoneId);
        return;
      }
    }

    if (selectedMilestoneId && milestones.some((m) => m.id === selectedMilestoneId)) {
      return;
    }
    if (milestones.length === 0) {
      setSelectedMilestoneId(undefined);
      return;
    }
    setSelectedMilestoneId(findDefaultMilestone(milestones, initialMilestoneId));
  }, [initialMilestoneId, milestones, selectedMilestoneId]);

  const handleMilestoneChange = (val: string) => {
    setSelectedMilestoneId(val);
    onNavigate?.('analytics', { milestoneId: val });
  };
```

---

### CR-02: Cancelled tasks inflate burndown scope and leave permanent remaining work

**File:** `src/utils/analytics.ts:64-91`
**Issue:** `calculateMilestoneBurndown()` computes `totalScope` by iterating over all tasks associated with the milestone without filtering out `Cancelled` tasks. When computing daily `actualRemaining`, `completedScope` only includes tasks with `status === 'Done' || status === 'Resolved'`. Consequently, cancelled tasks add to total scope but can never be completed, leaving ghost remaining hours/tasks on the actual burndown line even after all active work is finished.
**Fix:**
Filter out `Cancelled` tasks at the start of `calculateMilestoneBurndown`:

```ts
export function calculateMilestoneBurndown(
  milestone: Milestone,
  tasks: Task[],
  options: {
    unit: BurndownUnit;
    todayStr: string;
  }
): MilestoneBurndownSeries {
  const { unit, todayStr } = options;
  const activeTasks = tasks.filter((t) => t.status !== 'Cancelled');

  // Determine milestone start date from active tasks
  const msCreated = milestone.createdAt ? milestone.createdAt.slice(0, 10) : todayStr;
  const earliestTaskStart = activeTasks.reduce<string | null>((earliest, t) => {
    const d = t.actualStartDate || (t.createdAt ? t.createdAt.slice(0, 10) : null);
    if (!d) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);

  const startDate = earliestTaskStart && earliestTaskStart < msCreated ? earliestTaskStart : msCreated;

  let endDate = milestone.deadline;
  if (!endDate) {
    const latestTaskDeadline = activeTasks.reduce<string | null>((latest, t) => {
      if (!t.deadline) return latest;
      return !latest || t.deadline > latest ? t.deadline : latest;
    }, null);
    endDate = latestTaskDeadline && latestTaskDeadline > startDate
      ? latestTaskDeadline
      : dayjs(startDate).add(14, 'day').format('YYYY-MM-DD');
  }

  if (endDate <= startDate) {
    endDate = dayjs(startDate).add(14, 'day').format('YYYY-MM-DD');
  }

  const startDay = dayjs(startDate);
  const endDay = dayjs(endDate);
  const totalDays = Math.min(365, Math.max(1, endDay.diff(startDay, 'day')));
  const clampedEndDate = startDay.add(totalDays, 'day').format('YYYY-MM-DD');

  // Compute total initial scope from active tasks only
  const totalScope = activeTasks.reduce((sum, t) => {
    if (unit === 'hours') {
      return sum + (t.estimateMinutes ? t.estimateMinutes / 60 : 0);
    }
    return sum + 1;
  }, 0);

  const points: BurndownDayPoint[] = [];

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = startDay.add(i, 'day').format('YYYY-MM-DD');
    const idealRemaining = Number(Math.max(0, totalScope * (1 - i / totalDays)).toFixed(2));

    let actualRemaining: number | null = null;
    if (currentDate <= todayStr) {
      const completedScope = activeTasks.reduce((sum, t) => {
        const isDoneOrResolved = t.status === 'Done' || t.status === 'Resolved';
        if (!isDoneOrResolved) return sum;

        const rawDate = t.actualEndDate || t.updatedAt;
        const completionDate = rawDate ? rawDate.slice(0, 10) : null;
        if (completionDate && completionDate <= currentDate) {
          return sum + (unit === 'hours' ? (t.estimateMinutes ? t.estimateMinutes / 60 : 0) : 1);
        }
        return sum;
      }, 0);

      actualRemaining = Number(Math.max(0, totalScope - completedScope).toFixed(2));
    }

    points.push({
      date: currentDate,
      dayIndex: i,
      idealRemaining,
      actualRemaining,
    });
  }

  return {
    milestoneId: milestone.id,
    startDate,
    endDate: clampedEndDate,
    totalScope: Number(totalScope.toFixed(2)),
    unit,
    points,
  };
}
```

---

## Warnings

### WR-01: Section 3 workload proportion bar uses Section 1 burndown unit toggle

**File:** `src/views/AnalyticsView.tsx:392`
**Issue:** In `AnalyticsView`, Section 3 renders `<WorkloadProportionBar items={workloadItems} metric={burndownUnit} height={18} />`. `burndownUnit` is the toggle in Section 1 (Milestone Burndown). When `burndownUnit === 'count'`, the bar segment widths are sized by task counts, while the detailed table directly underneath displays `percentage` calculated strictly from `minutes / totalMinutes`. This produces mismatched percentages between the bar and table.
**Fix:** Decouple Section 3 from `burndownUnit` by using a dedicated state or setting `metric="hours"` to match the table's hour-based workload percentages:

```tsx
<WorkloadProportionBar items={workloadItems} metric="hours" height={18} />
```

---

### WR-02: `Resolved` tasks treated as remaining work in Project Status Metrics but completed in Burndown/Velocity

**File:** `src/utils/analytics.ts:194-209`
**Issue:** `calculateCompletionVelocity` and `calculateMilestoneBurndown` treat `Resolved` tasks as completed (per D-08). However, `calculateProjectStatusMetrics` includes `Resolved` tasks in `openTasksCount` and accumulates their `estimateMinutes` into `remainingMinutes`:
```ts
if (task.status !== 'Done' && task.status !== 'Cancelled') {
  remainingMinutes += task.estimateMinutes ?? 0;
}
```
For a project with only `Resolved` tasks, the burndown and velocity sections show the tasks as 100% completed, while the project table in Section 2 reports them as open tasks with remaining hours.
**Fix:** Align status handling with D-08 so completed work is consistent across dashboard sections:

```ts
if (task.status !== 'Done' && task.status !== 'Resolved' && task.status !== 'Cancelled') {
  remainingMinutes += task.estimateMinutes ?? 0;
}
```

---

## Info

### IN-01: VelocityTrendChart date labels formatted as MM/DD instead of DD/MM

**File:** `src/components/analytics/VelocityTrendChart.tsx:73`
**Issue:** `bucket.startDate.slice(5).replace('-', '/')` formats `YYYY-MM-DD` as `MM/DD` (e.g. `09/15`), whereas the code comment states `e.g. "15/09"` and Vietnamese convention uses `DD/MM`.
**Fix:**
```ts
const parts = bucket.startDate.split('-');
const shortDate = `${parts[2]}/${parts[1]}`;
```

---

### IN-02: Raw English enum keys shown in WorkloadProportionBar tooltip for WorkType

**File:** `src/utils/analytics.ts:259-261`
**Issue:** When grouping by `workType`, `calculateStakeholderWorkload` stores the raw string (e.g. `'support_testing'`, `'investigate'`) in `b.label`. The tooltip in `WorkloadProportionBar` renders `{item.label}`, exposing raw enum identifiers instead of Vietnamese labels (`'Hỗ trợ SIT / UAT'`, `'Điều tra lỗi / R&D'`).
**Fix:** Resolve display labels using `WORK_TYPE_CONFIG[wt]?.label ?? wt`.

---

### IN-03: Raw English task status displayed in expanded workload table row

**File:** `src/views/AnalyticsView.tsx:423`
**Issue:** In `AnalyticsView`, the expanded sub-row of the stakeholder workload table displays `{t.status} • {hours}h` without status label translation, displaying `In Progress` or `Resolved` instead of `Đang làm` or `Đã giải quyết`.
**Fix:** Use `STATUS_LABELS[t.status] || t.status` or `<InlineStatusTag status={t.status} />`.

---

_Reviewed: 2026-09-30T11:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
