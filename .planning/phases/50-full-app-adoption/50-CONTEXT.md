# Phase 50: Full App Adoption - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Adoption toàn diện design system Phase 49 lên mọi bề mặt UI TaskMate: import wrapper `src/components/ui/` thay AntD trực tiếp, xóa style inline trùng token, chuyển API imperatively tĩnh sang hook có context, UAT Chrome Quantitatively light+dark 6 luồng đại diện, và làm xanh mọi cổng local. Không thêm capability/product feature mới. Không thiết kế lại shell hay đổi stack (Phase 49 đã khóa).

Không re-ask: mọi quyết định nền tảng của Phase 49 (D-01..D-19) và `49-UI-SPEC.md` đã có hiệu lực ở phase này.

</domain>

<decisions>
## Implementation Decisions

### Sóng migrate (ADOPT-01)
- **D-01:** Chia công việc theo **bề mặt**, không theo loại control: (1) tasks/planner, (2) settings, (3) CR/notes, (4) AI Office/chat, (5) tool windows + các file shell còn lại. Lý do: khớp 6 luồng UAT của ADOPT-03; mỗi sóng kiểm được luồng tương ứng.
- **D-02:** Một sóng chỉ coi là xong khi `tsc --noEmit`, Vitest liên quan, và lint trên các file đã migrate xanh. `eslint src` toàn app chỉ kỳ vọng xanh sau sóng cuối. Không chờ lint toàn app xanh từng sóng (hiện có 404 lỗi import ở 239 file).
- **D-03:** Khi wrapper thiếu prop chuyên sâu (column render, `Form.Item` namePath, tree props, v.v.), **mở rộng wrapper** trong `src/components/ui/` kèm test. Cấm import runtime `antd`/`@ant-design/icons` tại view để giải quyết tạm. `import type` vẫn được phép theo D-19 Phase 49.
- **D-04:** Migration giữ nguyên behavior; chỉ sửa tối thiểu phần import/props cần thiết. Mọi khác biệt hành vi (kể cả hệ quả của chuẩn hóa style) phải ghi rõ trong plan/phase doc để UAT kiểm chứng.

### API tĩnh AntD (ADOPT-01/03)
- **D-05:** Chuyển **toàn bộ** 633 call site (`message.*` ~603, `Modal.confirm` 30) sang API context: `useMessage()`, `useNotification()`, `useTaskMateModal()`; mount `ThemeAppHolder` đúng một lần tại shell root. Không giữ API tĩnh, không wrapper tĩnh, không ngoại lệ theo vùng — `49-UI-SPEC.md` đã cấm.
- **D-06:** File không phải React component (service/util/async callback) muốn thông báo thì **nhận callback `notify` được truyền từ view**. Cấm biến AntD thành singleton/bridge module toàn cục.
- **D-07:** Thêm guard (lint/test) chặn tái diễn API tĩnh `message.*`/`notification.*`/`Modal.confirm` ngoài `src/components/ui/`.

### Dọn inline style (ADOPT-02)
- **D-08:** Chỉ thay thế giá trị inline **trùng token** (màu/font/size/spacing/radius) bằng CSS var/class hoặc token hook. Giữ inline cho giá trị thực sự động theo data/state (width %, transform, vị trí tính toán). Không dọn toàn bộ 3.646 chỗ `style={{` một cách cơ học.
- **D-09:** Giá trị "gần token" nhưng lệch (`fontSize: 11`, `borderRadius: 6`, `#1677ff`, `#4f46e5`, `#8c8c8c`,...) chuẩn hóa về token gần nhất theo scale `49-UI-SPEC.md` (13px/12px, radius 4, accent token); ghi rõ chỗ đổi value trong plan. Không mở rộng bảng token phase 49.
- **D-10:** Ngoại lệ inline style được phép chỉ cho giá trị động/đặc thù, kèm comment giải thích; phải nằm trong danh sách được review. Test chặn token-valued inline style còn sót. D-11 Phase 49 được áp dụng đúng nghĩa: "giữ lại kèm comment" không phải là cái cớ để giữ hardcode trùng token.

