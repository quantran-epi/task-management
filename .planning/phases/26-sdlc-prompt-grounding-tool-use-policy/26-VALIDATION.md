---
phase: 26
slug: sdlc-prompt-grounding-tool-use-policy
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-03
---

# Phase 26 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + jsdom 30.1.1 + @testing-library/react 16.3.3 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/services/sdlc/groundingBuilder.test.ts tests/ai/sdlcPromptComposer.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~120 seconds |

## Sampling Rate

- **After every task commit:** Run focused Vitest command for touched behavior.
- **After every plan wave:** Run `npm test -- --run`.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | SDLC-PR-01 | T-26-01 | Production view forwards bounded labeled grounding, including explicit missing markers for acceptance context, prior tech docs, and implementation evidence | unit/integration | `npx vitest run tests/services/sdlc/groundingBuilder.test.ts tests/unit/sdlc/ProjectSdlcGrounding.test.tsx tests/unit/sdlc/ProjectSdlcView.test.tsx` | ✅ / extend | ⬜ pending |
| 26-02-01 | 02 | 2 | SDLC-PR-02, SDLC-PR-04, SDLC-PR-05 | T-26-02 | Policy names static plus supplied dynamic read-only tools; payload uses same explicit set; two exemplars and fixed policy-first layer order | unit | `npx vitest run tests/ai/sdlcPromptComposer.test.ts tests/ai/sdlcPromptIsolation.test.ts` | ✅ / extend | ⬜ pending |
| 26-02-02 | 02 | 2 | SDLC-PR-02 | T-26-02 | StepChatPanel host forwards same dynamic read-only MCP names in policy and tools payload | integration | `npx vitest run tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx` | ✅ / new | ⬜ pending |
| 26-03-01 | 03 | 3 | SDLC-PR-03 | T-26-03 | Explicit SOLUTION/PL03B/PL07/CAB intent; invalid/missing prerequisite refuses before model call; Unicode-safe ambiguous detector clarifies | component | `npx vitest run tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` | ✅ / extend | ⬜ pending |
| 26-04-01 | 04 | 4 | SDLC-PR-06 | T-26-04 | Tool loop stops at explicit ceiling, retains events, emits terminal status, and never persists partial output | unit | `npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts` | ✅ / extend | ⬜ pending |
| 26-04-02 | 04 | 4 | SDLC-PR-06 | T-26-04 | Widget distinguishes stopped evidence from error/approval and keeps activity visible | component | `npx vitest run tests/ai/AiChatWidget.test.tsx tests/ai/useChatTurn.test.tsx` | ✅ / extend | ⬜ pending |
| 26-04-03 | 04 | 4 | SDLC-PR-06 | T-26-04 | Drawer maps tool-limit to idle/debug-only handling without showing error state | component | `npx vitest run tests/ai/AIChatDrawer.test.tsx` | ✅ / new | ⬜ pending |

## Wave 0 Requirements

- [ ] `tests/services/sdlc/groundingBuilder.test.ts` — per-step mapping, budget clamp, missing labels for acceptance/prior-tech/implementation evidence, delimiter and secret exclusion.
- [ ] `tests/unit/sdlc/ProjectSdlcGrounding.test.tsx` — production view forwards non-empty grounding, step marker, and `[MISSING]` fallback.
- [ ] `tests/ai/sdlcPromptComposer.test.ts` — tool policy, two exemplars, static/dynamic allowlist alignment, and layer order.
- [ ] `tests/ai/sdlcPromptIsolation.test.ts` — payload filtering and dynamic MCP parity.
- [ ] `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx` — host integration proves dynamic MCP names match policy and tools payload.
- [ ] `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` — PL03B/PL07/CAB, pre-model refusal, derived marker guards, and Unicode detector variants.
- [ ] `tests/ai/AiChatWidget.test.tsx` — terminal status and retained tool activity.
- [ ] `tests/ai/AIChatDrawer.test.tsx` — tool-limit drawer mapping and debug-only terminal handling.
- [ ] Existing test infrastructure covers all dependencies; no install required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Narrow SDLC drawer shows explicit artifact actions and terminal stopped state accessibly | SDLC-PR-03, SDLC-PR-06 | Visual focus/spacing and actual streaming activity need browser/Tauri surface | Run desktop app, open SDLC steps SOLUTION/TECH_DOCS/CAB, verify action labels, invalid-prerequisite Alert, tool activity retention, neutral stopped tag, warning retry action, and no partial assistant bubble. |

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 120s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved

**Sign-off basis:** Every planned task has an automated command, all test artifacts have explicit paths, and warning coverage includes host policy/payload parity, derived grounding markers, and drawer `tool-limit` mapping.
