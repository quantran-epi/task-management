---
phase: 25-interactive-sdlc-document-wizards
plan: 01
subsystem: docs
tags: [sdlc, docx, bank-templates, pl02, pl03b, pl07, cab]

requires: []
provides:
  - "Restored original bank DOCX templates in docs/pl-templates for PL02, PL03B, and PL07"
  - "Pinned exact archive, metadata, and persistence constants from P25-R01..R06 for downstream execution"
affects: [25-interactive-sdlc-document-wizards]

tech-stack:
  added: []
  patterns:
    - "Source DOCX authority verification via exact positive length and PK ZIP signature"
    - "Exact binary archive ceiling profile B (5MB compressed, 25MB expanded, 2MB entry, 256 entries)"
    - "Zero-migration persistence through optional DocumentSet.sdlc and Note.sdlcArtifact metadata"

key-files:
  created:
    - "docs/pl-templates/PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx"
    - "docs/pl-templates/PL03B-tokenization-CTM-TichHop.docx"
    - "docs/pl-templates/PL07-tokenization-ctm.docx"
    - ".planning/phases/25-interactive-sdlc-document-wizards/25-01-SUMMARY.md"
  modified: []

key-decisions:
  - "User confirmed original source DOCX bank templates as internal authority without synthetic re-creation."
  - "Pinned archive ceiling profile B: maxCompressedBytes=5_242_880, maxExpandedBytes=26_214_400, maxEntryBytes=2_097_152, maxEntries=256."
  - "Pinned meta.json schemas: commits as {sha:string,subject:string}[], files as {path:string,status:string}[] with status as non-empty bounded string."
  - "Pinned persistence mapping to optional DocumentSet.sdlc and Note.sdlcArtifact without adding new tables, indexes, or Dexie migrations."
  - "Pinned ChatMessage structured payload limit to 524_288 UTF-8 bytes and download copy policy to 'Đã bắt đầu tải' for direct anchors."

patterns-established:
  - "Template fidelity verification: pin SHA-256 and confirm ZIP header before any extraction or builder execution."
  - "Downstream constant inheritance: consume P25-R01..R06 directly without reopening decision gates."

requirements-completed: [WIZ-DOCX-01, WIZ-PACK-01, WIZ-LOOP-01]

duration: 12min
completed: 2026-10-28
---

# Phase 25 Plan 01: Template Source Authority & Resolved Constants Summary

**Khôi phục ba source bank DOCX nguyên bản PL02, PL03B, PL07 làm authority nội bộ và khóa nguyên văn constants archive/meta/persistence P25-R01..R06.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-28T13:52:32Z
- **Completed:** 2026-10-28T14:04:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Khôi phục nguyên vẹn 3 file DOCX ngân hàng vào `docs/pl-templates/` với đầy đủ kiểm tra kích thước dương, signature `PK`, và SHA-256 hash byte-identical giữa source checkout và worktree:
  - `PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx`: 303,986 bytes (`913b36aac459b7a8483fd61d0f39f40f6ae1ad58b588790170bf9fd34034b488`)
  - `PL03B-tokenization-CTM-TichHop.docx`: 1,913,336 bytes (`b93f67f9cecbd550f7b7c2ab7da6d5824b7ffd5d7e36cd8a4118d7668990bbf6`)
  - `PL07-tokenization-ctm.docx`: 48,244 bytes (`9ccbc967884ccf8b1e1010566a37f9f554227fbdb208761728e8f3ad320f0b94`)
- Người dùng xác nhận thẩm quyền bản gốc nội bộ qua checkpoint `human-action`, ngăn chặn hoàn toàn việc dùng tài liệu AI tái tạo.
- Khóa toàn bộ các hằng số quy chuẩn kỹ thuật theo `25-CONTEXT.md` (P25-R01..R06) cho các plan tiếp theo:
  - **P25-R01 (Archive profile B):** `maxCompressedBytes = 5_242_880`, `maxExpandedBytes = 26_214_400`, `maxEntryBytes = 2_097_152`, `maxEntries = 256`.
  - **P25-R02 (Meta shape):** `meta.json.commits` = `{sha:string, subject:string}[]`, `meta.json.files` = `{path:string, status:string}[]` với `status` là non-empty bounded string.
  - **P25-R03 (Persistence):** `DocumentSet.sdlc = {projectId, purpose: 'sdlc'}` và `Note.sdlcArtifact`; canonical Markdown/export payload lưu tại Note liên kết Project; không thêm table, index hay migration Dexie.
  - **P25-R04 (Payload cap):** Render/export payload trong `ChatMessage` tối đa `524_288` UTF-8 bytes.
  - **P25-R05 (Download copy):** Direct anchor chỉ hiển thị `Đã bắt đầu tải`; thông báo full `Đã tải {filename} và lưu thành tài liệu dự án.` chỉ kích hoạt khi save picker và Note save hoàn tất.
  - **P25-R06 (Requirements scope):** 6 requirement IDs WIZ tuân thủ đúng định nghĩa ROADMAP Phase 25.

## Task Commits

1. **Task 1: Khôi phục ba source bank DOCX nguyên bản** - `a4d4c64` (feat)
2. **Task 2: Pin resolved archive/meta/persistence constants into execution summary** - Committed in plan completion documentation.

## Files Created/Modified

- `docs/pl-templates/PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx` - Source authority PL02
- `docs/pl-templates/PL03B-tokenization-CTM-TichHop.docx` - Source authority PL03B
- `docs/pl-templates/PL07-tokenization-ctm.docx` - Source authority PL07
- `.planning/phases/25-interactive-sdlc-document-wizards/25-01-SUMMARY.md` - Execution summary và resolved constants

## Decisions Made

- Người dùng xác nhận thẩm quyền trực tiếp từ nguồn ngân hàng tại repo gốc, cho phép copy nguyên trạng vào worktree để phục vụ trích xuất layout ở Plan 25-02.
- Giữ nguyên các hằng số kỹ thuật từ `25-CONTEXT.md` mà không mở lại bất kỳ decision checkpoint nào khác.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Trạng thái ban đầu thiếu 3 file DOCX trong worktree agent (`agent-a80028b70d7b70579`). Dừng tại checkpoint human-action theo đúng thiết kế, nhận xác nhận thẩm quyền nguồn từ người dùng và sao chép byte-identical an toàn.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ba template authority đã sẵn sàng trong worktree cho Plan 25-02 thực hiện trích xuất OOXML, tính toán hash, và kiểm tra baseline.
- Toàn bộ hằng số profile B, payload cap và persistence metadata đã cố định.

## Self-Check: PASSED

- All 3 source DOCX files verified on disk with PK signatures and matching SHA-256 hashes.
- Commit a4d4c64 confirmed in git log.
- Resolved constants verified from 25-CONTEXT.md.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Completed: 2026-10-28*
