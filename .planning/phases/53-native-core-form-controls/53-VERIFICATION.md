# Phase 53 Verification — NAT-01 Consolidation Gate

**Date:** 2026-11-22 (refreshed after deep code review; original gate 2026-11-21)
**Plan:** 53-05 (final consolidation gate)
**Scope:** 26 core/form wrappers, 257-export guard, 141 icons, caller API stability, scoped gates, 13/13 review findings.
**Rule honored:** no `npm test`, no full Vitest suite. Every command below ran on the real tree; stdout captured verbatim.
**Status: PASSED** — all five ROADMAP success criteria verified; all 13 review findings resolved; focused gates green.

## Gate Result Summary

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npm run lint` | PASS (exit 0, `eslint src`) |
| Build | `npm run build` | PASS (`✓ built in 1.52s`; only pre-existing chunk-size / INEFFECTIVE_DYNAMIC_IMPORT warnings) |
| Scoped Vitest (11 files, `--bail=1`) | command below | PASS (11 files / 77 tests — original 62 + 15 from `formControls.test.tsx` added after review) |
| 26-wrapper runtime-import gate | Node script, 7 selftests | PASS (0 offenders, 7/7 selftests correct) |
| Export guard | `scanWrappers()`/`findMissingWrappers()` | PASS (257 / `[]`) |
| Icon count | `grep -c '^export const .* = wrapIcon('` | PASS (141) |
| Review findings | `53-REVIEW.md` + `53-REVIEW-FIX.md` | PASS (13/13 resolved; `status: clean`, 0 critical/0 warning, 1 non-blocking info since fixed) |
| Plan index | `gsd-tools phase-plan-index 53` | PASS (5 plans, waves 1-5, no warning) |

## 5 Success Criteria — ROADMAP Phase 53 §75-81

### Criterion 1 — core wrappers native, no runtime AntD

> Mọi wrapper core/form render từ React + CSS variables/CSS module/Web API tự build; không import `antd` hay `@ant-design/icons`, không thêm thư viện UI runtime.

**Command:** Node gate over the 26 files from `53-PATTERNS.md` §1, using a statement-aware import scan; allowed: `import type`/`export type` (Phase 56 debt). Selftests prove the scan flags runtime imports and ignores type-only ones.

**Actual stdout:**

```text
CORE_WRAPPERS=26
RUNTIME_IMPORT_OFFENDERS=0
SELFTESTS={"runtime":1,"typeOnly":0,"inlineTypeOnly":0,"exportTypeOnly":0,"iconRuntime":1,"deepRuntime":1,"multilineMixed":1}
```

**Refreshed 2026-11-22 stdout (statement-aware scan over the 26 files listed in §1):**

```text
CORE_WRAPPERS=26
RUNTIME_IMPORT_OFFENDERS=0
```

**Status:** PASS. 26/26 native, 0 runtime AntD/icon imports. All 26 wrappers import `tokens.contract` helpers (`getSharedControlTokens` in 26/26; `getStatusTokens` in status-bearing wrappers; `withoutUndefined` in 6).

**Known debt (not Phase 53):** 19 non-core overlay wrappers still import AntD at runtime — Phase 54/56. 8 deep-import icon lines in `src/workbench/toolwindows/RemoteGitExplorer.tsx` — Phase 55/56.

### Criterion 2 — native icons + accessible names

> Icon tự build thay `@ant-design/icons`; mỗi icon button có accessible name (`aria-label`) quan sát được trong DOM.

**Command:** `grep -c '^export const .* = wrapIcon(' src/components/ui/icon.tsx`

**Actual stdout:**

```text
141
```

Supporting evidence: `src/components/ui/__tests__/button.test.tsx` passes with `SearchOutlined` from `../icon` and `aria-label="Tìm kiếm"` (10-file scoped run, 62 tests). `wrapIcon` renders vendored SVG from `icon-svgs/descriptors.json`; no runtime `@ant-design/icons` import in `icon.tsx`.

**Status:** PASS.

### Criterion 3 — caller API unchanged

> Props/API wrapper core giữ nguyên — caller hiện tại không phải sửa khi chạy focused test.

**Commands / stdout:**

`npx tsc --noEmit` → exit 0, no output.
`npm run lint` → exit 0:

```text
> personal-task-workload-planner@0.1.1 lint
> eslint src
```

`node --experimental-strip-types /tmp/phase53-inventory-gate.mjs` (calls the unmodified `tests/helpers/antdInventory.ts`):

```text
SCAN_WRAPPERS=257
MISSING_WRAPPERS=[]
CONSUMED_COMPONENTS=29
CONSUMED_ICONS=1
```

**Status:** PASS. Typecheck across all callers clean; wrapper guard unchanged; no caller file was edited by Phase 53. Post-review fixes touched only 3 source files (`select.tsx`, `radio.tsx` + `formControls.test.tsx`, plus the stale-directive cleanup in `select.tsx`) and no caller.

### Criterion 4 — shared token contract, no pass-through

> Mọi wrapper core gọi helper token contract chung; không có re-export rỗng hay implementation trỏ lại AntD.

**Commands / stdout:** `src/components/ui/__tests__/coverage.test.ts` (asserts no pass-through wrapper and `findMissingWrappers() === []`) passed in the scoped run; runtime-import gate stdout above shows 0 AntD imports in 26 core files.

**Defect found and fixed at owner during this gate:** first scoped run failed `uiTokens.test.ts`:

```text
 FAIL  src/components/ui/__tests__/uiTokens.test.ts > wrapper --ui-* contract has real CSS consumers > references every injected property with var() in the consumed stylesheet
