---
phase: 15
slug: ghost-dev-local-claude-code-headless-orchestration-with-agen
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-05
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.2 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- tests/agents/gitDiffParser.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- tests/agents/gitDiffParser.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | GHOST-01 | — | N/A | unit | `npx vitest run tests/agents/gitDiffParser.test.ts` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 0 | GHOST-02 | — | N/A | unit | `npx vitest run tests/agents/promptBuilder.test.ts` | ❌ Wave 0 | ⬜ pending |
| 15-01-03 | 01 | 0 | GHOST-03 | T-15-01 | Strictly validate shell command whitelist | unit | `npx vitest run tests/agents/whitelist.test.ts` | ❌ Wave 0 | ⬜ pending |
| 15-02-01 | 02 | 1 | GHOST-04 | — | Safe rendering of 3-column Agent Control | component | `npx vitest run tests/agents/AgentControlView.test.tsx` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/agents/gitDiffParser.test.ts` — stubs for GHOST-01
- [ ] `tests/agents/promptBuilder.test.ts` — stubs for GHOST-02
- [ ] `tests/agents/whitelist.test.ts` — stubs for GHOST-03
- [ ] `tests/agents/AgentControlView.test.tsx` — stubs for GHOST-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Claude Code Process Launch & Streaming | GHOST-PROC | Requires live Claude Code binary and stdin/stdout interaction | Run Ghost Dev on test task, verify stream output in Agent Control |
| Git Worktree Creation & Cleanup | GHOST-TREE | Interacts with filesystem and git repository | Trigger task run, check `.plannermate/worktrees`, stop task and verify |
| App Exit Protection | GHOST-EXIT | Involves terminating running Tauri application | Launch agent, close app, check no orphan `claude` process via `ps aux` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-05
