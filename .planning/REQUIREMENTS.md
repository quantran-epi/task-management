# Requirements: TaskMate — Milestone v1.6 Native UI Controls

**Defined:** 2026-11-21
**Core Value:** Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## v1 Requirements

### Control Inventory (INV)

- [x] **INV-01**: Mọi control/UI surface TaskMate đang dùng được liệt kê từ `src/components/ui/` và mọi import `antd` / `@ant-design/icons` còn sót trong `src`, kèm file, props, state, event, keyboard/focus, validation và a11y.
- [x] **INV-02**: Danh mục bao phủ toàn bộ UI surface: route/view, tool window, settings, CR, notes, AI Office, modal/drawer/popconfirm, form/table, menu/context menu, tooltip/popover, notification, và các trạng thái empty/error/loading.
- [ ] **INV-03**: Mỗi control được phân loại theo nhóm implementation và độ phức tạp, xác định wrapper cần thay, control còn thiếu, và tiêu chí behavior phải giữ nguyên.

### OpenIDEA Mapping & Design (MAP)

- [ ] **MAP-01**: Với mỗi control có tương đương trong OpenIDEA, bản thiết kế map rõ token, metric, DOM/class, CSS module gốc, trạng thái và behavior; nguồn tham chiếu được ghi lại.
- [ ] **MAP-02**: Với mỗi control không có tương đương trong OpenIDEA, thiết kế control mới theo ngôn ngữ OpenIDEA: font 13px, control height 28px, radius 4px, focus ring, popup portal cách anchor 4px, list row 24px, dialog radius 10px — áp cho cả light và dark.
- [ ] **MAP-03**: Bản thiết kế ghi rõ props/API wrapper hiện tại được giữ nguyên; event, controlled/uncontrolled behavior, validation, keyboard/focus và accessible name không đổi.

### Native Implementation (NAT)

- [ ] **NAT-01**: Mọi wrapper trong `src/components/ui/` được thay bằng control tự build bằng React/CSS variables/CSS module/Web API; không import `antd` hay `@ant-design/icons`, không thêm thư viện UI runtime khác.
- [ ] **NAT-02**: Mọi trạng thái control được giữ behavior: default, hover, focus-visible, disabled, invalid/error, loading, selected, expanded, empty; popup flip/shift, ngoài-click đóng, Escape đóng, focus trap cho dialog.
- [ ] **NAT-03**: Toàn bộ UI surface dùng wrapper TaskMate; caller không phải sửa từng màn hình để thích nghi; không còn import AntD trực tiếp trong `src` và không còn code control chết.
- [ ] **NAT-04**: Token light/dark vẫn tập trung tại `src/styles/tokens.ts` và CSS variables; đổi theme cập nhật ngay mọi control; app vẫn chạy local/offline trên Tauri, không thêm runtime server.

### Cleanup & Guardrails (CLEAN)

- [ ] **CLEAN-01**: Gỡ hoàn toàn `antd` và `@ant-design/icons` khỏi `package.json` và lockfile; cài đặt, lint, build và focused test vẫn xanh.
- [ ] **CLEAN-02**: ESLint guard chặn mọi import trực tiếp `antd` / `@ant-design/icons` trong `src`; vi phạm làm lint fail.
- [ ] **CLEAN-03**: Focused test kiểm tra wrapper render đúng token light/dark, accessible name, API tương thích, popup/keyboard/focus/validation policy; không chạy full Vitest suite.

### Visual & Browser Verification (VIS)

- [ ] **VIS-01**: Seed dummy data rồi chạy app trên Chrome, tự quét từng route/view/tool window/settings/CR/notes/AI Office/modal/drawer/menu/tooltip ở cả light và dark, kể cả mọi feature nhỏ và mọi trạng thái control.
- [ ] **VIS-02**: Với mỗi màn hình/control, đo computed style và geometry gồm padding, margin, height, radius, font, border, shadow, alignment và overflow đối chiếu baseline OpenIDEA/proof; mọi lệch phải được sửa.
- [ ] **VIS-03**: Ghi log pass/fail kèm screenshot cho từng màn hình và từng trạng thái control; báo cáo sweep được lưu thành artifact planning.
- [ ] **VIS-04**: Kiểm tra behavior trên Chrome bằng tương tác thật: Tab/Arrow/Enter/Escape, mở/đóng popup, focus trap, validation, click, đổi theme; không có console error làm lỗi UI.
- [ ] **VIS-05**: Milestone chỉ đóng khi báo cáo sweep không còn defect render/behavior mở; sếp không phải tự duyệt từng tính năng hay từng màn hình.

## Future Requirements

- Visual regression suite ở mức snapshot khi bộ control đã ổn định.
- Theme editor cho phép đổi accent color mà không sửa source token.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Validation PWA/GitHub Pages | Milestone hiện tại chỉ nhắm Tauri desktop theo CLAUDE.md. |
| Thay đổi feature/product behavior | Milestone này chỉ đổi hệ thống UI/control. |
| Thêm thư viện UI khác | Mục tiêu là control native tự build, lightweight. |
| Giữ tương thích runtime AntD | AntD bị gỡ hoàn toàn sau milestone. |
| Thay đổi data model, ID, backup, sync | Không liên quan đến UI refactor; ID phải giữ ổn định. |
| Hệ thống cộng tác/backend | App vẫn là personal offline-first. |
| Full Vitest suite | Bị loại theo ràng buộc thời gian của dự án; dùng focused test. |

## Traceability

Each of the 18 v1.6 requirements maps to exactly one phase. Status stays Pending until the phase executes.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INV-01 | 51 | Complete |
| INV-02 | 51 | Complete |
| INV-03 | 51 | Pending |
| MAP-01 | 52 | Pending |
| MAP-02 | 52 | Pending |
| MAP-03 | 52 | Pending |
| NAT-01 | 53 | Pending |
| NAT-02 | 54 | Pending |
| NAT-03 | 55 | Pending |
| NAT-04 | 55 | Pending |
| CLEAN-01 | 56 | Pending |
| CLEAN-02 | 56 | Pending |
| CLEAN-03 | 56 | Pending |
| VIS-01 | 57 | Pending |
| VIS-02 | 57 | Pending |
| VIS-03 | 57 | Pending |
| VIS-04 | 57 | Pending |
| VIS-05 | 58 | Pending |

**Coverage:**

- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

| Phase | Requirements |
|-------|--------------|
| 51 | INV-01, INV-02, INV-03 |
| 52 | MAP-01, MAP-02, MAP-03 |
| 53 | NAT-01 |
| 54 | NAT-02 |
| 55 | NAT-03, NAT-04 |
| 56 | CLEAN-01, CLEAN-02, CLEAN-03 |
| 57 | VIS-01, VIS-02, VIS-03, VIS-04 |
| 58 | VIS-05 |

---
*Requirements defined: 2026-11-21*
*Last updated: 2026-11-21 after milestone v1.6 definition*
