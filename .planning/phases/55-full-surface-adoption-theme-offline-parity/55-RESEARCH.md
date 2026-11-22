# Phase 55: Full Surface Adoption & Theme/Offline Parity - Research

**Researched:** 2026-11-22
**Domain:** TaskMate v1.6 native-UI milestone — adoption surfaces, theme token parity, Tauri offline parity (NAT-03, NAT-04)
**Confidence:** MEDIUM (codebase findings HIGH — verified by live grep/read + gates; theme-defect classification MEDIUM — needs Chrome confirmation in Phase 57; scope boundary LOW — one open question, see §Open Questions)

## Summary

Phase 53 (26 core/form wrappers) và Phase 54 (28 overlay/complex wrappers) đã chuyển toàn bộ 56 wrapper trong `src/components/ui/` sang control tự build; 141 icon native, 257 export được guard bởi `coverage.test.ts`, runtime-import guard `scripts/check-native-imports.mjs` xanh trên toàn bộ wrapper. [VERIFIED: codebase grep + `54-VERIFICATION.md`] Phase 55 không viết lại wrapper — nhiệm vụ là **đóng phần adoption còn sót lại** và **đảm bảo token light/dark thực sự parity ở mọi surface**.

Audit trực tiếp tree hiện tại cho thấy ba nhóm việc cụ thể. (1) **Adoption import**: chỉ còn **một** file ngoài `ui/` import **runtime value** từ `@ant-design/icons` — `src/workbench/toolwindows/RemoteGitExplorer.tsx:4-11` (8 icon deep-import). Tất cả 8 icon đã có bản native trong `src/components/ui/icon.tsx` (`wrapIcon`), nên đây là diff nhỏ, không cần dependency mới. [VERIFIED: codebase grep] (2) **Empty wrapper** (`src/components/ui/empty.tsx`) vẫn render `<AntEmpty>` runtime và là wrapper nhóm `domain/adoption` duy nhất chưa native — `52-UI-SPEC.md` xếp N-11 empty vào đợt adoption Phase 55. [VERIFIED: 52-UI-SPEC.md:88] (3) **Theme coupling**: ~80 hex literal nằm rải trong view/component ngoài `tokens.ts`; phần lớn là giá trị dữ liệu/export hợp lệ (`mermaidExport.ts` có `ponytail:` comment), nhưng một số là màu UI thật không có biến dark — điển hình `InlineStatusTag.STATUS_CONFIG` (7 trạng thái × 3 màu), `TaskTable` status color, `TaskDrawerPlanning`, `TaskJiraSection`, `ChangeRequestTable`. Đây là nguồn defect light/dark parity cần đưa về token/CSS var. [VERIFIED: codebase grep]

Theme plumbing đã đúng kiến trúc: `tokens.ts` là nguồn truth, `applyCssVariables()` ghi cả wrapper lẫn `document.documentElement` + `data-theme` + `colorScheme`; `themeBroadcast.ts` fan-out qua Tauri `emitTo` (4 popout) + `storage` event + same-window `CustomEvent`; `useThemeMode()` ưu tiên localStorage > OS > light; cả 5 branch trong `AppIntelliJ.tsx` đều bọc `AntdThemeAdapter`. CSS custom property kế thừa từ `:root` và cập nhật tức thì khi `setProperty` — không cần reload. [CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties] Baseline `npx tsc --noEmit` và `npm run lint` chạy sạch trong research này. [VERIFIED: chạy trực tiếp]

**Primary recommendation:** Giữ nguyên 56 wrapper và API của chúng. Phase 55 = (a) đổi 8 icon import trong `RemoteGitExplorer.tsx` sang barrel `components/ui/icon`, (b) chuyển `empty.tsx` sang native Empty DOM, (c) đưa màu UI còn hard-code về CSS var/`tokens.ts`, (d) chạy lại `e2e/adoption.spec.ts` (U1..U6 đã phủ đúng 5 luồng smoke + light/dark) làm cổng focused. KHÔNG gỡ dependency `antd`/`@ant-design/icons`, KHÔNG đụng type-only import — đó là Phase 56.

## <user_constraints>

**Không có CONTEXT.md** cho phase 55 (`has_context: false` từ init). Không có decision bị khóa bởi `/gsd-discuss-phase`. Dưới đây là ràng buộc có hiệu lực, trích từ `CLAUDE.md` và roadmap (xem §Project Constraints).

### Locked Decisions (từ CLAUDE.md / ROADMAP)
- Tauri là runtime duy nhất được hỗ trợ; PWA/GitHub Pages out of scope — "do not add, debug, or validate PWA/GitHub Pages behavior unless explicitly requested".
- Mọi thay đổi UI đi qua wrapper TaskMate; caller không sửa để thích nghi.
- IndexedDB là working store; app phải chạy local/offline, không thêm runtime server.
- Không chạy full Vitest suite — chỉ focused test (memory rule + roadmap cross-cutting constraint).
- Không đổi data model / ID / backup / sync; ID client-generated ổn định.
- Phase 56 mới gỡ `antd` + `@ant-design/icons` khỏi dependency — Phase 55 không gỡ.
- Mọi thảo luận bằng tiếng Việt, xưng "sếp"; mã nguồn/định danh/lệnh giữ nguyên.
- Không đọc lặp cùng một file (anti-read-loop); đọc rộng một lần rồi actions.
- Trước khi đổi file qua GSD workflow — research này chỉ tạo artifact planning.

### Claude's Discretion
- Cách tổ chức lại màu status về token (CSS var mới trong `tokens.ts` vs map riêng trong wrapper) — research khuyến nghị cụ thể ở §Architecture Patterns.
- Phạm vi "dead control code" audit — research khuyến nghị dùng guard test thay vì xóa thủ công.

### Deferred Ideas (OUT OF SCOPE)
- Phase 56: gỡ dependency, ESLint guard, focused verification, 31+ type-only import, 13 `export type`, 22 deep `antd/es/*`.
- Phase 57: Chrome exhaustive sweep, seed dummy data, screenshot, đo computed style — KHÔNG làm ở đây.
- Phase 58: đóng defect milestone.

