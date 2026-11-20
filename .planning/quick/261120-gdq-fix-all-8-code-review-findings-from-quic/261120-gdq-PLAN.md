---
phase: quick-261120-gdq
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/toolwindows/RemoteGitExplorer.tsx
  - src/workbench/__tests__/RemoteGitExplorer.test.tsx
  - src/services/gitRemoteTreeService.ts
  - src/services/__tests__/gitRemoteTreeService.test.ts
  - src/utils/aiPopout.ts
  - tests/ai/aiPopout.test.ts
  - src/utils/markdown.ts
  - tests/utils/markdown.test.ts
autonomous: true
requirements:
  - REVEAL-CROSS-BRANCH
  - REVEAL-FOLDER-RESULT
  - REVEAL-NO-DUP-FETCH
  - GLOBAL-SEARCH-CACHE
  - SEARCH-CAP-FILES
  - POPOUT-SCOPED-EMIT
  - POPOUT-HANDLE-RECOVERY
  - MD-CODE-LINE-TIGHTEN
estimate:
  tokens: 63000
  raw_tokens: 42000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "A pending reveal whose target branch differs from the explorer's local branch is consumed: local selectedBranch syncs from store activeRemoteBranch, so the aligned root tree loads and the file node is selected"
    - "Activating a global-search folder result clears the global query, unmounting the results panel so the file tree is visible and the folder reveal can run"
    - "One reveal of a multi-level path performs at most one remote tree lookup per ancestor folder; state updates do not re-enter the reveal effect and re-fetch the same ancestors"
    - "Repeated global-search keystrokes against one config/repo/ref reuse one cached whole-ref ls-tree listing; a new ref fetches again"
    - "Whole-ref search counts only matching files toward SEARCH_RESULT_LIMIT and derives ancestor folders separately, so a broad query still shows up to the full cap of real file matches"
    - "Tauri draft and scope handoff use emitTo scoped to the ai-popout window label, not a global emit; threat model text matches"
    - "Browser-mode popout detection recovers an existing named popout after session restore via window.open('', name), so session-restored popups receive drafts"
    - "Bare language-token normalization no longer treats ordinary prose (a lone colon, parentheses, or keywords such as class/new/import) as code, while real method signatures and generic assignments still render as escaped code blocks"
  artifacts:
    - src/workbench/toolwindows/RemoteGitExplorer.tsx
    - src/services/gitRemoteTreeService.ts
    - src/utils/aiPopout.ts
    - src/utils/markdown.ts
    - src/workbench/__tests__/RemoteGitExplorer.test.tsx
    - src/services/__tests__/gitRemoteTreeService.test.ts
    - tests/ai/aiPopout.test.ts
    - tests/utils/markdown.test.ts
  key_links:
    - "layoutStore.pendingRevealTarget -> RemoteGitExplorer reveal effect -> store activeRemoteBranch -> local selectedBranch sync -> getRemoteTree(ancestors) -> Tree selectedKeys/expandedKeys"
    - "RemoteGitExplorer global search -> searchRemoteTree -> cached whole-ref ls-tree listing -> SEARCH_RESULT_LIMIT files + separately derived ancestor folders -> result list -> activateGlobalResult clears query -> pendingRevealTarget"
    - "InlineAISelectionBar / selection handoff -> aiPopout.sendTextToAiPopout -> emitTo('ai-popout', AI_DRAFT_EVENT, payload) or recovered browser handle postMessage -> AIPopoutView listener -> composer"
    - "ChatMessageBubble -> renderSafeMarkdown -> tightened looksLikeCodeLine -> bare-language code-block normalization -> escapeHtml"
---

<objective>
Close all 8 code-review findings from quick 261120-f8v in three module-grouped, self-contained tasks: (1) four reveal/search lifecycle bugs in `src/workbench/toolwindows/RemoteGitExplorer.tsx`; (2) search cap fairness plus whole-ref tree caching in `src/services/gitRemoteTreeService.ts`; (3) scoped Tauri handoff plus browser popout recovery in `src/utils/aiPopout.ts` and a tightened code-line heuristic in `src/utils/markdown.ts`. Minimal diffs, focused regression tests, no new dependencies, no weakening of existing sanitization/path-confinement.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
Repo-root-relative paths; every command assumes cwd at checkout root. Source facts verified this session (read once; do not re-read unchanged ranges):

