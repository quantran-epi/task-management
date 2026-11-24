---
phase: quick-261124-sav
plan: 261124-sav
verified: 2026-11-24T14:37:24Z
status: human_needed
score: 7/7 must-haves verified
covered_files:
  - ".planning/quick/261124-sav-refactor-m-n-h-nh-b-t-i-li-u-theo-3-sket/261124-sav-PLAN.md"
  - ".planning/quick/261124-sav-refactor-m-n-h-nh-b-t-i-li-u-theo-3-sket/261124-sav-SUMMARY.md"
  - ".planning/quick/261124-sav-refactor-m-n-h-nh-b-t-i-li-u-theo-3-sket/261124-sav-REVIEW.md"
  - "src/workbench/DocSetLibrary.tsx"
  - "src/workbench/DocumentSetDetail.tsx"
  - "src/components/knowledge/DocumentSetForm.tsx"
  - "src/db/repositories/documentSetRepo.ts"
  - "src/workbench/virtual/VirtualizedList.tsx"
  - "tests/knowledge/documentSetHashes.test.ts"
  - "src/workbench/__tests__/DocsWorkspace.test.tsx"
  - "src/workbench/__tests__/DocumentSetDetailPublished.test.tsx"
behavior_unverified: 4
overrides_applied: 0
human_verification:
  - test: "Mở tab Bộ tài liệu trong Tauri/local với bộ có nhiều doc; quan sát rail trái, inspector phải, cuộn danh sách và toolbar lọc."
    expected: "Rail trái cố định 248px, inspector phải 260px, toolbar lọc dính đầu khi cuộn, cuộn mượt không phình DOM theo số doc."
    why_human: "Visual layout và cảm giác cuộn/độ mượt là runtime behavior; jsdom chỉ chứng minh DOM bị chặn ở <=25 row."
  - test: "Click vài doc khác nhau trong danh sách; gõ filter tên/đường dẫn, đổi sort, đổi Select trạng thái."
    expected: "Inspector hiện đúng doc được click; count filtered / total đổi theo filter; row chỉ có metadata, không lộ markdown/body."
    why_human: "Liên kết click → inspector và trải nghiệm filter là user flow, không thể chứng minh bằng grep hay DOM tĩnh."
  - test: "Bấm 'Thêm tài liệu' trong empty state và trong form; gõ search, chọn/bỏ chọn, thêm/gỡ/reorder member rồi Lưu thay đổi."
    expected: "Picker mở ra dạng danh sách phẳng searchable, không còn cây expand-all; thứ tự documentIds và UUID giữ nguyên sau save."
    why_human: "Luồng picker/reorder và cảm giác tìm kiếm với danh sách lớn cần tương tác thật trong Tauri."
  - test: "Mở bộ đã xuất bản; sửa nội dung 1 doc (đổi body và updatedAt) rồi quay lại tab."
    expected: "Lúc mở tab không nháy 'Có thay đổi cục bộ' giả; sau khi sửa doc đó hiện đúng trạng thái cục bộ, các doc khác không đổi."
    why_human: "Tính đúng của trạng thái xuất bản theo thời gian là real-time behavior qua liveQuery; test unit chỉ phủ cache và render đầu."
---

# Quick 261124-sav: Refactor bộ tài liệu theo 3 sketch — Verification Report

