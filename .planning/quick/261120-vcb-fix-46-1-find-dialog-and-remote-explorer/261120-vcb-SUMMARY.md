---
phase: quick-261120-vcb
plan: '01'
type: execute
subsystem: workbench-remote-explorer-and-find
tags: [bugfix, ui, remote-git, keymap, css]
requires: [phase-46.1]
provides:
  - tree target reset + bounded single-chain expansion in RemoteGitExplorer
  - Find reachable only via in-panel button and command palette (no global Ctrl+Shift+F)
  - corrected Find seed label, Vietnamese scope tabs, and non-wrapping/scrolling Find layout
affects: [RemoteGitExplorer, useGlobalKeymap, actionRegistry, FindInRemoteFiles, find.css]
tech_stack:
  added: []
  patterns:
    - remount Tree on target key + clear controlled keys to drop AntD loadedKeys
    - bounded (24-fetch) confined getRemoteTree chain walk
    - AntD Tabs wrapped in labelled role=group axes
    - CSS-contract test via readFileSync of find.css
key_files:
  created: []
  modified:
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/workbench/__tests__/RemoteGitExplorer.test.tsx
    - src/workbench/hooks/useGlobalKeymap.ts
    - src/workbench/__tests__/useGlobalKeymap.test.tsx
    - src/workbench/actions/actionRegistry.ts
    - src/workbench/__tests__/actionRegistry.test.ts
    - src/workbench/search/find/FindInRemoteFiles.tsx
    - src/workbench/search/find/find.css
    - src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx
decisions:
  - Remove global Ctrl/Cmd+Shift+F entirely; keep find.inPath palette action with no shortcut (locked user decision).
  - Scope tabs labelled 'Toàn bộ nhánh' / 'Trong thư mục', keys remain 'whole-ref' / 'directory' (locked user decision).
  - Chain walk stops on loaded children, leaf, status badge, reveal target, source root, or 24-fetch cap.
metrics:
  duration: ~20 min
  completed_date: "2026-11-20"
---

# Quick 261120-vcb: Fix 46.1 Find Dialog and Remote Explorer Summary

Sửa 6 lỗi UI/behavior đã reproduce live: tree state/chain expansion, bỏ global Ctrl+Shift+F + thêm nút Find trong panel, và markup/CSS của Find dialog. Không research lại, không dependency mới, không `!important`, không band-aid. Mọi fetch vẫn qua `getRemoteTree` với path confinement hiện tại.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Reset tree target state and walk single-child chains on expand | `5197effe` | RemoteGitExplorer.tsx, RemoteGitExplorer.test.tsx |
| 2 | Remove global Ctrl+Shift+F and add in-panel Find control | `6507197c` | useGlobalKeymap.ts(+test), actionRegistry.ts(+test), RemoteGitExplorer.tsx(+test) |
| 3 | Fix Find seed label, axes/fields layout, result/preview CSS | `6e510f85` | FindInRemoteFiles.tsx, find.css, FindInRemoteFiles.test.tsx |
| 4 | Scroll the whole preview pane + syntax colors + chip axes (UAT follow-up) | `d32baf76` | find.css, parts.tsx, FindInRemoteFiles.test.tsx, RemoteCodePreview.test.tsx |
| 5 | Fix chain walk to advance level by level (code-review finding) | `01163918` | RemoteGitExplorer.tsx, RemoteGitExplorer.test.tsx |
| 6 | Empty-state copy points at "Toàn bộ nhánh" (code-review finding) | `7940b164` | session.ts |

## Key Changes

- **BUG-01**: `treeTargetKey = selectedConfigId|repoPath|selectedBranch`; target/branch sync effects clear `expandedKeys`/`selectedKeys` under the existing `lastAppliedTargetRef`/`lastAppliedBranchRef` guards; `key={treeTargetKey}` on AntD `Tree` drops internal `loadedKeys`.
- **BUG-02**: `onLoadData` rewritten into a bounded walk (cap 24) starting at `node.rawPath` (compacted last path). Continues past a single non-leaf folder with no badge/reveal/source-root stop and no loaded children; merges uncommitted files at each level; injects chain then recomputes via `compactRemoteTree`.
- **BUG-03**: Ctrl/Cmd+Shift+F branch deleted from `useGlobalKeymap`; `find.inPath` keeps its palette event dispatch, `shortcut` metadata removed; new `open-find-btn` in the explorer controls dispatches `taskmate:open-find-in-remote-files`, disabled without full target.
- **BUG-04**: three diagnostic spans + duplicate label replaced by one `span.find-scopeval[data-testid=find-seed]` with `data-config-id`/`data-repo-path`/`data-branch`; visible text is `repoPath / branch` or "No active remote target"; UUID never in text.
- **BUG-05**: AntD Tabs preserved (role=tab) inside `div.find-axis[role=group]` labelled "Mode"/"Scope" with a border separator; Vietnamese scope labels, keys unchanged; `.find-fields` nowrap with Pattern `min-width:160px`, Directory `flex:0 1 220px; min-width:140px`.
- **BUG-06**: result rows ellipsize inside `overflow-x:hidden` list; preview `.find-cline` uses `min-height` + `height:auto`, `.find-lno` boxed gutter with 10px right padding.

## UAT follow-up (sếp's live review)

