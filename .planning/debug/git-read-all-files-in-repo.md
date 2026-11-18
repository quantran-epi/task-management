---
status: awaiting_human_verify
trigger: "Owner decision: git_read read_file must read ALL files inside the configured repo, including tracked files with uncommitted modifications and untracked files. Only paths outside the repo remain forbidden. Reading another repo still requires an agent-provided systemId/SSH profile that is linked to the team; no arbitrary repo path."
created: "2026-11-17"
updated: "2026-11-17"
---

# Debug Session: git-read-all-files-in-repo

## Symptoms

- Expected behavior: `git_read` with `action: "read_file"` returns a bounded page of any file under the resolved remote repo working tree: committed content, tracked-but-modified content, and untracked files. Confine to the repo root; reject only paths outside it. To read another repo the agent must supply a `systemId` (or otherwise select a linked system) whose SSH profile/repo path is already linked to the team.
- Actual behavior: `readRemoteFilePage` first reads `<ref>:<path>` via `git cat-file`; the working-copy fallback is used only when the file is absent from the ref. A tracked file with uncommitted edits therefore returns the committed blob, not the current working-tree content.
- Error messages: none; behavior is silently stale for modified tracked files.
- Timeline: owner clarification after phase 44 UAT on 2026-11-17.
- Reproduction: modify a tracked file in the linked remote working tree without committing; call `git_read read_file` for that path; observe committed content instead of current file. Create an untracked file; observe fallback may work but contract is not explicit.

## Current Focus

- phase: fix_and_verify Step 0 (Structured Reasoning Checkpoint) — root cause CONFIRMED, about to write failing test then fix
- bug_class: bohrbug — deterministic: ref blob read before working-copy fallback; modified tracked files always return stale committed content
- kb: no .planning/debug/knowledge-base.md exists; MemPalace CLI not on PATH -> no semantic recall candidates (logged skip). No agent/project skills configured.
- team_tool_call_site: teamTools.ts:1334 `read_file` action calls `readRemoteFilePage` (confirmed) — `getRemoteFileContent` is the editor's whole-file reader, out of scope per trigger.

reasoning_checkpoint:
  hypothesis: "readRemoteFilePage selects the `<ref>:<path>` cat-file blob as primary source and only uses the working copy when the path is absent from the ref; a tracked-but-modified file IS in the ref, so it returns the stale committed blob instead of current working-tree bytes. Making the working tree primary fixes it because all in-repo files (committed, modified, untracked) exist on disk and flow through the same source-agnostic paging pipeline."
  confirming_evidence:
    - "gitRemoteTreeService.ts:390-403 builds refSource = `git cat-file -p <ref>:<path>` and calls readPageFromSource with it FIRST."
    - "gitRemoteTreeService.ts:404-426 only falls back to workingCopyCatSnippet when isNotInRef(err) AND `ls-files --error-unmatch` exits 1 (genuinely untracked)."
    - "Trigger/owner decision states modified tracked files return committed content and must return working-tree content; only outside-repo paths forbidden."
    - "Baseline: all 20 focused pipeline tests pass; none covers a modified tracked file, so no test catches this."
  falsification_test: "If after switching to working-tree-primary a modified tracked file still returns committed content, OR an untracked file becomes unreadable, OR an outside-repo/symlink path becomes readable, the hypothesis or fix is wrong."
  fix_rationale: "Root cause is source-selection order, not paging/confinement. Switching the source snippet handed to the source-agnostic readPageFromSource to workingCopyCatSnippet makes working-tree bytes authoritative while reusing the same confinement, binary probe, byte/line paging, and total-count logic — no invariant is touched. Minimal: one function, no shared helpers changed."
  blind_spots: "Untested so far: symlink-escape refusal still fires on read_file; traversal path rejection; a tracked file deleted from working tree (ref-only) will now error with no ref fallback; whether phase 43 intended cross-branch reads; editor's getRemoteFileContent retains ref-first behavior (out of scope per trigger)."
  candidate_causes:
    - "code: readRemoteFilePage source-selection order (ref blob before working tree)"
    - "config: none — no config value controls source selection; repo path resolution unchanged"
    - "environment: none — deterministic on any remote OS; realpath portability already handled"
    - "data: working tree may contain uncommitted modifications that a ref blob cannot represent — inherent to git, not itself a defect"
  and_gate: "no — ref-first source selection alone fully accounts for stale content on modified tracked files; no second co-occurring condition required."

