<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Chia công việc theo **bề mặt**, không theo loại control: (1) tasks/planner, (2) settings, (3) CR/notes, (4) AI Office/chat, (5) tool windows + các file shell còn lại. Lý do: khớp 6 luồng UAT của ADOPT-03; mỗi sóng kiểm được luồng tương ứng.
- **D-02:** Một sóng chỉ coi là xong khi `tsc --noEmit`, Vitest liên quan, và lint trên các file đã migrate xanh. `eslint src` toàn app chỉ kỳ vọng xanh sau sóng cuối. Không chờ lint toàn app xanh từng sóng (hiện có 404 lỗi import ở 239 file).
- **D-03:** Khi wrapper thiếu prop chuyên sâu (column render, `Form.Item` namePath, tree props, v.v.), **mở rộng wrapper** trong `src/components/ui/` kèm test. Cấm import runtime `antd`/`@ant-design/icons` tại view để giải quyết tạm. `import type` vẫn được phép theo D-19 Phase 49.
- **D-04:** Migration giữ nguyên behavior; chỉ sửa tối thiểu phần import/props cần thiết. Mọi khác biệt hành vi (kể cả hệ quả của chuẩn hóa style) phải ghi rõ trong plan/phase doc để UAT kiểm chứng.
- **D-05:** Chuyển **toàn bộ** 633 call site (`message.*` ~603, `Modal.confirm` 30) sang API context: `useMessage()`, `useNotification()`, `useTaskMateModal()`; mount `ThemeAppHolder` đúng một lần tại shell root. Không giữ API tĩnh, không wrapper tĩnh, không ngoại lệ theo vùng — `49-UI-SPEC.md` đã cấm.
- **D-06:** File không phải React component (service/util/async callback) muốn thông báo thì **nhận callback `notify` được truyền từ view**. Cấm biến AntD thành singleton/bridge module toàn cục.
- **D-07:** Thêm guard (lint/test) chặn tái diễn API tĩnh `message.*`/`notification.*`/`Modal.confirm` ngoài `src/components/ui/`.
- **D-08:** Chỉ thay thế giá trị inline **trùng token** (màu/font/size/spacing/radius) bằng CSS var/class hoặc token hook. Giữ inline cho giá trị thực sự động theo data/state (width %, transform, vị trí tính toán). Không dọn toàn bộ 3.646 chỗ `style={{` một cách cơ học.
- **D-09:** Giá trị "gần token" nhưng lệch (`fontSize: 11`, `borderRadius: 6`, `#1677ff`, `#4f46e5`, `#8c8c8c`,...) chuẩn hóa về token gần nhất theo scale `49-UI-SPEC.md` (13px/12px, radius 4, accent token); ghi rõ chỗ đổi value trong plan. Không mở rộng bảng token phase 49.
- **D-10:** Ngoại lệ inline style được phép chỉ cho giá trị động/đặc thù, kèm comment giải thích; phải nằm trong danh sách được review. Test chặn token-valued inline style còn sót. D-11 Phase 49 được áp dụng đúng nghĩa: "giữ lại kèm comment" không phải là cái cớ để giữ hardcode trùng token.
- **D-11:** Nâng script `lint` thành `eslint src` và xóa `lint:adoption` (đúng `IN-01` trong `eslint.config.mjs`). Giữ `test:foundation` làm tập con; `npm run build` đã gồm `tsc --noEmit`. Không dùng GitHub Actions CI.
- **D-12:** UAT bằng **Chrome DevTools tay + Playwright smoke**: sếp mở app thật, chuyển light/dark, đi 6 luồng (task quick-add, settings CRUD, CR detail actions, modal forms, toolbar icon buttons, AI chat controls); thêm spec Playwright chạy được lặp lại cho smoke. Phải quan sát focus, keyboard nav và accessible name — không chỉ đọc code hay tin build xanh.
- **D-13:** Ghi bằng chứng vào `.planning/phases/50-full-app-adoption/50-UAT.md`: 6 luồng × 2 theme, trạng thái focus/keyboard/aria, lỗi phát hiện và cách sửa. Không commit screenshot lớn vào repo; đính kèm tham chiếu ảnh nếu cần review.

### Claude's Discretion
- Thứ tự plan trong mỗi sóng và chi tiết kỹ thuật chuyển import/props, miễn giữ D-01..D-04.
- Cách mount `ThemeAppHolder` và truyền callback notify cụ thể, miễn chỉ mount một lần và không dùng global singleton.
- Chi tiết chuyển inline sang CSS var hay token hook, miễn một nguồn token và có test chặn hardcode.
- Phạm vi file của mỗi plan, miễn đủ 5 sóng bề mặt và cuối phase `eslint src` xanh.

### Deferred Ideas (OUT OF SCOPE)
- Visual regression suite / snapshot toàn app — nằm trong Future Requirements của REQUIREMENTS.md, không làm trong phase này.
- Theme editor cho phép user đổi accent — Future Requirements, phase sau.
- Viết rule ESLint tự động chặn token-valued inline style — Considered nhưng không chọn (D-11); nếu sau này tái diễn hardcode, cân nhắc rule chuyên biệt khi đó.
- Commit screenshot light/dark vào repo — Considered nhưng không chọn (D-13); dùng file UAT + tham chiếu ảnh thay thế.

