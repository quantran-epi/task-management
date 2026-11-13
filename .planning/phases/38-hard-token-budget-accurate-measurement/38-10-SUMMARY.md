---
phase: 38-hard-token-budget-accurate-measurement
plan: 10
subsystem: ai
tags: [token-budget, ai-office, tokenizer, js-tiktoken, estimation, supply-chain]
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 07
    provides: tokenEstimate.ts with the chars÷4 fallback, the loader seam and the pre-call measurement at dispatch
provides:
  - js-tiktoken@1.0.21 pinned exactly in package.json and package-lock.json
  - tokenEstimate.ts loading js-tiktoken/lite + js-tiktoken/ranks/o200k_base through literal lazy subpath imports
  - getEncoderKind() === 'tiktoken' in the installed state
  - BPE-grade numbers on plan 07's existing pre-call warning path with no call-site change
affects: [38-09, 38-11, 38-12]
tech-stack:
  added:
    - "js-tiktoken@1.0.21 (MIT, github.com/dqbd/tiktoken, one runtime dep base64-js already present, no postinstall)"
  patterns:
    - "Tokenizer behind a dynamic import of the lite + single-rank subpaths, never the package root, so it lands in its own lazy chunk"
    - "Load failure and encode failure both degrade to chars÷4 rather than throwing into a turn"
key-files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - src/services/ai/office/tokenEstimate.ts
    - tests/services/ai/office/tokenEstimate.test.ts
key-decisions:
  - "The checkpoint was pre-approved by the user in this session (\"không cần checkpoint, mày tự làm đi\"); the five facts were verified read-only with npm view js-tiktoken@1.0.21 before the install"
  - "Both imports go through the package's lite and ranks/o200k_base subpaths, never the root entry point, so the startup bundle does not grow"
  - "The Vietnamese test asserts a positive integer, stability and inequality with chars÷4 — never a direction, because o200k_base can land either side of the heuristic"
requirements-completed: [AIO-BUDGET-02]
duration: 5min
completed: 2026-11-13
---

# Phase 38 Plan 10: Real BPE Counting Behind the Approved Tokenizer

**`js-tiktoken@1.0.21` is pinned and loaded lazily from `lite` + `ranks/o200k_base`, so the estimator now reports `o200k_base` BPE counts while the chars÷4 path survives as a tested fallback — and the tokenizer lands in its own 1.15 MB gzip chunk, not the entry bundle**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-13T15:26:11Z
- **Completed:** 2026-11-13T15:27:50Z
- **Tasks:** 2 (1 checkpoint, 1 auto)
- **Files modified:** 4

## Accomplishments

- `js-tiktoken` is pinned at exactly `1.0.21` (`--save-exact`, no caret). The lockfile diff adds one package node plus the `base64-js@^1.5.1` edge, which was already present as a transitive dependency (`package-lock.json:5994`). Nothing else moved.
- `tokenEstimate.ts` now loads `js-tiktoken/lite` and `js-tiktoken/ranks/o200k_base` through literal dynamic subpath imports and constructs `new Tiktoken(ranks.default)`. Plan 07's widened `string` specifiers, the `@vite-ignore` bypass and the local module-shape casts are gone; TypeScript resolves the package's bundled types.
- The `try`/`catch` shape is unchanged: a rejected loader yields `null` and a throwing `encode` falls through, both landing on `Math.ceil(text.length / 4)` with `getEncoderKind()` reporting `'chars-div-4'`.
- The `ponytail:` comment now names the real ceiling ("estimates are model-family approximations") and the upgrade path ("swap the encoding constant if the default model stops being gpt-4o").
- No call site changed. Plan 07's `payloadText` + `estimateTokens` at dispatch now feeds tokenizer-grade numbers into `provisionalInputTokens`, and the ledger is still written only at the terminal seam.
- The production build emits the tokenizer as `o200k_base-*.js` (2,325.56 kB raw / 1,153.22 kB gzip) plus `lite-*.js` (6.14 kB). The entry chunk references them only through `import('./lite-….js')` / `import('./o200k_base-….js')` inside the async loader — verified by grepping the built entry, not assumed from source.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm the js-tiktoken pin before install** — checkpoint only, no files changed, no commit (see Deviations)
2. **Task 2: Install and switch the estimator to o200k_base** — `9493b2b9` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `package.json` — one added line: `"js-tiktoken": "1.0.21"`
- `package-lock.json` — the root dependency entry plus the `node_modules/js-tiktoken` node; `base64-js` edge only
- `src/services/ai/office/tokenEstimate.ts` — literal lazy subpath imports, real `Tiktoken` construction, updated `ponytail:` comment; `setEncoderLoaderForTests` and `resetTokenEstimatorForTests` kept as-is
- `tests/services/ai/office/tokenEstimate.test.ts` — 7 tests: empty text, `'tiktoken'` kind, concrete ASCII counts (2 and 10), the Vietnamese inequality with no direction asserted, reset, loader-failure fallback, encode-failure fallback

