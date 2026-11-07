---
phase: 32
slug: external-research-via-claude-code-headless
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-07
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run src/services/ai/__tests__/researchService.test.ts` |
| **Full suite command** | `npx vitest run src/services/ai/__tests__/researchService.test.ts src/services/ai/__tests__/sdlcPromptComposer.test.ts src/services/__tests__/sshService.test.ts` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command or scoped test for modified files (remember project memory: never run full vitest suite)
- **After every plan wave:** Run scoped full suite command for Phase 32
- **Before `/gsd-verify-work`:** Targeted phase test suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | SDLC-RES-02 | T-32-01 | Remote command injection sanitized via shell escaping | unit | `npx vitest run src/services/__tests__/sshService.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | SDLC-RES-02 | T-32-02 | Remote PID capture and SIGTERM termination on stop | unit | `npx vitest run src/services/__tests__/sshService.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | SDLC-RES-01 | — | N/A | unit | `npx vitest run src/components/sdlc/chat/__tests__/StepChatPanel.test.tsx` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 2 | SDLC-RES-03 | T-32-03 | Untrusted web data validated with Zod schema | unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 2 | SDLC-RES-06 | — | N/A | unit | `npx vitest run src/services/wizard/__tests__/artifactRepo.test.ts` | ✅ | ⬜ pending |
| 32-03-01 | 03 | 3 | SDLC-RES-04 | T-32-03 | External research delimited and subordinated to internal evidence | unit | `npx vitest run src/services/ai/__tests__/sdlcPromptComposer.test.ts` | ✅ | ⬜ pending |
| 32-03-02 | 03 | 3 | SDLC-RES-05 | — | N/A | unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ W0 | ⬜ pending |
| 32-04-01 | 04 | 4 | SDLC-RES-06 | — | N/A | integration | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/ai/__tests__/researchService.test.ts` — test stubs for researchService execution, Zod validation, and fallback
- [ ] `src/services/__tests__/sshService.test.ts` — test stubs for SSH streaming and termination command

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH execution to actual remote server | SDLC-RES-02 | Requires live remote host with Claude Code installed | Connect to test remote host, trigger research from Step 1/2 Toolbar, observe streaming in Chat |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-07