## Project Constraints (from CLAUDE.md)
- **Ngôn ngữ:** Mọi thảo luận/trao đổi bằng tiếng Việt; xưng "sếp"; mã nguồn, tên định danh, đường dẫn, lệnh, thuật ngữ kỹ thuật, trích đoạn code giữ nguyên hình thức gốc.
- **Runtime:** Tauri là runtime duy nhất được hỗ trợ cho current work. Không thêm/debug/validate PWA hoặc GitHub Pages behavior trừ khi được yêu cầu rõ.
- **UI:** Ant Design, interactions đơn giản/nhanh/responsive/accessible.
- **Persistence:** IndexedDB là working data store; Dexie wrapper; UUID native `crypto.randomUUID()`; ngày lưu `YYYY-MM-DD`.
- **Data safety:** Backup import validate format, không thay dữ liệu local khi chưa xác nhận. Secrets ở client-side, không đưa vào `.env`/bundle.
- **Anti-read-loop:** Đọc 1 lần phạm vi rộng, không re-read cùng file/đoạn; single read before edit.
- **GSD enforcement:** Dùng `/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`; không edit trực tiếp ngoài GSD workflow.
- **Review & verify:** Review diff + verify UI trên Chrome sau mỗi thay đổi.
- **Test scope:** Không chạy full Vitest suite (trên 1 giờ); luôn pass scoped paths.
- **Architecture:** Chưa map — follow existing patterns trong codebase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADOPT-01 | Mọi màn hình, tool window, settings, CR, notes, AI Office và modal dùng wrapper thay vì AntD trực tiếp | §Codebase Inventory: 239 file import trực tiếp, 615 call site API tĩnh; §Architecture Patterns: wrapper-only migration, `ThemeAppHolder` mount, notify callback; §Common Pitfalls: prop gaps, WR-03/WR-04 regression |
| ADOPT-02 | Không còn style inline lặp giá trị token trong view đã migrate | §Codebase Inventory: 3.684 `style={{`, phân bố token-value; §Pattern 3: inline→CSS var/token hook; §Common Pitfalls: dynamic vs token-valued |
| ADOPT-03 | UAT Chrome light+dark 6 luồng, quan sát được | §Environment Availability: Chrome 157 + Playwright; §UAT Flow Map; §Validation Architecture: Playwright smoke spec mới |
| ADOPT-04 | `tsc --noEmit`, lint, focused Vitest, build xanh | §Gate Commands (đã chạy baseline); §Validation Architecture: test map + Wave 0 gaps (guardConfig.test.ts phụ thuộc `lint:adoption`) |
</phase_requirements>

# Phase 50: Full App Adoption - Research

**Researched:** 2026-11-21
**Domain:** Mass UI migration — AntD runtime import → TaskMate wrapper, static API → React context hooks, token-valued inline style → CSS vars, Chrome light/dark parity UAT (Tauri desktop app)
**Confidence:** HIGH cho inventory codebase và gate commands (đo trực tiếp session này); MEDIUM cho chi tiết migration pattern từ official docs

## Summary

Phase 50 là adoption hàng loạt, không phải thiết kế mới. Phase 49 đã xây xong nền: 51 wrapper trong `src/components/ui/`, barrel `index.ts`, `icon.tsx` (144 icon), `message.tsx` (`useMessage` + `ThemeAppHolder`), `modal.tsx` (`useTaskMateModal`), `notification.tsx`, một nguồn token `src/styles/tokens.ts`, guard ESLint `no-restricted-imports`, và focused test. Phase 50 chỉ đưa mọi bề mặt hiện hữu qua lớp đó, dọn inline style trùng token, chuyển API tĩnh sang hook, rồi chứng minh bằng UAT Chrome + gates xanh. `[VERIFIED: codebase grep]`

Đo trực tiếp codebase ngày 2026-11-21: **239 file** ngoài `src/components/ui/` import runtime `antd` (234) hoặc `@ant-design/icons` (165, union 239); **615 call site** API tĩnh trong 101 file (CONTEXT ghi 633 — lệch 18, xem §Open Questions); **3.684** chỗ `style={{`; **80 file** gọi `theme.useToken()` inline. `ThemeAppHolder` **chưa được mount ở bất kỳ đâu** — đây là gap bắt buộc phải lấp trước khi dùng hook. `npx tsc --noEmit` và `npm run lint` scoped đã xanh baseline; `npm run build` = `tsc && vite build`. `[VERIFIED: codebase grep]`

Rủi ro lớn nhất không phải số lượng file mà là: (1) hook context chỉ hoạt động sau khi mount holder đúng một lần tại shell root; (2) 6 file `.ts` phi-React gọi API tĩnh cần cơ chế `notify` callback (D-06); (3) `guardConfig.test.ts:13` assert `lint:adoption` tồn tại — D-11 xóa script này thì test vỡ, phải sửa test cùng plan; (4) wrapper có lịch sử regression (WR-03 Button ghi đè props caller, WR-04 mất `mask={false}`) đã fix ở Phase 49 nhưng dễ tái phát khi migration. `[VERIFIED: codebase grep]`