**Task Goal:** Refactor màn hình bộ tài liệu theo 3 sketch winner (002/A rail+inspector, 003/A virtual scroll+filter dính, 004/A inline progress+flat picker); xử lý lag khi bộ có nhiều docs: virtualize membership list, tách hash khỏi `notes.toArray()`, bỏ `Tree defaultExpandAll`.
**Verified:** 2026-11-24T14:37:24Z
**Status:** human_needed (mọi truth kỹ thuật VERIFIED; 4 hạng mục Tauri/UI cần sếp tự check)
**Re-verification:** No — initial verification (REVIEW.md có 7 findings, đã fix 6 + IN-01 out of scope)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rail trái 248px + danh sách giữa + inspector phải 260px, không tab/rail ngang | ✓ VERIFIED | `DocSetLibrary.tsx:95` `width: 248` trên `doc-set-library-list`; detail `flex:1; minWidth:0` (`:156`); inspector `<aside>` `width:260, flexShrink:0` (`DocumentSetDetail.tsx:974`). Không có tab/rail ngang mới. |
| 2 | Bộ nhiều doc cuộn mượt, toolbar lọc dính, danh sách virtual, DOM không tăng theo số docs | ✓ VERIFIED | Toolbar `position:'sticky', top:0, zIndex:5` (`:930`); `VirtualizedList items={filteredRows} estimateSize=38 height=440 overscan=4` (`:961`); test 60 doc assert `<= 25` row (`DocumentSetDetailPublished.test.tsx:71-73`, `DocsWorkspace.test.tsx:161-162`). |
| 3 | Mỗi row chỉ no/title/path/size/date/status, không markdown/snippet/Note.body | ✓ VERIFIED | `DocumentRowView` (`:109-147`) nhận `row: DocumentRow` gồm đúng các field đó; row không có `body`. Test `document.body.textContent` không chứa `'Nội dung bí mật'` (`DocumentSetDetailPublished.test.tsx:74`). Grepped: không `dangerouslySetInnerHTML`. |
| 4 | Click doc → inspector đúng doc; trạng thái xuất bản giữ nguyên | ✓ VERIFIED | `selectedDoc = rows.find((row) => row.id === selectedDocId)` (`:640`), inspector render selectedDoc (`:975-986`); `publishView` so sánh hash như cũ (`:279-291`); test không flash "Có thay đổi cục bộ" + "Đã đồng bộ" (`DocumentSetDetailPublished.test.tsx:85-113`), WR-02 delete-gated test (`:115-142`). |
| 5 | Hash chỉ cho doc thuộc bộ, cache theo (id, updatedAt[, length]), không hash lại mọi notes | ✓ VERIFIED | `computeNoteHashesCached(documents, hashCache.current)` (`:245-250`), deps `[db, set?.id, documentIdsKey, documents]`; helper duyệt đúng `notes` truyền vào (`documentSetRepo.ts:93-111`), cache do caller giữ, không module-global. `grep` không còn `formNotes.map`/`allNotes.toArray()` trong hash query. Test hit/invalidate/isolated + WR-03 (`documentSetHashes.test.ts:22-84`). |
| 6 | Picker flat searchable virtual, không Tree defaultExpandAll; membership virtualize | ✓ VERIFIED | `DocumentSetForm` dùng `forwardRef` + `useImperativeHandle` (`:69-95`), `flatDocs` lọc title/tags qua `foldForSearch`/`searchIncludes` (`:97-117`), picker `VirtualizedList` (`:550`), membership `VirtualizedList` (`:470`). Grepped: không `Tree`, không `defaultExpandAll`. Test form 23/23 pass. |
| 7 | Progress/lỗi/empty inline, action có thật, list vẫn click, không dependency mới, local/Tauri | ✓ VERIFIED | Banner Publishing inline gọi `handleReconcileAttempt()` (`:716-730`), không Progress giả; `reconciliationError` Alert (`:715`); graph Failed Alert có "Xây dựng lại toàn bộ" (`:790`); empty CTA `formRef.current?.openPicker()` (`:958`). `git diff 41aade77..HEAD -- package.json package-lock.json` rỗng. Handlers publish/graph giữ nguyên. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/workbench/DocSetLibrary.tsx` | Rail 248px, truyền setId vào detail | ✓ VERIFIED | 171 dòng; width 248; `<DocumentSetDetail setId={selectedId} db={db} />`. |
| `src/workbench/DocumentSetDetail.tsx` | Header/stats/toolbar virtual/inspector/inline status | ✓ VERIFIED | 1171 dòng; mọi hook mới trước `if (!set)` (`:578-641` vs `:642`); row `memo`; publish handlers nguyên vẹn. |
| `src/components/knowledge/DocumentSetForm.tsx` | Picker flat virtual + membership virtual, forwardRef | ✓ VERIFIED | 576 dòng; `openPicker()` expose; `save()` gửi `documentIds: members` (`:240`). |
| `src/db/repositories/documentSetRepo.ts` | `computeNoteHashesCached` caller-owned cache | ✓ VERIFIED | Helper tại `:93-111`; cache key gồm `updatedAt` + `body.length`; không đổi `computeSha256`/migration. |
| `src/workbench/__tests__/DocsWorkspace.test.tsx` | doc-row-* + count thay table/pagination | ✓ VERIFIED | Test `:149-173` assert 60 doc, <=25 row, count `60 / 60`, không `.ant-pagination`, sort mới nhất trước. |
| `tests/knowledge/documentSetHashes.test.ts` | Test cache hit/invalidate/isolated | ✓ VERIFIED | 84 dòng, 4 `it`, chạy xanh. |
| `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx` | Test bounded list + no body + no flash | ✓ VERIFIED | 143 dòng, 3 `it`, chạy xanh. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| DocSetLibrary | DocumentSetDetail | `setId` prop | ✓ WIRED | `DocSetLibrary.tsx:164`. |
| DocumentSetDetail | documentSetRepo | `computeNoteHashesCached(documents, hashCache.current)` | ✓ WIRED | `DocumentSetDetail.tsx:247`; không dùng `allNotes`. |
| DocumentSetDetail | VirtualizedList | `filteredRows`, 38/440/overscan 4 | ✓ WIRED | `:961-971`. |
| DocumentSetDetail | publishedContentHash | `noteHashes[documentId]` trong publishView | ✓ WIRED | `:286`. |
| DocumentSetDetail | DocumentSetForm | `formRef.current?.openPicker()` + `ref={formRef}` | ✓ WIRED | `:958`, `:733`. |
| DocumentSetForm | VirtualizedList | picker `flatDocs` + membership `members` | ✓ WIRED | `:550`, `:470`. |
| DocumentSetForm | `documentIds` | `documentIds: members` trong save | ✓ WIRED | `:240`; retained+added giữ UUID. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `DocumentSetDetail.tsx` doc list | `documents` → `rows` → `filteredRows` | `db.notes.bulkGet(set.documentIds)` → `useMemo` từ metadata + `noteHashes`/`publishData` | ✓ Có; hash từ body thật, status từ published metadata | ✓ FLOWING |
| `DocumentSetForm.tsx` picker | `flatDocs` | `notes` filtered + Map resolve path | ✓ Có; lọc title/tags thật, không đọc body | ✓ FLOWING |
| Inspector | `selectedDoc` | `rows.find(id === selectedDocId)` | ✓ Có; click row set state | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Hash cache hit/invalidate/isolated + publish flow | `npx vitest run tests/knowledge/documentSetHashes.test.ts tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1` | 2 files, 21 tests passed | ✓ PASS |
| Workbench virtual list + filter count + WR-02 no-flash | `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx --bail=1` | 3 files, 13 tests passed | ✓ PASS |
| Picker/membership + publish flow | `npx vitest run tests/knowledge/documentSetForm.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1` | 2 files, 23 tests passed | ✓ PASS |
| Type safety | `npx tsc --noEmit` | exit 0, không lỗi | ✓ PASS |

Mỗi scoped run báo 1 unhandled rejection `message.error is not a function` (IN-01) từ test harness thiếu `ThemeAppHolder` — đã xác nhận pre-existing, ngoài scope theo chỉ dẫn. Không chạy full Vitest suite.

### Probe Execution

Không có probe declared trong PLAN/SUMMARY; `find . -path '*/tests/probe-*.sh'` trống. SKIPPED.

### Review Fix Verification (WR-01..04, IN-02/IN-03)

| Finding | Claim fix | Actual code / diff | Status |
| ------- | --------- | ------------------ | ------ |
| WR-01 sort ngược | d5c03978 | `:637` `Date.parse(b.updatedAt) - Date.parse(a.updatedAt) \|\| b.no - a.no`; test assert row đầu `tài liệu 60` | ✓ FIXED |
| WR-02 `hashesReady` no-op | d42306f0 | `:276-278` trả `In sync` sớm khi chưa có hash; bỏ `hashesReady &&` thừa; test no-flash | ✓ FIXED |
| WR-03 cache stale body | 96245665 | cache Map `{updatedAt, length, hash}`; so `cached.length === note.body.length`; test WR-03 | ✓ FIXED |
| WR-04 Progress giả | cf29d7eb | banner chỉ còn text `Đã gửi N tài liệu · đang chờ Knowledge Server xác nhận`; `<Progress>` còn lại ở graph (có nguồn thật) | ✓ FIXED |
| IN-02 hằng số chết | 57c58272 | `DOC_SET_PAGE_SIZE` xóa; grep không còn | ✓ FIXED |
| IN-03 chip vô dụng | 57c58272 | `extFilter` và 2 `CheckableTag` xóa; grep không còn | ✓ FIXED |
| IN-01 `message.error` | out of scope | Vẫn tái hiện trong 3 scoped run; đúng chỉ dẫn "không fail task vì IN-01" | ✓ NOT A GAP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DOCSET-WORKBENCH-A | 261124-sav-PLAN.md | Rail 248/detail/inspector 260 | ✓ SATISFIED | Truth 1 + artifact DocSetLibrary/DocumentSetDetail |
| DOCSET-VIRTUAL-A | 261124-sav-PLAN.md | Virtual list + filter dính + picker/membership virtual | ✓ SATISFIED | Truth 2, 6 |
| DOCSET-HEAVY-A | 261124-sav-PLAN.md | Bộ lớn vẫn mượt, DOM không phình | ✓ SATISFIED | Truth 2 + scoped test 60 doc |
| DOCSET-HASH-CACHE | 261124-sav-PLAN.md | Hash cache caller-owned theo id/updatedAt | ✓ SATISFIED | Truth 5 + 4 unit test |

Không có requirement ID nào bị orphaned: 4 ID trong PLAN đều có implementation evidence. `.planning/REQUIREMENTS.md` không định nghĩa các ID này (quick task), không có mapped ID bị bỏ sót.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Debt marker (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) | ℹ️ Info | Grep trên 7 file modified: không có marker nào. |
| — | — | Stub / hardcoded empty | ℹ️ Info | Không có `return null`/`[]` giả ở luồng chính; empty state có CTA thật. |

`git diff 41aade77..HEAD` = 7 file đúng plan, không đụng `package.json`, `package-lock.json`, ROADMAP.md. Không dependency mới, không commit artifact planning.

### Human Verification Required

4 hạng mục đã liệt kê trong frontmatter `human_verification`. Tóm tắt ngắn:

1. **Layout + cuộn trong Tauri** — rail 248px, inspector 260px, toolbar dính, cuộn mượt với bộ lớn.
2. **Click/filter/sort → inspector + count** — user flow tương tác thật.
3. **Picker flat + reorder/save** — search, không tree, thứ tự UUID sau save.
4. **Publish state theo thời gian** — không flash lúc mở tab, đúng sau khi sửa 1 doc.

Lý do: visual appearance, cảm giác real-time/performance, và luồng tương tác không thể chứng minh bằng grep/DOM tĩnh. PLAN dòng 205 yêu cầu kiểm tra tay Tauri/local; SUMMARY ghi nhận chưa chạy browser/Tauri UAT.

### Gaps Summary

Không có gaps kỹ thuật. Tất cả 7 must-have truths, 7 artifacts, 7 key links, 6 review findings đều có evidence trong code và scoped test xanh. Status `human_needed` chỉ vì 4 hạng mục UI/Tauri cần sếp tự verify theo đúng quy định PLAN — không phải do implementation thiếu.

---

_Verified: 2026-11-24T14:37:24Z_
_Verifier: Claude (gsd-verifier)_
