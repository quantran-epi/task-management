---
phase: 54-native-overlay-complex-controls
iteration: 1
status: verified
review_path: .planning/phases/54-native-overlay-complex-controls/54-REVIEW.md
findings_in_scope: 5 warnings (W-01..W-05) + INFO-01 prop leak + INFO-02 dead code
fixed: 7
skipped: 0
---

# Phase 54: Review Fix Report

## Fixes applied (atomic commits)

| Commit | Finding | Change |
|---|---|---|
| `e61e0bad` | W-01 | `defaultFooter()` spreads `okButtonProps`/`cancelButtonProps` (`className`, `style`, `disabled`, `loading`, `danger`); loading OK locks Cancel per AntD. Focused test added in `overlayComposite.test.tsx`. |
| `e61e0bad` | W-02 | `onOk` invoked inside `Promise.resolve().then(...)`; rejection keeps dialog open without unhandled rejection, resolution dismisses. Focused test with `unhandledrejection` listener added. |
| `cbe2f79a` | W-03 | `PopupProps.preferredPlacement` + `place()` preferred-side selection; `preferredSide()` maps AntD placement suffix to side. Wired in Tooltip, Popover, Dropdown, Popconfirm. Focused `placement="top"`/`"left"` tests added. |
| `cbe2f79a` | W-04 | Removed `DialogSurface` branch from Popconfirm; controlled `open` + long `description` keeps the same 4px anchored bubble, `[data-oi-control="popconfirm"]` hook, and Escape/outside `onCancel`. Focused test added. |
| `cbe2f79a` | W-05 | `DialogSurface` registers `focusin` guard; focus outside the dialog is pulled back to first focusable, with BODY-popup exception and close-trigger restore bypass. Focused test added in `overlayFoundation.test.tsx`. |
| `ab9f5073` | INFO-01 | `Tree` consumes `blockNode`/`virtual`/`height`; `Segmented` consumes `block` and applies `width:100%` via style. Prop-leak stderr eliminated; no caller changes. |
| `629d1179` | INFO-02 | Removed dead `void getSharedControlTokens()`, `void withoutUndefined`, `void config` and matching unused imports in `select.tsx`, `date-picker.tsx`, `config-provider.tsx`. |

INFO-03..INFO-05 intentionally unchanged: comment already documents the narrowed CSS assertion; no callers pass notification `placement`; Chrome spec is green and duplication cleanup belongs to Phase 57.

## Verification (all green)

- `npx tsc --noEmit` — exit 0
- `npm run lint` — exit 0
- `node scripts/check-native-imports.mjs $(28 wrappers)` — exit 0
- 20-file scoped Vitest (6 overlay suites + `controls.test.tsx` + 4 migrated caller suites + 9 guards) — 20 files, 187 tests passed, zero stderr prop leaks
- `scanWrappers()` = 257; `ICONS` = 141; `wrapper_files` = 56
- `npm run build` — exit 0
- `npx playwright test e2e/phase54-overlay.spec.ts --project=chromium --reporter=list` — 2 passed (light + dark), zero console errors/pageerrors
- Full Vitest suite intentionally not run (project memory rule)

REVIEW-FIX.md intentionally uncommitted.