**Primary recommendation:** Thực hiện đúng 5 sóng bề mặt theo D-01, mỗi sóng: mount/kiểm tra holder → đổi import sang barrel → chuyển static API sang hook → chỉ dọn inline trùng token → chạy gate scoped; sóng cuối nâng `lint` thành `eslint src`, sửa `guardConfig.test.ts`, thêm guard static API + spec Playwright 6 luồng, rồi viết `50-UAT.md`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Wrapper-only import (ADOPT-01) | Browser / Client (view layer) | UI wrapper layer (`src/components/ui/`) | View chỉ đổi import; policy/token nằm ở wrapper. Không có server tier trong app Tauri local. |
| Static API → context hook (ADOPT-01/03) | Browser / Client (React context at shell root) | UI wrapper layer | `ThemeAppHolder` mount tại `AppIntelliJ` root; mọi `useMessage/useNotification/useTaskMateModal` kế thừa `ConfigProvider`. |
| Token-valued inline style cleanup (ADOPT-02) | Browser / Client (CSS vars + `ConfigProvider`) | Token source (`src/styles/tokens.ts`) | Màu/font/size lấy từ một nguồn; giá trị động giữ inline tại view. |
| Notify callback cho file phi-React (D-06) | Browser / Client (view owns callback) | Service/util (nhận callback) | View gọi service, truyền `notify`; không tạo singleton/bridge global. |
| Light/dark parity + accessibility UAT (ADOPT-03/04) | Build/test tier (Playwright/Chromium) | Browser / Client (computed style, focus) | Quan sát trên Chrome thật; không suy diễn từ code/build. |
| Gate commands (ADOPT-04) | Build/test tier | — | `tsc`, `eslint src`, focused Vitest, `vite build` — chạy local, không GitHub Actions (D-11). |

## Standard Stack

Không thêm dependency mới ở Phase 50. Stack dưới đây đã có trong `package.json`, dùng cho migration + verification. `[VERIFIED: codebase grep/package.json]`

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI runtime | Fixed bởi stack; hooks context (`useApp`) là cơ chế thay API tĩnh. |
| Ant Design | 6.6.5 | Component system | `ConfigProvider` + `App` (`useApp()`) — nguồn message/notification/modal có context. `[CITED: https://ant.design/components/app]` |
| @ant-design/icons | 6.3.4 | Icon set | Chỉ qua `src/components/ui/icon.tsx` (144 icon). |
| TypeScript | 7.0.2 | Type safety | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. |
| Vite | 8.3.1 | Dev server/build | `base: '/task-management/'` (web) hoặc `'/'` (Tauri env). |
| ESLint | 10.11.0 | Import guard | Flat config, Babel parser; `no-restricted-imports` + `allowTypeImports: true`. `[CITED: https://eslint.org/docs/latest/rules/no-restricted-imports]` |
| Vitest | 5.0.2 | Focused unit test | `vite.config.ts` test block, jsdom, `tests/setup.ts`. |
| Playwright | 1.63.0 | UAT smoke | `playwright.config.ts`, chromium channel `chrome`, webServer Vite. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dexie / dexie-react-hooks | 4.4.6 / 4.4.0 | IndexedDB | Không đụng trong phase này (data layer giữ nguyên). |
| dayjs | 1.11.23 | Date | Không đụng; giữ copy/behavior. |
| fake-indexeddb | 6.2.5 | Test shim | `tests/setup.ts` đã có. |
| @testing-library/react | 16.3.3 | Component test | Dùng cho test mở rộng wrapper prop (D-03). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hook context (`useMessage`...) | Giữ API tĩnh `message.*` | Tĩnh không kế thừa `ConfigProvider` theme — parity light/dark hỏng. Đã bị `49-UI-SPEC` cấm. `[CITED: https://ant.design/components/app]` |
| Mở rộng wrapper (D-03) | Import runtime `antd` tại view | Ngắn hạn nhanh nhưng phá guard, tạo điểm cấu hình thứ hai. Bị cấm. |
| CSS var / token class | Dọn cơ học 3.646 `style={{` | Dọn cơ học làm mất giá trị động (width %, transform) và gây regression. |
| Test sweep (D-10) | ESLint rule chặn token inline | Đã defer trong CONTEXT; không làm. |

**Installation:** Không có. Phase này không cài package mới.

**Version verification:** `npm view` trả về newer patch (`antd 6.7.1`, `eslint 10.15.0`, `@playwright/test 1.65.1`, `vitest 5.1.1`) so với `package.json` đang pin. `[VERIFIED: npm registry]` Không nâng version trong phase adoption — giữ lock hiện tại, chỉ migrate code.

## Package Legitimacy Audit

Phase 50 **không cài package mới** — audit chỉ để xác nhận dependency hiện hữu không có rủi ro mới.

| Package | Registry | Age/Published | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| antd | npm | 2026-11-16 | 5.55M/wk | github.com/ant-design/ant-design | SUS (too-new) | Approved — đã pin 6.6.5, vetted Phase 49 |
| @ant-design/icons | npm | 2026-08-31 | 6.69M/wk | github.com/ant-design/ant-design-icons | OK | Approved |
| eslint | npm | 2026-11-13 | 216M/wk | github.com/eslint/eslint | SUS (too-new) | Approved — đã pin 10.11.0 |
| @playwright/test | npm | 2026-11-13 | 138M/wk | github.com/microsoft/playwright | SUS (too-new) | Approved — đã pin 1.63.0 |

`[VERIFIED: npm registry]` Tất cả SUS chỉ do tiêu chí "too-new", có source repo + downloads lớn, không có postinstall đáng ngờ (`postinstall: null`). Đây là dependency đã có từ Phase 49; 50-UI-SPEC ghi "4 package SUS đã verify ở Phase 49". Không package nào bị REMOVED. Không cần `checkpoint:human-verify` cho cài đặt vì không cài gì mới.

## Architecture Patterns

### System Architecture Diagram

