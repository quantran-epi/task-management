---
phase: 39
slug: skill-versioning-enrichment-approval
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-14
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (jsdom global; `// @vitest-environment node` per office/repo file) |
| **Config file** | `vite.config.ts` (`test:` block; `setupFiles: ['./tests/setup.ts']` → `fake-indexeddb/auto`; `fileParallelism: false`) |
| **Quick run command** | `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` |
| **Full suite command** | **not run** — project rule; the suite takes ~1 hour. Scoped paths only. |
| **Estimated runtime** | ~5–15s per scoped file |

---

## Sampling Rate

- **After every task commit:** the single focused test file for that task (see Per-Task map)
- **After every plan wave:** the union of files touched by that wave
- **Before `/gsd-verify-work`:** every command in the map below green + D-30 doc edits landed
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-* | 01 | 1 | AIO-SKILL-03 | V4 Access Control | Only `decideSkillVersion` assigns a `version`; `createSkillVersion` rejects non-`pending` | unit | `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` | ✅ (rewrite 4 tests) | ⬜ pending |
| 39-01-* | 01 | 1 | AIO-SKILL-03 | T-39-01 backup parity | `baseVersion` optional; v13 payload without it still validates | integration | `npx vitest run tests/services/backup/officeBackup.test.ts` | ✅ (extend) | ⬜ pending |
| 39-02-* | 02 | 1 | AIO-SKILL-01 | V4 | Manual edit creates an approved version in the same transaction | unit | `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts` | ✅ (extend) | ⬜ pending |
| 39-03-* | 03 | 2 | AIO-SKILL-05 | — | Mid-batch approval does not change a running agent's skill | integration | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "pin"` | ❌ W0 | ⬜ pending |
| 39-03-* | 03 | 2 | AIO-SKILL-06 | Tampering | Pinned read returns pinned row only when `status === 'approved'`, else baseline | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts -t "read_skill"` | ✅ (extend) | ⬜ pending |
| 39-04-* | 04 | 2 | AIO-SKILL-02 | — | Proposal creates a pending row with no `version`; approved count unchanged | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts -t "propose_skill_version"` | ❌ W0 | ⬜ pending |
| 39-04-* | 04 | 2 | AIO-SKILL-04 | Elevation of privilege | `isMutationTool('propose_skill_version') === false`; no tool writes approved | unit | `npx vitest run tests/ai/aiTools.test.ts -t "isMutationTool"` + `npx vitest run tests/ai/chatTurnRuntime.test.ts -t "read-only"` | ✅ (extend) | ⬜ pending |
| 39-04-* | 04 | 2 | AIO-SKILL-06 | Tampering | `description` and body both wrapped; approved ≠ trusted | unit | `npx vitest run tests/services/ai/office/teamPrompts.test.ts -t "untrusted"` | ✅ (extend) | ⬜ pending |
| 39-05-* | 05 | 3 | AIO-SKILL-03 | Tampering | Stale proposal → Approve disabled, Reject enabled | component | `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx` | ✅ (extend) | ⬜ pending |
| 39-06-* | 06 | 3 | AIO-SKILL-01 | V5 Input Validation | Skill CRUD from `AiStaffExplorer` with validation, empty state, error handling | component | `npx vitest run tests/workbench/AiExplorers.test.tsx -t "Kỹ năng"` | ❌ W0 | ⬜ pending |
| 39-06-* | 06 | 3 | — | — | No new table, no Dexie/envelope bump | migration | `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts` | ✅ (stay green) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/ai/office/aiSkillVersionRepo.test.ts` — rewrite the 4 numbering tests for "no number until approval"; add approval-concurrency and atomicity tests
- [ ] `tests/services/ai/office/teamTools.test.ts` — fix `:79` (`toHaveLength(8)` → 9); add `propose_skill_version` block and pinned `read_skill` block
- [ ] `tests/services/ai/office/teamRunCoordinator.test.ts` — mid-batch pin test (criterion 5 proof)
- [ ] `tests/ai/aiTools.test.ts` — `isMutationTool` negative assertions
- [ ] `tests/services/backup/officeBackup.test.ts` — fixture update + `baseVersion` round-trip + v13-without-`baseVersion` acceptance
- [ ] `tests/workbench/AiExplorers.test.tsx` — "Kỹ năng" section

*All other infrastructure exists — Vitest, jsdom, fake-indexeddb, Testing Library are configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card reads well mid-transcript with a long diff and collapsed evidence | AIO-SKILL-03 | Visual density is not assertable in jsdom | Open AI Staff chat, trigger a proposal, confirm diff is legible and Approve/Reject reachable without scrolling past the fold |
| Version history in `SkillEditorDrawer` is scannable at 10+ versions | AIO-SKILL-03 | List density/overflow behaviour | Create 10 versions, open drawer, confirm the list scrolls and each row shows number + date + status |

*Everything else has automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (the "❌ W0" files are created inside the task that needs them — no separate Wave 0 plan is required)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-14
