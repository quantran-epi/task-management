---
phase: 47-ssh-remote-explorer-ai-code-understanding
reviewed: 2026-11-19T12:33:51Z
depth: deep
files_reviewed: 13
files_reviewed_list:
  - src/services/ai/sshFsToolService.ts
  - src/services/ai/__tests__/sshFsToolService.test.ts
  - src/components/ai/RemoteSelectionAnchor.ts
  - src/workbench/toolwindows/RemoteGitExplorer.tsx
  - src/types/sshFsTool.ts
  - src/services/gitRemoteTreeService.ts
  - src/utils/selectionContext.test.ts
  - src/workbench/__tests__/RemoteGitExplorer.test.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/utils/remoteTarget.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/chatTurnTools.ts
  - src/components/ai/runtime/chatTurnRuntime.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
  necessity: 0
status: clean
---

# Phase 47: Code Review Report (final post-fix re-review)

**Reviewed:** 2026-11-19T12:33:51Z
**Depth:** deep
**Files Reviewed:** 13
**Status:** clean

## Summary

Final re-review of Phase 47 after commit `22f206b4` (`fix(47): normalize sshfs remote paths before confinement`). This pass re-read the four focus files in full, re-traced the `remoteTarget` dispatch chain (`AIChatDrawer:465-472` → `chatTurnRuntime.ts:354,375` → `aiTools.ts:2338-2346` → the three SSH FS executors), and confirmed the fix commit touched only the two SSH FS files with no uncommitted source changes anywhere in `src/` or `tests/`. The focused suite `src/services/ai/__tests__/sshFsToolService.test.ts` passes 17/17.

**CR-01 (traversal bypass, residual of WR-01) — RESOLVED.** The new `normalizePosixPath` helper (`sshFsToolService.ts:118-134`) collapses `.`/`..` segments lexically and throws on any `..` that would pop above the root. `resolveRemoteToolPath` (`:142-164`) now normalizes both the repo path and the resolved path *before* the containment check and returns the normalized path to SSH. Manual trace against the concrete attack strings from the prior report, with `repoPath = /srv/my-repo`:

- `../.ssh/id_rsa` → resolves to `/srv/my-repo/../.ssh/id_rsa`, normalizes to `/srv/.ssh/id_rsa`, fails containment → rejected.
- `/srv/my-repo/../.ssh/id_rsa` → normalizes to `/srv/.ssh/id_rsa` → rejected.
- `src/../../secret` → normalizes to `/srv/secret` → rejected.
- `src/../app.ts` → normalizes to `/srv/my-repo/app.ts` → accepted and the normalized value is what reaches SSH.

The normalized value is confirmed as the `targetPath` handed to `listRemoteDir` (`:179`), `readRemoteFileSlice` (`:269`), and the shell-quoted grep command (`:337,342`). Sibling-prefix bypass is also closed: the check uses `${normalizedRepo}/`, so `/srv/my-repo2/evil` is not accepted for repo `/srv/my-repo`. Regression assertions were added at `sshFsToolService.test.ts:94-96` (relative and absolute traversal + `src/../../secret`) and `:91` (benign in-repo `..`) plus an end-to-end read rejection at `:180-192` asserting the SSH spy is never called.

**Legacy global-config behavior — UNCHANGED.** With no `remoteTarget` (or one lacking `repoPath`), `resolveRemoteToolPath` still delegates verbatim to `resolveRemotePath(inputPath, defaultBasePath)` (`:148-150`); `sshFsToolService.test.ts:97` confirms `/etc/hosts` still resolves host-wide. `resolveSshConfig` (`:72-100`) is untouched by this commit, and the target identity still wins over the global id while the global config continues to supply tuning defaults.

**WR-02 / WR-03 / IN-01 — all remain fixed.**
- WR-02: `extractRemoteSelectionAnchor` still orders both endpoints with `Math.min`/`Math.max` (`RemoteSelectionAnchor.ts:63-64`); regression `selectionContext.test.ts:160-173` asserts backward drag yields `startLine=1, endLine=3`.
- WR-03: `loadBranches` still computes `nextBranch` purely and performs the state/remote side effects once outside any updater (`RemoteGitExplorer.tsx:300-309`); the only functional updater left in the file is the pure `setTreeData((prev) => updateTreeNodes(prev))` (`:389`). StrictMode regression `RemoteGitExplorer.test.tsx:110-129` asserts `getRemoteTree` is called exactly once.
- IN-01: the unreachable `!remoteTarget && !persisted` block is still absent from `resolveSshConfig` (`sshFsToolService.ts:72-100`); only the `!configId` guard remains.

**No regressions elsewhere.** The only source changes since the prior review are the two files in commit `22f206b4`; `RemoteSelectionAnchor.ts`, `RemoteGitExplorer.tsx`, and all other Phase 47 files are byte-identical to the state already reviewed. `git status` shows no uncommitted changes under `src/` or `tests/`.

Necessity review was performed at deep depth; no finding met the provable-impossibility/lapse bar, so `necessity: 0`.

## Narrative Findings (AI reviewer)

No new findings. All four previously recorded resolutions (CR-01, WR-02, WR-03, IN-01) were independently re-verified against the current source and are closed. No Critical, Warning, or Info issues remain.

All reviewed files meet quality standards. No issues found.

---

_Reviewed: 2026-11-19T12:33:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
