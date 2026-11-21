# Phase 50 — UAT Evidence (2026-11-21)

> ADOPT-03 / D-12 / D-13. Bằng chứng quan sát được trên Chrome thật ở cả light và dark.
> Automated layer: Playwright `chromium` channel `chrome` (Chrome 157), webServer Vite tự start tại `http://127.0.0.1:5173/task-management/`.
> Manual layer: sếp mở app thật, bấm TitleBar toggle và đi 6 luồng — xem mục "Human check" cuối file. Không commit screenshot (D-13).

## Matrix 6 luồng × 2 theme

Kết quả cột "Focus/Keyboard/Aria" lấy từ assertion trong `e2e/adoption.spec.ts` chạy thật (6/6 pass, 2026-11-21).
"Parity" = `--accent` đổi đúng token, `--font-size-ui` (13px) và `--radius-control` (4px) giữ nguyên.

| Luồng | Theme | Kết quả | Focus | Keyboard | Aria | Ghi chú |
|-------|-------|---------|-------|----------|------|---------|
| U1 Task quick-add | light | PASS | ok — `task-search-input` focus() → toBeFocused | ok — gõ "uat" vào input, giá trị cập nhật | ok — quick-add `aria-label="Thêm nhanh tên tác vụ và ước tính"`, search `aria-label="Tìm kiếm tác vụ"` | Quick-add input bị disabled khi chưa có CR (behavior có sẵn, không phải defect migration); parity accent #2f62d8 → #6a9bff, font 13px/radius 4px giữ nguyên |
| U1 Task quick-add | dark | PASS | ok — focus lại sau toggle | ok — input giữ giá trị | ok — aria-label không đổi | Toggle qua TitleBar, không reload |
| U2 Settings CRUD | light | PASS | ok — tab "Công suất làm việc" focus() → toBeFocused | ok — ArrowRight chuyển focus sang tab "Sao lưu & Dữ liệu" | ok — heading "Cài đặt & Cấu hình công suất" visible; tab `aria-selected="true"` | Mở Settings bằng icon button có aria-label "Settings" |
| U2 Settings CRUD | dark | PASS | ok — focus không mất sau toggle | ok — ArrowRight vẫn chuyển tab | ok — heading/tab aria giữ nguyên | Parity accent đổi, font/radius không đổi |
| U3 CR detail actions | light | PASS | ok — nút "Tạo CR" focus() → toBeFocused | ok — Enter mở dialog; Escape đóng dialog (count 0) | ok — dialog có nút "Hủy" visible | Toolbar "Tạo CR" là action mở CR form |
| U3 CR detail actions | dark | PASS | ok — action focus sau toggle | ok — Enter/Escape vẫn hoạt động | ok — dialog aria/role giữ nguyên | Parity accent đổi, font/radius không đổi |
| U4 Modal forms | light | PASS | ok — field `#name` focus() → toBeFocused | ok — fill tên + mã, value đúng; Escape đóng | ok — `getByRole('dialog')` visible, field placeholder ổn định | Overlay chặn TitleBar toggle → đóng modal, toggle, mở lại: form render với palette mới (không reload) |
| U4 Modal forms | dark | PASS | ok — field focus sau mở lại | ok — Escape đóng dialog | ok — dialog role/field vẫn truy cập được | Kiểm tra thêm: không có `Modal.confirm` tĩnh (guard = 0) |
| U5 Toolbar icon buttons | light | PASS | ok — toggle + Settings focus() → toBeFocused | ok — Enter trên Settings mở heading Settings | ok — toggle `aria-label="Chuyển đổi giao diện sáng/tối"`, Settings aria-label "Settings" | Icon-only buttons đều có accessible name |
| U5 Toolbar icon buttons | dark | PASS | ok — toggle sau đổi theme vẫn focus được | ok — Enter vẫn mở Settings | ok — aria-label giữ byte-for-byte | Parity accent đổi, font/radius không đổi |
| U6 AI chat controls | light | PASS | ok — composer textbox focus() → toBeFocused | ok — "Gửi" button visible (send action có sẵn) | ok — composer `aria-label="Nội dung tin nhắn trò chuyện AI"` | Mở qua nút "Alt+3: AI Assistant" |
| U6 AI chat controls | dark | PASS | ok — composer focus lại sau toggle | ok — control giữ nguyên | ok — aria-label không đổi | Toggle đổi theme tức thì, giữ lựa chọn user (không reload) |

