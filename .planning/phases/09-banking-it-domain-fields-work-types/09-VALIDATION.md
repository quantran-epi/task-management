---
phase: "09"
slug: "banking-it-domain-fields-work-types"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-28"
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 with @testing-library/react 16.3.3 and fake-indexeddb 6.2.5 |
| **Config file** | `vite.config.ts` (`test.environment: 'jsdom'`, `test.setupFiles: ['./tests/setup.ts']`) |
| **Quick run command** | `npx vitest run tests/domain/inheritance.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/domain/inheritance.test.ts` (or relevant test target)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | SHB-05 | T-09-03 | Dexie v1 to v2 migration backfills missing fields without data loss | Integration | `npx vitest run tests/db/schemaV2Migration.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | SHB-05 | T-09-04 | Backup export produces schemaVersion 2 and import normalizes v1 backups | Unit / Integration | `npx vitest run tests/services/backup/v2Compatibility.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | SHB-01 | T-09-01 | Zod validates max 10 tags, max 50 chars, trimmed, deduplicated for opsOwners | Unit | `npx vitest run tests/db/repos.test.ts` | ✅ (needs v2 updates) | ⬜ pending |
| 09-02-02 | 02 | 2 | SHB-02 | T-09-01 | Zod validates max 10 tags, max 50 chars, trimmed, deduplicated for businessAnalysts | Unit | `npx vitest run tests/db/repos.test.ts` | ✅ (needs v2 updates) | ⬜ pending |
| 09-02-03 | 02 | 2 | SHB-03 | — | Nearest-ancestor inheritance resolves Milestone then Project tags when child empty | Unit | `npx vitest run tests/domain/inheritance.test.ts` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 3 | SHB-04 | — | Tasks default to workType 'code'; all 7 work types supported with triple encoding | Unit / Component | `npx vitest run tests/components/WorkTypeBadge.test.tsx` | ❌ W0 | ⬜ pending |
| 09-03-02 | 03 | 3 | SHB-03 | T-09-02 | Inherited tags render dashed border and origin tooltip; direct tags render solid | Component | `npx vitest run tests/components/TaskTable.test.tsx` | ✅ (needs v2 updates) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/domain/inheritance.test.ts` — covers SHB-03 inheritance resolution logic across task, milestone, and project
- [ ] `tests/components/WorkTypeBadge.test.tsx` — covers SHB-04 triple encoding, color mappings, and icons for all 7 work types
- [ ] `tests/db/schemaV2Migration.test.ts` — covers SHB-05 Dexie v1 -> v2 upgrade, multi-entry indexing, and record backfilling
- [ ] `tests/services/backup/v2Compatibility.test.ts` — covers SHB-05 backup export schemaVersion 2 and backward-compatible v1 payload import/backfill

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tag autocomplete dropdown UX | SHB-01, SHB-02 | Visual inspection of Select mode="tags" dropdown styling and Enter-to-create behavior in browser | Open Project/Milestone/Task modal, type new name, press Enter, verify tag appears and is added to autocomplete for subsequent inputs |
| Inherited tag hover tooltip | SHB-03 | Tooltip positioning and visual text inspection | Hover over inherited dashed tag in Task table/list, verify tooltip reads "Kế thừa từ [Milestone/Dự án]: [Tên]" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
