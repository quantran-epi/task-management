---
phase: "44"
slug: "agent-activity-panel-configurable-explore-timeout-and-prompt"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + @testing-library/react 16.3.3 (jsdom), fireEvent (user-event absent) |
| **Config file** | `vite.config.ts` (`test` block: jsdom, globals, setupFiles `./tests/setup.ts`, fileParallelism false) |
| **Quick run command** | `npx vitest run <one focused test file>` |
| **Full suite command** | `npx vitest run <phase-focused file list>` — NEVER bare `npx vitest run` (project memory: full suite >1h) |
| **Estimated runtime** | ~30-90 seconds for the phase-focused list |
| **Typecheck** | `npx tsc --noEmit -p tsconfig.json` |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit -p tsconfig.json` plus the focused Vitest file(s) named in that task's `<automated>` verify.
- **After every plan wave:** Run all phase-focused Vitest files in one invocation plus typecheck.
- **Before `/gsd-verify-work`:** All focused suites green, typecheck green, `/gsd-code-review` and `/gsd-ui-review` clean of critical/warning findings.
- **Max feedback latency:** ~2 minutes.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | TO-01 (D-01/D-02) | — | clamp 60..900/default 300; watchdog uses derived ms; abort/late-cancel intact | unit | `npx vitest run tests/services/remoteExploreService.test.ts -t timeout` | ✅ extend | ⬜ pending |
| 44-01-02 | 01 | 1 | TO-01 (D-03) | — | tool definition advertises `timeoutSeconds` and documents 60..900/default 300 | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts -t timeoutSeconds` | ✅ extend | ⬜ pending |
| 44-01-03 | 01 | 1 | TO-01 (D-03 wiring) | — | handler passes derived `timeoutMs` to `runRemoteExplore` | unit | `npx vitest run tests/services/ai/office/teamToolsGitRead.test.ts -t explore_repo` | ✅ extend | ⬜ pending |
| 44-02-01 | 02 | 1 | PANEL-01 (D-04/D-05) | T-44-01 (untrusted text) | call+result upsert by id; result no longer discarded; popover fields retained | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "tool event"` | ✅ extend | ⬜ pending |
| 44-02-02 | 02 | 1 | PANEL-01 (D-06/D-07/D-08) | T-44-01 | args/result preview capped 8000; 200-row cap; status from payload | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "tool event"` | ✅ extend | ⬜ pending |
| 44-03-01 | 03 | 2 | UI-01 (D-09..D-12) | T-44-04/T-44-05 | rail renders tabs/filter/progress/rows; details collapsed; long previews no overflow; a11y attrs | component | `npx vitest run tests/components/ai/office/AgentActivityPanel.test.tsx` | ❌ W0 | ⬜ pending |
| 44-03-02 | 03 | 2 | LOG-01 (D-14) | T-44-04 | Prompt log tab renders preserved log fields | component | `npx vitest run tests/components/ai/office/AgentActivityPanel.test.tsx -t "Prompt log"` | ❌ W0 | ⬜ pending |
| 44-03-03 | 03 | 2 | LOG-01 (D-15/D-16) | — | debug dropdown item and debug Modal gone; AIDebugModal untouched | component | `npx vitest run tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx` | ❌ W0 | ⬜ pending |
| 44-04-01 | 04 | 3 | VERIFY-01 (C-15/D-17) | — | real UI walkthrough of panel, active explore progress, prompt tab | manual | `/gsd-verify-work 44` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/components/ai/office/AgentActivityPanel.test.tsx` — fixture-driven panel tests (tabs, filter, progress card, collapsed expansion, 8000-char cap no-overflow, a11y attributes).
- [ ] `tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx` — asserts the debug dropdown item and Modal are gone.
- [ ] Coordinator "tool event" test block (extend existing `teamRunCoordinator.test.ts`).
- [ ] `timeoutSeconds` schema/clamp/watchdog cases in `remoteExploreService.test.ts`, `teamTools.test.ts`, `teamToolsGitRead.test.ts`.
- [x] No new framework/config install needed (Vitest + RTL present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live panel during a real team run, including `explore_repo` deadline and Prompt log migration | VERIFY-01 / C-15 | GSD milestone rule requires an observed UI walkthrough; ephemeral runtime state cannot be asserted from code | Run a team turn that calls `git_read`/`explore_repo`, open the rail, expand a result, switch to Prompt log, confirm the debug modal/menu are absent, then stop the turn and verify cleanup |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 2 min
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 completion

**Approval:** pending — set to approved after Wave 0 and phase-focused gate pass.
