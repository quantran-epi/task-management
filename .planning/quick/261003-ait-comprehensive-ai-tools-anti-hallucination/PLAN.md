# Quick Plan: 261003-ait-comprehensive-ai-tools-anti-hallucination

Add comprehensive AI tools covering all app domains (worklogs, timer, planner, capacity, analytics, notes, attention, recurring, system status) and enforce strict evidence-based anti-hallucination grounding.

## Context
User requires:
- Ability to ask AI about *every aspect* of the app without AI guessing or responding with dangerous fabrications.
- Current AI harness has only 4 tools (`query_tasks`, `query_projects`, `query_milestones`, `get_item_details`).
- Zero tools exist for `workSessions`, `activeTimers`, `plannedAllocations`, `capacityRules`, `capacityOverrides`, `notes` (standalone), `analytics`, `recurrence`, or system sync/backup status.
- Current tools drop key fields (e.g. `query_tasks` drops recurring info, dates, logged minutes).
- System prompt lacks current date and anti-hallucination instructions.

## Tasks

### Task 1: Strict Anti-Hallucination System Prompt & Temporal Grounding
- In `src/components/ai/AIChatDrawer.tsx`:
  - Dynamically inject current date, time, and day-of-week into the system instruction using `dayjs` and `getTodayDateString`.
  - Add explicit, non-negotiable instruction:
    "You are an assistant with direct tool access to the user's local database. CRITICAL RULE: NEVER GUESS, ASSUME, OR INVENT DATA. Every statement regarding tasks, status, time spent, allocations, capacity, deadlines, notes, or system state MUST be strictly grounded in concrete evidence returned by tools or provided in context. If data is missing or not recorded in the database, explicitly state that it is not recorded. Never extrapolate."
  - List available tools in prompt instructions so AI actively leverages them.

### Task 2: Enrich Existing Tools (`query_tasks`, `get_item_details`)
- In `src/services/ai/aiTools.ts`:
  - `query_tasks`:
    - Pre-index projects, milestones, and workSessions for fast lookup.
    - Include `projectName`, `milestoneName`, `totalLoggedMinutes`.
    - Include `isRecurring`, `recurrenceFrequency`, `actualStartDate`, `actualEndDate`, `remindersCount`, `opsOwners`, `businessAnalysts`.
  - `get_item_details`:
    - When `type === 'task'`: attach `projectName`, `milestoneName`, `workSessionsSummary` (`totalLoggedMinutes`, `sessionCount`, `lastSessionDate`), and `plannedAllocations` (dates & allocated minutes).
    - When `type === 'project'`: attach milestone count, task count, total estimate, total logged minutes.

### Task 3: Implement All Missing AI Tools in `src/services/ai/aiTools.ts`
1. **Worklogs & Timer:**
   - `query_worklogs`: search/filter `workSessions` by `taskId`, `projectId`, `startDate`, `endDate`, `limit`. Return aggregated `totalLoggedMinutes` and sessions array.
   - `get_active_timer`: check `activeTimers` table. Return current active timer task ID, task name, status, elapsed minutes, segments.
2. **Planner & Capacity:**
   - `get_daily_schedule`: query `plannedAllocations` for `date` (or `startDate` to `endDate`), join task details, compute daily capacity limit from `capacityRules`/`overrides`, evaluate overload status.
   - `check_capacity_feasibility`: given `date` and `requiredMinutes`, check remaining net capacity and return feasibility verdict (`available`, `overloaded`, `full`).
3. **Daily Review & Insights:**
   - `get_day_insight`: compare planned vs actual minutes per task for `date`, accounting for running timer minutes (via `src/utils/dayInsight.ts`).
4. **Analytics & Bias:**
   - `get_analytics_summary`: aggregate estimate vs actual, estimation bias, workType breakdown, total logged minutes using `src/utils/analytics.ts`.
5. **Notes & Scratchpad:**
   - `query_notes`: search text in `notes` table, filter by `isPinned`, `entityType` (`task`, `project`, `milestone`, or unattached/standalone), `entityId`.
6. **Attention & Recurring:**
   - `query_attention_items`: aggregate overdue tasks, due today, scheduled today, upcoming deadlines, active reminders using `src/utils/dashboard.ts`.
   - `query_recurring_tasks`: list all tasks with `isRecurring === true` and their recurrence schedules.
7. **System Status & Sync:**
   - `get_system_status`: return last backup metadata, GitHub auto-sync status (`last_synced_at`, dirty state, last error), SQLite sync status. Redact all tokens/credentials.

### Task 4: Unit Tests & Verification
- In `tests/aiTools.test.ts`:
  - Test all new tool definitions and execution with `fake-indexeddb`.
  - Verify `query_worklogs`, `get_active_timer`, `get_daily_schedule`, `get_day_insight`, `query_notes`, `get_system_status`, `query_attention_items`, etc.
  - Verify enriched fields in `query_tasks` and `get_item_details`.
  - Verify anti-hallucination prompt format.
- Run `npm test` and `npm run build`.
