---
phase: 261127-vya
plan: 01
type: execute
subsystem: ssh-remote-explorer
tags: [ssh, git, remote-explorer, untracked, viewer, search]
wave: 1
depends_on: []
files_modified:
  - src/services/gitRemoteService.ts
  - src/services/gitRemoteTreeService.ts
  - src/workbench/toolwindows/RemoteGitExplorer.tsx
  - src/services/__tests__/gitRemoteService.test.ts
  - src/services/__tests__/gitRemoteTreeService.test.ts
  - src/workbench/__tests__/RemoteGitExplorer.test.tsx
  - .planning/STATE.md
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Untracked file nằm sâu trong thư mục (kể cả folder đã track) vẫn hiện, expand, mở tab được; `?? newdir/` không bị gộp mất"
    - "Reveal một file untracked / staged-new đi qua ancestor chưa có trong ref vẫn materialize chain và select đúng node"
    - "Viewer hiện nội dung working copy hiện tại cho file staged (`A `/`AM`) và modified (`M `/`MM`), không phải blob ref stale"
    - "Global search tìm thấy cả file staged/untracked ngoài nội dung ref commit"
    - "Giữ nguyên escapeShellArg, confinement symlink (realpath guard), WR-01 guard chống dùng working copy của branch khác"
  artifacts:
    - path: src/services/gitRemoteService.ts
      provides: "checkDirtyStatus dùng --untracked-files=all; raw uncommitted rows dùng chung cho status/search"
      exports: ["checkDirtyStatus", "getUncommittedFiles"]
    - path: src/services/gitRemoteTreeService.ts
      provides: "merge path dirty vào ref folder (có con), viewer working-copy-first, search gộp index/untracked"
      exports: ["getRemoteFileContent", "searchRemoteTree", "mergeUncommittedFilesIntoTree", "getUncommittedFiles"]
    - path: src/workbench/toolwindows/RemoteGitExplorer.tsx
      provides: "reveal fetch working tree cho ancestor không có trong ref"
      exports: []
    - path: .planning/STATE.md
      provides: "1 row quick task 261127-vya, 1 dòng last activity, 1 decision, 1 performance row, timestamp"
      exports: []
  key_links:
    - from: "gitRemoteService.ts:87 (checkDirtyStatus)"
      to: "gitRemoteTreeService.searchRemoteTree"
      via: "getUncommittedFiles trả row thô path/indexStatus/workingTreeStatus"
      pattern: "getUncommittedFiles|--untracked-files=all"
    - from: "RemoteGitExplorer.tsx:705 (reveal getRemoteTree)"
      to: "gitRemoteTreeService.ts mergeUncommittedFilesIntoTree"
      via: "ls-tree ref:ancestor fail -> merge chain từ uncommittedFiles có sẵn trong state"
      pattern: "mergeUncommittedFilesIntoTree|uncommittedFiles"
    - from: "RemoteFileViewer.tsx:82 (getRemoteFileContent)"
      to: "gitRemoteTreeService.ts:332"
      via: "ref==HEAD thì đọc working copy; ref khác vẫn trả blob (WR-01)"
      pattern: "getRemoteWorkingFileContent|rev-parse"
---

<objective>
Fix ba gap còn lại của SSH Remote Explorer sau debug `ssh-explorer-parent-child-expand.md` (đã resolved): (a) file untracked sâu và untracked nằm trong folder đã track không hiện/expand/mở/reveal được, vì `git status --porcelain=v1 -z` gộp `?? newdir/` và merge/ref-fetch không materialize con cho folder có trong ref; (b) viewer trả blob ref stale cho file staged/modified thay vì working copy; (c) global search chỉ đọc `ls-tree -r <ref>` nên sót staged/untracked. Giữ nguyên decode shell (`escapeShellArg`), confinement symlink (`workingCopyCatSnippet` + `realpath`), và WR-01 guard.

