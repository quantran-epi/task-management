# Phase 50: Full App Adoption - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 50-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 50-full-app-adoption
**Areas discussed:** Sóng migrate, API tĩnh AntD, Dọn inline style, Cổng xanh & UAT

---

## Sóng migrate

| Option | Description | Selected |
|--------|-------------|----------|
| Theo bề mặt | tasks/planner, settings, CR/notes, AI Office/chat, tool windows + shell còn lại; khớp luồng UAT | ✓ |
| Theo loại control | Đổi import Button, rồi Input, Select, Table... toàn app | |
| Lai: control nền trước | Icon + control đơn trước, Table/Form/Modal theo bề mặt | |

**User's choice:** Theo bề mặt.

| Option | Description | Selected |
|--------|-------------|----------|
| tsc + test sóng | Mỗi sóng: tsc --noEmit, Vitest liên quan, lint file đã migrate; lint toàn app cuối phase | ✓ |
| Lint toàn app mỗi sóng | Không merge nếu còn 1 import trực tiếp | |
| Chỉ build xong | Bỏ test giữa sóng | |

**User's choice:** tsc + test sóng.

| Option | Description | Selected |
|--------|-------------|----------|
| Mở rộng wrapper | Thêm prop/forwardRef vào ui/ + test, cấm import runtime ở view | ✓ |
| Escape hatch có kiểm soát | props object thuần từ view | |
| Refactor view bỏ prop | Đổi UI để khớp wrapper hiện có | |

**User's choice:** Mở rộng wrapper.

| Option | Description | Selected |
|--------|-------------|----------|
| Đúng behavior, sửa tối thiểu | Chỉ đổi import/props; khác biệt ghi rõ trong plan | ✓ |
| Chuẩn hóa luôn khi chạm | Sửa policy aria/danger/loading cùng lúc | |
| Tôi quyết theo từng file | Để executor tự cân nhắc | |

**User's choice:** Đúng behavior, sửa tối thiểu.

---

## API tĩnh AntD

| Option | Description | Selected |
|--------|-------------|----------|
| Hook context | useMessage/useNotification/useTaskMateModal + mount ThemeAppHolder một lần | ✓ |
| Wrapper tĩnh | Export message/notification/Modal.confirm tự inject theme | |
| Lai theo vùng | Hook cho modal/CR, wrapper tĩnh cho util | |

**User's choice:** Hook context.

| Option | Description | Selected |
|--------|-------------|----------|
| Truyền callback từ view | View dùng hook rồi truyền notify vào service/util | ✓ |
| Bridge module | Đăng ký instance toàn cục từ ThemeAppHolder | |
| Bỏ message ở tầng đó | Chỉ throw, view tự hiển thị | |

**User's choice:** Truyền callback từ view.

| Option | Description | Selected |
|--------|-------------|----------|
| Chuyển toàn bộ | 633 call site, test/lint chặn API tĩnh | ✓ |
| Chỉ luồng UAT | Phần còn lại ghi nợ | |
| Giữ ngoại lệ | Chỉ chặn Modal.confirm | |

**User's choice:** Chuyển toàn bộ.

---

## Dọn inline style

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ giá trị trùng token | Thay màu/font/size/spacing/radius, giữ inline cho giá trị động | ✓ |
| Dọn toàn bộ inline | Mọi style={{ sang CSS class | |
| Chỉ màu | Để font/size/spacing inline | |

**User's choice:** Chỉ giá trị trùng token.

| Option | Description | Selected |
|--------|-------------|----------|
| Đổi về token gần nhất | Chuẩn hóa fontSize 11→12/13, radius 6/8→4, #1677ff→accent token; ghi rõ | ✓ |
| Giữ + comment | Giữ pixel hiện tại, comment lý do | |
| Thêm token mới | Mở rộng bảng token phase 49 | |

**User's choice:** Đổi về token gần nhất.

| Option | Description | Selected |
|--------|-------------|----------|
| Có kiểm soát | Ngoại lệ động/đặc thù có comment + review; test chặn token-valued sót | ✓ |
| Không ngoại lệ | Lint chặn mọi style={{ | |
| Duyệt từng cái | Planner liệt kê, sếp duyệt | |

**User's choice:** Có kiểm soát.

---

## Cổng xanh & UAT

| Option | Description | Selected |
|--------|-------------|----------|
| Nâng lint thành eslint src | Xóa lint:adoption, giữ test:foundation là tập con, đúng IN-01 | ✓ |
| Giữ 2 script | lint nền tảng + lint:adoption riêng | |
| Thêm rule inline-style | Rule ESLint chặn token-valued inline | |

**User's choice:** Nâng lint thành eslint src.

| Option | Description | Selected |
|--------|-------------|----------|
| DevTools tay + Playwright smoke | Quan sát 6 luồng × 2 theme + spec lặp được | ✓ |
| Chỉ DevTools tay | Ghi kết quả, không thêm code test | |
| Chỉ Playwright | Headless, không nhìn trực tiếp | |

**User's choice:** DevTools tay + Playwright smoke.

| Option | Description | Selected |
|--------|-------------|----------|
| Phase UAT doc | 50-UAT.md: luồng × theme, focus/keyboard/aria, lỗi đã sửa | ✓ |
| Commit screenshot | Ảnh light/dark cạnh UAT doc | |
| Chỉ pass/fail | Bảng ngắn trong SUMMARY.md | |

**User's choice:** Phase UAT doc.

---

## Claude's Discretion

- Thứ tự plan trong mỗi sóng và chi tiết kỹ thuật chuyển import/props.
- Cách mount ThemeAppHolder và truyền callback notify cụ thể.
- Chi tiết chuyển inline sang CSS var hay token hook.
- Phạm vi file của mỗi plan (miễn đủ 5 sóng và cuối phase eslint src xanh).

## Deferred Ideas

- Visual regression suite / snapshot toàn app (Future Requirements).
- Theme editor đổi accent (Future Requirements).
- Rule ESLint tự động chặn token-valued inline style (considered, không chọn).
- Commit screenshot light/dark vào repo (considered, không chọn).

---

*Phase: 50-Full App Adoption*
*Discussion logged: 2026-11-21*
