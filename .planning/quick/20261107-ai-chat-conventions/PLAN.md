# Quick Task: Wire Global and Project Conventions into AIChatDrawer System Prompt

## Problem
Currently, Global Conventions (from `db.settings.global_conventions`) and Project/Repo Conventions (from remote `CONVENTIONS.md` over SSH) are only attached in the SDLC Workflow prompt composer (`StepChatPanel` via `composeSdlcTurn`).
General AI Chat in `AIChatDrawer.tsx` does not include these conventions in its `systemPromptContent`, so the AI assistant in general chat is unaware of organization or project-level technical conventions.

## Solution
1. In `AIChatDrawer.tsx`:
   - Import `getGlobalConventions`, `loadRepoConventions` from `../../services/conventionService`.
   - Import `buildConventionsSegment` from `../../services/ai/sdlcPromptComposer`.
   - Before building `systemPromptContent` in `handleSendTurn`:
     - Load global conventions via `getGlobalConventions(db)`.
     - Detect active/effective project ID:
       - If `effectiveScope.type === 'project'`, use `effectiveScope.id`.
       - If `effectiveScope.type === 'task'`, fetch task or check `task.projectId`.
       - If `effectiveScope.type === 'milestone'`, fetch milestone or check `milestone.projectId`.
       - If none, check if any project ID is mentioned in `projectIds`.
     - If `projectId` is present, probe and load remote conventions via `loadRepoConventions(projectId, db)`.
     - Compose conventions text via `buildConventionsSegment({ global: globalConv, repo: repoConv?.content, repoPath: repoConv?.foundPath })`.
     - If `conventionsSegment` is non-empty, append it to `systemPromptContent`.
2. Tests:
   - Add/update unit tests in `tests/ai/AIChatDrawerConventions.test.ts` or targeted test verifying conventions are included in `systemPromptContent`.
