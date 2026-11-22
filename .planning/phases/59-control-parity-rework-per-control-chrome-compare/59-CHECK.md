# 59-CHECK — Plan Check Phase 59

Ngày: 2026-11-22. Phạm vi: 59-PATTERNS.md + 59-01..59-21-PLAN.md. Goal-backward trước khi execute.

## VERDICT: BLOCK

4 BLOCKER, 2 FLAG. Không execute cho tới khi sửa 4 blocker. Mọi thứ khác (coverage 56/56, tuyến tính 01->21, human gate, không fix dồn, không full Vitest) ĐÚNG — giữ nguyên.

## Đã verify ĐÚNG (không sửa)

- 56 control registry (59-PATTERNS §4) khớp đúng 56 task `checkpoint:human-verify`, đúng thứ tự, không sót/không trùng. 18 plan x 3 + plan 20 x 2 = 56.
- depends_on tuyến tính `01->02->...->21`, wave 1..21, không chu trình, không forward ref, ref dạng `59-01` đúng convention phase 54/53.
- requirements: NAT-02, PAR-01..04 đều có trong REQUIREMENTS.md và frontmatter plan. PAR-01..04 tồn tại, map phase 59.
- Mỗi control task có `files`/`action` (PAR-01..03, HGC-01/02/05)/`what-built`/`how-to-verify` (2-3 bước tiếng Việt)/`resume-signal`; PASS.json `pending-human`, `humanVerdict:null`; chờ chữ "pass" của sếp. Không auto-pass, không fix dồn.
- Không có ngôn ngữ thu hẹp phạm vi (v1/simplified/static/stub/future...). Không full Vitest (chỉ gate + focused, có filter). Không dependency/PWA mới. Scope 2-3 task/plan.
- Ports đúng: TaskMate :5173 (vite.config.ts), proof :5180 (oi-prototype/vite.config.js), OpenIDEA :1420 (openidea/vite.config.ts) — khớp PROOF.md. Selector ổn định tồn tại trên 53/56 wrapper.
- Dimension 8 (Nyquist): SKIP — phase không có RESEARCH.md. Dimension 7c/11/12: SKIP — không có responsibility map / RESEARCH.md / PATTERNS dạng File Classification.

## BLOCKERS (phải sửa trước execute)

### B1. Harness không capture được 56 control trên 3 app (goal-backward cốt lõi)
- Plan: 01 (Task 1/3), ảnh hưởng 02-21.
- `PARITY_CONTROL=<id>` được giả định là tìm được control đó trong cả 3 app. Thực tế: proof app `oi-prototype/src/main.jsx` chỉ render ~7 họ control (Button, Checkbox/Radio/Toggle, Input, Select/List, Tabs, Chip, Dialog) — KHÔNG có date-picker, time-picker, table, tree,...; OpenIDEA `:1420` là IDE đầy đủ nhưng plan không có selector map vị trí 56 control. Không plan nào mở rộng fixture app hay định nghĩa map selector.
- Hệ quả trực tiếp: smoke plan 01 dùng `date-picker` — control KHÔNG tồn tại trong proof app -> không có evidence cặp.
- Sửa: thêm task/điều kiện đảm bảo mỗi trong 56 control render được ở reference + proof (mở rộng fixture hoặc bảng selector map theo id), hoặc đổi chiến lược capture có fixture riêng. Ghi rõ trong PATTERNS §1.

### B2. `setTheme` sai cho 2/3 app -> không capture được light+dark cặp
- Plan: 01 Task 1 (`setTheme(page, theme)` bấm nút "Chuyển đổi giao diện sáng/tối" + poll `data-theme`).
- Nhãn đó chỉ có ở TaskMate (`src/workbench/TitleBar.tsx:317`). Proof app dùng nút `.themeBtn` nhãn `Theme: light` (`oi-prototype/src/main.jsx:213`). OpenIDEA `:1420` KHÔNG có nút đó — theme do `themeWatch.ts`/Tauri IPC. poll `data-theme` ở wrapper workbench là TaskMate-specific (`native-controls-parity.spec.ts`).
- Sửa: định nghĩa chiến lược theme riêng từng app (proof: `.themeBtn`/`documentElement.dataset.theme`; reference: set `data-theme` trên `documentElement` qua evaluate hoặc hook themeWatch) + poll phù hợp. Không dùng một selector chung.

