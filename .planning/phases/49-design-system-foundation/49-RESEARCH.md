# Phase 49: Design System Foundation - Research

**Researched:** 2026-11-21
**Domain:** React/AntD design-system foundation — shell removal, unified light/dark tokens, universal AntD wrappers, ESLint import guard, Tauri theme propagation
**Confidence:** MEDIUM overall (codebase findings HIGH from direct inspection; library APIs CITED from official docs; ESLint/TS7 blocker is a verified registry + API finding needing one planner decision)

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Export wrapper cùng tên AntD (`Button`, `Input`, ...) từ `src/components/ui/index.ts`; migrate sau này chỉ đổi import.
- **D-02:** Wrapper nhận props AntD chuẩn + policy props riêng (`variant`/`intent`); implementation ẩn bên trong wrapper.
- **D-03:** Mỗi control là một file riêng trong `src/components/ui/`; đổi implementation sửa đúng một file, không đụng app. Không có ngoại lệ, kể cả Table/Form/DatePicker/Modal/Drawer/Card/Menu/Tooltip.
- **D-04:** Có test tự động quét import AntD + danh sách component đang dùng; fail nếu component chưa có wrapper.
- **D-05:** Toggle light/dark trong UI workbench; mặc định theo `prefers-color-scheme` nếu user chưa chọn.
- **D-06:** Lưu lựa chọn theme trong `localStorage` (UI preference, không phải domain data).
- **D-07:** Đổi theme tức thì toàn app, kể cả popout/Tauri window khác; không reload.
- **D-08:** Palette IntelliJ Light (nền trắng/xám nhạt, accent `#2f62d8`) và Darcula dark (nền `#1e1e1e`/`#2b2b2b`, accent xanh nhạt hơn); giữ cùng radius/height/font giữa 2 mode.
- **D-09:** `@ant-design/icons` cũng wrap qua `src/components/ui/icon.tsx`; ESLint chặn import trực tiếp.
- **D-10:** `IconButton` wrapper bắt buộc `aria-label`, có size mặc định; cấm style `font-size` lẻ.
- **D-11:** Phase 50 thay inline style/hardcode có token bằng token/CSS class; giá trị đặc thù giữ lại kèm comment giải thích.
- **D-12:** Một status color map dùng chung trong token cho Tag/Badge/StatusDot ở mọi domain.
- **D-13:** Phase 49 cleanup shell AntD ở plan đầu, rồi mới token/wrapper; chỉ còn một theme tree.
- **D-14:** Xóa hẳn PWA install prompts + manifest/service-worker config từ `vite-plugin-pwa`.
- **D-15:** Không dùng GitHub Actions CI; bắt buộc `npm run lint` + `npm run build` + focused test local sau mỗi lần sửa code.
- **D-16:** UAT Chrome chi tiết để Phase 50; Phase 49 verify bằng unit test + build.
- **Claude's Discretion:** Cấu trúc bên trong mỗi file wrapper và cách map props AntD → props wrapper, miễn tuân D-01..D-04; tên cụ thể CSS custom properties và hằng số token, miễn một nguồn duy nhất; chi tiết kỹ thuật đồng bộ theme sang popout/Tauri window, miễn đổi tức thì.

### Deferred Ideas (OUT OF SCOPE)
- App-wide migration to wrappers (Phase 50).
- Visual regression suite / theme editor — future requirements.
- Any new product feature — out of scope.

### Project CLAUDE.md — binding constraints for this phase
- Runtime 100% local, Tauri desktop là runtime duy nhất được hỗ trợ; **PWA out of scope** — không thêm/debug/validate PWA behavior.
- Mọi thảo luận bằng tiếng Việt; xưng "sếp"; code/identifiers/commands giữ nguyên.
- Anti-Read-Loop: đọc 1 lần phạm vi rộng, không re-read đoạn vừa đọc.
- Test scope: **không chạy full vitest suite** (>1h); luôn scope path cụ thể (`--bail=1`, không dùng `-x` với Vitest 5).
- Mọi thay đổi file đi qua GSD workflow (không edit trực tiếp ngoài workflow).
- Không dùng `@types/antd` (AntD bundles types), không dùng `uuid` package (native `crypto.randomUUID()`).
- C-16 (`.planning/PROJECT.md`): app chưa production, mọi row Dexie/SQLite/backup là test data — khi xóa shell cũ **không cần migration**, xóa data/schema/type/migration path luôn.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHELL-01 | Chỉ khởi động shell IntelliJ; không còn lựa chọn/flag AntD | `src/main.tsx` boot logic + `shouldBootIntelliJ()`; remove `App` boot branch |
| SHELL-02 | Xóa code shell AntD cũ, flag trong main.tsx, PWA install prompts | `src/App.tsx`, PWA files inventory, vite.config VitePWA block |
| SHELL-03 | Không migration cấu hình shell cũ | C-16 test-data rule; delete `taskmate_ui_shell` localStorage key, no migrator |
| TOKEN-01 | Một nguồn token cho cả ConfigProvider lẫn CSS | `AntdThemeAdapter.tsx` + `workbench-tokens.css` current duplication; unified `tokens.ts` recommendation |
| TOKEN-02 | Light+dark đầy đủ, đổi theme tức thì không reload | AntD `ConfigProvider` algorithm swap (CITED) + localStorage theme hook + Tauri emitTo broadcast |
| TOKEN-03 | Giữ lựa chọn theme của user làm mặc định | D-05/D-06: `localStorage` override > `prefers-color-scheme` fallback |
| TOKEN-04 | Không hardcode giá trị đã có token; test phát hiện drift | `visualTokens.test.tsx` existing source-string pattern; extend to wrapper/token parity test |
| CTRL-01 | Mọi control AntD + icons có wrapper, mọi dùng đi qua wrapper | Inventory: 62 antd named imports (~50 real components + types), 144 icons, 232 files; D-03/D-04 |
| CTRL-02 | Button/IconButton: size/font/color/loading/disabled/danger + aria-label | D-10; AntD Button tokens; icon-button test with accessible name |
| CTRL-03 | Input/Select/Textarea/InputNumber: height/font/placeholder/error/disabled/width | AntD component tokens + shared `controlHeight` seed |
| CTRL-04 | Modal/Drawer/Popconfirm: width scale/footer/close-mask policy/title | AntD static `Modal.confirm` context-loss caveat (CITED) — use wrapper with `Modal.useModal` |
| CTRL-05 | Tag/StatusTag/Badge: status color map dùng chung | D-12; unify existing scattered status colors from `workbench-tokens.css` |
| CTRL-06 | Mọi wrapper (kể cả phức tạp) là điểm cấu hình duy nhất, không re-export rỗng | D-03; anti-pass-through test (wrapper must reference shared tokens/policy) |
| GUARD-01 | ESLint chặn import trực tiếp antd/icons ngoài ui/ | `no-restricted-imports` + flat config `files`/`ignores` (CITED); **TS7 parser blocker — see Pitfall 1** |
| GUARD-02 | Local lint+build+focused test; vi phạm làm lint fail; không GH Actions | package.json scripts; no GitHub Actions CI; Vitest focused CLI (CITED) |
| GUARD-03 | Test focused: render đúng token light/dark, aria-label, policy | `tests/setup.ts`, `AntdThemeAdapter.test.tsx` patterns; new wrapper tests |

