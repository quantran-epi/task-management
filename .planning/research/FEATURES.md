# Feature Research

**Domain:** Personal, single-user, offline-first task and workload planning PWA
**Researched:** 2026-09-26
**Confidence:** HIGH for core product needs; MEDIUM for competitor breadth; LOW for exact competitor parity because only public docs were sampled.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. For this product, table stakes include both normal task management and minimum local-first data safety.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Project, milestone, and task CRUD | Personal planning tools must let user capture and organize commitments. Project and milestone hierarchy is explicit requirement. | MEDIUM | Model projects, milestones, tasks separately. Tasks may be standalone, under project, or under milestone. Keep hierarchy shallow; no subtasks in v1. |
| Stable IDs for all entities and planning records | Offline-first data needs stable references for edits, export/import, and backup sync. | LOW | Use client-generated UUIDs. IDs must not change when task moves between project/milestone. |
| Core task fields | User needs enough metadata to decide what to do, when, and why. | MEDIUM | Task: name, description, deadline, note, links, actual start/end, status, progress percent, priority. Project/milestone: name, description, deadline, note, status. |
| Status workflow | Users expect visible work state and completion state. | LOW | Project/milestone: Open, In Progress, Done, Cancelled. Task: Open, In Progress, Resolved, In Review, Done, Cancelled. Keep statuses fixed until real use proves need for customization. |
| Priority | Todoist, TickTick, Motion, and Reclaim all expose priority or prioritization concepts. Priority is table stakes for deciding urgent work. | LOW | Use simple priority enum. Avoid custom scoring in v1. |
| Due dates/deadlines | Task apps commonly center planning around dates and deadlines. Workload feasibility requires deadline input. | LOW | Separate due/deadline date from planned work allocations. Deadline should not imply work is scheduled that day. |
| Today view | Daily planner products emphasize starting day with clear plan. User explicitly needs what to do today. | MEDIUM | Show tasks scheduled today, overdue tasks, urgent deadlines, and today's planned load. |
| Upcoming workload views: 7 days, 14 days, next month | User explicitly needs near-term workload forecasting. Competitor calendar views commonly span week/month. | MEDIUM | Start with simple date buckets and totals. Add richer timeline UI after allocation model stable. |
| Planned hours per task per day | Core value depends on seeing how work fits available days. | HIGH | Need planning records keyed by task ID + date + planned hours. Allow multiple days per task. Validate non-negative hours. |
| Daily capacity baseline | Overload detection needs available hours per day. | MEDIUM | Weekly template: Mon-Sun available hours. Default simple values. Must handle zero-capacity days. |
| Per-date capacity overrides | Personal calendars include leave, meetings, overtime, exceptional days. Requirement explicit. | MEDIUM | Override date with capacity hours and reason. This is enough for v1; no external calendar import. |
| Load state: available, busy, overloaded | User needs quick visual answer whether day is safe or overplanned. | LOW | Compute planned hours / capacity. Define thresholds: available below target, busy near/at target, overloaded above capacity. |
| Manual workload adjustment | Planner must let user fix overload once detected. | MEDIUM | Drag/drop or edit planned-hour records in timeline/day table. v1 can use editable table before full calendar drag UI. |
| Feasibility calculator | Requirement explicit: user inputs estimated hours, date range/deadline, app answers whether work fits. | HIGH | Requires capacity model plus existing planned workload. Return fit/not fit, remaining capacity, and candidate distribution. |
| Suggested daily distribution | Core differentiator for realistic planning. | HIGH | Favor lowest-load eligible days first. Respect capacity, date range, deadline, and optional daily max. Keep deterministic. |
| Local persistence in IndexedDB | Offline-first PWA needs durable browser storage beyond memory/localStorage. Requirement explicit. | MEDIUM | IndexedDB is working source of truth. Add migration/versioning early enough to prevent data loss. |
| Export/import backup | Local-first data safety requires user-owned backup. Requirement explicit and common in serious productivity tools. | MEDIUM | Export complete JSON backup with schema version. Import must validate and require confirmation before replacing data. |
| Offline-capable installable PWA | Product must work without network and be hosted statically. | MEDIUM | App shell and cached assets. Data operations cannot depend on network. Service worker update must not destroy local data. |
| Responsive accessible Ant Design UI | User expects simple, fast, elegant UI across desktop/mobile. Requirement explicit. | MEDIUM | Ant Design components help, but accessibility still needs labels, keyboard paths, contrast, and focus states. |
| Search/filter/sort | Todoist and TickTick expose filters/views; personal planners become unusable without finding work quickly. | MEDIUM | Launch with text search, status filter, project filter, priority filter, date horizon filter. Avoid complex query language in v1. |

