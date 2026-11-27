---
phase: 261127-ts3
plan: 01
subsystem: ui-links
tags: [cr-detail, task-insight, named-links, zod, browser-verified]
requires:
  - phase: 261127-c3r
    provides: "named links model {name,url} on CR and Task with link.name || link.url render fallback"
  - phase: 261127-qrn
    provides: "unified named links surface and openDocumentLink handling in both detail views"
provides:
  - "Inline quick-create row in CR detail Links block — writes straight to cr.links via appendChangeRequestLink"
  - "Inline quick-create row in Task insight Links block — visible even with zero links, writes via appendTaskLink"
  - "namedLinkSchema accepts empty name while linkSchema URL trust boundary stays unchanged"
affects: [cr-detail, item-insight, backup-schema-compatibility]
tech-stack:
  added: []
  patterns:
    - "Inline create row beside existing link chips; no modal or drawer opened"
    - "isValidLinkUrl(url.trim()) at handler boundary before every repo write"
key-files:
  created:
    - .planning/quick/261127-ts3-th-m-quick-create-link-tr-c-ti-p-tr-n-cr/261127-ts3-SUMMARY.md
  modified:
    - src/validation/schemas.ts
    - src/db/repositories/changeRequestRepo.ts
    - src/db/repositories/taskRepo.ts
    - src/db/repositories/__tests__/namedQuickLinks.test.ts
    - src/views/ChangeRequestDetailView.tsx
    - src/views/ItemInsightView.tsx
    - tests/views/ChangeRequestDetailView.test.tsx
    - tests/views/ItemInsightView.test.tsx
key-decisions:
  - "namedLinkSchema.name chỉ bỏ min(1); giữ trim().max(80) để khớp backupSchemas.ts và row migrate sẵn có; LINK_NAME_MAX_LENGTH dùng chung cho schema, input maxLength và handler guard"
  - "Cả 2 handler validate URL bằng isValidLinkUrl sau trim, rồi gọi append*Link — repo đọc lại row trong transaction rồi concat, tránh stale snapshot ghi đè link writer khác; cr/task lấy từ useLiveQuery nên stats và link chips tự cập nhật"
  - "ItemInsight mở rộng điều kiện render Links cho task ngay cả khi chưa có link; CR/system giữ nguyên render cũ, không có dòng quick create"
patterns-established:
  - "Quick-create inline trên detail view: state cục bộ cho ô nhập, repo là nguồn ghi duy nhất, message qua useMessage"
requirements-completed: []
coverage:
  - id: R1
    description: "CR detail quick create lưu name rỗng và có tên; URL sai không ghi; form Chỉnh sửa không mở"
    verification:
      - kind: unit
        ref: "tests/views/ChangeRequestDetailView.test.tsx#adds a link with an empty name straight into cr.links and labels it with the URL"
        status: pass
      - kind: unit
        ref: "tests/views/ChangeRequestDetailView.test.tsx#adds a named link and shows the name with the URL as tooltip"
        status: pass
      - kind: unit
        ref: "tests/views/ChangeRequestDetailView.test.tsx#rejects an unsafe URL without writing to cr.links"
        status: pass
    human_judgment: false
  - id: R2
    description: "Task insight quick create hiện cả khi task chưa có link; URL sai không ghi; CR/system không regress"
    verification:
      - kind: unit
        ref: "tests/views/ItemInsightView.test.tsx#adds a link with an empty name to a task with no existing links and labels it with the URL"
        status: pass
      - kind: unit
        ref: "tests/views/ItemInsightView.test.tsx#adds a named link and shows the name on task insight"
        status: pass
      - kind: unit
        ref: "tests/views/ItemInsightView.test.tsx#rejects an unsafe URL without writing to task.links"
        status: pass
      - kind: unit
        ref: "tests/views/ItemInsightView.test.tsx#keeps legacy CR links visible without rendering a task-only quick create row"
        status: pass
    human_judgment: false
  - id: R3
    description: "Schema chấp nhận name rỗng, vẫn chặn name >80 và URL unsafe; backup v14 đọc được"
    verification:
      - kind: unit
        ref: "src/db/repositories/__tests__/namedQuickLinks.test.ts#accepts empty names but rejects overlong names and unsafe URLs"
        status: pass
      - kind: unit
        ref: "src/db/repositories/__tests__/namedQuickLinks.test.ts#backup envelope normalizes legacy links and round-trips v14"
        status: pass
    human_judgment: false
  - id: R4
    description: "Chrome light/dark: dòng quick create đúng chỗ, thêm link có tên/không tên, click link đúng đích, URL sai không ghi"
    verification:
      - kind: manual_browser
        ref: "Chrome MCP trên http://127.0.0.1:5173/task-management/: CR detail quick-create row và link lưu đúng; dark-mode input contrast kiểm tra qua computed style"
        status: pass
    human_judgment: true
  - id: R5
    description: "Review fixes: name >80 không rơi vào catch chung, append không mất link writer khác"
    verification:
      - kind: unit
        ref: "src/db/repositories/__tests__/namedQuickLinks.test.ts#append helpers keep links written since the caller last read the row"
        status: pass
      - kind: unit
        ref: "src/db/repositories/__tests__/namedQuickLinks.test.ts#append helpers reject invalid links without writing"
        status: pass
    human_judgment: false
metrics:
  duration: "~25 phút (21:35–22:00)"
  completed_date: "2026-11-27"
  tasks: 2
  commits: 3
  tests: "43 scoped tests pass; npx tsc --noEmit clean; npx eslint clean"
