---
phase: quick
plan: 261124-sav
subsystem: workbench-docsets
tags: [docset, virtual-list, hash-cache, picker]
dependency_graph:
  requires: []
  provides: [DOCSET-WORKBENCH-A, DOCSET-VIRTUAL-A, DOCSET-HEAVY-A, DOCSET-HASH-CACHE]
  affects: [src/workbench/DocumentSetDetail.tsx, src/components/knowledge/DocumentSetForm.tsx]
tech_stack:
  added: []
  patterns: [VirtualizedList (@tanstack/react-virtual), useImperativeHandle, caller-owned Map cache]
key_files:
  created:
    - tests/knowledge/documentSetHashes.test.ts
  modified:
    - src/db/repositories/documentSetRepo.ts
    - src/workbench/DocumentSetDetail.tsx
    - src/workbench/DocSetLibrary.tsx
    - src/components/knowledge/DocumentSetForm.tsx
    - src/workbench/__tests__/DocumentSetDetailPublished.test.tsx
    - src/workbench/__tests__/DocsWorkspace.test.tsx
decisions:
  - Cache hash là Map do caller giữ, key (id, updatedAt); không module-global
  - Detail chỉ hash documents của bộ đang xem; publishView giữ logic cũ
  - Row/badge dùng nhãn rút gọn để không lặp text trạng thái header trong test/DOM
  - Picker/membership dùng VirtualizedList có sẵn, không Tree/defaultExpandAll
metrics:
  duration: ~22 phút
  completed_date: 2026-11-24
  tasks_completed: 3
  files_modified: 7
---

# Phase Quick Plan 261124-sav: Refactor bộ tài liệu theo 3 sketch Summary

Rail trái 248px + inspector phải 260px, danh sách doc virtual metadata-only với filter dính, picker flat searchable và hash cache theo `(id, updatedAt)` — publish state và thứ tự UUID không đổi.

## Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 | `408bbb97` | feat(261124-sav): tách hash khỏi full note scan |
| 2 | `5181f3e1` | refactor(261124-sav): workbench rail + virtual docs |
| 3 | `2dae5345` | refactor(261124-sav): picker flat virtual |
| Fix | `50e4f0a1` | fix(261124-sav): resolve path tài liệu qua Map, bỏ find lặp |

## Implementation

- Task 1 (TDD): viết `tests/knowledge/documentSetHashes.test.ts` trước, chạy đỏ (`computeNoteHashesCached is not a function`), implement `computeNoteHashesCached` trong `documentSetRepo.ts`, chạy xanh. `DocumentSetDetail` thay liveQuery hash từ `formNotes` sang `documents` với `hashCache` ref; giữ `formNotes` cho form/preview. `publishView` giữ nguyên so sánh `noteHashes[documentId]`; thêm `hashesReady` để chặn trạng thái "Local changes" giả trong lúc hash query khởi tạo.
- Task 2: rail `doc-set-library-list` 248px; detail thêm toolbar sticky (search tên/đường dẫn, Select trạng thái, Select sort, CheckableTag `.md`/`.docx`, count `filtered / total`), `VirtualizedList` 38px/440px/overscan 4, row `React.memo` module-scope chỉ nhận metadata, inspector 260px, banner publishing inline giữ action `handleReconcileAttempt`, empty-state CTA qua `formRef.current?.openPicker()`. Mọi hook mới đặt trước `if (!set)`. Test WR-02 giữ nguyên; test mới seed 60 docs, assert ≤25 row, không chứa body; `DocsWorkspace.test.tsx` đổi từ table/pagination sang `doc-row-*` + count (theo đúng chỉ dẫn dòng 147 của plan).
- Task 3: `DocumentSetForm` chuyển `forwardRef`, expose `openPicker()`, xóa toàn bộ treeData/treeCheckedKeys/handleTreeCheck/Tree; `flatDocs` lọc title/tags bằng `foldForSearch`/`searchIncludes`, path resolve qua Map 20 cấp; picker và membership dùng `VirtualizedList`; payload `documentIds: members` giữ thứ tự.

## Verification

- `npx vitest run tests/knowledge/documentSetHashes.test.ts tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1` — 20/20 pass.
- `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx --bail=1` — 12/12 pass.
- `npx vitest run tests/knowledge/documentSetForm.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx --bail=1` — 23/23 pass.
- `npx tsc --noEmit` — sạch.
- Không chạy full Vitest suite (quy tắc dự án). Không chạy browser/Tauri UAT trong quick task này.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Publish state "Đã đồng bộ" chuyển thành "Có thay đổi cục bộ" khi hash query khởi tạo**
- **Found during:** Task 1
- **Issue:** `useLiveQuery` trả default `{}` trong render đầu; hash thật có sau một tick Dexie, làm `publishView` so sánh nhầm và gán `Local changes`.
- **Fix:** thêm `hashesReady = documents.length === 0 || Object.keys(noteHashes).length === documents.length`; `hashesMatch` chỉ xét khi hash đã sẵn sàng.
- **Files modified:** `src/workbench/DocumentSetDetail.tsx`
- **Commit:** `408bbb97`

**2. [Rule 1 - Bug] Trùng text trạng thái "Đã đồng bộ" trong DOM**
- **Found during:** Task 3
- **Issue:** header tag + 2 row status tag cùng chữ làm `screen.getByText('Đã đồng bộ')` của publish-flow test tìm thấy nhiều element.
- **Fix:** row/inspector dùng `STATUS_SHORT` (`Đồng bộ`, `Có thay đổi`, `Chưa XB`, `Đang XB`), header giữ nhãn đầy đủ từ `STATE_UI`. Trạng thái vẫn đúng theo yêu cầu.
- **Files modified:** `src/workbench/DocumentSetDetail.tsx`
- **Commit:** `2dae5345`

**3. [Rule 2 - Mitigation] Path resolve dùng `allNotes.find()` mỗi cấp**
- **Found during:** final scan (T-SAV-05)
- **Issue:** plan yêu cầu Map xây một lần; bản đầu detail dùng `find()` trong vòng 20 cấp.
- **Fix:** xây `notesById = new Map(allNotes...)` once, walk cha qua Map.
- **Files modified:** `src/workbench/DocumentSetDetail.tsx`
- **Commit:** `50e4f0a1`

## Known Stubs

Không có stub mới. Empty-state CTA và banner progress gọi handler/href có thật (`openPicker`, `handleReconcileAttempt`, `#/settings`).

## Threat Flags

Không có surface mới ngoài `<threat_model>`: không endpoint, không auth path, không schema change. Render title/path bằng `Text`/`Tag`, không `dangerouslySetInnerHTML`; row không nhận `Note.body`.

## Ghi chú

- Ba scoped chạy đều báo 1 unhandled rejection `message.error is not a function` từ test cũ (`DocumentSetPublishFlow` / `DocsWorkspace`), đã xác nhận có trên baseline HEAD trước khi sửa — ngoài scope quick task này.
- Không dependency mới, không đụng PWA/GitHub Pages, không commit artifact planning, không sửa ROADMAP.md.

## Self-Check: PASSED

- 8/8 file tồn tại.
- 4/4 commit tồn tại trong git history.
- Scoped tests và `tsc --noEmit` xanh.
