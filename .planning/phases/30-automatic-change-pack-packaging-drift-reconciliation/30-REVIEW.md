---
phase: 30-automatic-change-pack-packaging-drift-reconciliation
reviewed: 2026-11-06T09:52:19Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/services/changePackPackager.ts
  - src/services/wizard/changePack.ts
  - src/services/__tests__/changePackPackager.test.ts
  - src/components/sdlc/steps/Step4ChangePackView.tsx
  - src/views/ProjectSdlcView.tsx
  - src/components/sdlc/steps/__tests__/Step4ChangePackView.test.tsx
findings:
  critical: 1
  warning: 12
  info: 5
  total: 18
  necessity: 3
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-11-06T09:52:19Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Đã review toàn bộ 6 file thuộc phạm vi Phase 30 (automatic change-pack packaging + drift reconciliation): packager SSH mới, validator/meta schema, Step 4 view, wiring trong `ProjectSdlcView`, và 2 file test. Đã đối chiếu với `30-CONTEXT.md` (D-08..D-11), `30-UI-SPEC.md`, và `CLAUDE.md`.

Phần bảo mật SSH được xây dựng đúng hướng và đã kiểm chứng: path traversal bị chặn trước khi gọi SSH (`changePackPackager.ts:36`, `51-55`), secret chỉ lấy từ OS keyring qua `getSshSecret` và không bị nội suy vào command, `escapeShellArg` + `--end-of-options` + kiểm tra hex 40/64 ký tự cho ref (`changePackPackager.ts:67-71`), không lưu credential. Không phát hiện hardcoded secret hay command injection trong luồng packager.

Rủi ro lớn nhất nằm ở **validator ZIP** (`changePack.ts`): `checkCRC32: true` khiến JSZip giải nén *toàn bộ* entry ngay trong `loadAsync`, trước mọi kiểm tra kích thước — mở đường zip-bomb/OOM cho file `.zip` nạp thủ công. Ngoài ra có nhóm lỗi tính nhất quán trạng thái giữa Step 4 và coordinator (lưu active pack + toast thành công trước khi coordinator commit xong, trong khi `ProjectSdlcView` nuốt lỗi coordinator), dữ liệu meta.json bị bịa (author/subject commit), và hợp đồng text-sniffing `WIZARD_DEFERRED_HUNK` giữa packager và validator.

Chi tiết từng finding ở dưới, tất cả đã được xác minh trực tiếp trên source hiện tại (không suy đoán).

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Zip-bomb — validator giải nén toàn bộ entry trước khi kiểm tra kích thước

**File:** `src/services/wizard/changePack.ts:154` (load), `:178-184` (size checks)
**Issue:** `JSZip.loadAsync(packedBytes, { checkCRC32: true, createFolders: false })` được gọi trước mọi guard. Với JSZip, `checkCRC32: true` buộc nó decompress *mỗi* entry ngay trong lúc load (`node_modules/jszip/lib/load.js:25-58` tạo promise `async('uint8array')` cho tất cả file). Sau đó code mới đọc `bytes = await candidate.entry.async('uint8array')` (dòng 178) rồi mới so `maxEntryBytes` (182) và `expandedBytes` (184). Nghĩa là một file `.zip` nạp thủ công có compressed ≤ `maxCompressedBytes` (25 MB) nhưng giải nén hàng GB sẽ được decompress hết vào RAM trước khi bất kỳ giới hạn nào chạy → treo/OOM app Tauri, mất dữ liệu chưa lưu. Đây là đường vào thực tế: `validateHubChangePack(file, crCode)` nhận file người dùng chọn trong manual upload (`Step4ChangePackView.tsx` accordion "Nạp Change Pack thủ công").
**Fix:** Chặn trước khi decompress — đọc `uncompressedSize` từ central directory và cộng dồn, hoặc bỏ `checkCRC32` (chỉ kiểm CRC sau khi đã giới hạn), và giải nén từng entry với cap cứng:
```ts
const zip = await JSZip.loadAsync(packedBytes, { createFolders: false }); // bỏ checkCRC32
let declared = 0;
for (const f of Object.values(zip.files)) {
  if (f.dir) continue;
  declared += (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (declared > limits.maxExpandedBytes) throw new Error('PACK_EXPANDED_TOO_LARGE');
}
// sau đó mới async('uint8array') từng entry, kiểm maxEntryBytes NGAY sau mỗi lần đọc
```
Nếu giữ CRC check, phải chạy nó sau khi đã chặn tổng uncompressed size.

## Warnings

### WR-01: meta.json chứa dữ liệu bịa — author và subject commit không có thật

