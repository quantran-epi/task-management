---
phase: quick
plan: 261126-diw
subsystem: ai-chat
tags: [ai-chat, settings-modal, analysis-mode, composer, chromium-e2e]
dependency_graph:
  requires: []
  provides:
    - AI settings full-width Modal shared by docked and standalone chat
    - AI chat always uses orchestrator analysis path with fixed autoApprove: false
    - verified fullscreen composer and real-Chromium light/dark parity
  affects: [src/components/ai, src/workbench/toolwindows]
tech_stack:
  added: []
  patterns:
    - shared src/components/ui Modal wrapper with tokens, no new colors
    - TDD red/green commits per task
    - targeted Vitest + tsc + isolated-port Playwright Chromium spec
key_files:
  created:
    - tests/ai/AISettingsModal.integration.test.tsx
    - e2e/aiChatSettings.spec.ts
  modified:
    - src/components/ai/AISettingsDrawer.tsx
    - src/components/ai/ChatHeader.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/ChatTabToolbox.tsx
    - src/components/ai/AiChatWidget.tsx
    - src/components/ai/ChatInputBar.tsx
    - src/components/ai/ChatTabBar.tsx
    - src/components/ai/runtime/chatTurnRuntime.ts
    - src/components/ai/runtime/tabTypes.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - src/services/ai/office/teamRunCoordinator.ts
    - src/workbench/toolwindows/RightToolWindow.tsx
    - tests/ai/AIChatDrawer.test.tsx
    - tests/ai/AIChatDrawerToolbox.test.tsx
    - tests/ai/AIChatDrawerTabs.test.tsx
    - tests/ai/AiChatWidget.test.tsx
    - tests/ai/ChatInputBar.test.tsx
    - tests/ai/chatTurnRemoteTarget.test.ts
    - tests/ai/chatTurnRuntime.test.ts
    - tests/ai/tabTurnRegistry.test.ts
    - tests/ai/useChatTurn.test.tsx
    - tests/ai/AISettingsModal.integration.test.tsx
    - src/components/ai/__tests__/ChatTabBar.test.tsx
    - tests/phase25_1SafetyGates.test.ts
    - tests/phase51/AISettingsDrawer.test.tsx
    - tests/phase51/AIPopoutView.standalone.test.tsx
    - tests/phase51/standaloneConnectionStatus.test.tsx
    - e2e/aiChatSettings.spec.ts
decisions:
  - Docked and standalone chat share one AISettingsDrawer full-width Modal; standalone identity comes from explicit isStandalone, not onOpenSettings presence.
  - Analysis mode and auto-approve are no longer user controls. Runtime hardcodes analysis tools, compactAtRatio 0.9, and autoApprove false; stored DB fields remain only for backward compatibility.
  - Fullscreen composer keeps rows={16} by disabling shared TextArea autoSize; scratchpad is transient and Gửi ngay/Xong reuse the tab draft.
  - E2E runs against isolated port 5199 so shared dev servers in other sessions are untouched.
metrics:
  duration: completed 2026-11-26
  completed: 2026-11-26
  tasks: 3
  commits: 6
status: complete
---

# Phase Quick Plan 261126-diw: AI chat settings, analysis mode and composer Summary

AI settings converted to one full-width Modal reachable from docked and standalone chat; analysis/auto-approve UI removed with orchestrator-only turns; fullscreen composer and real light/dark Chromium behavior verified.

## Commits

- d90cbb81: test(261126-diw): red tests for full-width AI settings Modal and workbench gear
- 513336ec: feat(261126-diw): full-width AI settings Modal and workbench chat gear
- 08ede884: test(261126-diw): red tests for no self-approve, always-analysis chat
- 38fcd9ed: feat(261126-diw): remove self-approve and always use analysis tool set in chat
- 5c2da3f0: test(261126-diw): verify settings and composer modals in Chromium
- 5bd75c29: fix(261126-diw): address review findings in AI chat cleanup

Additional locked requirement executed in Task 2 of this same quick task: remove analysis-mode toggle everywhere, default all chat turns to `runAiOrchestratorLoop`/analysis tool set with compact ratio 0.9, keep stored `analysisMode` only for DB backward compatibility.

## Implementation

1. Settings UI:
   - `AISettingsDrawer.tsx` now renders a shared Ant Design `Modal` with `width: calc(100vw - 48px)`, `maxWidth: 1200`, token-based body, focus restoration and `destroyOnHidden`.
   - `ChatHeader.tsx` gained `isStandalone` and an explicit `Mở Cài đặt AI` gear; `RightToolWindow.tsx` mounts a single settings Modal for docked chat and clears `settingsOpen` when the panel collapses.
   - `AIPopoutView.tsx` continues to mount the same settings Modal for standalone chat.

