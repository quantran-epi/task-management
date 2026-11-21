---
phase: 49-design-system-foundation
verified: 2026-11-21T10:24:55Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 49: Design System Foundation Verification Report

**Phase Goal:** Nền design system duy nhất, IntelliJ-only, với token dùng chung cho ConfigProvider và CSS ở cả light/dark và mọi control AntD có wrapper TaskMate làm điểm cấu hình duy nhất, được bảo vệ bởi ESLint + local checks.
**Verified:** 2026-11-21T10:24:55Z
**Status:** passed
**Re-verification:** No — initial verification

Ghi chú phạm vi: đây là phase nền tảng. App-wide migration và Chrome UAT light/dark là Phase 50 (ROADMAP). Import AntD trực tiếp còn lại trong ~248 file app nằm ngoài scope GUARD-01 và có chủ đích bị đẩy sang `lint:adoption` (EXPECTED RED) cho đến Phase 50 — không tính là lỗi phase này.

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1 | (SHELL-01..03, SC1) App boots only IntelliJ/workbench shell; no shell flag, legacy `App`, PWA install/manifest/service-worker residue, or legacy-shell migration; boot side effects + four popout routes survive | ✓ VERIFIED | `src/main.tsx` renders `<AppIntelliJ />` unconditional; `src/App.tsx` and 6 legacy PWA sources absent; grep residue hits only test assertions; `src/AppIntelliJ.tsx` owns `coding-zone-popout`, `attachGlobalToolTaskListener`, `useGhostDevNotifications`; `vite.config.ts`/`package.json` free of `vite-plugin-pwa`/workbox; `shellRemoval.test.ts` + `mainBoot.test.ts` green |
| 2 | (TOKEN-01, SC2) One `tokens.ts` source drives both AntD `ConfigProvider` and CSS/workbench vars — no drift | ✓ VERIFIED | `src/styles/tokens.ts` (328 lines) exports `lightTokens`/`darkTokens`/`getAntdTheme`/`applyCssVariables`/`statusColorMap`; `AntdThemeAdapter.tsx:19` uses `getAntdTheme(mode)`; `tokens.test.ts` asserts ConfigProvider palette equals token object and no hex literals in adapter/CSS |
| 3 | (TOKEN-02/03, SC2) Light/dark toggle updates whole app and all popouts instantly without reload, preserving user's current choice | ✓ VERIFIED | `themeBroadcast.ts:38-40` dispatches `THEME_LOCAL_EVENT` on `window` (same-window fan-out, CR-01 fix) + Tauri emitTo 4 popouts + localStorage; `useThemeMode.ts` precedence localStorage > OS > light, invalid stored values ignored; `applyCssVariables` writes vars to both wrapper and `document.documentElement` (CR-02 fix); tests: two-consumer toggle, popout re-render, root portal inheritance — all green |
| 4 | (TOKEN-04, SC5) No hardcoded token values in app components; drift between ConfigProvider and CSS detected by test | ✓ VERIFIED | `tokens.test.ts` "detects palette drift" asserts zero hex in adapter and no duplicate palette hex in `workbench-tokens.css`; `visualTokens` source gate exists; code review CR/WR fixes confirmed via `49-REVERIFY.md` |
| 5 | (CTRL-01/06, SC3) Every used AntD control (~60) has a real one-file wrapper at `src/components/ui/`; no bare re-exports; single swap point | ✓ VERIFIED | 55 wrapper `.tsx` files; live scanner measured 52 consumed components + 141 icons vs 253 wrapped names, `findMissingWrappers` = `[]`; zero `export ... from 'antd'` outside test fixtures; all 55 wrappers reference a `tokens.contract.ts` helper |
| 6 | (CTRL-02/03/04/05, SC3/SC5) Button/Input/Overlay/Status wrappers apply token defaults and policy — icon-button accessible name, modal footer/close/mask, status color map | ✓ VERIFIED | `button.test.tsx` asserts token metrics, `variant` danger, caller-props-win (WR-03), type-level mandatory `aria-label` on IconButton; `controls.test.tsx` asserts modal footer/close/mask policies, `mask={false}` honored (WR-04), and exact `statusColorMap` hex on StatusTag/Badge/StatusDot across light+dark |
| 7 | (GUARD-01, SC4) ESLint blocks every runtime `antd` / `@ant-design/icons` import outside `src/components/ui/`, allowing type imports | ✓ VERIFIED | `eslint.config.mjs` `no-restricted-imports` with `allowTypeImports: true`, zero exceptions outside later ui/ override; `guardConfig.test.ts` runs `npx eslint tests/fixtures/guard/bad-import.tsx` and asserts non-zero exit for the correct rule reason; `npm run lint` exit 0 |
| 8 | (GUARD-02, SC4) `npm run lint` + `npm run build` + focused tests run locally after changes; violations fail lint; no new lint/test GitHub Actions CI | ✓ VERIFIED | scripts present: `lint`, `lint:adoption`, `test:foundation`; all three gates executed locally green (below); no new lint/test/design/guard workflow; only pre-existing `desktop-build.yml` (2026-10-22) and `knowledge-server-docker.yml` |
| 9 | (GUARD-03, SC5) Focused Vitest green for token parity light/dark, accessible name, modal policy, status colors, ConfigProvider/CSS drift | ✓ VERIFIED | `npm run test:foundation`: 11 files, 73 tests passed; covers `tokens.test.ts`, `button.test.tsx`, `controls.test.tsx`, `antdInventory.test.ts`, `coverage.test.ts`, `guardConfig.test.ts`, `uiTokens.test.ts`, `themeBroadcast.test.ts`, `AntdThemeAdapter.test.tsx`, shell tests |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/main.tsx` | Unconditional AppIntelliJ boot | ✓ VERIFIED | `<AppIntelliJ />`; no flag/`./App` import |
| `src/AppIntelliJ.tsx` | Single shell, all boot side effects + popout routes | ✓ VERIFIED | `coding-zone-popout`, listener attach, notifications; 5 `<AntdThemeAdapter>` trees |
| `src/workbench/__tests__/shellRemoval.test.ts` | Source-scan proof, min 40 lines | ✓ VERIFIED | 64 lines, 6 assertions |
| `vite.config.ts` | No VitePWA/manifest/workbox | ✓ VERIFIED | source-scan test green |
| `src/styles/tokens.ts` | Single typed token source, min 120 lines | ✓ VERIFIED | 328 lines, all exports present |
| `src/workbench/AntdThemeAdapter.tsx` | Single ConfigProvider tree via `getAntdTheme` | ✓ VERIFIED | `getAntdTheme(mode)`, root+wrapper var injection |
| `src/hooks/useThemeMode.ts` | Mode hook, exports `useThemeMode` | ✓ VERIFIED | localStorage>OS>light, broadcast + subscribe |
| `src/workbench/themeBroadcast.ts` | emitTo fan-out + browser fallback, min 40 lines | ✓ VERIFIED | 84 lines, local event + validated payload |
| `src/components/ui/__tests__/tokens.test.ts` | Token parity/drift, min 60 lines | ✓ VERIFIED | 86 lines |
| `src/components/ui/tokens.contract.ts` | Shared policy types/defaults, min 50 lines | ✓ VERIFIED | consumed by all 55 wrappers |
| `src/components/ui/button.tsx` | Button/IconButton aria-label, min 60 lines | ✓ VERIFIED | caller-props-win + mandatory aria-label |
| `src/components/ui/icon.tsx` | Wrapped-icon factory + 144 icon exports, min 160 lines | ✓ VERIFIED | 141 consumed icons all wrapped |
| `tests/helpers/antdInventory.ts` | Source scanner + pass-through detector, min 70 lines | ✓ VERIFIED | live scan: 0 missing, 0 pass-through |
| `src/components/ui/index.ts` | Same-name wrapper barrel | ✓ VERIFIED | green coverage test |
| `src/components/ui/input.tsx`, `modal.tsx`, `message.tsx` | Input/overlay wrappers + themed imperative | ✓ VERIFIED | policy tests green |
| `src/components/ui/tag.tsx`, `table.tsx`, `form.tsx`, `menu.tsx`, `typography.tsx`, `grid.tsx`, `card.tsx`, `checkbox.tsx`, `layout.tsx` | Real one-file swap points | ✓ VERIFIED | contract helpers present |
| `eslint.config.mjs` | Flat config + scoped ban + ui override, min 50 lines | ✓ VERIFIED | 62 lines |
| `tests/fixtures/guard/bad-import.tsx` | Negative ESLint fixture | ✓ VERIFIED | lint fails for correct rule reason |
| `src/components/ui/__tests__/coverage.test.ts` | D-04 live-tree gate, min 50 lines | ✓ VERIFIED | 52 lines, 0 missing/0 pass-through |
| `src/components/ui/__tests__/guardConfig.test.ts` | Local script + no-CI assertions, min 40 lines | ✓ VERIFIED | 59 lines |
| `.planning/.../49-VALIDATION.md`, `49-UI-SPEC.md` | Nyquist + UI-SPEC sign-off | ✓ VERIFIED | both frontmatter `status: approved` |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `src/main.tsx` | `src/AppIntelliJ.tsx` | unconditional render | ✓ WIRED | `<AppIntelliJ />` line 22 |
| `src/AppIntelliJ.tsx` | `src/workbench/AntdThemeAdapter.tsx` | single ConfigProvider tree | ✓ WIRED | 5 render sites, lines 87–135 |
| `src/AppIntelliJ.tsx` | `src/views/CodingZonePopoutView.tsx` | hash route | ✓ WIRED | `coding-zone-popout` route line 37/113 |
| `AntdThemeAdapter.tsx` | `tokens.ts` | `getAntdTheme(mode)` | ✓ WIRED | line 19 |
| `tokens.ts` | CSS custom properties | `applyCssVariables` → `setProperty` | ✓ WIRED | root + wrapper, line 322 |
| `useThemeMode.ts` | `themeBroadcast.ts` | `broadcastThemeMode` | ✓ WIRED | line 64 |
| `useThemeMode.ts` | `themeBroadcast.ts` | `subscribeToThemeBroadcast` | ✓ WIRED | line 58 |
| `TitleBar.tsx` | `useThemeMode.ts` | toggle control | ✓ WIRED | `onClick={toggle}`, aria-label line 322 |
| `button.tsx` / `icon.tsx` / `input.tsx` / `modal.tsx` / `tag.tsx` | `tokens.contract.ts` | contract helper calls | ✓ WIRED | present in all wrappers |
| `eslint.config.mjs` | `src/components/ui/**` | later override disables rule | ✓ WIRED | exactly one `'no-restricted-imports': 'off'` |
| `coverage.test.ts` | `antdInventory.ts` | scanner functions | ✓ WIRED | `findMissingWrappers` imported/called |
| `package.json` | `eslint.config.mjs` | lint scripts | ✓ WIRED | lint/lint:adoption/test:foundation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `AntdThemeAdapter.tsx` | `mode` | `useThemeMode()` → localStorage/OS/Tauri broadcast | ✓ real, validated payload enum | ✓ FLOWING |
| ConfigProvider theme | ThemeConfig | `tokens.ts: getAntdTheme(mode)` from typed token objects | ✓ real (parity test) | ✓ FLOWING |
| CSS vars (wrapper + root) | css custom props | `tokens.ts: applyCssVariables(mode)` from `lightTokens.css`/`darkTokens.css` | ✓ real (root portal test) | ✓ FLOWING |
| Status surfaces (Tag/Badge/StatusDot) | status hex | `tokens.ts: statusColorMap[mode][status]` | ✓ real (exact-hex parity test) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| ESLint import guard + hooks rule | `npm run lint` | exit 0 | ✓ PASS |
| Focused foundation tests (token/wrapper/guard/shell) | `npm run test:foundation` | 11 files, 73 tests passed | ✓ PASS |
| TypeScript + Vite build | `npm run build` | exit 0, built in 1.61s | ✓ PASS |
| Wrapper coverage non-vacuous | `tsx` scanner invocation | 52 components + 141 icons, 253 wrappers, 0 missing | ✓ PASS |
| Negative ESLint fixture rejected for rule reason | `guardConfig.test.ts` (`npx eslint bad-import.tsx`) | non-zero exit, rule message present | ✓ PASS |

Full Vitest suite not run (project memory: >1h); scoped paths used only.

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No probes declared in PLAN/SUMMARY; no `scripts/*/tests/probe-*.sh` found | N/A |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SHELL-01 | 49-01, 49-09 | Single IntelliJ shell boots | ✓ SATISFIED | main.tsx + shell tests |
| SHELL-02 | 49-01, 49-09 | Legacy shell/flag/PWA code removed | ✓ SATISFIED | file absence + source scan |
| SHELL-03 | 49-01, 49-09 | No legacy-shell migration | ✓ SATISFIED | no settings migration for shell config |
| TOKEN-01 | 49-02, 49-09 | Single token source for ConfigProvider + CSS | ✓ SATISFIED | tokens.ts + parity test |
| TOKEN-02 | 49-02, 49-09 | Full light/dark, instant update | ✓ SATISFIED | broadcast + adapter tests |
| TOKEN-03 | 49-02, 49-09 | Preserve current theme choice | ✓ SATISFIED | useThemeMode precedence test |
| TOKEN-04 | 49-02, 49-09 | No hardcoded token values; drift test | ✓ SATISFIED | drift test green |
| CTRL-01 | 49-03/05/06/07/08, 49-09 | All consumed AntD controls wrapped | ✓ SATISFIED | 0 missing in live scanner |
| CTRL-02 | 49-03, 49-09 | Button/IconButton policy + accessible name | ✓ SATISFIED | button.test.tsx |
| CTRL-03 | 49-04, 49-09 | Input/Select/Textarea/InputNumber policy | ✓ SATISFIED | controls.test.tsx |
| CTRL-04 | 49-04, 49-09 | Modal/Drawer/Popconfirm policy | ✓ SATISFIED | controls.test.tsx mask/footer tests |
| CTRL-05 | 49-05/07, 49-09 | Tag/StatusTag/Badge status color map | ✓ SATISFIED | exact-hex parity test |
| CTRL-06 | 49-03/05/06/07, 49-09 | Every wrapper single config point, no empty re-export | ✓ SATISFIED | pass-through detector = 0 |
| GUARD-01 | 49-08, 49-09 | ESLint blocks direct AntD import outside ui/ | ✓ SATISFIED | eslint.config.mjs + fixture test |
| GUARD-02 | 49-08, 49-09 | Local lint/build/focused-test; no GH Actions CI | ✓ SATISFIED | scripts + 3 gates green; no new workflow |
| GUARD-03 | 49-03/04/05/07/08, 49-09 | Focused wrapper/token tests both modes | ✓ SATISFIED | 73 tests green |

All 16 IDs declared across PLAN frontmatter and mapped to REQUIREMENTS.md — zero orphaned, zero unaccounted.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No `TBD`/`FIXME`/`XXX`/`PLACEHOLDER` in phase source; no stub returns; no hardcoded-empty data in wrappers |

INFO-only caveats from `49-REVERIFY.md` (non-blocking, intentional): `--ui-*` contract has CSS consumers but is visually inert by design (ConfigProvider is sole pixel source; Phase 50 must not read it as visual override); no single integrated TitleBar→`data-theme` test (mechanism + adapter tests cover both halves; proposed for Phase 50).

### Human Verification Required

None for this foundation phase. All must-haves are observable in code and covered by focused automated tests. Light/dark visual parity on real Chrome is explicitly Phase 50 (ROADMAP SC: "Chrome UAT in light and dark") and is not a gap in this foundation phase.

### Gaps Summary

No gaps. All 9 observable truths verified with direct code/test evidence; all 16 requirements satisfied; lint, build, and 73 focused tests green. Independent re-review (`49-REVERIFY.md`) confirmed all 9 prior code-review findings resolved with no new critical/warning. Phase goal achieved.

---

_Verified: 2026-11-21T10:24:55Z_
_Verifier: Claude (gsd-verifier)_
