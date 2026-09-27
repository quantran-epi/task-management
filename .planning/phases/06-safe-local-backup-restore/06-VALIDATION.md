---
phase: 06
slug: safe-local-backup-restore
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-27
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + @testing-library/react 16.3.3 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/services/backup/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/services/backup/` (or focused component test)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | BACK-01 | T-06-01 | Export payload excludes sensitive local tokens/settings, contains envelope metadata | unit | `npx vitest run tests/services/backup/exportBackup.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | BACK-03 | T-06-02 | Strict schema and referential validation rejects malformed/tampered/orphan JSON | unit | `npx vitest run tests/services/backup/validateBackup.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | BACK-04 | T-06-03 | Atomic Dexie transaction creates pre-import snapshot and restores data | integration | `npx vitest run tests/services/backup/restoreBackup.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | BACK-05 | T-06-04 | Validation failure or restore exception aborts transaction without modifying DB | integration | `npx vitest run tests/services/backup/restoreFailure.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | BACK-02 | T-06-02 | Import preview modal displays envelope version, timestamp, and record count comparison | component | `npx vitest run tests/components/settings/ImportPreviewModal.test.tsx` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | BACK-04 | T-06-03 | Overwrite button disabled until user types exact keyword "RESTORE" | component | `npx vitest run tests/components/settings/ImportPreviewModal.test.tsx` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | UX-04 | — | Off-screen aria-live status regions announce export, import, restore, and rollback events | component | `npx vitest run tests/components/common/AriaLiveRegion.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/backup/exportBackup.test.ts` — stubs for BACK-01
- [ ] `tests/services/backup/validateBackup.test.ts` — stubs for BACK-03
- [ ] `tests/services/backup/restoreBackup.test.ts` — stubs for BACK-04
- [ ] `tests/services/backup/restoreFailure.test.ts` — stubs for BACK-05
- [ ] `tests/components/settings/ImportPreviewModal.test.tsx` — stubs for BACK-02, BACK-04
- [ ] `tests/components/common/AriaLiveRegion.test.tsx` — stubs for UX-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native browser file download dialog triggered | BACK-01 | Browser download prompt cannot be inspected purely in Node/jsdom | Click "Download Backup JSON" and verify browser file download starts with named file `personal-task-planner-backup-*.json`. |
| Native file drag-and-drop onto Ant Upload.Dragger | BACK-02 | DOM drag events across desktop OS boundaries | Drag JSON file from desktop into Dragger area and confirm file is received and parsed. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-27