Purpose: Explorer phải phản ánh đúng working tree đang làm việc, không chỉ committed ref — nếu không, người dùng không thấy file mới, mở file cũ đã sửa, và tìm không ra nội dung mới tạo.

Output: 4 file source + 3 file test + STATE. Không thêm dependency, không live SSH, KHÔNG commit (sếp chưa muốn commit). Context hiện tại: `remoteTreeCompact.ts` + `RemoteGitExplorer.tsx` + `RemoteGitExplorer.test.tsx` đang modified sẵn từ debug trước — GIỮ NGUYÊN các thay đổi đó, không revert, không stage.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/debug/ssh-explorer-parent-child-expand.md

Facts đã xác nhận bởi audit, KHÔNG research lại:
- `gitRemoteService.ts:78-106` `checkDirtyStatus`: `git status --porcelain=v1 -z` (`:87`) gộp `?? newdir/` thành một entry; parser đã xử lý rename/copy (`:96-99`) và giữ path verbatim qua `-z` (WR-03) — giữ nguyên parser.
- `gitRemoteTreeService.ts:58-138` `mergeUncommittedFilesIntoTree`: path trùng ref folder chỉ gán badge rồi `continue` (`:91-102`), không tạo con; path hoàn toàn mới materialize chain (`:104-132`).
- `gitRemoteTreeService.ts:332-383` `getRemoteFileContent`: `cat-file -p <ref>:<path>` trước (`:345`), fallback working copy chỉ cho untracked hoặc `A `/`AM` (`:349-381`); `M `/`MM` trả blob ref = stale. `isNotInRef` (`:185-191`) guard chặn ref lạ.
- `gitRemoteTreeService.ts:389-406` `getRemoteWorkingFileContent`: cat working copy qua `workingCopyCatSnippet` (`:419-428`), realpath canonicalize 2 đầu + exit 77 cho symlink escape — KHÔNG đổi snippet.
- `gitRemoteTreeService.ts:510-522` comment owner decision 2026-11-17: AI `readRemoteFilePage` đọc working tree; viewer ref-first. Quyết định mới của sếp: viewer cũng working tree — cập nhật comment này. `readRemoteFilePage` (`:523-546`) giữ nguyên, chỉ đổi comment/`getRemoteFileContent`.
- `gitRemoteTreeService.ts:218-287` `searchRemoteTree`: cache `searchTreeCache` key `${config.id}|${repoPath}|${ref}` (`:231`), filter client-side, `SEARCH_RESULT_LIMIT=100` (`:203`), `foldForSearch`/`searchIncludes` (`:226`,`:273`), `confineRepoPath` (`:255`,`:261`). Giữ nguyên shape `RemoteTreeSearchResult` và limit.
- `RemoteGitExplorer.tsx:687-735` reveal: loop ancestor gọi `getRemoteTree(ref, ancestor)` (`:705`) → `ref:newdir` fail cho untracked/new dir; `findRawTreeNode` guard ở `:704`; `injectRawChildren` ở `:139-151`.
- `RemoteGitExplorer.tsx:467-515` `onLoadData`: badge KHÔNG phải descent boundary (fix debug trước, `:490-498`) — giữ nguyên.
- Consumer khác của `getRemoteFileContent`: `src/workbench/search/find/FindInRemoteFiles.tsx:221` (preview) — đổi nội dung đọc, KHÔNG đổi signature; `RemoteFileViewer.tsx:82` giữ nguyên call site.
- Test files: `src/services/__tests__/gitRemoteService.test.ts` (checkDirtyStatus block `:112-166`), `src/services/__tests__/gitRemoteTreeService.test.ts` (search `:104-200`, real-shell round 3 `:202-431`), `src/workbench/__tests__/RemoteGitExplorer.test.tsx` (test reveal `:820+`), `src/workbench/__tests__/RemoteFileViewer.test.tsx` (`:35-267`).
- Quy ước: đọc 1 lần rồi Edit ngay, không re-read loop; identifier/đường dẫn/lệnh giữ nguyên; discuss tiếng Việt, xưng "sếp"; scoped vitest + `npx tsc --noEmit`, KHÔNG `npm test` (>1 giờ); KHÔNG live SSH; KHÔNG commit/stage.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Enum mọi untracked file + materialize con cho folder đã track</name>
  <files>src/services/gitRemoteService.ts, src/services/gitRemoteTreeService.ts, src/services/__tests__/gitRemoteService.test.ts, src/services/__tests__/gitRemoteTreeService.test.ts</files>
  <behavior>
    - Test 1 (RED): `checkDirtyStatus` trên porcelain `?? newdir/` phải trả `{ path: 'newdir/deep.ts', indexStatus: '?', workingTreeStatus: '?' }`; assertion cũ trong `gitRemoteService.test.ts:125-149` về lệnh `status --porcelain=v1 -z` đổi sang kỳ vọng `--untracked-files=all`. Implementation cũ fail.
    - Test 2 (RED): real-shell fixture trong `gitRemoteTreeService.test.ts`: commit `tracked/` chứa `old.txt`, rồi tạo `tracked/new/untracked.ts` chưa add. `checkDirtyStatus` + `getRemoteTree(ref, 'tracked')` rồi `mergeUncommittedFilesIntoTree(raw, dirty, 'tracked')` phải có folder `new` (`isLeaf=false`, `children` chứa `untracked.ts` với `gitStatus='?'`). Implementation cũ chỉ badge folder `tracked` rồi bỏ qua → fail.
    - Test 3 (RED): `?? newdir/` sâu 2 cấp (không file nào được add) qua `checkDirtyStatus` → `uncommittedFiles` chứa từng file, không còn token `newdir/`; `mergeUncommittedFilesIntoTree([], rows)` project đủ chain `newdir/deep/leaf.ts`.
    - Test 4 (non-regression): test `materializes the full folder chain for a staged-new nested file` (`:66-79`), rename/spaces (`gitRemoteService.test.ts:151-165`), `fsmonitor` test (`:392-406`) vẫn pass.
  </behavior>
  <action>
    Bước 1 — RED: thêm 3 test ở trên vào 2 file test. Chạy lệnh verify_task1 (xem `<verify>`), kỳ vọng fail đúng assertion/new command, không phải compile error hay zero-test discovery.

    Bước 2 — GREEN dịch vụ: trong `gitRemoteService.ts:87`, đổi args thành `['status', '--porcelain=v1', '-z', '--untracked-files=all']` (giữ `core.fsmonitor=false` từ `runGitCommand`). Thêm `export async function getUncommittedFiles(config, repoPath, secret?, callId?)`: gọi `checkDirtyStatus` rồi trả `dirtyStatus?.uncommittedFiles ?? []` — một nguồn row thô cho cả Explorer và search. Không đổi parser rename/copy, không đổi `escapeShellArg`.

    Bước 3 — GREEN merge: trong `gitRemoteTreeService.ts:91-102`, khi `existingNode` tồn tại và `parts.length > 1`, KHÔNG `continue` vội: nếu `existingNode.children` chưa có `parts[1]`, tạo chain còn lại bằng cùng logic `keyAt/siblings` như nhánh new-path (`:106-132`) nhưng bắt đầu từ `siblings = existingNode.children ?? []` và `segments = parts.slice(1)`; gán `existingNode.children` nếu trước đó undefined; giữ badge `existingNode.gitStatus = 'M'` như cũ. Dùng helper nội bộ `materializeChain(siblings, segments, status, basePath)` tách từ code cũ để cả 2 nhánh dùng chung — KHÔNG đổi hành vi nhánh new-path (`config/app/feature.ts` test vẫn xanh). Cập nhật test command assertion cho `--untracked-files=all`.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/__tests__/gitRemoteService.test.ts src/services/__tests__/gitRemoteTreeService.test.ts --bail=1</automated>
  </verify>
  <done>Task 1 xanh: mọi untracked file sâu được enum, folder đã track nhận con thật, lệnh status có `--untracked-files=all`, test/regression cũ không đổi hành vi.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Viewer đọc working copy cho staged/modified, giữ WR-01 + symlink guard</name>
  <files>src/services/gitRemoteTreeService.ts, src/services/__tests__/gitRemoteTreeService.test.ts</files>
  <behavior>
    - Test 1 (RED): real-shell fixture: commit `tracked.txt` = `committed`, rồi ghi working copy `working-edit`, `git add`, rồi ghi `working-edit-2` (status `AM`). `getRemoteFileContent(config, repo, <oldRef>, 'tracked.txt')` phải trả `working-edit-2` (hiện tại trả `committed`).
    - Test 2 (RED): commit `tracked.txt`, rồi modify working copy KHÔNG add (status ` M`). `getRemoteFileContent(config, repo, HEAD, 'tracked.txt')` phải trả `working-edit` (hiện tại trả `committed`). Thêm 1 case staged `M ` (index modified, working sạch) → cũng trả working copy.
    - Test 3 (non-regression, WR-01): test hiện có `does not substitute working content for a path present at HEAD but absent from an old ref` (`:360-369`) vẫn reject. Test symlink escape (`:262-283`), literal glob (`:326-349`), fsmonitor (`:392-406`) vẫn pass. `FindInRemoteFiles` preview đổi nội dung đọc nhưng không đổi API.
  </behavior>
  <action>
    Bước 1 — RED: thêm 2 test real-shell vào block `describe('round 3...')` ngay sau test AM cũ (`:351-358`), dùng lại `shell()`/`git()` helper có sẵn. Chạy verify_task2, kỳ vọng 2 test mới fail vì trả blob ref.

    Bước 2 — GREEN, một chiến lược duy nhất: giữ `cat-file -p <ref>:<cleanPath>` làm bước đầu (giữ WR-01 cho ref lạ + literal lookup chống glob), nhưng sau khi nó THÀNH CÔNG thì gọi thêm `getRemoteWorkingFileContent` và trả working copy. Trước khi gọi, chặn WR-01 bằng guard: resolve `ref` và `HEAD` qua `runGitCommand` với `['rev-parse', '--verify', '--end-of-options', escapeShellArg(ref)]` và `['rev-parse', '--verify', '--end-of-options', 'HEAD']`; chỉ đọc working copy khi hai sha trim BẰNG NHAU. Nếu ref ≠ HEAD (old-ref test `:360-369`) hoặc bất kỳ bước guard/realpath/cat-working nào throw, trả nguyên blob ref (riêng `PathOutsideRepoError` từ symlink escape vẫn propagate, không nuôi). Nhánh `cat-file` fail (untracked / staged-new) GIỮ NGUYÊN probe `ls-files` + WR-01 hiện tại (`:349-381`) — không đổi. GIỮ NGUYÊN `workingCopyCatSnippet` (realpath 2 đầu, exit 77), `escapeShellArg`, `confineRepoPath`, `isNotInRef`.

    Bước 3 — cập nhật comment tại `:324-331` và `:510-522` cho đúng decision mới: viewer ưu tiên working copy khi ref == HEAD; AI `readRemoteFilePage` vẫn working tree như cũ. Không đổi signature, không đổi call site `RemoteFileViewer.tsx:82` / `FindInRemoteFiles.tsx:221`.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/__tests__/gitRemoteTreeService.test.ts --bail=1</automated>
  </verify>
  <done>Viewer trả nội dung working copy cho `M `/` M`/`MM`/`A `/`AM`/untracked; ref khác HEAD vẫn trả blob ref; symlink escape, literal glob, fsmonitor tests xanh.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Reveal untracked ancestor + global search gồm staged/untracked</name>
  <files>src/services/gitRemoteTreeService.ts, src/services/__tests__/gitRemoteTreeService.test.ts, src/workbench/toolwindows/RemoteGitExplorer.tsx, src/workbench/__tests__/RemoteGitExplorer.test.tsx, .planning/STATE.md</files>
  <behavior>
    - Test 1 (RED service): `searchRemoteTree(config, repo, 'main', 'UNTRACKED_NEEDLE')` trên fixture committed ref + file `newdir/deep/UNTRACKED_NEEDLE.ts` chưa add phải trả result `{ path: 'newdir/deep/UNTRACKED_NEEDLE.ts', type: 'file' }`, kèm folder `newdir/deep`. Cache key vẫn `${config.id}|${repoPath}|${ref}` — query khác cùng ref vẫn dùng 1 ls-tree listing.
    - Test 2 (RED UI): trong `RemoteGitExplorer.test.tsx`, fixture root `getRemoteTree('')` có folder `tracked`; `checkDirtyStatus` trả `tracked/new/untracked.ts` (status `??`); pendingRevealTarget trỏ file đó. Trước fix: `getRemoteTree('tracked/new')` reject → không select. Sau fix: chain `tracked/new` materialize từ `uncommittedFiles`, node `untracked.ts` được select (stable compact key) và expand hiện file. Mock `getRemoteTree` reject cho `ref:tracked/new` để mô phỏng `ls-tree` fail.
    - Test 3 (non-regression): test search/cap/cache cũ (`:117-199`) vẫn pass; test "expands both compact parent.child branches even when one child is dirty" đang modified sẵn vẫn pass; tsc sạch.
  </behavior>
  <action>
    Bước 1 — RED: thêm 2 test vào 2 file test. Chạy verify_task3, kỳ vọng fail đúng chỗ (search trả [], reveal throw → error, không select).

    Bước 2 — GREEN search: trong `searchRemoteTree` (`:218-287`), sau khi lấy `stdout` của ls-tree, gọi thêm `const dirty = await getUncommittedFiles(config, repoPath, secret, callId)` từ `gitRemoteService.ts` (import mới). Với mỗi row, `confineRepoPath(row.path, ...)`, bỏ qua status bắt đầu 'D'; tạo result file `{path, name, size: undefined, ...nameMatch(name)}` và ancestor folders giống loop ls-tree hiện tại (dùng chung `addFile`/`addFolder`, dedup bằng `seen`). Không đưa query vào git; cache vẫn chỉ lưu stdout ls-tree (dirty rows fetch mỗi query để fresh — ghi rõ trong comment). Search failure của `getUncommittedFiles` degrade thành bỏ qua dirty rows (giữ triết lý "git failure → degraded, không crash UI").

    Bước 3 — GREEN reveal: trong `RemoteGitExplorer.tsx:698-715`, bọc `getRemoteTree(...)` cho ancestor bằng try/catch: nếu error message khớp `path '<ancestor>' does not exist in '<ref>'` (export `isNotInRef` từ `gitRemoteTreeService.ts` để dùng lại, thay vì duplicate logic) thì lấy chain từ `uncommittedFiles` đã có trong state (`:350-352`): `const relevant = uncommittedFiles.filter(row => confineRepoPath? KHÔNG — dùng row.path.startsWith(ancestor + '/') và confineRepoPath(row.path) trước khi tạo node)`, rồi `mergeUncommittedFilesIntoTree([], relevant, ancestor)` → `currentTree = injectRawChildren(currentTree, ancestor, merged)`. Giữ nguyên `findRawTreeNode` guard ở `:704`; KHÔNG gọi git thêm, KHÔNG helper shell mới. Cập nhật comment `:646-648`.

    Bước 4 — STATE: thêm 1 row `261127-vya` vào Quick Tasks Completed, 1 dòng last activity, 1 decision (viewer working-copy-first khi ref==HEAD + WR-01 guard), 1 performance row, frontmatter timestamp. KHÔNG tạo SUMMARY, KHÔNG stage, KHÔNG commit.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/__tests__/gitRemoteTreeService.test.ts src/workbench/__tests__/RemoteGitExplorer.test.tsx src/workbench/__tests__/RemoteFileViewer.test.tsx src/utils/__tests__/remoteTreeCompact.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Task 3 xanh: search trả file staged/untracked, reveal untracked ancestor select đúng node, cache/search cũ + compact test + viewer test giữ nguyên; tsc sạch; STATE cập nhật; không commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote git status/ls-tree → Explorer tree | Output git qua SSH là untrusted; path đi qua `confineRepoPath`, query KHÔNG bao giờ thành argv |