</phase_requirements>

## Summary

TaskMate hiện boot **hai shell** qua flag trong `src/main.tsx`: `App` (legacy AntD shell, purple) và `AppIntelliJ` (workbench, blue). Phase 49 phải xóa hoàn toàn shell `App`, flag `?ui=intellij`/`taskmate_ui_shell`, và toàn bộ PWA install/manifest/service-worker (`vite-plugin-pwa` trong `vite.config.ts`, `ServiceWorkerContext`, `usePWAInstall`, `virtual:pwa-register` alias) — chỉ giữ IntelliJ. C-16 cho phép xóa sạch không migration. [VERIFIED: codebase grep]

Theme hiện có **hai nguồn trùng lặp**: `src/workbench/AntdThemeAdapter.tsx` (hardcoded `LIGHT_TOKENS`/`DARK_TOKENS` cho ConfigProvider, accent `#2f62d8`) và `src/styles/workbench-tokens.css` (CSS vars cho `:root`, `@media prefers-color-scheme dark`, `:root[data-theme=dark]`, accent `#2f62d8`/`#6a9bff`). `useThemeMode.ts` chỉ đọc OS preference, **chưa có localStorage override, chưa có toggle, chưa có cross-window broadcast**. Cần unify thành một `tokens.ts`源 feeding cả ConfigProvider và CSS vars. [VERIFIED: codebase read]

Inventory AntD: **62 distinct named imports từ `antd`** (trong đó ~10 là types như `ButtonProps`, `MenuProps`, `TableColumnsType` — không cần wrapper component nhưng `ButtonProps` type thường tái dùng trong wrapper), **144 icon names** từ `@ant-design/icons`, **232 files import antd + 172 files import icons** (tổng 248 files riêng lẻ). Mọi wrapper phải là file riêng trong `src/components/ui/` + barrel `index.ts`, mỗi cái áp token defaults/policy thật — không pass-through. [VERIFIED: codebase AST-style grep]

**Primary recommendation:** Chia 4-5 plan theo thứ tự dependency: (1) shell cleanup + PWA removal, (2) unified token source + theme mode store/hook + toggle + Tauri broadcast, (3) wrapper infrastructure (tokens contract + `index.ts` + guard test) rồi batch wrappers (buttons/icons, inputs, overlays, status, complex), (4) ESLint guard + local scripts, (5) focused tests. **Trước khi plan guard: must resolve TS7-native + ESLint parser blocker (Pitfall 1)** — đây là quyết định duy nhất còn mở.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shell selection / boot | Browser (app entry `main.tsx`) | — | Boot-time branch là client concern; xóa flag, hard-boot AppIntelliJ |
| Theme token values | Browser / shared module (`tokens.ts`) | CSS vars (`workbench-tokens.css`) | Một nguồn JS token làm seed; CSS vars sinh ra/đồng bộ từ cùng nguồn |
| Theme mode state (light/dark/override) | Browser (`useThemeMode` + localStorage) | Tauri event bridge (emitTo) | UI preference thuộc client; broadcast sang popout qua Tauri IPC |
| AntD component rendering + policy | Browser (`src/components/ui/*` wrappers) | AntD ConfigProvider | Wrapper là điểm cấu hình duy nhất; ConfigProvider提供 global tokens |
| Import restriction guard | Build/tooling (ESLint flat config) | npm script (`npm run lint`) | Enforce tại lint time, chạy local, không CI |
| Focused verification | Tooling (Vitest/jsdom) | npm script | Behavior/appearance assertions cho wrapper + token parity |

## Standard Stack

### Core (đã cài, KHÔNG thêm trừ guard tooling)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React / react-dom | 19.3.0 (installed) | UI runtime | Fixed stack; wrappers là React components |
| antd | 6.6.5 (installed) | Component library | Fixed — chỉ wrap, không đổi stack |
| @ant-design/icons | 6.3.4 (declared) | Icon set | D-09: wrap qua `icon.tsx`, cấm import trực tiếp |
| TypeScript | 7.0.2 (installed) | Typing | Strict flags bật (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); **TS7 native — xem Pitfall 1** |
| Vite | 8.3.1 (installed) | Build | Fixed; bỏ `VitePWA` plugin |
| Vitest | 5.0.2 (installed) | Focused tests | `--bail=1`, scope path; không dùng `-x` |
| jsdom | 29.1.1 (installed) | Test DOM | `tests/setup.ts` + testing-library đã dùng |
| @testing-library/react | 16.3.3 (installed) | Component behavior tests | Dùng cho render token/aria-label assertions |