```
[Shell root: AppIntelliJ.tsx]
        |
        +-- AntdThemeAdapter (ConfigProvider + applyCssVariables)
        |       +-- inject token vars onto document.documentElement (portals)
        |
        +-- ThemeAppHolder  <-- MOUNT ONCE HERE (gap: chưa mount)
        |       +-- AntApp: message / notification / modal from context
        |
        +-- Providers (Knowledge/FormGuard/GitHubAuth/Timer/AIChat)
        |
        +-- WorkbenchLayout
                |
                +-- [5 surfaces] tasks/planner | settings | CR/notes | AI/chat | toolwindows
                |       +-- import from src/components/ui/ (barrel)  <-- ADOPT-01
                |       +-- useMessage() / useNotification() / useTaskMateModal()  <-- ADOPT-01/03
                |       +-- notify callback --> service/util (non-React)  <-- D-06
                |       +-- CSS var / token; inline chỉ cho giá trị động  <-- ADOPT-02
                |
                +-- portaled overlays (Modal/Drawer/Dropdown) --> <body> inherits vars from documentElement

[Gates: tsc --noEmit | eslint src | test:foundation | vite build]  <-- ADOPT-04
[UAT: Chrome 157 manual + Playwright smoke x 6 flows x light/dark] +--> 50-UAT.md  <-- ADOPT-03
```

### Recommended Project Structure

Không tạo folder mới. Cấu trúc hiện tại đã đúng; chỉ sửa trong place:

```
src/
├── components/ui/          # 51 wrapper + index.ts + icon.tsx + message/modal/notification + tokens.contract.ts
│   └── __tests__/          # mở rộng: static API guard, inline-style sweep
├── components/{tasks,settings,changeRequests,notes,ai,planner,common,...}/  # 5 sóng migrate tại đây
├── workbench/toolwindows/  # sóng 5
├── workbench/AntdThemeAdapter.tsx
├── AppIntelliJ.tsx         # mount ThemeAppHolder đúng 1 lần
├── styles/tokens.ts        # nguồn token duy nhất — KHÔNG đổi bảng (D-09)
└── hooks/useThemeMode.ts   # parity light/dark
e2e/                        # thêm spec smoke 6 luồng
.planning/phases/50-full-app-adoption/50-UAT.md   # bằng chứng UAT
```

### Pattern 1: Mount holder + chuyển static API sang hook

**What:** `ThemeAppHolder` (đã có trong `message.tsx`) phải bọc tree tại `AppIntelliJ`. Mọi view dùng `useMessage()`/`useNotification()`/`useTaskMateModal()` thay `message.*`/`notification.*`/`Modal.confirm`. `[VERIFIED: codebase grep + CITED: https://ant.design/components/app]`
**When to use:** Mọi call site tĩnh (615 chỗ / 101 file). File `.ts` phi-React (6 file) dùng notify callback từ view (D-06).
**Example:**
```tsx
// Source: src/components/ui/message.tsx + https://ant.design/components/app
// AppIntelliJ.tsx — mount ĐÚNG MỘT LẦN, ngay dưới AntdThemeAdapter
<AntdThemeAdapter>
  <ThemeAppHolder>
    {/* providers + WorkbenchLayout + 4 popout branches */}
  </ThemeAppHolder>
</AntdThemeAdapter>

// View component
const { message } = useMessage();
const { modal, contextHolder } = useTaskMateModal();
const { notification } = useNotification();
return <>{contextHolder}{/* ... */}</>;

// Triangular confirm — copy tiếng Việt giữ byte-for-byte (UI-SPEC §Copywriting)
modal.confirm({ title: 'Xác nhận xóa', content: '...', onOk: async () => { ... } });
```
**Lưu ý:** `modal.confirm` từ `useTaskMateModal()` trả `{ modal, contextHolder }` — phải render `contextHolder` trong tree, nếu không confirm không hiện. `[VERIFIED: src/components/ui/modal.tsx]`

### Pattern 2: Wrapper-only import + mở rộng wrapper khi thiếu prop

**What:** Đổi `import { Button, Table, ... } from 'antd'` → `from '../../components/ui'`; icon → `from '../../components/ui/icon'`. `import type` giữ nguyên (D-19). Khi wrapper thiếu prop (column render, `namePath`, tree props), thêm prop vào file wrapper tương ứng + test. `[VERIFIED: eslint.config.mjs + D-03]`
**When to use:** 239 file import trực tiếp. Không import runtime tại view để "giải quyết tạm".
**Example:**
```tsx
// Source: tests/fixtures/guard/good-import.tsx (positive fixture đã có)
import { Button } from '../../../src/components/ui';
import { SearchOutlined } from '../../../src/components/ui/icon';
import type { ButtonProps } from 'antd'; // OK — allowTypeImports: true
```

### Pattern 3: Inline token-valued style → CSS var / token class

**What:** Chỉ thay giá trị trùng token: `fontSize 11/12 → var(--font-size-small/ui)`, `borderRadius 6/8 → var(--radius-control)`, `#1677ff/#4f46e5 → var(--accent)`, `#8c8c8c → var(--fg-secondary)`, `gap 6 → var(--island-gap)` hoặc spacing scale. Giữ inline cho giá trị động, kèm comment. `[VERIFIED: src/styles/tokens.ts + D-08/D-09]`
**When to use:** Các view đã migrate; dọn theo bề mặt, không dọn toàn app cơ học.
**Example:**
```tsx
// Token-valued -> CSS var
<div style={{ fontSize: 'var(--font-size-ui)', borderRadius: 'var(--radius-control)' }} />
// Dynamic value -> giữ inline + comment giải thích (D-10)
<div style={{ width: `${progressPct}%` }} /> // ponytail: dynamic data width, không phải token
```