| working copy cat → viewer / search preview | Nội dung file working tree có thể chứa symlink ra ngoài repo; `workingCopyCatSnippet` realpath 2 đầu + exit 77 |
| ref selection → viewer | ref do người dùng/chat chọn có thể là branch khác; WR-01 guard chặn trả working copy của branch khác |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261127-vya-01 | Tampering | `checkDirtyStatus` / `searchRemoteTree` args | high | mitigate | Chỉ thêm literal flag `--untracked-files=all`; query vẫn filter client-side như cũ; `escapeShellArg` và `--end-of-options` giữ nguyên; test command `toBe` pinned. |
| T-261127-vya-02 | Information disclosure | `getRemoteWorkingFileContent` / reveal fallback | high | mitigate | Không đổi `workingCopyCatSnippet`; `confineRepoPath` chặn `../`; exit 77 chặn symlink parent/leaf; test symlink escape cũ vẫn pass. |
| T-261127-vya-03 | Tampering | viewer working-copy-first vs old ref (WR-01) | high | mitigate | Chỉ fallback working copy khi resolve(ref) == resolve(HEAD) qua `rev-parse --verify --end-of-options`; mọi failure fail closed, test WR-01 cũ pin. |
| T-261127-vya-04 | DoS | search gọi thêm status mỗi query | low | mitigate | Debounce 300ms hiện có; `SEARCH_RESULT_LIMIT=100` giữ nguyên; cache ls-tree vẫn 1 lần/ref; dirty rows chỉ filter client-side. |
| T-261127-vya-SC | Tampering | package installs | low | accept | Không có lệnh cài npm/pip/cargo trong quick task này. |
</threat_model>

