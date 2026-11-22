---
phase: 54-native-overlay-complex-controls
verified: 2026-11-22T06:30:21Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed:
    - "CR-01 Col gridColumn 0 / span N invalid — fixed at grid.tsx (1-based lines)"
    - "CR-02 DateRangePicker lost first end under gated caller — draft pair in date-picker.tsx"
    - "WR-01 Table filter stale-closure accumulation — setFilterValue in table.tsx"
    - "WR-02 TimePicker reopen after pick — suppressOpen guard in time-picker.tsx"
    - "WR-03 Slider uncontrolled handle not updating — useReducer forceRender in slider.tsx"
    - "WR-04 range test certified shape not behavior — two-step gated-caller test"
    - "IN-01 global DOM ids in TimeColumn — useId() prefix"
    - "IN-02 WEEKDAYS/YEARS frozen at import — useMemo per render"
    - "R2 CR-01 TimeRangePicker popup reopen on Escape/outside — guard mirrored"
    - "R2 WR-01 DateRangePicker month not synced to external value"
    - "R2 WR-02 onChange currentDataSource stale snapshot — computeData helper"
    - "R2 WR-03 TimeRangePicker loses first end — drafts in commitIndex"
    - "R3 WR-01 month snap-back on parent rerender — lastValueKey string ref"
    - "R3 WR-02 double-reverse of 3-arg sorters — compare.length check"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Trong Chrome light + dark, mở từng control overlay/complex (DatePicker/RangePicker, TimePicker/RangePicker, Table sort/filter, Grid.Col responsive, Select, Menu, Dialog) và so sánh trực tiếp shape/size/hành vi với tham chiếu OpenIDEA/IntelliJ."
    expected: "Calendar lịch thật 7 cột + header tháng/năm, 28px/13px/4px trigger, icon 16x16, cell 24px; mọi state (default/hover/focus-visible/disabled/invalid/loading/selected/expanded/empty); popup flip/shift + outside/Escape + focus restore; dialog Tab trap/Escape/restore."
    why_human: "Playwright e2e xác nhận hook/geometry/console-sạch, nhưng so sánh thị giác người-máy shape/size đúng chuẩn IntelliJ từng màn hình là thẩm định trực quan không tự động hoá được. Đây là phạm vi VIS-01..04 Phase 57, phase sau."
  - test: "Chạy app Tauri thật, thao tác range picker với caller gated (TaskFilterBar, FeasibilityModal) và TimeRangePicker (WorkSessionDetailModal, ManualWorkSessionModal); navigate tháng rồi gây parent re-render."
    expected: "Range 2 bước hình thành đủ hai đầu; month không snap-back khi rebuild dayjs object; popup TimeRangePicker đóng hẳn bằng Escape/outside dù TimeColumn đang focus."
    why_human: "jsdom + Playwright đã phủ luồng này (test behavioral + e2e), nhưng xác nhận cuối trên runtime Tauri primary với dữ liệu thật cần người chạy app."
---

# Phase 54: Native Overlay & Complex Controls — Verification Report (re-verification)

**Phase Goal:** Nhóm control overlay/phức tạp được thay bằng control tự build với mọi trạng thái và behavior đặc trưng giữ nguyên.
**Verified:** 2026-11-22T06:30:21Z
**Status:** human_needed (mọi truth tự động VERIFIED; human visual/parity items tồn tại → không được phép `passed`)
**Re-verification:** Yes — stale pass at 10:09 (pre-R1/R2/R3), overwritten after fake-control remediation + 3 review rounds.
**Context mở rộng:** NAT-02 + yêu cầu mới của sếp: control phải khớp OpenIDEA/IntelliJ về shape, size, behavior — icon 16px, DatePicker calendar thật.

## Gate Evidence (final tree, thực thi lại bởi verifier)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npm run lint` | PASS (exit 0) |
| Scoped Vitest (7 files) | `npx vitest run ... --bail=1` | PASS (7 files / 97 tests, 8.52s) |
| Chrome e2e (2 specs) | `npx playwright test e2e/phase54-overlay.spec.ts e2e/native-controls-parity.spec.ts --project=chromium --reporter=list` | PASS (5 tests, light + dark, zero console.error/pageerror) |
| Native import gate | `node scripts/check-native-imports.mjs $(...54-PATTERNS.md)` | PASS (exit 0) |
| Icon count | `grep -c '^export const .* = wrapIcon('` | 141 |
| Wrapper files | `find src/components/ui -maxdepth 1 -name '*.tsx'` | 56 |

Chạy lại toàn bộ trên tree cuối (sau commit `a2e41a8e`/`dfce88db`). E2E specs timestamped 11:27/12:16 — **trước** final R2/R3 fixes (13:24) — nên được chạy lại thay vì tin vào kết quả cũ. Kết quả: 5/5 pass, có nghĩa final fixes không gây regression. Không chạy full Vitest suite (theo rule dự án). Không PWA/GitHub Pages (Tauri là runtime duy nhất).

