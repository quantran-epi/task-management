# Quick Plan: Add Comprehensive Missing AI Tools and Mutation Capabilities

## Problem Statement
The user noticed `aiTools` was missing attachment mutations and feared running into future scenarios where AI claims "there are no tools for that."
A full repository audit identified functional gaps where business logic exists in repositories and utilities, but no corresponding AI tools were registered in `src/services/ai/aiTools.ts`:
1. **Note Attachments**: Zero AI tools for `db.noteAttachments` (`addNoteAttachment`, `deleteNoteAttachment`, `getNoteWithAttachments`).
2. **Note Lifecycle & Trash**: Missing soft-delete vs permanent delete, `restore_note`, `query_trash_notes`, and `batch_create_notes`. Missing `slug`, `entityType`, `entityId` in `update_note`.
3. **Doc Backlinks & Auto-linking**: Missing `get_document_backlinks` (`getBacklinksForDoc`) and `auto_link_document` (`detectReferencedEntities` + `linkEntitiesToDoc`).
4. **Standup Reports**: Missing `generate_standup_report` (`formatStandupSummary`).
5. **Item Health & Risk Insights**: Missing `get_item_insight` (`analyzeTaskInsight`, `analyzeProjectInsight`, `analyzeMilestoneInsight`).
6. **Workload Allocations**: Missing `batch_plan_allocations` and `clear_allocations`.
7. **Taxonomy & Tags**: Missing `query_distinct_tags` (`getDistinctOpsOwners`, `getDistinctBusinessAnalysts`, note tags).
8. **Notification Reset**: Missing `clear_dismissed_alerts` (`clearDismissedAlerts`).
9. **Task Batch & Recurrence**: Missing `batch_create_tasks`, `batch_update_tasks`, and `spawn_recurring_task_instance`.
10. **Query notes expansion**: Add `type`, `parentId`, and `tags` filtering to `query_notes`.

## Planned Changes

### 1. `src/services/ai/aiTools.ts`
- Register new tools in `AI_DATABASE_TOOLS`:
  - `manage_note_attachments`: Add, delete, or list attachments for notes.
  - `restore_note`: Restore soft-deleted notes from trash.
  - `query_trash_notes`: Query notes in trash.
  - `batch_create_notes`: Create multiple notes/documents in bulk.
  - `get_document_backlinks`: Query tasks, projects, and notes linking to a document.
  - `auto_link_document`: Auto-detect entity mentions in a document and link them.
  - `generate_standup_report`: Generate standard markdown standup report.
  - `get_item_insight`: Deep health check and risk analysis for task/project/milestone.
  - `batch_plan_allocations`: Plan multiple days of allocations in one call.
  - `clear_allocations`: Bulk clear allocations by task or date range.
  - `query_distinct_tags`: Discover existing Ops owners, Business Analysts, and note tags.
  - `clear_dismissed_alerts`: Reset muted alerts for today.
  - `batch_create_tasks`: Create multiple tasks in one call.
  - `batch_update_tasks`: Batch update status/priority/progress on task IDs.
  - `spawn_recurring_task_instance`: Manually trigger the next recurrence of a task.
- Expand existing tools:
  - `delete_note`: Support optional `permanent?: boolean` (defaults to false = soft delete).
  - `update_note`: Add `slug`, `entityType`, `entityId` parameters.
  - `query_notes`: Add `type`, `parentId`, `tags` filter parameters.
- Register mutation tool names in `MUTATION_TOOLS`, `isMutationTool`, `describeToolMutation`, and `describeToolMutationWithContext`.
- Implement execution handlers in `executeAiTool`.

### 2. Tests
- Update `tests/ai/aiTools.test.ts` to assert all new tools and verify tool execution for:
  - `manage_note_attachments` (add, list, delete)
  - `restore_note` and `query_trash_notes`
  - `get_document_backlinks`
  - `generate_standup_report`
  - `get_item_insight`
  - `batch_plan_allocations` and `clear_allocations`
  - `query_distinct_tags`
  - `batch_create_tasks` and `batch_update_tasks`

## Verification
- Run `npx vitest run tests/ai/aiTools.test.ts`
- Run `npm run build`
