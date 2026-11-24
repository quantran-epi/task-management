---
phase: 261124-sav
reviewed: 2026-11-24T00:00:00Z
depth: quick
files_reviewed: 7
files_reviewed_list:
  - src/components/knowledge/DocumentSetForm.tsx
  - src/db/repositories/documentSetRepo.ts
  - src/workbench/DocSetLibrary.tsx
  - src/workbench/DocumentSetDetail.tsx
  - src/workbench/__tests__/DocsWorkspace.test.tsx
  - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
  - tests/knowledge/documentSetHashes.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 261124-sav: Code Review Report

**Reviewed:** 2026-11-24T00:00:00Z
**Depth:** quick
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Review diff `41aade77..50e4f0a1` theo ý định trong PLAN/SUMMARY. Kiểm tra trực tiếp các điểm trọng tâm: publish state, thứ tự `documentIds`/UUID, Rules of Hooks, `VirtualizedList` trong jsdom, validation/data safety, và các tuyên bố về hiệu năng.

Kết quả tích cực (đã đối chiếu, không phải giả định):
- Rules of Hooks: mọi hook mới (`useState`/`useRef`/`useMemo` tại dòng 577-641) đều nằm trước `if (!set)` (dòng 643). Không vi phạm.
- `documentIds` giữ nguyên thứ tự: `documentIds: members` (`DocumentSetForm.tsx:240`), `onOk` dùng retained+added theo UUID, không sinh id mới.
- `VirtualizedList` fallback jsdom render tối đa 25 row (`VirtualizedList.tsx:48-61`); test 60 doc với ≤25 row và không chứa body là có thật. `npx tsc --noEmit` sạch.
- Không dependency mới, không `dangerouslySetInnerHTML`, row không nhận `Note.body` (chỉ `sizeBytes`).
- Hash input mới `normalizeMarkdownForHash` tương đương `buildDocumentHashInput` phía server (cùng regex `\r\n|\r` → `\n`), nên publish state khớp đúng khi hash có sẵn.

Có 4 warning về hành vi và 3 info. Nổi bật: sort mặc định đi ngược nhãn "Mới nhất"; cờ `hashesReady` được thêm để chặn "Local changes" giả nhưng thực tế không chặn được; cache hash có thể trả hash cũ nếu body đổi mà `updatedAt` giữ nguyên (đúng kịch bản T-SAV-03 mà PLAN tuyên bố đã mitigate).

## Narrative Findings (AI reviewer)

## Critical Issues

Không có Critical mới từ diff này.

## Warnings

### WR-01: Sort mặc định "Mới nhất" lại xếp cũ nhất lên đầu

**File:** `src/workbench/DocumentSetDetail.tsx:636-639`
**Issue:** Nhãn option là `'Mới nhất'` (` sortKey='updated'` là giá trị mặc định, dòng 579/953) nhưng comparator lại dùng `Date.parse(a.updatedAt) - Date.parse(b.updatedAt)` — tức tăng dần, cũ nhất trước. Trước diff, bảng hiển thị theo thứ tự `documentIds` của bộ; giờ mở bộ là danh sách bị đảo thành cũ→mới, đối ngược với nhãn. Test `DocsWorkspace` kỳ vọng `rows[0]` là `tài liệu 1` nên vẫn xanh, nhưng đó chính là doc cũ nhất — test đang khóa hành vi sai này.
**Fix:**
```ts
: Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.no - b.no
```
Đồng thời cập nhật assertion trong `DocsWorkspace.test.tsx` để kỳ vọng doc cuối (mới nhất) đứng đầu, hoặc đổi nhãn thành "Cũ nhất" nếu ý định là tăng dần.

### WR-02: `hashesReady` là no-op — không chặn được trạng thái "Có thay đổi cục bộ" giả