### Cổng xanh & UAT (ADOPT-03/04)
- **D-11:** Nâng script `lint` thành `eslint src` và xóa `lint:adoption` (đúng `IN-01` trong `eslint.config.mjs`). Giữ `test:foundation` làm tập con; `npm run build` đã gồm `tsc --noEmit`. Không dùng GitHub Actions CI.
- **D-12:** UAT bằng **Chrome DevTools tay + Playwright smoke**: sếp mở app thật, chuyển light/dark, đi 6 luồng (task quick-add, settings CRUD, CR detail actions, modal forms, toolbar icon buttons, AI chat controls); thêm spec Playwright chạy được lặp lại cho smoke. Phải quan sát focus, keyboard nav, accessible name — không chỉ đọc code hay tin build xanh.
- **D-13:** Ghi bằng chứng vào `.planning/phases/50-full-app-adoption/50-UAT.md`: 6 luồng × 2 theme, trạng thái focus/keyboard/aria, lỗi phát hiện và cách sửa. Không commit screenshot lớn vào repo; đính kèm tham chiếu ảnh nếu cần review.

### Claude's Discretion
- Thứ tự plan trong mỗi sóng và chi tiết kỹ thuật chuyển import/props, miễn giữ D-01..D-04.
- Cách mount `ThemeAppHolder` và truyền callback notify cụ thể, miễn chỉ mount một lần và không dùng global singleton.
- Chi tiết chuyển inline sang CSS var hay token hook, miễn một nguồn token và có test chặn hardcode.
- Phạm vi file của mỗi plan, miễn đủ 5 sóng bề mặt và cuối phase `eslint src` xanh.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone contracts
- `.planning/ROADMAP.md` §Phase 50 — mục tiêu, 4 ADOPT requirements, 5 success criteria
- `.planning/REQUIREMENTS.md` §Adoption & Verification — ADOPT-01..04 (trạng thái chưa xanh)
- `.planning/PROJECT.md` §Current Milestone: v1.5 — ràng buộc scope và tiêu chí milestone
- `.planning/STATE.md` — trạng thái milestone, session continuity
- `.planning/research/SUMMARY.md` — inventory 248 file import trực tiếp (thời điểm research), nguyên tắc wrapper không pass-through

### Phase 49 contracts (đã khóa, không re-ask)
- `.planning/phases/49-design-system-foundation/49-CONTEXT.md` — D-01..D-19: wrapper cùng tên, mỗi control một file, icon gom trong `icon.tsx`, `import type` được phép, D-11 xử lý inline style
- `.planning/phases/49-design-system-foundation/49-UI-SPEC.md` — bảng token/spacing/typography/color, policy Button/Modal/Tag, cấm API tĩnh, copy tiếng Việt
- `.planning/phases/49-design-system-foundation/49-UI-SPEC.md` §Wrapper Policy Contract — nguồn quyết định D-05 (cấm `Modal.confirm`/`message.*`/`notification.*` tĩnh)

