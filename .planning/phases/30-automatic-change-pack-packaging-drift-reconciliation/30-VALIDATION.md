---
phase: "30"
slug: "automatic-change-pack-packaging-drift-reconciliation"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-06"
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run src/services/__tests__/changePackPackager.test.ts` |
| **Full suite command** | `npx vitest run src/services/__tests__/changePackPackager.test.ts src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run focused phase test suite (Do NOT run full suite per memory rule)
- **Before `/gsd-verify-work`:** Focused suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | SDLC-REPO-04 | T-30-01 | Shell injection prevention & zip generation | unit | `npx vitest run src/services/__tests__/changePackPackager.test.ts` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | SDLC-REPO-05 | T-30-02 | Desktop-scaled limits enforcement | unit | `npx vitest run src/services/__tests__/changePackPackager.test.ts -t "limits"` | ❌ W0 | ⬜ pending |
| 30-02-01 | 02 | 2 | SDLC-REPO-07 | T-30-03 | Step 4 snapshot auto-packaging & stepper | integration | `npx vitest run src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx -t "auto-package"` | ❌ W0 | ⬜ pending |
| 30-02-02 | 02 | 2 | SDLC-REPO-04 | T-30-04 | Accordion manual dropzone fallback | integration | `npx vitest run src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx -t "fallback"` | ❌ W0 | ⬜ pending |
| 30-03-01 | 03 | 3 | SDLC-REPO-04 | T-30-01 | Error handling & remote drift warning | integration | `npx vitest run src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx -t "drift warning"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/changePackPackager.test.ts` — stubs for SDLC-REPO-04, SDLC-REPO-05
- [ ] `src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx` — integration tests for Step 4 auto-packaging & fallback

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH remote server interaction | SDLC-REPO-04 | Cần server SSH thực tế có repo Git | Kiểm tra kết nối và đóng gói thử trên server dev nếu có cấu hình |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
