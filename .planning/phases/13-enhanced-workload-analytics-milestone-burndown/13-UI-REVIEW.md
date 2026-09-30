# Phase 13 — UI Review

**Audited:** 2026-09-30
**Baseline:** UI-SPEC.md
**Screenshots:** not captured (no dev server)
**Interaction captures:** off

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All empty states, CTA labels, and metric units match UI-SPEC contract exactly |
| 2. Visuals | 4/4 | Clear 3-tier visual hierarchy; high contrast SVG burndown chart anchors view |
| 3. Color | 3/4 | Token alignment good; hardcoded inline hex values used instead of Antd theme tokens |
| 4. Typography | 3/4 | Font sizes 8px/10px used in SVG and 11px in tooltips exceed 4-scale declared scale |
| 5. Spacing | 4/4 | Card gap 24px, table padding, and layout scale match declared multiples of 4 |
| 6. Experience Design | 3/4 | Reactive live queries, zero-task empty states work; initial Dexie load lacks Spin/skeleton |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **Pillar 6 (Experience Design): Add loading state during Dexie initial hydration**
   - *Impact:* While `useLiveQuery` resolves IndexedDB data, defaults initialize to empty arrays `[]`, causing empty states ("Chưa có dữ liệu...") to briefly flash before data renders.
   - *Fix:* Check `projects === undefined || milestones === undefined || tasks === undefined` before fallback, rendering an Antd `<Spin />` container or skeleton card per UI-SPEC E1/E2/E3 loading considerations.
2. **Pillar 3 (Color): Replace inline hardcoded hex colors with Ant Design theme tokens**
   - *Impact:* Dark mode compatibility compromised; colors like `#ffffff`, `#fafafa`, `#262626`, `#595959` in `AnalyticsView.tsx` and `BurndownSvgChart.tsx` will not adapt if dark theme is toggled.
   - *Fix:* Import `theme` from `antd`, call `const { token } = theme.useToken();`, and replace `#fafafa` with `token.colorFillAlter`, `#8c8c8c` with `token.colorTextSecondary`, `#262626` with `token.colorText`.
3. **Pillar 4 (Typography): Consolidate micro-typography sizes**
   - *Impact:* Fonts at 8px (`VelocityTrendChart.tsx:100`), 10px (`BurndownSvgChart.tsx:206`), and 11px (`BurndownSvgChart.tsx:357`) deviate from the declared 4-role typography scale (12px, 14px, 16px, 20px) and risk legibility issues on high-DPI displays.
   - *Fix:* Standardize SVG tick labels and tooltip captions to 12px or use CSS transforms/scaling.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- Empty states match UI-SPEC specification: "Chưa có dữ liệu Milestone", "Chưa có dữ liệu vận tốc", "Chưa có dữ liệu phân bổ tải".
- CTAs are specific and actionable: "Tạo Milestone", "Tạo tác vụ".
- Vietnamese terminology is consistent: "Tác vụ", "Vận tốc", "Phân bổ tải", "Giờ ước lượng", "Số tác vụ".

### Pillar 2: Visuals (4/4)
- 3-tier vertical section hierarchy cleanly laid out with Ant Design Cards and 24px vertical margins.
- BurndownSvgChart uses crisp vector geometry, crosshair tracking, and responsive viewBox.

### Pillar 3: Color (3/4)
- Standard status palette aligned with Ant Design and project theme tokens.
- Hardcoded hex codes (`#ffffff`, `#fafafa`, `#1677ff`) used in SVG charts instead of dynamic tokens.

### Pillar 4: Typography (3/4)
- Clean typography hierarchy across headings and tabular data.
- Sub-12px micro-fonts used for SVG axis labels and tooltips.

### Pillar 5: Spacing (4/4)
- Card paddings and element gaps consistently follow 4px/8px/16px/24px scale.

### Pillar 6: Experience Design (3/4)
- Zero-dependency client-side reactivity via Dexie hooks.
- Initial load lacks skeleton/spinner fallback.

---

## Files Audited
- `src/views/AnalyticsView.tsx`
- `src/components/analytics/BurndownSvgChart.tsx`
- `src/components/analytics/StackedStatusBar.tsx`
- `src/components/analytics/VelocityTrendChart.tsx`
- `src/components/analytics/WorkloadProportionBar.tsx`
- `src/App.tsx`
- `src/components/shell/Navigation.tsx`
- `src/components/projects/ProjectTable.tsx`
- `src/types/analytics.ts`
- `src/utils/analytics.ts`