---

# Phase 261127-ts3: Thêm link nhanh trên CR detail và Task detail — Summary

Thêm một dòng tạo link ngay mục Links của CR detail và Task insight: nhập Tên (tùy chọn) + URL, bấm "Thêm link" là ghi thẳng vào `cr.links` / `task.links` sau khi validate URL.

## Implementation

- `src/validation/schemas.ts`: `namedLinkSchema.name` bỏ `min(1)`, giữ `trim().max(80)` với `LINK_NAME_MAX_LENGTH` dùng chung; `linkSchema` và `isValidLinkUrl` giữ nguyên.
- `src/views/ChangeRequestDetailView.tsx`: ô `cr-detail-link-name`, `cr-detail-link-url`, nút `cr-detail-link-add` trong block Links; handler gọi `appendChangeRequestLink` rồi xóa 2 ô; không mở `ChangeRequestModal`.
- `src/views/ItemInsightView.tsx`: cùng dòng `item-insight-link-*` chỉ khi `itemType === 'task'`; block Links hiện ngay cả khi task chưa có link; handler gọi `appendTaskLink`; không mở `TaskDrawer`.
- `src/db/repositories/changeRequestRepo.ts`, `taskRepo.ts`: `appendChangeRequestLink` / `appendTaskLink` validate link rồi đọc lại row trong transaction và concat; không dựa vào snapshot `links` của view.
- Không đổi model, Dexie version, backup schema version; không dependency mới; component/icon lấy từ `src/components/ui`.

## TDD Gates

- Task 1: RED (`cr-detail-link-url` chưa tồn tại) → GREEN (32 tests pass) → commit `test` gộp trong task commit do plan yêu cầu atomic `fix(...)`; assertion test được chỉnh đúng accessible name của AntD button trong cùng task.
- Task 2: RED (`item-insight-link-url` chưa tồn tại) → GREEN (9 tests pass).

## Verification

- `npx vitest run tests/views/ChangeRequestDetailView.test.tsx tests/views/ItemInsightView.test.tsx src/db/repositories/__tests__/namedQuickLinks.test.ts --bail=1` — 43 passed.
- `npx tsc --noEmit` — clean.
- `npx eslint` trên toàn bộ file đụng — clean.
- Chrome MCP trên `http://127.0.0.1:5173/task-management/`: CR detail hiện đúng dòng quick create; thêm link "Runbook" ghi `{name:'Runbook', url:'https://example.com/runbook'}`; URL `javascript:alert(1)` không làm tăng `cr.links`; light/dark input contrast kiểm tra qua computed style (`rgb(23,29,39)` trên `rgb(17,21,29)`). Seed UAT đã dọn sau verify.

## Deviations from Plan

- **Điều chỉnh test — accessible name của Button AntD (Rule 1)**: plan mô tả nút link hiện URL/"Runbook" làm nhãn. AntD thêm icon `link` vào accessible name nên assertion dùng `link ${label}`; text hiển thị và `title={link.url}` vẫn đúng. Sửa trong `tests/views/ChangeRequestDetailView.test.tsx`, commit `53276fea`.
- **Review fixes (sau execute, commit `db58092d`)**: thêm `LINK_NAME_MAX_LENGTH` + `maxLength` trên Input + guard trước write để name >80 không rơi vào catch chung; thay read-modify-write trong 2 view bằng `append*Link` đọc lại row trong transaction để không ghi đè link từ writer khác (document link, tab khác). Không đổi schema/version/dependency.
- Không có deviation kiến trúc khác; không thêm file, dependency, schema version.

## Known Stubs

None. Các `placeholder=` là AntD input placeholder thật, không phải stub dữ liệu.

## Threat Flags

None. URL và độ dài tên đi qua validation trước mọi ghi (`isValidLinkUrl(url.trim())` ở view, `namedLinkSchema.parse` ở repo append); nhãn link vẫn render text React + `title={link.url}`, không `innerHTML`; threat register T-261127ts3-01/02/03/SC giữ nguyên.

## Review

- Reviewer chạy sau execute: 2 warning WR-01 (name >80 dead-end) và WR-02 (stale-array overwrite) — cả hai đã fix, có unit test regression, scope test lại 43 pass.

## Commits

- `53276fea` — `fix(261127-ts3): cho phép tên link rỗng và thêm quick create trên CR detail`
- `25b98c7e` — `fix(261127-ts3): thêm quick create link trên task insight`
- `db58092d` — `fix(261127-ts3): harden quick create link name and append atomically`

## Self-Check: PASSED

- Files tồn tại: `src/validation/schemas.ts`, `src/db/repositories/changeRequestRepo.ts`, `src/db/repositories/taskRepo.ts`, `src/db/repositories/__tests__/namedQuickLinks.test.ts`, `src/views/ChangeRequestDetailView.tsx`, `src/views/ItemInsightView.tsx`, `tests/views/ChangeRequestDetailView.test.tsx`, `tests/views/ItemInsightView.test.tsx`.
- Commits `53276fea`, `25b98c7e`, `db58092d` tồn tại trên `pre-v1.6-baseline`.
- Không có file bị xóa bởi task này; ROADMAP.md không bị chỉnh; docs artifacts không được commit.
- Tại thời điểm self-check có thay đổi từ task khác (`src-tauri/src/sqlcl_pty_debug.rs`, `src-tauri/src/ssh_pool.rs`, `.planning/quick/261127-u5w-.../`) — không thuộc plan này, không đụng vào.
