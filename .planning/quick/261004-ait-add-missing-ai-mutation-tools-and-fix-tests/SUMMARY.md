---
status: complete
date: 2026-10-04
task: add-missing-ai-mutation-tools-and-fix-tests
---

# Quick Task Summary: Add Missing AI Mutation Tools and Fix Vitest Failures

## What Was Done
1. **Added Full Missing AI Mutation & Query Tools to `src/services/ai/aiTools.ts`**:
   - `manage_reminders`: Enables AI to add, remove, and list reminders with date, time, and notes on tasks, projects, or milestones (with native desktop notification integration).
   - `link_document` & `unlink_document`: Enables AI to create and remove bidirectional links between documents and tasks, projects, or milestones via `documentLinkRepo.ts`.
   - `query_notifications`: Queries active notifications and alerts (overdue, overload, due-soon, stale, reminders, timer alerts) via `evaluateNotifications`.
   - `dismiss_notification`: Temporarily dismisses dismissible alerts for today via `dismissAlertToday`.

2. **Expanded Entity Mutation Tools with Previously Omitted Fields**:
   - `create_task` & `update_task`: Added `reminders`, `isRecurring`, `recurrenceFrequency`, `recurrenceInterval`, `recurrenceDaysOfWeek`, `recurrenceEndDate`, and `tags`.
   - `create_project` & `update_project`: Added `reminders`.
   - `create_milestone` & `update_milestone`: Added `reminders`.
   - `create_note` & `update_note`: Added `type` (`quick_note`, `document`, `folder`), `parentId` (folder hierarchy), and `tags`.
   - `query_projects` & `query_milestones`: Added `reminders` array and `remindersCount` to projected output.

3. **Updated Action Confirmation & Tool Mutation Describers**:
   - Added new tools to `MUTATION_TOOLS` and `describeToolMutation` with human-readable Vietnamese descriptions.
   - Updated `isMutationTool` to accept optional `args` so `manage_reminders` with `action: 'list'` does not require mutation confirmation.

4. **Fixed 3 Vitest Test Failures**:
   - `tests/components/notes/DocFolderTree.test.tsx`: Corrected selector to find `FolderAddOutlined` (`.anticon-folder-add`), match modal title, placeholder, and submit button `Tạo thư mục`.
   - `tests/views/NotesView.test.tsx`: Replaced single-element matchers `findByText` with `findAllByText` / `getAllByText` to accommodate document titles appearing in both `DocListPane` and `DocEditorPane`.
   - `tests/ai/aiTools.test.ts`: Updated total tool count assertion to 51, tested all new tools (`manage_reminders`, `link_document`, `unlink_document`, `query_notifications`, `dismiss_notification`), and verified expanded mutation fields.

## Verification
- `npx vitest run tests/ai/ tests/views/NotesView.test.tsx tests/components/notes/DocFolderTree.test.tsx`: 18 test files passed (174/174 tests).
- `npx tsc --noEmit`: Clean type check with zero errors.
- `npm run build`: Production build and PWA bundle succeeded in 866ms.
