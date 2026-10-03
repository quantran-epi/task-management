# Quick Plan: AI Drawer Header Cleanup, Action Mutations with Confirmation, and Inline Input

## Objective
1. Remove context picker from AI drawer header (redundant with the sub-bar below it).
2. Expand AI tools with complete database mutations (tasks, projects, milestones, allocations, work sessions, active timers, capacity rules/overrides, notes).
3. Introduce confirmation prompt (Yes/No buttons or text confirmation) whenever AI proposes any mutation before applying changes to the database.
4. Move the chat input send button inline with the textarea in `ChatInputBar` to save vertical space.
5. Verify via targeted tests (`npm run test -- tests/ai/`).

## Tasks
1. **ChatHeader & ChatInputBar UI Updates**:
   - In `src/components/ai/ChatHeader.tsx`: Remove `onOpenScopePicker`, `scopeOptions`, `scopeLabel`, and the context picker UI elements.
   - In `src/components/ai/ChatInputBar.tsx`: Re-layout container into flex-row with inline textarea and action button (Send/Stop) to minimize vertical footprint.
   - In `src/components/ai/AIChatDrawer.tsx`: Update `ChatHeader` props usage.
2. **AI Action Tools in `aiTools.ts`**:
   - Define and implement full mutations:
     - `create_task`, `update_task`, `update_task_checklist`, `reparent_task`, `delete_task`
     - `create_project`, `update_project`, `delete_project`
     - `create_milestone`, `update_milestone`, `delete_milestone`
     - `plan_allocation`, `delete_allocation`
     - `log_work_session`, `update_work_session`, `delete_work_session`
     - `start_timer`, `pause_timer`, `stop_and_log_timer`, `discard_timer`
     - `update_capacity_rule`, `set_capacity_override`, `remove_capacity_override`
     - `create_note`, `update_note`, `delete_note`
   - Add `isMutationTool(toolName: string): boolean` helper and `describeToolMutation(toolName: string, args: Record<string, any>): string` helper.
3. **Interactive Confirmation in `AIChatDrawer.tsx`**:
   - Intercept mutation tool calls in SSE loop.
   - Pause loop, queue pending confirmation state `{ id, toolName, args, summary }`.
   - Render inline confirmation prompt in chat with [Có / Yes] and [Không / No] buttons.
   - Support typing "yes", "y", "có", "ok" or "no", "n", "không" into chat input.
   - On confirm: execute tool, log debug, resume stream/loop with tool result.
   - On cancel: append cancellation message to model, resume stream/loop.
4. **Verification**:
   - Run targeted test suite: `npx vitest run tests/ai/`.
   - Run typescript check: `npm run typecheck` or `npx tsc --noEmit`.