### Differentiators (Competitive Advantage)

Features that set product apart for this product's narrow single-user local-first niche.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Capacity-aware planned-hours ledger | Most task apps track due dates; fewer make planned load the first-class source of truth. This directly supports core value. | HIGH | Treat planned allocations as entities, not derived UI state. This enables dashboard, feasibility, backup, and audit. |
| Feasibility answer before accepting work | User can test "can this fit by deadline?" before committing, reducing unrealistic plans. | HIGH | Show YES/NO, total required hours, available capacity, overload delta, and earliest feasible finish. |
| Lowest-load distribution suggestion | Converts diagnosis into action. User gets candidate plan, not only warning. | HIGH | Greedy fill lowest-utilization eligible day first is enough for v1. Avoid AI scheduler. |
| Local-first privacy by default | Single-user private work stays on device. No account, no backend, no vendor lock-in. | MEDIUM | Needs clear backup UX because local-only creates data-loss risk. |
| Optional encrypted GitHub backup artifact | Gives durable remote backup while preserving static hosting and user ownership. | HIGH | Sync is backup sync, not live collaboration. Encrypt in browser before upload. Token/passphrase never bundled. |
| Planning-focused dashboard | Dashboard answers: what today, what urgent, how loaded next 7/14/month. | MEDIUM | Avoid vanity analytics. Use dashboard for decisions. |
| Overload heatmap/timeline | User sees capacity risk at a glance and fixes overloaded days. | MEDIUM | Start as daily bars/table. Later add richer timeline if needed. |
| Standalone task support | Captures loose work without forcing project ceremony. | LOW | Important for speed. Also reduces fake project creation. |
| Backup-first import safety | Local-first apps fail trust if import can wipe good data. | MEDIUM | Preview import counts, schema version, date, conflicts. Require explicit replace/merge choice. |
| Minimal productive UI | Value comes from fast planning, not feature buffet. | MEDIUM | Optimize common actions: create task, allocate hours, view today, check feasibility. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this single-user local-first v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Collaboration, shared workspaces, roles | Common in project tools. | Contradicts personal single-user scope; requires auth, backend, permissions, conflict handling. | Single-user local data only. Export/share static reports later if ever needed. |
| Application backend/account system | Makes sync and login familiar. | Violates static GitHub Pages/local-first constraint; adds ops, auth, privacy risk. | IndexedDB source of truth plus optional encrypted GitHub backup file. |
| Real-time sync | Feels modern and convenient. | Creates conflicts and distributed state complexity not needed for one user. | Manual or explicit backup sync. Last-write backup with safeguards is enough. |
| AI auto-scheduling | Motion/Reclaim market this heavily; appealing because it removes planning work. | High complexity, low transparency, requires credentials/network if using external AI, can fight user intent. | Deterministic feasibility + suggested distribution with clear rules. |
| External calendar integration | Meetings affect capacity. | Requires OAuth, network, provider APIs, privacy handling, recurring event edge cases. | Manual per-date capacity overrides for v1. Add calendar import only if overrides become painful. |
| Recurring tasks | Common in Todoist/TickTick/Amazing Marvin. | Adds date-generation rules, completion semantics, and recurring workload edge cases. Requirement explicitly defers. | Duplicate task manually or create simple templates later. |
| Subtasks | Users want breakdowns. | Adds nested state, progress rollups, filtering complexity, and UI weight. Requirement excludes v1. | Use notes/checklist text or separate tasks under same milestone. |
| Task dependencies | Useful for projects. | Personal capacity planning core does not need critical path logic; dependencies complicate scheduler and drag changes. | Manual ordering via priority/deadline. Revisit only after core planner validates. |
| Timers, Pomodoro, actual-hours tracking | TickTick, Sunsama, Amazing Marvin offer focus/time tracking. | Shifts product into time tracking/execution. Requirement says v1 tracks planned hours plus actual dates only. | Keep actual start/end dates. Add timers only if planning accuracy needs measured actuals. |
| Habit tracking | TickTick-style productivity suite feature. | Dilutes workload planner into life tracker; recurring semantics required. | Use standalone tasks if needed. Defer habits indefinitely. |
| Notifications/push/email | Users expect reminders. | Push/email conflicts with no backend and browser permission complexity. Not essential to capacity fit. | Dashboard-first review. Browser local reminders can be considered after v1. |
| Complex custom workflows/statuses | Power users like customization. | Adds settings and inconsistent analytics. Single user has known statuses. | Fixed workflow enums. Change only after usage proves mismatch. |
| Complex query language for filters | Todoist-style filters are powerful. | More parser/UI complexity than needed; can delay core workload features. | Simple filter controls and saved views later. |
| Gamification/productivity scores | Todoist Karma-like trend features can motivate. | Vanity metrics distract from realistic planning. | Show actionable load, overdue, and feasibility metrics only. |
| Native mobile apps | Better mobile feel. | Duplicates development and breaks static PWA simplicity. | Responsive installable PWA. |

