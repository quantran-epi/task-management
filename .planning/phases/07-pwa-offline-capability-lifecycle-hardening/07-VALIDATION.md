---
phase: 07
slug: pwa-offline-capability-lifecycle-hardening
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-27
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library 16.3.3 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/components/pwa/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/components/pwa/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | PWA-01 | T-07-SC | Package audit approved; ambient types and test mock created | unit | `npx vitest run tests/setup.ts` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | PWA-01 | T-07-02 | Scoped manifest and iOS guidance modal | unit | `npx vitest run tests/components/pwa/InstallButton.test.tsx tests/components/pwa/IosInstallModal.test.tsx` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | PWA-02 | T-07-01 | Periodic focus check and accessible status transition | unit | `npx vitest run tests/hooks/useNetworkStatus.test.tsx` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | PWA-03 | T-07-03 | Form guard prevents reload during active dirty forms | unit | `npx vitest run tests/components/pwa/UpdateBanner.test.tsx` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | PWA-06 | T-07-04 | Defensive StorageManager feature detection and startup request | unit | `npx vitest run tests/setup.ts` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 3 | PWA-06 | T-07-04 | Quota progress display and non-intrusive advisory banner | unit | `npx vitest run tests/components/settings/PwaStatusCard.test.tsx tests/components/settings/StoragePersistenceCard.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/mocks/pwaRegister.ts` — mock for `virtual:pwa-register/react` (created in 07-01 Task 1)
- [ ] `tests/components/pwa/InstallButton.test.tsx` — stubs for PWA-01, PWA-06 (created in 07-01 Task 2)
- [ ] `tests/components/pwa/IosInstallModal.test.tsx` — stubs for PWA-01, D-06 (created in 07-01 Task 2)
- [ ] `tests/hooks/useNetworkStatus.test.tsx` — stubs for PWA-02, D-09 (created in 07-02 Task 1)
- [ ] `tests/components/pwa/UpdateBanner.test.tsx` — stubs for PWA-03, D-01, D-02 (created in 07-02 Task 2)
- [ ] `tests/components/settings/StoragePersistenceCard.test.tsx` — stubs for PWA-06, D-14, D-15 (created in 07-03 Task 2)
- [ ] `tests/components/settings/PwaStatusCard.test.tsx` — stubs for PWA-02, PWA-06, D-12 (created in 07-03 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual browser PWA install banner prompt | PWA-01 | Browser security restricts native install prompt simulation in Node jsdom | Test in Chrome/Edge by serving build on localhost, verify install prompt in address bar and header button |
| Safari iOS Add to Home Screen flow | PWA-01 | Requires physical iOS device or simulator | Open in mobile Safari, click Share icon, tap Add to Home Screen |
| Real offline reload on GitHub Pages subpath | PWA-02 | Service worker network interception requires actual browser environment | Run preview build, open DevTools -> Network -> Offline, hard refresh `/task-management/` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-27
