---
phase: quick
plan: 261126-ky8
subsystem: ai-chat-standalone
tags: [indexeddb, ai-chat, ssh-config, default-model, chromium-e2e, code-review]
dependency_graph:
  requires: []
  provides:
    - TaskMateChatWindowDB singleton isolated from PersonalTaskPlannerDB
    - SSH Connections settings group only in standalone chat window
    - Configured default model on every newly created chat tab
  affects: [src/AppIntelliJ.tsx, src/views/AIPopoutView.tsx, src/components/ai, src/db]
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN commits per task; medium code review on full diff
    - same TaskPlannerDatabase class with a second database name
    - real Chromium harness through AppIntelliJ standalone boot path
    - token-based AntD UI, no new colors
key_files:
  created:
    - src/db/chatWindowDb.ts
    - tests/phase51/chatWindowDb.test.ts
    - tests/phase51/taskmatePathRegression.test.tsx
    - e2e/aiChatStandalone.html
    - e2e/aiChatStandalone.tsx
  modified:
    - src/AppIntelliJ.tsx
    - src/views/AIPopoutView.tsx
    - src/components/ai/AISettingsDrawer.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/db/repositories/chatTabRepo.ts
    - src/db/repositories/__tests__/chatTabRepo.test.ts
    - tests/ai/AIChatDrawer.test.tsx
    - tests/phase51/AISettingsDrawer.test.tsx
    - tests/phase51/AIPopoutView.standalone.test.tsx
    - tests/phase51/AIPopoutView.legacy.test.tsx
    - tests/phase51/standaloneRoute.test.tsx
    - e2e/aiChatSettings.spec.ts
decisions:
  - D-01: standalone chat uses TaskMateChatWindowDB via the same TaskPlannerDatabase class; dock keeps PersonalTaskPlannerDB; src/db/index.ts and src/db/schema.ts are untouched.
  - D-02: SSH Connections group is inserted before SSH File System only in standalone settings; SshConfigCard, SshFsAiToolConfigCard and OracleAiToolConfigCard share the same db instance.
  - D-03: both createChatTab and getOrCreateActiveChatTab persist caller-supplied config.model only at tab creation; the drawer reads the saved default at creation time and the bootstrap awaits that read.
  - D-04: previously the chat window shared TaskMate db.storage but had a separate curated AI settings surface; the split into TaskMateChatWindowDB is now intentional and documented, with no rewrite of the settings UI.
  - D-05: TaskMate-only runtime hooks (SQLite mirror, notifications, GitHub auto-sync, Telegram worker, team teardown) are not mounted by the standalone chat build; KnowledgeConfigProvider receives the selected DB.
metrics:
  duration: approximately 51 minutes
  completed: 2026-11-26T08:54:00Z
  tasks: 3
  commits: 9
  estimate_tokens: 48000
  actual_tokens: 61987
  actuals_note: chars/4 over the 17 realized changed files (247948 chars total); no rounding
status: complete
---

# Phase Quick 261126-ky8: Split standalone chat onto its own DB Summary

Standalone chat now reads/writes `TaskMateChatWindowDB` with its own SSH connection surface and correct default-model seeding, while TaskMate default and docked chat stay on `PersonalTaskPlannerDB`.

## Implementation

1. DB isolation: `src/db/chatWindowDb.ts` exports `chatWindowDb = new TaskPlannerDatabase('TaskMateChatWindowDB')`. `AIPopoutView` selects `chatWindowDb` only when `standaloneChat` is true, and passes that same instance to both `AIChatDrawer` and `AISettingsDrawer`. `AppIntelliJ` seeds defaults into the selected DB. `src/db/index.ts` and `src/db/schema.ts` are byte-identical.
2. TaskMate path unchanged: AppIntelliJ non-standalone boots `defaultDb`; RightToolWindow was not modified; regression tests pin the singleton, schema source, default boot and docked host. The standalone boot also no longer mounts TaskMate-only hooks.
3. Settings: `AISettingsDrawerBody` keeps the locked 7 groups for dock and inserts an 8th `SSH Connections` group immediately before `SSH File System` when `standalone` is true. The real `SshConfigCard` writes `SSH_CONFIGS_SETTING_KEY` into the selected DB; docked settings never show the new group. No `SettingsView` import, no new colors, no Modal/focus changes.
4. Default model: `getOrCreateActiveChatTab` now writes caller `config` only when creating a tab. Both `handleAddTab` and `ensureTurnTab` in `AIChatDrawer` read `getNineRouterConfig(db)` at creation time; bootstrap awaits the config read so a fast first tab cannot beat the settings load. Existing user-selected tab models are never overwritten.
5. E2E: real Chromium harness boots the production `AppIntelliJ standaloneChat` path. It verifies SSH connection creation/persistence in `TaskMateChatWindowDB` and absence from `PersonalTaskPlannerDB`, saved default model on a new tab and after reload, light/dark token parity, console/page errors empty, and the original docked workbench still showing 7 groups without `SSH Connections`.

