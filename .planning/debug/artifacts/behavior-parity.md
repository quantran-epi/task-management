# Behavior + geometry parity evidence — native-controls-fake-render

Session: `.planning/debug/native-controls-fake-render.md`
Date: 2026-11-22
Method: scoped Vitest (`fakeRenderRegression.test.tsx`, 11 tests) + Playwright Chrome
(`e2e/native-controls-parity.spec.ts`, light + dark). Full Vitest suite NOT run.

## Geometry parity (computed style, Chrome, light + dark)

| Element | Metric | Baseline (OpenIDEA/IntelliJ) | Measured light | Measured dark | Verdict |
|---|---|---|---|---|---|
| default icon | width/height | 16×16 | 15.92×15.92 (subpixel) | 15.92×15.92 | PASS |
| default icon | font-size | 16px | 16px | 16px | PASS |
| small icon (`size=14`) | width/height | 14×14 | 14×14 (jsdom attr) | 14×14 | PASS |
| DatePicker trigger | height | 28px | 28px | 28px | PASS |
| DatePicker trigger | font-size | 13px | 13px | 13px | PASS |
| DatePicker trigger | radius | 4px | 4px | 4px | PASS |
| calendar cell | height | 24px | 24px | 24px | PASS |
| calendar grid | columns | 7 | 7 | 7 | PASS |
| calendar header | weekday count | 7 | 7 | 7 | PASS |

Baseline source: `.planning/phases/52-openidea-mapping-design-contract/52-UI-SPEC.md`
N-08 (cell 24, grid 7, popup offset 4, trigger 28/4/13), N-13 (icon 16 default);
OpenIDEA `SvgIcon({size=16})` always sets width/height; 14px satellite icons
(`diffControls.ts`, `mergeGutters.ts`). Fix: `wrapIcon` no longer leaves SVG
width/height unset (was falling back to browser default 300×150).

## Behavior parity (light + dark — behavior is mode-independent; exercised in both)

| Control | Behavior | Before (fake) | After (real) | Evidence |
|---|---|---|---|---|
| DatePicker | popup anatomy | vertical number list (`list-row`, translateY) | month/year header + 7-col grid + footer | Chrome screenshot + jsdom |
| DatePicker | prev/next month | static buttons | header month changes both ways | regression test + Chrome |
| DatePicker | keyboard | ArrowDown opens only | ArrowLeft/Right/Up/Down move lead, synchronous focus; Enter commits | regression test |
| DatePicker | disabledDate | aria-disabled on fake rows | real cell `disabled`, unselectable | overlayPopups test |
| DatePicker | clear | none | Xóa emits null / '' | regression test |
| DateRangePicker | range tint + payload | fake rows | in-range cells tinted, Dayjs tuple emitted | overlayPopups test |
| icon | default size | 300×150 SVG fallback | 16×16 always | regression + Chrome computed |
| List.Item | extra/actions | dropped | rendered | regression test |
| List | pagination | dropped | prev/next + showTotal + onChange | code audit |
| Table | onChange filters | hard-coded `{}` | keyed filterState payload | code audit |
| Table | filter UI | always Tất cả | reflects state, clearable | code audit |
| Table | sticky header | none | sticky when scroll.y | code audit |
| Grid.Col | responsive xs/span/offset | leaked as DOM attrs | mapped to gridColumn/order | regression test |
| Typography.Title | level | always h1 | h1..h6 | regression test |
| Typography Text | strong/code/copyable/ellipsis/type | dropped | rendered | regression test |
| Tree | DirectoryTree | returned null | renders Tree | regression test |
| TreeSelect | TreeSelectNode children | returned null / ignored | converted to treeData | regression test |
| TimePicker | ArrowUp/Down + Enter | no column keyboard | lead + scroll + pick | code audit |
| TimeRangePicker | column lead | no-op `onLead` | real lead state | code audit |
| Image | arrow keys | double handler (document + dialog) | single owner; step once | code audit |
| Image | zoom/rotate | none | buttons + +/-/r keys + reset | code audit |
| Form | preserve/disabled | voided | honored, propagated to fields | code audit |
| Form | methods | scrollToField/focusField no-op | wired to field instances | code audit |
| Form | rule.type | ignored | email/url/number/integer validated | code audit |
| Slider | onAfterChange | stale render value | freshly committed value | regression test |
| Slider | defaultValue | ignored (started at min) | honored | regression test |

## Full-wrapper audit (56 wrappers)

Scanned all `src/components/ui/*.tsx` for: `void` drops, `return null`, no-op
handlers, hard-coded payloads. Static descriptor components (`TreeNode`,
`TabPane`, `SplitterPanel`, `AutoCompleteOption`, `MentionsOption`,
`TreeSelectNode`) legitimately render null because their props are consumed by
the owner; TreeSelectNode was the one case whose owner ignored children — fixed.
No other fake/drop-prop cases found in this scope.

## Gaps / blockers

- MCP Chrome tool is not exposed in this environment; verification used
  Playwright's installed Chrome channel instead (real browser, same assertions).
- `gsd-code-review` / `gsd-verifier` CLI commands are not on PATH; deep review
  and verifier could not be invoked from this session. Must be run by the
  orchestrator once those commands are available.
- No remote push performed: this environment has an `origin` but the session
  directive requires reviewer/verifier sign-off before pushing.
