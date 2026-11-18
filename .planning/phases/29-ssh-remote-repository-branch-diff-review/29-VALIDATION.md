---
phase: "29"
slug: "ssh-remote-repository-branch-diff-review"
status: approved
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-06"
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library 16.3.3 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/services/__tests__/gitRemoteService.test.ts` |
| **Full suite command** | `npx vitest run src/services/__tests__/gitRemoteService.test.ts src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` |
| **Estimated runtime** | ~15 seconds |

*Rule from CLAUDE.md / Memory:* Do NOT run full test suite. Run focused test files only.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/services/__tests__/gitRemoteService.test.ts`
- **After every plan wave:** Run `npx vitest run src/services/__tests__/gitRemoteService.test.ts src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | SDLC-REPO-01 | T-29-01 | Validates SSH config resolution and command execution over Tauri backend | unit | `npx vitest run src/services/__tests__/gitRemoteService.test.ts -t "connection"` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | SDLC-REPO-02 | T-29-02 | Strict POSIX escaping prevents shell injection in git branch/path params | unit | `npx vitest run src/services/__tests__/gitRemoteService.test.ts -t "git commands"` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 1 | SDLC-REPO-06 | T-29-03 | Keyring resolution securely loads SSH secrets; binds repo per project in Dexie | unit | `npx vitest run src/services/__tests__/projectRepoSetting.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 2 | SDLC-REPO-03 | T-29-04 | Renders branch selector, commit log timeline, and dirty repository warning banner | component | `npx vitest run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx -t "branch and commits"` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 2 | SDLC-REPO-03 | T-29-04 | Supports Unified/Split diff view, syntax highlighting, and caps files > 5000 lines | component | `npx vitest run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx -t "diff viewer"` | ❌ W0 | ⬜ pending |
| 29-02-03 | 02 | 2 | SDLC-REPO-03 | T-29-05 | Approval persists BranchSnapshot in CR workflow state and transitions to Step 4 | component | `npx vitest run src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx -t "approval snapshot"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/gitRemoteService.test.ts` — covers remote git commands, branch fetch, dirty status, shell escaping.
- [ ] `src/services/__tests__/projectRepoSetting.test.ts` — covers project-level repo binding and keyring credential flow.
- [ ] `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` — covers Step 3 branch select, dirty banner, diff review toggle, approval snapshot.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH connection to WSL / remote Linux host | SDLC-REPO-01 | Requires live external SSH server running with valid key | Connect to real WSL host via TaskMate UI, select repository path, verify branch list populates. |
| Smooth resizable 2-column drag interaction | SDLC-REPO-03 | CSS/DOM mouse drag resize feel | Drag split-pane handle in Step 3 review view, verify left and right panels adjust smoothly without jumping. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