- phase: fix_and_verify Step 2 (fix-acceptance guardrail) — fix applied, target test GREEN, running remaining signals
- test-result: 24/24 gitRemoteReadPipeline tests pass. Regression seed (modified tracked file) was RED before fix (returned `const line1 = 1;`), GREEN after (returns `WORKTREE line one`). Staged-file neighbor also RED->GREEN.
- next_action: Run typecheck (tsc --noEmit) and adjacent read tests (gitRemoteTreeService.test.ts, gitRemoteTree.test.ts, RemoteFileViewer.test.tsx); then revert-and-reconfirm the fix; record all 5 guardrail signals.

## Evidence

- timestamp: 2026-11-17
  checked: src/services/gitRemoteTreeService.ts readRemoteFilePage (:378-427) and readPageFromSource (:429-480)
  found: refSource = `git cat-file -p <ref>:<path>` is handed to readPageFromSource first; workingCopyCatSnippet reached only via catch when isNotInRef AND ls-files exits 1 (untracked only).
  implication: Confirms symptom — tracked-but-modified file has a valid ref blob, so cat-file succeeds and working tree is never consulted.
- timestamp: 2026-11-17
  checked: teamTools.ts:1321-1357 read_file action; git history of gitRemoteTreeService.ts
  found: read_file calls readRemoteFilePage; ref-first design came from phase 42/43 safety work (WR-01: avoid labelling working copy as branch content). No owner decision then about working-tree authority.
  implication: Fix scope is the AI tool read path only; editor's getRemoteFileContent (RemoteFileViewer) stays ref-first and out of scope.
- timestamp: 2026-11-17
  checked: baseline + failing test run of tests/services/__tests__/gitRemoteReadPipeline.test.ts
  found: baseline 20/20 pass; after adding regression tests, 2 failed (modified tracked file -> committed `const line1 = 1;`; staged file -> committed `NEEDLE first`), 22 passed.
  implication: Bug reproduced deterministically (bohrbug); specified oracle; fix target validated.
- timestamp: 2026-11-17
  checked: applied fix + re-ran focused tests
  found: readRemoteFilePage now passes workingCopyCatSnippet directly to readPageFromSource; 24/24 pass, including new symlink-confinement and unmodified-file boundary tests.
  implication: Root-cause fix works; paging/binary/confinement invariants preserved.

## Resolution

oracle_type: "specified — owner decision directly states read_file must return current working-tree bytes for any in-repo path"
root_cause: "readRemoteFilePage selected the `<ref>:<path>` cat-file blob as primary source and fell back to the working copy only when the path was absent from the ref; a tracked-but-modified file IS in the ref, so it returned stale committed bytes instead of current working-tree content."
fix: "Made the working tree the authoritative source for readRemoteFilePage: pass workingCopyCatSnippet(repoPath, cleanPath) directly to the source-agnostic readPageFromSource; removed the ref-first try/catch + ls-files untracked-probe fallback. Kept ref param as `_ref` for tool-contract compatibility. Confinement, byte/line paging, binary probe and paged total unchanged. getRemoteFileContent (editor, whole-file) intentionally stays ref-first — out of scope."
verification:
  target_test: { result: pass, detail: "24/24 gitRemoteReadPipeline tests pass; seed RED before fix, GREEN after" }
  mutation_check: { result: pass, detail: "no Stryker configured; agent-authored behavioral mutation — reverting source selection to refSource restores bug and fails the seed (see revert_and_reconfirm)" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, detail: "diff removes the now-dead untracked-probe fallback, which WAS the bug mechanism; RCA explicitly justifies it" }
  adjacent_tests: { result: pass, suites_run: ["gitRemoteReadPipeline.test.ts", "gitRemoteTreeService.test.ts", "gitRemoteTree.test.ts", "RemoteFileViewer.test.tsx"], detail: "67/67 pass; typecheck (tsc --noEmit) also clean" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, detail: "reverted source to HEAD ref-first -> 2 seed tests fail with committed content (const line1 = 1; / NEEDLE first); reapplied fix -> 24/24 pass" }
  guardrail_verdict: accepted
files_changed:
  - src/services/gitRemoteTreeService.ts
  - tests/services/__tests__/gitRemoteReadPipeline.test.ts