## Decisions Made

- **The checkpoint was pre-approved, not skipped.** The user said in this session that no checkpoint was needed and to proceed. The five facts were still verified read-only via `npm view js-tiktoken@1.0.21` (name/version exact, MIT, `git+https://github.com/dqbd/tiktoken.git`, only runtime dep `base64-js@^1.5.1`, scripts limited to `build` and `test` — no postinstall, ~1.14 MB gzip) before `npm install` ran. The pin is `--save-exact` so a later minor cannot drift in.
- **Subpath imports, not the root.** The package root's entry point pulls every rank table; `lite` + one rank keeps the chunk at the single encoding actually used.
- **No direction asserted for the Vietnamese comparison.** Measured locally: the sample `'Xin chào, đây là một đoạn văn bản tiếng Việt dùng để kiểm tra bộ đếm token.'` is 21 BPE tokens against `Math.ceil(75/4) = 19`, but a shorter sample tokenizes at exactly `chars÷4`, so a direction claim would be an ungrounded assertion. The test pins integer, positive, stable, and unequal.
- **Two failure seams, not one.** A loader rejection proves the "package absent" path; an `encode` throw proves the "tokenizer present but failing" path. The second is new — plan 07 could not reach it because no encoder existed.

## Deviations from Plan

### Auto-fixed Issues

None.

### Checkpoint Handling

**Task 1 (`checkpoint:human-verify`, `gate="blocking-human"`) — pre-approved by the user.** The user stated in this session that no checkpoint was needed and to proceed. The orchestrator had already verified the five facts read-only with `npm view js-tiktoken@1.0.21`, and this executor re-checked the package metadata from the installed tree (`exports`, `types`, `files`) before editing. No install command ran before that verification. Recorded here rather than returned as a blocking checkpoint.

## Issues Encountered

- `npm install` reported "20 vulnerabilities (5 low, 9 moderate, 6 high)" — pre-existing across the tree, not introduced by this one added package. Out of scope; not touched.
- `npx tsc --noEmit -p tsconfig.json` printed no `error TS` line. The installed package's bundled types resolve through the `exports` map without any local shim.
- Scoped runs only, per the project rule: `tests/services/ai/office/tokenEstimate.test.ts` 7/7, `tests/services/ai/office/teamRunCoordinator.test.ts` 149/149. The full suite was never run.

## User Setup Required

None. `js-tiktoken@1.0.21` is installed and pinned; no token, key or dashboard step is involved.

## Threat Surface Notes

- **T-38-SC (tampering, install):** mitigated — the exact pin `1.0.21` with `--save-exact`, and the lockfile diff was reviewed: `js-tiktoken` plus the already-present `base64-js` edge, nothing else.
- **T-38-26 (supply-chain substitution):** mitigated — MIT, declared repository `github.com/dqbd/tiktoken`, no postinstall script, exact version. Verified from registry metadata before install and from the installed `package.json` after.
- **T-38-27 (DoS, 1.14 MB gzip chunk):** accepted and now measured — the build emits `o200k_base-*.js` at 1,153.22 kB gzip as a separate chunk reached only through the dynamic import inside the loader; the entry chunk carries the import call, not the rank table. A load failure degrades to chars÷4.

## Known Stubs

None. The chars÷4 fallback is a tested degradation path, not a stub: `getEncoderKind()` reports which estimator is live, and the fallback only appears when the tokenizer fails to load or throws.

## Next Phase Readiness

- Plan 09 can render the `~` marker knowing the number behind it is either provider-reported or BPE-estimated, never a chars÷4 guess in the normal path.
- Plans 11/12 need no tokenizer work; the public shape of `estimateTokens` / `getEncoderKind` is unchanged from plan 07.
- If the default model family ever moves off gpt-4o, swap the `js-tiktoken/ranks/o200k_base` specifier — one line, no caller change.

## Self-Check: PASSED

- `src/services/ai/office/tokenEstimate.ts`, `tests/services/ai/office/tokenEstimate.test.ts`, `package.json`, `package-lock.json` all present.
- Commit `9493b2b9` exists in `git log`.
- `grep -n '"js-tiktoken"' package.json` matches with the exact pin.