## Feature Dependencies

```text
Stable IDs
    └──requires──> Entity model: projects, milestones, tasks, planning records

Task CRUD
    └──requires──> Stable IDs
    └──requires──> Core task fields and status workflow

Planned hours per task per day
    └──requires──> Stable task IDs
    └──requires──> Planning record model

Daily load state
    └──requires──> Planned hours per task per day
    └──requires──> Weekly capacity baseline
    └──requires──> Per-date capacity overrides

Today / 7-day / 14-day / month dashboard
    └──requires──> Task CRUD
    └──requires──> Planned hours per task per day
    └──requires──> Daily load state

Feasibility calculator
    └──requires──> Task estimate input
    └──requires──> Date range/deadline
    └──requires──> Daily load state

Suggested distribution
    └──requires──> Feasibility calculator
    └──requires──> Existing workload ledger

Export/import backup
    └──requires──> Stable schema
    └──requires──> All entities and planning records serializable

Encrypted GitHub backup sync
    └──requires──> Export/import backup
    └──requires──> Browser-side encryption
    └──requires──> Explicit user-provided GitHub token/passphrase

Offline PWA
    └──requires──> IndexedDB persistence
    └──requires──> Static asset caching

Collaboration
    └──conflicts──> Single-user local-first v1

AI auto-scheduling
    └──conflicts──> Transparent deterministic local planning v1
```

### Dependency Notes

- **Capacity model before dashboards:** Dashboard load indicators are meaningless until baseline capacity, overrides, and planned-hour records exist.
- **Manual allocation before suggested allocation:** User must be able to inspect and edit allocations before trusting automatic suggestions.
- **Export/import before GitHub sync:** GitHub sync should reuse backup serialization; otherwise two backup paths can diverge.
- **Stable schema before import:** Import without schema versioning risks corrupting local data when app evolves.
- **Offline persistence before PWA polish:** Installability is less valuable if local data writes are not reliable.
- **Anti-features protect roadmap:** Collaboration, recurring tasks, subtasks, dependencies, external calendars, notifications, timers, and habits all add broad feature families that compete with core capacity planning.

## MVP Definition

### Launch With (v1)

Minimum viable product needed to validate core value: "Can planned work realistically fit available time?"

- [ ] Project, milestone, and task CRUD — base data user plans around.
- [ ] Stable UUIDs for projects, milestones, tasks, and planning records — required for durable local-first data.
- [ ] Fixed statuses and priority — enough workflow signal without customization.
- [ ] Task detail fields: name, description, deadline, note, links, progress, actual start/end — explicit requirement.
- [ ] Weekly capacity baseline — required for overload detection.
- [ ] Per-date capacity overrides — required for real personal availability.
- [ ] Planned hours per task per day — core workload ledger.
- [ ] Daily load calculation and available/busy/overloaded state — core feedback loop.
- [ ] Today dashboard — immediate daily usefulness.
- [ ] 7-day, 14-day, next-month workload summaries — forecast overload early.
- [ ] Feasibility calculator with YES/NO and capacity delta — validates key product promise.
- [ ] Suggested distribution across eligible days — turns feasibility into actionable plan.
- [ ] IndexedDB persistence — offline source of truth.
- [ ] Export/import complete backup — protects local data.
- [ ] Responsive Ant Design UI — required platform and usability baseline.
- [ ] Installable offline PWA deployable on GitHub Pages — delivery target.

### Add After Validation (v1.x)

