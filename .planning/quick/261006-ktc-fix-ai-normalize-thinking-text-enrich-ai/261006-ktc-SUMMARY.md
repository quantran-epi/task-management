# Quick Task 261006-ktc: Fix AI Normalize Thinking Text, Enrich Mutation Context & Doc Grounding Summary

## Overview

Resolved user experience issues across document normalization, AI chat confirmations, and document editor workflows:
1. Stripped reasoning/thinking tags (`<think>`, `<thought>`) and unclosed streaming chunks in `NormalizeDocModal.tsx`, and reinforced prompt instructions forbidding reasoning text.
2. Enriched AI tool mutation descriptions with resolved entity names (tasks, projects, milestones, notes) and formatted Vietnamese field diffs (`formatFieldChanges`, `describeToolMutationWithContext`).
3. Grounded document context in `AIChatDrawer.tsx` when scoped to a note, expanded "Hỏi AI" in `DocEditorPane.tsx` with document metadata and analysis intent, and removed the duplicate ToC icon button.

## Key Changes

### 1. NormalizeDocModal & Thinking Tag Stripping
- Implemented and exported `stripThinkingText(text: string): string` to remove closed `<think>...</think>`, `<thought>...</thought>` blocks and active unclosed trailing thinking tags during streaming.
- Sanitized stream chunk accumulation using `stripThinkingText(accumulated)`.
- Updated normalization prompt to strictly prohibit thinking tags and reasoning outputs.
- Added unit tests in `NormalizeDocModal.test.tsx` verifying reasoning blocks are filtered out during stream and upon acceptance.

### 2. Enriched Tool Mutation Descriptions
- Implemented `formatFieldChanges(args, ignoredKeys)` in `aiTools.ts` mapping attributes to human-readable Vietnamese labels (e.g. `Trạng thái: "Done"`, `Ưu tiên: "High"`, `Hạn chót: 2026-10-15`, `Ước tính: 60p`).
- Implemented `describeToolMutationWithContext(toolName, args, db)` querying IndexedDB for affected entity names (`db.tasks`, `db.projects`, `db.milestones`, `db.notes`), with graceful fallback.
- Added comprehensive unit tests in `aiTools.test.ts` covering entity name lookups, field formatting, and fallback logic.

### 3. AIChatDrawer Grounding & DocEditorPane Refinements
- In `AIChatDrawer.tsx`, added document scope grounding branch using `serializeDocumentContext(note)` when `effectiveScope.type === 'document'`.
- Updated mutation confirmation modal generation to asynchronously resolve human-readable entity summaries via `describeToolMutationWithContext`.
- In `DocEditorPane.tsx`, expanded `handleAskAI` prompt with document title, word count, tags, and actionable analysis request.
- Removed the redundant icon-only Table of Contents button in `DocEditorPane.tsx` toolbar, retaining the single labeled "Mục lục" button.
- Added component unit tests in `DocEditorPane.test.tsx` and `AIChatDrawer.test.tsx`.

## Verification Results

Targeted Vitest test suites:
```bash
npm test tests/components/notes/NormalizeDocModal.test.tsx tests/ai/aiTools.test.ts tests/components/notes/DocEditorPane.test.tsx tests/ai/AIChatDrawer.test.tsx
```
Passed: 4 test files, 88 tests passed.

Production build check:
```bash
npm run build
```
Built successfully with zero TypeScript errors.

## Commits
- `00b2215`: feat(notes): strip thinking tags in normalize doc modal and refine prompt
- `d6aab76`: feat(ai): enrich mutation descriptions with entity context and formatted changes
- `5ff5a36`: feat(ai): ground document context in chat, enrich Ask AI prompt, and remove redundant ToC button
- `9c0247e`: fix(notes): clean up unused imports and satisfy typescript strict checks
