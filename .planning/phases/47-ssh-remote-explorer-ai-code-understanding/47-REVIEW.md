---
phase: 47-ssh-remote-explorer-ai-code-understanding
reviewed: 2026-11-19T12:05:26Z
depth: deep
files_reviewed: 36
files_reviewed_list:
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/InlineAISelectionBar.tsx
  - src/components/ai/RemoteCitationChips.tsx
  - src/components/ai/RemoteSelectionAnchor.ts
  - src/components/ai/ScopePickerModal.tsx
  - src/components/ai/runtime/chatTurnRuntime.ts
  - src/db/index.ts
  - src/db/repositories/chatTabRepo.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/contextGrounding.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/sshFsToolService.ts
  - src/types/models.ts
  - src/types/sshFsTool.ts
  - src/utils/remoteTarget.ts
  - src/utils/selectionContext.ts
  - src/validation/backupSchemas.ts
  - src/workbench/editor/RemoteFileViewer.tsx
  - src/workbench/store/layoutStore.ts
  - src/workbench/toolwindows/RemoteGitExplorer.tsx
  - src/utils/selectionContext.test.ts
  - src/workbench/__tests__/RemoteFileViewer.test.tsx
  - src/workbench/__tests__/RemoteGitExplorer.test.tsx
  - src/workbench/__tests__/layoutStore.test.ts
  - tests/ai/AIChatDrawerToolbox.test.tsx
  - tests/ai/ScopePickerModal.test.tsx
  - tests/ai/chatRepo.test.ts
  - tests/ai/chatTurnRemoteTarget.test.ts
  - tests/ai/chatTurnRuntime.test.ts
  - tests/ai/chatTurnTools.test.ts
  - tests/ai/contextGrounding.test.ts
  - tests/ai/remoteScope.test.ts
  - tests/services/__tests__/gitRemoteReadPipeline.test.ts
  - tests/validation/backupSchemas.test.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
  necessity: 0
status: fixed
resolved: 2026-11-19
---

# Phase 47: Code Review Report

**Reviewed:** 2026-11-19T12:05:26Z
**Depth:** deep
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Deep review of the Phase 47 SSH-remote-explorer / AI-code-understanding implementation across all 36 listed source and test files, with cross-file tracing of the `remoteTarget` dispatcher chain, the remote scope-key/backup boundary, the selection-anchor flow, and the read-only git/SSH tool adapters. Phase 45/46 work (Oracle multi-connection, DocumentSetDetail, config profiles) was explicitly excluded and is not attributed here.

The core contracts are largely honored: `remote:<v4-uuid>` scope keys survive `threadScopeParts → buildScopeKey → Zod backup → restore`; the explicit `remoteTarget` is injected into the real drawer turn and forwarded through `chatTurnRuntime → dispatchAiToolCall → teamTools.git_read`, where it overwrites model selectors and is path-confined; citations and anchors are render-only and derive target identity from live layout state, not model text; search and paging are bounded.

Three findings are worth fixing. The most important is that on a remote turn the explicit target pins only the SSH **host** for the SSH FS tools — its `repoPath`/`branch` are silently dropped — so those tools remain host-wide and can read arbitrary remote paths, which does not fully satisfy the stated "confined / explicit target wins over model path selectors" contract. A backward-selection bug produces a wrong (collapsed) `path:line` anchor range, and a React state-updater side effect double-fires remote git calls under StrictMode. Necessity review was performed; no finding met the bar for a provable impossibility/lapse, so `necessity: 0`.

## Warnings

### WR-01: Explicit remote target does not confine SSH FS reads to repoPath/branch (host-only pin)

**File:** `src/services/ai/sshFsToolService.ts:72-105` (with `src/services/ai/aiOrchestratorLoop.ts:47-93`, `src/services/ai/aiTools.ts:2320-2347`, `src/services/ai/chatTurnTools.ts:146-165`)

**Issue:** The stated Phase 47 contract says "git_read and SSH FS tools are read-only **and confined**" and that the explicit `remoteTarget` "wins over global config/model args". This holds for `git_read`: `teamTools.resolveGitRepo` uses the full `{sshConfigId, repoPath, branch}` and every reader runs through `confineRepoPath`. It does **not** hold for the SSH FS tools. On a remote turn `getToolsForTurnWithRemote` advertises all three (`ssh_list_dir`, `ssh_read_file_page`, `ssh_grep_files`) alongside `git_read`. Their dispatch chain is `dispatchAiToolCall` → `executeAiTool` → `executeSshListDir/ReadFile/GrepFiles` → `resolveSshConfig`, and `resolveSshConfig` reads **only** `remoteTarget.sshConfigId`. The target's `repoPath` and `branch` are never used to scope or confine the read; the model-supplied `args.path` is resolved through `resolveRemotePath(args.path, fsConfig.defaultBasePath)` with no relationship to the active target. When a remote turn has no global SSH FS config (the Pitfall 6 case the code explicitly supports), `persisted` is null, so there is no `defaultBasePath` at all and an absolute `path` is used verbatim — a model can read any file the SSH user can read (e.g. `/etc/passwd`, `~/.ssh/...`) on the pinned host. That is a real read-boundary/contract gap: the explicit target only wins on host identity, not on path/ref, and remote reads are not confined to the scoped repo.

**Fix:** When a target is active, confine SSH FS paths to `remoteTarget.repoPath` (mirroring `confineRepoPath`) and default the branch/ref to `remoteTarget.branch`. For example, in `resolveSshConfig` return the target repo path as the base, and in each executor replace `resolveRemotePath(args.path, fsConfig.defaultBasePath)` with a target-aware resolver that rejects paths escaping `repoPath`:

```ts
// resolveSshConfig: carry target scope, not just host identity
const basePath = remoteTarget?.repoPath ?? persisted?.defaultBasePath;
return { fsConfig: { ...fsConfig, defaultBasePath: basePath }, sshConfig };

// executeSshReadFile / executeSshListDir / executeSshGrepFiles:
// refuse args.path that resolves outside the target repo (PathOutsideRepoError-style guard).
```
If SSH FS tools are intentionally meant to remain host-wide even on a remote turn, then remove `ssh_list_dir`/`ssh_read_file_page`/`ssh_grep_files` from the remote-turn payload in `getToolsForTurnWithRemote` (advertise only `git_read`), so the "confined" contract is not contradicted by the advertised toolset.

### WR-02: Backward (bottom-to-top) remote selection yields a collapsed/incorrect line range

**File:** `src/components/ai/RemoteSelectionAnchor.ts:57-75`

**Issue:** `extractRemoteSelectionAnchor` computes `startLine` from `selection.anchorNode` and `endLine = Math.max(startLine, focusLine)`. For a normal forward drag this is correct. For a backward drag (user selects from a lower line up to a higher line), the anchor is on the higher-numbered line and the focus on the lower-numbered line. `startLine` is then the higher number and `Math.max` collapses the range to that single line — e.g. selecting lines 10→42 backward produces `startLine=42, endLine=42` instead of `10-42`. The selected *text* (`selection.toString()`) is still correct, so the emitted mention header and inline-read context carry a wrong `path:line`. This defeats the D-11 contract that the anchor carry accurate target/path/line, and the test suite (`src/utils/selectionContext.test.ts:137-158`) only covers a same-line selection, so the defect is unguarded.

**Fix:** Order the two endpoints by line number:

```ts
const aLine = lineNumberForNode(selection.anchorNode, container);
const bLine = lineNumberForNode(selection.focusNode, container);
if (aLine === null || bLine === null) return null;
const startLine = Math.min(aLine, bLine);
const endLine = Math.max(aLine, bLine);
```
Add a regression test that builds a multi-line viewer DOM and selects from line 42 back to line 10, asserting `startLine === 10 && endLine === 42`.

### WR-03: Remote-side effects inside a `setSelectedBranch` updater double-fire under StrictMode

**File:** `src/workbench/toolwindows/RemoteGitExplorer.tsx:300-309`

**Issue:** `loadBranches` performs remote side effects (`setActiveRemoteBranch(nextBranch)` and `void loadRootTree(nextBranch, targetPath)`) *inside* the `setSelectedBranch((current) => {...})` state updater. The app runs under `<React.StrictMode>` (`src/main.tsx:46`), which intentionally double-invokes state updater functions to detect impurity. On the initial load / config change this results in duplicate `getRemoteTree`/`checkDirtyStatus` SSH round-trips and duplicate `setActiveRemoteBranch` calls, and it violates React's rule that updaters must be pure. This is a correctness/robustness defect (duplicate remote work, potential duplicate state churn) introduced in the Phase 47 explorer rewrite.

**Fix:** Compute the next branch from current state outside the updater (a ref mirroring `selectedBranch` already exists via `activeRemoteBranch`), then perform side effects once:

```ts
const preferred = selectedBranch || activeRemoteBranch;
const stillValid = preferred && remoteBranches.some((b) => b.name === preferred);
const nextBranch = stillValid ? preferred : defaultBranch;
setSelectedBranch(nextBranch);
if (nextBranch) {
  setActiveRemoteBranch(nextBranch);
  void loadRootTree(nextBranch, targetPath);
}
```

## Info

### IN-01: Dead guard in `resolveSshConfig` after refactor

**File:** `src/services/ai/sshFsToolService.ts:77-95`

**Issue:** After the Phase 47 refactor, `configId = remoteTarget?.sshConfigId || persisted?.sshConfigId || ''` followed by `if (!configId) throw` makes the later `if (!remoteTarget && !persisted) throw` unreachable: for both to be falsy, `configId` would be `''` and the first guard would already have thrown. The second branch is dead code left over from the pre-refactor two-step check; it can only mislead readers about which failure mode is possible. This is a Phase 47-introduced dead branch (the original had two reachable checks).

**Fix:** Remove the `if (!remoteTarget && !persisted)` block and its now-redundant message; the single `!configId` guard covers all cases with the appropriate remote-vs-global message already selected at line 80.

---

## Resolutions

- **WR-01:** FIXED — `resolveRemoteToolPath` now confines `ssh_list_dir`, `ssh_read_file_page`, and `ssh_grep_files` to `remoteTarget.repoPath` on remote turns, refuses `~` and out-of-repo absolute paths before any SSH call, and keeps legacy global-config behavior unchanged. Focused regression added in `src/services/ai/__tests__/sshFsToolService.test.ts`.
- **WR-02:** FIXED — `extractRemoteSelectionAnchor` now orders browser anchor/focus endpoints by line number, so backward selections emit the correct min/max range. Regression added in `src/utils/selectionContext.test.ts`.
- **WR-03:** FIXED — branch selection side effects were moved out of the `setSelectedBranch` updater into a single pure computed path. StrictMode regression added in `src/workbench/__tests__/RemoteGitExplorer.test.tsx`.
- **IN-01:** FIXED — unreachable fallback guard removed from `resolveSshConfig`.

Verification after fixes: typecheck clean; Phase 47 focused union 12 files / 139 tests pass; cross-phase regression 29 files / 588 tests pass; knowledge-server set-list suite 1 file / 2 tests pass.

_Reviewed: 2026-11-19T12:05:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
