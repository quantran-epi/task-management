# Research Summary — Milestone v1.5 Design System

**Scope:** Refactor TaskMate UI into one controlled design system, IntelliJ-only, light + dark.

## Findings (from codebase inventory, 2026-11-21)

- No design-system layer exists. `src/components/common/` holds domain composites; no wrappers or barrel.
- Two conflicting theme roots: `src/App.tsx` (purple, radius 8, height 36) and `src/workbench/AntdThemeAdapter.tsx` (blue, radius 4, height 30, compact). `src/styles/workbench-tokens.css` duplicates adapter values manually.
- 248 files import `antd`/`@ant-design/icons` directly; ~40 files call `theme.useToken()` inline (867 token references). Inline hardcoded colors/font sizes are common (notes, settings, CR, tables, toolbars, modals).
- No consistent policy for icon-button labels, modal widths/close semantics, status tag colors, danger actions, or control sizes.
- Runtime: React 19.3, AntD 6.6.5, Vite 8, TS strict, Tauri primary; dual shells selected in `src/main.tsx`.
- Tests: Vitest + jsdom; existing token mirror tests assert source strings. No shared-control tests. No ESLint config present.

## Decisions applied to this milestone

- Single IntelliJ shell only; delete legacy AntD shell, switch flag, and PWA prompts. No migration.
- One token source (`src/styles/tokens.ts` + `workbench-tokens.css` derived or unified) drives AntD `ConfigProvider` component tokens and CSS variables for both light/dark.
- EVERY AntD component used in the app (about 60 distinct components: Button, Input, Select, Table, Form, DatePicker, Modal, Drawer, Card, Menu, Tooltip, Popover, Tag, Badge, etc.) gets a TaskMate wrapper in `src/components/ui/`. No exceptions, no pass-through-only imports. Every wrapper is the single place where that control can be reconfigured or replaced.
- ESLint `no-restricted-imports` block direct AntD imports outside `src/components/ui/`; CI runs lint.
- Verification: focused Vitest for wrappers/tokens + Chrome DevTools UAT in both light and dark across representative surfaces.

## Watch out for

- Wrappers must not become pass-through ceremony; every wrapper must carry an enforced rule, not merely re-export.
- Existing token source-string tests must be replaced with behavior/appearance assertions against the unified source.
- Do NOT exempt complex components. `Table`, `Form`, `DatePicker`, `Drawer`, `Card` etc. must also be wrapped; wrappers apply shared token defaults plus specific policy and keep implementation swappable.
- Keep focus, keyboard nav, and accessible names intact on every migrated control.
