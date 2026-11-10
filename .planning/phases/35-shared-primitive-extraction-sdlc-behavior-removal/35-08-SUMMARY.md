---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 08
type: execute
subsystem: ui
tags: [sdlc-removal, chat-ui, component-trimming, test-rewrite]
requires: [35-05]
provides:
  - "ChatTabBar with a single ChatTabType = 'chat' and no SDLC status plumbing"
  - "AiChatScopeKind = 'chat' only, with no artifact-event surface on AiChatWidget"
  - "InterruptedBanner trimmed to the ordinary interrupted-runtime notice"
  - "SDLC-free chat tests with fresh InterruptedBanner and artifact-tool allowlist coverage"
affects: [35-09, 35-10]
tech-stack:
  added: []
  patterns: [component-trimming, sortable-wiring-assertion]
key-files:
  created:
    - src/components/ai/__tests__/InterruptedBanner.test.tsx
    - tests/ai/artifactToolAccess.test.ts
  modified:
    - src/components/ai/ChatTabBar.tsx
    - src/components/ai/AiChatWidget.tsx
    - src/components/ai/InterruptedBanner.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/runtime/useChatTurn.ts
    - src/components/settings/ImportPreviewModal.tsx
    - src/components/ai/__tests__/ChatTabBar.test.tsx
    - tests/ai/AiChatWidget.test.tsx
    - tests/ai/useChatTurn.test.tsx
    - tests/ai/AIChatDrawerTabs.test.tsx
    - tests/ai/ActiveAiTurnIndicator.test.tsx
  deleted:
    - src/components/ai/artifacts/ArtifactEventCard.tsx
    - src/components/ai/RestoredSourceNotice.tsx
decisions:
  - "ChatTabBar drag tests assert the sortable aria wiring and drive onDragEnd directly — dnd-kit sensors cannot activate under jsdom (verified on the unmodified HEAD test)"
  - "InterruptedBanner trimmed, not deleted: the ordinary activeRuntime.status === 'interrupted' render must survive"
  - "AIChatDrawer displayTabs pins type to 'chat' so the durable rows satisfy the narrowed ChatTabItem until plan 09 narrows models.ChatTabType"
metrics:
  duration: ~35m
  completed: 2026-11-10
  tasks: 3
  files: 15
  commits: 3
  plan_head_before: 7175b5e0ef4f6f924523e724c5e8e2421053b417
  plan_head_after: 9309ad8cfd9814024f622f68af6cf41eb2491851
status: complete
---

# Phase 35 Plan 08: Chat UI SDLC surface removal Summary

Chat tab bar, chat widget, drawer and import preview no longer carry any SDLC type, prop or string; the interrupted-runtime notice survives.

## What Changed

### Task 1 — ChatTabBar and AiChatWidget narrowed

`ChatTabType` is now `'chat'`. Removed `sdlcStatus`, `isSdlc`, the SDLC status-resolution block, the SDLC-only rename/reorder/Delete guards and the SDLC tooltip ternary. `isAnalysisActive` is now purely `Boolean(tabAnalysisModes?.[tab.id])` and rename/reorder/close run unconditionally.

`AiChatScopeKind` is now `'chat'`. Removed the `AiChatArtifactEvent` interface, the `artifactEvents` / `onArtifactOpen` / `onArtifactCta` props and the artifact-event render block, plus the `ArtifactEventCard` component.

### Task 2 — InterruptedBanner trimmed, RestoredSourceNotice deleted, drawer cleaned

`InterruptedBanner` keeps `message` / `onContinue` / `onDiscard` and the generic "Yêu cầu trước bị gián đoạn khi ứng dụng đóng." copy; the `SdlcCheckpoint` import and prop are gone. `RestoredSourceNotice.tsx` deleted. `AIChatDrawer` lost `buildSdlcWrapperPrompt` (and its two types), the `restoredMissingSources` and `sdlcCheckpoints` live queries, `resolveCheckpoint`, the `restoredMissingSourcesRef` send guard, the `RestoredSourceNotice` render and the checkpoint `InterruptedBanner` render; `currentTabAnalysisMode` is `Boolean(activeTab?.config?.analysisMode)`. `useChatTurn` titles are the raw `scopeKey`.

### Task 3 — Import preview and chat tests