**File:** `src/workbench/DocumentSetDetail.tsx:254`, `:281-291`
**Issue:** SUMMARY mục 66-71 tuyên bố thêm `hashesReady` để chặn "Local changes" giả lúc hash query khởi tạo. Logic thực tế: `hashesMatch = hashesReady && membershipMatches && (...every(noteHashes[id] === publishedHash))`. Khi `hashesReady === false` thì `hashesMatch === false` → `state = 'Local changes'`. Tức cờ này đẩy đúng vào trạng thái mà nó được cho là chặn. Hơn nữa, khi hash chưa sẵn thì vòng `every` đã trả `false` rồi, nên `hashesReady &&` không đổi kết quả trong mọi trường hợp — đây là dead logic. Hệ quả: bộ đã xuất bản, đang `In sync` vẫn nháy sang "Có thay đổi cục bộ" trong vài tick trên mỗi lần mở tab (ảnh hưởng cả hiển thị lẫn gating của nút xóa).
**Fix:** Tách riêng trạng thái loading, ví dụ sớm trong `publishView`:
```ts
if (!hashesReady && metadata.length > 0) {
  return { state: 'In sync' as PublishPrimaryState, activeAttemptId: undefined };
}
```
(hoặc thêm state trung tính riêng và không gán `Local changes` khi hash chưa sẵn). Rồi bỏ điều kiện `hashesReady &&` khỏi `hashesMatch` vì nó thừa. Cần một test render bộ đã `In sync` và assert không xuất hiện "Có thay đổi cục bộ" ở render đầu.

### WR-03: Cache hash theo `(id, updatedAt)` trả hash cũ nếu body đổi mà `updatedAt` không đổi

**File:** `src/db/repositories/documentSetRepo.ts:99-104`
**Issue:** `computeNoteHashesCached` chỉ so `cached?.updatedAt === note.updatedAt` rồi dùng lại hash cũ, không so nội dung. PLAN T-SAV-03 (dòng 191) tuyên bố "đổi nội dung mà quên đổi updatedAt thì vẫn hash lại ở liveQuery vì `documents` là row mới" — nhận định này sai: row mới với cùng `updatedAt` vẫn lấy hash từ Map, không hash lại. Kịch bản thực tế: khôi phục backup (`restoreBackup.ts:296` ghi note qua `bulkPut` với `updatedAt` lưu trong backup) hoặc SQLite hydration (`db.notes.put` trực tiếp) có thể đưa body mới/body cũ với `updatedAt` trùng giá trị đã cache. Khi đó `publishView` và status từng row đọc nhầm trạng thái xuất bản của doc đó.
**Fix:** Đưa thêm một thành phần chỉ-nội dung vào khóa cache, ví dụ cache theo `(id, updatedAt, length)` hoặc lưu thêm `bodyLength`/`bodyPrefix` và so sánh trước khi reuse:
```ts
if (cached?.updatedAt === note.updatedAt && cached.length === note.body.length) { ... }
cache.set(note.id, { updatedAt: note.updatedAt, length: note.body.length, hash });
```
Hoặc xóa `hashCache.current` khi phát hiện DB thay thế toàn bộ (restore/import). Cần test: cùng `id` + cùng `updatedAt` nhưng body khác → hash phải đổi.

### WR-04: Progress bar trong banner xuất bản là số tĩnh, không phản ánh tiến độ

**File:** `src/workbench/DocumentSetDetail.tsx:719-724`
**Issue:** Banner `Publishing` hiển thị `{publishingDocIds.size} tài liệu / {set.documentIds.length}` và `<Progress percent=... status="active">`. `publishingDocIds` được xây từ `attempt.submittedDocuments` (`:584-587`) — danh sách đã gửi, không đổi trong suốt attempt. Thanh progress vì thế đứng yên ở một tỷ lệ cố định, gây hiểu nhầm là đang tiến triển; `handleReconcileAttempt` cũng không cập nhật số này. PLAN chỉ cấm bịa nút "Tạm dừng", nhưng progress bịa từ số tĩnh cũng là tín hiệu sai.
**Fix:** Bỏ `Progress`/tỷ lệ phần trăm, thay bằng text trạng thái trung thực, ví dụ `Đã gửi {n} tài liệu · đang chờ Knowledge Server xác nhận`; chỉ dùng `Progress` khi có nguồn tiến độ thực (ví dụ cập nhật từ `pollAcceptedAttempt`/server status).

## Info

### IN-01: `message.error is not a function` — có thật nhưng KHÔNG phải do diff này gây ra

