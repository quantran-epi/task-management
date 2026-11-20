---
phase: quick-261120-vcb
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/toolwindows/RemoteGitExplorer.tsx
  - src/workbench/__tests__/RemoteGitExplorer.test.tsx
  - src/workbench/hooks/useGlobalKeymap.ts
  - src/workbench/__tests__/useGlobalKeymap.test.tsx
  - src/workbench/actions/actionRegistry.ts
  - src/workbench/__tests__/actionRegistry.test.ts
  - src/workbench/search/find/FindInRemoteFiles.tsx
  - src/workbench/search/find/find.css
  - src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx
autonomous: true
requirements:
  - BUG-01-EXPAND-STATE
  - BUG-02-CHAIN-EXPAND
  - BUG-03-KEYMAP-REMOVE
  - BUG-04-SEED-LABEL
  - BUG-05-AXES-FIELDS
  - BUG-06-RESULT-PREVIEW-CSS
must_haves:
  truths:
    - "Switching SSH config, repo path, or branch in RemoteGitExplorer clears expanded/selected state and forces AntD Tree to forget loadedKeys, so a same-path folder in the new target loads its real children"
    - "Expanding a compacted single-child chain walks down level by level and shows the deepest real children, with a hard fetch cap"
    - "Ctrl/Cmd+Shift+F is not handled globally; no action advertises that binding; Find opens only from the Remote Git Explorer control or the command-palette action"
    - "Find dialog shows one truncated 'repoPath / branch' label; seed provenance lives in data attributes, not rendered raw UUID text"
    - "Mode and scope axes are visually distinct; scope tabs read 'Toàn bộ nhánh' / 'Trong thư mục' while keeping keys 'whole-ref' / 'directory'; the Pattern input keeps usable width when scope = Directory"
    - "Long result text stays inside the modal; preview source lines do not wrap or overlap line numbers"
  artifacts:
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/workbench/hooks/useGlobalKeymap.ts
    - src/workbench/actions/actionRegistry.ts
    - src/workbench/search/find/FindInRemoteFiles.tsx
    - src/workbench/search/find/find.css
    - src/workbench/__tests__/RemoteGitExplorer.test.tsx
    - src/workbench/__tests__/useGlobalKeymap.test.tsx
    - src/workbench/__tests__/actionRegistry.test.ts
    - src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx
  key_links:
    - from: "src/workbench/toolwindows/RemoteGitExplorer.tsx"
      to: "getRemoteTree -> injectRawChildren -> compactRemoteTree"
      via: "onLoadData chain walk keyed on node.rawPath (last path of compact chain)"
      pattern: "injectRawChildren\\(|getRemoteTree\\("
    - from: "src/workbench/toolwindows/RemoteGitExplorer.tsx"
      to: "Tree"
      via: "key derived from config|repo|branch plus cleared expandedKeys/selectedKeys"
      pattern: "expandedKeys|selectedKeys|key=\\{treeTargetKey\\}"
    - from: "src/workbench/toolwindows/RemoteGitExplorer.tsx"
      to: "taskmate:open-find-in-remote-files"
      via: "executeAction('find.inPath') from the in-panel Find button"
      pattern: "open-find-btn|executeAction\\('find\\.inPath'\\)"
    - from: "src/workbench/search/find/FindInRemoteFiles.tsx"
      to: "src/workbench/search/find/find.css"
      via: "find-pattern / find-directory / find-scopeval / find-rcode / find-cline / find-source class contracts"
      pattern: "find-pattern|find-directory|find-scopeval|find-rcode|find-source"
---