## D-04 conclusion

Before this task, the standalone chat window shared TaskMate `db.storage` while exposing its own curated AI settings surface; configuration could leak between the two. It now intentionally owns `TaskMateChatWindowDB`. The settings UI was extended in place, not rewritten, and the docked chat remains on `PersonalTaskPlannerDB`.

## Verification

- `npx vitest run src/db/repositories/__tests__/chatTabRepo.test.ts tests/ai/AIChatDrawer.test.tsx tests/phase51/chatWindowDb.test.ts tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AIPopoutView.legacy.test.tsx tests/phase51/taskmatePathRegression.test.tsx tests/phase51/standaloneRoute.test.tsx --bail=1`: 8 files, 68 tests passed; no unhandled errors.
- `npx tsc --noEmit`: clean.
- `npm run test:e2e -- e2e/aiChatSettings.spec.ts`: 3 passed in real Chromium (1.0m). Light/dark checks assert `data-theme` and `--accent` change while `--radius-control` and `--font-size-ui` stay constant; modal background differs between themes.
- `git diff --quiet -- src/db/index.ts src/db/schema.ts`: clean.
- `grep -v '^#' src/components/ai/AISettingsDrawer.tsx | grep -c 'SettingsView' | grep '^0$'`: clean.
- `npm test` full suite intentionally NOT run (project rule: >1 hour).

## Commits

- 841a6c0c: test(261126-ky8): add failing tests for standalone chat DB isolation
- f50d466f: feat(261126-ky8): split standalone chat onto TaskMateChatWindowDB
- e46e4a1d: test(261126-ky8): add failing tests for standalone SSH settings group
- 1a04f05a: feat(261126-ky8): add standalone SSH Connections settings group
- 5a79a208: test(261126-ky8): add failing tests for default model on new chat tabs
- 9d0a1101: feat(261126-ky8): seed configured default model on every new chat tab
- 91c222c0: test(261126-ky8): verify standalone chat DB in Chromium
- 3e494ac4: fix(261126-ky8): address medium code-review findings
- 7809e6c6: test(261126-ky8): keep AIChatDrawer targeted gate free of unhandled rejection

## Code review

Medium effort review on the full task diff produced 7 findings. Fixed in scope: standalone `KnowledgeConfigProvider` now uses the selected DB; TaskMate-only runtime hooks are not mounted in standalone chat; new tabs read a fresh default model; bootstrap awaits the model config before inserting the first tab; the e2e harness now boots the real `AppIntelliJ` standalone path. Out of scope and documented: the module-level `appMessage.success` rejection in an existing clear-context test (fixed only in the test harness), the module-level tab-turn registry caching keyed by one DB instance (pre-existing), and shared OS keyring keys for API keys across DB instances (existing service behavior; changing keyring/secret handling would be an architectural change).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Standalone boot still wrote knowledge config into TaskMate DB**
- **Found during:** medium code review
- **Fix:** `KnowledgeConfigProvider db={standaloneChat ? chatWindowDb : defaultDb}` in the ai-popout branch; e2e harness boots the same path.
- **Files modified:** `src/AppIntelliJ.tsx`, `e2e/aiChatStandalone.tsx`
- **Commit:** 3e494ac4

**2. [Rule 1 - Bug] Stale/racing default model on new tabs**
- **Found during:** medium code review
- **Fix:** read `getNineRouterConfig(db)` at creation time in both paths; bootstrap awaits the read.
- **Files modified:** `src/components/ai/AIChatDrawer.tsx`
- **Commit:** 3e494ac4

**3. [Rule 1 - Bug] Unhandled rejection in AIChatDrawer clear-context test**
- **Found during:** final targeted Vitest gate
- **Issue:** hook had no AntD App holder; pre-existing at plan base.
- **Fix:** stub `useMessage` in that test only.
- **Files modified:** `tests/ai/AIChatDrawer.test.tsx`
- **Commit:** 7809e6c6

**4. [Rule 3 - Blocking] E2E persistence flaked on first run**
- **Found during:** Chromium verification
- **Fix:** poll the animated modal width instead of sampling one frame; all three tests passed on final and rerun.
- **Files modified:** `e2e/aiChatSettings.spec.ts`
- **Commit:** 91c222c0, 3e494ac4

## Self-Check: PASSED