**File:** `src/services/changePackPackager.ts:46-48`
**Issue:** `author: 'TaskMate SSH Packager'` là hằng số bịa, và `commits: (snapshot.commitShas ?? [targetCommit]).map((sha) => ({ sha, subject: \`Commit ${sha}\` }))` tạo subject giả. `meta.json` là bằng chứng (evidence) của change-pack dùng cho drift/reconciliation và audit; ghi author/subject không tồn tại làm sai lệch bằng chứng và có thể khiến người dùng tin nhầm nguồn gốc commit.
**Fix:** Lấy dữ liệu thật qua một lần gọi Git, hoặc bỏ hẳn 2 field:
```ts
const logOut = await runGitCommand(config, repoPath,
  ['log', '--no-walk=unsorted', '--format=%H%x1f%an%x1f%s', ...commitShas], secret);
```
Nếu không muốn thêm round-trip SSH, xóa `author` và đổi `commits` thành mảng `{ sha }` (schema cho phép).

### WR-02: Hợp đồng text-sniffing `WIZARD_DEFERRED_HUNK` giữa packager và validator

**File:** `src/services/changePackPackager.ts:115, 120, 135`; `src/services/wizard/changePack.ts:187`
**Issue:** Packager nối chuỗi `'\n# WIZARD_DEFERRED_HUNK: ...'` vào `diff.patch` khi bỏ qua file quá lớn/binary/không decode được; validator suy ra coverage bằng `new TextDecoder().decode(bytes).includes('WIZARD_DEFERRED_HUNK')`. Đây là coupling chuỗi mỏng manh giữa 2 module: (a) một diff hợp lệ có chứa literal này (ví dụ file markdown/comment) sẽ bị phân loại sai thành `deferred`; (b) đổi message phía packager mà quên validator sẽ âm thầm làm coverage luôn `complete`. Đã kiểm chứng: chèn dòng `# ...` sau patch vẫn qua `git apply --check`, nên hậu quả là sai *ngữ nghĩa coverage*, không phải patch hỏng — nhưng vẫn là dữ liệu drift sai.
**Fix:** Mang trạng thái deferred trong dữ liệu có cấu trúc, không trong text patch. Ví dụ thêm `deferred: string[]` vào `meta.json`/manifest, validator đọc field đó; hoặc đặt marker trong entry riêng (`coverage.json`).

### WR-03: Lưu active pack + toast thành công trước khi coordinator commit, lỗi coordinator bị nuốt

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:197-200, 293-297`; `src/views/ProjectSdlcView.tsx:765-775`
**Issue:** `commitPack` gọi `saveMultiPackState` (197), `setMultiPackState` (198), `setDriftResult` (199) rồi mới `await onCommitChangePackAndDrift(...)` (200). Trong `ProjectSdlcView`, handler `onCommitChangePackAndDrift` bắt lỗi coordinator và chỉ gọi `reportGuardError(err)` — không rethrow. Kết quả: local state đã ghi active pack + UI hiện toast thành công (`:297`), trong khi CR/coordinator ở trạng thái cũ → desync giữa MultiPack local và CR state, người dùng tưởng đã commit xong.
**Fix:** Đảo thứ tự — await coordinator trước, chỉ persist local state và show success sau khi coordinator resolve; hoặc cho handler rethrow để `commitPack` rollback state khi lỗi:
```ts
await onCommitChangePackAndDrift(packHash, fileName, reconciliation);
await saveMultiPackState(projectId, crId, next, db);
setMultiPackState(next);
message.success('Đã đóng gói và đối chiếu change-pack');
```

### WR-04: `handleSelectActive` ghi con trỏ active trước khi reconcile

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:324-357`
**Issue:** Hàm lưu active pointer (333-334) trước khi chạy reconcile/commit. Nếu reconcile fail (catch 352-354), pack đã bị đánh dấu active nhưng drift result không được cập nhật → UI hiển thị pack active với drift cũ/không có, trái với D-09 (active phải gắn với drift đã đối soát).
**Fix:** Chỉ persist active sau khi `buildHubReconciliation` + commit thành công; nếu cần optimistic UI thì rollback về `previousActive` trong catch.