<objective>
Sửa 6 lỗi UI/behavior đã reproduce live của phase 46.1 bằng 3 task theo surface: (1) state cây và chain expansion trong RemoteGitExplorer, (2) bỏ global shortcut Ctrl/Cmd+Shift+F và thêm entry Find trong panel, (3) markup + CSS của Find dialog. Không research lại, không thêm dependency, không dùng `!important`, không band-aid. Mọi fetch vẫn đi qua `getRemoteTree` với path confinement hiện có.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/workbench/toolwindows/RemoteGitExplorer.tsx
@src/workbench/hooks/useGlobalKeymap.ts
@src/workbench/actions/actionRegistry.ts
@src/workbench/search/find/FindInRemoteFiles.tsx
@src/workbench/search/find/find.css
@src/utils/remoteTreeCompact.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reset tree target state and walk single-child chains on expand</name>
  <files>src/workbench/toolwindows/RemoteGitExplorer.tsx, src/workbench/__tests__/RemoteGitExplorer.test.tsx</files>
  <behavior>
    - Expand a folder, switch branch/repo/config, then expand the same path: getRemoteTree is called again for that folder under the new target; stale expanded/selected rows are gone.
    - Root has single-child chain vn -> vn/shb. Expanding the compact node shows `vn.shb`; expanding it fetches `vn/shb`, sees one folder `core`, fetches `vn/shb/core`, and shows the deepest file.
    - Loop stops at a branch point, a file, a badged folder, a reveal target, a source root, or after the hard cap; no unbounded fetch.
  </behavior>
  <action>
    BUG-01: derive `treeTargetKey` from `selectedConfigId|repoPath|selectedBranch`. In the existing store→local target/branch sync effects, clear `expandedKeys` and `selectedKeys` whenever the applied key changes, guarded by the existing `lastAppliedTargetRef` / `lastAppliedBranchRef` so local typing and StrictMode double-invoke never clear state on ordinary renders. Add `key={treeTargetKey}` to the AntD `Tree`. Both parts are required: clearing only the controlled state leaves AntD's internal `loadedKeys` intact, so a same-path folder in another repo would render expanded but never call `loadData`; remounting only drops `loadedKeys` but would immediately reapply stale expanded/selected keys. Do not add an imperative `loadedKeys` bypass.
    BUG-02: rewrite `onLoadData` (currently one `getRemoteTree` call at `node.rawPath`) into a bounded walk. `node.rawPath` is the compacted chain's LAST path; keep that contract. Fetch one level at `node.rawPath`. While the fetched children are exactly one non-leaf folder with no meaningful `gitStatus`, not a reveal target, and not a compaction stop (source root / reveal target per `compactRemoteTree`), fetch one level at that folder's key, attach the deeper children to that folder, and continue. Stop at branch points, files, badged nodes, reveal targets, source roots, and a hard cap of 24 fetches per expand so work stays read-only and bounded. Apply `mergeUncommittedFilesIntoTree` at every fetched level. Inject the resulting child chain at the original `node.rawPath` via `injectRawChildren`, then let `compactRemoteTree` recompute the dotted label and children. Never compose shell commands from paths; all reads go through `getRemoteTree` and its confinement.
    Update `src/workbench/__tests__/RemoteGitExplorer.test.tsx` with two focused cases: target switch after expansion re-fetches a same-path folder and drops stale selection; single-child chain expansion reaches the deepest file with bounded calls. Keep existing reveal/StrictMode tests intact.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx src/utils/__tests__/remoteTreeCompact.test.ts</automated>
  </verify>
  <done>New and existing explorer tests pass; switching target clears expansion/selection and re-fetches same-path folders; a single-child chain expands to its deepest children within the cap.</done>
</task>

