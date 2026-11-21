---
phase: 49-design-system-foundation
plan: 08
subsystem: testing
tags: [eslint-flat-config, babel-parser, ts7, no-restricted-imports, guardrails, local-only-ci, vitest]

requires:
  - phase: 49-design-system-foundation
    provides: complete src/components/ui barrel + live-tree scanner helpers from plans 03-07
provides:
  - Flat ESLint config with Babel TS parser, scoped no-restricted-imports (allowTypeImports true), ui/ override
  - npm scripts lint / lint:adoption / test:foundation running entirely locally (no GitHub Actions)
  - Negative and positive guard fixtures proving the runtime-import ban and type-import exception
  - D-04 live-tree coverage gate plus guard-config assertions, both automated in Vitest
affects:
  - Plan 09 records the four SUS-package legitimacy verdicts as a non-blocking end-of-phase advisory
  - Phase 50 promotes lint:adoption to lint after app-wide AntD import migration

tech-stack:
  added:
    - eslint@10.11.0
    - @eslint/js@10.0.1
    - globals@17.14.0
    - eslint-plugin-react-hooks@7.1.1
    - @babel/eslint-parser@8.1.2
    - @babel/core@8.1.3
    - @babel/preset-typescript@8.0.7
  patterns:
    - Babel 8 preset-typescript enables TSX via babelOptions.parserOpts.plugins ['jsx']; legacy isTSX/allExtensions options removed upstream
    - Internal ui/antdTheme bridge owns the only runtime AntD theme import outside ui/ and applies shared control policy (anti-pass-through)
    - Lint rule has zero exceptions; phase scope is expressed through which paths npm run lint receives, not through config ignores

key-files:
  created:
    - eslint.config.mjs
    - tests/fixtures/guard/bad-import.tsx
    - tests/fixtures/guard/good-import.tsx
    - src/components/ui/__tests__/coverage.test.ts
    - src/components/ui/__tests__/guardConfig.test.ts
    - src/components/ui/antdTheme.ts
  modified:
    - package.json
    - package-lock.json
    - src/styles/tokens.ts
    - tsconfig.json

key-decisions:
  - "Babel 8 preset-typescript removed isTSX/allExtensions; pinned parser config uses parserOpts.plugins ['jsx'] instead — research example was Babel 7 syntax."
  - "npm run lint scans the positive fixture file explicitly, not the whole fixture directory: the negative fixture must remain red under direct ESLint invocation. Rule itself has zero config exceptions."
  - "src/styles/tokens.ts cannot import runtime `theme` from antd (GUARD-01). ui/antdTheme.ts bridges it and visibly applies getSharedControlTokens() so the anti-pass-through scanner accepts it."
  - "lib raised ES2022 -> ES2023 (target unchanged) because pre-existing app code already calls findLast/findLastIndex; required for tsc and build green."
  - "Four SUS packages verified by npm view repository.url against official orgs before install; human verdict deferred to plan 09 advisory per end-of-phase human_verify_mode."

patterns-established:
  - "Guard enforcement lives in ESLint config with one ui/ override; adoption debt lives in npm script scope."
  - "Fixture tests assert the restriction message text and absence of parse errors, not just a non-zero exit."

requirements-completed: [GUARD-01, GUARD-02, GUARD-03, CTRL-01]

duration: ~10min
completed: 2026-11-21
---

# Phase 49 Plan 08: Design System Foundation — Local ESLint Guard & Coverage Gate Summary

**Babel-backed flat ESLint config blocks runtime AntD/icon imports outside ui/ with type-import exception, backed by live-tree coverage and local-only npm gates**

## Performance

- **Duration:** ~10 phút
- **Started:** 2026-11-21T09:02:12Z
- **Completed:** 2026-11-21T09:12:00Z
- **Tasks:** 3/3
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- Task 1: cài 7 package toolchain ở pin chính xác sau khi kiểm tra repository URL của 4 package SUS khớp `eslint/eslint`, `sindresorhus/globals`, `babel/babel`; TS7 giữ nguyên, không cài typescript-eslint.
- Task 2: `eslint.config.mjs` với Babel TS parser (chạy được TS7), rule cấm runtime import `antd`/`@ant-design/icons` nhưng cho phép `import type` (D-19), override ui/ là nơi duy nhất hợp lệ. Scripts `lint`, `lint:adoption`, `test:foundation` chạy local. Fixture âm fail đúng 2 restriction messages; fixture dương pass.
- Task 3: `coverage.test.ts` quét live tree (52 components + 141 icons, 253 wrapped names, missing `[]`, pass-through `[]`) và chặn vacuum scan; `guardConfig.test.ts` chạy ESLint subprocess trên fixture âm, kiểm tra script/config/local-only workflow. `npm run lint`, `npm run test:foundation` (10 files / 61 tests), `npm run build` đều xanh.

