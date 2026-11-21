# Requirements: TaskMate — Milestone v1.5 Design System & UI Consistency

**Defined:** 2026-11-21
**Core Value:** Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## v1 Requirements

### Single Runtime Shell (SHELL)

- [ ] **SHELL-01**: Ứng dụng chỉ khởi động một shell IntelliJ/workbench; không còn lựa chọn shell AntD hay flag chuyển đổi.
- [ ] **SHELL-02**: Toàn bộ code của shell AntD cũ, cờ chuyển đổi trong `main.tsx`, và PWA install prompts bị xóa khỏi repo; không còn đường dẫn code chết.
- [ ] **SHELL-03**: Không có migration cho cấu hình shell cũ; dữ liệu test được bỏ theo nguyên tắc C-16.

### Design Tokens & Themes (TOKEN)

- [ ] **TOKEN-01**: Một nguồn định nghĩa token duy nhất (màu, radius, chiều cao control, font, spacing) được dùng bởi cả AntD `ConfigProvider` và CSS/workbench.
- [ ] **TOKEN-02**: Cả light mode và dark mode có bộ token hoàn chỉnh, đổi theme lập tức cập nhật mọi control mà không reload.
- [ ] **TOKEN-03**: Lựa chọn theme hiện tại của user được giữ làm mặc định; không ép đổi sang light hay dark.
- [ ] **TOKEN-04**: Không còn giá trị màu/font/size hardcoded trong components ứng dụng cho những giá trị đã có token; test phát hiện drift giữa ConfigProvider và CSS token.

### Control Wrappers (CTRL)

- [ ] **CTRL-01**: Mọi control AntD không có ngoại lệ (Button, Input, Select, Table, Form, DatePicker, Drawer, Modal, Card, Menu, Tooltip, Popover, Tag, Badge, v.v.) đều có wrapper TaskMate tại `src/components/ui/`; mọi dùng trong app đều đi qua wrapper đó.
- [ ] **CTRL-02**: Wrapper Button/IconButton áp thống nhất size, font, màu, trạng thái loading/disabled/danger, và yêu cầu accessible name cho icon button.
- [ ] **CTRL-03**: Wrapper Input/Select/Textarea/InputNumber áp thống nhất chiều cao, font, placeholder, trạng thái error/disabled và độ rộng mặc định theo ngữ cảnh.
- [ ] **CTRL-04**: Wrapper Modal/Drawer/Popconfirm áp thống nhất width scale, footer, close/mask policy, và tiêu đề.
- [ ] **CTRL-05**: Wrapper Tag/StatusTag/Badge áp thống nhất bảng màu trạng thái, font, padding; không còn map màu rời rạc trong các view.
- [ ] **CTRL-06**: Mọi wrapper, kể cả control phức tạp (Table/Form/DatePicker...), đều là điểm cấu hình duy nhất: nhận default từ token dùng chung và cho phép đổi/thay thế implementation chỉ tại một chỗ. Không có re-export rỗng hay import AntD trực tiếp outside `src/components/ui/`.

### Guardrails (GUARD)

- [ ] **GUARD-01**: ESLint rule chặn import trực tiếp `antd`/`@ant-design/icons` trong toàn bộ `src` ngoài `src/components/ui/`; không có ngoại lệ, wrapper là nơi duy nhất được phép.
- [ ] **GUARD-02**: CI chạy lint và build như điều kiện bắt buộc; vi phạm import trực tiếp làm pipeline fail.
- [ ] **GUARD-03**: Test tập trung kiểm tra wrapper render đúng token ở cả light và dark, accessible name, và policy (footer/modal, status colors).

### Adoption & Verification (ADOPT)

- [ ] **ADOPT-01**: Mọi màn hình, tool window, settings, CR, notes, AI Office và modal trong shell IntelliJ dùng wrapper thay vì AntD trực tiếp.
- [ ] **ADOPT-02**: Không còn style inline lặp lại các giá trị token trong các view đã migrate.
- [ ] **ADOPT-03**: UAT trên Chrome ở cả light và dark cho các luồng đại diện: task quick-add, settings CRUD, CR detail actions, modal forms, toolbar icon buttons, AI chat controls — quan sát được, không chỉ đọc code.
- [ ] **ADOPT-04**: `tsc --noEmit`, lint, focused Vitest và build đều xanh trước khi milestone đóng.

## Future Requirements

- Full component-level snapshot/visual regression suite khi design system ổn định.
- Theme editor cho phép user tự đổi accent color.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Shell AntD cũ / PWA behavior | User chỉ dùng IntelliJ mode; PWA đã bị loại khỏi current work. |
| Migration dữ liệu/cấu hình shell cũ | App chưa production (C-16). |
| Đổi thư viện UI khác Ant Design | Thiết kế hiện tại dựa trên AntD 6; chỉ wrap, không thay stack. |
| Tính năng sản phẩm mới | Milestone này chỉ refactor UI/UX nhất quán. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | Phase 49 | Pending |
| SHELL-02 | Phase 49 | Pending |
| SHELL-03 | Phase 49 | Pending |
| TOKEN-01 | Phase 49 | Pending |
| TOKEN-02 | Phase 49 | Pending |
| TOKEN-03 | Phase 49 | Pending |
| TOKEN-04 | Phase 49 | Pending |
| CTRL-01 | Phase 49 | Pending |
| CTRL-02 | Phase 49 | Pending |
| CTRL-03 | Phase 49 | Pending |
| CTRL-04 | Phase 49 | Pending |
| CTRL-05 | Phase 49 | Pending |
| CTRL-06 | Phase 49 | Pending |
| GUARD-01 | Phase 49 | Pending |
| GUARD-02 | Phase 49 | Pending |
| GUARD-03 | Phase 49 | Pending |
| ADOPT-01 | Phase 50 | Pending |
| ADOPT-02 | Phase 50 | Pending |
| ADOPT-03 | Phase 50 | Pending |
| ADOPT-04 | Phase 50 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-11-21*
*Last updated: 2026-11-21 after milestone v1.5 definition*
