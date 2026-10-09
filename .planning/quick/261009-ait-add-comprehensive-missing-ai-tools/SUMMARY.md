# Quick Task Summary: Comprehensive Missing AI Tools and Mutation Capabilities

## Changes Completed
- **`src/services/ai/aiTools.ts`**:
  - Registered 15 new tools (total tools increased from 51 to 66):
    - `manage_note_attachments`: Add, delete, and list image/file attachments on notes and documents.
    - `restore_note`: Restore soft-deleted notes/documents from trash.
    - `query_trash_notes`: Inspect items currently in trash.
    - `batch_create_notes`: Bulk create notes/documents/folders in one call.
    - `get_document_backlinks`: Inspect incoming entity links to a document.
    - `auto_link_document`: Automatically scan and wiki-link detected entity mentions.
    - `generate_standup_report`: Generate standardized Vietnamese markdown standup reports.
    - `get_item_insight`: Deep health check, risk assessment, and velocity metrics for tasks, projects, and milestones.
    - `batch_plan_allocations`: Plan multiple days of allocations in a single call.
    - `clear_allocations`: Clear allocations in bulk by task ID, date, or date range.
    - `query_distinct_tags`: Discover existing Ops owners, Business Analysts, and note tags.
    - `clear_dismissed_alerts`: Reset muted notification alerts for today.
    - `batch_create_tasks`: Create multiple tasks in one call.
    - `batch_update_tasks`: Bulk update status/priority/progress on task IDs.
    - `spawn_recurring_task_instance`: Manually trigger next occurrence of recurring task template.
  - Expanded existing tools:
    - `delete_note`: Added `permanent?: boolean` parameter for soft-delete (trash) vs permanent wipe.
    - `update_note`: Added `slug`, `entityType`, and `entityId` parameters for re-binding and slug customization.
    - `query_notes`: Added `type`, `parentId`, and `tags` filtering parameters, plus `attachmentsCount` enrichment.
    - `get_item_details`: Added `attachmentsCount` to sticky notes mapping.
  - Registered all new mutation tools in `MUTATION_TOOLS`, `isMutationTool`, `describeToolMutation`, and `describeToolMutationWithContext`.
- **`tests/ai/aiTools.test.ts`**:
  - Updated tool count assertion to 66.
  - Added test coverage verifying execution and mutation reporting for all new tools.

## Verification
- Vitest: All 58 unit tests in `tests/ai/aiTools.test.ts` passed. All 221 tests across `tests/ai/` passed.
- TypeScript build: `npm run build` completed with zero errors and clean output.