### Anti-Patterns to Avoid
- **Global AntD bridge/singleton:** D-06 cấm; service muốn notify phải nhận callback. Singleton phá context theme.
- **Dọn cơ học `style={{`:** Mất giá trị động, gây regression. Chỉ dọn token-valued (D-08).
- **Thêm wrapper trùng:** 51 wrapper đã đủ; mở rộng file có sẵn, không tạo wrapper mới cùng tên (D-03 + 50-UI-SPEC).
- **Mount holder nhiều lần / ở popout riêng:** D-05 yêu cầu đúng một lần tại shell root. Mỗi popout có `AntdThemeAdapter` riêng nhưng holder phải nằm ở root branch tương ứng — cần cân nhắc: popout là route trả tree riêng trong `AppIntelliJ`, nên holder bọc từng branch hoặc bọc toàn bộ return. Xem §Open Questions.
- **Sửa `tokens.ts` bảng giá trị:** D-09 cấm mở rộng bảng token.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message/notification/confirm có theme | Static wrapper module / global singleton | `useMessage()`, `useNotification()`, `useTaskMateModal()` + `ThemeAppHolder` | `App.useApp()` lấy instance từ context, kế thừa `ConfigProvider`; docs khuyên dùng thay static. `[CITED: https://ant.design/components/app]` |
| Icon button accessible name | Custom aria logic tại view | `IconButton` wrapper (bắt buộc `aria-label`) | Đã có sẵn, type-enforced. `[VERIFIED: src/components/ui/button.tsx]` |
| Status color map | Hardcode hex tại view | `StatusTag`/`StatusDot`/`getStatusTokens` | Một map D-12 cho mọi domain. `[VERIFIED: src/components/ui/tokens.contract.ts]` |
| Import guard | Custom AST script | `eslint.config.mjs` `no-restricted-imports` + `antdInventory.test.ts` | Đã có; chỉ cần nâng scope `eslint src` (D-11). |
| Token drift detection | Viết rule ESLint inline-style mới | Test sweep trong `__tests__` (D-10) | Rule đã defer; test là cơ chế được chọn. |
| Computed style parity | Self-made style diff tool | Playwright `locator.evaluate(getComputedStyle)` + `50-UAT.md` | Pattern đã dùng trong `tests/e2e/coding-zone.spec.ts`. |

**Key insight:** Mọi thứ cần thiết đã có từ Phase 49. Phase 50 là công việc cơ học có guard — giá trị nằm ở kỷ luật sóng migrate + bằng chứng UAT, không phải code mới.

## Runtime State Inventory

> Phase 50 là mass code refactor (không đổi identifier/string định danh, không đổi schema). Kiểm tra 5 category để đáp ứng verification protocol; kết quả: không có runtime state cần migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — không rename collection/key/ID; Dexie schema không đổi | Không có data migration. `[VERIFIED: phase scope = UI imports/style]` |
| Live service config | None — không đổi endpoint/tên workflow/daemon config | Không có API patch. `[VERIFIED: phase scope]` |
| OS-registered state | None — không đổi tên process/task/unit | Không có re-register. `[VERIFIED: phase scope]` |
| Secrets/env vars | None — không đụng GitHub token/passphrase; UI-SPEC cấm đưa vào bundle | Giữ nguyên; KHÔNG thêm secret. `[VERIFIED: CLAUDE.md + UI-SPEC]` |
| Build artifacts | None — không đổi package name/version; `dist` rebuild bình thường | Chỉ rebuild qua `npm run build`. `[VERIFIED: package.json]` |

**Nothing found in category:** Tất cả 5 category — phase này thuần UI code migration, không có runtime state mang tên/string cũ cần đổi.

## Common Pitfalls

### Pitfall 1: Hook trả instance nhưng quên mount holder / quên render contextHolder
**What goes wrong:** `useMessage()` gọi `AntApp.useApp()` — nếu không có `<ThemeApp>` phía trên, instance rỗng hoặc throw; `modal.confirm` từ `useTaskMateModal()` không hiện nếu không render `contextHolder`.
**Why it happens:** Phase 49 tạo sẵn hook nhưng chưa ai mount; dễ đổi import rồi chạy thấy "không có gì xảy ra".
**How to avoid:** Plan đầu tiên của mỗi sóng mount/kiểm tra holder; test smoke một confirm đơn giản trước khi migrate hàng loạt.
**Warning signs:** `message.error` im lặng, Modal.confirm không mở.

### Pitfall 2: File `.ts` phi-React không用 được hook
**What goes wrong:** 6 file `.ts` (`useNetworkStatus.ts`, `useTimerAlertMonitor.ts`, `claudeCliService.ts`, `exportFolderZip.ts`, `mermaidExport.ts`, `workbench/actions/actionRegistry.ts`) gọi API tĩnh. Không gọi hook được ngoài component.
**Why it happens:** D-05 cấm API tĩnh, D-06 cấm singleton — dễ bế tắc.
**How to avoid:** View truyền callback `notify` vào service/async callback; giữ chữ thông báo byte-for-byte. Không tạo module bridge toàn cục.
**Warning signs:** Plan import `message` từ `antd` trong file `.ts` — vi phạm GUARD-01.

### Pitfall 3: Wrapper prop regression (WR-03/WR-04 đã fix, dễ tái phát)
**What goes wrong:** Button wrapper từng ghi đè `style`/`type` caller; Modal/Drawer từng làm mất `mask={false}`. Phase 49 đã fix (`withoutUndefined`, `resolveMask`), nhưng khi migration đổi props có thể vô tình truyền sai.
**Why it happens:** Wrapper có policy props riêng (`variant`, `density`, `widthScale`) cạnh AntD props gốc.
**How to avoid:** Review diff từng bề mặt; chạy test wrapper hiện có (`button.test.tsx`, `controls.test.tsx`); ghi khác biệt hành vi vào plan (D-04).
**Warning signs:** `<Button type="link">` ra default, `<Modal mask={false}>` vẫn có mask, `<Button style={{padding:0}}>` mất padding.