- `src/workbench/toolwindows/RemoteGitExplorer.tsx` (1083 lines): local `selectedBranch` initialized from `activeRemoteBranch` at line 167; store->local sync exists only for config/repoPath via `lastAppliedTargetRef` (lines 216-223). Reveal effect (634-723) guards alignment on `(target.branch && target.branch !== selectedBranch)` at 649, then calls `setActiveRemoteTarget(...)` and returns — but local `selectedBranch` never re-syncs, so the guard never clears. `activateGlobalResult` folder branch (589-605) sets `pendingRevealTarget` but leaves `globalQuery` non-empty; render at line 890 swaps Tree out for the results panel while `globalQuery.trim()`. Reveal loop calls `setTreeData(currentTree)` per ancestor (695) while `treeData` is an effect dependency (717) -> re-entry; a `cancelled` flag + cleanup exist but do not stop re-entry. Debounced global search effect (547-582) calls `searchRemoteTree` per query change.
- `src/services/gitRemoteTreeService.ts`: `searchRemoteTree` (189-247) runs `runGitCommand(['ls-tree','-r','-l','-z','--end-of-options', escapeShellArg(ref)])` on every call; `add()` (219-225) counts folders toward `SEARCH_RESULT_LIMIT` (100); folders derived from matching-file ancestors at 237-242. Query is filtered JS-side and never reaches git; all paths pass `confineRepoPath`. Preserve both invariants.
- `src/utils/aiPopout.ts`: `sendTextToAiPopout` Tauri branch uses global `emit(AI_DRAFT_EVENT, payload)` (line ~117); `openAiPopout` existing-scope branch uses global `emit(AI_SCOPE_EVENT, scope)` (~53). Installed `@tauri-apps/api` is `^2.2.0` with `emitTo<T>(target: EventTarget|string, event: string, payload?: T)` available. Browser mode tracks module-level `browserPopoutHandle` from `window.open(url, 'task-planner-ai-popout', ...)`; `isAiPopoutOpen` (91-102) and `sendTextToAiPopout` (125) treat a null/closed handle as no popout — no recovery after reload.
- `src/views/AIPopoutView.tsx` already listens with `listen<AIDraftPayload>(AI_DRAFT_EVENT, ...)` and validates `event.origin` + `data.type` for browser postMessage; no change needed there.
- `src/utils/markdown.ts`: `looksLikeCodeLine` (124-130) returns `/[;{}()=<>:]/.test(line) || CODE_KEYWORDS.test(line)` — a lone ':' , '()' or a keyword in prose triggers bare-language code-block normalization (bareLang branch at 326-343). `escapeHtml` and the `BARE_CODE_LANGUAGES` allowlist are the sanitization boundary; do not touch them.
- Tests: `src/workbench/__tests__/RemoteGitExplorer.test.tsx` (497 lines) uses `vi.spyOn` for ssh/git services, `useLayoutStore.getState().resetLayout()` in beforeEach, and `getRemoteTree` mock keyed on `dirPath` (empty -> root nodes, 'src' -> index.ts). `src/services/__tests__/gitRemoteTreeService.test.ts` has a `describe('searchRemoteTree')` block with `vi.restoreAllMocks()` in beforeEach. `tests/ai/aiPopout.test.ts` uses `vi.hoisted` mocks for `@tauri-apps/api/webviewWindow` and `@tauri-apps/api/event`. `tests/utils/markdown.test.ts` lines 150-184 own the bare-language-token tests.
- No new packages. All three tasks touch disjoint files -> Wave 1, safe to parallelize.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix reveal branch sync, folder-result reveal, and duplicate tree fetches in RemoteGitExplorer</name>
  <files>src/workbench/toolwindows/RemoteGitExplorer.tsx, src/workbench/__tests__/RemoteGitExplorer.test.tsx</files>
  <action>
    Work only in `src/workbench/toolwindows/RemoteGitExplorer.tsx` plus its test file. Four sub-fixes (review findings 1, 2, 4, 8-symptom stays in service task 2):

    (F1, REVEAL-CROSS-BRANCH) Add a store->local branch sync mirroring the existing `lastAppliedTargetRef` effect: introduce `lastAppliedBranchRef` and an effect watching `activeRemoteBranch` that, when the store branch differs from the ref's last applied value, sets local `selectedBranch` to the store value (and updates the ref). Skip when equal so local `handleBranchChange` / `loadBranches` writes do not loop. In the reveal effect's "different target" alignment branch (~653), also call `setSelectedBranch(target.branch || selectedBranch)` when a branch is supplied, so the next render's alignment guard passes instead of waiting on a store echo that never reached local state. Keep the existing unknown-config discard path unchanged.

    (F2, REVEAL-FOLDER-RESULT) In `activateGlobalResult` folder branch (~594), add `setGlobalQuery('')` before setting the pending reveal target. This unmounts `global-search-results` so the AntD Tree renders. Keep the existing `setSearchInput('')`, `setGrepHits([])`, `hasSearchedRef.current = false`, `setExpandedKeys(...)`, and `setPendingRevealTarget(...)` calls intact; do not open a file tab for folders.

    (F4, REVEAL-NO-DUP-FETCH) Stop the reveal effect re-entering itself: add an in-flight ref keyed by target identity (configId + repoPath + branch + filePath). On entry, if the same key is already in flight, return early; otherwise mark it. Build the merged tree into a local `currentTree` variable across the ancestor loop and call `setTreeData(currentTree)` ONCE after the loop (not per ancestor), before setting expanded/selected keys. Clear the ref in `finally` and in the effect cleanup alongside the existing `cancelled` flag. Stale/late async results must still be dropped by the `cancelled` guard. Do not remove `treeData` from the dependency array (other logic relies on it); the ref guard is what prevents re-entry.

    Tests in `src/workbench/__tests__/RemoteGitExplorer.test.tsx` (reuse existing harness; add `it` blocks, do not rewrite existing ones):
    - Cross-branch reveal: preset store target with branch 'main', mount, then inside `act` call `setActiveRemoteTarget('ssh-1', '/home/dev/my-repo', 'feat/test')` and set a pending target with branch 'feat/test', filePath 'src/index.ts'; assert `getRemoteTree` is called with 'feat/test' for ancestor 'src' and the pending target becomes null.
    - Folder result clears query: reuse the global-search setup, activate the folder hit, assert `queryByTestId('global-search-results')` is null and the tree container is visible; pending target still carries the folder path.
    - No duplicate ancestor fetches: mock `getRemoteTree` to return a nested child for 'src' and 'src/nested'; set a pending target for 'src/nested/deep.ts'; assert the call count for dirPath 'src' and for 'src/nested' is exactly one each after settling.

    Verify with the focused test file. Do not change service/markdown/popout files.
  </action>
  <verify>
    <automated>npm test -- src/workbench/__tests__/RemoteGitExplorer.test.tsx</automated>
  </verify>
  <done>
    Cross-branch pending reveals are consumed with the aligned branch's tree loaded and node selected; activating a folder result hides the results panel and shows the tree; a single multi-level reveal issues one ancestor fetch per path. All existing RemoteGitExplorer tests still pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Cap search by matching files and cache whole-ref tree listing</name>
  <files>src/services/gitRemoteTreeService.ts, src/services/__tests__/gitRemoteTreeService.test.ts</files>
  <action>
    Work only in `src/services/gitRemoteTreeService.ts` and its test file. Two sub-fixes (findings 5, 8):

    (F5, SEARCH-CAP-FILES) In `searchRemoteTree`, stop ancestor folders consuming `SEARCH_RESULT_LIMIT`. Collect matching file hits first and stop adding FILES once the cap is reached; collect ancestor folders into a separate set/array that is not counted against the file cap, deduplicated by the existing `seen` set and still passed through `confineRepoPath`. Append folders to the returned results after (or alongside) the capped files. Keep `RemoteTreeSearchResult` shape, `matchStart`/`matchLength` semantics, and the JS-only query filtering unchanged. Query text must never enter the git command; keep the literal args + `escapeShellArg(ref)` + `--end-of-options` exactly as-is.

    (F8, GLOBAL-SEARCH-CACHE) Cache the whole-ref listing inside `searchRemoteTree` so repeated queries against the same target reuse one `ls-tree -r` result. Add a module-level `Map<string, string>` keyed by `${config.id}|${repoPath}|${ref}` storing the raw stdout; on call, reuse cached stdout when the key exists, otherwise run `runGitCommand` and store stdout on success only. On git failure, return [] as today and do NOT cache the failure. Export a small `clearSearchTreeCache()` reset helper for tests and call it in the `describe('searchRemoteTree')` beforeEach so existing `toHaveBeenCalledTimes(1)` assertions stay valid. Cache key uses only non-secret identifiers (never the query, token, or secret). Content at a ref may go stale until the ref string changes or the app reloads — that is the intended tradeoff; do not add a TTL or new dependency.

    Tests in `src/services/__tests__/gitRemoteTreeService.test.ts`:
    - Cap fairness: build >`SEARCH_RESULT_LIMIT` matching files each under a distinct ancestor folder with one query matching all file names; assert the number of `type:'file'` results equals `SEARCH_RESULT_LIMIT` (before the fix folders starved this), ancestor folders still present, all results confined, and git command still called with the same literal args.
    - Cache reuse: call `searchRemoteTree` twice with different queries but same config/repo/ref; assert `runGitCommand` called once total and both result sets filtered from the one listing; assert a different ref triggers a second call. Use `clearSearchTreeCache()` in beforeEach.

    Verify with the focused service test. Do not change component/popout/markdown files.
  </action>
  <verify>
    <automated>npm test -- src/services/__tests__/gitRemoteTreeService.test.ts</automated>
  </verify>
  <done>
    Broad searches return up to the full file cap of real file matches with folders derived separately; repeated queries against one config/repo/ref issue one whole-ref git call and a new ref refetches. Existing confinement and command-shape tests still pass.
  </done>