AssertionError: expected [ '--ui-progress-stroke', …(1) ] to deeply equal []
+ [
+   "--ui-progress-stroke",
+   "--ui-skeleton-shimmer-duration",
+ ]
```

`progress.tsx` and `skeleton.tsx` inject both custom properties; the vendored CSS consumes them with fallbacks, but `ui-tokens.css` had no `var(name,` consumer for either. Fixed by adding two zero-specificity consumers in `src/components/ui/ui-tokens.css` (`border-block-color` for `--ui-progress-stroke`, `animation-duration` for `--ui-skeleton-shimmer-duration`). Test assertion untouched; rerun green.

**Status:** PASS after fix. No source wrapper or caller edited in 53-05.

### Criterion 5 — focused gates green

> `tsc --noEmit` + lint + focused test core controls xanh, không còn import AntD trong nhóm core.

**Command (exact 53-PATTERNS §4.3, 10 files, `--bail=1`; no full suite):**

```bash
npx vitest run \
  src/components/ui/__tests__/button.test.tsx \
  src/components/ui/__tests__/controls.test.tsx \
  src/components/ui/__tests__/wave02Wrappers.test.tsx \
  src/components/ui/__tests__/tokens.test.ts \
  src/components/ui/__tests__/uiTokens.test.ts \
  src/components/ui/__tests__/antdInventory.test.ts \
  src/components/ui/__tests__/coverage.test.ts \
  src/components/ui/__tests__/guardConfig.test.ts \
  src/components/ui/__tests__/staticApiGuard.test.ts \
  src/components/ui/__tests__/inlineStyleSweep.test.ts \
  src/components/ui/__tests__/formControls.test.tsx \
  --bail=1
```

`formControls.test.tsx` was added after the deep review to lock the 3 residual fixes (RR-01 Select lead, RR-02 Radio event payload, RR-03 RadioButton `defaultChecked`) plus the core form-control behavior suite.

**Actual stdout (refreshed rerun 2026-11-22):**

```text
 RUN  v5.0.2 /Users/tranducquan/Working/Personal/task-management

Not implemented: Window's getComputedStyle() method: with pseudo-elements
  ... (7 duplicate lines)
 Test Files  11 passed (11)
      Tests  77 passed (77)
   Start at  04:34:15
   Duration  9.62s (environment 38%, import 28%, tests 21%, setup 8%, transform 4%)

Environment  jsdom was created 11 times · 3.40s total, 38% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments
```

Plus `npx tsc --noEmit` (exit 0), `npm run lint` (exit 0) and `npm run build` (exit 0) above.

**Status:** PASS. No overlay/Form `.ant-*` assertion was lowered; the overlay assertions are still present and green because Phase 54 has not removed AntD overlay implementations yet.

## Review Findings — 13/13 Resolved (deep review 2026-11-21)

Cross-reference: `53-REVIEW.md` (`status: clean`, 10 vòng đầu + 3 re-review iteration 1) và `53-REVIEW-FIX.md` (`status: complete`, 3/3 fixed).

| Finding | Severity | Fix owner | Evidence hiện tại |
|---|---|---|---|
| CR-01 | critical | token CSS wiring | `src/main.tsx:6-7` import `openidea/tokens.css` + `global.css` trước mọi style khác; `applyCssVariables()` đặt `data-theme` lên `document.documentElement` (`src/styles/tokens.ts:374`); `tokens.test.ts:135` guard import + `var(--x)`; Chrome computed style đúng 2 theme |
| CR-02 | critical | Radio event payload | `RadioGroupContext.onSelect` nhận `ChangeEvent<HTMLInputElement>` (`radio.tsx:30`); `Radio.handleChange`/`RadioButton` forward cùng native event instance; `handleSelect` giữ `stopPropagation`/`preventDefault`/`nativeEvent`, normalize `target` (`:104-114`); test `formControls.test.tsx:26-45` assert `target.value === 'b'` + method callable |
| WR-01 | warning | RadioGroup state | uncontrolled `setInnerValue`, `useId()` name riêng, xử lý `options`; test group isolation pass (`formControls.test.tsx:54`) |
| WR-02 | warning | Switch content/uncontrolled | `checkedChildren`/`unCheckedChildren` render knob label; không leak DOM attr; `defaultChecked` toggle đúng |
| WR-03 | warning | Checkbox payload | forward native change event (methods nguyên); Group onChange nhận mảng value; indeterminate `checked=true` + `aria-checked="mixed"` + submit value có trong FormData (`formControls.test.tsx:225-249`) |
| WR-04 | warning | Select option payload | option có `value`/`label`; `onSelect` normalize; `tagRender.onClose` remove đúng tag; `valueKey` xử lý option object (`formControls.test.tsx:160-223`) |
| WR-05 | warning | Popup focus | `onCloseRef` effect ổn định; search focus giữ qua rerender/clear; Escape scope popup trên cùng; focus anchor trên Escape/outside-click; cleanup không focus anchor (`formControls.test.tsx:120-158`) |
| INFO-01 | info | import graph | graph sạch, guard counts đúng, `npm run lint` exit 0 (app-wide `eslint src`) |
| INFO-02 | info | token palette | 5 palette value theo §5; scope `--danger: var(--danger-control)` chỉ control thật; token test khóa giá trị; Chrome xác nhận primary `rgb(56,113,225)`, border light `rgb(209,211,217)` / dark `rgb(64,67,74)`, dark input `rgb(25,26,28)` |
| INFO-03 | info | Badge dot | `controls.test.tsx` assert `badgeDot` không null; test dùng `<Badge dot />` |
| RR-01 | warning | Select lead reset | `selectedValueKey` primitive + `useMemo` (`select.tsx:90-97`); effect reset lead không chạy lại khi `setLead` rerender; test `formControls.test.tsx:183-206` ArrowDown × 2 → `data-lead = Alpha two`, Enter → `onChange('a2')` |
| RR-02 | warning | Radio method payload | giữ event instance, `Object.defineProperty(event,'target',…)` normalize AntD shape; test assert methods callable + `nativeEvent` tồn tại |
| RR-03 | warning | Standalone RadioButton `defaultChecked` | ternary như `Radio` (`radio.tsx:159-161`), thay `?? ownChecked` không bao giờ chạy; test `formControls.test.tsx:47-52` assert `input.checked === true` + `data-state="checked"` |

**Verification 2026-11-22:** 13/13 findings có fix commit trong git history (`082cd006`, `e4809d2a`, `f972380d`, `26a05858`, `458e1f71`, `a7aaaeef`, `d9bbef38`, `72794011`, `03c8fe04`, `64089491`, `a08ca6e6`); source hiện tại giữ nguyên mọi fix; scoped 11-file / 77-test chạy xanh, `tsc`/`lint`/`build` exit 0. INFO-04 (unused `eslint-disable` directive trong `select.tsx`) đã được dọn bởi `a08ca6e6`; `npm run lint` exit 0 không còn warning.

## Plan Index

**Command:** `node $HOME/.claude/gsd-core/bin/gsd-tools.cjs phase-plan-index 53`

**Actual (abridged to load-bearing fields; full run exit 0, stderr empty):**

```json
{
  "phase": "53",
  "plans": [
    { "id": "53-01", "wave": 1, "depends_on": [], "task_count": 3, "has_summary": true },
    { "id": "53-02", "wave": 2, "depends_on": ["53-01"], "task_count": 4, "has_summary": true },
    { "id": "53-03", "wave": 3, "depends_on": ["53-01", "53-02"], "task_count": 4, "has_summary": true },
    { "id": "53-04", "wave": 4, "depends_on": ["53-03"], "task_count": 3, "has_summary": true },
    { "id": "53-05", "wave": 5, "depends_on": ["53-04"], "task_count": 2, "has_summary": false }
  ],
  "waves": { "1": ["53-01"], "2": ["53-02"], "3": ["53-03"], "4": ["53-04"], "5": ["53-05"] },
  "has_checkpoints": false
}
```

**Status:** PASS — 5 plans, waves 1-5, all `depends_on` in `[53-0N]` form, no warning.

## Debt Transferred to Later Phases

| Debt | Evidence | Owner phase | Rule |
|---|---|---|---|
| Overlay/Form AntD assertions (`controls.test.tsx`: `.ant-modal`, `.ant-drawer-*`, `.ant-app`, `ant-form-*`, `ant-btn-dangerous`) | 19 runtime AntD UI wrappers remain; assertions intentionally untouched | Phase 54 (NAT-02) | Do not lower assertions to make core gates green |
| Type-only `antd` imports in core wrappers (`import type`/`export type`) | 46 `import type`/`export type` lines referencing `antd` across UI wrappers; explicitly allowed by Phase 53 contract | Phase 56 (CLEAN-01/02) | Remove with ESLint override and dependency |
| 8 deep icon imports in `RemoteGitExplorer.tsx` lines 4-11 (`FolderOutlined`, `FolderOpenOutlined`, `FileTextOutlined`, `ReloadOutlined`, `SearchOutlined`, `BranchesOutlined`, `CloudServerOutlined`, `FolderViewOutlined`) | `grep -c '@ant-design/icons/'` = 8 | Phase 55/56 | Caller untouched in Phase 53 |
| 19 non-core UI wrappers with runtime AntD import | counted by statement scan over `src/components/ui/*.tsx` | Phase 54/56 | NAT-01 covers the 26 core/form wrappers only |
| PWA / GitHub Pages validation | Project constraint: Tauri is the only supported runtime | Out of scope | Do not add or validate |

## Sign-off

Core defect count: **0** (26 native wrappers, 257 exports, 141 icons, caller API unchanged, 13/13 review findings resolved). Scoped gates green. NAT-01 is closed and verified.

`gsd-tools requirements mark-complete NAT-01` returned `already_complete: ["NAT-01"]` — the status was set prematurely in 53-01; this gate is the first evidence-backed close. No status was reverted or re-written manually.

### Task 2 metadata sign-off

```text
$ gsd-tools requirements mark-complete NAT-01
{"updated":false,"marked_complete":[],"already_complete":["NAT-01"],"not_found":[],"total":1}

$ gsd-tools roadmap update-plan-progress 53
{"updated":true,"phase":"53","plan_count":5,"summary_count":5,"status":"Complete","complete":true}

$ gsd-tools state complete-phase --phase 53
{"updated":["Status","Last Activity","Current Position"],"phase":"53"}

$ gsd-tools state record-session --stopped-at 'Completed 53-05-PLAN.md' --resume-file None
{"recorded":true,"updated":["Last session","Stopped At","Resume File"]}

$ gsd-tools state advance-plan
{"advanced":false,"reason":"last_plan","current_plan":5,"total_plans":5,"status":"ready_for_verification"}

$ gsd-tools state update-progress
{"updated":true,"percent":100,"completed":10,"total":10,"bar":"[██████████] 100%"}

$ gsd-tools state record-metric --phase 53 --plan 05 --duration '~6m' --tasks 2 --files 5
{"recorded":true,"phase":"53","plan":"05","duration":"~6m"}
```

Post-update acceptance: `| NAT-01 | 53 | Complete |` present; ROADMAP row `| 53. Native Core & Form Controls | 5/5 | Complete | 2026-11-21 |`; `STATE` stopped_at `Completed 53-05-PLAN.md`; `phase-plan-index 53` has `has_checkpoints: false`; `npx tsc --noEmit` and `npm run lint` exit 0; no full Vitest run.

Known tool side effect repaired: `roadmap update-plan-progress` rewrote Phase 35's `**Plans:** 4/5 plans executed` to `5/5 plans complete`; restored the original line via Edit as instructed by the plan.
