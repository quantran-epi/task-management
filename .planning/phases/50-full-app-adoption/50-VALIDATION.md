---
phase: 50
slug: full-app-adoption
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-21
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Nguồn: `50-RESEARCH.md` §Validation Architecture (2026-11-21).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (jsdom) + Playwright 1.63.0 |
| **Config file** | `vite.config.ts` (test block), `playwright.config.ts`, `tests/setup.ts` |
| **Quick run command** | `npm run test:foundation` |
| **Full focused command** | `npx vitest run src/components/ui/__tests__ --bail=1` |
| **Full suite command** | Không dùng — memory rule cấm chạy full Vitest suite (>1 giờ). Chỉ chạy scoped paths |
| **E2E command** | `npm run test:e2e` (Playwright, webServer Vite tự start) |
| **Estimated runtime** | ~30s focused Vitest, ~2–5 phút E2E |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit && npm run lint && npm run test:foundation`
- **After every plan wave:** `eslint <các file đã migrate>` + Vitest liên quan + `npm run build`
- **Before `/gsd-verify-work`:** `eslint src` + `test:foundation` + `build` + `npm run test:e2e` xanh + `grep -rnE 'Modal\.confirm\(|message\.(success|error|warning|warn|info|loading|open|destroy)\(|notification\.(success|error|warning|warn|info|loading|open|destroy)\(' src ...` = 0 (bắt buộc chặn 4 call `message.loading(` đã migrate ở wave 05/06/07/08)
- **Max feedback latency:** ~60s (không tính E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | ADOPT-04 | — | N/A | combined gate | `npx tsc --noEmit && npm run lint && npm run test:foundation` | ✅ | ✅ green (50-01-SUMMARY) |
| 50-01-02 | 01 | 1 | ADOPT-01 | T-50-01 | Static API không giữ global instance | unit (guard) | `npx vitest run src/components/ui/__tests__/staticApiGuard.test.ts --bail=1` | ✅ | ✅ green (mở rộng quét toàn src ở 50-09) |
| 50-01-03 | 01 | 1 | ADOPT-02 | — | N/A | unit (sweep) | `npx vitest run src/components/ui/__tests__/inlineStyleSweep.test.ts --bail=1` | ✅ | ✅ green (8 manifest ở 50-09) |
| 50-01-04 | 01 | 1 | ADOPT-03 | — | N/A | e2e | `npm run test:e2e -- e2e/adoption.spec.ts` | ✅ | ✅ green 6/6 (hoàn thiện ở 50-09) |
| 50-01-05 | 01 | 1 | ADOPT-04 | — | N/A | unit (config) | `npx vitest run src/components/ui/__tests__/guardConfig.test.ts --bail=1` | ✅ | ✅ green (assert `lint === 'eslint src'` ở 50-09) |
| 50-01-06 | 01 | 1 | ADOPT-01 | — | `ThemeAppHolder` mount, context holder render | smoke | `npx tsc --noEmit && npm run test:foundation` | ✅ | ✅ green (5 branch, 50-01-SUMMARY) |
| 50-02-xx | 02 | 2 | ADOPT-01, 02 | T-50-01 | Hooks thay static API; token qua wrapper | lint + sweep | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ | ✅ green (50-02-SUMMARY) |
| 50-03-xx | 03 | 3 | ADOPT-01, 02 | T-50-01 | Form validation copy tiếng Việt giữ nguyên | lint + sweep + focused Vitest | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ | ✅ green (50-03-SUMMARY) |
| 50-04-xx | 04 | 4 | ADOPT-01, 02, 03 | T-50-01 | Keyboard/aria nguyên vẹn | lint + E2E | `npm run lint && npm run test:e2e -- e2e/adoption.spec.ts` | ✅ | ✅ green (50-04-SUMMARY; smoke chạy ở 50-09) |
| 50-05-xx | 05 | 5 | ADOPT-03, 04 | — | Light/dark parity 6 luồng | e2e + gate | `npm run test:e2e -- e2e/adoption.spec.ts && npm run build` | ✅ | ✅ green (50-05-SUMMARY; smoke + build ở 50-09) |
| 50-06-xx | 06 | 6 | ADOPT-01, 02 | T-50-01 | Hooks thay static API, không singleton | lint + sweep + focused Vitest | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ | ✅ green (50-06-SUMMARY) |
| 50-07-xx | 07 | 7 | ADOPT-01, 02 | T-50-01 | Copy/aria giữ nguyên | lint + sweep + focused Vitest | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ | ✅ green (50-07-SUMMARY) |
| 50-08-xx | 08 | 8 | ADOPT-01, 02 | T-50-01 | Notify callback thay static API (D-06) | lint + sweep + focused Vitest | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ | ✅ green (50-08-SUMMARY) |
| 50-09-01 | 09 | 9 | ADOPT-04 | T-50-SC | `lint = eslint src`, không cài package | tsc + lint + foundation + build + grep | `npx tsc --noEmit && npm run lint && npm run test:foundation && npm run build` | ✅ | ✅ green: exit 0/0/0/0; static guard 0 violation |
| 50-09-02 | 09 | 9 | ADOPT-03 | T-50-01/03/11 | 6 luồng × 2 theme, focus/keyboard/aria | e2e + UAT doc + VALIDATION | `npx playwright test e2e/adoption.spec.ts` | ✅ | ✅ green: 6 pass (30.7s); 50-UAT.md 12 dòng |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/components/ui/__tests__/staticApiGuard.test.ts` — chặn `message.*`/`notification.*`/`Modal.confirm` tĩnh ngoài `ui/` (D-07); regex gồm `loading`/`open`/`destroy`/`warn`; 50-09 mở rộng quét toàn `src`, 0 unbound call. Ghi chú: raw grep vẫn thấy 490 `message.*(`/490 call nhưng tất cả là instance từ `useMessage()` (hợp lệ D-05); 1 `message.loading` trong `DocumentSetDetail.tsx:443` cũng là hook-bound — semantic guard (không phải raw grep) là nguồn truth.
- [x] `src/components/ui/__tests__/inlineStyleSweep.test.ts` — chặn token-valued inline style trên view đã migrate (D-10); 50-09 assert từng manifest, 8/8 sạch
- [x] `e2e/adoption.spec.ts` — smoke 6 luồng × light/dark (U1..U6), focus/keyboard/aria; 6/6 pass Chrome 157
- [x] `src/components/ui/__tests__/guardConfig.test.ts` — assert `lint === 'eslint src'`, `lint:adoption` undefined (D-11)
- [x] `eslint.config.mjs` — comment IN-01 cập nhật trạng thái resolved
- [x] `AppIntelliJ.tsx` — mount `ThemeAppHolder` + `useTaskMateModal()` contextHolder (50-01)

*Không có gap framework/config — Vitest/Playwright/ESLint đã sẵn sàng.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Light/dark parity trực quan 6 luồng trên Chrome | ADOPT-03 | E2E smoke kiểm tra cấu trúc/aria, không so sánh pixel từng control | Chuyển theme qua TitleBar toggle; quan sát task quick-add, settings CRUD, CR detail, modal forms, toolbar icons, AI chat controls ở cả 2 theme |
| Focus ring / keyboard nav bằng mắt | ADOPT-03 | Playwright `getByRole` kiểm tra accessible name, không kiểm tra độ dày/đúng token của focus ring | Tab qua từng control, quan sát focus indicator; So sánh light/dark |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify hoặc Wave 0 dependencies
- [x] Sampling continuity: không có 3 task liên tiếp không có automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (tsc ~5s, lint ~5s, foundation ~12s, build ~2s; E2E 30.7s riêng)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Static API guard toàn src = 0 unbound call (D-05/D-07), regex gồm `loading`/`open`/`destroy`/`warn`. Raw grep 490 match là hook-bound instance hợp lệ — semantic guard là nguồn truth; `message.loading` còn lại ở `DocumentSetDetail.tsx:443` là `useMessage()` instance.

**Approval:** approved 2026-11-21 — automated gates xanh. Human check (sếp quan sát 6 luồng × 2 theme trên Chrome thật) là end-of-phase gate, trạng thái chờ xác nhận trong `50-UAT.md` §Human check; không tự động đánh dấu đã quan sát.
