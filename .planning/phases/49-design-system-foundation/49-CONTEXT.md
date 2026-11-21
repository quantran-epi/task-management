# Phase 49: Design System Foundation - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Nền tảng design system TaskMate, chạy trên đúng một shell IntelliJ/workbench.Không migrate app (đó là Phase 50). Phase này gồm: xóa shell AntD/flag/PWA, một nguồn token light+dark, wrapper cho **mọi** control AntD (kể cả @ant-design/icons), guard local bằng ESLint + npm scripts, và test nền tảng.

</domain>

<decisions>
## Implementation Decisions

### API wrapper & thay thế
- **D-01:** Export wrapper cùng tên AntD (`Button`, `Input`, ...) từ `src/components/ui/index.ts`; migrate sau này chỉ đổi import.
- **D-02:** Wrapper nhận props AntD chuẩn + policy props riêng (`variant`/`intent`); implementation ẩn bên trong wrapper.
- **D-03:** Mỗi control là một file riêng trong `src/components/ui/`; đổi implementation sửa đúng một file, không đụng app. Không có ngoại lệ, kể cả Table/Form/DatePicker/Modal/Drawer/Card/Menu/Tooltip.
- **D-04:** Có test tự động quét import AntD + danh sách component đang dùng; fail nếu component chưa có wrapper.

### Theme switching
- **D-05:** Toggle light/dark trong UI workbench; mặc định theo `prefers-color-scheme` nếu user chưa chọn.
- **D-06:** Lưu lựa chọn theme trong `localStorage` (UI preference, không phải domain data).
- **D-07:** Đổi theme tức thì toàn app, kể cả popout/Tauri window khác; không reload.
- **D-08:** Palette IntelliJ Light (nền trắng/xám nhạt, accent `#2f62d8`) và Darcula dark (nền `#1e1e1e`/`#2b2b2b`, accent xanh nhạt hơn); giữ cùng radius/height/font giữa 2 mode.

### Icon & style policy
- **D-09:** `@ant-design/icons` cũng wrap qua `src/components/ui/icon.tsx`; ESLint chặn import trực tiếp.
- **D-10:** `IconButton` wrapper bắt buộc `aria-label`, có size mặc định; cấm style `font-size` lẻ.
- **D-11:** Phase 50 thay inline style/hardcode có token bằng token/CSS class; giá trị đặc thù giữ lại kèm comment giải thích.
- **D-12:** Một status color map dùng chung trong token cho Tag/Badge/StatusDot ở mọi domain.

### Lộ trình xóa shell cũ
- **D-13:** Phase 49 cleanup shell AntD ở plan đầu, rồi mới token/wrapper; chỉ còn một theme tree.
- **D-14:** Xóa hẳn PWA install prompts + manifest/service-worker config từ `vite-plugin-pwa`.
- **D-15:** Không dùng GitHub Actions CI; bắt buộc `npm run lint` + `npm run build` + focused test local sau mỗi lần sửa code.
- **D-16:** UAT Chrome chi tiết để Phase 50; Phase 49 verify bằng unit test + build.

### Tooling choices (resolved after research)
- **D-17:** Dùng Babel parser (`@babel/eslint-parser` + `@babel/core` + `@babel/preset-typescript`) cho ESLint; giữ TypeScript 7.0.2 cho build. Không dùng typescript-eslint.
- **D-18:** Icon wrapper gom trong một file `src/components/ui/icon.tsx` export lại 144 icon; đổi icon library sửa đúng file này. Đây là ngoại lệ có chủ đích của D-03 (icon không phải control).
- **D-19:** ESLint `no-restricted-imports` với `allowTypeImports: true` — `import type` từ `antd` được phép ngoài `ui/`; chỉ chặn runtime import.

### Claude's Discretion
- Cấu trúc bên trong mỗi file wrapper và cách map props AntD → props wrapper, miễn tuân D-01..D-04.
- Tên cụ thể của CSS custom properties và hằng số token, miễn có một nguồn duy nhất.
- Chi tiết kỹ thuật đồng bộ theme sang popout/Tauri window (event, storage event, hoặc API native), miễn đổi tức thì.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone contracts
- `.planning/REQUIREMENTS.md` — SHELL/TOKEN/CTRL/GUARD/ADOPT requirement IDs; GUARD-02 updated to local checks only
- `.planning/ROADMAP.md` §Phase 49 — phase goal, 16 requirements, 5 success criteria
- `.planning/PROJECT.md` — project constraints and decisions
- `.planning/research/SUMMARY.md` — codebase inventory and full-wrapper rule

### Code sources of truth
- `src/main.tsx` — shell switch to remove
- `src/App.tsx` — legacy AntD shell to delete
- `src/AppIntelliJ.tsx` — surviving shell
- `src/workbench/AntdThemeAdapter.tsx` — theme adapter to unify
- `src/styles/workbench-tokens.css` — current light/dark CSS tokens
- `vite.config.ts` — vite-plugin-pwa config to remove
- `package.json` — scripts for local lint/build/test

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/workbench/AntdThemeAdapter.tsx` — existing ConfigProvider; merge into single token source.
- `src/styles/workbench-tokens.css` — existing light/dark CSS vars; use as base, not duplicate.
- `src/components/common/` — existing composites (PageHeader, TagSelect...) to leave in place for Phase 50.
- `tests/setup.ts` + Vitest/jsdom — existing test harness for wrapper tests.

### Established Patterns
- React 19.3 + AntD 6.6.5 + strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- No ESLint config present — must add flat config with `no-restricted-imports`.
- No component barrels in `src` — this phase introduces `src/components/ui/index.ts`.
- ~60 distinct AntD components, 248 files import AntD directly (inventory in research summary).

### Integration Points
- `src/main.tsx` boot — remove shell flag, boot IntelliJ only.
- Root `ConfigProvider` — single token source, light/dark algorithm.
- `localStorage` — theme preference key.
- Popout/Tauri windows — theme change propagation.

</code_context>

<specifics>
## Specific Ideas

- "Mọi control, không sót một cái nào, đều phải wrap để có thể thay thế hoặc chỉnh sửa bất kỳ lúc nào."
- "Chuẩn cả light mode và dark mode."
- "Chỉ cần 1 mode IntelliJ UI; app giờ chỉ cần 1 mode."
- "Chạy local thôi, mỗi lần sửa code check chuẩn; GitHub build thì không check nữa, mất thời gian."

</specifics>

<deferred>
## Deferred Ideas

- App-wide migration to wrappers (Phase 50).
- Visual regression suite / theme editor — future requirements.
- Any new product feature — out of scope.

</deferred>

---

*Phase: 49-Design System Foundation*
*Context gathered: 2026-11-21*