### WR-05: State drift/banner không được reset sau thành công hoặc khi nạp thủ công

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:125` (driftConfirmed), `:203-213` (handleSelectFile), `:241-248`, `:313-316`
**Issue:** `driftConfirmed` không được reset về `false` sau khi package thành công, nên lần đóng gói sau có thể bỏ qua bước xác nhận drift dù đó là snapshot/HEAD mới. `handleSelectFile` không clear `packagingWarnings`, `dirtyNotice`, `driftPrompt` — sau khi nạp file thủ công, banner cảnh báo của lần auto-package trước vẫn hiển thị, gây hiểu nhầm về file vừa nạp.
**Fix:** Reset `setDriftConfirmed(false)`, `setPackagingWarnings([])`, `setDirtyNotice(null)`, `setDriftPrompt(null)` ở đầu `handlePackageFromSnapshot`/`handleSelectFile`, và trong nhánh success của `commitPack`.

### WR-06: Giới hạn entry không khớp giữa packager (1000) và reconciliation schema (512)

**File:** `src/services/wizard/changePack.ts:15` (`maxEntries: 1000`); `src/services/wizard/reconciliation.ts:129` (`pack.entries` `.max(512)`)
**Issue:** Packager/validator chấp nhận tới 1000 entry, nhưng `ReconciliationInputSchema` chỉ nhận 512. Một pack hợp lệ 513–1000 entry sẽ fail ở bước reconciliation với `ZodError` thô, sau khi đã đóng gói và có thể đã persist — lỗi muộn, khó hiểu.
**Fix:** Thống nhất một hằng số (ví dụ export `MAX_PACK_ENTRIES` và dùng ở cả `changePack.ts` lẫn `reconciliation.ts`), hoặc nâng `.max()` của reconciliation lên 1000.

### WR-07: Nút "Thử lại kết nối" hiện cho mọi lỗi, không chỉ lỗi SSH

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:298-303, 536-548`
**Issue:** Mọi exception trong `handlePackageFromSnapshot` đều dẫn tới `setShowRetryConnection(true)`, kể cả lỗi validation, lỗi quyền, lỗi path. D-11 chỉ định retry cho lỗi SSH. Người dùng bấm "Thử lại kết nối" cho lỗi không phải kết nối → lặp lại thất bại vô ích.
**Fix:** Phân loại lỗi trước khi bật retry (ví dụ chỉ khi message/error code thuộc nhóm `SSH_*`/`ECONN*`/timeout); các lỗi khác chỉ hiện thông báo + mở manual fallback.

### WR-08: Raw `err.message` lộ ra UI, trái quy ước "raw internal detail never escapes"

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:225-226, 299-301, 353-354`; đối chiếu `src/views/ProjectSdlcView.tsx:447-455`
**Issue:** Step 4 hiển thị nguyên `err.message` (kể cả message từ Rust/SSH/Zod), trong khi `ProjectSdlcView.reportGuardError` được viết rõ để map guard code → thông điệp thân thiện và không để lộ chi tiết nội bộ. Hai quy ước mâu thuẫn trong cùng luồng; message kỹ thuật còn có thể chứa path/hostname.
**Fix:** Dùng chung hàm format lỗi của `ProjectSdlcView` (map error code → message), chỉ log raw message ra console/dev.

### WR-09: Thiếu hạng mục UI-SPEC — commit count, Tooltip/ellipsis, phân trang MultiPack

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:407-455`; `src/components/sdlc/pack/MultiPackTable.tsx` (`pagination={false}`)
**Issue:** `30-UI-SPEC.md:123` yêu cầu snapshot card hiển thị cả commit count và file count; card hiện chỉ có branch/Base/Head/`Tệp thay đổi`. `:129` yêu cầu ellipsis + Tooltip cho text dài — không có. `:128` yêu cầu MultiPack 5 dòng/trang — `pagination={false}` render toàn bộ, vỡ layout khi nhiều pack. Đây là lệch hợp đồng UI đã duyệt.
**Fix:** Thêm dòng commit count (lấy từ `snapshot.commitCount`, đã có trong `BranchSnapshotSchema`), bọc text dài bằng `Tooltip` + `ellipsis`, bật `pagination={{ pageSize: 5 }}`.