Features to add once core planning model works and user uses app for real work.

- [ ] Encrypted GitHub backup sync — add after local export/import is proven reliable.
- [ ] Workload timeline/heatmap polish — add after daily load data model stabilizes.
- [ ] Saved filters/views — add if task count makes repeated filtering painful.
- [ ] Import preview and merge mode — add after replace-import is safe; merge needs conflict logic.
- [ ] Basic templates/duplicate task — add if repeated similar tasks appear; avoid full recurring engine.
- [ ] Planning history/audit view — add if user needs to understand changed allocations.

### Future Consideration (v2+)

Features to defer until core product proves valuable.

- [ ] Recurring tasks — defer because it adds generation/completion semantics.
- [ ] External calendar import — defer until manual capacity overrides become obvious pain.
- [ ] Local browser notifications — defer until dashboard habit is insufficient.
- [ ] Actual-hours tracking/timers — defer until planning accuracy needs feedback loop.
- [ ] Subtasks/task dependencies — defer because v1 explicitly avoids nested complexity.
- [ ] Advanced auto-scheduler — defer until deterministic lowest-load suggestions show limits.
- [ ] Native mobile apps — defer because PWA is sufficient.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Project/milestone/task CRUD | HIGH | MEDIUM | P1 |
| Stable IDs | HIGH | LOW | P1 |
| Core fields/statuses/priority | HIGH | MEDIUM | P1 |
| Weekly capacity baseline | HIGH | MEDIUM | P1 |
| Per-date capacity overrides | HIGH | MEDIUM | P1 |
| Planned hours per task per day | HIGH | HIGH | P1 |
| Daily load state | HIGH | LOW | P1 |
| Today dashboard | HIGH | MEDIUM | P1 |
| 7/14/month workload summaries | HIGH | MEDIUM | P1 |
| Feasibility calculator | HIGH | HIGH | P1 |
| Suggested distribution | HIGH | HIGH | P1 |
| IndexedDB persistence | HIGH | MEDIUM | P1 |
| Export/import backup | HIGH | MEDIUM | P1 |
| Offline installable PWA | HIGH | MEDIUM | P1 |
| Responsive accessible Ant Design UI | HIGH | MEDIUM | P1 |
| Encrypted GitHub backup sync | MEDIUM | HIGH | P2 |
| Timeline/heatmap polish | MEDIUM | MEDIUM | P2 |
| Saved filters/views | MEDIUM | MEDIUM | P2 |
| Task templates/duplication | MEDIUM | LOW | P2 |
| Import merge mode | MEDIUM | HIGH | P2 |
| Recurring tasks | MEDIUM | HIGH | P3 |
| External calendar integration | MEDIUM | HIGH | P3 |
| Notifications | LOW | MEDIUM | P3 |
| Timers/actual-hours tracking | LOW | MEDIUM | P3 |
| Subtasks/dependencies | LOW | HIGH | P3 |
| AI auto-scheduling | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add after core validates
- P3: Nice to have or intentionally deferred

## Competitor Feature Analysis

| Feature | Todoist | Sunsama | TickTick | Amazing Marvin | Motion/Reclaim | Our Approach |
|---------|---------|---------|----------|----------------|----------------|--------------|
| Projects/lists/tasks | Projects, sections, labels, filters | Pulls tasks from tools and plans daily work | Lists, tags, filters, Kanban/timeline | Multi-level organization and many strategies | Task managers with scheduling | Build only needed hierarchy: project, milestone, task. Keep standalone tasks. |
| Calendar/time planning | Calendar layout for projects/filters/today/upcoming; drag no-date tasks to dates; priority/label/project coloring | Timebox tasks on schedule; daily planning and shutdown rituals | Calendar views, week/month/list, timeline | Calendar view and time blocking | Automatic calendar scheduling | Build daily allocation ledger and simple workload timeline, not full external calendar suite. |
| Capacity/workload warning | Public docs sampled show calendar views, not capacity-first planning | Workload threshold compares planned task time against limit; projected finish vs shutdown | General planning views and focus tools | Capacity estimator gives feedback whether plan is realistic/over capacity | Capacity planning and auto-rescheduling | Make capacity planning core feature, but deterministic and local. |
| Time estimates/planned times | Not emphasized in sampled feature docs | Planned times drive workload warnings | Pomo/focus features | Time estimates and time tracking | Task duration drives scheduling | Support estimated hours and planned hours. Defer actual time tracking. |
| Auto-scheduling | Not primary in sampled docs | Auto-scheduling/timeboxing docs exist | Not primary in sampled docs | Many manual strategies | Core AI/automatic scheduling promise | Avoid AI scheduler. Use transparent lowest-load distribution suggestions. |
| Focus/timers/habits | Productivity trends/Karma | Pomodoro and break reminders | Pomodoro, habit tracker, focus statistics | Pomodoro, focus modes, procrastination tools | Protect focus time | Defer. This product plans workload, not focus behavior. |
| Export/import/local ownership | Not verified from current official page in this pass | Cloud product | Public help index did not verify backup export | Cloud product | Cloud product | Local IndexedDB and complete export/import are table stakes because local-first. |
| Collaboration/team | Todoist has team/business features | Integrates work tools | General productivity suite | Personal productivity | Team capacity appears in Reclaim/Motion pages | Explicitly exclude collaboration and roles. |

