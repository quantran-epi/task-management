---
phase: 51
slug: taskmate-chat-standalone-b-n-c-i-tauri-ri-ng-m-th-ng-ai-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-25
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Grounded in `51-RESEARCH.md` §Validation Architecture (`workflow.nyquist_validation: true`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + @testing-library/react 16.3.3 + fake-indexeddb 6.2.5 |
| **Config file** | `vite.config.ts` (`environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| **Quick run command** | `npx vitest run tests/phase51/<touched-file>.test.ts(x) --bail=1 && npx tsc --noEmit` |
| **Full suite command** | `npx vitest run` — **NEVER run** (project rule: >1 hour); phase gate uses `npx vitest run tests/phase51 --bail=1 && npx tsc --noEmit` |
| **Estimated runtime** | ~30-60 seconds per scoped suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/phase51/<touched-file>.test.ts(x) --bail=1 && npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run tests/phase51 --bail=1 && npx tsc --noEmit` (scoped phase-51 suite only; full `npx vitest run` forbidden by project rule)
- **Before `/gsd-verify-work`:** Scoped phase-51 suite green + typecheck green + build/install human-verify checkpoint resolved
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | P51-PKG-01 / D-01,D-02,D-03,D-04,D-14 | T-51-01 / T-51-04 | Chat config identity distinct; base config + capabilities byte-identical; full window array with hash URL | unit (JSON contract) | `npx vitest run tests/phase51/chatConfig.test.ts --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-01-02 | 01 | 1 | P51-PKG-01 / D-02,D-04,D-15 | T-51-02 | Static committed marker "1", no `.env`, no secret in `define`, no new dependency | unit (config contract) | `npx vitest run tests/phase51/chatConfig.test.ts --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-02-01 | 02 | 2 | P51-SHELL-01 / D-04,D-05,D-13 | T-51-08 | Standalone flag reaches chat route with KnowledgeConfigProvider; no workbench flash; TaskMate branch unchanged | unit (route) | `npx vitest run tests/phase51/standaloneRoute.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-02-02 | 02 | 2 | P51-SHELL-01 / D-05,D-06,D-07 | T-51-05 / T-51-06 / T-51-07 / T-51-08 | Zero parent listeners/geometry; forced global scope; no pin/close/popout; gear opens drawer, chat stays mounted | component | `npx vitest run tests/phase51/standaloneRoute.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AIPopoutView.legacy.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-03-01 | 03 | 3 | P51-SETTINGS-01 / D-09,D-10,D-11,D-12 | T-51-09 / T-51-10 / T-51-12 | Exactly 7 groups; real cards on shared Dexie/keyring; key masked; no eighth group; chat state preserved | component | `npx vitest run tests/phase51/AISettingsDrawer.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-03-02 | 03 | 3 | P51-SETTINGS-01 / D-06,D-11 | T-51-11 | Knowledge provider resolves; no nested drawer; focus restore to gear; TaskMate settings untouched | component | `npx vitest run tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-04-01 | 04 | 4 | P51-GROUND-01 / D-08,D-10 | T-51-13 / T-51-14 | Zero global-context/conventions/entity grounding calls in standalone; knowledge-family non-regression | unit/chat | `npx vitest run tests/phase51/groundingSuppression.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-04-02 | 04 | 4 | P51-GROUND-01 / D-08,D-13,D-01 | T-51-15 / T-51-16 | Task actions false/absent in standalone; legacy regression green; full scoped phase gate green | component | `npx vitest run tests/phase51 --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 51-04-03 | 04 | 4 | P51-GROUND-01 / D-01,D-14 | T-51-SC | Real bundle installs alongside TaskMate; chat-only first paint; shared keyring; toolchain blocker documented if codesign missing | human-verify | N/A — blocking `checkpoint:human-verify` in `51-04-PLAN.md` Task 3 | ✅ checkpoint | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/phase51/chatConfig.test.ts` — parse `tauri.conf.chat.json`; assert identifier, productName, full window shape, hash URL, capability inheritance; marker define, scripts, base config byte-identity
- [ ] `tests/phase51/standaloneRoute.test.tsx` — render `AppIntelliJ` at `#ai-popout` with standalone flag; assert no workbench and provider composition
- [ ] `tests/phase51/AIPopoutView.standalone.test.tsx` — mock Tauri via `@tauri-apps/api/mocks`/`__TAURI_INTERNALS__`; assert no listeners, no geometry writes, no pin/close, gear + drawer
- [ ] `tests/phase51/AIPopoutView.legacy.test.tsx` — regression for existing popout behavior with marker false
- [ ] `tests/phase51/AISettingsDrawer.test.tsx` — seven nav labels, real cards, chat stays mounted, host wiring/focus
- [ ] `tests/phase51/groundingSuppression.test.tsx` — mock `contextGrounding` + `conventionService`; assert zero calls in standalone, normal calls in legacy, task actions absent
- [ ] npm scripts `tauri:build:chat` / `tauri:dev:chat` (+ `build:chat` if CLI needs explicit Vite config) — add in `package.json`
- [ ] `src-tauri/tauri.conf.chat.json` and `vite.chat.config.ts` — new config artifacts gated by `chatConfig.test.ts`

*Existing settings card tests in `tests/components/settings/` remain valid and need no change. JSdom + fake-indexeddb harness lives in `tests/setup.ts`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run tauri:build:chat` real bundle + install alongside TaskMate on one macOS machine | D-01, D-14 (coexistence, codesign, keyring read) | Codesign/notarization and OS app-data collision cannot be proven in jsdom; research marks macOS toolchain unknown | `51-04-PLAN.md` Task 3 `checkpoint:human-verify`: build, install both apps, verify distinct identifiers, chat-only first paint, reload, gear + 7-group drawer, shared keyring, TaskMate unchanged. If macOS code signing toolchain unavailable, record exact error and accept blocker with scheduled re-verification. |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Task 3 is human-verify by design — toolchain limitation)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s per scoped suite
- [ ] `nyquist_compliant: true` set in frontmatter (set after Wave 0 files exist and scoped gate is green)

**Approval:** pending
