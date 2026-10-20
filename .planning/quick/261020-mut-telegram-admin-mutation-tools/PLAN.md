---
task: 261020-mut
title: Support full mutation tools for admin on Telegram with preview and confirmation loop
created: 2026-10-20
status: in_progress
---

# Plan: Telegram Admin Mutation Tools with Preview and Confirmation Loop

## Problem Statement
Currently, Telegram AI Gateway supports reading contexts, answering questions, and querying knowledge with federated retrieval. However, when an admin asks to perform actions on TaskMate (create task, update status, log time, create note, etc.), the intent is classified as `operate_taskmate`, but no mutation tool is executed. The user requested:
1. Support all existing mutation tools available in TaskMate (same as AIChatDrawer via `AI_DATABASE_TOOLS` and `executeAiTool`).
2. Strictly restrict mutation capability to **Admin** only. Non-admin users are rejected with an informative scope error.
3. Admin mutation requests are **exempt from quota** (unlimited operations, no quota deduction).
4. 2-step Interactive Confirmation Flow:
   - User expresses intent -> LLM drafts tool calls.
   - Bot detects mutation tool calls, generates human-friendly preview (`describeToolMutationWithContext`), stores pending mutation state in memory for the admin's chatId.
   - Bot replies with preview details and asks for confirmation (supports "OK", "xác nhận", "đồng ý" or "hủy", "cancel", or adjustments).
   - If admin asks for adjustments: conversational turns update the pending draft.
   - If admin confirms ("OK" / "xác nhận"): executes `executeAiTool`, applies to IndexedDB, reports result, clears pending state.
   - If admin cancels ("Hủy"): cancels action, clears state, no data touched.

## Key Changes
1. `src/services/telegram/telegramAdminWizard.ts` (or dedicated `telegramMutationSession.ts`):
   - Manage pending mutation session: `getPendingMutation(chatId)`, `setPendingMutation(chatId, state)`, `clearPendingMutation(chatId)`.
   - Track `toolName`, `args`, `summary`, `timestamp`.
2. `src/services/telegram/telegramHeadlessWorker.ts`:
   - Admin check & Quota bypass: when user is Admin and intent is `operate_taskmate` or dealing with pending mutation, bypass quota consumption.
   - Intercept confirmation/cancellation text ("ok", "xác nhận", "hủy", "cancel") when `pendingMutation` exists.
   - If confirmed: execute `executeAiTool`, report outcome.
   - If cancelled: abort and notify.
   - If conversational adjustment or new mutation request:
     - Run tool-calling LLM loop (similar to `AIChatDrawer` tool execution harness) using `AI_DATABASE_TOOLS`.
     - When a mutation tool is called by LLM, intercept it before DB write, generate `describeToolMutationWithContext`, set pending state, and reply with confirmation prompt.
     - When a read tool is called (`query_tasks`, `query_projects`, etc.), execute immediately to give context to LLM.
3. Tests:
   - Add unit tests covering:
     - Non-admin blocked from `operate_taskmate`.
     - Admin intent `operate_taskmate` does not consume quota.
     - Draft proposal generation and pending state storage.
     - Confirmation ("OK") triggers `executeAiTool` and commits.
     - Cancellation ("Hủy") clears pending without DB changes.
     - Adjustment modifies pending draft.
