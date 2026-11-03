---
phase: 26
slug: sdlc-prompt-grounding-tool-use-policy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-03
---

# Phase 26 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + jsdom 30.1.1 + @testing-library/react 16.3.3 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~120 seconds |

## Sampling Rate

- **After every task commit:** Run the focused Vitest command for touched behavior.
- **After every plan wave:** Run `npm test -- --run`.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | SDLC-PR-01 | T-26-01 | Production view always forwards bounded labeled grounding, including missing markers | integration | `npx vitest run tests/unit/sdlc/ProjectSdlcView.test.tsx` | ✅ / extend | ⬜ pending |
| 26-02-01 | 02 | 2 | SDLC-PR-02, SDLC-PR-04, SDLC-PR-05 | T-26-02 | Policy/tool payload alignment, two exemplars per step, fixed policy-first layer order, injection containment | unit | `npx vitest run tests/ai/sdlcPromptComposer.test.ts` | ✅ / extend | ⬜ pending |
| 26-03-01 | 03 | 3 | SDLC-PR-03 | T-26-03 | Explicit SOLUTION/PL03B/PL07/CAB intent; invalid/missing prerequisite refuses before model call | component | `npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` | ✅ / extend | ⬜ pending |
| 26-04-01 | 04 | 4 | SDLC-PR-06 | T-26-04 | Tool loop stops at explicit ceiling, retains events, emits terminal status, and never persists partial output | unit | `npx vitest run tests/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts` | ✅ / extend | ⬜ pending |
| 26-04-02 | 04 | 4 | SDLC-PR-06 | T-26-04 | Widget distinguishes stopped evidence from error/approval and keeps activity visible | component | `npx vitest run tests/ai/AiChatWidget.test.tsx` | ✅ / extend | ⬜ pending |

## Wave 0 Requirements

- [ ] `tests/unit/sdlc/ProjectSdlcView.test.tsx` — assert non-empty grounding, step marker, and `[MISSING]` fallback.
- [ ] `tests/ai/sdlcPromptComposer.test.ts` — add tool policy, two exemplars, allowlist alignment, and layer order assertions.
- [ ] `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` — add PL03B/PL07/CAB and pre-model refusal cases.
- [ ] `tests/ai/AiChatWidget.test.tsx` — add terminal status and retained tool activity case.
- [ ] Existing test infrastructure covers all dependencies; no install required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Narrow SDLC drawer shows explicit artifact actions and terminal stopped state accessibly | SDLC-PR-03, SDLC-PR-06 | Visual focus/spacing and actual streaming activity need browser/Tauri surface | Run desktop app, open SDLC steps SOLUTION/TECH_DOCS/CAB, verify action labels, invalid-prerequisite Alert, tool activity retention, neutral stopped tag, warning retry action, and no partial assistant bubble. |

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