## Roadmap Guidance

1. **Data foundation first:** Entities, stable IDs, statuses, IndexedDB, schema versioning. Without this, all planner features become rewrite-prone.
2. **Capacity foundation second:** Weekly capacity, date overrides, planned-hour records, load calculation. This creates core domain model.
3. **Operational UI third:** CRUD, allocation editor, today view, horizon dashboards. User can manage real work.
4. **Feasibility and suggestions fourth:** Calculator and distribution need mature capacity/load data. Build after manual allocation works.
5. **Data safety fifth:** Export/import before optional GitHub sync. Local-first trust depends on backups.
6. **Polish after validation:** Timeline heatmap, saved views, templates. Avoid recurring tasks, external calendars, timers, and AI until core planner proves useful.

## Sources

- Todoist features page — projects, due dates, priorities, filters, labels, calendar views, productivity trends. HIGH confidence. https://todoist.com/features
- Todoist calendar layout help — week/month/agenda/calendar capabilities, drag no-date tasks to dates, visual coloring, calendar limitations. HIGH confidence. https://todoist.com/help/articles/use-calendar-layout-in-todoist-lPHRQTu0o
- Todoist filters help — filters by date, priority, project, label, boolean operators, separate list dashboard views, limitations. HIGH confidence. https://todoist.com/help/articles/introduction-to-filters-V98wIH
- Sunsama homepage — daily planning, timeboxing, workload/weekly review, calendar sync, focus tools. HIGH confidence. https://www.sunsama.com/
- Sunsama daily planning docs — workload threshold, planned times, projected finish time, overload actions. HIGH confidence. https://help.sunsama.com/docs/daily-planning
- Sunsama scheduling docs — timeboxing, auto-scheduling/auto-rescheduling, calendar integration index facts. MEDIUM confidence for detailed behavior because fetched page exposed mostly navigation headings. https://help.sunsama.com/docs/scheduling-task-to-calendar
- TickTick features page — task entry, lists/tags/filters, calendar layouts, Eisenhower Matrix, reminders, habits, Pomodoro. HIGH confidence. https://www.ticktick.com/about/features
- TickTick official help index — focus timer/statistics, calendar subscriptions, week/month/list views, Kanban/timeline/Eisenhower help topics. MEDIUM confidence because help index confirms feature existence, not detailed behavior. https://help.ticktick.com/
- Amazing Marvin homepage/features — day planning, weekly planning, time estimates, time blocking, capacity estimator, time tracking, focus/procrastination strategies, many configurable strategies. HIGH confidence. https://www.amazingmarvin.com/
- Reclaim tasks page — AI task scheduling, auto-rescheduling, priorities, deadline-aware planning, capacity planning claims. HIGH confidence for page claims. https://reclaim.ai/features/tasks
- Reclaim planner page — AI organization, auto-rescheduling, priority levels, availability settings, capacity planning. HIGH confidence for page claims. https://reclaim.ai/features/planner
- Motion task manager page — automatic scheduling, priority rules, deadline-aware planning, calendar workload/capacity claims. HIGH confidence for page claims. https://www.usemotion.com/features/task-manager
- Project requirements read from `D:\personal\task-management\.planning\PROJECT.md` and `D:\personal\task-management\requirement.txt`. HIGH confidence for product-specific scope.

---
*Feature research for: personal offline-first task and workload planning PWA*
*Researched: 2026-09-26*