<task type="auto">
  <name>Task 2: Remove global Ctrl+Shift+F and add in-panel Find control</name>
  <files>src/workbench/hooks/useGlobalKeymap.ts, src/workbench/__tests__/useGlobalKeymap.test.tsx, src/workbench/actions/actionRegistry.ts, src/workbench/__tests__/actionRegistry.test.ts, src/workbench/toolwindows/RemoteGitExplorer.tsx</files>
  <action>
    USER DECISION (locked): remove the entire Ctrl/Cmd+Shift+F branch from `useGlobalKeymap.ts` (the `executeAction('find.inPath')` block before the input guard). No other keymap branch changes.
    Keep `find.inPath` registered in `actionRegistry.ts` so the command palette can still reach Find via `dispatchHandledAction('taskmate:open-find-in-remote-files', ...)`, but remove its `shortcut: 'Ctrl+Shift+F'` metadata so no UI advertises a binding that does nothing.
    In `RemoteGitExplorer.tsx`, add a `Tooltip` + small `Button` in the controls container with `data-testid="open-find-btn"`, accessible label "Find in Remote Files", disabled when there is no selected config/repo/branch, whose `onClick` calls `executeAction('find.inPath')` from `../actions/actionRegistry`. The registry dispatches the event `WorkbenchLayout` already handles and seeds from the layout store; do not add a second event transport. No shortcut hint on the control.
    Rewrite the two old `useGlobalKeymap` tests: Ctrl+Shift+F and Cmd+Shift+F must leave `defaultPrevented` false and never call `executeAction`, while Ctrl+K and plain Ctrl+F assertions stay. Add an `actionRegistry.test.ts` assertion that `find.inPath` exists, has no `shortcut`, and its `perform` dispatches `taskmate:open-find-in-remote-files`. Add an explorer test that clicking `open-find-btn` dispatches that event.
    This task edits `RemoteGitExplorer.tsx` after Task 1; keep Task 1's tree changes intact.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/useGlobalKeymap.test.tsx src/workbench/__tests__/actionRegistry.test.ts src/workbench/__tests__/RemoteGitExplorer.test.tsx</automated>
  </verify>
  <done>Ctrl/Cmd+Shift+F neither prevents default nor dispatches any action; `find.inPath` remains palette-reachable with no shortcut metadata; clicking the in-panel Find button opens the dialog through the existing event.</done>
</task>

<task type="auto">
  <name>Task 3: Fix Find dialog seed label, axes/fields layout, and result/preview CSS</name>
  <files>src/workbench/search/find/FindInRemoteFiles.tsx, src/workbench/search/find/find.css, src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx</files>
  <action>
    BUG-04: replace the three diagnostic spans (`find-seed-config` / `find-seed-repo` / `find-seed-branch`) and duplicated label at lines 425-430 with one visible `span.find-scopeval` carrying `data-testid="find-seed"` plus `data-config-id`, `data-repo-path`, `data-branch` attributes from the store seed. Render exactly one human label: `repoPath / branch`, or a short "No active remote target" fallback. No raw UUID or concatenated diagnostic text in the DOM text content. Update the existing seed test to assert those dataset values still equal the layout store seed, so provenance stays honestly proven.
    BUG-05: keep AntD `Tabs` (existing role/tab-name assertions must pass) but wrap the mode tabs and scope tabs in separate labelled groups, e.g. `div.find-axis[role=group][aria-label="Find mode"]` with a visible "Mode" label and `div.find-axis[role=group][aria-label="Search scope"]` with a visible "Scope" label, separated by a border. USER DECISION (locked): change the scope tab labels from "Whole ref" / "Directory" to "Toàn bộ nhánh" / "Trong thư mục" so the git ref reads as branch; keep the tab keys `whole-ref` / `directory` unchanged. Update the tab-name assertions in `src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx` (currently 'Whole ref' / 'Directory') to the new Vietnamese labels; do not change any state values, service filters, or `scope === 'directory'` guards. Add matching CSS for `.find-axis`, `.find-axis-label`, and the separator. In `find.css`, make `.find-fields` non-wrapping with `min-width: 0`, set `.find-pattern { flex: 1 1 auto; min-width: 160px }` and `.find-directory { flex: 0 1 220px; min-width: 140px }` so Directory scope cannot squeeze Pattern to 16px.
    BUG-06a: set `.find-results { overflow-x: hidden }`, `.find-rrow > * { min-width: 0 }`, `.find-rcode { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis }`, and give `.find-rfile` a bounded shrinking width with ellipsis. Deliberate choice: result rows ellipsize, never push the modal wider.
    BUG-06b: replace the fixed-height `.find-cline` rule with `display: flex; min-height: var(--find-code-line-height); height: auto`. Add `.find-source { flex: 1 1 auto; min-width: 0; white-space: pre; overflow-x: auto }` so long code lines scroll horizontally instead of wrapping into the next row. Set `.find-lno { flex: 0 0 var(--find-gutter-width); box-sizing: border-box; padding-right: 10px; text-align: right }` to separate gutter from code. No `!important`, no token values inlined in TSX.
    Add a CSS-contract test in `FindInRemoteFiles.test.tsx` that reads `find.css` and asserts the min-width/overflow/min-height/padding rules above exist, so the regressions are caught without a browser. Keep all existing Find tests passing.
  </action>
  <verify>
    <automated>npx vitest run src/workbench/search/find/__tests__/FindInRemoteFiles.test.tsx src/workbench/search/find/__tests__/visualTokens.test.tsx</automated>
    <human-check>At http://localhost:5173/task-management/, open Find from the Remote Git Explorer button. With scope = 'Trong thư mục', measure the Pattern input (must stay at least 160px). Confirm one short `repoPath / branch` label, scope tabs read 'Toàn bộ nhánh' / 'Trong thư mục', long match rows staying inside the modal, and preview source lines on one line with line numbers visually separated.</human-check>
  </verify>
  <done>Seed test asserts data attributes instead of rendered raw text; scope labels changed to Vietnamese with keys intact and tests updated; mode/scope axes have distinct visible labels; CSS contract test passes; measured Pattern width stays usable and preview lines do not overlap.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Remote git path → `getRemoteTree` | Repo-relative folder keys from remote tree data cross into SSH git commands. |
