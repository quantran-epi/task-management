---
phase: 34
slug: ai-office-fixed-ai-employees-with-persona-role-per-model-mul
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-08
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `34-RESEARCH.md` §Validation Architecture. Requirement IDs are the registered `AIO-*` set, not the research's provisional `AIOFF-*` names.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (jsdom, `globals: true`, `fileParallelism: false`, `testTimeout: 15000`) |
| **Config file** | `vite.config.ts` → `test:` block (lines 65–80); setup `tests/setup.ts` (fake-indexeddb + jest-dom + Blob/ResizeObserver shims) |
| **Quick run command** | `npx vitest run tests/services/ai/office tests/ai/chatTurnRuntime.test.ts` |
| **Full suite command** | **Never run the whole suite** (memory: takes over an hour). Wave gate is the scoped set: `npx vitest run tests/services/ai/office tests/ai tests/db tests/services/backup tests/views` |
| **Estimated runtime** | ~60–120 s for the scoped wave gate |

---

## Sampling Rate

- **After every task commit:** run the single scoped file(s) that task touched.
- **After every plan wave:** run the scoped wave gate above.
- **Before `/gsd-verify-work`:** scoped wave gate green plus `npx tsc --noEmit`.
- **Max feedback latency:** ~15 s per file (Vitest `testTimeout: 15000`).

---

## Per-Task Verification Map

Task IDs are filled in by the planner; the requirement → test binding below is the contract.

| Requirement | Behavior verified | Test type | Automated command | File exists |
|-------------|-------------------|-----------|-------------------|-------------|
| AIO-EMP-01 | Employees/leads are global; editing an employee is visible in every team using it | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ❌ W0 |
| AIO-EMP-02 | 4th team activation rejected; roster >3 rejected; reactivation keeps transcript | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ❌ W0 |
| AIO-SKILL-01 | Skill CRUD persists `{name, description, body}`; one skill per agent enforced | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ❌ W0 |
| AIO-SKILL-02 | Only `description` enters the system prompt; `read_skill` returns the body | unit | `npx vitest run tests/services/ai/office/teamPrompts.test.ts` | ❌ W0 |
| AIO-TEAM-01 | Plan card parks the run; approve dispatches; bypass toggle skips the card | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ❌ W0 |
| AIO-TEAM-02 | 3 concurrent employee turns all complete; lead waits for the whole batch; no round-robin path exists | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ❌ W0 |
| AIO-TEAM-03 | Employee prompt = own persona/skill description + instruction + request + same-batch results + own history + recent window; never the whole transcript | unit | `npx vitest run tests/services/ai/office/teamPrompts.test.ts` | ❌ W0 |
| AIO-TEAM-04 | `@agent` routes to that agent; no mention routes to the lead | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ❌ W0 |
| AIO-MEM-01 | Messages persist with `agentId`/`messageKind`; no fake user rows from employee turns | unit + component | `npx vitest run tests/ai/chatTurnRuntime.test.ts tests/ai/ChatMessageListAttribution.test.tsx` | ⚠️ runtime exists; attribution ❌ |
| AIO-MEM-02 | BM25 hits return turnId/agent/timestamp/kind/excerpt; `read_team_turn` is team-scoped | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts` | ❌ W0 |
| AIO-MEM-03 | Both search tools work with no network and no Knowledge Server | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts` | ❌ W0 |
| AIO-WRITE-01 | Employee turn refuses a mutation tool name without parking an approval card | unit | `npx vitest run tests/ai/chatTurnRuntime.test.ts` (extend) | ✅ file exists |
| AIO-WRITE-02 | Lead mutation still parks on the approval card; team auto-approve wins when on | unit | `npx vitest run tests/ai/chatTurnRuntime.test.ts` (extend) | ✅ file exists |
| AIO-BUDGET-01 | Even split sums to the total (remainder to lead); per-row edit persists; top-up accumulates | unit | `npx vitest run tests/services/ai/office/budgetGate.test.ts` | ❌ W0 |
| AIO-BUDGET-02 | 80% pauses at the round boundary; in-flight tool completes; resume continues; stop while parked aborts; nothing auto-stops | unit | `npx vitest run tests/services/ai/office/budgetGate.test.ts tests/services/ai/aiOrchestratorLoop.test.ts` | ✅ loop file exists; gate ❌ |
| AIO-LINK-01 | `get_linked_context` returns full note/document body, not metadata; `itemId ∉ links` is refused | unit | `npx vitest run tests/services/ai/office/teamTools.test.ts` | ❌ W0 |
| AIO-BG-01 | A team run survives view switch; per-agent stop marks incomplete; global stop aborts lead + all agents | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ❌ W0 |
| AIO-UI-01 | `'teams'` routes to `TeamsView`; `'agents'` shell defaults to Văn phòng AI and keeps Ghost Dev reachable | component | `npx vitest run tests/views/TeamsView.test.tsx tests/views/AiOfficeView.test.tsx` | ❌ W0 |
| AIO-BACKUP-01 | Export → validate → restore round-trips new tables and message attribution; a v11 payload without them still restores | integration | `npx vitest run tests/services/backup/officeBackup.test.ts` | ❌ W0 |
| (schema) | `version(17)` adds the new tables; V16 data survives the upgrade | migration | `npx vitest run tests/db/schemaV17Migration.test.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/ai/office/teamRunCoordinator.test.ts` — AIO-TEAM-01/02/04, AIO-BG-01 (fake `runLoop` per agent, pattern: `tests/ai/chatTurnRuntime.test.ts:36-60`)
- [ ] `tests/services/ai/office/budgetGate.test.ts` — AIO-BUDGET-01/02
- [ ] `tests/services/ai/office/teamTools.test.ts` — AIO-MEM-02/03, AIO-LINK-01
- [ ] `tests/services/ai/office/aiTeamRepo.test.ts` — AIO-EMP-01/02, AIO-SKILL-01
- [ ] `tests/services/ai/office/teamPrompts.test.ts` — AIO-SKILL-02, AIO-TEAM-03
- [ ] `tests/db/schemaV17Migration.test.ts` — schema (pattern: `tests/db/schemaV16Migration.test.ts`)
- [ ] `tests/services/backup/officeBackup.test.ts` — AIO-BACKUP-01
- [ ] `tests/ai/ChatMessageListAttribution.test.tsx` — AIO-MEM-01
- [ ] `tests/views/TeamsView.test.tsx`, `tests/views/AiOfficeView.test.tsx` — AIO-UI-01
- [ ] Extend `tests/ai/chatTurnRuntime.test.ts` — AIO-MEM-01, AIO-WRITE-01/02 (`persistUserMessage:false`, `mutationPolicy:'read-only'`, `onUsage` forward)
- [ ] Extend `tests/services/ai/aiOrchestratorLoop.test.ts` — `beforeToolRound` ordering + abort
- [ ] **Update** `tests/db.test.ts:20-45` — the exact-table-list assertion fails when the new tables are added
- No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A paused run never reads as a hang | AIO-BUDGET-02 | Perceptual — jsdom cannot judge whether a still screen looks frozen | Run a team with a tiny budget; confirm the capsule keeps its elapsed ticker and the warning banner is visible with no spinner |
| Concurrent streaming bubbles stay legible | AIO-BG-01 | Requires real provider streaming cadence | Run a 3-agent batch; confirm each bubble streams into its own row and the transcript does not jump |
| Assignment-plan card is distinguishable from a mutation card | AIO-TEAM-01 | Visual judgment | Place both cards in one transcript; confirm the neutral/primary-border plan card is not mistaken for an approval-required mutation |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