</user_constraints>

## <phase_requirements>

## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|-------------------------------|------------------|
| NAT-03 | Toàn bộ UI surface dùng wrapper TaskMate; caller không sửa từng màn hình để thích nghi; không còn import AntD trực tiếp trong `src` và không còn code control chết. | §Adoption Surface Audit (chỉ `RemoteGitExplorer.tsx` + `empty.tsx` là runtime import thực sự), §Dead Code Audit, §Validation Architecture (adoption.spec.ts U1..U6). Ranh giới với Phase 56 xem §Open Questions. |
| NAT-04 | Token light/dark tập trung tại `src/styles/tokens.ts` + CSS variables; đổi theme cập nhật ngay mọi control; app vẫn local/offline trên Tauri, không thêm runtime server. | §Theme & Token Audit, §Theme Coupling Defects, §Environment Availability (Tauri config), §Common Pitfalls. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

| Directive | Ảnh hưởng tới plan |
|-----------|-------------------|
| Tauri primary & only runtime; no PWA/GitHub Pages work | Plan KHÔNG chứa task vite-plugin-pwa/service worker/GitHub Pages; e2e dùng Playwright chrome local (dev server), không test PWA. |
| Local/offline, no app server | Không thêm backend, HTTP server, fetch runtime; giữ `frontendDist: "../dist"`, `devUrl` chỉ cho dev. |
| AntD UI + wrapper-only (milestone v1.6 override) | Không import trực tiếp AntD ở caller; mọi control đi qua `src/components/ui`. |
| IndexedDB/Dexie canonical | Không đụng `src/db/`, schema, repository trong phase này. |
| Backup import validate + explicit confirm | Không đụng luồng import/backup. |
| Stable UUIDs | Không đụng ID. |
| Không full Vitest | Mọi lệnh test trong plan phải là scoped path, `--bail=1`. |
| Review diff + verify UI in Chrome after every change | Plan nên có bước chạy `e2e/adoption.spec.ts` + scoped tests sau mỗi wave UI. |
| No band-aid fixes — fix at state owner | Theme defect sửa ở `tokens.ts`/wrapper owner, không patch inline ở từng call site. |
| GSD workflow enforcement | Plan artifacts do orchestrator tạo; research chỉ ghi file planning. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Render mọi control native (button, input, table, dialog, icon, empty) | Browser / Client | — | Toàn bộ là React/CSS module/Web API chạy trong webview; wrapper `src/components/ui/` là owner duy nhất. Không có server tier. |
| Theme token light/dark + đổi theme tức thì | Browser / Client | — | `tokens.ts` → `applyCssVariables()` ghi CSS var lên `:root`; CSS var kế thừa và recompute không reload. [CITED: MDN] |
| Cross-window theme sync (4 popout) | Browser / Client | OS/app lifecycle (Tauri IPC) | `themeBroadcast.ts` dùng `emitTo` + Tauri `listen`, fallback `storage` event; chỉ là IPC, không phải server. |
| Persistence / working data | Database / Storage | — | IndexedDB/Dexie — out of scope phase 55, giữ nguyên. |
| Backup/sync encrypted artifact | API / Backend (GitHub Contents) | — | Out of scope; không đụng. |
| Focused smoke verification (5 luồng × light/dark) | Browser / Client | Build tooling | Playwright chrome điều khiển app local; Vitest guard chạy Node. |

**Key insight:** Phase 55 là client-only refactor. Mọi capability ở đây đều thuộc Browser/Client; không có task nào nên chạm DB, API hay build/deploy server. Nếu plan gán task "offline" cho service tier → sai tier.

## Adoption Surface Audit (NAT-03)

### Runtime/value AntD imports — còn lại trong `src` (live grep 2026-11-22)

| File | Import | Loại | Quyết định Phase 55 |
|------|--------|------|---------------------|
| `src/workbench/toolwindows/RemoteGitExplorer.tsx:4-11` | 8 × `@ant-design/icons/{FolderOutlined,FolderOpenOutlined,FileTextOutlined,ReloadOutlined,SearchOutlined,BranchesOutlined,CloudServerOutlined,FolderViewOutlined}` | **runtime value** | **ĐỔI** sang `import { ... } from '../../components/ui'` (barrel đã `export * from './icon'`, file line 2 đã import từ barrel). Tất cả 8 tên tồn tại trong `icon.tsx` — verified. |
| `src/components/ui/empty.tsx:1,8,9,15` | `Empty as AntEmpty` + `AntEmpty.PRESENTED_IMAGE_*` + `<AntEmpty>` | **runtime value** | **CHUYỂN** sang native Empty DOM theo N-11 (`52-UI-SPEC.md:88`): giữ `EmptyProps`, `EmptyImageSimple`, `EmptyImageDefault`, font 13 token, description muted, caller style win. |
| `src/components/ui/antdTheme.ts:5` | `theme as AntTheme` | **runtime value** | **GIỮ** — bridge được 53/54-PATTERNS ghi rõ "gỡ ở Phase 56". `styles/tokens.ts` phụ thuộc `getAntdAlgorithms`. |
| `src/components/analytics/{EstimateVsActualChart,ProductivityHeatmapChart,WorkTypeBreakdownChart}.tsx`, `src/components/analytics/WorkTypeAccuracyCard.tsx` | `Column`, `Heatmap`, `Pie` từ `@ant-design/plots` | runtime value, **package khác** | KHÔNG đụng trong Phase 55 — `@ant-design/plots` không nằm trong danh sách gỡ của CLEAN-01 (`antd`, `@ant-design/icons` only). Xem Open Questions. |
| `src/components/ui/__tests__/*` | fixture strings + `ConfigProvider` | test-only | GIỮ — fixture chứng minh guard hoạt động; Phase 56 xử lý. |

Ngoài bảng trên, **không còn runtime value import của `antd`/`@ant-design/icons` ở bất kỳ caller nào**. [VERIFIED: `grep -rP "^import\s+(?!type)..."` trên toàn `src`]