## Goal Achievement — Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Mọi state control render đúng, observable qua computed style/test | VERIFIED | `data-state`/`data-oi-control` hooks trên table(list 77,290,303), select(259,286), menu(164,208), tree(98,252), checkbox(109), splitter(178); `:focus-visible` CSS trong `openidea/{Button,Calendar,Select,Popup,Splitter,global}.module.css`; Test + e2e xanh. |
| 2 | Popup flip/shift, outside/Escape đóng, focus restore anchor | VERIFIED | `native/popup.tsx:47-50` dùng `flip()` + `shift({padding: EDGE_PADDING})`, offset 4, BODY portal `data-positioned`; outside/Escape/topmost-ownership tests trong `overlayPopups.test.tsx`; e2e `assertClean` + Escape/focus checks both themes. |
| 3 | Dialog focus trap + Escape + focus restore trigger | VERIFIED | `native/dialog.tsx:114-166` — Tab trap trên FOCUSABLE, first/last wrap, click/focus guard, stacked-dialog topmost ownership, render-time trigger capture; e2e section (d). |
| 4 | Event/copy/keyboard/focus parity (Table/Form/DatePicker/Menu/Tooltip/AI Office) | VERIFIED | 97 scoped tests + 5 e2e pass; native selectors trong caller tests; `form.tsx:405-415` scrollToField/focusField wired; Vietnamese validation copy giữ nguyên. |
| 5 | Zero console error trên Chrome dev build | VERIFIED | e2e capture `type()==='error'` + `pageerror`, `assertClean` 0 errors cả 5 tests. Chỉ còn `console.warn` từ react-resizable-panels + PostCSS (không phải error, nằm ngoài gate). |
| 6 | DatePicker là calendar thật, không phải dropdown số | VERIFIED | `date-picker.tsx:71-212` Calendar: `data-oi-control="calendar"`, 7 weekday, `date-grid` role=grid, 35+ cells 7-col, month/year nav, disabledDate, clear, keyboard; regression test xác nhận anatomy và two-step gated range; screenshot light/dark trong `.planning/debug/artifacts/`. |
| 7 | Icon default 16px, không rơi về 300×150 fallback | VERIFIED | `icon.tsx:195-196,214-215` — `px` từ `metrics.iconSize` (spacing.md=16) và luôn set `width={dimension} height={dimension}`; e2e computed `15.92×15.92` subpixel, fontSize 16px; `metrics-{light,dark}.json`. |
| 8 | Không còn fake wrapper/drop-prop/no-op handler từ audit list | VERIFIED | Rà soát toàn bộ 56 wrappers: List extra/actions/pagination (list.tsx:24-27,109-117), Table onChange keyed filterState + computeData (table.tsx:66-105,196-203), Grid responsive → gridColumn (grid.tsx:89-96), Typography level/h1..h6 + strong/code/copyable (typography.tsx:68-110), Tree DirectoryTree (tree.tsx:78-79,312), TreeSelectNode children→treeData (tree-select.tsx:33-47,78), TimePicker ArrowUp/Down + unique ids + suppressOpen (time-picker.tsx:162,200,230,273), Image zoom/rotate/single-key-handler (image.tsx:68-83,127-130), Form preserve/disabled/methods/rule.type (form.tsx:279-280,308-320,405-415), Slider onAfterChange/defaultValue (slider.tsx:38-82). `return null` còn lại chỉ ở static descriptor components (TreeNode, TabPane, SplitterPanel, AutoCompleteOption, MentionsOption, TreeSelectNode) — props được owner đọc. Không có `TBD/FIXME/XXX` trong 12 source files đã đổi. |

**Score:** 8/8 truths verified.

## Artifact & Key-Link Verification (re-verification focus)

Re-verification mode: failed items từ 3 review rounds được full-check (exists/substantive/wired + behavior). Items đã pass ở stale verification được regression-check; TSC/lint/e2e chạy lại toàn phần nên mọi regression đều lộ.

| Artifact / Fix | Exists | Substantive | Wired | Behavioral proof | Status |
|---|---|---|---|---|---|
| `grid.tsx` Col 1-based gridColumn | yes | yes | style prop | fakeRenderRegression: offset=2 → `3 / span 12`, bare → `span 8` | VERIFIED |
| `date-picker.tsx` draft/lastValueKey/month sync | yes | yes | Calendar consumes draft | overlayPopups: two-step gated, month sync, snap-back test | VERIFIED |
| `table.tsx` computeData + setFilterValue + 3-arg sorter | yes | yes | emitChange calls computeData | overlayComposite: post-change currentDataSource, deadline sorter | VERIFIED |
| `time-picker.tsx` suppressOpen + drafts + useId | yes | yes | Popup onClose / commitIndex | timePicker: Escape/outside with focused column, gated caller, 288 unique ids | VERIFIED |
| `slider.tsx` useReducer forceRender | yes | yes | commit() calls forceRender | fakeRenderRegression: aria-valuenow=11, left contains 11% | VERIFIED |
| `icon.tsx` always-set dimension | yes | yes | SVG width/height attrs | e2e computed 16px both themes | VERIFIED |