### Pitfall 4: Dọn inline quá tay làm mất giá trị động
**What goes wrong:** `width: ${pct}%`, `transform: translateX(...)`, vị trí computed bị thay bằng CSS var tĩnh → giao diện vỡ.
**Why it happens:** D-08/D-09 chỉ cho dọn token-valued; dọn cơ học 3.646 chỗ là sai.
**How to avoid:** Chỉ sweep các pattern đã liệt kê (`fontSize`, `borderRadius`, `gap`, hex token); mọi ngoại lệ kèm comment + review list (D-10).
**Warning signs:** Plan "thay tất cả style={{ bằng class" — không đúng.

### Pitfall 5: `guardConfig.test.ts` vỡ khi xóa `lint:adoption`
**What goes wrong:** `src/components/ui/__tests__/guardConfig.test.ts:13` assert `packageJson.scripts['lint:adoption']` tồn tại. D-11 xóa script này → test fail.
**Why it happens:** Test Phase 49 mô tả trạng thái trước adoption.
**How to avoid:** Plan D-11 phải sửa test: assert `lint === 'eslint src'`, bỏ assert `lint:adoption`, giữ assert `build === 'tsc && vite build'`, cập nhật comment IN-01 trong `eslint.config.mjs`.
**Warning signs:** `npm run test:foundation` đỏ sau khi đổi `package.json`.

### Pitfall 6: Portaled overlay mất biến token ở dark mode
**What goes wrong:** Modal/Drawer/Dropdown append vào `<body>`, ngoài wrapper `.taskmate-workbench-theme` → nếu biến chỉ inject lên wrapper thì mất màu. Phase 49 đã fix bằng inject lên `document.documentElement` (CR-02).
**Why it happens:** Migration thêm overlay mới qua wrapper; nếu dùng CSS var scope sai sẽ lệch.
**How to avoid:** Giữ `applyCssVariables` inject lên cả wrapper lẫn root; UAT U4 (modal forms) kiểm tra overlay ở dark.
**Warning signs:** Modal nền trắng trong khi app dark.

### Pitfall 7: Near-token normalization đổi value mà không ghi chú
**What goes wrong:** Đổi `fontSize: 11 → 12`, `borderRadius 6/8 → 4`, `#1677ff → accent` nhưng không ghi plan → UAT không biết chỗ nào khác behavior.
**Why it happens:** D-09 yêu cầu ghi rõ chỗ đổi value.
**How to avoid:** Tạo bảng "đổi value" trong plan/UAT; checker đối chiếu.

## Code Examples

Verified patterns từ codebase + official docs:

### Static API → context hooks
```tsx
// Source: src/components/ui/message.tsx, modal.tsx, notification.tsx
// https://ant.design/components/app — "ConfigProvider and App must appear in pairs"
import { useMessage, useNotification, useTaskMateModal } from '../components/ui';

function Example() {
  const { message } = useMessage();
  const { notification } = useNotification();
  const { modal, contextHolder } = useTaskMateModal();
  return (
    <>
      {contextHolder}
      <Button onClick={() => message.success('Đã lưu')}>Lưu</Button>
    </>
  );
}
```

### ESLint guard — type import hợp lệ, runtime bị chặn
```js
// Source: eslint.config.mjs + https://eslint.org/docs/latest/rules/no-restricted-imports
{
  name: 'antd',
  allowTypeImports: true, // import type ... from 'antd' OK; runtime import -> error
  message: 'Import from src/components/ui instead.',
}
```

