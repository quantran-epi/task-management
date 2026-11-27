---
status: resolved
trigger: "ssh remote explorer tree - refresh directory tree là ko expand được folder nữa; folder compact đang hoạt động không nhất quán, có 2 folder cha, bên trong đều là 1 folder con chứa file trực tiếp, nhưng 1 folder cha khi expand thì hiển expand riêng folder con, 1 folder cha thì lại hiển thị dạng parent.child; file đã stage nhưng chưa commit thì không nhìn được trên tree trạng thái AM, nhưng mở file viewer thì empty"
created: 2026-11-27
updated: 2026-11-27
---

# Symptoms

- Expected: Normal tree semantics — refresh preserves currently expanded folders; compact mode uses one consistent rule; staged AM file appears in tree and viewer shows its content.
- Actual:
  1. Refresh directory tree no longer expands folders.
  2. Compact folder behavior inconsistent: two parent folders each contain one child folder with direct files; one parent expands showing the child separately, the other shows `parent.child`.
  3. A staged-but-uncommitted file (AM) is not visible in the tree; opening it in the file viewer shows empty content.
- Errors: Unknown; no logs provided.
- Timeline: Unknown when it started.
- Reproduction: SSH connect, expand nested folders, click refresh; compare two parent folders in compact mode; open a staged AM file.

## Current Focus

- hypothesis: Three independent causes in the remote Git explorer. (1) Refresh replaces `treeData` with fresh childless root nodes but leaves rc-tree's internal `loadedKeys` intact because `Tree key={treeTargetKey}` does not change on refresh, so `onLoadData` is skipped for previously loaded folders — folders never expand again. (2) `compactRemoteTree` stops a single-child folder chain at any `gitStatus` badge, and `mergeUncommittedFilesIntoTree` badges every directory containing a dirty file, so a clean parent compacts to `parent.child` while an equivalent dirty parent renders the child as a separate row. (3) Staged-new file: `getRemoteFileContent` refuses working-tree fallback when `git ls-files --error-unmatch` exits 0, which is exactly the AM case (tracked in index, absent from ref), so viewer gets no content; and `mergeUncommittedFilesIntoTree` creates only a badged folder placeholder for a new file in a directory absent from the ref, so the file itself is unreachable in tree.
- test: Targeted Vitest for `remoteTreeCompact`, `RemoteGitExplorer`, `gitRemoteTreeService`; plus real-git probe confirming `git status --porcelain=v1 -z` emits `AM <path>` and `git cat-file HEAD:<path>` fails while `ls-files --error-unmatch` exits 0 for staged-new files.
- expecting: Refresh keeps expansion and reloads children; compact rule identical for dirty/clean chains with badge preserved on the merged node; AM file visible in tree and viewer shows working-tree content.
- next_action: none — resolved

## Resolution

- root_cause: (1) Refresh replaced `treeData` but kept rc-tree's stale internal `loadedKeys`, so `loadData` was skipped and folders would not expand; (2) `compactRemoteTree` treated any `gitStatus` badge as a compaction boundary, so a dirty single-child chain stayed split while a clean one folded into `parent.child`; (3) staged-new (AM) files were rejected by `getRemoteFileContent`'s index probe and only a bare folder placeholder was inserted into a tree for a new nested path, hiding the file and leaving viewer empty.
- fix: Refresh now bumps a `treeRefreshKey` in the `Tree` React key, resetting rc-tree loadedKeys while preserving `expandedKeys`. Compaction ignores directory badges and carries the first badge onto the merged row. `getRemoteFileContent` falls back to the working tree for index-staged-add paths (still guarded against WR-01), and `mergeUncommittedFilesIntoTree` materializes the whole folder chain down to the staged-new file.
- cycles: 1 investigation + 1 fix
- verification: 45 targeted tests pass across `remoteTreeCompact`, `gitRemoteTreeService`, `RemoteGitExplorer`, plus `tsc --noEmit`. One unrelated pre-existing failure in `RemoteFileViewer.test.tsx` (Mermaid save test, fails without these changes).
- prevention: why not caught: existing tests encoded the old badged-boundary and probe-exit-0 behavior; guard: new regression tests for refresh expansion, dirty-chain compaction parity, staged-new nested-file merge, and staged-new content fallback.

## Evidence

- timestamp: 2026-11-27 — Source: `src/workbench/toolwindows/RemoteGitExplorer.tsx:830` refresh only calls `loadRootTree()`; `:378` sets fresh root nodes; `:264` `treeTargetKey` excludes refresh; `:936` `Tree key={treeTargetKey}`. rc-tree `@rc-component/tree/lib/Tree.js:730` skips `loadData` when `loadedKeys.includes(key)`; `:895` `onNodeExpand` calls `onNodeLoad`. Confirms stale loadedKeys block reload after refresh.
- timestamp: 2026-11-27 — Source: `src/utils/remoteTreeCompact.ts:58,63` `hasBadge` stops chain; `src/services/gitRemoteTreeService.ts:97-100` marks any directory containing uncommitted files `gitStatus='M'`. Clean vs dirty chains therefore compact differently.
- timestamp: 2026-11-27 — Source: real git probe in `/tmp/am-probe.*`: porcelain emits `A M new.ts` (AM); `git cat-file -p HEAD:new.ts` -> `path 'new.ts' exists on disk, but not in 'HEAD'`; `git ls-files --error-unmatch -- new.ts` -> exit 0. `src/services/gitRemoteTreeService.ts:326-345` throws on probe exit 0. Viewer at `src/workbench/editor/RemoteFileViewer.tsx:82-93` then sets `content=null`.
- timestamp: 2026-11-27 — Source: `src/services/gitRemoteTreeService.ts:76-114` only inserts the first path segment for a new nested file (`isDirectLeaf` false -> folder with status), and expanding that new folder calls `getRemoteTree(ref:newdir)` which fails because the path is not in the ref.

## Eliminated

- SSH connection/auth failure: all three symptoms are local state/merge logic; no credential or transport evidence.
- AntD `Tree` wrapper `compact` prop: `src/components/ui/tree.tsx` only sets row-height tokens; not the folder-compaction feature.