Key links: `wrapIcon → metrics.iconSize → SVG width/height` WIRED; `DateRangePicker.draft → Calendar.value/range → commit → onChange` WIRED; `Table.setFilterValue → emitChange(computeData) → onChange.currentDataSource` WIRED; `TimeRangePicker.Popup.onClose → suppressOpen → input.onFocus` WIRED; `Slider.commit → forceRender → aria-valuenow` WIRED. Không có link nào orphaned hay partial.

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real data | Status |
|---|---|---|---|---|
| DatePicker Calendar | `cells` (useMemo) | `month`/`YEARS` từ render hiện tại | 35+ day cells, disabledDate thực | FLOWING |
| DateRangePicker | `draft` | prop `value` sync + local commit | gated caller vẫn giữ first end | FLOWING |
| Table | `computeData(rows, columns, nextSort, nextFilters)` | props rows/columns + state snapshot | post-change filtered/sorted data | FLOWING |
| TimeRangePicker | `drafts` | prop + pick() local write | payload đúng 2 đầu dù caller gate | FLOWING |
| Icon | `dimension` | `metrics.iconSize` token + caller size | 16px default, 14 small | FLOWING |

## Requirements Coverage

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| NAT-02 (all wrapper states/behavior) | REQ line 23 | SATISFIED | 8 truths VERIFIED; 5/5 ROADMAP SC; 28/28 overlay wrappers native; 141 icons/56 files. |

Không có orphaned requirement: REQUIREMENTS.md chỉ map NAT-02 → Phase 54, và mọi plan 54-01..54-07 đều khai báo `requirements: [NAT-02]`.

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|---|---|---|---|
| `e2e/*` + `openidea/*.css` | `console.warn` (react-resizable-panels "Missing resize handle", PostCSS `from`) | INFO | Nằm ngoài NAT-02 console-error gate; không suppress, tracked Phase 55/57. |

Không có blocker debt marker (`TBD`/`FIXME`/`XXX`) trong source files đã đổi ở R1/R2/R3. Các `void`/`return null` còn lại là intentional (type-only props, static descriptor children) — Chesterton's fence: giữ nguyên.

## Deferred Items (Step 9b — later phases, không tính gap)

| Item | Addressed In | Evidence |
|---|---|---|
| Full visual sweep mọi màn hình light/dark, seed dummy data, screenshot, computed style parity | Phase 57 (VIS-01..04) | ROADMAP goal: "tương tác thật, đo computed style, screenshot, log pass/fail" |
| AntD dependency/guard removal, deep icon imports adoption | Phase 55/56 (CLEAN-01/02) | stale verification "Debt Transferred" + ROADMAP Phase 56 |
| react-resizable-panels resize-handle warn | Phase 55/57 | console.warn, không phải error |

## Human Verification Required

1. **Visual/behavior parity so với OpenIDEA/IntelliJ** — chạy Tauri Chrome light + dark, so sánh trực tiếp shape/size/hành vi từng control. Expected: calendar thật, icon 16px, trigger 28/13/4, cell 24px, mọi state đúng. Why human: thẩm định thị giác người-máy không tự động hoá; đây là VIS-01..04 Phase 57.
2. **Range/TimePicker luồng caller thật trên runtime Tauri** — thao tác gated caller + navigate tháng + parent re-render. Expected: range đủ 2 đầu, month không snap-back, popup đóng hẳn. Why human: e2e/jsdom đã phủ nhưng xác nhận cuối trên runtime primary với data thật cần người chạy app.

## Gaps Summary

Không có gap kỹ thuật còn lại. Mọi critical/warning/info từ 3 review rounds (CR-01/02, WR-01..04, IN-01/02 ở R1; CR-01, WR-01..03 ở R2; WR-01/02 ở R3) đều có fix commit trên tree và được xác nhận bằng code + scoped test + e2e chạy lại. Status `human_needed` do Step 8 bắt buộc: tồn tại human visual/parity items → không được phép `passed` dù 8/8 truth VERIFIED. Các item thị giác này đã được ROADMAP xếp vào Phase 57 (VIS-01..04), nên không phải gap chặn phase hiện tại — nhưng theo rule status seam, vẫn phải human_needed cho đến khi có xác nhận.

---

_Verified: 2026-11-22T06:30:21Z_
_Verifier: Claude (gsd-verifier)_