## Task Commits

1. **Task 1: Install pinned ESLint/Babel toolchain** — `94fb7bd1` (chore)
2. **Task 2: Create flat ESLint config, scripts, fixtures** — `6d8fd6db` (feat)
3. **Task 3: Add coverage gate and local-only guard assertions** — `e7db047e` (test)

## Files Created/Modified

- `eslint.config.mjs` — flat config, Babel parser, scoped rule + ui/ override, phase-boundary comment
- `package.json` — 7 exact devDependencies + 3 npm scripts
- `package-lock.json` — lockfile regenerated by npm 11
- `tests/fixtures/guard/bad-import.tsx` — negative fixture (must fail with both restriction messages)
- `tests/fixtures/guard/good-import.tsx` — positive fixture (wrapper imports + `import type`)
- `src/components/ui/__tests__/coverage.test.ts` — D-04 live-tree coverage gate
- `src/components/ui/__tests__/guardConfig.test.ts` — local-only config + subprocess fixture assertions
- `src/components/ui/antdTheme.ts` — policy-carrying bridge for runtime AntD theme import
- `src/styles/tokens.ts` — imports bridge instead of runtime `antd`
- `tsconfig.json` — `lib` ES2023 to match existing `findLast`/`findLastIndex` usage

## Decisions Made