- **BUG-06b revised**: per-line horizontal scroll (`overflow-x:auto` on `.find-source`) was rejected — "phải scroll cả section, chứ sao lại scroll mỗi 1 dòng chữ dài". Now `.find-code { min-width:100%; width:max-content }` and `.find-preview-body { overflow:auto }`, so the section scrolls once.
- **Layout root cause**: `.find-split` was `display:grid` with only `grid-template-rows`, so the implicit column sized to max-content and a long preview line widened the dialog to 2509px. Fixed with `grid-template-columns: minmax(0,1fr)` plus `min-width:0` on `.find-results-pane`, `.find-preview`, `.find-preview-body`.
- **Syntax highlighting**: `CodePreview` now reuses `tokenizeCodeLine` + `getGithubThemeColors` from `DiffSyntaxHighlighter` and `useThemeMode`, via a new `SyntaxLine` that intersects tokens with match ranges — so hits keep both syntax color and `<mark>` background. No new dependency.
- **Mode/Scope axes**: restyled from cramped AntD underline tabs to chip groups (bordered rounded `.find-axis`, label with separator, ink-bar hidden, active chip `background: var(--accent-soft)`).
- **Copy**: empty-state hint referenced the now-removed "Whole ref" label; changed to `"Toàn bộ nhánh"`.

## Verification

Scoped commands only (full vitest suite never run — project rule):

- `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx src/utils/__tests__/remoteTreeCompact.test.ts` — PASS, 2 files, 32 tests.
- `npx vitest run src/workbench/__tests__/useGlobalKeymap.test.tsx src/workbench/__tests__/actionRegistry.test.ts src/workbench/__tests__/RemoteGitExplorer.test.tsx` — PASS, 3 files, 38 tests.
- `npx vitest run src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx src/workbench/search/find/__tests__/visualTokens.test.tsx` — PASS, 2 files, 36 tests.
- Post-UAT: `RemoteGitExplorer.test.tsx` 23 PASS (incl. new deeper-chain case), `RemoteCodePreview.test.tsx` + `FindInRemoteFiles.test.tsx` 29 PASS, all three find files 41 PASS, `useGlobalKeymap` + `actionRegistry` + `remoteTreeCompact` 27 PASS, find+session 35 PASS.
- `npx tsc --noEmit` — PASS (exit 0, no diagnostics).
- Grep checks: no `!important` in find.css; no raw diagnostic seed spans; no `Ctrl+Shift+F` outside the two inert-keymap tests.

### Browser verification (Chrome DevTools, `http://localhost:5173/task-management/`)

Measured, not eyeballed:

- Result row with a 500-char code cell + 200-char path: `rowW 788 = modalW 788`, `overflow-x: hidden` → ellipsizes, never widens the modal. **PASS**
- Preview with a 300-char line: before fix `paneW 2509` (grid blowout); after fix `paneClientW 788`, `paneScrollW 2509`, single bottom scrollbar, all lines aligned at the gutter. **PASS**
- Ctrl+Shift+F dispatched synthetically: `defaultPrevented: false`, no dialog state change. **PASS**
- `Directory` scope: Pattern **351px** (min 160), Directory **140px**, no `.find-fields` overflow. **PASS**
- Mode/Scope: separate chip groups, `Mode` 212px / `Scope` 247px, tab height 22px, labels "Toàn bộ nhánh" / "Trong thư mục". **PASS**
- Seed label: one short `repoPath / branch` label (or "No active remote target"); UUID lives in `data-config-id` only. **PASS**
- Preview syntax: `const` red, string navy, number blue, comment gray, hit `<mark>` yellow with token color retained. **PASS**

Limitation: a plain browser has no Tauri SSH, so real grep hits cannot be produced. Row/preview geometry and syntax colors were verified with controlled DOM injection; the real React rendering path is covered by `RemoteCodePreview.test.tsx` and `FindInRemoteFiles.test.tsx`. The in-panel Find button stays disabled in the browser (Tauri guard) — enabled path is unit-tested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Walk re-fetched a node whose children were already loaded**
- **Found during:** Task 1 verification (BUG-02 chain test hit the 24-fetch cap with 23 duplicate `vn/shb/core` calls).
- **Issue:** After attaching deeper children and continuing the loop, the single-child stop condition did not check `only.children`, so the walk refetched the same path until the cap.
- **Fix:** Added `Boolean(only.children?.length)` to the stop conditions in `onLoadData`.
- **Files modified:** src/workbench/toolwindows/RemoteGitExplorer.tsx
- **Commit:** `5197effe`

**2. [Review finding] The chain walk could never descend more than one level**
- **Found during:** independent code review of the Task 1 diff, then reproduced by a new test.
- **Issue:** The loop nested each fetched level into `children[0]` and then re-evaluated that same node, whose `children` were now non-empty — so `Boolean(only.children?.length)` broke the loop after exactly one descent and `CHAIN_FETCH_CAP = 24` was unreachable. An empty single-child folder made it refetch the same path up to 24 times. The original test only had a 2-level chain, so it passed and masked the bug.
- **Fix:** Track the current level in its own variable, record walked folders in a `chain` array, and fold the chain back into one nested subtree only at injection time. Added `RemoteGitExplorer.test.tsx` case with a 4-level chain asserting one fetch per level (verified failing before the fix, passing after).
- **Files modified:** src/workbench/toolwindows/RemoteGitExplorer.tsx, src/workbench/__tests__/RemoteGitExplorer.test.tsx
- **Commit:** `01163918`

**3. [Review finding] Empty-state copy referenced a label that no longer exists**
- **Found during:** code review.
- **Fix:** `session.ts` `emptyBody` now says `"Toàn bộ nhánh"` instead of `Whole ref`.
- **Commit:** `7940b164`

No other deviations. No new dependency, no full-suite run.

## Threat Flags

None. No new network endpoint, auth path, or schema at a trust boundary. Chain walk reuses confined `getRemoteTree` and passes repo-relative folder keys only (T-vcb-01 mitigated); seed UUID confined to data attributes (T-vcb-02); global keymap branch removed (T-vcb-03); chain cap + min-height/overflow layout bound resource use (T-vcb-04).

## Known Stubs

None.
