---
phase: 48
slug: agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-21
---

# Phase 48 — Validation Strategy

> Per-phase validation contract. Project rule: never run the full Vitest suite; it takes over an hour.
> Commands below are the exact scoped commands declared in 48-01..04-PLAN.md `<verify>` blocks. No `npm test`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.2 + @testing-library/react + Playwright 1.63.0 (Chrome channel) |
| **Config file** | `vite.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run <focused paths> --bail=1` |
| **Full suite command** | Not used — project memory forbids full suite (over an hour) |
| **Estimated runtime** | Focused runs target under 3 minutes |
| **Correct flags** | `--bail=1` (Vitest 5.0.2 rejects `-x`); never `-x`, never `npm test` |

---

## Sampling Rate

- **After every task commit:** Run the exact scoped command in the Per-Task Verification Map plus `npx tsc --noEmit` / `cargo check` where the plan declares it.
- **After every plan wave:** Run all focused tests listed for that wave's tasks and one Chrome/Playwright interaction check for UI changes.
- **Before phase verification (48-04 Task 1):** Run every scoped Vitest path in one combined `--bail=1` invocation, then `npx tsc --noEmit`, then lint, then `cargo check --manifest-path src-tauri/Cargo.toml`.
- **Max feedback latency:** 180 seconds per focused run.

---

## Per-Task Verification Map

