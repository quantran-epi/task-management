---
phase: 59-control-parity-rework-per-control-chrome-compare
plan: 01
subsystem: testing
tags: [playwright, vitest, chrome-parity, control-registry, evidence-integrity, openidea]
requires:
  - phase: 54-native-overlay-complex-controls
    provides: existing native control wrappers and vendored CSS modules that the harness measures
  - phase: 50
    provides: scratchpad OpenIDEA reference and oi-prototype proof with original CSS modules
provides:
  - 3-app Chrome parity harness with hard-fail preflight, per-app theme, DOM/computed/screenshot/interaction capture
  - CONTROL_REGISTRY of 56 control ids with selectors, states and fixture source
  - Evidence integrity gate with 9 behavior cases, SMOKE and full modes
  - Real focused button behavior test and smoke artifacts with PASS.json pending-human
affects: [59-02 through 59-21 control tasks, 59-final parity gate, PAR-01, PAR-03, HGC-01]
tech-stack:
  added: []
  patterns: [per-control PARITY_CONTROL capture, pending-human evidence, real interaction traces, 3-app theme-specific setters]
key-files:
  created:
    - e2e/control-parity.spec.ts
    - tests/helpers/parityHarness.ts
    - tests/helpers/parityEvidence.ts
    - tests/parity/parityEvidenceIntegrity.test.ts
    - src/components/ui/__tests__/parity-button.test.tsx
    - scratchpad/oi-prototype/src/parityFixtures.jsx
    - scratchpad/openidea/src/parityFixture.tsx
    - .planning/debug/artifacts/control-parity/button/SMOKE.md
  modified:
    - scratchpad/oi-prototype/src/main.jsx
    - scratchpad/openidea/src/main.tsx
key-decisions:
  - "Reference dark uses data-theme='dark' on root (vendored :root token base); data-contrast=high would render a different dark-hc palette"
  - "Preflight accepts localhost alias for wrapper when dev server binds IPv6-only, but still fails hard if neither binds"
  - "Known out-of-scope console noise (favicon 404, pre-existing segmented `block` warning) is filtered from consoleErrors; production code untouched"
  - "PASS.json never self-certifies: status=pending-human, humanVerdict=null; only owner can set pass"
patterns-established:
  - "One PARITY_CONTROL id = one capture = one focused behavior test = one human gate"
  - "Gate reads pure exported check functions plus on-disk evidence; registry import is Vitest-safe (suite registered only under VITEST)"
requirements-completed: [NAT-02, PAR-01, PAR-03]

duration: 35min
completed: 2026-11-22
---

# Phase 59 Plan 01: Control parity harness and evidence gate Summary

**Built the reusable 3-app Chrome parity harness, 56-control fixture/selector registry, and anti-fake evidence gate; smoke button capture passes with real interaction traces and human-verdict untouched.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-11-22T07:19:21Z
- **Completed:** 2026-11-22T07:45:00Z
- **Tasks:** 3/3
- **Files modified:** 11 (8 in repo, 3 in scratchpad)

## Accomplishments

- Pre-flight boots/reuses reference `:1420`, proof `:5180`, wrapper `:5173`, polls 500ms for 30s, and throws with URL + start command + log path on failure — no silent `test.skip`.
- `?fixture=<id>` route added to both scratchpad apps renders all 56 control ids using vendored OpenIDEA CSS modules; missing selector fails hard.
- `setTheme` uses three distinct mechanisms: wrapper TitleBar toggle, proof `button.themeBtn`, reference root `dataset.theme`; waits 2 animation frames and stable polls.
- Capture writes DOM, 13 computed metrics, 6 screenshots and before/after interactions for light + dark at viewport 1440x900.
- `CONTROL_REGISTRY` exports 56 entries; integrity gate validates 9 behavior cases in SMOKE (1 control) and full (56) modes with identical criteria.
- Button smoke: harness 1 passed, gate 9 passed, focused test 3 passed, `tsc --noEmit` clean; `PASS.json` is `pending-human`/`null`.

## Task Commits

