---
phase: 32
slug: external-research-via-claude-code-headless
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-07
revised: 2026-11-08
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
| **Full suite command** | `npx vitest run src/services/__tests__/sshService.test.ts src/services/wizard/__tests__/artifactRepo.test.ts tests/services/ai/researchProposal.test.ts src/services/ai/__tests__/researchService.test.ts tests/ai/sdlcPromptComposer.test.ts tests/ai/sdlcPromptIsolation.test.ts tests/services/ai/subsystemProposal.test.ts tests/unit/sdlc/ResearchSummaryCard.test.tsx tests/unit/sdlc/StepChatPanelResearch.test.tsx` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command or scoped test for modified files (remember project memory: never run full vitest suite)
- **After every plan wave:** Run scoped full suite command for Phase 32
- **Before `/gsd-verify-work`:** Targeted phase test suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | SDLC-RES-02 | T-32-01 | Remote command injection sanitized via shell escaping; command is `echo $$ && <command>` with NO `sh -c` wrapper; `BufReader` reads `channel.stream(0)` so the channel stays usable for stderr/exit | unit | `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 32-01-02 | 01 | 1 | SDLC-RES-02 | T-32-02 | Remote PID capture and SIGTERM termination on stop; `onExit` receives the `SshStreamExitEvent` payload | unit | `npx vitest run src/services/__tests__/sshService.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 2 | SDLC-RES-03, SDLC-RES-06 | T-32-13 | Artifact kind extension and versioned note persistence; UUID-valid sessionId | unit | `npx vitest run src/services/wizard/__tests__/artifactRepo.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 2 | SDLC-RES-01 | T-32-10 | propose_research reachable through the `executeAiTool` switch; ids re-resolved against `db.systems` AND `cr.targets` | unit | `npx vitest run tests/services/ai/researchProposal.test.ts tests/ai/aiTools.test.ts tests/ai/sdlcPromptIsolation.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-01 | 03 | 3 | SDLC-RES-03, SDLC-RES-05 | T-32-03, T-32-05 | Zod payload validation, shell escaping, parser fallback, availability pre-flight | unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ W0 | ⬜ pending |
| 32-04-01 | 04 | 4 | SDLC-RES-02, SDLC-RES-03, SDLC-RES-05 | T-32-02, T-32-03, T-32-04 | Multi-system runner: exact remote command string (`cd … && exec claude …`, no `sh -c`), skipped systems reported, 300s timeout cancels, SSH throw AND exit-event error both map to RESEARCH_SSH_ERROR | unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 32-05-01 | 05 | 4 | SDLC-RES-01, SDLC-RES-04, SDLC-RES-05 | T-32-06, T-32-07, T-32-11 | External research delimited, subordinated, skipped systems disclosed, propose_research policy present | unit | `npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/ai/sdlcPromptIsolation.test.ts tests/services/ai/subsystemProposal.test.ts` | ✅ | ⬜ pending |
| 32-06-01 | 06 | 5 | SDLC-RES-06 | T-32-08 | Research summary card, detail modal with historical version selector, trigger modal | component | `npx vitest run tests/unit/sdlc/ResearchSummaryCard.test.tsx` | ❌ W0 | ⬜ pending |
| 32-06-02 | 06 | 5 | SDLC-RES-01, SDLC-RES-03, SDLC-RES-05 | T-32-09, T-32-12, T-32-15 | StepChatPanel proposal, streaming, cancellation, completion, unavailable/timeout/SSH-error cards; `startResearch` handle gated on non-null `threadId` | component | `npx vitest run tests/unit/sdlc/StepChatPanelResearch.test.tsx && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 32-06-03 | 06 | 5 | SDLC-RES-06 | T-32-14 | Step 1/2 render ResearchSummaryCard from live artifact query; `ChangeRequestSdlcView` wires `onStartResearch` | typecheck | `npx vitest run tests/unit/sdlc/StepViews.test.tsx tests/unit/sdlc/ChangeRequestSdlcView.test.tsx tests/unit/sdlc/Step2SolutionView.test.tsx tests/unit/sdlc/Step2SolutionSections.test.tsx tests/unit/sdlc/ChangeRequestSdlcPerformance.test.tsx tests/unit/sdlc/ChangeRequestSdlcViewAsyncCr.test.tsx && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/sshService.test.ts` — test stubs for SSH streaming and termination command (Task 32-01-02)
- [ ] `src/services/wizard/__tests__/artifactRepo.test.ts` — test stubs for RESEARCH kind commit, version increment, and `loadLatestResearchArtifact` (Task 32-02-01)
- [ ] `tests/services/ai/researchProposal.test.ts` — registration, dispatch-through-`executeAiTool`, host gating, and id re-resolution for `propose_research` (Task 32-02-02)
- [ ] `src/services/ai/__tests__/researchService.test.ts` — test stubs for researchService schemas, escaping, parser, availability, and the multi-system runner (Tasks 32-03-01, 32-04-01)
- [ ] `tests/unit/sdlc/ResearchSummaryCard.test.tsx` — test stubs for summary card badges, detail modal version selector, and trigger modal (Task 32-06-01)
- [ ] `tests/unit/sdlc/StepChatPanelResearch.test.tsx` — test stubs for external research cards, manual start, and confirmation (Task 32-06-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH execution to actual remote server | SDLC-RES-02 | Requires live remote host with Claude Code installed | Connect to test remote host, click "Nghiên cứu (Claude Code)" in the Step 1/2 toolbar, observe streaming in Chat |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-11-08 (revision round 4; remote-command `sh -c` wrapper removed, `onExit` widened to `SshStreamExitEvent`, exact-command-string test added)
