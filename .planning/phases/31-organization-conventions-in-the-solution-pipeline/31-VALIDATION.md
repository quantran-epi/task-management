---
phase: "31"
slug: "organization-conventions-in-the-solution-pipeline"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-07"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/services/conventionService.test.ts` |
| **Full suite command** | `npx vitest run tests/services/conventionService.test.ts tests/ai/sdlcPromptComposer.test.ts tests/ai/sdlcConventionsExemplar.test.ts` |
| **Estimated runtime** | ~6 seconds |

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
| 31-01-01 | 01 | 1 | SDLC-CONV-01 | T-31-01 | Global conventions persistence in db.settings & backup safety | unit | `npx vitest run tests/services/conventionService.test.ts -t "global conventions"` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | SDLC-CONV-02 | T-31-02 | Markdown preview & empty state handling | integration | `npx vitest run tests/services/conventionService.test.ts -t "empty state"` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 2 | SDLC-CONV-03 | T-31-03 | Native SSH probing over 3 candidate paths | unit | `npx vitest run tests/services/conventionService.test.ts -t "fetchRepoConventions"` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 2 | SDLC-CONV-03 | T-31-04 | Absence & SSH failure tolerance | unit | `npx vitest run tests/services/conventionService.test.ts -t "fallback"` | ❌ W0 | ⬜ pending |
| 31-03-01 | 03 | 3 | SDLC-CONV-04 | T-31-05 | Layered prompt composer untrusted delimiters & order | unit | `npx vitest run tests/ai/sdlcPromptComposer.test.ts -t "conventions segment"` | ❌ W0 | ⬜ pending |
| 31-03-02 | 03 | 3 | SDLC-CONV-04 | T-31-06 | Non-truncation of long conventions documents | unit | `npx vitest run tests/ai/sdlcPromptComposer.test.ts -t "no truncation"` | ❌ W0 | ⬜ pending |
| 31-03-03 | 03 | 3 | SDLC-CONV-05 | T-31-07 | Status panel summary & refresh action in Step 1/2 | component | `npx vitest run tests/services/conventionService.test.ts -t "status"` | ❌ W0 | ⬜ pending |
| 31-04-01 | 04 | 4 | SDLC-CONV-06 | T-31-08 | Exemplar observance test (ResponseEnvelope & correlationId) | integration | `npx vitest run tests/ai/sdlcConventionsExemplar.test.ts -t "exemplar"` | ❌ W0 | ⬜ pending |
| 31-04-02 | 04 | 4 | SDLC-CONV-06 | T-31-09 | Conflict witness test (INFO vs DEBUG conflict surfacing) | integration | `npx vitest run tests/ai/sdlcConventionsExemplar.test.ts -t "conflict"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/conventionService.test.ts` — stubs for SDLC-CONV-01, SDLC-CONV-03
- [ ] `tests/ai/sdlcConventionsExemplar.test.ts` — stubs for SDLC-CONV-06 (exemplar & witness tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH remote server interaction | SDLC-CONV-03 | Requires real remote SSH host with git repo | Test against configured remote server in Settings if available |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-07