### Type-only imports — GIỮ cho Phase 56
~41 dòng `import type ... from 'antd'` / `antd/es/*` ngoài `ui/`, cộng 13 `export type` + 22 deep-path trong `ui/`. `51-CONTROL-INVENTORY.md:572-660` ghi rõ hệ quả: "không thay runtime Phase 53/54, bắt buộc thay khi gỡ dependency Phase 56". Đây là lý do compatibility giữ nguyên. [VERIFIED: 51-CONTROL-INVENTORY.md + grep]

Barrel `src/components/ui/index.ts` **đã re-export** hầu hết type caller cần: `MenuProps`, `InputRef`, `TableColumnsType`, `UploadProps`, `UploadFile`, `TreeDataNode`, `DescriptionsProps`, `TabsProps`, `MentionsRef`, `ThemeConfig`, `RangePickerProps`. **Chưa có**: `DataNode` (dùng ở 3 tool window + `AgentDiffReviewer`), `ColumnsType` (6 file analytics/knowledge/settings), `ModalFuncProps` (`documentLinks.tsx`), `TextAreaRef` (`DocEditorPane.tsx`). Nếu plan quyết định dọn type import sớm ở caller, phải thêm alias vào barrel trước — nhưng khuyến nghị dời hết sang Phase 56 theo inventory. [VERIFIED: grep index.ts]

### Caller adoption status
- 39/… file `views/` + `toolwindows/` đã import từ `components/ui` barrel. [VERIFIED: grep]
- 15 route + 22 `viewType` case + 19 tool window đã được liệt kê đầy đủ tại `51-CONTROL-INVENTORY.md §3.2` (`<!-- SURFACE: route -->` markers). Phase 55 KHÔNG cần quét lại từ đầu — dùng inventory làm checklist xác nhận.
- Raw HTML `<button>/<input>/<select>/<textarea>`: 38 occurrence trong views/toolwindows. Cần phân loại khi audit "dead control code": phần lớn là semantic markup nằm trong wrapper hoặc nội dung tĩnh; KHÔNG tự động thay — Chesterton's fence. [VERIFIED: grep]

## Dead Code Audit (NAT-03)

"Không còn code control chết" được hiểu là: không còn wrapper/fake-control/no-op handler bị bỏ rơi sau khi adoption xong.