</task>

<task type="auto">
  <name>Task 3: Scope Tauri handoff, recover browser popout, tighten code-line heuristic</name>
  <files>src/utils/aiPopout.ts, tests/ai/aiPopout.test.ts, src/utils/markdown.ts, tests/utils/markdown.test.ts</files>
  <action>
    Two independent utility fixes (findings 3, 7, 6). Keep each file's public exports additive/compatible.

    aiPopout.ts (F3 POPOUT-SCOPED-EMIT, F7 POPOUT-HANDLE-RECOVERY):
    - In `sendTextToAiPopout`'s Tauri branch, replace the global `emit(AI_DRAFT_EVENT, payload)` with `emitTo(AI_POPOUT_LABEL, AI_DRAFT_EVENT, payload)` (import `emitTo` alongside `emit` from `@tauri-apps/api/event`). In `openAiPopout`'s existing-window scope branch, likewise scope `AI_SCOPE_EVENT` via `emitTo(AI_POPOUT_LABEL, AI_SCOPE_EVENT, scope)`. Keep the `setFocus()` calls and graceful false/no-throw fallbacks. Update the nearby comment so it describes scoped delivery to the named window (this is the "align threat model text" item) — no global broadcast remains on the draft/scope paths.
    - Browser recovery: add a session marker set in the browser branch of `openAiPopout` when `window.open` returns a live handle, and a `recoverBrowserPopout()` helper. `isAiPopoutOpen` and `sendTextToAiPopout` (browser branches) must use the helper instead of only the module handle. Helper logic: return the tracked handle when live; otherwise, only when the session marker is present, try `window.open('', 'task-planner-ai-popout')`; adopt it if it lives and its location hash starts with `#ai-popout`, else close any stray window, clear the marker, and return null. This lets a session-restored named popup receive drafts while avoiding a blank window when none exists. Do not change `buildAiPopoutUrl`, Tauri window options, or `AIPopoutView.tsx`.

    markdown.ts (F6 MD-CODE-LINE-TIGHTEN):
    - Tighten `looksLikeCodeLine` so a line is code only with a strong structural marker (statement terminator `;`, braces, assignment `=`/`=>`/`->`, or an identifier immediately followed by `(` as in a call/signature). A lone `:`, a spaced `(...)`, or an unaccompanied `CODE_KEYWORDS` word in prose must NOT qualify. Keep the early guards (blank, fence/heading/quote/hr, list/table, table delimiter) and keep `CODE_KEYWORDS` as at most a secondary signal gated on a structural marker — never sufficient alone. Do not touch `escapeHtml`, `BARE_CODE_LANGUAGES`, `renderCodeBlockHtml`, or the bareLang branch structure; the change is confined to the heuristic return.

    Tests:
    - `tests/ai/aiPopout.test.ts`: add `emitTo: vi.fn()` to the hoisted event mock; update the Tauri draft assertion to `emitTo('ai-popout', AI_DRAFT_EVENT, {...})` (import `AI_POPOUT_LABEL`); add a case that `openAiPopout(scope)` with an existing popout scopes the scope event via emitTo. For recovery: simulate a fresh module state (tracked handle cleared by opening with a null handle), set the session marker, mock `window.open('', 'task-planner-ai-popout')` to return a live handle whose hash is `#ai-popout`, then assert `isAiPopoutOpen()` is true and `sendTextToAiPopout` postMessages to that recovered handle. Clear session marker in the existing afterEach.
    - `tests/utils/markdown.test.ts` (in the existing bare-language describe): add false-positive regressions — a bare language line followed by prose such as `Note: this class is new and worth an import.` and `This function (see docs) returns a value.` must render as paragraph text (no `code-block-wrapper`); keep all existing true-positive cases passing (method signature with `();`, `List<T> values = new ArrayList<>();`, fenced block unchanged). Optionally add one compact true-positive (`python` + `def foo(x):`) to guard against over-tightening.

    Verify with both focused test files. Do not change RemoteGitExplorer or gitRemoteTreeService.
  </action>
  <verify>
    <automated>npm test -- tests/ai/aiPopout.test.ts tests/utils/markdown.test.ts</automated>
  </verify>
  <done>
    Tauri draft and scope events are delivered only to the ai-popout window via emitTo; browser mode recovers a session-restored named popup and delivers drafts; prose containing a colon, parentheses, or code-like keywords no longer renders as a code block while genuine code still does. XSS escaping and all existing tests remain intact.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Pending reveal target -> Explorer tree lookup | Repo-relative path and branch from an already-open remote tab / global search result reach the reveal effect and `getRemoteTree` |
