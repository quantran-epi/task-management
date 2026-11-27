---
status: resolved
trigger: "SSH Remote Explorer vẫn lỗi sau các commit fix gần đây (đặc biệt 1a20beec fix(ssh-explorer)). Repro: repo có 2 thư mục ở root, mỗi thư mục có 1 thư mục con, file nằm trong thư mục con. Khi mở repo, cả 2 thư mục hiển thị dạng parent.child; chỉ 1 expand được và liệt kê file con, cái còn lại expand chả show gì dù có file. Chỉ gặp ở 1 số trường hợp. Không có console error được biết. Màn hình: Remote Git Explorer (workbench bên phải). Không có đường dẫn repo cụ thể — tự dựng fixture."
created: 2026-11-27
updated: 2026-11-27
---

# SSH Explorer parent.child expand trống

## Symptoms

- Expected: mỗi thư mục root (gồm cả dạng compact `parent.child`) khi expand phải liệt kê được file/con bên trong.
- Actual: trong repo có 2 root folder, mỗi folder có đúng 1 subfolder chứa file; sau compaction cả 2 hiển thị dạng `parent.child`. Một nhánh expand được, nhánh còn lại expand trống.
- Timeline: lỗi xuất hiện/sau các fix gần đây (1a20beec "preserve expansion on refresh, unify compact rule, show staged AM files"); trước đó cũng có nhiều fix SSH explorer khác trong ngày 27/11.
- Reproduction: fixture 2 root dir, mỗi dir có 1 child dir chứa file. Không có repo thật được cung cấp.
- Errors: không có console error được báo cáo.

## Current Focus

- hypothesis: `onLoadData` vẫn dùng `gitStatus` làm ranh giới dừng descent, trong khi commit 1a20beec đã bỏ badge khỏi compaction rule. Folder con badged bị gộp thành `parent.child` nhưng lazy loader dừng lại → node gộp không có children → expand trống. Nhánh sạch descent tiếp nên expand được. Giải thích đúng hiện tượng "1 expand được, 1 không".
- test: Regression fixture 2 root folder, mỗi folder 1 subfolder chứa 1 file; đánh dấu dirty trên file của nhánh thứ hai. Trước fix: `FileB.ts` không hiện (đỏ). Sau fix: cả `FileA.ts` + `FileB.ts` hiện.
- expecting: Cả hai nhánh compact expand ra file.
- next_action: none — resolved
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-11-27 — Source: `src/utils/remoteTreeCompact.ts:60-71` (sau 1a20beec) gộp chain qua node có `gitStatus` và chuyển badge lên merged row. `git show 1a20beec` xóa `hasBadge(end)`/`hasBadge(only)` khỏi điều kiện dừng compaction.
- timestamp: 2026-11-27 — Source: `src/workbench/toolwindows/RemoteGitExplorer.tsx:492` `onLoadData` vẫn có `only.gitStatus?.trim()` trong điều kiện `break` của vòng lặp descent — làm `level` dừng ở folder badged, `injectRawChildren(prev, startPath, children)` gắn children rỗng/không đúng vào node gộp.
- timestamp: 2026-11-27 — Source: `mergeUncommittedFilesIntoTree` (`gitRemoteTreeService.ts:97`) gán `gitStatus='M'` cho mọi folder chứa file dirty. Vì vậy chỉ nhánh dirty dừng descent; nhánh sạch tiếp tục → đúng triệu chứng bất đối xứng.
- timestamp: 2026-11-27 — Regression test mới `RemoteGitExplorer.test.tsx` "expands both compact parent.child branches even when one child is dirty" đỏ trước fix (`FileB.ts` vắng), xanh sau fix.
- timestamp: 2026-11-27 — 70/70 scoped tests pass (`RemoteGitExplorer`, `remoteTreeCompact`, `gitRemoteTreeService`); `tsc --noEmit` pass.

## Eliminated

- SSH connection/auth failure: triệu chứng là state/tree logic, không có transport error; mock service tái hiện được mà không cần SSH.
- Refresh/loadedKeys (BUG-04 cũ): đã fix ở 1a20beec và test BUG-04 vẫn pass; lỗi tái hiện ngay lần expand đầu, không cần refresh.
- Compaction rule sai: compaction đã đúng (dirty/clean cùng label `parent.child`); lỗi nằm ở lazy loader không khớp rule đó.

## Resolution

- root_cause: `onLoadData` dùng `gitStatus` làm ranh giới dừng descent, không khớp với compaction rule mới (badge không còn là ranh giới). Folder con có badge dirty bị gộp vào `parent.child` nhưng fetch dừng ở đó, nên node gộp expand trống; nhánh sạch thì descent tiếp và hiển thị file.
- fix: Bỏ `only.gitStatus?.trim()` khỏi điều kiện `break` trong vòng lặp descent của `onLoadData` — giờ badge chỉ là nhãn hiển thị, không cản lazy load. Thêm regression test 2 nhánh (một dirty).
- verification: `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx src/utils/__tests__/remoteTreeCompact.test.ts src/services/__tests__/gitRemoteTreeService.test.ts` — 70/70 pass. `npx tsc --noEmit` pass.
- files_changed: `src/workbench/toolwindows/RemoteGitExplorer.tsx`, `src/workbench/__tests__/RemoteGitExplorer.test.tsx`, `.planning/debug/ssh-explorer-parent-child-expand.md`
