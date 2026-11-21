---
phase: 50
slug: full-app-adoption
status: draft
nyquist_compliant: false
wave_0_complete: false
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
- **Before `/gsd-verify-work`:** `eslint src` + `test:foundation` + `build` + `npm run test:e2e` xanh
- **Max feedback latency:** ~60s (không tính E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | ADOPT-04 | — | N/A | combined gate | `npx tsc --noEmit && npm run lint && npm run test:foundation` | ✅ | ⬜ pending |
| 50-01-02 | 01 | 1 | ADOPT-01 | T-50-01 | Static API không giữ global instance | unit (guard) | `npx vitest run src/components/ui/__tests__/staticApiGuard.test.ts --bail=1` | ❌ W0 | ⬜ pending |
| 50-01-03 | 01 | 1 | ADOPT-02 | — | N/A | unit (sweep) | `npx vitest run src/components/ui/__tests__/inlineStyleSweep.test.ts --bail=1` | ❌ W0 | ⬜ pending |
| 50-01-04 | 01 | 1 | ADOPT-03 | — | N/A | e2e | `npm run test:e2e -- e2e/adoption.spec.ts` | ❌ W0 | ⬜ pending |
| 50-01-05 | 01 | 1 | ADOPT-04 | — | N/A | unit (config) | `npx vitest run src/components/ui/__tests__/guardConfig.test.ts --bail=1` | ✅ | ⬜ pending |
| 50-01-06 | 01 | 1 | ADOPT-01 | — | `ThemeAppHolder` mount, context holder render | smoke | `npx tsc --noEmit && npm run test:foundation` | ⚠️ chưa mount | ⬜ pending |
| 50-02-xx | 02 | 2 | ADOPT-01, 02 | T-50-01 | Hooks thay static API; token qua wrapper | lint + sweep | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ W0 | ⬜ pending |
| 50-03-xx | 03 | 3 | ADOPT-01, 02 | T-50-01 | Form validation copy tiếng Việt giữ nguyên | lint + sweep + focused Vitest | `npm run lint && npx vitest run src/components/ui/__tests__ --bail=1` | ✅ W0 | ⬜ pending |
| 50-04-xx | 04 | 4 | ADOPT-01, 02, 03 | T-50-01 | Keyboard/aria nguyên vẹn | lint + E2E | `npm run lint && npm run test:e2e -- e2e/adoption.spec.ts` | ✅ W0 | ⬜ pending |
| 50-05-xx | 05 | 5 | ADOPT-03, 04 | — | Light/dark parity 6 luồng | e2e + gate | `npm run test:e2e -- e2e/adoption.spec.ts && npm run build` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/ui/__tests__/staticApiGuard.test.ts` — chặn `message.*`/`notification.*`/`Modal.confirm` tĩnh ngoài `ui/` (D-07)
- [ ] `src/components/ui/__tests__/inlineStyleSweep.test.ts` — chặn token-valued inline style trên view đã migrate (D-10)
- [ ] `e2e/adoption.spec.ts` — smoke 6 luồng × light/dark (U1..U6), focus/keyboard/aria
- [ ] `src/components/ui/__tests__/guardConfig.test.ts` — sửa assert `lint:adoption` → `lint === 'eslint src'` (D-11)
- [ ] `eslint.config.mjs` — cập nhật comment IN-01 sau khi nâng `lint`
- [ ] `AppIntelliJ.tsx` — mount `ThemeAppHolder` + `useTaskMateModal()` contextHolder

*Không có gap framework/config — Vitest/Playwright/ESLint đã sẵn sàng.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Light/dark parity trực quan 6 luồng trên Chrome | ADOPT-03 | E2E smoke kiểm tra cấu trúc/aria, không so sánh pixel từng control | Chuyển theme qua TitleBar toggle; quan sát task quick-add, settings CRUD, CR detail, modal forms, toolbar icons, AI chat controls ở cả 2 theme |
| Focus ring / keyboard nav bằng mắt | ADOPT-03 | Playwright `getByRole` kiểm tra accessible name, không kiểm tra độ dày/đúng token của focus ring | Tab qua từng control, quan sát focus indicator; So sánh light/dark |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify hoặc Wave 0 dependencies
- [ ] Sampling continuity: không có 3 task liên tiếp không có automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-21
