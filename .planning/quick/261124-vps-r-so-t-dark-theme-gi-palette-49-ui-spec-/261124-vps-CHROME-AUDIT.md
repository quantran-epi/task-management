# 261124-vps — Chrome dark-theme control audit

Date: 2026-11-24. Runtime focus: desktop/Tauri-style shell in Chrome. Chrome MCP profile was occupied by another session, so audit used project Playwright driving real Google Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) in a private headless context, `colorScheme: 'dark'`. No existing browser profile, worktree, or session was touched.

## Computed theme proof

`localStorage.taskmate_theme = 'dark'`, reload, wait 15 s for IndexedDB boot:

- `document.documentElement --accent` = `#6a9bff`
- `--bg-app` = `#171d27`
- `--fg` = `#e6ebf5`
- `document.body` computed background = `rgb(17, 21, 29)`

`index.html` previously hardcoded `background:#e9eaee` on `html,body`; that produced light body under dark UI text. Fixed with an early script that reads the same `taskmate_theme` key used by `useThemeMode()` (falling back to `prefers-color-scheme`), sets `--bg-frame` to `#11151d`, and uses `background: var(--bg-frame, #e9eaee)` on `html,body`. Re-audit confirms `rgb(17,21,29)`; explicit light mode still gets `rgb(233,234,238)` even when the OS prefers dark.

## Method

For each screen: click the real navigation/tab control, wait 800 ms, screenshot at 1440×900, then evaluate computed styles on every visible `button,input,select,textarea,[role=button],[role=tab],.ant-select,.ant-input,.ant-btn,.ant-tabs-tab,.ant-table,.ant-card,.ant-modal,.ant-drawer,.ant-notification,.ant-tag,.ant-segmented-item,.ant-dropdown-menu-item,.ant-form-item-label,.ant-popover,span,strong,div`. Contrast computed with WCAG relative luminance; flag threshold < 2.4 for opaque backgrounds. This specifically catches dark text on light hardcoded backgrounds and light text on light control backgrounds.

## Screens and controls

| Screen | Controls checked | Low-contrast findings | Screenshot |
|---|---:|---:|---|
| Tasks / workbench shell | 21 | 0 | `/tmp/taskmate-dark-audit/final-tasks.png` |
| Dashboard | 31 | 0 | `/tmp/taskmate-dark-audit/final-dashboard.png` |
| Planner | visited via top nav | 0 | `/tmp/taskmate-dark-audit/planner.png` (earlier pass) |
| Telegram | 30+ | 0 text findings; 1 decorative cyan status dot with no text (`ant-badge-status-dot`, same fg/bg by design). White approval-pending card found by source scan and fixed to warning token before final capture | `/tmp/taskmate-dark-audit/final-telegram-fixed.png` |
| Analytics | visited via top nav | 0 | `/tmp/taskmate-dark-audit/analytics.png` (earlier pass) |
| Profiles | visited via top nav | 0 | `/tmp/taskmate-dark-audit/profiles.png` (earlier pass) |
| CR Explorer | 30 | 0 | `/tmp/taskmate-dark-audit/final-cr.png` |
| Settings (Công suất / tabs) | 34 | 0 | `/tmp/taskmate-dark-audit/final-settings.png` |
| Docs tab / notes workbench | 6 visible in empty state | 0 | `/tmp/taskmate-dark-audit/final-notes.png` |
| Command palette (double Shift) | 7 | 0 | `/tmp/taskmate-dark-audit/final-command-palette.png` |

Screenshots visually reviewed: Settings, Docs, Command Palette, Tasks. Dark surfaces use `#11151d`/`#171d27`/`#1c2330`; active selection `#1e3156`; primary accent `#6a9bff`; body copy `#e6ebf5`/`#9aa8bd`. No white panels or dark-on-dark text remain in the reviewed surfaces. Fresh-profile boot splash appears for a while in a brand-new Chrome profile while IndexedDB/JetBrains engine initializes; after boot it clears and the dark shell renders as above. This is boot behavior, not a token regression.

## Control-by-control spot checks

- Command palette: cheatsheet panel `var(--bg-elev)`, border `var(--border)`, selected row `var(--accent-soft)`, kbd tokens, footer border — all computed dark; no white cheatsheet.
- Settings: capacity inputs, quick hour chips, segmented tabs, borders, CR badges, warning/danger icons — none below contrast threshold; intentionally unchanged D-17 CR badge hex retained.
- CR Explorer / CR list: filters, selects, primary buttons, empty state, table header — no low contrast.
- Notes/docs: folder tree icons, selected rows, warning/info backgrounds, markdown wiki chips, quick note/file icons, popover/menu — no low contrast in empty and loaded states.
- Notifications/chat/status: bell badge, drawer rows, chat input bar, Telegram monitor — status colors come from `statusColorMap.dark`; the only flagged item is a textless status dot.
- Remote file viewer / Mermaid assistant: theme detection now uses `useThemeMode()` instead of hex sniffing; computed mode follows the shared theme broadcast.
- Coding zone diff: `--diff-add-bg/fg` and `--diff-del-bg/fg` now exist in both modes via `applyCssVariables()`; dark values are translucent green/red on `#1c2330`, with `#4ade80`/`#ff8289` foreground.

## Independent review follow-ups

An independent diff review found contrast regressions in light mode and remaining hardcoded surfaces inside touched files. Fixed before commit:

- Cyan foregrounds in SystemTable, ItemInsight, ChatInputBar, DocFolderTree moved from locked `--info` fill (`#22d3ee`, 1.7:1 on white) to new `--info-fg` (`#0e7490` light, `#22d3ee` dark), so codes/icons keep ≥5:1 in light and unchanged bright cyan in dark. `--info` itself and all 49-UI-SPEC palette hex are untouched.
- Active folder row/text in DocFolderTree and strong labels use `--fg-strong` instead of warning accent text (light 13px contrast).
- NotificationBell count badge uses AntD `blue` preset; the old light `--danger` fill produced white-on-pink below readable contrast in dark mode.
- Removed duplicate selected-card border ternary and restored wiki-chip hover affordance.
- Tokenized remaining light-only backgrounds/text in DocFolderContentsView, DocListPane, TelegramMonitorView pending-user warning card, and AgentControlView feedback bubbles.
- Re-scan after fixes: dark 33/33 and light 33/33 checked nodes with zero contrast below 2.4 on the boot shell.

## Automated checks

- `npx vitest run src/components/ui/__tests__/tokens.test.ts src/workbench/__tests__/AntdThemeAdapter.test.tsx src/hooks/__tests__/themeBroadcast.test.ts --bail=1` — 3 files / 22 tests pass.
- `npx tsc --noEmit` — clean.
- Full vitest suite intentionally not run (project rule: >1 hour).
- No package install, no branch/worktree/session operation, no other task's file staged or edited.

## Temporary tooling

Audit script was kept at repo root `audit-dark-temp.mjs` during the pass and removed before commit. Screenshots live under `/tmp/taskmate-dark-audit/`; they are evidence, not repo artifacts.