| Search query -> whole-ref git listing + result cap | User-entered global-search text is filtered client-side over a cached `ls-tree -r` listing; cap change must not bypass path confinement |
| Main window -> floating AI popout | Selection text/scope cross a window boundary via Tauri `emitTo` or browser `postMessage` into the popout composer |
| Model text -> chat HTML | LLM-generated Markdown (possibly malformed) is normalized and becomes innerHTML via `renderSafeMarkdown` |

## STRIDE Threat Register

Threat IDs continue after quick 261120-f8v's T-quick-01..04. Numeric IDs T-quick-05..08; `T-quick-SC` reserved.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-05 | Tampering | src/workbench/toolwindows/RemoteGitExplorer.tsx reveal alignment + folder activation | medium | mitigate | Reveal paths/branches still flow only into the confined `getRemoteTree` service; no shell interpolation. Alignment sync uses store values, unknown configs are still discarded. Clearing globalQuery only changes which pane renders, never a target or path. |
| T-quick-06 | Tampering | src/services/gitRemoteTreeService.ts cache + file-capped search | medium | mitigate | Cache key holds only config.id/repoPath/ref (no query, token, or secret); query stays JS-side data and the git command remains literals + `escapeShellArg(ref)` + `--end-of-options`. Every emitted path still passes `confineRepoPath`; folder derivation cannot introduce unconfined paths. |
| T-quick-07 | Information disclosure | src/utils/aiPopout.ts scoped handoff + browser recovery | medium | mitigate | Tauri uses `emitTo('ai-popout', ...)` so scope/draft payloads reach only the named webview. Browser `postMessage` stays same-origin and the receiver validates `event.origin` + namespaced marker. Recovery verifies the `#ai-popout` hash and closes stray windows; no token/passphrase is ever in the payload. |
| T-quick-08 | Tampering | src/utils/markdown.ts bare-fence heuristic | medium | mitigate | The heuristic only decides presentation; language labels still come from the curated allowlist and all code lines still pass `escapeHtml` before innerHTML. Tightening reduces false positives without relaxing sanitization. |
| T-quick-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new packages. `emitTo` already ships in the installed `@tauri-apps/api` (^2.2.0); existing AntD/React/Dexie APIs reused unchanged. |

