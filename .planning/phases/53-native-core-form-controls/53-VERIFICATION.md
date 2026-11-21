# Phase 53 Verification — NAT-01 Consolidation Gate

**Date:** 2026-11-21
**Plan:** 53-05 (final consolidation gate)
**Scope:** 26 core/form wrappers, 257-export guard, 141 icons, caller API stability, scoped gates.
**Rule honored:** no `npm test`, no full Vitest suite. Every command below ran on the real tree; stdout captured verbatim.

## Gate Result Summary

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0, 0 bytes stdout/stderr) |
| Lint | `npm run lint` | PASS (exit 0, `eslint src`) |
| Scoped Vitest (10 files, `--bail=1`) | command below | PASS (10 files / 62 tests) |
| 26-wrapper runtime-import gate | Node script, 7 selftests | PASS (0 offenders, 7/7 selftests correct) |
| Export guard | `scanWrappers()`/`findMissingWrappers()` | PASS (257 / `[]`) |
| Icon count | `grep -c '^export const .* = wrapIcon('` | PASS (141) |
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

**Status:** PASS. 26/26 native, 0 runtime AntD/icon imports.

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

**Status:** PASS. Typecheck across all callers clean; wrapper guard unchanged; no caller file was edited by Phase 53.

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
  --bail=1
```

**Actual stdout (final rerun):**

```text
 RUN  v5.0.2 /Users/tranducquan/Working/Personal/task-management

Not implemented: Window's getComputedStyle() method: with pseudo-elements
  ... (7 duplicate lines)
 Test Files  10 passed (10)
      Tests  62 passed (62)
   Start at  03:23:09
   Duration  7.56s (environment 41%, import 26%, tests 20%, setup 8%, transform 5%)

Environment  jsdom was created 10 times · 3.01s total, 41% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments
```

Plus `npx tsc --noEmit` (exit 0) and `npm run lint` (exit 0) above.

**Status:** PASS. No overlay/Form `.ant-*` assertion was lowered; the overlay assertions are still present and green because Phase 54 has not removed AntD overlay implementations yet.

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

Core defect count: **0** (26 native wrappers, 257 exports, 141 icons, caller API unchanged). Scoped gates green. NAT-01 is eligible to close here.

`gsd-tools requirements mark-complete NAT-01` returned `already_complete: ["NAT-01"]` — the status was set prematurely in 53-01; this gate is the first evidence-backed close. No status was reverted or re-written manually.
