# 59-CHECK — Plan Check Phase 59 (re-check sau sửa blocker)

Ngày: 2026-11-22. Phạm vi: 59-PATTERNS.md + 59-01..59-21-PLAN.md. Goal-backward trước execute. Đối chiếu verdict BLOCK cũ (4 blocker B1-B4, 2 flag F1-F2).

## VERDICT: PASS

4 blocker + 2 flag cũ đều ĐÃ SỬA. 0 blocker, 0 warning còn lại. Cho phép execute. Mọi cấu trúc cũ giữ nguyên (56 control / tuyến tính 01->21 / human gate / không fix dồn / không full Vitest).

## Kiểm tra blocker cũ — đã đóng

- **B1 (fixture map 56 control) — ĐÓNG.** `59-PATTERNS.md` §1.1 định nghĩa `CONTROL_REGISTRY` 56 entry, mỗi entry `{id, wrapperSelector, referenceSelector, proofSelector, states, fixture}`. Plan 01 Task 2 export đủ 56 id (Test 7 kiểm tra map, thiếu → FAIL); §4 registry đúng 56 dòng. Plan 01 Task 1 mở rộng proof `oi-prototype/src/main.jsx` route `?fixture=<id>` render ĐỦ 56 control bằng CSS module vendored gốc; id không có analog 7 họ (date-picker/time-picker/table/tree) mount component thật từ `openidea/src/ui/` qua reference `?fixture=<id>`. Selector không resolve = FAIL CỨNG, không skip id. Diff 56 task id vs 56 registry id: MATCH 56/56.
- **B2 (setTheme riêng từng app) — ĐÓNG.** `59-PATTERNS.md` §1.2 bảng 3 app: TaskMate bấm `getByRole('button',{name:'Chuyển đổi giao diện sáng/tối'})` + poll `.taskmate-workbench-theme`; proof bấm `button.themeBtn` hoặc evaluate `document.documentElement.dataset.theme`; reference evaluate attr root (themeWatch/themes), poll ổn định 2 lần. Plan 01 Task 1 action viện dẫn đúng 3 chiến lược, "KHÔNG dùng selector chung", assert hash L != D cả 3 app.
- **B3 (pre-flight start :1420/:5180, fail cứng) — ĐÓNG.** `59-PATTERNS.md` §0/§0.1 bảng cwd+lệnh start cho 3 app (OpenIDEA SP/openidea `npm run dev` -> :1420; proof SP/oi-prototype -> :5180; TaskMate Playwright webServer -> :5173). `waitOnUrl` 30s/500ms; unreachable → throw + nonzero, KHÔNG `test.skip`, skip chỉ khi có lý do đã log. Plan 01 Task 1 action + Test 8 gate + plan 21 Task 1 đều gọi pre-flight.
- **B4 (smoke plan 01 tự nhất quán) — ĐÓNG.** Plan 01 Task 3 tạo `src/components/ui/__tests__/parity-button.test.tsx` NGAY TRONG PLAN 01 (fireEvent/userEvent + assertion state đổi, không assert tĩnh), smoke dùng `button` (có analog thật 3 app). Chế độ `SMOKE=1` ở PATTERNS §6 + Task 2 Test 9 + Task 3 verify: validate cùng tiêu chí (0)-(5),(7), KHÔNG nới gate. Plan 01 `files_modified` đã liệt kê focused test. Plan 02 Task 1 chỉ mở rộng test có sẵn. Không đụng `button.tsx`.

## Kiểm tra flag cũ — đã đóng

- **F1 (independent reviewer/verifier trước handoff, human pass duy nhất) — ĐÓNG.** `59-PATTERNS.md` HGC-06 + §1 bước 6: trước handoff bắt buộc code review + verifier độc lập (không phải executor), ghi findings vào artifact, reviewer KHÔNG gán pass. Mọi control task (56) có cụm "Independent code review + verifier khác executor ... reviewer KHÔNG gán pass" — 56/56 (60 lần HGC-06 toàn phase). `.planning/config.json` xác nhận `code_review:true` + `verifier:true` → authority cho cơ chế review. PATTERNS là authority cho chuỗi handoff. Chữ "pass" của sếp = điều kiện DUY NHẤT (HGC-01/02/06). Plan 21 Task 2 nhắc lại F1. Không còn "chỉ gán nhãn PAR-04".
- **F2 (data hook cho 3 wrapper) — ĐÓNG.** `59-PATTERNS.md` §1.3 map fallback. Plan 15 Task 3 (status-dot): thêm `data-oi-control="status-dot"` + `data-state`, fallback `[role="img"], span[aria-hidden="true"]` lọc `--ui-status-color`. Plan 19 Task 2 (config-provider): thêm `data-oi-control="config-provider"` + `data-state`, fallback `.taskmate-theme-context[data-theme]`. Plan 20 Task 2 (empty): thêm `data-oi-control="empty"` + `data-state`, fallback `.ant-empty`. Mọi fallback ghi rõ trong CONTROL_REGISTRY, selector không xác định = FAIL CỨNG.

## Regression check — không có hồi quy

- **56/56 task checkpoint:** plan 02-19 = 18x3 = 54, plan 20 = 2 → 56 control checkpoint `checkpoint:human-verify` `gate="blocking"`, đúng thứ tự registry, khớp id 56/56. Plan 21 thêm 1 checkpoint ký duyệt cuối (ngoài 56, đúng thiết kế). Tổng `checkpoint:human-verify` = 57.
- **Tuyến tính 01->21:** `depends_on` wave N = [N-1], 01 = [], wave 1..21, không chu trình, không forward ref.
- **Không auto-pass:** mọi PASS.json `status:"pending-human"`, `humanVerdict:null`; FINAL-GATE.json `humanSignoff:"pending"`; chuyển sang pass chỉ sau chữ "pass" của sếp. Gate integrity chặn tự gán (Test 4).
- **Không fix dồn:** HGC-02 lặp ở mọi control task; 1 control = 1 checkpoint; plan `autonomous:false` cho 02-21.
- **Không full Vitest:** mọi lệnh verify là scoped (`parityEvidenceIntegrity.test.ts`, `parity-<id>.test.tsx`, prefix `parity-`), có `--grep`/filter; các plan ghi rõ "Không chạy full Vitest". Không watch mode.
- **Scope:** plan 01 = 3 task (1 auto + 1 tdd + 1 auto); control plan 2-3 task/plan; plan 21 = 2 task. Không vượt ngưỡng.
- **Không ngôn ngữ thu hẹp phạm vi** (v1/simplified/stub/static-for-now/future/placeholder); không dependency/PWA mới.
- Requirements NAT-02, PAR-01..04 có trong ROADMAP/REQUIREMENTS và frontmatter mọi plan.

## Dimensions bị SKIP (giữ nguyên verdict cũ)

- D8 Nyquist: SKIP — phase không có RESEARCH.md/VALIDATION.md.
- D7c/11/12: SKIP — không responsibility map / RESEARCH.md / PATTERNS dạng File Classification.

## Kết luận

4 blocker + 2 flag đã đóng bằng artifact cụ thể (selector map 56 id, theme 3 app, pre-flight fail cứng, smoke button tự nhất quán, HGC-06 mọi control, F2 hooks), có lệnh verify đi kèm. Không blocker còn lại. Execute phase 59 theo thứ tự 01->21, mỗi control chờ chữ "pass" của sếp.