1. **Task 1: Pre-flight 3 app + fixture map 56 control + parity harness** — `95e37998` (feat)
2. **Task 2: Gate integrity + CONTROL_REGISTRY 56 id + chế độ SMOKE/full** — `33026488` (test)
3. **Task 3: Smoke harness trên Button + focused test thật + lock contract** — `a4338685` (test)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `e2e/control-parity.spec.ts` — parameterized spec, imports registry, one test per PARITY_CONTROL.
- `tests/helpers/parityHarness.ts` — boot/preflight/setTheme/computed/interact/screenshot; writes evidence.
- `tests/helpers/parityEvidence.ts` — artifact writer; PASS.json always pending-human.
- `tests/parity/parityEvidenceIntegrity.test.ts` — 56-id registry and pure gate check functions + 9 tests.
- `src/components/ui/__tests__/parity-button.test.tsx` — fireEvent.click, aria-pressed toggle, aria-busy loading.
- `scratchpad/oi-prototype/src/parityFixtures.jsx` — 56-id proof fixture route.
- `scratchpad/openidea/src/parityFixture.tsx` — real-source reference fixture route.
- `scratchpad/oi-prototype/src/main.jsx` / `scratchpad/openidea/src/main.tsx` — fixture route wiring.
- `.planning/debug/artifacts/control-parity/button/**` — smoke evidence, 5 interactions, SMOKE.md.

## Decisions Made

- Reference dark theme set via root `data-theme="dark"` only; `data-contrast` removed to avoid dark-hc palette drift.
- Real preflight uses `localhost` alias for wrapper when the dev server binds IPv6-only; still hard-fails when no binding exists (proved with a stubbed-fetch probe).
- Console noise outside plan 01 scope is filtered into `deferred-items.md`, not fixed in production code.
- TDD RED was observed first (gate failed on missing on-disk evidence), then GREEN after harness produced the artifacts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gate import crashed Playwright**
- **Found during:** Task 1 smoke
- **Issue:** Importing the Vitest test file into Playwright triggered Vitest's `describe()` outside a runner → "Cannot read properties of undefined (reading 'config')".
- **Fix:** Gate suite registered only when `process.env.VITEST` is set; registry/check functions remain runtime-agnostic exports.
- **Files modified:** `tests/parity/parityEvidenceIntegrity.test.ts`
- **Verification:** smoke Playwright passes with registry import intact.

**2. [Rule 1 - Bug] Reference fixture splash intercepted clicks**
- **Found during:** Task 1 smoke
- **Issue:** OpenIDEA `#splash` boot overlay blocked pointer events on the fixture control.
- **Fix:** Remove `#splash` only in the fixture route (never in the real workbench boot).
- **Files modified:** `scratchpad/openidea/src/parityFixture.tsx`
- **Verification:** click/hover interactions complete in harness capture.

**3. [Rule 1 - Bug] Theme race on fixture boot**
- **Found during:** Task 1 smoke
- **Issue:** `setTheme('dark')` applied before the fixture module's late `data-theme='light'` write, so dark got overwritten.
- **Fix:** 700ms settle wait after boot before applying theme; two stable polls after set.
- **Files modified:** `tests/helpers/parityHarness.ts`
- **Verification:** reference dark/light screenshot hashes differ in PASS.json.

**4. [Rule 1 - Bug] Playwright `waitForFunction` argument shape**
- **Found during:** Task 1 smoke
- **Issue:** Callback destructured `{ want }` while caller passed bare `theme`, so the predicate never matched.
- **Fix:** pass `{ want: theme }` object consistently.
- **Files modified:** `tests/helpers/parityHarness.ts`
- **Verification:** smoke capture passes.

**5. [Rule 1 - Bug] TypeScript spread of `unknown` DOM snapshot**
- **Found during:** Task 1 typecheck
- **Issue:** `snapshotDom` returned `Promise<unknown>` but was spread into objects.
- **Fix:** typed return `Promise<{ title; theme; html }>`.
- **Files modified:** `tests/helpers/parityHarness.ts`
- **Verification:** `npx tsc --noEmit` clean.

**6. [Rule 3 - Blocking] Wrapper preflight URL binding**
- **Found during:** Task 1 verification
- **Issue:** current dev server binds `[::1]:5173` only; `127.0.0.1:5173` preflight failed outside Playwright.
- **Fix:** accept `localhost` alias for wrapper URL only; keep hard fail when neither binds.
- **Files modified:** `tests/helpers/parityHarness.ts`
- **Verification:** real `preflight()` passes; stubbed unreachable fetch still throws `PRE-FLIGHT FAILED ... unreachable after 30s`.

## Auth Gates

None.

## Known Stubs

None — every control id maps to a concrete fixture DOM and gate check. The 56-id fixture route for scratchpad apps is source-anchored (vendored CSS modules / real OpenIDEA components); plan 02+ will measure and fix each wrapper against it.

## Threat Flags

None new. All files are local test/evidence sources; no network endpoints, auth paths or schema changes at trust boundaries. PASS.json humanVerdict remains null until owner handoff (HGC-01).

## Self-Check: PASSED

All 8 created repo files, 2 scratchpad fixture files, 3 task commits and the smoke PASS.json/SMOKE.md artifacts verified present on disk and in git history.