Security enforcement: ASVS level 1, blocking threshold high. No unmitigated high or critical threat remains.
</threat_model>

<verification>
- `npm test -- src/workbench/__tests__/RemoteGitExplorer.test.tsx src/services/__tests__/gitRemoteTreeService.test.ts tests/ai/aiPopout.test.ts tests/utils/markdown.test.ts` — all focused tests pass.
- `npm run build` — TypeScript compile and Vite build succeed with no new errors.
- Full suite intentionally not run (project rule: exceeds one hour). No PWA/GitHub Pages validation (out of scope per root CLAUDE.md).
</verification>

<success_criteria>
- All 8 findings closed with minimal, module-local diffs and focused regression tests; no new dependencies.
- Cross-branch reveals consume, folder-result reveals show the tree, and multi-level reveals fetch each ancestor once.
- Whole-ref search caches by config/repo/ref and caps real file matches independently of folder ancestors.
- Tauri handoff is window-scoped and browser handoff recovers session-restored popups; Markdown prose no longer misrenders as code.
- Path confinement, shell escaping, XSS escaping, and all pre-existing tests remain intact.
</success_criteria>

<output>
Create `.planning/quick/261120-gdq-fix-all-8-code-review-findings-from-quic/261120-gdq-SUMMARY.md` when done
</output>