### New tooling for ESLint guard (CẦN CÀI — chưa có trong repo)

| Library | Registry latest | Purpose | Verdict / note |
|---------|-----------------|---------|----------------|
| eslint | 10.15.0 (CLAUDE.md pins 10.11.0) | Lint runner + flat config | Registry OK verdict but seam flagged SUS "too-new" (recent version publish, 217M/wk downloads, official repo) — false-positive style; pin per CLAUDE.md, checkpoint verify |
| @eslint/js | 10.0.1 | Base flat config recommended rules | seam OK |
| globals | 17.14.0 | Browser/node globals for flat config | seam SUS "too-new" (334M/wk, official repo); checkpoint verify |
| eslint-plugin-react-hooks | 7.1.1 | Hooks rules (CLAUDE.md requires) | seam OK; peer supports eslint ^10 |
| **Parser choice — TS7 blocker (Pitfall 1):** | | | |
| @babel/eslint-parser | 8.1.2 | Parse `.ts/.tsx` without TS compiler JS API | seam SUS "too-new" (11.4M/wk, official babel repo); needs @babel/core + @babel/preset-typescript |
| @babel/core | 8.1.3 | Babel core | seam SUS "too-new" (271M/wk, official); peer of eslint-parser |
| @babel/preset-typescript | 8.0.7 | Strip TS/TSX syntax for parser | seam OK |
| — alternative — typescript-eslint | 8.73.0 | Would be ideal but **incompatible with TS7** (peer `typescript <6.1.0`; needs compiler JS API that TS7 native lacks) | DO NOT USE unless planner pins legacy TS5 — see Pitfall 1 |

**Installation** (parser path; exact versions confirm with `npm view` at execution time):
```bash
npm install -D eslint@10 @eslint/js globals eslint-plugin-react-hooks \
  @babel/eslint-parser @babel/core @babel/preset-typescript
```

**Version verification performed 2026-11-21:**
- eslint `10.15.0` (engines `^20.19.0 || ^22.13.0 || >=24` — Node 24.16 ✓); CLAUDE.md pins `10.11.0`. [VERIFIED: npm registry]
- typescript-eslint `8.73.0` peer `typescript >=4.8.4 <6.1.0` — conflicts with TS 7.0.2. [VERIFIED: npm registry]
- @babel/eslint-parser `8.1.2`, @babel/core `8.1.3`, @babel/preset-typescript `8.0.7` — all from official babel repo, no postinstall scripts. [VERIFIED: npm registry + seam legitimacy]

## Package Legitimacy Audit

> Package Legitimacy Gate run 2026-11-21 via `gsd-tools query package-legitimacy check --ecosystem npm`.

| Package | Registry | Age/version | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| eslint | npm | 10.15.0, published 2026-11-13 | 217M/wk | github.com/eslint/eslint | SUS (too-new) | Flagged — pin 10.11.0 per CLAUDE.md; planner adds checkpoint verify |
| typescript-eslint | npm | 8.73.0, 2026-11-16 | 123M/wk | github.com/typescript-eslint/typescript-eslint | SUS (too-new) | Removed on compatibility grounds (TS7 peer mismatch) — not a slop signal |
| eslint-plugin-react-hooks | npm | 7.1.1 | 124M/wk | github.com/facebook/react | OK | Approved (CLAUDE.md requires hooks rules) |
| @eslint/js | npm | 10.0.1 | 187M/wk | github.com/eslint/eslint | OK | Approved |
| globals | npm | 17.14.0, 2026-11-01 | 334M/wk | github.com/sindresorhus/globals | SUS (too-new) | Flagged — checkpoint verify before install |
| @babel/eslint-parser | npm | 8.1.2, 2026-11-11 | 11.4M/wk | github.com/babel/babel | SUS (too-new) | Flagged — checkpoint verify before install |
| @babel/core | npm | 8.1.3, 2026-11-20 | 271M/wk | github.com/babel/babel | SUS (too-new) | Flagged — checkpoint verify before install |
| @babel/preset-typescript | npm | 8.0.7 | 79.9M/wk | github.com/babel/babel | OK | Approved |

**Packages removed due to SLOP verdict:** none.
**Packages flagged suspicious [SUS]:** eslint (use pinned 10.11.0), globals, @babel/eslint-parser, @babel/core — all show "too-new" (recent *version* publish) but have official repos + very high download counts; no postinstall scripts. Planner must add `checkpoint:human-verify` before installing these, confirming choice is intentional given TS7 constraint.
**Note:** all package names came from official docs (eslint.org, babeljs.io, typescript-eslint.io) AND registry; SUS is a freshness heuristic, not a slopsquat verdict. Still gated per protocol.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LOCAL RUNTIME (Tauri primary)                    │
│                                                                      │
│  main.tsx (boot)                                                     │
│      │ hard-boot, no flag                                            │
│      ▼                                                               │
│  AppIntelliJ ──► AntdThemeAdapter (single ConfigProvider tree)       │
│      │                  │                                            │
│      │                  │ theme={tokens[mode] + algorithm}           │
│      │                  ▼                                            │
│      │            ┌──────────────────┐                               │
│      │            │ tokens.ts (ONE   │──► CSS vars injected/synced   │
│      │            │ source: light +  │    into :root[data-theme]     │
│      │            │ dark, radius,    │                               │
│      │            │ height, font,    │◄── workbench-tokens.css       │
│      │            │ spacing, status) │    (consumed by CSS surfaces) │
│      │            └────────┬─────────┘                               │
│      │                     │                                          │
│      │    useThemeMode (OS default + localStorage override)           │
│      │                     │ toggle ──► instant token swap            │
│      │                     ├──── emitTo(popout labels, theme-change) ─┼──► popout windows
│      │                     │              (timer/notes/ai/coding-zone)│    re-read mode,
│      │                     │              no reload                   │    instant swap
│      ▼                     ▼                                          │
│  WorkbenchLayout / views / toolwindows / modals                       │
│      │                                                               │
│      └──► import from src/components/ui/ (wrappers only)             │
│                  │                                                   │
│                  └──► wrapper files → AntD ConfigProvider tokens      │
│                        (policy: aria-label, footer, status colors)   │
└─────────────────────────────────────────────────────────────────────┘

