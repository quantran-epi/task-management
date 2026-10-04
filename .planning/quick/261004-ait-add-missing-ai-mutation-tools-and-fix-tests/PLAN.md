# Quick Plan: Add Missing AI Mutation Tools and Fix Vitest Failures

## Context
1. User asked AI to create a reminder, but AI claimed PlannerMate lacks reminders because `src/services/ai/aiTools.ts` had no reminder tools and omitted reminder parameters from task/project/milestone creation.
2. Full repository audit revealed missing AI capabilities:
   - Reminders: No `manage_reminders` tool; `create_task`/`update_task`/`create_project`/`update_project`/`create_milestone`/`update_milestone` omit `reminders`.
   - Recurring tasks: `create_task`/`update_task` omit recurrence configuration (`isRecurring`, `recurrenceFrequency`, `recurrenceInterval`, `recurrenceDaysOfWeek`, `recurrenceEndDate`).
   - Knowledge Base / Docs: `create_note`/`update_note` omit `type` (`quick_note` | `document` | `folder`), `parentId`, `tags`.
   - Document Linking: Missing `link_document` and `unlink_document` tools.
   - Notifications: Missing `query_notifications` and `dismiss_notification` tools.
   - Tags: `update_task` missing `tags`.
3. Vitest test failures:
   - `tests/views/NotesView.test.tsx`: TestingLibraryElementError on multiple elements with "Inbox Doc" and "Meeting Notes".
   - `tests/ai/aiTools.test.ts`: Expected tool count assertion mismatch.

## Proposed Changes
1. **`src/services/ai/aiTools.ts`**:
   - Register new tools in `AI_DATABASE_TOOLS`:
     - `manage_reminders`: Add, remove, or list reminders on tasks, projects, or milestones.
     - `link_document` & `unlink_document`: Link/unlink documents to tasks, projects, or milestones using `documentLinkRepo.ts`.
     - `query_notifications`: View current active alerts evaluated via `evaluateNotifications`.
     - `dismiss_notification`: Dismiss an alert for today via `dismissAlertToday`.
   - Expand existing tools:
     - `create_task`: Add `reminders`, `isRecurring`, `recurrenceFrequency`, `recurrenceInterval`, `recurrenceDaysOfWeek`, `recurrenceEndDate`.
     - `update_task`: Add `reminders`, `isRecurring`, `recurrenceFrequency`, `recurrenceInterval`, `recurrenceDaysOfWeek`, `recurrenceEndDate`, `tags`.
     - `create_project` & `update_project`: Add `reminders`.
     - `create_milestone` & `update_milestone`: Add `reminders`.
     - `create_note` & `update_note`: Add `type`, `parentId`, `tags`.
   - Implement handlers in `executeAiTool`, update `isMutationTool` and `describeToolMutation`.

2. **`tests/views/NotesView.test.tsx`**:
   - Use `getAllByText` / `findAllByText` to handle elements present in both list pane and editor header.

3. **`tests/ai/aiTools.test.ts`**:
   - Update expected tool count assertion and add unit test coverage for new mutation tools and expanded fields.

## Verification
- Run `npx vitest run tests/views/NotesView.test.tsx tests/components/notes/DocFolderTree.test.tsx tests/ai/aiTools.test.ts`
- Run `npm run build`