`ImportPreviewModal` drops the `recoveryNotice` memo and its alert. `ChatTabBar.test.tsx` fixture reduced to `chat-1`/`chat-2`; SDLC-only cases deleted, survivors reindexed, drag tests rewritten. New `InterruptedBanner.test.tsx` (generic copy, message override, both callbacks, no SDLC in output) and new `tests/ai/artifactToolAccess.test.ts` (studio tools only on explicit allowlist, mutation tool stripped under Analysis Mode, `propose_*` absent everywhere). `AiChatWidget.test.tsx` drops the artifact-card render test and the `chatRepo artifactEvent persistence` describe; remaining scope fixtures are `kind: 'chat'` with chat scope keys.

## Verification

- `npx vitest run` on the seven plan test files → 7 files, 63 tests passed.
- `grep -rn "sdlc\|Sdlc\|SDLC" src/components/ai src/components/settings/ImportPreviewModal.tsx` → only a stale comment in `ChatTabToolbox.tsx` (owned by plan 06) and the deliberate literal inside `InterruptedBanner.test.tsx`.
- `npx tsc --noEmit` → zero errors in any file this plan touched. Remaining errors are confined to `src/components/sdlc/SdlcWorkspace.tsx`, `src/components/sdlc/chat/StepChatPanel.tsx` and `src/views/ChangeRequestSdlcView.tsx`, which plans 06/07 delete in this same wave.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no installed dependencies**
- **Found during:** Task 3 verification
- **Issue:** The worktree's `node_modules` held only Vite caches, so `vitest`/`tsc` could not resolve `@dnd-kit/*` or `zustand`.
- **Fix:** `npm ci --prefer-offline` from the checked-in `package-lock.json` (845 packages, no new packages added).
- **Files modified:** none tracked (`node_modules` is gitignored).

**2. [Rule 3 - Blocking] AIChatDrawer `displayTabs` type mismatch**
- **Found during:** post-task `tsc` sweep
- **Issue:** `durableTabs` rows carry `models.ChatTabType` (`'chat' | 'sdlc'`) which is not assignable to the narrowed `ChatTabItem`. Plan 09 narrows the model; this plan must still type-check at the wave boundary.
- **Fix:** `type: 'chat' as const` in the `displayTabs` projection.
- **Files modified:** `src/components/ai/AIChatDrawer.tsx`

**3. [Rule 1 - Bug] ChatTabBar drag tests could not pass under jsdom**
- **Found during:** Task 3
- **Issue:** The plan's drag expectations (`draggable="true"`, synthetic dragStart/dragOver/drop) fail on the *unmodified* HEAD version of the same test — dnd-kit applies no DOM `draggable` attribute and its pointer/keyboard sensors never activate without layout rects. Confirmed by running `git show HEAD:src/components/ai/__tests__/ChatTabBar.test.tsx` standalone: the same two tests failed before any change here.
- **Fix:** Assert the sortable wiring that dnd-kit does emit (`aria-roledescription="sortable"`, not disabled) and drive `onDragEnd` directly through a `DndContext` stub, still expecting `onReorderTabs(0, 1)`.
- **Files modified:** `src/components/ai/__tests__/ChatTabBar.test.tsx`

**4. [Rule 1 - Bug] InterruptedBanner description still said "checkpoint"**
- **Found during:** Task 2 grep
- **Issue:** The surviving description text contained the word `checkpoint`, failing the plan's zero-match criterion for this file.
- **Fix:** Reworded to "…hoặc bỏ qua." with no meaning change.
- **Files modified:** `src/components/ai/InterruptedBanner.tsx`

## Known Stubs

None.

## Threat Flags

None — no new network, auth, file-access or schema surface. The two threat-register mitigations in scope (T-35-31 interrupted notice, T-35-37 artifact-tool allowlist) are covered by the new tests.

## Self-Check: PASSED

- Files exist: `src/components/ai/__tests__/InterruptedBanner.test.tsx`, `tests/ai/artifactToolAccess.test.ts` — FOUND
- Deleted: `src/components/ai/artifacts/ArtifactEventCard.tsx`, `src/components/ai/RestoredSourceNotice.tsx` — absent
- Commits: `7fb7e947`, `a00ffc6b`, `9309ad8c` — all ancestors of HEAD