BUILD/TIGGER (local only):
  src files ──lint──► ESLint no-restricted-imports (allow only ui/) 
            ──test──► Vitest focused wrapper+token parity
            ──build─► npm run build (tsc + vite build)
  NO GitHub Actions CI.
```

### Recommended Project Structure (new pieces)

```
src/
├── styles/
│   ├── tokens.ts                 # NEW: single source — light/dark token objects, status color map,
│   │                             #   radius/height/font/spacing; feeds ConfigProvider + CSS vars
│   └── workbench-tokens.css      # EXISTING: keep as CSS-var consumer; remove duplicated literal palette
├── hooks/
│   └── useThemeMode.ts           # EXTEND: OS default + localStorage override + setter + Tauri broadcast
├── workbench/
│   └── AntdThemeAdapter.tsx      # UNIFY: read tokens.ts, single ConfigProvider tree, theme toggle mount
├── components/
│   ├── ui/                       # NEW: one file per AntD control + icon + barrel
│   │   ├── index.ts              # D-01: same-name exports
│   │   ├── button.tsx            # Button + IconButton (D-02/D-10)
│   │   ├── icon.tsx              # D-09: wraps all @ant-design/icons
│   │   ├── input.tsx, select.tsx, ...   # CTRL-03
│   │   ├── modal.tsx, drawer.tsx, popconfirm.tsx  # CTRL-04
│   │   ├── tag.tsx, badge.tsx    # CTRL-05 status map
│   │   ├── table.tsx, form.tsx, date-picker.tsx, ...  # CTRL-06 complex
│   │   └── tokens.contract.ts    # shared policy/types consumed by every wrapper (anti-pass-through)
│   └── common/                   # EXISTING: domain composites — leave for Phase 50
└── (removed) App.tsx, usePWAInstall.ts, ServiceWorkerContext.tsx, virtual-pwa.d.ts
eslint.config.js (or .mjs)        # NEW: flat config, no-restricted-imports, ui/ allowed
```

### Pattern 1: Single token source feeding both systems

**What:** One `tokens.ts` exports typed `lightTokens`/`darkTokens` objects with shared primitives (radius, controlHeight, fontFamily, fontSize, spacing, statusColorMap). `AntdThemeAdapter` spreads these into `ConfigProvider theme.token` + `theme.components`; a generation step or a `<style>`/CSS-variable bridge writes the same primitives as CSS custom properties. No hand-maintained duplicate palette.
**When to use:** TOKEN-01..04, D-08 (same radius/height/font across modes), D-12 (status map shared).
**Example:**
```ts
// Source: official AntD customize-theme docs (ant.design/docs/react/customize-theme)
<ConfigProvider
  theme={{
    algorithm: isDark
      ? [theme.darkAlgorithm, theme.compactAlgorithm]
      : [theme.defaultAlgorithm, theme.compactAlgorithm],
    token: { colorPrimary: palette.colorPrimary, borderRadius: 4, controlHeight: 30, fontSize: 13.5 },
    components: { Button: { controlHeight: 30 }, Input: { controlHeight: 30 } },
  }}