2. Chat mode safety:
   - Removed analysis and auto-approve buttons, dropdown items, badges, state and props from `ChatTabToolbox.tsx`, `AiChatWidget.tsx`, `ChatTabBar.tsx` and `AIChatDrawer.tsx`.
   - `chatTurnRuntime.ts` accepts no `analysisMode` request flag; `AIChatDrawer.tsx` passes `effectiveAnalysisMode: true` to tool selection and `autoApprove: false` to the runtime.
   - Prompt variants include `[ANALYSIS MODE ACTIVE]`; mutations still require the existing approval card.
   - Deleted obsolete tests for removed grounded/clarification/intent-router and MCP-list paths; kept a test proving `runGroundedTurn` is never called and the analysis payload is sent.

3. Composer:
   - Fullscreen composer textarea disables shared `autoSize` so `rows={16}` produces a tall scratchpad in real Chromium.
   - `Gửi ngay` and `Xong (Lưu vào ô chat)` continue through the same tab draft.

## Verification

- `npx tsc --noEmit`: passed (exit 0).
- Targeted Vitest suites for settings Modal, docked/popout chat header, composer, toolbox, drawer tabs, runtime and safety gates: passed. Last focused review-gate run: 4 files, 73 tests passed; broader earlier Task 3 targeted run: 8 files, 61 tests passed.
- Chromium e2e with isolated config on port 5199: `e2e/aiChatSettings.spec.ts` — 2 passed (43.6s). Covers full-width settings Modal, persisted endpoint, light/dark token parity and modal background change, absence of analysis/auto-approve toggles, orchestrator system prompt in the captured `/v1/chat/completions` payload, tall composer scratchpad and draft clearing.
- `npm test` / full suite intentionally NOT run, per user constraint and project memory. Only the targeted Vitest files above, `npx tsc --noEmit`, and the single e2e spec were executed.
- Medium-effort `code-review` ran on the quick-task diff. Findings addressed: obsolete tests for removed paths, generic `Cài đặt` query collision, stale docked settings state, dead `analysisMode` runtime field, deprecated modal prop, broad e2e console-noise filter and weakened font-size assertions. `tabTurnRegistry` baseline failure (`discard` vs abort) was confirmed pre-existing at HEAD and left out of scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Docked chat gear was hidden**
- **Found during:** Task 3 Chromium verification
- **Issue:** `AIChatDrawer` only forwarded `onOpenSettings` to `ChatHeader` in standalone mode, so the workbench chat had no settings gear.
- **Fix:** Always forward `onOpenSettings`; standalone identity remains explicit via `isStandalone`.
- **Files modified:** `src/components/ai/AIChatDrawer.tsx`
- **Commit:** 5c2da3f0

**2. [Rule 1 - Bug] Fullscreen scratchpad height collapsed**
- **Found during:** Task 3 Chromium verification
- **Issue:** Shared `TextArea` wrapper defaulted `autoSize`, overriding `rows={16}`; measured height was 38px.
- **Fix:** Pass `autoSize={false}` so `rows` governs height; e2e polls for the measured height > 200px.
- **Files modified:** `src/components/ai/ChatInputBar.tsx`, `e2e/aiChatSettings.spec.ts`
- **Commit:** 5c2da3f0

**3. [Rule 3 - Blocking] Ant Design 6 selectors and modal lifecycle differed from plan assumptions**
- **Found during:** Task 1 and Task 3
- **Issue:** AntD 6 uses `.ant-modal-container`; jsdom did not reliably run animation-driven `afterClose`/mask dismissal.
- **Fix:** Update selectors, capture focus trigger during render, restore focus in `onCancel` plus `afterClose`, and verify dismissal via close button/Escape in tests.
- **Files modified:** `src/components/ai/AISettingsDrawer.tsx`, `tests/phase51/*`, `e2e/aiChatSettings.spec.ts`
- **Commit:** 513336ec, 5c2da3f0

**4. [Rule 1 - Bug] Review findings after implementation**
- **Found during:** final medium code review
- **Issue:** Generic `Cài đặt` query matched the new gear; docked settings state survived panel collapse; dead runtime `analysisMode` remained; e2e noise filter was too broad; two font-size assertions were weakened.
- **Fix:** Removed obsolete tests, scoped MCP popover test, reset settings state on collapse, removed dead runtime field, narrowed noise list, restored token-based font assertions, changed deprecated modal prop.
- **Files modified:** see commit 5bd75c29
- **Commit:** 5bd75c29

## Known Stubs

None introduced by this quick task. Stored `analysisMode` and `autoApproveMutations` remain as backward-compatible DB fields only; they are no longer read by chat UI or runtime.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced. The e2e spec intercepts existing `/v1/chat/completions` and `/v1/models` calls locally; it does not add runtime behavior.

## Shared-checkout safety

Executed on the shared `pre-v1.6-baseline` checkout. Only exact in-scope files from commits d90cbb81/513336ec/08ede884/38fcd9ed/5c2da3f0/5bd75c29 were staged and committed. No `git add -A`, stash, reset, checkout/switch, merge, rebase, process kill, `npm install`, `.gsd/*`, milestone lock, ROADMAP update or unrelated pre-existing file modification was performed. Interleaved `261126-cid` commits remained untouched.
