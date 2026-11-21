---
id: 261121-ev5
phase: quick
plan: 261121-ev5
subsystem: ui
tags: [tool-explorer, ai, inline-assistant, model-picker, nine-router]
requires: []
provides:
  - Inline AI assistant (edit/ask) in all four utility tool editors
  - Per-tool AI model selection persisted in IndexedDB
affects: [tool-explorer, workbench-ui, ai-settings]
tech-stack:
  added: []
  patterns:
    - Shared UtilityToolAIAssistant component with streamChatCompletion + AbortController
    - Model preference map stored under db.settings key utility_tool_ai_models
key-files:
  created:
    - src/workbench/toolwindows/UtilityToolAIAssistant.tsx
    - src/workbench/__tests__/UtilityToolAIAssistant.test.tsx
  modified:
    - src/workbench/toolwindows/UtilityToolPanel.tsx
    - src/workbench/__tests__/UtilityToolPanel.test.tsx
    - src/services/configProfiles/catalog.ts
key-decisions:
  - "One shared component for all four tools; editor passes content and receives replacement only after user confirms"
  - "Text Compare edits pane B only; pane A is read-only context"
  - "Reuse streamChatCompletion and cached model list; no network call on modal open"
patterns-established:
  - "Utility editors expose content/onApply pair to the shared AI assistant"
  - "Per-tool AI model preference lives in a single portable settings map"
requirements-completed: []
duration: ~10min
completed: 2026-11-21
---

# Quick Task 261121-ev5 Summary: AI assistant inline cho utility tool editors

**Status:** Completed (code + scoped tests + typecheck + build). Chrome UAT left to orchestrator.
**Branch:** `feature/intellij-workbench`

## What shipped

- One shared component `src/workbench/toolwindows/UtilityToolAIAssistant.tsx` for all four utility editors. Modal has edit/ask modes, streamed responses with abort, extracted fenced output, 2-column comparison/preview/edit views, Markdown answers, model picker persisted per tool in Dexie under `utility_tool_ai_models`.
- Pure `extractProposedContent(raw)` uses the existing `stripThinkingBlocks` from NineRouter client; takes the last fenced block, preserves inner indentation.
- Four editors in `UtilityToolPanel.tsx` gained an accessible `AI · <tool>` button and pass their current content through `onApply`; Text Compare passes pane A as read-only context and only pane B can be changed.
- `utility_tool_ai_models` registered as `portable` in `PROFILE_KEY_CATALOG`.
- Scoped tests: 10 assistant tests + 17 panel tests (7 original + 10 new integration) all green. `npx tsc --noEmit` clean. `npm run build` succeeded.

## Commits

- `3689e0cc` feat(261121-ev5): add shared inline AI assistant for utility editors
- `a268db51` feat(261121-ev5): wire inline AI assistant into four utility editors

## Files changed

- `src/workbench/toolwindows/UtilityToolAIAssistant.tsx` (new)
- `src/workbench/toolwindows/UtilityToolPanel.tsx`
- `src/workbench/__tests__/UtilityToolAIAssistant.test.tsx` (new)
- `src/workbench/__tests__/UtilityToolPanel.test.tsx`
- `src/services/configProfiles/catalog.ts`

## Deviations from plan

- Fixed two pre-existing strict-index errors in `UtilityToolPanel.test.tsx` lines 12-13 (`separators[0]?.`) so `tsc --noEmit` can be clean; no behavior change.
- Added `aria-label` to the four AI buttons so integration tests can query them unambiguously.
- Added a visible read-only context note inside the assistant for Text Compare (`contextLabel`) in addition to sending pane A in the prompt.
- No new dependency, no full-chat path touched, no file outside plan scope.

## Verification notes

- Tests run: `npx vitest run src/workbench/__tests__/UtilityToolAIAssistant.test.tsx src/workbench/__tests__/UtilityToolPanel.test.tsx` — 27 passed.
- Full Vitest suite intentionally not run (project rule: >1h).
- Chrome UAT performed by orchestrator: all four tools show AI button; modal opens with correct tool name and content; ask mode hides apply button; model picker shows cached models; missing-API-key path shows clear warning and leaves editor unchanged; Text Compare shows read-only context A and edits pane B. Console: only pre-existing antd deprecation and panel resize warnings.