>
```
**Key caveat (CITED):** never toggle `theme` between `undefined` and an object — use `{}`. Static `Modal.confirm` / `message.xxx` / `notification.xxx` do NOT inherit ConfigProvider context (637 static usages found) — wrapper must use `App` component or `Modal.useModal` to keep token theming for imperative calls. [CITED: ant.design/docs/react/customize-theme]

### Pattern 2: Flat-config scoped import ban

**What:** ESLint flat config config-object with `files: ["src/**/*.{ts,tsx}"]`, `ignores: ["src/components/ui/**"]`, `rules: { "no-restricted-imports": ["error", { paths: [{ name: "antd", message: "..." }, { name: "@ant-design/icons" }] }] }`. Later config objects override earlier ones; scoped `ignores` only removes paths from that object, not globally. [CITED: eslint.org/docs/latest/use/configure/configuration-files + rules/no-restricted-imports]
**When to use:** GUARD-01. Optionally set `allowTypeImports: true` if type-only imports outside ui/ must stay (default false). Decide: D-01 same-name exports mean app should import types from `ui/` too → keep false for strictness, or allow types to reduce churn.

### Pattern 3: Theme mode state + cross-window broadcast

**What:** `useThemeMode` reads `localStorage` override first, else `matchMedia('(prefers-color-scheme: dark)')`. A setter writes localStorage, updates React state (instant swap via ConfigProvider + CSS `data-theme`), and — when in Tauri — calls `emitTo` on each known popout label (`timer-popout`, `notes-popout`, `ai-popout`, `coding-zone-popout`) with the new mode; each popout's `AntdThemeAdapter` listens via `listen()` and swaps. Browser fallback: `window.addEventListener('storage')` (works across same-origin browser tabs/popups).
**When to use:** D-05/D-06/D-07, TOKEN-02/03. Existing `emitTo` pattern in repo (`src/utils/aiPopout.ts`, `codingZonePopout.ts`) is the model. Labels are stable constants already exported.
**Note:** popouts share the same app URL/origin, so localStorage is common; `storage` event fires across same-origin browser windows but Tauri WebViews may not reliably propagate it — prefer explicit `emitTo` for Tauri, keep `storage` listener as browser fallback. This is discretion area (D-07 allows any instant mechanism).

### Anti-Patterns to Avoid
- **Pass-through wrapper ceremony:** a wrapper that is `export { Button } from 'antd'` violates CTRL-06/Phase-49 watch-out. Every wrapper must apply shared token default or policy (D-02/D-10/D-12) and be the single swap point.
- **Two theme trees:** keeping legacy `App` ConfigProvider + `AntdThemeAdapter` both mounted → drift. D-13: delete `App` first.
- **Hand-maintained duplicate palette:** do not copy hex values into both `tokens.ts` and CSS; drive one from the other.
- **Importing AntD types directly all over app:** strict GUARD-01 (allowTypeImports:false) forces type imports through `ui/` barrel too.
- **Static `Modal.confirm` with theme expectations:** use `Modal.useModal()` context holder (CITED).
- **Running full Vitest suite:** project rule — scope paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import restriction | Custom grep script / hand-rolled AST scanner | ESLint `no-restricted-imports` + flat config `ignores` | Official rule handles TSX via parser, messages, type-import exceptions, CI-script integration |
| Theme token derivation | Manual map of every alias token per component | AntD seed tokens + `algorithm` + `components` overrides | AntD derives map/alias tokens from 3 seeds; hand-mapping ~1000 tokens drifts |
| Dark algorithm | Hand-written dark palette translation | `theme.darkAlgorithm` composed with `theme.compactAlgorithm` | Official preset handles contrast/derivation; already used in repo |
| Cross-window list | Hardcoded window handles | Existing constant labels + `emitTo`/`listen` from `@tauri-apps/api` | Repo already has proven pattern for 4 popouts |
| Test DOM / token reads | Custom renderer | `@testing-library/react` + `theme.useToken()` | Existing harness + official token hook |
| ESLint TypeScript parser | Writing a custom parser adapter | Babel parser preset-typescript (given TS7) or typescript-eslint if planner reverts TS (see Pitfall 1) | Parser edge cases (TSX, decorators) are solved problems |

**Key insight:** The whole phase is indirection + enforcement, not new UI. Value comes from (a) one source of token truth, (b) a wrapper per control that carries real policy, (c) a lint rule that cannot be bypassed. Any custom implementation of (a) or (c) is strictly worse than the standard tools.

## Common Pitfalls

### Pitfall 1 (BLOCKING DECISION for planner): TS 7.0.2 native breaks typescript-eslint
**What goes wrong:** `typescript-eslint` 8.73.0 (latest, the ESLint-standard TS parser) declares peer `typescript >=4.8.4 <6.1.0` and requires the TypeScript compiler JS API (`createSourceFile`, `createProgram`). Installed `typescript@7.0.2` is the Go-native compiler (`tsgo`): its package `exports` only `./lib/version.cjs` (version string) + `./unstable/*` APIs; `require('typescript').createSourceFile` is `undefined`. So `typescript-eslint` cannot parse `.ts/.tsx` and `npm run lint` fails before any rule runs. [VERIFIED: npm registry peer + direct `require('typescript')` check]
**Why it happens:** CLAUDE.md/proj pins TS 7.0.2 for the native compiler speed; the ESLint TS ecosystem (v8.x) predates TS7 and has no TS7-compatible release (dist-tags: latest 8.73.0, canary 8.73.1-alpha.11 — none support TS7). [VERIFIED: npm registry dist-tags]
**How to avoid — planner picks ONE:**
- **Option A (recommended, keeps stack intact):** use `@babel/eslint-parser` + `@babel/core` + `@babel/preset-typescript` with `requireConfigFile:false`, `{ isTSX:true, allExtensions:true }`. Parses TS/TSX syntax without the TS compiler JS API; no type-aware rules (fine — GUARD-01 only needs import syntax). Adds 3 babel dev deps. [CITED: babeljs.io/docs/babel-plugin-transform-typescript]
- **Option B:** pin a legacy `typescript@5.x` solely as devDependency alias (e.g. `typescript-eslint-ts5`) for the parser, keep `typescript@7.0.2` as `tsc` — messy dual-TS, risks type drift, not recommended.
- **Option C:** downgrade project `typescript` to 5.x — violates CLAUDE.md locked stack; only with user approval.
**Warning signs:** `npm run lint` errors like "parserOptions.project has been set...", "Cannot read properties of undefined (reading 'createSourceFile')", or peer-dependency ERESOLVE on `typescript <6.1.0`.
**Recommendation:** Option A. Document in plan as explicit dev-tooling decision; all 3 babel packages are official-repo, no postinstall, seam SUS only from freshness (checkpoint verify).

### Pitfall 2: Static AntD calls lose theme context
**What goes wrong:** 637 static `Modal.confirm`/`message.success`/`notification.*` calls render outside ConfigProvider → stay light (or unthemed) after dark toggle. [VERIFIED: codebase grep count]
**Why it happens:** Static methods don't consume React context (official docs). [CITED: ant.design customize-theme]
**How to avoid:** Phase 49 wrapper for Modal/Message/Notification must wrap with `<App>` context or `Modal.useModal()` holder; Phase 50 migrates call sites. Do not claim TOKEN-02 "updates every control" while static calls remain — note they are Phase-50 adoption, but the *wrapper* mechanism must be ready in Phase 49.

### Pitfall 3: Incomplete wrapper inventory
**What goes wrong:** planner creates ~40 "obvious" wrappers, misses e.g. `Splitter`, `Mentions`, `TreeSelect`, `Segmented`, `Statistic`, `Descriptions`, `Result`, `Skeleton`, `Grid`, and all 144 icons → GUARD-01 lint passes only if app already migrated (Phase 50), but CTRL-01/D-04 fail the "every component used has a wrapper" test.
**Why it happens:** "~60 components" is approximate; real inventory is 62 antd imports + 144 icons.
**How to avoid:** D-04 test must derive the required-wrapper list from an authoritative inventory file/regex scan (the AST-style grep above), not a hand-typed list. Generate the 62 component + 144 icon wrapper files (icons can be grouped in `icon.tsx` per D-09 — one file exporting all wrapped icons, still satisfies "each control is a file" since icons are one policy family).

### Pitfall 4: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` strict TS in wrappers
**What goes wrong:** wrapper prop spreading with conditional defaults produces TS errors on optional props (e.g. setting `title={undefined}`) and indexed token lookups.
**Why it happens:** both flags enabled in `tsconfig.json`.
**How to avoid:** omit keys instead of passing `undefined` (aligns with STATE decision "omit override key when inheriting"); type token maps with `as const` and explicit key types. `tsc --noEmit` is part of `npm run build`.

### Pitfall 5: PWA removal leaves dangling config
**What goes wrong:** removing VitePWA from `vite.config.ts` but leaving `virtual:pwa-register/react` test alias, `src/types/virtual-pwa.d.ts`, `usePWAInstall.ts`, `ServiceWorkerContext.tsx`, and the pwa-*.png in includeAssets → dead imports / test setup breaks.
**How to avoid:** SHELL-02 plan must delete all 5 files + remove both the `test.alias['virtual:pwa-register/react']` entry and pwa manifest/workbox blocks; check `tests/hooks/usePWAInstall.test.tsx` deletion. Verify no remaining `useRegisterSW` import.

### Pitfall 6: theme default precedence wrong
**What goes wrong:** D-05 says OS default **only if user hasn't chosen**; naïvely always reading `matchMedia` ignores localStorage (TOKEN-03 fails).
**How to avoid:** precedence = `localStorage['taskmate_theme']` ∈ {'light','dark'} → else `matchMedia` → else light. Keep OS `change` listener active only while no explicit override.

## Code Examples

Verified patterns from official sources / direct codebase inspection:

### ESLint flat config — scoped import ban (with TS7 parser caveat)
```js
// Source: eslint.org/docs/latest/use/configure/configuration-files + rules/no-restricted-imports
// eslint.config.mjs — parser line is the TS7 workaround (Pitfall 1, Option A)
import babelParser from '@babel/eslint-parser';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src-tauri/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]] },
      },
    },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'antd', message: 'Import from src/components/ui instead.' },
          { name: '@ant-design/icons', message: 'Import from src/components/ui/icon instead.' },
        ],
      }],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'], // later object overrides — wrappers MAY import AntD
    rules: { 'no-restricted-imports': 'off' },
  },
];
```

### Theme runtime swap (single source)
```tsx
// Source: ant.design/docs/react/customize-theme (adapted to tokens.ts single source)
import { ConfigProvider, theme } from 'antd';
import { useThemeMode } from '../hooks/useThemeMode';
import { getAntdTheme } from '../styles/tokens';

export function AntdThemeAdapter({ children }) {
  const { mode } = useThemeMode(); // 'light' | 'dark', localStorage > OS
  return (
    <ConfigProvider theme={getAntdTheme(mode)}>
      <div className="taskmate-workbench-theme" data-theme={mode}>{children}</div>
    </ConfigProvider>
  );
}
// getAntdTheme(mode) returns { algorithm: [...], token: {...palette, borderRadius, controlHeight, fontSize}, components: {...} }
// from ONE tokens.ts — no literal palette here.
```

### IconButton wrapper (D-02/D-10)
```tsx
// Pattern from codebase policy; aria-label required by type, default size, no odd font-size
import { Button } from 'antd';
import { getSharedControlTokens } from './tokens.contract';

type IconButtonProps = { 'aria-label': string; size?: 'small' | 'middle' } & /* AntD ButtonProps subset */ {};
export function IconButton({ 'aria-label': label, size = 'middle', ...rest }: IconButtonProps) {
  return <Button aria-label={label} size={size} icon={rest.icon} {...getSharedControlTokens()} {...rest} />;
}
// Note: exact typing must satisfy exactOptionalPropertyTypes — omit optional keys, never pass undefined.
```

### Focused Vitest run (GUARD-02)
```bash
# Source: vitest.dev/guide/cli.html — scoped, fail-fast, no full suite
npx vitest run tests/wrappers/ tests/tokens/ --bail=1
npx vitest run src/workbench/__tests__/AntdThemeAdapter.test.tsx -t="dark"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dual shell flag `?ui=intellij` / `taskmate_ui_shell` | Hard-boot single IntelliJ shell | Phase 49 (v1.5) | Delete `App.tsx`, flag logic, no migration (C-16) |
| Two duplicated palettes (App.tsx purple + adapter/CSS blue) | One `tokens.ts` feeding ConfigProvider + CSS vars | Phase 49 | Kills drift; D-08 same metrics both modes |
| OS-only `useThemeMode` | OS default + localStorage override + toggle + Tauri broadcast | Phase 49 | TOKEN-02/03/D-05..07 |
| Direct AntD imports in 248 files | Wrapper-per-control + ESLint ban | Phase 49 foundation / Phase 50 adoption | GUARD-01; single swap point |
| PWA/service worker (vite-plugin-pwa) | Removed — Tauri-only | Phase 49 (CLAUDE.md PWA out of scope) | Delete manifest/SW/prompt files |
| typescript-eslint for TS | Babel parser (if TS7 stays) | This phase decision | TS7 native lacks compiler JS API |