Commands copied verbatim from each plan's `<verify><automated>`; `&amp;&amp;` shown as `&&` below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Automated Command (exact, scoped) | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------------------------------|-------------|--------|
| 48-01-01 | 01 | 1 | D-08/D-09 | T-48-17 | Session start provisions deterministic real remote worktree; git worktree add/list over SSH; realpath boundary; no local fs | `npx vitest run src/services/__tests__/sshWorktreeProvision.test.ts --bail=1 && cargo check --manifest-path src-tauri/Cargo.toml` | ❌ W0 | ⬜ pending |
| 48-01-02 | 01 | 1 | D-08 | T-48-02 | All verbs confined to remoteWorktreePath only; no repoPath fallback; outside/main-checkout path refused; no ssh_write_file with model path | `npx vitest run src/services/__tests__/sshWorktreeService.test.ts --bail=1 && cargo check --manifest-path src-tauri/Cargo.toml` | ❌ W0 | ⬜ pending |
| 48-01-03 | 01 | 1 | D-07/D-10 | T-48-01, T-48-05 | code_edit role gate + context-bound descriptor; untrusted wrap; roster imports one Agent Developer (claude-opus-5-5) | `npx vitest run src/services/ai/office/__tests__/teamTools.codeEdit.test.ts src/db/repositories/__tests__/aiOfficeImport.test.ts --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 48-02-01 | 02 | 2 | D-01..D-05, D-11, D-16 | T-48-06..T-48-09 | Modal 3-pane + two perspectives share state; viewer parity; tree search/scope; chat composer via existing store | `npx vitest run src/components/agents/__tests__/CodingZoneModal.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 48-02-02 | 02 | 2 | D-11..D-14 | T-48-07, T-48-08 | Accept->applyHunk, Reject->revertHunk worktree-local; counters; stale/failure surfaced; trigger visibility; team-chat diff empty | `npx vitest run src/components/agents/__tests__/CodingZoneModal.test.tsx --bail=1 && npx tsc --noEmit && git diff -- src/components/ai/AIChatDrawer.tsx src/components/ai/ChatMessageBubble.tsx src/styles/team-chat.css \| wc -l` | ❌ W0 | ⬜ pending |
| 48-03-01 | 03 | 3 | D-06, D-13, D-15 | T-48-10..T-48-12 | Popout dedupe/handoff at #/coding-zone-popout (no secret in hash); sync ignores self/stale/malformed; route resolvable | `npx vitest run src/hooks/__tests__/useCodingZoneSync.test.ts --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 48-03-02 | 03 | 3 | D-17, D-18, D-13 | T-48-13, T-48-14 | Live activity from ghost-dev events; no sample data; truthful connection state/copy; hunk decision publishes newer revision | `npx vitest run src/components/agents/__tests__/CodingZoneModal.test.tsx --bail=1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 48-04-01 | 04 | 4 | D-19, D-20 | — | Combined scoped gate green (no full suite); tsc/lint/cargo clean; review findings closed; validation signed off | `npx vitest run src/services/__tests__/sshWorktreeProvision.test.ts src/services/__tests__/sshWorktreeService.test.ts src/services/ai/office/__tests__/teamTools.codeEdit.test.ts src/db/repositories/__tests__/aiOfficeImport.test.ts src/components/agents/__tests__/CodingZoneModal.test.tsx src/hooks/__tests__/useCodingZoneSync.test.ts src/utils/__tests__/gitDiffParser.test.ts src/components/agents/__tests__/AgentDiffReviewer.test.tsx --bail=1 && npx tsc --noEmit && cargo check --manifest-path src-tauri/Cargo.toml` | partial (gitDiffParser/AgentDiffReviewer exist; rest ❌ W0) | ⬜ pending |
| 48-04-02 | 04 | 4 | D-21 | T-48-15 | Chrome walkthrough: modal, tree, tabs, diff accept/reject, popout sync, chat, theme, zero console/page errors | `npx playwright test tests/e2e/coding-zone.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| 48-04-03 | 04 | 4 | D-22 | T-48-16 | After review approval, guarded merge to feature/intellij-workbench and push | `git status --short && git log -1 --oneline && git ls-remote origin feature/intellij-workbench` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These test files are created by the plans themselves (48-01..04); they do not exist yet at planning time. Boxes stay unchecked until a plan creates the file and its scoped command is green. 48-04 Task 1 owns final reconciliation: it verifies every scoped command, then sets `wave_0_complete: true` and `nyquist_compliant: true` at sign-off.

- [ ] `src/services/__tests__/sshWorktreeProvision.test.ts` — deterministic path/branch, git worktree add/list, realpath boundary (48-01-01, D-08)
- [ ] `src/services/__tests__/sshWorktreeService.test.ts` — path confinement + remote command construction, no repoPath fallback (48-01-02, D-08)
- [ ] `src/services/ai/office/__tests__/teamTools.codeEdit.test.ts` — role allowlist + context-bound descriptor (48-01-03, D-07)
- [ ] `src/components/agents/__tests__/CodingZoneModal.test.tsx` — layout/perspectives/tabs/hunks/diff/trigger/activity (48-02 + 48-03, D-03/D-04/D-12/D-17/D-18)
- [ ] `src/hooks/__tests__/useCodingZoneSync.test.ts` — cross-window revision/echo suppression (48-03-01, D-13)
- [ ] `tests/e2e/coding-zone.spec.ts` — Chrome UAT for D-21 (48-04-02)
- [x] Existing infrastructure covers Vitest, React Testing Library, `gitDiffParser`/`AgentDiffReviewer` tests, and Playwright.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH remote worktree agent run | D-08 | Requires configured remote target and credentials; no synthetic credential in tests | Open a team chat, assign Agent Developer, verify session-start provisioning creates a real remote worktree and edits appear only there; review hunk accept/reject; confirm main checkout unchanged |
| Popout on second monitor | D-06/D-15 | Window placement is OS-level | Open Coding Zone, click Popout Coding Zone, drag window to second screen, verify chat in main window and coding zone remain synchronized |

---

## Validation Sign-Off

- [x] Every task has an exact scoped `<automated>` command (no full-suite invocation)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 list matches the test files the plans create; reconciliation owned by 48-04 Task 1
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter (48-04 Task 1, after gates green)
- [ ] `wave_0_complete: true` set in frontmatter (48-04 Task 1, after all scoped commands green)

**Approval:** pending 2026-11-21