<verification>
1. Task 1: `cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/__tests__/gitRemoteService.test.ts src/services/__tests__/gitRemoteTreeService.test.ts --bail=1` — exit 0, test cũ + 3 test mới pass.
2. Task 2: `cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/__tests__/gitRemoteTreeService.test.ts --bail=1` — exit 0, WR-01/symlink/glob/fsmonitor tests vẫn pass.
3. Task 3: `cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/__tests__/gitRemoteTreeService.test.ts src/workbench/__tests__/RemoteGitExplorer.test.tsx src/workbench/__tests__/RemoteFileViewer.test.tsx src/utils/__tests__/remoteTreeCompact.test.ts --bail=1 && npx tsc --noEmit` — exit 0.
4. `git diff --check` sạch; giữ nguyên 3 file modified có sẵn từ debug; KHÔNG stage/commit, KHÔNG `npm test` (>1 giờ), KHÔNG live SSH.
5. RED→GREEN mỗi task: ghi output failure thật (assertion, không phải compile error/zero-test); grep hygiene dùng `grep -v '^#' | grep -c token` nếu cần gate bằng grep.
</verification>

<success_criteria>
- Untracked sâu + untracked trong folder đã track: hiện, expand, mở tab, reveal ổn; `?? newdir/` không bị gộp mất.
- Viewer hiện working copy cho `A `/`AM`/`M `/` M`/`MM`; ref khác HEAD vẫn trả blob ref; symlink escape vẫn reject.
- Global search tìm thấy file staged/untracked; query vẫn là data, cache/limit/guard cũ không đổi.
- Scoped vitest 4 file + `npx tsc --noEmit` xanh; STATE cập nhật; không dependency mới; KHÔNG commit.
</success_criteria>

<output>
Không tạo SUMMARY mới. Khi xong, báo sếp kết quả scoped tests + tsc, nhắc 3 file modified có sẵn từ debug vẫn giữ nguyên và chưa stage/commit.
</output>