**Deprecated/outdated in this phase:**
- `src/App.tsx` legacy shell — delete.
- `usePWAInstall.ts`, `ServiceWorkerContext.tsx`, `virtual-pwa.d.ts` — delete.
- Source-string-only token tests (`visualTokens.test.tsx` asserts hex literals in CSS/TSX) — replace/extend with behavior/appearance assertions; literal checks will fail once palette moves to single source. Keep the ones that still hold (font unicode-range, no purple) but update references.

## Assumptions Log

> Claims tagged from non-codebase sources needing planner/user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Popout windows share the app origin, so `localStorage` value is common; `storage` event may not fire in Tauri WebViews — use `emitTo` as authoritative broadcast | Pattern 3 / D-07 | If storage is isolated per webview, browser `storage` fallback fails — but `emitTo` still works; low risk |
| A2 | seam "too-new" SUS flags on eslint/globals/babel are false positives (mature packages, recent version publish) | Package Legitimacy | If actually malicious (contradicted by official repo + download counts), install would be unsafe — checkpoint verify covers this |
| A3 | tsgo/TS7 has no TS7-compatible typescript-eslint release as of 2026-11-21 | Pitfall 1 | If a TS7 parser exists, Option A adds unnecessary babel deps — verify once at plan time |

## Open Questions