| Layout store seed → Find dialog DOM | Remote target metadata becomes visible UI state. |
| Global keyboard events → workbench actions | Browser keydown events can trigger command dispatch. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vcb-01 | Tampering | `onLoadData` chain walk | mitigate | Every deeper fetch passes the folder key through `getRemoteTree` / `confineRepoPath`; never concatenate paths into shell commands; cap at 24 fetches. |
| T-vcb-02 | Information disclosure | Find seed label | mitigate | Render only `repoPath / branch` text; keep configId UUID in data attributes, never in visible text. |
| T-vcb-03 | Elevation of privilege | `useGlobalKeymap` / `actionRegistry` | mitigate | Remove the global Ctrl/Cmd+Shift+F handler entirely; keep palette action with no advertised shortcut and assert no dispatch remains. |
| T-vcb-04 | Denial of service | Expanded tree / preview CSS | mitigate | Bounded chain expansion; fixed-height preview replaced with min-height plus horizontal scroll so long lines cannot overlap or force unbounded layout. |
| T-vcb-SC | Tampering | npm/pip/cargo installs | accept | No packages installed in this quick task; all changes use already-installed AntD/React/Vitest. |
</threat_model>

<verification>
1. Run only scoped tests: Task 1, Task 2, Task 3 commands above. Never run the full vitest suite (project rule: over an hour).
2. Run `npx tsc --noEmit` once after all three tasks.
3. Confirm no `!important` and no raw diagnostic UUID spans remain in the touched Find markup.
4. Confirm no `Ctrl+Shift+F` string remains in `useGlobalKeymap.ts` or `actionRegistry.ts`.
5. Complete the human browser check for Pattern width, scope labels, seed label, row overflow, and preview line separation.
</verification>

<success_criteria>
- All six reported bugs (BUG-01 through BUG-06) have a code change and a passing scoped test or CSS contract.
- Scope tabs are labelled 'Toàn bộ nhánh' / 'Trong thư mục' with keys 'whole-ref' / 'directory' and tests updated.
- Scoped vitest commands and `npx tsc --noEmit` pass.
- No new dependency, no full-suite run, no band-aid CSS, no global Ctrl+Shift+F binding.
</success_criteria>

<output>
Create `.planning/quick/261120-vcb-fix-46-1-find-dialog-and-remote-explorer/261120-vcb-SUMMARY.md` when done.
</output>