### WR-10: Kiểm tra drift trùng lặp, gọi SSH không có secret trong UI

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:270`; packager đã kiểm lại tại `src/services/changePackPackager.ts:59-62`
**Issue:** UI gọi `checkHeadDrift(config, repoPath, targetBranch, approvedHead)` không truyền secret, tạo thêm một round-trip SSH (và resolve keyring) trước khi packager gọi lại cùng kiểm tra với secret. Hai nguồn kết quả drift có thể lệch nhau (TOCTOU nhỏ) và tăng độ trễ.
**Fix:** Bỏ lần kiểm tra ở UI, để packager là nguồn duy nhất; hoặc packager trả kết quả drift trong `warnings`/kết quả để UI hiển thị.

### WR-11: Đường dẫn non-ASCII/rename từ Git bị parse sai → sai entry pack

**File:** `src/services/gitRemoteService.ts:200-217` (parse numstat/name-status không dùng `-z`)
**Issue:** Git C-quote path non-ASCII/khoảng trắng trong `--name-status`/`--numstat` (đã kiểm chứng: `"T\303\240i..."`), và rename hiện dạng `old.txt => new.txt`. Parser hiện tại dùng nguyên chuỗi làm `path`, nên `fileStats` chứa path đã quote/composite. Hệ quả: regex chọn `sql/*` không khớp file SQL non-ASCII, và entry path trong pack sai/không tồn tại → `cat-file`/`show` fail hoặc file bị bỏ qua âm thầm.
**Fix:** Thêm `-z` và parse NUL-delimited (path raw, rename có 2 path riêng), hoặc dùng `core.quotePath=false` + tách rename theo ` => `.

### WR-12: Test tích hợp không hermetic — phụ thuộc bash và lịch sử git của máy

**File:** `src/services/__tests__/changePackPackager.test.ts:57-72`
**Issue:** Test dùng `execFileSync('bash', ['-c', ...])` chạy trên `process.cwd()` và `HEAD^`. Trên Windows (không có bash) hoặc shallow clone/commit đầu tiên (không có `HEAD^`) test fail; trên repo lớn test phụ thuộc nội dung thật của `src/types/ssh.ts`. Đây là test giòn, không kiểm soát được môi trường.
**Fix:** Tạo repo tạm trong `os.tmpdir()` bằng `git init` + commit fixture trong `beforeAll`, dùng `--depth`/fixture cố định; hoặc mock hoàn toàn `runGitCommand` và giữ test này chỉ chạy trong CI Linux có điều kiện skip.

## Info

### IN-01: `getEffectiveChangePackLimits` và alias `ChangePackLimits` chưa có chỗ dùng thực tế

**File:** `src/services/wizard/changePack.ts:18-26`
**Issue:** Override plumbing (`getEffectiveChangePackLimits(overrides?)`) và alias `ChangePackLimits = DesktopChangePackLimits` chỉ được dùng trong test; production gọi `DesktopChangePackLimits` trực tiếp. Đây là tổng quát hóa chưa có instantiation.
**Category:** necessity — generality without instantiation
**Fix:** Xóa override + alias cho tới khi có nhu cầu cấu hình thật; giữ một hằng số duy nhất.

### IN-02: Tham số `onPersistentWrite` không dùng và không bao giờ được truyền

**File:** `src/services/wizard/changePack.ts:148`
**Issue:** `void onPersistentWrite;` — tham số tồn tại nhưng bị bỏ qua, không caller nào truyền. Phantom requirement.
**Category:** necessity — phantom requirement
**Fix:** Xóa tham số khỏi signature.

### IN-03: Prop Ant Design 6 đã deprecated

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:392, 460, 496, 516, 525, 542, 555` (`Alert message=`), `:562` (`Spin tip=`)
**Issue:** AntD 6 đổi `Alert.message` → `title` và `Spin.tip` → `description` (`node_modules/antd/es/alert/Alert.d.ts:49-52`, `spin/index.d.ts:42-44`). Vẫn chạy nhưng sẽ bị bỏ ở major tiếp theo, và log deprecation.
**Fix:** Đổi sang `title=` và `description=`.

### IN-04: Test biên và nhánh lỗi còn thiếu/không chính xác

**File:** `src/services/__tests__/changePackPackager.test.ts:160-169`
**Issue:** Test "more than 1000 entries" dùng 999 file (thực tế fail vì 999+2 entry), không kiểm đúng biên 1000/1001. Không có test cho `PACK_EXPANDED_TOO_LARGE`, base-ref rev-parse fail, zip-bomb (CR-01), và tác động của marker deferred lên coverage.
**Fix:** Thêm case đúng biên và các nhánh lỗi trên; đặc biệt một test hồi quy cho CR-01.

### IN-05: `handleDeletePack` không tự bảo vệ pack đang active

**File:** `src/components/sdlc/steps/Step4ChangePackView.tsx:360-369`
**Issue:** Hàm xóa không kiểm tra pack có đang active không; an toàn hiện tại chỉ nhờ UI ẩn nút xóa cho active (`MultiPackTable.tsx:98`). Nếu UI thay đổi hoặc hàm được gọi từ nơi khác, có thể xóa pack active.
**Category:** necessity — already-defended-elsewhere (UI hiện đã chặn); ghi nhận để tránh thêm guard trùng lặp nếu không cần
**Fix:** Cân nhắc guard một dòng trong handler nếu muốn phòng vệ nhiều lớp; nếu giữ nguyên, ghi chú rõ trong code rằng UI chịu trách nhiệm.

---

_Reviewed: 2026-11-06T09:52:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
