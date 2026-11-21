---
phase: 53-native-core-form-controls
plan: 01
subsystem: ui
tags: [openidea, css-modules, tokens, react, native-popup, portal]

requires:
  - phase: 52-openidea-mapping-design-contract
    provides: 52-UI-SPEC.md §5/§8 approved token palette and vendor contract; proof-approved CSS sources
provides:
  - 28 vendored OpenIDEA CSS modules plus tokens.css, global.css, LICENSE-OPENIDEA, NOTICE-OPENIDEA under src/components/ui/openidea/
  - Migrated control tokens (28/24/16/10/8, accent #3871e1 both modes, popup radius 10, selection radius 5, offset 4) with D-12 status map and fileStatusMap untouched
  - Native classNames() and portal Popup helpers plus --ui-* bridge with scoped control --danger override
affects: [53-native-core-form-controls plans 02-05, 54-overlay-complex-controls, 55-adoption-theme-parity, 56-antd-removal]

tech-stack:
  added: []
  patterns:
    - Token migration before wrapper implementation, per 52-UI-SPEC §8
    - CSS modules vendored byte-for-byte with Apache-2.0 license and notice
    - Portal popup uses createPortal + fixed placement with native flip/shift; no floating-ui

key-files:
  created:
    - src/components/ui/openidea/ (32 files)
    - src/components/ui/native/classNames.ts
    - src/components/ui/native/popup.tsx
  modified:
    - src/styles/tokens.ts
    - src/components/ui/tokens.contract.ts
    - src/components/ui/ui-tokens.css
    - src/components/ui/__tests__/tokens.test.ts

key-decisions:
  - "Keep --danger (D-12 status) global and scope only [data-oi-control] to --danger-control, so Input.module.css .invalid measures #c54e58/#f57e84 without altering Tag/Badge status colors"
  - "Keep shell --bg-elev / --bg-app and chrome metrics unchanged; only control-scoped palette aliases were migrated"
  - "Popup offset 4 comes from the token contract; flip/shift is computed natively and focus returns to anchor on close"
  - "tokens.test.ts drops the stale duplicate-literal assertion for #3871e1 because workbench-tokens.css already carries a legitimate var(--accent, #3871e1) fallback outside control scope"
patterns-established:
  - "classNames() is the truthy-join helper for all core wrappers; no clsx"
  - "Popup is the shared createPortal helper for select/mentions/time-picker and later overlay controls"

requirements-completed: [NAT-01]

duration: ~7 min
completed: 2026-11-21
---

# Phase 53 Plan 01: Native Core Form Controls Foundation Summary

**Vendored 32 OpenIDEA CSS/license files, migrated control tokens to 28px/#3871e1 with D-12 intact, and added native classNames/Popup helpers with a --ui-* bridge**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-11-21T19:04:29Z
- **Completed:** 2026-11-21T19:11:03Z
- **Tasks:** 3/3
- **Files modified:** 38 (32 vendored + 3 token/test + 3 bridge/helper)

## Accomplishments
- Copied the approved prototype vendor tree byte-for-byte into `src/components/ui/openidea/`.
- Migrated shared control tokens and CSS aliases per `52-UI-SPEC.md` §8 while preserving D-12 status colors, `fileStatusMap`, shell palette and chrome metrics.
- Added native `classNames` / portal `Popup` helpers and scoped control invalid-color override; all focused gates pass with no new dependency.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor CSS module OpenIDEA + LICENSE/NOTICE** - `f17e14a8` (feat)
2. **Task 2: Migration token control theo 52-UI-SPEC §8 + tokens.test.ts** - `b91105bd` (feat)
3. **Task 3: ui-tokens bridge + helper native classNames/Popup** - `36e97e4b` (feat)

## Verification Evidence

- `diff -rq` prototype vendor ↔ `src/components/ui/openidea/` clean; 28 module CSS + tokens.css + global.css + 2 license files; no `/private/tmp` path in `src/`.
- `npx vitest run src/components/ui/__tests__/tokens.test.ts src/components/ui/__tests__/uiTokens.test.ts --bail=1`: 2 files / 11 tests passed.
- `npm run lint`: exit 0. `npx tsc --noEmit`: exit 0. Full Vitest suite not run (project rule).
- `package.json`: no `clsx`, no `@floating-ui/react-dom`, no new dependency.

### Vendored file checksums (SHA-256)

| File | SHA-256 |
|---|---|
| BarButton.module.css | `e3b2ffba8ef8172ea2219f7866b4c476ac795a8b51a06f3733932ef83daae115` |
| Button.module.css | `bafc61616a08d9ff87825d748c4ffdee10ad53db281e0f66ed9a0de9279189db` |
| Checkbox.module.css | `0c2894dc218288276ad4103cb78b0f8120afbf02f66da9a04d26d666b09d4aa8` |
| Chip.module.css | `ddbe7637f1ef9c0ac43503864e6635f61650c131210c2057531fb73d74136520` |
| ConsoleFindBar.module.css | `6e55b159bc74cee5d45c1acb931539353f0c8c4586e475a3d5956f678d09376f` |
| Dialog.module.css | `7818b45d0a504532ebfc1947827034c3b563d6d37f1c568e803c36c969437158` |
| DialogFieldset.module.css | `6fdd36423fe9bd47336b6ddb27f08fe433a708d52f9a2dfd9bf792b190e47194` |
| Feedback.module.css | `eaeccf1a035cc89e4a2eefd443df408647a994821a37e201a298ef98d66cbbb8` |
| FloatingToolbar.module.css | `750bcee5d6731066c977b6dad4fd671192f63177600b31487325b29980ba84a2` |
| HiddenTabsPopup.module.css | `332e3ae948b92ea1ae2a563ca32580caa34dedda2208b0d3c2b9be7252f1a114` |
| HighlightedText.module.css | `598a711482fbd06d7615a52f94603942e0929b9bb3ee4540f8e9c637384ee338` |
| Input.module.css | `ba0ea4c5e2838fda563e6afb740803082ccbf74a87cfd075c0ac59a5cc5b4168` |
| Kbd.module.css | `350c2ba62f423c12ace6802a77caeda1f2b5c49c2d0afc9f7a2ad412c1c4dbad` |
| LICENSE-OPENIDEA | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| List.module.css | `7b33839d5901df0868b9a1e3b8e7bee0f20e492a8b112eeb7a7f89c4cd661b1e` |
| LogPane.module.css | `fd903881b25ab5394ae2a1b03b726d32a68690f2c85312159cd1306697ef6137` |
| Menu.module.css | `6b7d6398c15eeff8e3b8cc87d31fb69a2ac8b08e7d10f3974d250cb3ab603749` |
| NOTICE-OPENIDEA | `682a1ac37ab5a629459e66f21e5eb9f392ea74c886e09d6f5042fc1d49194bda` |
| Popup.module.css | `ed3f839b3e2c18a6279f36f685e34f64cc55e95e2021de47c2c27267962fa13c` |
| Scrollbar.module.css | `4704ec072f26be192785ea56ff479a0004e7e5a7dcf4247ea644e4ecea7ef6cb` |
| Select.module.css | `b2dd3e782f290cc5e9459a5b7ce6d21e107c0d2b8337b11e9128cb31e0312bf7` |
| SelectableText.module.css | `386689252fb9a0173f7669707ce15fe23090845a8d8f3490797550ec7ad1a559` |
| SourcePreview.module.css | `e153be551f0ac46902e42f0fde89e012ed3b21bd49276d5dc5773318e7e9fd89` |
| Spinner.module.css | `c907e59c50d56333140c359709b7e3150f77dd8a4242412875ec59683694f92d` |
| Splitter.module.css | `bef91f3b7d42ea30b5454945d192265341167de3ea5a19575d2b66d0ae6b8c45` |
| Tabs.module.css | `b240136848ddf0d6c7d869a2a7b937c72d648b313cec7c035da68882b71530b7` |
| Tooltip.module.css | `3408762e2faa3ce427b6dac37ceccd9a77edb5f568f7a2f921236ba079a54a33` |
| Tree.module.css | `55d29b6f3462aee93face40e7d9a65cc761811e15ef9b56682f199cc7816732f` |
| global.css | `65b75efb98d57ddc4cbd1551bc1f6f3d6d32e866a8fa6ab70884cf7239547ac2` |
| icons.module.css | `f58b2fac267d27e4ba1e433ed48d09c98f46dfaec0c037bd13661201ec57edb9` |
| pointerDrag.module.css | `89b53c2a49d45b700843d4a879ed7f43af84e2f03c5aed7bbaab4377ec504435` |
| tokens.css | `47ccda071a3f872c88904bb8c9def828466a8c54878d24e8798c4bb3a29803df` |


## Files Created/Modified

- `src/components/ui/openidea/` - 28 vendored CSS modules + tokens/global + Apache-2.0 LICENSE/NOTICE.
- `src/styles/tokens.ts` - migrated control metrics, accent, aliases and scoped control danger token; D-12/fileStatusMap/chrome unchanged.
- `src/components/ui/tokens.contract.ts` - same helper signatures, values derived from migrated tokens.
- `src/components/ui/ui-tokens.css` - existing `--ui-*` consumers plus scoped control `--danger` override.
- `src/components/ui/native/classNames.ts` - dependency-free class join helper.
- `src/components/ui/native/popup.tsx` - portal popup with native flip/shift and focus restore.
- `src/components/ui/__tests__/tokens.test.ts` - migrated assertions; D-12 and fileStatusMap still locked.

## Decisions Made

- Vendored CSS kept byte-for-byte; no selector or metric edits.
- Control palette aliases live in `tokens.ts`, not in wrappers; `applyCssVariables(mode, target)` still writes both target and `document.documentElement`.
- D-12 status colors remain global; only controls receive `--danger-control` via `[data-oi-control]`.
- No new UI runtime dependency; popup positioning is native.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `--h-list-row` alias**
- **Found during:** Task 2 verification
- **Issue:** New test asserted `css['--h-list-row'] === '24px'` but the alias was absent.
- **Fix:** Added `--h-list-row: 24px` to shared `cssMetrics`.
- **Files modified:** `src/styles/tokens.ts`
- **Verification:** Focused tokens test green.
- **Committed in:** `b91105bd` (same task commit, amended before commit)

**2. [Rule 1 - False assertion] Duplicate accent literal check**
- **Found during:** Task 2 verification
- **Issue:** Pre-existing `workbench-tokens.css` already contains `var(--accent, #3871e1)` fallbacks; the old test's blanket "no accent hex in shell CSS" assertion became invalid after migration.
- **Fix:** Removed only `#3871e1` from that shell-duplicate list while keeping the D-12 status hexes blocked; control palette parity stays asserted in `tokens.test.ts`.
- **Files modified:** `src/components/ui/__tests__/tokens.test.ts`
- **Verification:** Focused tokens test green.
- **Committed in:** `b91105bd`

**3. [Rule 1 - Bug] Popup shift near bottom edge**
- **Found during:** Task 3 self-check
- **Issue:** If both below and above placements overflowed, popup fell back to an illegal negative/overflowing top.
- **Fix:** Added clamped shift fallback after flip attempt.
- **Files modified:** `src/components/ui/native/popup.tsx`
- **Verification:** `npm run lint` and `npx tsc --noEmit` green after fix.
- **Committed in:** `36e97e4b`

---

**Total deviations:** 3 auto-fixed (Rule 1 bug/false assertion). **Impact:** All fixes local to plan scope; no API, architecture or dependency change.

## Issues Encountered
None. Verification touched only scoped paths; full Vitest suite was not run per project rule.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Ready for 53-02. Foundation exists: vendored CSS, migrated tokens, `classNames` and `Popup`. Wrappers should consume `getSharedControlTokens()`/`getStatusTokens()` and keep API byte-for-byte. `data-oi-control` is now the hook that scopes control-level `--danger`; wrappers must set it for invalid controls to measure `#c54e58`/`#f57e84`.

---
*Phase: 53-native-core-form-controls*
*Completed: 2026-11-21*