1. **ESLint parser path (BLOCKING for GUARD-01 plan)**
   - What we know: TS 7.0.2 native has no `createSourceFile`/`createProgram`; typescript-eslint 8.x peer caps TS at <6.1.0. Babel parser works without TS compiler but adds 3 deps.
   - Unclear: whether planner/user accepts babel parser as the lint parser, or prefers pinning legacy TS for tooling, or downgrading TS (violates CLAUDE.md).
   - Recommendation: Option A (Babel parser) — smallest change, keeps build stack, no type-aware lint needed. Confirm before writing guard plan.

2. **Icon wrapper granularity**
   - What we know: D-09 says icons wrapped via single `src/components/ui/icon.tsx`; D-03 says every control is one file ("no exceptions").
   - Unclear: do 144 icons count as 144 files or one `icon.tsx` exporting 144 wrapped icons?
   - Recommendation: one `icon.tsx` with a generic wrapped-icon factory + same-name exports for all 144; D-09 explicitly names one file for icons, treat icons as one policy family. Confirm with user if strict reading required.

3. **Type-only imports outside ui/**
   - What we know: `allowTypeImports` default false; 62 imports include ~10 types.
   - Unclear: strict ban (all types via ui barrel) vs allow type imports to reduce Phase-50 churn.
   - Recommendation: `allowTypeImports: false` for D-06 GUARD-01 "không có ngoại lệ"; barrel re-exports AntD prop types.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/lint/test | ✓ | 24.16.0 (matches CLAUDE.md 24 LTS) | — |
| npm | install scripts | ✓ | 11.13.0 | — |
| TypeScript (tsc) | `npm run build` | ✓ | 7.0.2 native | — |
| antd / icons | wrappers | ✓ | 6.6.5 / 6.3.4 | — |
| Vitest + jsdom | focused tests | ✓ | 5.0.2 / 29.1.1 | — |
| @testing-library/react | wrapper tests | ✓ | 16.3.3 | — |
| @tauri-apps/api | cross-window theme event | ✓ | ^2.2.0 | Browser `storage` listener fallback |
| ESLint + flat config deps | GUARD-01 | ✗ | — | Must install (see Standard Stack; TS7 caveat) |
| Babel parser stack | GUARD-01 Option A | ✗ | — | Must install if Option A chosen |
| Chrome for UAT | Phase 49 verify is unit+build per D-16; Chrome UAT deferred to Phase 50 | (n/a) | — | Not required this phase |

**Missing dependencies with no fallback:** ESLint toolchain — must install before GUARD-01 can be implemented.
**Missing with fallback:** cross-window broadcast if Tauri API unavailable in a browser test env → `storage` event / direct state in same window; tests use jsdom (no real Tauri) so emitTo path must be mocked.

## Validation Architecture

> Nyquist validation enabled (`workflow.nyquist_validation: true`). Phase 49 is foundation: verification = focused unit/build, **not** Chrome UAT (D-16). Human UAT boundary is Phase 50 (ADOPT-03).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + jsdom 29.1.1 + @testing-library/react 16.3.3 |
| Config file | `vite.config.ts` (`test` block; setupFiles `./tests/setup.ts`) |
| Quick run command | `npx vitest run <scoped-paths> --bail=1` (NEVER full suite; no `-x`) |
| Full suite command | `npm run build` (i.e. `tsc && vite build`) — not the full Vitest suite |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHELL-01/02 | No `?ui` flag, no legacy App import, PWA files gone | source scan | `npx vitest run tests/shell.test.tsx` (adapt) | ✅ exists (needs update) |
| SHELL-03 | No shell migration code | source scan | part of shell.test | ⚠️ fold in |
| TOKEN-01/04 | ConfigProvider values == CSS var values; no drift | unit + source scan | `npx vitest run tests/tokens/` | ❌ Wave 0 |
| TOKEN-02/03 | light/dark render; localStorage precedence > OS; toggle instant | unit (jsdom) | `npx vitest run src/workbench/__tests__/AntdThemeAdapter.test.tsx` | ✅ exists (extend) |
| TOKEN-02 (popout) | emitTo broadcast on toggle | unit (mocked @tauri-apps/api) | `npx vitest run tests/hooks/themeBroadcast.test.ts` | ❌ Wave 0 |
| CTRL-01/06 | Every used AntD component has real wrapper (no pass-through) | static scan test | `npx vitest run tests/wrappers/inventory.test.ts` | ❌ Wave 0 |
| CTRL-02 | IconButton requires aria-label; default size | component test | `npx vitest run tests/wrappers/button.test.tsx` | ❌ Wave 0 |
| CTRL-03 | input height/error/disabled defaults from token | component test | `npx vitest run tests/wrappers/input.test.tsx` | ❌ Wave 0 |
| CTRL-04 | modal footer/close policy, useModal context | component test | `npx vitest run tests/wrappers/overlay.test.tsx` | ❌ Wave 0 |
| CTRL-05 | status color map shared across Tag/Badge/StatusDot | component test | `npx vitest run tests/wrappers/status.test.tsx` | ❌ Wave 0 |
| GUARD-01 | ESLint blocks raw antd import outside ui/, allows inside | lint invocation test | `npm run lint` + negative fixture | ❌ Wave 0 (eslint not installed) |
| GUARD-02 | npm scripts lint/build/focused test; no GH Actions | config scan | `npm run lint && npm run build` | ❌ Wave 0 (scripts missing) |
| GUARD-03 | wrappers render correct token in light+dark + a11y + policy | component tests | combined wrapper tests above | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched-tests> --bail=1` + `npm run lint`
- **Per wave merge:** `npm run build` (tsc + vite build) + all scoped wrapper/token tests
- **Phase gate:** lint + build + all focused tests green before `/gsd-verify-work`; **no full Vitest suite**

### Wave 0 Gaps
- [ ] `eslint.config.mjs` + install ESLint toolchain (resolve Pitfall 1 first)
- [ ] `package.json` scripts: `lint`, and a focused-test script (e.g. `test:foundation`)
- [ ] `tests/tokens/` — token parity light/dark + drift detection
- [ ] `tests/wrappers/inventory.test.ts` — required-wrapper set from source scan
- [ ] `tests/wrappers/{button,input,overlay,status}.test.tsx` — CTRL-02..05/GUARD-03
- [ ] `tests/hooks/themeBroadcast.test.ts` — Tauri emitTo + browser storage fallback
- [ ] Update `tests/shell.test.tsx` for single-shell + PWA removal
- [ ] Update/remove `visualTokens.test.tsx` literal-token assertions

### Human UAT boundary (automation vs human)
- **Automated in Phase 49:** all wrapper render/token/aria/policy, token parity, guard lint, build, shell/PWA removal, theme mode precedence + broadcast (mocked Tauri).
- **Human in Phase 49:** none required — D-16 explicitly defers Chrome UAT to Phase 50. A quick manual smoke (toggle theme in running dev app, check popouts) is optional advisory, not a gate.
- **Human UAT deferred to Phase 50 (ADOPT-03):** Chrome observable flows in both themes — task quick-add, settings CRUD, CR detail actions, modal forms, toolbar icon buttons, AI chat controls; focus/keyboard/accessible names intact.

## Security Domain

`security_enforcement` enabled (absent→enabled), ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth change in this phase |
| V3 Session Management | no | — |
| V4 Access Control | no | No new access paths; wrappers preserve existing behavior |
| V5 Input Validation | no (foundation) | Wrappers pass through AntD validation; no new trust boundary |
| V6 Cryptography | no | No crypto changes |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Direct AntD import bypasses wrapper policy | Tampering | ESLint `no-restricted-imports` (GUARD-01) enforced in local lint gate |
| Malicious/hijacked dev dependency in new lint toolchain | Tampering | Legitimacy audit (all official repos, no postinstall); checkpoint verify on SUS packages |
| Theme toggle XSS via localStorage value | Tampering | Validate stored value ∈ {'light','dark'}; never inject raw string into DOM/CSS (set `data-theme` to enum only) |
| Popout event spoofing | Tampering | Cross-window theme event should carry enum value only; ignore malformed payloads (mirrors existing emitTo revision/origin checks in phase 48) |

**Note:** Phase 49 adds no network/auth/data surface — security posture largely unchanged; main concern is dependency integrity for the new lint stack.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/main.tsx`, `src/App.tsx`, `src/AppIntelliJ.tsx`, `src/workbench/AntdThemeAdapter.tsx`, `src/styles/workbench-tokens.css`, `src/hooks/useThemeMode.ts`, `vite.config.ts`, `package.json`, `tsconfig.json`, `tests/shell.test.tsx`, `visualTokens.test.tsx`, `AntdThemeAdapter.test.tsx`
- AST-style import inventory (2026-11-21): 62 antd named imports, 144 icons, 232 antd files + 172 icon files
- npm registry direct queries: eslint 10.15.0 engines, typescript-eslint 8.73.0 peer, babel versions, TS7 `require('typescript')` API check
- `gsd-tools query package-legitimacy check` + `classify-confidence` + `research-plan` seam

### Secondary (MEDIUM confidence) — CITED official docs
- https://ant.design/docs/react/customize-theme — ConfigProvider theme, algorithm composition, components overrides, useToken, static-method context caveat
- https://eslint.org/docs/latest/use/configure/configuration-files — flat config `files`/`ignores` scoping & cascade
- https://eslint.org/docs/latest/rules/no-restricted-imports — paths/patterns options, allowTypeImports
- https://vitest.dev/guide/cli.html — focused run syntax, `-t` filter
- https://babeljs.io/docs/babel-plugin-transform-typescript — Babel TS/TSX parsing without type-check

### Tertiary (LOW confidence / needs validation)
- Tauri v2 cross-window `storage` event behavior (official pages 404'd in this session; recommendation uses explicit `emitTo` so low dependency on this) — ASSUMED
- Babel-parser compatibility with this repo's exact TSX syntax (decorators etc.) — assumed OK, no repo TSX parse run performed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all runtime versions read from installed packages + npm registry
- Architecture: HIGH — derived from direct code inspection of the exact files this phase edits
- Pitfalls: HIGH for TS7/ESLint blocker (registry peer + runtime API verified); MEDIUM for Tauri storage nuance
- Package legitimacy: MEDIUM — seam SUS on freshness only; checkpoint verify recommended

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (stable stack; versions may shift — re-verify ESLint toolchain at plan time)
