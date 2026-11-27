---
status: resolved
trigger: "commit fix gần đây khiến cho remote ssh explorer gặp lỗi nghiêm trọng, folder mở ra không xem đủ file, có vẻ như là xem được file untrack, nhưng lại không thấy các file đã commit đâu, phải xem được đầy đủ tất cả file trong folder, hiểu không, làm cho chuẩn vào, không vá víu"
created: 2026-11-28
updated: 2026-11-28
---

# Symptoms

- Expected: Remote SSH Explorer liệt kê đầy đủ mọi folder và file như một file explorer thật — file đã commit, đã sửa, staged, untracked — không sót mục nào.
- Actual: Một folder có nhiều file nhưng chỉ hiện ~1 file, có vẻ là file untracked. Các file đã commit không hiện.
- Error messages: chưa rõ; user không nắm kỹ chi tiết kỹ thuật, mô tả bằng hành vi nhìn thấy.
- Timeline: bắt đầu sau commit `80e161ce fix(ssh-explorer): show all uncommitted files and working content` (gần đây nhất).
- Reproduction: user connect remote, mở folder có nhiều file trong SSH Explorer → thấy thiếu file.

# user notes (verbatim, data only)

"tao không nắm rõ kỹ thuât chi tiết đâu, tao chỉ cần là remote ssh explorer phải xem đươcj hoàn hảo, đầy đủ như 1 file explorer thực thụ, tất cả các folder và file, bất kể nó là file đã commit hay untracked hay chưa commit hay staged, etc. hiểu không, hiện tại đang có lỗi folder có nhièu file mà chỉ xem đc 1 file có vẻ là file untrack, các file commited không xem đươc"

# Constraints

- Fix gốc (state owner / đúng nguồn dữ liệu), không vá víu, không patch chắp vá ở UI.
- Không cần hỏi user thêm chi tiết kỹ thuật; tự điều tra từ code, diff `80e161ce`, và test liên quan.
- Ngôn ngữ trao đổi: tiếng Việt, xưng sếp.

# Current Focus

- hypothesis: xác nhận — `80e161ce` thêm nhánh trong `mergeUncommittedFilesIntoTree` fabricate `children` ngay trên folder đã có trong ref khi có dirty path bên dưới. AntD Tree thấy `children` → đánh dấu node đã load → không gọi `onLoadData` → `git ls-tree <ref>:<folder>` không bao giờ chạy → mọi file committed trong folder bị giấu, chỉ còn file untracked vừa fabricate.
- next_action: none — resolved
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-11-28 — Source: diff `80e161ce` thêm `else if (cleanBaseDir) { existingNode.children = ...; materializeChain(existingNode.children, parts.slice(1), ...) }` trong `mergeUncommittedFilesIntoTree` (gitRemoteTreeService.ts). Đây là điểm gốc: fabricate children trên folder có trong ref.
- timestamp: 2026-11-28 — Source: `RemoteGitExplorer.tsx:474-483` `fetchLevel` gọi `getRemoteTree(path)` rồi `mergeUncommittedFilesIntoTree(rawChildren, uncommittedFiles, path)` — tức merge được gọi LẠI với `baseDir=path` lúc expand thật; fabricate ở root-level là thừa và có hại.
- timestamp: 2026-11-28 — RED regression service test "keeps a committed folder lazy when a dirty file lives inside it (no partial children)": trước fix `nested.children = [untracked.ts]` (fail), sau fix `undefined`, badge `M` giữ nguyên.
- timestamp: 2026-11-28 — RED regression UI test "does not hide committed files in a folder whose dirty child was pre-fabricated": trước fix `CommittedA.ts`/`CommittedB.ts` vắng (AntD skip onLoadData), sau fix hiện cả cộng `untracked.ts`.
- timestamp: 2026-11-28 — Baseline 103 scoped tests pass trước sửa; sau fix 106/106 pass (4 file: gitRemoteTreeService, RemoteGitExplorer, remoteTreeCompact, gitRemoteService); `npx tsc --noEmit` exit 0; `npm run build` exit 0; `git diff --check` sạch.

## Eliminated

- Commit `80e161ce` viewer working-copy-first / search status / reveal fallback: các phần đó đúng, test của chúng vẫn xanh; không đụng.
- `remoteTreeCompact.ts` compaction rule: đã đúng từ debug trước (`ssh-explorer-parent-child-expand.md`); badge không cản descent; không đụng.
- `checkDirtyStatus --untracked-files=all`: enum đúng từng file; không đụng.

## Resolution

- root_cause: `mergeUncommittedFilesIntoTree` fabricate `children` trên folder đã tồn tại trong git ref khi có uncommitted path bên dưới. AntD Tree coi node có `children` là đã load, bỏ qua `onLoadData`, nên `ls-tree <ref>:<folder>` không chạy và toàn bộ file committed trong folder bị giấu — chỉ file untracked được fabricate còn hiện, đúng triệu chứng sếp mô tả.
- fix: Bỏ nhánh `else if (cleanBaseDir)` fabricate children trong `mergeUncommittedFilesIntoTree`; với node đã có trong ref chỉ gán badge `M`. Dirty path bên dưới vẫn được materialize đúng lúc expand vì `onLoadData`/reveal gọi merge lại với `baseDir` là folder đó. Giữ nguyên materializeChain cho folder hoàn toàn mới (untracked dir) và mọi guard bảo mật.
- verification: `npx vitest run src/services/__tests__/gitRemoteTreeService.test.ts src/workbench/__tests__/RemoteGitExplorer.test.tsx src/utils/__tests__/remoteTreeCompact.test.ts src/services/__tests__/gitRemoteService.test.ts --reporter=dot` → 106/106 pass; `npx tsc --noEmit` exit 0; `npm run build` exit 0. Không có SSH fixture thật để chạy browser verify end-to-end; scoped jsdom UI test mô phỏng đúng luồng expand.
- files_changed: `src/services/gitRemoteTreeService.ts`, `src/services/__tests__/gitRemoteTreeService.test.ts`, `src/workbench/__tests__/RemoteGitExplorer.test.tsx`.