### Playwright computed-style parity (pattern có sẵn)
```ts
// Source: tests/e2e/coding-zone.spec.ts (dùng getComputedStyle qua evaluate)
const font = await page.getByTestId('quick-add-input')
  .evaluate((n) => getComputedStyle(n).fontSize);
await expect(font).toBe('13px');
// Toggle theme via UI, assert color changes but font/size unchanged.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `message.*` / `Modal.confirm` | `App.useApp()` hooks under `ConfigProvider` | AntD 5.1.0+ (docs) `[CITED: https://ant.design/components/app]` | Context theme inherited; Phase 50 bắt buộc. |
| Runtime `import from 'antd'` tại view | Wrapper barrel `src/components/ui/` | Phase 49 (2026-11-21) `[VERIFIED: codebase]` | Một điểm cấu hình; guard ESLint. |
| `npm run lint` scoped + `lint:adoption` đỏ | `lint = eslint src`, xóa `lint:adoption` | Phase 50 D-11 | Toàn app xanh mới được đóng milestone. |
| `13.5px` / hex lẻ inline | 4 size token (11/12/13/16) + CSS var | Phase 49 UI-SPEC | Không có size thứ 5; parity light/dark. |

**Deprecated/outdated:**
- `lint:adoption` — sẽ xóa ở D-11; `guardConfig.test.ts` phải cập nhật theo.
- Static AntD API — bị cấm bởi `49-UI-SPEC` Wrapper Policy Contract.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CONTEXT ghi 633 call site nhưng đo được 615 — có thể CONTEXT đếm cả occurrence trong comment/alias hoặc thời điểm khác | Summary, Open Questions | Plan ước lượng sai số lượng call site; vẫn migrate hết bằng grep guard nên không sót. |
| A2 | `ThemeAppHolder` có thể bọc toàn bộ `AppIntelliJ` return (kể cả 4 popout branch) mà không tạo holder trùng | Pattern 1, Open Questions | Nếu mỗi popout là window riêng, cần mount riêng theo branch — planner phải quyết. |
| A3 | `test:foundation` là 11 file/73 test (CONTEXT) nhưng `49-VALIDATION.md` ghi 10 file/61 test | Validation Architecture | Baseline test count lệch; chỉ cần xanh, không cần khớp số chính xác. |

## Open Questions

1. **Lệch số call site API tĩnh (615 đo được vs 633 CONTEXT)**
   - What we know: grep `Modal.confirm|message.(success|error|warning|info)|notification.(...)` ngoài ui/ cho 615 trong 101 file; CONTEXT ghi 633 trong 104 file.
   - What's unclear: nguồn lệch 18 (có thể `message.open`/`loading` hoặc đếm ở thời điểm trước).
   - Recommendation: dùng grep guard làm nguồn truth; plan migrate theo bề mặt, không dựa trên số cố định.

2. **Mount `ThemeAppHolder` cho popout**
   - What we know: `AppIntelliJ` trả 5 branch (4 popout + main), mỗi branch bọc `AntdThemeAdapter` riêng; `ThemeAppHolder` chưa mount.
   - What's unclear: popout chạy trong Tauri window riêng hay cùng React tree? (route-based render trong cùng component gợi ý cùng tree, nhưng cần xác nhận runtime).
   - Recommendation: mount holder ngay dưới `AntdThemeAdapter` trong mỗi branch (hoặc bọc ngoài cùng quanh toàn bộ return) — đúng một lần cho mỗi rendered tree; planner chọn và ghi rõ.

3. **Phạm vi "view đã migrate" cho inline-style sweep test**
   - What we know: D-10 yêu cầu test chặn token-valued inline style trên view đã migrate; không có rule ESLint tự động.
   - What's unclear: test sweep chạy toàn `src` hay theo danh sách file sóng?
   - Recommendation: test quét toàn `src` ngoài `ui/` nhưng chỉ fail trên whitelist bề mặt đã migrate (hoặc chạy ở sóng cuối khi toàn app đã migrate) — planner quyết cơ chế.

4. **Cách toggle theme trong UAT Playwright**
   - What we know: toggle nằm ở `src/workbench/TitleBar.tsx:42` (`useThemeMode().toggle`); `useThemeMode` lưu localStorage + broadcast.
   - What's unclear: selector ổn định cho nút toggle (cần đọc TitleBar ripple) và có sẵn data-testid không.
   - Recommendation: thêm `data-testid` cho toggle trong plan UAT hoặc dùng accessible name; ghi vào spec.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test tooling | ✓ | 24.16.0 | — |
| npm | scripts | ✓ | 11.13.0 | — |
| Google Chrome | UAT tay + Playwright `channel: 'chrome'` | ✓ | 157.0.8103.79 | — |
| Playwright chromium | Smoke fallback | ✓ | chromium-1223 cached | Dùng channel chrome như config |
| Tauri CLI | Chạy app thật (`tauri dev`) | ✓ | 2.12.0 | Vite dev server qua Playwright webServer |
| Rust/Cargo | Tauri build | ✓ | 1.98.1 | — |
| Vite dev server | Playwright webServer | ✓ (config) | 8.3.1 | `npm run dev -- --host 127.0.0.1` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. App có thể verify UAT qua Vite dev server ngay cả khi không chạy Tauri binary — phù hợp `playwright.config.ts` dùng `baseURL: http://127.0.0.1:5173/task-management/`. `[VERIFIED: environment probes]`

## Validation Architecture

> `workflow.nyquist_validation: true` trong `.planning/config.json` — section bắt buộc.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (jsdom) + Playwright 1.63.0 |
| Config file | `vite.config.ts` (test block), `playwright.config.ts`, `tests/setup.ts` |
| Quick run command | `npm run test:foundation` |
| Full focused command | `npx vitest run src/components/ui/__tests__ --bail=1` |
| E2E command | `npm run test:e2e` (Playwright, webServer Vite tự start) |

### Gate Commands (đã chạy baseline session này)
| Gate | Lệnh | Baseline 2026-11-21 |
|------|------|---------------------|
| Types | `npx tsc --noEmit` | exit 0, 0 error |
| Lint scoped | `npm run lint` | exit 0 |
| Lint toàn app | `npm run lint:adoption` (= `eslint src`) | 404 errors, 239 file — sẽ thành `npm run lint` ở D-11 |
| Build | `npm run build` (= `tsc && vite build`) | chưa chạy full (tsc部分 clean); kỳ vọng xanh |
| Focused test | `npm run test:foundation` | xanh baseline (số file/test lệch giữa CONTEXT 11/73 và 49-VALIDATION 10/61 — A3) |
| Static API grep | lệnh trong §Gate Commands của UI-SPEC | 615 occurrence hiện tại → mục tiêu 0 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ADOPT-01 | Không runtime import antd/icons ngoài ui/ | lint + inventory | `npm run lint` (sau D-11: `eslint src`) | ✅ fixture + guard có sẵn |
| ADOPT-01 | Static API → hook | source grep test (mới) | `npx vitest run src/components/ui/__tests__ --bail=1` | ❌ Wave 0 — thêm test guard static API |
| ADOPT-02 | Không token-valued inline style | source sweep test (mới) | `npx vitest run src/components/ui/__tests__ --bail=1` | ❌ Wave 0 — thêm sweep test |
| ADOPT-03 | 6 luồng × light/dark, focus/keyboard/aria | e2e smoke + UAT tay | `npm run test:e2e` | ❌ Wave 0 — thêm `e2e/adoption.spec.ts` |
| ADOPT-04 | tsc/lint/focused/build xanh | combined gate | `npx tsc --noEmit && npm run lint && npm run test:foundation && npm run build` | ✅ script có sẵn; ⚠️ `guardConfig.test.ts` phải sửa |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit && npm run lint && npm run test:foundation` (không chạy full suite — memory rule).
- **Per wave merge:** `eslint <các file đã migrate>` + Vitest liên quan + build.
- **Phase gate:** `eslint src` + `test:foundation` + `build` + Playwright smoke xanh trước `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/components/ui/__tests__/staticApiGuard.test.ts` — chặn `message.*`/`notification.*`/`Modal.confirm` tĩnh ngoài `ui/` (D-07).
- [ ] `src/components/ui/__tests__/inlineStyleSweep.test.ts` — chặn token-valued inline style trên view đã migrate (D-10).
- [ ] `e2e/adoption.spec.ts` — smoke 6 luồng × light/dark (U1..U6), focus/keyboard/aria; dùng `playwright.config.ts`.
- [ ] `src/components/ui/__tests__/guardConfig.test.ts` — sửa assert `lint:adoption` → `lint === 'eslint src'` (D-11).
- [ ] `eslint.config.mjs` — cập nhật comment IN-01 sau khi nâng `lint`.
- [ ] `AppIntelliJ.tsx` — mount `ThemeAppHolder` (không có test hiện tại; thêm smoke test nếu cần).

*Không có gap framework/config — Vitest/Playwright/ESLint đã sẵn sàng.*

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` trong config. Phase là UI refactor, không đổi auth/session/crypto — nhưng vẫn đánh giá ASVS để đảm bảo không mở lỗ hổng khi migrate form/modal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Không đụng auth; GitHub token vẫn session-only, không vào bundle. `[VERIFIED: CLAUDE.md]` |
| V3 Session Management | no | Không đụng session. |
| V4 Access Control | no | App one-person, không role system. |
| V5 Input Validation | yes | Form/Input migration (U2) phải giữ validation hiện có; copy lỗi tiếng Việt byte-for-byte. Không hand-roll validation mới. `[VERIFIED: UI-SPEC §Copywriting]` |
| V6 Cryptography | no | Không đụng Web Crypto/backup encryption. Không hand-roll crypto. |

### Known Threat Patterns for {AntD 6 / React 19 / Tauri}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Static API global state leak | Tampering | Dùng context hooks thay static — không lưu instance vào global module (D-06). |
| XSS qua `dangerouslySetInnerHTML` trong nội dung info | Tampering | Không thêm; giữ nguyên render path của view. |
| Secret vào bundle | Information disclosure | Không đưa token/passphrase vào `VITE_*`; D-13 UAT không commit screenshot chứa data. |

**Ghi chú:** Không có compliance/retention/security standard mới được định nghĩa trong phase này — mọi claim bảo mật ở trên là hệ quả của CLAUDE.md và UI-SPEC đã khóa, không phải quyết định mới.

## Sources

### Primary (HIGH confidence)
- Codebase grep/Python inventory trực tiếp session 2026-11-21: 239 file import, 615 static call site, 3.684 `style={{`, 80 file `useToken`, 6 file `.ts` static API — `[VERIFIED: codebase grep]`
- `package.json`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`, `eslint.config.mjs` — scripts và config đọc trực tiếp — `[VERIFIED: codebase]`
- `src/components/ui/index.ts`, `message.tsx`, `modal.tsx`, `notification.tsx`, `tokens.contract.ts`, `button.tsx`, `table.tsx`, `form.tsx` — implementation wrapper — `[VERIFIED: codebase]`
- `src/AppIntelliJ.tsx`, `src/workbench/AntdThemeAdapter.tsx`, `src/hooks/useThemeMode.ts`, `src/styles/tokens.ts` — shell/theme — `[VERIFIED: codebase]`
- `src/components/ui/__tests__/guardConfig.test.ts`, `antdInventory.test.ts`, `coverage.test.ts` — guard tests — `[VERIFIED: codebase]`
- `gsd-tools query classify-confidence` / `package-legitimacy check` / `npm view` — seam + registry — `[VERIFIED: tool]`
- Environment probes: Chrome 157, Playwright cache, Tauri 2.12, Rust 1.98, Node 24 — `[VERIFIED: shell probes]`

### Secondary (MEDIUM confidence)
- `https://ant.design/components/app` — `useApp()` trả message/notification/modal từ context; ConfigProvider + App phải đi cùng; ["ConfigProvider and the App component must appear in pairs"]. `[CITED]` (seam classify-confidence cho webfetch = LOW, nhưng nội dung là official docs nên đánh giá MEDIUM cho chi tiết migration)
- `https://eslint.org/docs/latest/rules/no-restricted-imports` — `allowTypeImports: true` cho phép type-only import, value import vẫn bị chặn. `[CITED]`
- `https://playwright.dev/docs/accessibility-testing` — `getByRole` + accessible name, AxeBuilder. `[CITED]`

### Tertiary (LOW confidence)
- A1/A2/A3 trong Assumptions Log — lệch số liệu và giả định mount popout; cần planner/user confirm.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — đọc trực tiếp `package.json`, không thêm package mới.
- Architecture: HIGH — inventory codebase + wrapper implementation đọc trực tiếp; pattern hook có official docs xác nhận.
- Pitfalls: HIGH — derived từ Phase 49 review (WR-01..WR-05, IN-01) và grep hiện tại; A2/A3 là LOW.
- UAT/e2e: MEDIUM — environment có sẵn nhưng chưa có spec 6 luồng; selector toggle cần ripple.

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (30 ngày — stack ổn định, nhưng version patch đang đổi nhanh; nếu nâng dependency thì re-check)