- Babel 8 API differs from research example: JSX enabled through `parserOpts.plugins: ['jsx']`; `isTSX`/`allExtensions` now throw.
- Lint rule keeps zero config exceptions; negative fixture excluded from `npm run lint` only by passing the positive file path in the script.
- Theme bridge applies `getSharedControlTokens()` so it is a real policy point, not a bare `export { ... } from 'antd'`.
- `lib` bumped to ES2023 without changing `target` (output format unchanged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Babel 8 removed `isTSX`/`allExtensions`**
- **Found during:** Task 2 (first `npm run lint`)
- **Issue:** 68 parse errors; pinned `@babel/preset-typescript@8.0.7` throws on the Babel 7 options from 49-RESEARCH.md.
- **Fix:** Removed legacy flags; set `babelOptions.parserOpts.plugins: ['jsx']`.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` exits 0; both fixtures parse.
- **Committed in:** `6d8fd6db`

**2. [Rule 3 - Blocking] `src/styles/tokens.ts` imported runtime `theme` from `antd`**
- **Found during:** Task 2 (lint after parser fix)
- **Issue:** GUARD-01 correctly flagged a runtime AntD import outside ui/; plan did not anticipate this phase-02 file.
- **Fix:** Added `src/components/ui/antdTheme.ts` bridge with `getAntdAlgorithms(mode)` applying `getSharedControlTokens()`; `tokens.ts` imports that function. Bridge initially written as bare re-export, which the pass-through scanner rejected — rewritten as a policy-carrying function.
- **Files modified:** `src/components/ui/antdTheme.ts`, `src/styles/tokens.ts`
- **Verification:** live scanner reports pass-through `[]`; tsc green.
- **Committed in:** `6d8fd6db`, `e7db047e`

**3. [Rule 3 - Blocking] negative fixture made `npm run lint` impossible to green**
- **Found during:** Task 2 (plan's own verify command is self-contradictory: lint whole fixtures dir must be green while bad fixture must fail)
- **Issue:** Plan script included `tests/fixtures/guard` directory, so the intentionally-bad file broke the scoped gate.
- **Fix:** Script now targets `tests/fixtures/guard/good-import.tsx` explicitly; direct `npx eslint .../bad-import.tsx` stays red by design.
- **Files modified:** `package.json`
- **Verification:** `npm run lint` 0; bad fixture 2 restriction errors; good fixture 0.
- **Committed in:** `6d8fd6db`

**4. [Rule 3 - Blocking] tsc failed on pre-existing ES2023 APIs**
- **Found during:** Task 3 (typecheck)
- **Issue:** `AgentTerminalLog.tsx` and `ChatMessageList.tsx` call `findLastIndex`/`findLast` but `lib` was ES2022.
- **Fix:** Changed `lib` to `["ES2023", "DOM", "DOM.Iterable"]`, `target` unchanged.
- **Files modified:** `tsconfig.json`
- **Verification:** `npx tsc --noEmit` exit 0; `npm run build` exit 0.
- **Committed in:** `e7db047e`

**5. [Rule 3 - Blocking] npm cache root-owned**
- **Found during:** Task 1 install
- **Issue:** `~/.npm/_cacache` has root-owned entries, EACCES on install (sandbox and non-sandbox).
- **Fix:** Used a fresh temporary npm cache via `npm --cache "$(mktemp -d ...)"`; no system cache or permissions changed.
- **Files modified:** none (install mechanism only)
- **Verification:** all seven packages installed and `npm ls --depth=0` matches pins.

**6. [Rule 3 - Blocking] test path and strict TS fixture typing**
- **Found during:** Task 3
- **Issue:** coverage test used `../../../tests/...` (one level short) and good fixture spread `ButtonProps` into wrapper whose `variant` is narrowed, failing `exactOptionalPropertyTypes`.
- **Fix:** Corrected to `../../../../tests/helpers/antdInventory`; fixture references `ButtonProps` via `Pick<...>` type alias without forwarding conflicting props.
- **Files modified:** `src/components/ui/__tests__/coverage.test.ts`, `tests/fixtures/guard/good-import.tsx`
- **Verification:** scoped Vitest 8/8 pass; tsc has no errors in plan-owned files.
- **Committed in:** `e7db047e`

---

**Total deviations:** 6 auto-fixed (all Rule 3 blocking)
**Impact on plan:** All fixes necessary to make the guard executable with the pinned Babel 8 / TS7 stack and to satisfy the green build gate. No app migration, no new product surface, no change to GUARD-01 semantics.

## Issues Encountered

- `npm install` reported 14 audit vulnerabilities in the existing dependency tree; not introduced or resolved by this plan (out of scope).
- `npm run lint:adoption` exits 1 with 404 errors across ~248 app files — expected Phase-49/Phase-50 boundary, not a failure of this plan. Phase 50 promotes it to `lint`.
- `npm view` repository URLs matched official orgs; four SUS-package human verdicts remain as a non-blocking end-of-phase advisory for plan 09 (per `human_verify_mode: end-of-phase`).
- No full Vitest suite run (project rule).
- No `.github/workflows` file created or modified; existing `desktop-build.yml` / `knowledge-server-docker.yml` untouched.

## User Setup Required

None. No external service configuration; all gates run locally.

## Next Phase Readiness

- Guard is live: `npm run lint` green on Phase-49 scope, `npm run test:foundation` green (10 files / 61 tests), `npm run build` green.
- `lint:adoption` is the tracked adoption gate for Phase 50 (currently red by design).
- Plan 09 must include the non-blocking advisory recording the four SUS-package legitimacy verdicts.
- Phase 50 can migrate app imports to `src/components/ui` and then promote `lint:adoption` to `lint`.

## Known Stubs

None. All fixtures, tests, and the theme bridge carry real behavior; no placeholder, TODO, empty re-export, or mock data.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change. T-49-20 mitigated by automated repo-URL/pin verification; T-49-21 by the restriction rule + negative fixture; T-49-23 by non-empty scan and message assertions; T-49-24 by workflow/script assertions.

## Self-Check: PASSED

- Files exist: `eslint.config.mjs`, `tests/fixtures/guard/{bad,good}-import.tsx`, `src/components/ui/__tests__/{coverage,guardConfig}.test.ts`, `src/components/ui/antdTheme.ts`.
- Commits `94fb7bd1`, `6d8fd6db`, `e7db047e` present in `git log`.
- `npm run lint` exit 0; `npm run test:foundation` 10 files / 61 tests pass; `npx tsc --noEmit` exit 0; `npm run build` exit 0.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