### B3. Không plan nào khởi động reference :1420 + proof :5180
- Playwright `webServer` chỉ boot TaskMate `:5173`. PATTERNS §0/§1 chỉ ghi URL, không có bước "start 2 app trước". Harness `test.skip` khi unreachable (plan 01 Task 1).
- Hệ quả: nếu 2 app không chạy -> skip -> không artifact -> done criteria (`screenshot L/D, PASS.json`) không đạt; gate không fail cứng nên dễ tưởng xanh.
- Sửa: thêm pre-flight task khởi động 2 app (kèm cwd/lệnh) trong plan 01, và đổi `test.skip` thành fail rõ ràng khi reference/proof unreachable (skip chỉ khi có lý do đã log, không tự coi là xanh).

### B4. Smoke plan 01 tự mâu thuẫn — gate chắc chắn FAIL
- Plan 01 Task 3 chạy `parityEvidenceIntegrity.test.ts` chế độ single-control cho `date-picker`. Gate (plan 01 Task 2 + PATTERNS §6) bắt buộc tồn tại `src/components/ui/__tests__/parity-date-picker.test.tsx` (có fireEvent/userEvent + assertion state đổi) VÀ interactions trace đầy đủ.
- Thực tế: file test đó KHÔNG tồn tại (sẽ tạo ở plan 05 Task 1, phụ thuộc 02-04); plan 01 `files_modified` không liệt kê; plan 01 cấm sửa `date-picker.tsx`. 0 file `parity-*.test.tsx` hiện có. -> gate FAIL ngay ở plan 01 -> verify không xong -> chặn 20 plan sau.
- Sửa: smoke dùng control có focused test thật (tạo focused test smoke trong plan 01), hoặc tách gate: chế độ smoke chỉ validate schema/harness, chế độ control validate full behavior. Không nới tiêu chí gate để "cho qua".

## FLAGS (nên sửa, không chặn execute nếu đã xử lý blocker)

### F1. PAR-04 clause "code review + verifier độc lập xác nhận từng control trước khi handoff" không có task
- REQUIREMENTS PAR-04 + ROADMAP SC5 yêu cầu review + verifier độc lập PER CONTROL trước handoff. Control plan chỉ có "self-verify" (cùng executor). PATTERNS HGC-04 thu hẹp PAR-04 thành human gate — sếp gate đã đầy đủ, nhưng clause độc lập không được implement ở task nào.
- Sửa: hoặc thêm bước reviewer/verifier độc lập vào mỗi control task, hoặc ghi rõ artifact planning rằng config `code_review`/`verifier`-level workflow thỏa clause này và PATTERNS là nguồn authority. Tránh "claims PAR-04 nhưng chỉ gán nhãn".

### F2. 3 wrapper thiếu stable selector `data-oi-control`
- `config-provider.tsx`, `empty.tsx`, `status-dot.tsx` không có `data-oi-control`; 52-UI-SPEC §10 yêu cầu mọi control có `data-oi-control` + `data-state`. Control plan tương ứng (plan 19 task 2, plan 20 task 2, plan 15 task 3) không nhắc thêm; harness `computed(page, selector)` dùng selector cố định -> selector cho 3 control này không xác định.
- Sửa: thêm bước thêm/xác nhận selector trong 3 control task (hoặc map selector thay thế trong harness).

## Required revisions (tóm tắt cho planner)

1. B1: fixture/selector-map cho 56 control trên reference+proof; đổi hoặc bổ sung smoke control.
2. B2: theme strategy riêng từng app trong harness.
3. B3: pre-flight start :1420/:5180 + fail-chard khi unreachable.
4. B4: sửa smoke để gate có focused test thật (tạo trong plan 01) hoặc tách chế độ gate.
5. F1: làm rõ/implement independent verifier per control cho PAR-04.
6. F2: selector cho config-provider/empty/status-dot.

Sau khi sửa 4 blocker, re-check. Giữ nguyên cấu trúc 01 harness / 02-20 controls / 21 final gate.
