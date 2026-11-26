---
status: resolved
trigger: "Hiện tại khi AI chat panel, mở tab chat 1 câu gì đó, AI session working, ở footer app có hiện indicator show AI chat đang chạy, khi click vào đó, nó mở AI chat panel nhưng bị xoá mất đoạn hội thoại đang chat, kiểm tra đi, nó đang không mở đúng tab của AI session đó, fix cho hoàn hảo đi, đừng làm ảnh hưởng session khác đang chay"
created: 2026-11-25T00:00:00Z
updated: 2026-11-25T21:00:00Z
---

## Current Focus

next_action: none — fix applied, scoped tests green (only pre-existing BudgetTopUpModal locale failure remains)

## Symptoms

expected: Click footer AI-working indicator -> AI chat panel opens and focuses exactly the running AI session/tab; all messages in that session preserved; other running sessions keep their tab and state unchanged.
actual: Clicking indicator opens AI chat panel but wipes the ongoing conversation and does not open the correct AI session tab.
errors: None reported.
timeline: Reported 2026-11-25. Prior related session `ai-progress-indicator-wrong-tab.md` (2026-11-17) fixed wrong tab title only; user chose a new session for this regression.
reproduction: Open AI chat panel, open a chat tab, send a message so the AI session is working, wait for footer indicator, click it -> conversation disappears / wrong tab.
scope: Footer indicator click path, AI chat panel tab routing, session/message persistence. Must not disturb other running sessions.

## Eliminated

- Team-run path (previous session `ai-progress-indicator-wrong-tab.md`): that fix corrected only the tab *title*. This regression is the non-team path and a wrong-tab-focus/data-scope problem, not a label problem.

## Evidence

- timestamp: 2026-11-25T20:15:00Z
  checked: src/components/ai/ActiveAiTurnIndicator.tsx handleOpenChat (pre-fix lines 68-81)
  found: Non-team click did `openChat({ type: 'global', id: turn.scopeKey, title: turn.title })`. `turn.scopeKey` is a scope KEY (`task:<id>`, `cr:<id>`, `global`), but it was passed as an entity `id` under a hardcoded `type: 'global'`. `AIChatContext.openChat` only persists that scope, so the drawer switched to a nonexistent global scope id and queried a different set of tabs/threads.
  implication: Root cause of "conversation disappears" — the running turn's scope was replaced with a wrong one. Also never focused the running tab.

- timestamp: 2026-11-25T20:16:00Z
  checked: src/components/ai/AIChatDrawer.tsx onStatus registerTurn (pre-fix lines 577-589) and src/services/ai/aiTurnManager.ts ActiveAiTurn.meta.tabId
  found: Drawer turns register with `id: tabId` and `scopeKey: scopeKeyRef.current`, but did not publish `meta.tabId` even though the field exists. `meta.tabId ?? turn.id` therefore recovers the exact running tab id.
  implication: Owner fix = publish the tab id from the drawer, consume it at the indicator.

- timestamp: 2026-11-25T20:18:00Z
  checked: src/db/repositories/chatTabRepo.ts threadScopeParts / setActiveTab, src/db/repositories/chatRepo.ts buildScopeKey
  found: `threadScopeParts(scopeKey)` already parses a scope key into `{scopeType, entityId}` with a whitelist and a safe global fallback. `setActiveTab(scopeKey, tabId)` flips the active flag only within one scope, so focusing one tab cannot disturb tabs of other scopes.
  implication: Reuse these existing helpers instead of writing new parsing/mutation logic.

- timestamp: 2026-11-25T20:22:00Z
  checked: tests/ai/ActiveAiTurnIndicator.test.tsx (3 new regression cases) + tests/ai/FooterIndicatorFocus.test.tsx (integration case)
  found: Unit tests assert `openChatAtTab` receives the parsed scope and exact tab id (task/cr/global, single and multi-turn dropdown). Integration test seeds 2 tabs in one scope, activates the idle one, registers a running turn on the other, clicks the indicator -> active tab becomes the running one, both tabs survive. All pass. Only the pre-existing `BudgetTopUpModal` "12,000 vs 12000" locale failure remains (confirmed present on unmodified HEAD via stash).
  implication: Fix verified; no regression in adjacent drawer-tab tests (flaky pre-existing isolation failures confirmed on HEAD too).

## Resolution

root_cause: Clicking the footer/progress indicator for a non-team turn called `openChat({ type: 'global', id: turn.scopeKey })` — a scope KEY was passed as an entity id under a hardcoded `global` type. The drawer then switched scope and loaded a different tab/thread set, hiding the running conversation; the indicator also never focused the specific running tab. The drawer already publishes `meta.tabId` capability but was not filling it.

fix: (1) Drawer publishes `meta: { tabId }` when registering a turn. (2) `AIChatContext` gains one-shot `openChatAtTab(scope, tabId)` + `focusRequest`/`clearFocusRequest` (not persisted). (3) Indicator parses `turn.scopeKey` via `threadScopeParts` into a real `{type, id}` scope and calls `openChatAtTab(scope, turn.meta?.tabId ?? turn.id)`. (4) Drawer consumes the request only when its scope matches and the target tab exists, focusing via existing `setActiveTab` (scope-scoped), then clears it. Other scopes/tabs are untouched.

verification:
  unit: "tests/ai/ActiveAiTurnIndicator.test.tsx — 3 new regression tests pass; 1 pre-existing BudgetTopUpModal locale failure (confirmed on HEAD)"
  integration: "tests/ai/FooterIndicatorFocus.test.tsx — click focuses running tab, idle tab preserved, pass"
  adjacent: "AIChatDrawerTabs, chatTabRepo, layoutStore, DocEditorPane — pass; AIChatDrawerIsolation has 1 pre-existing flaky failure present on HEAD"
  typecheck: "npx tsc --noEmit — no errors in owned files"
  browser: "not run — Tauri/Chrome live session unavailable in this agent context; behavior covered by integration test"
files_changed:
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ActiveAiTurnIndicator.tsx
  - src/context/AIChatContext.tsx
  - tests/ai/ActiveAiTurnIndicator.test.tsx
  - tests/ai/FooterIndicatorFocus.test.tsx
  - tests/components/notes/DocEditorPane.test.tsx
