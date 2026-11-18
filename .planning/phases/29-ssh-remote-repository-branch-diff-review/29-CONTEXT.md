# Phase 29: SSH Remote Repository Branch & Diff Review - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

In SDLC Step 3, TaskMate leverages native Tauri SSH & SFTP backend to connect to the remote host/WSL repository, inspect the target git branch, fetch commit history and changed files, and present an interactive diff & commit review UI before proceeding to change pack generation in Step 4.

This phase implements:
1. Per-project SSH profile & remote repo binding with credential resolution via OS keyring.
2. Remote git inspection services: fetching remote/local branches into a selector dropdown, `git log $BASE..HEAD`, `git diff --name-status $BASE..HEAD`, and dirty repository status checking (`git status --porcelain`).
3. An interactive review UI in `Step3CodeGuideView` featuring a resizable 2-column layout (commit timeline & changed files tree on the left, file diff preview on the right) with fullscreen expansion modal.
4. An enhanced file diff viewer supporting both Unified and Split (side-by-side) modes, syntax highlighting, and truncation/capping for oversized files (> 1MB / > 5000 lines).
5. Branch Snapshot persistence in CR state (Dexie DB), user approval action transitioning smoothly to Step 4, and remote HEAD drift detection with a non-destructive re-inspect CTA.

Out of scope: Automatic change pack zip creation and drift reconciliation (Phase 30), organization conventions (Phase 31), and external research (Phase 32).

</domain>

<decisions>
## Implementation Decisions

### SSH Profile & Repo Targeting
- **D-01:** SSH configuration (`sshConfigId`) and target repository directory path (`remoteRepoPath`) are bound per-project in IndexedDB/Dexie settings. When entering Step 3 for any CR in that project, the profile and remote path are pre-selected automatically, avoiding repetitive manual entry. — **Reversibility:** reversible — stored in project setting.
- **D-02:** Base branch for comparison defaults to auto-detected `origin/main` (fallback `origin/develop`), configurable in project/CR settings if a different baseline is needed.

### Branch Resolution & Git Status
- **D-03:** User selects the target branch from an interactive dropdown populated by remote git branch fetch (`git branch -a` / `git for-each-ref`). The system automatically queries remote branches via SSH and lets the user choose, rather than requiring blind manual text input.
- **D-04:** Dirty working tree handling: if `git status --porcelain` detects uncommitted changes, Step 3 displays a clear warning banner listing the uncommitted files, but still allows the user to review committed diffs ($BASE..HEAD) with an optional toggle to inspect uncommitted changes. — **Reversibility:** reversible.

### Review UI Layout & Diff Preview
- **D-05:** Step 3 layout uses a resizable 2-column split view:
  - Left panel: Commit timeline log (`git log`) and changed files tree with +/- line additions/deletions stats.
  - Right panel: File diff viewer previewing the currently selected file.
- **D-06:** The review interface includes a "Full Screen / Expand" modal toggle so developers can comfortably review large changesets across their entire monitor.
- **D-07:** Diff Viewer supports both Unified (stacked) and Split (side-by-side) viewing modes, monospaced line numbering, and safety capping (files > 1MB or > 5000 lines are capped with a "Load Full Diff" confirmation button).

### Snapshot Approval & Handoff
- **D-08:** Clicking "Approve Review" saves a verified `BranchSnapshot` object ({ base, head, branch, commitShas, fileStats, approvedAt }) directly into CR state in IndexedDB (Dexie DB). This unlocks transition to Step 4 and marks Step 3 as approved. — **Reversibility:** reversible.
- **D-09:** Drift check: if the remote branch HEAD changes after approval (e.g. developer pushes new commits while in Step 3/4), the UI displays an informative alert ("Remote HEAD has drifted from approved snapshot") with a "Re-inspect & Update Snapshot" button, without zeroing out workflow progress or corrupting saved state.

### Claude's Discretion
- Exact split-pane divider implementation (CSS grid / flex resizer or Ant Design splitter).
- Exact icon choices and badge colors for commit timeline and git status flags (A, M, D, R).
- Shell execution escaping helpers for remote git commands executed via `ssh_exec_command`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Milestone Contracts
- `.planning/ROADMAP.md` § Phase 29 — SSH Remote Repository Branch & Diff Review goal, success criteria, and wave plan.
- `.planning/REQUIREMENTS.md` § Repository Autonomy via Native SSH — SDLC-REPO-01, SDLC-REPO-02, SDLC-REPO-03, SDLC-REPO-06.
- `.planning/PROJECT.md` § Constraints — Desktop Tauri runtime primary, native keyring, IndexedDB persistence.

### SSH & Remote Execution Architecture
- `src/services/sshService.ts` — existing Tauri SSH commands: `testSshConnection`, `execRemoteCommand`, keyring credential resolution.
- `src/types/ssh.ts` — `SshConfig`, `CommandOutput`, and SSH settings key constants.
- `src-tauri/src/commands/ssh.rs` — native Rust SSH implementation with session pooling, command execution, and SFTP file operations.

### SDLC Step 3 & Workflow State
- `src/components/sdlc/steps/Step3CodeGuideView.tsx` — current Step 3 placeholder view to be upgraded into the interactive branch & diff review UI.
- `src/services/wizard/workflowSchemas.ts` — SDLC workflow state schemas, step definitions, and artifact records.
- `src/services/wizard/workflowCoordinator.ts` — workflow step transitions, draft state persistence, and staleness detection.
- `src/views/ProjectSdlcView.tsx` — SDLC master view hosting step views and step transitions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sshService.ts` & `execRemoteCommand`: already provides native Tauri invocation of `ssh_exec_command` with keyring secret resolution. Git inspection commands (`git branch`, `git log`, `git diff`, `git status`) can execute through this service.
- `ProjectSdlcView.tsx`: handles step selection, project metadata, and navigation between Step 3 and Step 4 (`onProceedToStep4`).
- `Step3CodeGuideView.tsx`: already exists with the handoff contract and guard checking; can be extended with the review panel.

### Established Patterns
- Ant Design 6 compact styling matching IntelliJ Islands Light theme (`AppIntelliJ.tsx`).
- Dexie DB as canonical persistent storage for projects, settings, and CR workflow state.
- Keyring security: secrets (passwords/private keys) never stored in plaintext in DB; accessed via `keyringService.ts`.

### Integration Points
- `src/services/gitRemoteService.ts` (new): high-level service wrapping `sshService` to parse git branches, commit history, file stats, and diff text.
- `Step3CodeGuideView.tsx`: host component rendering the SSH profile selector, branch dropdown, resizable review split pane, and approval CTA.
- `src/components/sdlc/diff/RemoteDiffViewer.tsx` (new): component for rendering Unified & Split diffs with fullscreen toggle.
- `src/services/wizard/workflowCoordinator.ts`: storing `branchSnapshot` on approval.

</code_context>

<specifics>
## Specific Ideas
- User emphasized: Target branch must be selectable from a dropdown populated by remote git branches, not purely typed manually.
- User emphasized: Review UI must have a resizable 2-column/panel layout and support fullscreen modal viewing for comfortable code inspection.
- Uncommitted changes on the remote branch must trigger a visible warning but not completely block inspection.
- Remote drift after snapshot approval should warn and offer re-inspection rather than silently discarding progress.

</specifics>

<deferred>
## Deferred Ideas

None — discussion remained strictly focused on Phase 29 scope. Automatic change pack packaging and drift reconciliation are scoped for Phase 30.

</deferred>

---

*Phase: 29-SSH Remote Repository Branch & Diff Review*
