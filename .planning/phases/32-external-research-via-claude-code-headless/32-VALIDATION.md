---
phase: 32
slug: external-research-via-claude-code-headless
status: approved
nyquist_compliant: true
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
| **Full suite command** | `npx vitest run src/services/ai/__tests__/researchService.test.ts src/services/wizard/__tests__/artifactRepo.test.ts tests/ai/sdlcPromptComposer.test.ts src/services/__tests__/sshService.test.ts src/components/sdlc/common/__tests__/ResearchSummaryCard.test.tsx src/components/sdlc/chat/__tests__/StepChatPanel.test.tsx` |
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
| 32-01-01 | 01 | 1 | SDLC-RES-02 | T-32-01 | Remote command injection sanitized via shell escaping | unit | `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 32-01-02 | 01 | 1 | SDLC-RES-02 | T-32-02 | Remote PID capture and SIGTERM termination on stop | unit | `npx vitest run src/services/__tests__/sshService.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 2 | SDLC-RES-03, SDLC-RES-06 | T-32-05 | Artifact kind extension and versioned note persistence | unit | `npx vitest run src/services/wizard/__tests__/artifactRepo.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 2 | SDLC-RES-01 | T-32-10 | propose_research returns data only; model-supplied system ids re-resolved against db.systems | typecheck | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 32-02-03 | 02 | 2 | SDLC-RES-02, SDLC-RES-03, SDLC-RES-05 | T-32-03, T-32-04 | Untrusted web data validated with Zod, shell escaping incl. remoteRepoPath, availability pre-flight, 300s timeout | unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-01 | 03 | 3 | SDLC-RES-01, SDLC-RES-04, SDLC-RES-05 | T-32-06, T-32-07, T-32-11 | External research delimited, subordinated, skipped systems disclosed, propose_research policy present | unit | `npx vitest run tests/ai/sdlcPromptComposer.test.ts` | ✅ | ⬜ pending |
| 32-04-01 | 04 | 4 | SDLC-RES-06 | T-32-08 | Research summary card & modal inspection | component | `npx vitest run src/components/sdlc/common/__tests__/ResearchSummaryCard.test.tsx` | ❌ W0 | ⬜ pending |
| 32-04-02 | 04 | 4 | SDLC-RES-01, SDLC-RES-03, SDLC-RES-05 | T-32-09, T-32-12 | StepChatPanel proposal, streaming, completion, unavailable, and timeout cards | component | `npx vitest run src/components/sdlc/chat/__tests__/StepChatPanel.test.tsx` | ❌ W0 | ⬜ pending |
| 32-04-03 | 04 | 4 | SDLC-RES-06 | — | Step 1/2 render ResearchSummaryCard from live artifact query | typecheck | `npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/sshService.test.ts` — test stubs for SSH streaming and termination command (Task 32-01-02)
- [ ] `src/services/wizard/__tests__/artifactRepo.test.ts` — test stubs for RESEARCH kind commit, version increment, and `loadLatestResearchArtifact` (Task 32-02-01)
- [ ] `src/services/ai/__tests__/researchService.test.ts` — test stubs for researchService execution, Zod validation, availability pre-flight, timeout, and fallback (Task 32-02-03)
- [ ] `src/components/sdlc/common/__tests__/ResearchSummaryCard.test.tsx` — test stubs for summary card badges and detail modal (Task 32-04-01)
- [ ] `src/components/sdlc/chat/__tests__/StepChatPanel.test.tsx` — test stubs for external research cards and confirmation (Task 32-04-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH execution to actual remote server | SDLC-RES-02 | Requires live remote host with Claude Code installed | Connect to test remote host, trigger research from Step 1/2 Toolbar, observe streaming in Chat |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-11-07