### Code sources of truth
- `eslint.config.mjs` — GUARD-01 rule + comment IN-01 yêu cầu thay `lint` bằng `eslint src` ở Phase 50
- `package.json` — script `lint`, `lint:adoption`, `test:foundation`, `build`, `test:e2e`
- `src/components/ui/index.ts` — barrel wrapper cùng tên AntD
- `src/components/ui/icon.tsx` — factory 144 icon, điểm thay đổi duy nhất
- `src/components/ui/message.tsx` — `useMessage()` + `ThemeAppHolder` đã có sẵn từ Phase 49
- `src/components/ui/modal.tsx` — `useTaskMateModal()` qua `AntModal.useModal()`
- `src/components/ui/notification.tsx` — hook notification context
- `src/components/ui/tokens.contract.ts`, `src/styles/tokens.ts`, `src/styles/workbench-tokens.css` — nguồn token light/dark duy nhất
- `src/AppIntelliJ.tsx` — shell root, nơi mount `ThemeAppHolder` một lần
- `playwright.config.ts` — cấu hình smoke Chromium, webServer Vite

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (đo bằng grep ngày 2026-11-21)
- `src/components/ui/` — 51 file wrapper đã có, barrel `index.ts`, `icon.tsx` (144 icon), `message.tsx` (`useMessage`, `ThemeAppHolder`), `modal.tsx` (`useTaskMateModal`), `notification.tsx`. Chỉ mở rộng thêm prop khi cần; không tạo wrapper trùng.
- `src/hooks/useThemeMode.ts`, `src/workbench/themeBroadcast.ts` — toggle light/dark và phát broadcast sang popout/Tauri; đã test ở `test:foundation`.
- `tests/fixtures/guard/` + `src/components/ui/__tests__/antdInventory.test.ts`, `coverage.test.ts`, `guardConfig.test.ts` — test inventory/guard sẵn có, mở rộng cho ADOPT-01/02.
- `playwright.config.ts` + `e2e/*.spec.ts` — smoke Chromium có sẵn; cần thêm spec cho 6 luồng UAT.
- `test:foundation` hiện 11 file/73 test xanh.

### Established Patterns
- React 19.3 + AntD 6.6.5 + TS strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`); props optional phải bỏ key thay vì truyền `undefined`.
- ESLint flat config dùng Babel parser (TS7 Go-native không có compiler JS API); `no-restricted-imports` với `allowTypeImports: true`.
- `import type { ... } from 'antd'` hợp lệ ngoài `ui/`; chỉ chặn runtime import.
- Mỗi wrapper là một file, policy lấy từ token chung; nghiêm cấm re-export rỗng.

### Integration Points & Đo lường hiện tại
- 239 file ngoài `src/components/ui/` import trực tiếp: 234 file `antd`, 165 file `@ant-design/icons`; `npm run lint:adoption` đang **404 errors**.
- 3.646 chỗ `style={{` ngoài `ui/`; giá trị lặp phổ biến: `fontSize 12` (501), `11` (276), `gap 8` (183), `#ffffff` (86), `#1677ff` (75), `borderRadius 6/8` (68/63).
- 633 call site API tĩnh trong 104 file: `message.error` 241, `message.success` 211, `message.warning` 30, `message.info` 29, `notification.error` 39, `notification.success` 29, `notification.info` 8, `notification.warning` 6, `Modal.confirm` 30.
- 80 file gọi `theme.useToken()` inline — cần rà khi chuẩn hóa token.
- Tập trung file theo bề mặt: settings 29, views 21, ai 20, toolwindows 18, ai/office 17, tasks 16, notes 16, ai/grounded 16, common 13, planner 12 (số lượt xuất hiện inline style).

</code_context>

<specifics>
## Specific Ideas

- "Mọi bề mặt UI chạy trên design system mới; không còn import AntD trực hiện hay style inline trùng token."
- "UAT Chrome ở cả light và dark — quan sát được, không chỉ đọc code."
- "Mọi cổng kiểm tra xanh trước khi đóng milestone: tsc, lint, focused Vitest, build."
- Sếp chọn mọi phương án đề xuất trong 4 khu vực; không có ý kiến riêng ngoài các lựa chọn đã ghi ở `<decisions>`.

</specifics>

<deferred>
## Deferred Ideas

- Visual regression suite / snapshot toàn app — nằm trong Future Requirements của REQUIREMENTS.md, không làm trong phase này.
- Theme editor cho phép user đổi accent — Future Requirements, phase sau.
- Viết rule ESLint tự động chặn token-valued inline style — Considered nhưng không chọn (D-11); nếu sau này tái diễn hardcode, cân nhắc rule chuyên biệt khi đó.
- Commit screenshot light/dark vào repo — Considered nhưng không chọn (D-13); dùng file UAT + tham chiếu ảnh thay thế.

</deferred>

---

*Phase: 50-Full App Adoption*
*Context gathered: 2026-11-21*