## Parity checks

- Control đo trực tiếp bằng `getComputedStyle(document.documentElement)`: `--accent`, `--font-size-ui`, `--radius-control`.
- Light: `--accent=#2f62d8`, dark: `--accent=#6a9bff` — đổi đúng token, không hardcode tại view.
- `--font-size-ui=13px`, `--radius-control=4px` — giữ nguyên ở cả 2 theme (không lệch size/radius).
- Toggle dùng accessible name `Chuyển đổi giao diện sáng/tối` trên TitleBar; `data-theme` đổi `light ↔ dark` qua `expect.poll`; không reload trang.
- Static API guard (`src/components/ui/__tests__/staticApiGuard.test.ts`) quét toàn `src` ngoài `ui/`: 0 unbound `message.*`/`notification.*`/`Modal.confirm` — thông báo/modal đều đi qua hook context, kế thừa `ConfigProvider` nên parity đúng.

## Defects phát hiện & cách sửa

| ID | Luồng/theme | Mô tả | Fix | Verify lại |
|----|-------------|-------|-----|------------|
| D-UAT-01 | U1 light/dark | Quick-add input disabled trên DB trống (`!crId`) nên không focus được | Không phải defect migration — behavior có sẵn. Spec dùng `task-search-input` (cùng bề mặt tasks) làm input keyboard-driven; vẫn assert aria-label quick-add | Playwright U1 pass cả 2 theme |
| D-UAT-02 | U4 light/dark | Modal overlay chặn TitleBar toggle (click timeout) | Đóng modal → toggle theme → mở lại form; assert form render với palette mới. Không sửa app (đúng behavior overlay) | Playwright U4 pass cả 2 theme |
| D-UAT-03 | lint (toàn app) | 6 unused-disable directive (severity-1 warning, exit 0) | Không sửa theo plan — pre-existing, nằm ngoài phạm vi migration; ghi nhận ở đây, không chạy `--max-warnings 0` | `npm run lint` exit 0 (0 errors, 6 warnings): `ChangeRequestModal.tsx:114`, `NormalizeDocModal.tsx:142`, `browserFileReader.ts:52`, `diagramSaveBridge.ts:11`, `FindInRemoteFiles.tsx:103`, `RemoteGitExplorer.tsx:459` |

Không có defect parity light/dark nào phát hiện được trong 6 luồng automated.

## Gates

| Gate | Lệnh | Exit | Output tóm tắt |
|------|------|------|----------------|
| Types | `npx tsc --noEmit` | 0 | 0 error |
| Lint toàn app | `npm run lint` (= `eslint src`) | 0 | 0 errors, 6 unused-disable warnings (D-UAT-03) |
| Focused Vitest | `npm run test:foundation` | 0 | 14 files / 83 tests pass |
| Build | `npm run build` | 0 | `tsc && vite build` ✓ built in 1.69s |
| Static API guard | `npx vitest run src/components/ui/__tests__/staticApiGuard.test.ts --bail=1` (trong foundation) | 0 | 0 unbound call ngoài `ui/` |
| Inline sweep | `npx vitest run src/components/ui/__tests__/inlineStyleSweep.test.ts --bail=1` (trong foundation) | 0 | 8 wave manifests, 0 token literal |
| Playwright 6 luồng | `npx playwright test e2e/adoption.spec.ts` | 0 | 6 passed (30.7s), Chrome 157 channel `chrome` |

## Human check (D-12 — end-of-phase)

`workflow.human_verify_mode: end-of-phase` → human verification gộp ở lúc đóng phase, không phải checkpoint riêng trong plan.
Sếp mở app thật (`npm run dev` / `tauri dev`) trên Chrome, bấm nút "Chuyển đổi giao diện sáng/tối" trên TitleBar, đi lần lượt 6 luồng U1..U6 ở cả light và dark, đối chiếu matrix ở trên: quan sát focus ring 2px, Tab/Enter/Escape, aria-label icon button, parity màu/font/size.

**Trạng thái:** chờ sếp xác nhận trên Chrome thật. Automated Playwright đã xanh 6/6; đây là bằng chứng cấu trúc/aria/parity token, không thay thế quan sát focus ring bằng mắt (xem `50-VALIDATION.md` §Manual-Only Verifications).

---
*Phase: 50-full-app-adoption · Generated: 2026-11-21*