| Kiểm tra | Kết quả | Hành động |
|----------|---------|-----------|
| Fake wrapper / pass-through `export { Button } from 'antd'` | `coverage.test.ts` guard `isPassThroughWrapper()===[]` — xanh. [VERIFIED: test source + baseline lint/tsc] | Giữ guard, không xóa. |
| `return null` descriptor components (`TreeNode`, `TabPane`, `SplitterPanel`, `AutoCompleteOption`, `MentionsOption`, `TreeSelectNode`) | `54-VERIFICATION.md` xác nhận intentional — props được owner đọc. | GIỮ, không "dọn". |
| `TBD/FIXME/XXX` trong source đã đổi ở R1/R2/R3 Phase 54 | Không có. [VERIFIED: 54-VERIFICATION.md] | — |
| Orphan wrapper file | Không phát hiện file `ui/*.tsx` không được barrel/test tham chiếu trực tiếp. | Thêm guard test nếu muốn khóa (xem §Don't Hand-Roll). |
| `console.warn` react-resizable-panels "Missing resize handle" + PostCSS | 54-VERIFICATION xếp Phase 55/57 debt. Panel group có `WorkbenchResizeHandle` ở 3 vị trí; warn không phải error. | THEO DÕI, không chặn NAT-03. Sửa ở 57 nếu cần. |

**Kết luận:** Không có "dead control code" rõ ràng cần xóa. Phase 55 nên **khóa bằng guard test** (zero runtime AntD import ngoài 2 file sanctioned + zero pass-through) thay vì xóa thủ công.

## Theme & Token Audit (NAT-04)

### Pipeline hiện tại (đã đúng — GIỮ NGUYÊN)
1. `src/styles/tokens.ts` — `sharedTokens`, `lightTokens`, `darkTokens`, `statusColorMap`, `fileStatusMap`, `getAntdTheme(mode)`, `applyCssVariables(mode, target)`. Hex values locked bởi 49/52 UI-SPEC — không "harmonise".
2. `applyCssVariables()` — ghi mọi `tokens.css[*]` lên cả `target` VÀ `document.documentElement`; set `colorScheme`; set `data-theme` trên document root (để vendor CSS `:root[data-theme="..."]` match). [VERIFIED: tokens.ts:355-377]
3. `AntdThemeAdapter` — `useThemeMode()` + `useEffect(applyCssVariables)` + `ThemeConfigProvider` + wrapper `.taskmate-workbench-theme[data-theme]`. [VERIFIED: source]
4. `TitleBar.tsx:311-327` — `IconButton` toggle gọi `toggle()`, aria-label `"Chuyển đổi giao diện sáng/tối"`. Không reload. [VERIFIED: source]
5. `themeBroadcast.ts` — localStorage + Tauri `emitTo` 4 popout + same-window CustomEvent; payload validate qua `isValidThemeModePayload`. [VERIFIED: source + `themeBroadcast.test.ts`]
6. `AppIntelliJ.tsx:86-146` — 5 branch (4 popout + main) đều bọc `AntdThemeAdapter` + `ThemeAppHolder`. Không sót branch. [VERIFIED: source]
7. CSS var kế thừa từ `:root`; `setProperty` runtime recompute mọi `var()` consumer ngay lập tức, không reload. [CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties]

### Theme coupling defects cần sửa ở Phase 55
`~80` hex literal ngoài `tokens.ts`. Phân loại:

| Nhóm | Ví dụ | Đánh giá | Hành động |
|------|-------|----------|-----------|
| Giá trị dữ liệu/export — GIỮ | `src/utils/mermaidExport.ts:42,114` (`#141414`/`#ffffff` có `ponytail:` comment); `SystemTypeOptionsCard.tsx:271` placeholder hex mẫu | Hợp lệ, không phải UI style token | KHÔNG đụng |
| Màu UI tĩnh có dark variant trong token | `GlobalConventionsCard.tsx:98,176` `#3871e1` = `--accent`; `StoragePersistenceCard.tsx:80` `#faad14` fallback | Có sẵn `var(--accent)` / `var(--warning)` | ĐỔI sang CSS var |
| Màu status/state KHÔNG có dark variant | `InlineStatusTag.tsx:26-64` (7 status × bg/color/border), `TaskTable.tsx:51-57`, `TaskDrawerPlanning.tsx:284-301`, `TaskJiraSection.tsx:373-508`, `ChangeRequestTable.tsx:234`, `TargetSystemsSelector.tsx:64-96`, `LinkedKnowledgeSection.tsx:100-102`, `NineRouterConfigCard.tsx:557`, `WeeklyCapacityForm.tsx:82`, `BudgetWarnThresholdCard.tsx:68`, `GitHubConflictModal.tsx:54`, `SystemTypeOptionsCard.tsx:211` | Light-only hex → dark mode vẫn hiện nền sáng/chữ tối = parity defect | Đưa vào `tokens.ts` map theo mode (xem Pattern 1) |
| Splash screen | `AppSplashScreen.tsx` (10 hex) | Gradient cố ý, không đổi theo theme | GIỮ (xác nhận lại trong Phase 57) |

**Nguyên tắc fix:** sửa ở state owner — thêm map vào `tokens.ts` + CSS var, wrapper/view đọc var. KHÔNG patch inline từng call site (memory rule: no band-aid fixes). Không đổi hex đã lock trong lightTokens/darkTokens.

**Ranh giới với Phase 57:** Phase 55 Centralize token + đảm bảo đổi theme ở 5 luồng smoke. Phase 57 mới đo computed style exhaustive + screenshot mọi màn hình. Không nhân đôi công việc sweep ở đây.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tsc/lint/build/vitest | ✓ | (Node 24 LTS per CLAUDE.md) | — |
| npm + npx | scoped tests, lint, build | ✓ | — | — |
| TypeScript compiler | `npx tsc --noEmit` | ✓ | 7.0.2 | — |
| ESLint | `npm run lint` | ✓ | 10.11.0 | — |
| Vitest | focused guard tests | ✓ | 5.0.2 | — |
| Playwright + Chrome channel | `e2e/adoption.spec.ts` | ✓ (config `channel: 'chrome'`) | 1.63.0 | fallback `chromium` bundled nếu Chrome absent — cần xác nhận khi chạy |
| Tauri CLI | `tauri:dev` / manual parity check | ✓ (`@tauri-apps/cli ^2.2.0`) | 2.x | — |
| @tauri-apps/api event | `themeBroadcast.ts` (`emitTo`/`listen`) | ✓ dependency installed | ^2.2.0 | storage event fallback đã có |
| Backend/HTTP server | KHÔNG yêu cầu | N/A | — | — |

Tauri config xác nhận local/static: `src-tauri/tauri.conf.json` — `beforeDevCommand: npm run dev`, `devUrl: http://localhost:5173` (dev only), `frontendDist: "../dist"` (production bundle local). Tauri v2 host frontend tĩnh trong webview, không cần web server ngoài cho runtime desktop. [CITED: https://v2.tauri.app/start/frontend/] Capabilities (`default.json`) chỉ IPC/window/notification — không có `http`/`net` plugin. [VERIFIED: config]

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Chrome channel nếu không có → dùng bundled chromium (cần plan ghi rõ, nhưng `playwright.config.ts` hiện hard-code `channel: 'chrome'`).

## Standard Stack

Phase này **không thêm dependency mới**. Dùng lại stack đã có:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | wrapper rendering | Đã lock bởi CLAUDE.md; không đổi. |
| TypeScript | 7.0.2 | strict typing | `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. |
| CSS custom properties | native | theme token runtime swap | Kế thừa từ `:root`, recompute không reload. [CITED: MDN] |
| Web Crypto | native | unchanged (backup) | Out of scope. |
| @tauri-apps/api | ^2.2.0 | cross-window theme IPC | `emitTo`/`listen` đã dùng; fallback storage event. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/components/ui` barrel | 257 exports | mọi caller import | Thay 8 icon deep-import trong `RemoteGitExplorer.tsx`. |
| `scripts/check-native-imports.mjs` | local CLI | guard runtime import | Chạy trên file adoption đã đổi + toàn bộ src để xác nhận boundary. |
| Vitest | 5.0.2 | scoped guard tests | `test:foundation` + danh sách file của 54-PATTERNS. |
| Playwright | 1.63.0 | focused smoke light/dark | `e2e/adoption.spec.ts` U1..U6. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS var + `tokens.ts` map | `styled-components`/CSS-in-JS theme provider | Thêm dependency, vi phạm "no heavy UI kit" + bundle size. Không dùng. |
| Native icon barrel | giữ deep `@ant-design/icons/*` | Giữ runtime dependency, vi phạm NAT-03. Không dùng. |
| Guard test (Node) | ESLint rule mới | Phase 56 đã có ESLint guard (`allowTypeImports`); Phase 55 dùng test để không đụng config guard của 56. |

**Installation:** không có — phase là source refactor.

**Version verification:** tất cả version ở bảng trên đọc từ `package.json` hiện tại, không cần `npm view` (không cài package mới). [VERIFIED: package.json]

## Package Legitimacy Audit

**Không có package mới được cài đặt ở Phase 55** → Package Legitimacy Gate không áp dụng. Không có package nào bị REMOVED hay flagged SUS trong research này.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | Không có package mới; phase chỉ đổi source imports. |

*Ghi chú: `antd`, `@ant-design/icons`, `@ant-design/plots` đã có trong lockfile từ trước; việc gỡ chúng thuộc CLEAN-01 (Phase 56), không phải Phase 55.*

## Architecture Patterns

### System Architecture Diagram

```
[TitleBar toggle] ──> useThemeMode.toggle()
                          │
             ┌────────────┼──────────────┐
             v            v              v
     setModeState   broadcastThemeMode  (no reload)
                          │
        ┌─────────────────┼──────────────────┐
        v                 v                  v
  localStorage      Tauri emitTo       same-window
  (persist mode)    (4 popouts)        CustomEvent
        │                 │                  │
        └────────> subscribeToThemeBroadcast <┘
                          │
                          v
              AntdThemeAdapter (×5 branches)
                          │
              applyCssVariables(mode, wrapper)
                          │
              ┌───────────┴───────────┐
              v                       v
   document.documentElement     wrapper[data-theme]
   CSS vars + data-theme         local selectors
              │
              v (CSS inheritance, no reload)
   mọi wrapper native (.module.css) + portals trong <body>
              │
              v
   Adoption surfaces (views/toolwindows/CR/notes/AI/settings)
   import từ src/components/ui barrel — KHÔNG import AntD
```

Entry point: toggle trong TitleBar. Processing: theme mode → token object → CSS vars → style recompute. Decision points: `isValidThemeMode` gate, localStorage > OS > light precedence, Tauri vs browser channel. External boundary: Tauri IPC tới 4 popout window. Không có server.

### Recommended Project Structure (chỉ file sẽ đụng)

```
src/
├── components/
│   ├── ui/
│   │   ├── empty.tsx              # đổi sang native Empty (N-11)
│   │   ├── icon.tsx               # GIỮ — đã có 141 icon native
│   │   ├── index.ts               # GIỮ — barrel, KHÔNG đổi export count
│   │   └── __tests__/             # thêm guard test adoption (mới)
│   ├── tasks/InlineStatusTag.tsx  # status colors → token map
│   ├── changeRequests/ChangeRequestTable.tsx
│   └── ...                        # các file theme-coupling ở bảng trên
├── workbench/
│   └── toolwindows/RemoteGitExplorer.tsx  # 8 icon imports → barrel
├── styles/tokens.ts               # thêm status/state color map nếu cần
└── AppIntelliJ.tsx                 # GIỮ — 5 branch đã đúng
```

### Pattern 1: Native Empty wrapper (thay AntEmpty)

**What:** `Empty` render DOM tự build bằng vendor CSS module, giữ `EmptyProps`, `EmptyImageSimple`, `EmptyImageDefault`, font/description token, caller style win.
**When to use:** `src/components/ui/empty.tsx` — wrapper `domain/adoption` cuối cùng còn runtime AntD.
**Example:**
```tsx
// Pattern — source: 52-UI-SPEC.md:88 (N-11), 54 wrapper convention
import type { CSSProperties } from 'react';
import type { EmptyProps as AntEmptyProps } from 'antd'; // type-only, Phase 56 đổi
import { getSharedControlTokens } from './tokens.contract';
// EmptyImageSimple/Default = descriptor nội bộ (không phải AntEmpty.PRESENTED_IMAGE_* runtime)
export function Empty({ style, ...rest }: EmptyProps) {
  const { fontSize } = getSharedControlTokens();
  return (
    <div data-oi-control="empty"
      style={{ '--ui-control-font-size': `${fontSize}px`, ...style } as CSSProperties}>
      {/* illustration + description, description color = var(--fg-muted) */}
    </div>
  );
}
```
Giữ nguyên tên export — `scanWrappers()` = 257 và `findMissingWrappers()===[]` phải xanh.

### Pattern 2: Đổi deep icon import sang barrel

**What:** caller đã import từ barrel ở line 2 — chỉ cần gộp 8 icon vào đó và xóa 8 dòng deep import.
**When to use:** `RemoteGitExplorer.tsx`.
**Example:**
```tsx
// TRƯỚC (line 2 + 4-11)
import { Select, Input, Tree, Button, Tooltip, Tag, Spin, Alert, Empty, EmptyImageSimple, IconButton } from '../../components/ui';
import FolderOutlined from '@ant-design/icons/FolderOutlined'; // ×8
// SAU
import { Select, Input, Tree, Button, Tooltip, Tag, Spin, Alert, Empty, EmptyImageSimple,
  IconButton, FolderOutlined, FolderOpenOutlined, FileTextOutlined, ReloadOutlined,
  SearchOutlined, BranchesOutlined, CloudServerOutlined, FolderViewOutlined } from '../../components/ui';
```
Không đổi usage (`<ReloadOutlined spin={loadingTree} />` vẫn hoạt động — `wrapIcon` nhận props). `spin` prop: kiểm tra `wrapIcon` hỗ trợ; nếu không, dùng class CSS animate — verify trong implementation.

### Pattern 3: Status color về token map (no band-aid)

**What:** thêm map theo `ThemeMode` vào `tokens.ts`, expose CSS var, view đọc var thay vì hex literal.
**When to use:** `InlineStatusTag.STATUS_CONFIG`, `TaskTable` status color, `TaskDrawerPlanning`, `TaskJiraSection`.
**Example:**
```ts
// tokens.ts — cạnh statusColorMap hiện có
export const taskStatusTone = {
  light: { Open: { bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' }, /* ... */ },
  dark:  { Open: { bg: 'var(...)', fg: 'var(...)', border: 'var(...)' }, /* ... */ },
} as const;
```
`InlineStatusTag` đọc qua `useThemeMode()` (đã có pattern trong `status-dot.tsx`: `getStatusTokens(status, mode)`). KHÔNG giữ object `STATUS_CONFIG` hard-code trong component.

### Anti-Patterns to Avoid
- **Sửa theme bằng inline patch ở call site:** tạo nhiều nguồn truth, tài diễn ra Phase 57. Sửa ở `tokens.ts`/wrapper.
- **Xóa type-only AntD import trong Phase 55:** phá vỡ tương thích; thuộc Phase 56 theo inventory.
- **Gỡ dependency `antd` sớm:** `empty.tsx` + `antdTheme.ts` vẫn cần runtime; Phase 56 mới gỡ.
- **Thêm CSS-in-JS / UI kit mới:** vi phạm "no heavy UI kit" + tăng bundle.
- **Chạy full Vitest:** vi phạm rule dự án (hơn 1 giờ). Luôn scoped path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme var propagation | custom event system mới | `themeBroadcast.ts` + `useThemeMode` + `applyCssVariables` | Đã xử lý Tauri IPC, storage, same-window, validation, 5 branch. |
| Icon set | tự vẽ SVG mới cho 8 icon | `src/components/ui/icon.tsx` (`wrapIcon`) | 141 icon native đã có, đúng 16px, metrics token. |
| Import guard | script regex mới | `scripts/check-native-imports.mjs` + `coverage.test.ts` + ESLint `no-restricted-imports` | Đã selftest cả 2 chiều exit code. |
| Wrapper coverage audit | đếm file thủ công | `scanWrappers()=257`, `findMissingWrappers()===[]` | Guard tự động, chạy <1s. |
| Smoke test 5 luồng | viết spec mới từ đầu | `e2e/adoption.spec.ts` U1..U6 | Đã phủ quick-add/settings/CR detail/modal form/AI chat + `assertParity` light/dark. |
| Focus trap/popup | helper mới | `native/dialog.tsx`, `native/popup.tsx` | Đã verified Phase 54 (8/8 truths). |

**Key insight:** phase này ngắn — giá trị nằm ở việc **không viết lại cái đã đúng**. Mọi helper đã tồn tại; chỉ cần đổi import, đổi màu, chạy guard.

## Common Pitfalls

### Pitfall 1: Nhầm type-only import với runtime import
**What goes wrong:** thấy 145 grep match → tưởng Phase 55 phải đổi hết 97 file, kéo vào Phase 56 và gãy tương thích.
**Why it happens:** grep thường không phân biệt `import type` (bị TS erase) và `import { X }` (runtime).
**How to avoid:** dùng `grep -rP "^import\s+(?!type)..."` hoặc `scripts/check-native-imports.mjs`. Runtime value ngoài ui/ chỉ có `RemoteGitExplorer.tsx`.
**Warning signs:** plan liệt kê "di chuyển 31 type imports" cho Phase 55 → sai scope.

### Pitfall 2: `@ant-design/plots` bị coi là AntD cần gỡ
**What goes wrong:** xóa 4 chart import → build fail, vượt CLEAN-01 scope.
**Why it happens:** cùng prefix `@ant-design/`.
**How to avoid:** CLEAN-01 chỉ liệt kê `antd` + `@ant-design/icons`; plots là chart package, giữ lại. Xem Open Questions.
**Warning signs:** plan chạm `src/components/analytics/*Chart.tsx` với lý do "remove AntD".

### Pitfall 3: Theme defect sửa ở call site
**What goes wrong:** thêm `mode==='dark' ? darkHex : lightHex` inline trong 10 component → 10 nguồn truth, lệch Phase 57.
**How to avoid:** map tập trung trong `tokens.ts` + CSS var; view đọc var/helper như `status-dot.tsx`.
**Warning signs:** diff có ternary màu trong JSX thay vì `var(--...)`.

### Pitfall 4: @property chặn inheritance
**What goes wrong:** CSS var không cập nhật dù đã `setProperty` trên `:root`.
**Why it happens:** custom property khai báo bằng `@property` với `inherits: false` thì không kế thừa. [CITED: MDN]
**How to avoid:** giữ khai báo dạng `--*` thường; không thêm `@property inherits:false` cho token.
**Warning signs:** một control không đổi màu sau toggle dù control khác đổi.

### Pitfall 5: Popout không nhận theme mới
**What goes wrong:** toggle ở main, popout vẫn theme cũ.
**How to avoid:** đảm bảo `themeBroadcast.ts` emitTo tới đủ 4 label; mọi popout branch bọc `AntdThemeAdapter` (đã đúng — regression check).
**Warning signs:** e2e chỉ test main window; thêm assert popup (Phase 57 có thể phủ sâu hơn).

### Pitfall 6: Chạy full Vitest suite
**What goes wrong:** >1 giờ, vi phạm rule.
**How to avoid:** luôn scoped path + `--bail=1`.
**Warning signs:** lệnh `npm test` / `vitest run` không có path list.

### Pitfall 7: console.warn bị nhầm console.error gate
**What goes wrong:** e2e `assertClean` bắt warn → fail không cần thiết.
**How to avoid:** 54-VERIFICATION ghi rõ `console.warn` từ react-resizable-panels + PostCSS nằm ngoài error gate; giữ nguyên, track Phase 57.
**Warning signs:** plan thêm task "fix console.warn" trong Phase 55.

## Code Examples

Verified patterns từ codebase + official docs:

### Theme runtime swap (đã hoạt động — giữ nguyên)
```tsx
// Source: src/workbench/AntdThemeAdapter.tsx + src/styles/tokens.ts
useEffect(() => {
  if (wrapperRef.current) applyCssVariables(mode, wrapperRef.current);
}, [mode]);
// applyCssVariables writes both target and document.documentElement,
// sets colorScheme + data-theme — portals in <body> inherit the same vars.
```

### CSS var inheritance (authoritative)
```css
/* Source: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties */
:root { --main-bg-color: teal; }
.foo { background-color: var(--main-bg-color); }
```
```js
document.documentElement.style.setProperty('--main-bg-color', 'purple');
// .foo recomputes immediately; no reload.
```

### Theme hook precedence + cross-window
```ts
// Source: src/hooks/useThemeMode.ts + src/workbench/themeBroadcast.ts
// localStorage > OS preference > light; every mounted consumer subscribes
// to broadcasts and re-renders without reload.
const setMode = (next: ThemeMode) => {
  if (!isValidThemeMode(next)) return;
  setModeState(next);
  broadcastThemeMode(next); // CustomEvent (same window) + emitTo (Tauri popouts) + localStorage
};
```

### Native import guard invocation (Phase 55 gate)
```bash
# Source: scripts/check-native-imports.mjs (Phase 54)
node scripts/check-native-imports.mjs <files-changed>
# Rejects runtime antd/@ant-design/icons imports; allows fully type-only clauses.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AntD runtime components | 56 native wrappers (Phase 53/54) | 2026-11-21/22 | Caller API unchanged; 141 native icons; type-only aliases remain. |
| Runtime `AntTheme.useToken()` | `getDesignToken(getAntdTheme(mode))` | Phase 54 (54-06) | `useAntdToken` không cần provider AntD còn tồn tại. |
| AntD `ConfigProvider` theme | `ThemeConfigProvider` native + CSS vars | Phase 54 | Theme swap tức thì, không reload. |
| Static `message.*` / `Modal.confirm` | `useMessage()` / `useNotification()` / `useTaskMateModal()` bound receiver | Phase 50 | `staticApiGuard.test.ts` xanh; 86 file dùng cú pháp context-bound. |
| Deep `@ant-design/icons/*` import | barrel `src/components/ui/icon` | Phase 53 | RemoteGitExplorer là surfaces sót lại — Phase 55 đóng. |

**Deprecated/outdated:**
- `AntEmpty.PRESENTED_IMAGE_*` runtime — thay bằng descriptor nội bộ ở Phase 55.
- `theme as AntTheme` runtime bridge — Phase 56 mới gỡ; giữ tới đó.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Không còn import AntD trực tiếp trong src" của NAT-03 được hiểu là **runtime value import ở adoption surfaces**, không phải type-only alias (được 51 inventory dời sang 56). | Adoption Surface Audit, Open Questions | Nếu hiểu literal, plan phải dọn cả 41 type import + 13 export type + 22 deep-path → chồng lấn Phase 56, có thể gãy tương thích. Cần sếp/orchestrator chốt. |
| A2 | `@ant-design/plots` không thuộc diện "AntD import" cần dỡ ở Phase 55/56 (CLEAN-01 chỉ liệt kê `antd`, `@ant-design/icons`). | Adoption Surface Audit, Pitfall 2 | Nếu nhầm, 4 chart file build fail sau Phase 56. |
| A3 | `spin` prop trên `<ReloadOutlined spin={loadingTree}>` được `wrapIcon` xử lý (hoặc cần class animate tương đương). | Pattern 2 | Icon không xoay khi loading → defect nhỏ, Phase 57 bắt. Verify trong implementation. |
| A4 | Các hex literal trong `AppSplashScreen.tsx` là cố ý, không đổi theo theme. | Theme Coupling Defects | Splash lệch dark — Phase 57 xác nhận. |

## Open Questions

1. **Ranh giới NAT-03 vs CLEAN-01 (quan trọng nhất)**
   - What we know: NAT-03 nói "không còn import AntD trực tiếp trong src"; nhưng `51-CONTROL-INVENTORY.md` dời type-only/deep/export-type sang Phase 56; context giao việc cũng nói "AntD still remains in some files targeted for Phase 56; do not remove dependency yet".
   - What's unclear: Phase 55 có phải xóa **cả** type-only import không, hay chỉ runtime value import.
   - Recommendation: **chỉ xóa runtime value import ở adoption surfaces** (RemoteGitExplorer icons + Empty wrapper). Giữ type-only + antdTheme bridge cho 56. Ghi rõ ranh giới này vào PLAN để plan-checker không bắt chéo.

2. **`console.warn` react-resizable-panels có nằm trong scope Phase 55 không?**
   - What we know: 54-VERIFICATION xếp Phase 55/57 debt; không phải console error.
   - What's unclear: sửa ở 55 hay để 57.
   - Recommendation: để Phase 57 (visual sweep) — không chặn NAT-03/NAT-04, tránh mở rộng diff.

3. **Có cần guard test "zero runtime AntD import ngoài 2 file sanctioned" ngay ở 55 không?**
   - What we know: ESLint guard đã có nhưng cho phép type-import + override ui/.
   - Recommendation: có — thêm 1 test nhỏ (Node, không framework mới) liệt kê sanctioned = [`antdTheme.ts`, `empty.tsx` (trước khi đổi), test fixtures]. Sau khi đổi Empty, sanctioned chỉ còn `antdTheme.ts`. Đây là bằng chứng NAT-03 không regression.

## Validation Architecture

> `workflow.nyquist_validation: true` trong config → section bắt buộc.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (unit/guard) + Playwright 1.63.0 (focused smoke, chrome channel) |
| Config file | `playwright.config.ts` (webServer dev 127.0.0.1:5173, baseURL `/task-management/`); Vitest config: xem `vite.config.ts`/`vitest.config.*` nếu có — dùng scoped CLI |
| Quick run command | `npx vitest run src/components/ui/__tests__/antdInventory.test.ts src/components/ui/__tests__/coverage.test.ts src/components/ui/__tests__/staticApiGuard.test.ts src/components/ui/__tests__/guardConfig.test.ts src/components/ui/__tests__/uiTokens.test.ts src/components/ui/__tests__/tokens.test.ts --bail=1` |
| Full suite command | **KHÔNG CHẠY** (rule dự án: >1 giờ). Thay bằng scoped + e2e. |
| Smoke command | `npx playwright test e2e/adoption.spec.ts --project=chromium --reporter=list` |
| Gates | `npx tsc --noEmit`, `npm run lint`, `npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| NAT-03 | Zero runtime AntD import ở adoption surfaces; barrel icon đủ 8 tên | guard (Node/Vitest) | `node scripts/check-native-imports.mjs <changed-files>` + scoped `antdInventory.test.ts coverage.test.ts` | ✅ guard/tests có; ❌ test "zero runtime outside sanctioned" cần thêm (Wave 0) |
| NAT-03 | Empty wrapper native, 257 exports không đổi | unit | `npx vitest run src/components/ui/__tests__/coverage.test.ts src/components/ui/__tests__/antdInventory.test.ts --bail=1` | ✅ có (assert tự động) |
| NAT-03 | 5 luồng smoke quick-add/settings/CR detail/modal form/AI chat | e2e chrome | `npx playwright test e2e/adoption.spec.ts --project=chromium --reporter=list` | ✅ `adoption.spec.ts` U1..U6 |
| NAT-04 | Đổi theme không reload, `--accent` đổi, `--font-size-ui`/`--radius-control` giữ nguyên | e2e chrome | `adoption.spec.ts::assertParity` (mọi U1..U6 gọi) | ✅ có |
| NAT-04 | Token map light/dark đúng hex lock | unit | `npx vitest run src/components/ui/__tests__/tokens.test.ts src/components/ui/__tests__/uiTokens.test.ts --bail=1` | ✅ có |
| NAT-04 | Cross-window broadcast validate payload | unit | `npx vitest run src/hooks/__tests__/themeBroadcast.test.ts --bail=1` | ✅ có |
| NAT-04 | App local/offline Tauri, không server | config assert | `grep -q 'frontendDist' src-tauri/tauri.conf.json` (không cần test riêng) | ✅ config có |

### Sampling Rate
- **Per task commit:** scoped Vitest list ở trên + `npx tsc --noEmit` + `npm run lint`.
- **Per wave merge:** scoped full list + `npx playwright test e2e/adoption.spec.ts --project=chromium` (light+dark).
- **Phase gate:** `tsc --noEmit` + `npm run lint` + `npm run build` + scoped tests + adoption e2e — tất cả xanh trước `/gsd-verify-work`. **Không full Vitest.**

### Wave 0 Gaps
- [ ] `src/components/ui/__tests__/adoptionGuard.test.ts` (hoặc thêm test vào `guardConfig.test.ts`) — assert zero runtime `antd`/`@ant-design/icons` value import ngoài sanctioned list (hiện tại: `antdTheme.ts` + test fixtures). Covers NAT-03.
- [ ] Xác nhận `wrapIcon` xử lý `spin` prop cho `ReloadOutlined` — nếu không, thêm CSS animate class (covers NAT-03 icon parity).
- [ ] Nếu Chrome channel absent: thêm fallback `chromium` trong `playwright.config.ts` hoặc cài Chrome — plan ghi rõ. (covers smoke gate)
- [ ] Các file theme-coupling (InlineStatusTag, TaskTable, TaskDrawerPlanning, TaskJiraSection, ChangeRequestTable, TargetSystemsSelector, v.v.) — mỗi file có task đổi hex → `var(--...)`/token map. Covers NAT-04.
- [ ] Baseline chạy sạch: `npx tsc --noEmit` + `npm run lint` — **VERIFIED xanh trong research này**; `npm run build` chưa chạy lại ở research này (54-VERIFICATION ghi xanh trước đó) → plan nên chạy lại ở wave đầu.

*(Không có gap test framework — Vitest/Playwright đã cài sẵn.)*

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1` → section bắt buộc.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Không có auth surface trong phase; GitHub token chỉ nhập runtime ở luồng backup (out of scope). |
| V3 Session Management | no | Không đụng session. |
| V4 Access Control | no | Single-user, không role system. |
| V5 Input Validation | yes (gián tiếp) | `isValidThemeMode`/`isValidThemeModePayload` validate mọi payload IPC/storage trước khi vào state — GIỮ NGUYÊN, không nới gate. [VERIFIED: themeBroadcast.ts] |
| V6 Cryptography | no | Không đụng Web Crypto/backup encryption. |

### Known Threat Patterns for {React/Tauri/CSS-var stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered theme payload qua localStorage / Tauri IPC | Tampering | Enum gate `isValidThemeModePayload` — null/string/extra key/bad enum bị bỏ. Không đổi. |
| CSS var injection qua inline style | Tampering | `applyCssVariables` chỉ ghi value từ token object có kiểu enum, KHÔNG ghi raw stored string. Giữ nguyên pattern. |
| Popout giả gửi theme event | Spoofing | `listen` chỉ nhận event từ Tauri app; payload vẫn validate. Không mở rộng.
| Cross-origin theme storage read | Information disclosure | Theme mode là enum vô hại; localStorage origin-scoped. Không đụng.

**Không có security blocker.** Phase 55 không thêm input/server/crypto surface.

## Sources

### Primary (HIGH confidence)
- Codebase live audit (grep/read) — `src/`, `tokens.ts`, `themeBroadcast.ts`, `AppIntelliJ.tsx`, `eslint.config.mjs`, `scripts/check-native-imports.mjs`, `package.json`, `tsconfig.json`, `src-tauri/tauri.conf.json`. [VERIFIED: codebase grep]
- `.planning/phases/51-*/51-CONTROL-INVENTORY.md` — inventory 56 wrapper, 31 type-import, 139 surface lines, deferral sang Phase 56.
- `.planning/phases/52-*/52-UI-SPEC.md` — N-11 empty, token contract, migration order (§387).
- `.planning/phases/54-*/54-VERIFICATION.md`, `54-PATTERNS.md`, `54-REVIEW-R3*.md` — 8/8 truths, guard file list, debt transfer.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` Phase 55, `CLAUDE.md`.

### Secondary (MEDIUM confidence)
- [MDN — Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) — inheritance từ `:root`, runtime `setProperty` recompute không reload, caveat `@property inherits:false`. Cached digest key `02b642f5…`.
- [Tauri v2 — Frontend](https://v2.tauri.app/start/frontend/) — static webview host, no server-side rendering; corroborated by local `tauri.conf.json` (`frontendDist`). Cached digest key `400b2d97…`.

### Tertiary (LOW confidence)
- [ASSUMED] A1..A4 trong Assumptions Log — cần confirm trước khi lock decision.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — không thêm package; mọi version đọc từ `package.json` hiện tại.
- Architecture: HIGH — 5 branch, theme pipeline, barrel, guard đều verify bằng source/grep trong session này.
- Adoption audit: HIGH — runtime vs type-only phân biệt bằng PCRE grep + guard CLI chạy trực tiếp.
- Theme defects: MEDIUM — danh sách hex literal verify bằng grep, nhưng mức độ "defect" cần Chrome light/dark xác nhận (Phase 57).
- Pitfalls: MEDIUM-HIGH — từ kinh nghiệm 53/54 review + inventory; phần Chrome-specific để 57.
- Scope boundary: LOW — Open Question 1 chưa chốt; planner nên ghi rõ ranh giới 55/56.

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (30 ngày — stack ổn định; nhưng audit source tree thay đổi nhanh khi phase khác merge, nên refresh nếu codebase lệch quá 1 tuần).