**File:** `src/workbench/DocSetLibrary.tsx:83` (liên quan `src/workbench/__tests__/DocsWorkspace.test.tsx`)
**Issue:** Đã chạy `npx vitest run src/workbench/__tests__/DocsWorkspace.test.tsx` và tái hiện đúng 1 unhandled rejection: `TypeError: message.error is not a function` tại `handleCreate` catch. Đối chiếu `git show 41aade77:src/workbench/DocSetLibrary.tsx` thấy dòng `message.error(...)` và test "creates a set from the library tab form and selects it" đều không đổi trong `41aade77..50e4f0a1`; payload `save()` của `DocumentSetForm` cũng không đổi theo diff. Nguyên nhân gốc là test render không có `ThemeAppHolder`/`AntApp` nên `AntApp.useApp().message` thiếu (xem `src/components/ui/message.tsx:6-8`). SUMMARY ghi nhận đúng là pre-existing. Không tính lỗi regression của quick task này.
**Fix:** Ngoài scope. Khi dọn riêng: wrap test render trong `<ThemeAppHolder>` hoặc mock `useMessage` trong `tests/setup.ts`.

### IN-02: Export `DOC_SET_PAGE_SIZE` giờ không còn người dùng

**File:** `src/workbench/DocumentSetDetail.tsx:40`
**Issue:** Sau khi thay `Table` bằng `VirtualizedList`, `DOC_SET_PAGE_SIZE = 10` chỉ còn định nghĩa, không import/consumer nào trong `src`/`tests`. Comment tại dòng 39 vẫn nói "bounded document list".
**Fix:** Xóa cả hằng số lẫn comment; bounded list giờ do `VirtualizedList` đảm nhiệm.

### IN-03: Chip lọc `.md`/`.docx` khớp vào `title`, trong khi import thường bỏ đuôi

**File:** `src/workbench/DocumentSetDetail.tsx:633`, `:958-959`
**Issue:** Bộ lọc dùng `row.title.toLowerCase().endsWith(extFilter)`. Tuy nhiên luồng import (`ZipImportPreviewModal.tsx:160`) đặt title bằng `fileName.replace(/\.(md|markdown)$/i, '')` — tức đã bỏ đuôi. Với phần lớn doc, chip `.md` và `.docx` sẽ lọc ra 0 kết quả dù tài liệu có nguồn tương ứng. MODEL `Note` cũng không có trường extension. Đây là theo đúng chỉ dẫn PLAN dòng 139, nhưng hành vi thực tế gần như vô dụng.
**Fix:** Nếu muốn giữ chip, cần nguồn extension đáng tin (field mới trên `Note` hoặc metadata lúc import); ngược lại bỏ 2 chip này khỏi toolbar.

## Verified, không phải finding

- **Rules of Hooks:** hooks mới tại `DocumentSetDetail.tsx:577-641`, trước early return `:643`. `DocSetLibrary` render `<DocumentSetDetail setId=...>` không có `key`, nhưng `hashCache` là `useRef` khởi tạo một lần và key theo `note.id` (UUID duy nhất), nên chuyển bộ không lẫn hash.
- **UUID / thứ tự membership:** picker `onOk` giữ retained+added, `save()` gửi `documentIds: members`; không sinh UUID mới. `computeNoteHashesCached` trả `Record` đúng id được truyền (test `documentSetHashes.test.ts:55-70`).
- **VirtualizedList jsdom/browser:** fallback 25 row chỉ kích hoạt khi `getVirtualItems()` rỗng; trong browser thật virtualizer cắt theo viewport, `contain: strict` + absolute positioning đúng công thức. Test 60 doc không chứa "Nội dung bí mật" trong DOM là có thật.
- **Data safety / injection:** title/path render qua `Text`/`Tag` (React escape); path walk giới hạn 20 cấp và dừng khi thiếu cha cả ở detail lẫn form. Không có `eval`, `innerHTML`, `dangerouslySetInnerHTML`, hay endpoint/auth path mới.
- **Publish hash compatibility:** `normalizeMarkdownForHash` (`documentSetRepo.ts:63`) và `buildDocumentHashInput`/`normalizeNewlines` (`knowledge-server/src/indexing/chunkHashPolicy.ts:11,27`) cùng chuẩn D-22, nên so sánh `noteHashes[id] === publishedContentHash` đúng khi hash đã sẵn.

---

_Reviewed: 2026-11-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
