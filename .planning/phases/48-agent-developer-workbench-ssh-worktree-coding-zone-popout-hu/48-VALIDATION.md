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

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react + Playwright (Chrome channel) |
| **Config file** | `vite.config.ts` / existing Vitest config in repo |
| **Quick run command** | `npx vitest run <focused paths>` |
| **Full suite command** | Not used — project memory forbids full suite (over an hour) |
| **Estimated runtime** | Focused runs target under 3 minutes |

---

## Sampling Rate

- **After every task commit:** Run focused `npx vitest run <changed-area tests>` plus `npx tsc --noEmit` when TypeScript files change.
- **After every plan wave:** Run all focused tests listed in that wave and one Chrome/Playwright interaction check for UI changes.
- **Before phase verification:** Run focused tests for team config, tool confinement, coding zone UI, popout sync, and Chrome browser walkthrough.
- **Max feedback latency:** 180 seconds per focused run.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | D-07 | T-48-01 | New agent roster imports without skill warning | unit | `npx vitest run tests/.../aiOfficeImport.test.ts` | ✅ | ⬜ pending |
| 48-01-02 | 01 | 1 | D-08/D-10 | T-48-02 | edit tool refuses paths outside worktree; model args never override team context | unit | `npx vitest run tests/.../teamTools-*.test.ts` | ❌ W0 | ⬜ pending |
| 48-01-03 | 01 | 1 | D-08 | T-48-02 | Rust worktree path validation uses realpath boundary | rust | `cargo test <focused worktree guard>` | ❌ W0 | ⬜ pending |
| 48-02-01 | 02 | 2 | D-01..D-06 | T-48-03 | Coding Zone modal renders tree, tabs, diff, chat strip from live state | component | `npx vitest run tests/.../CodingZone*.test.tsx` | ❌ W0 | ⬜ pending |
| 48-02-02 | 02 | 2 | D-11..D-14 | T-48-04 | Accept/Reject hunk calls worktree-local command and refreshes diff | component/unit | `npx vitest run tests/.../CodingZoneDiff*.test.tsx` | ❌ W0 | ⬜ pending |
| 48-03-01 | 03 | 3 | D-05/D-06/D-15 | T-48-05 | Popout opens dedicated Tauri window and syncs tabs/hunks/chat | unit/component | `npx vitest run tests/.../codingZonePopout*.test.ts` | ❌ W0 | ⬜ pending |
| 48-03-02 | 03 | 3 | D-17/D-18 | T-48-06 | activity events update UI; unreachable target shows truthful state | component | `npx vitest run tests/.../codingZoneActivity*.test.tsx` | ❌ W0 | ⬜ pending |
| 48-04-01 | 04 | 4 | D-19/D-21 | — | Chrome walkthrough completes with zero console/page errors | browser | `node <focused Playwright script>` | ❌ W0 | ⬜ pending |
| 48-04-02 | 04 | 4 | D-22 | — | After review approval, branch merged to feature/intellij-workbench and pushed | git | `git status`, `git log`, `git push` output | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Focused test files for SSH worktree path confinement and code edit tool.
- [ ] Focused test files for Coding Zone modal, tabs, diff hunk decisions, popout sync, and activity state.
- [ ] Playwright/Chrome verification script under `e2e/` or focused temp script.
- [ ] Existing infrastructure otherwise covers Vitest, React testing library, and Playwright.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real SSH remote worktree agent run | D-08 | Requires configured remote target and credentials; no synthetic credential in tests | Open a team chat, assign Agent Developer, verify edits appear only in remote worktree; review hunk accept/reject; confirm main checkout unchanged |
| Popout on second monitor | D-06/D-15 | Window placement is OS-level | Open Coding Zone, click Popout Coding Zone, drag window to second screen, verify chat in main window and coding zone remain synchronized |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-11-21
