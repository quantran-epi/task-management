---
phase: 261122-w9j
plan: 01
subsystem: workbench developer utility tools
tags: [workbench, utility-tools, regex, jwt, hash, cron]
dependency_graph:
  requires: []
  provides: [developer-utility-tools-12]
  affects: [ToolExplorerPanel, EditorArea, UtilityToolPanel]
tech_stack:
  added: []
  patterns: [pure helpers, zustand session content store, dayjs, Web Crypto]
key_files:
  created:
    - src/workbench/toolwindows/utilityToolHelpers.ts
    - src/workbench/__tests__/utilityToolHelpers.test.ts
  modified:
    - src/workbench/toolwindows/utilityToolContentStore.ts
    - src/workbench/toolwindows/UtilityToolPanel.tsx
    - src/workbench/toolwindows/utilityTools.tsx
    - src/workbench/toolwindows/ToolExplorerPanel.tsx
    - src/workbench/toolwindows/UtilityToolAIAssistant.tsx
    - src/workbench/store/layoutStore.ts
    - src/workbench/EditorArea.tsx
    - src/workbench/__tests__/ToolExplorerPanel.test.tsx
decisions:
  - Không thêm dependency: cron tự implement, crypto dùng Web Crypto native, date dùng dayjs có sẵn.
  - Regex giới hạn input 100.000 ký tự và 200 match thay vì Worker để giữ UI đơn giản.
  - JWT chỉ decode header/payload, bỏ qua signature, kèm cảnh báo UI "không dùng để xác thực token".
  - dateToTimestamp chuẩn hóa về đầu ngày UTC để kết quả không đổi theo timezone máy.
  - HashUuidPanel dùng seqRef generation counter để bỏ kết quả async cũ khi input đổi.
metrics:
  duration: ~8 phút
  completed: 2026-11-22
---

# Phase 261122-w9j Plan 01: Developer Utility Tools Expansion Summary

Mở rộng Tool Explorer từ 4 lên 12 tool chia 5 nhóm, mỗi tool có panel riêng, state giữ qua đổi tab và AI assistant riêng — không dependency mới.

## Commits

| Task | Commit | Nội dung |
|------|--------|----------|
| 1 | `7234ce4b` | 12 pure helper + 19 unit test |
| 2 | `89b072f9` | DevToolContent + 8 panel + 8 EditorViewType |
| 3 | `9b216486` | Registry, grouping, tab wiring, AI names, test |

## Verification

- `npx vitest run src/workbench/__tests__/utilityToolHelpers.test.ts --bail=1 --reporter=dot` — 19 pass.
- `npx vitest run src/workbench/__tests__/ToolExplorerPanel.test.tsx src/workbench/__tests__/utilityToolHelpers.test.ts --bail=1 --reporter=dot` — 22 pass.
- `npx tsc --noEmit` — sạch.
- `npx eslint <10 file thay đổi>` — sạch.
- Grep `cron-parser|jsonwebtoken|jose|from .uuid.` — rỗng.
- Diff không chứa `package.json`, `package-lock.json`, `knowledge-server/`, `src/workbench/search/find/*`.
- Chrome verify (2026-11-22): 12 tool/5 nhóm hiện đúng; Regex `(a+)+$` + 1000 ký tự bị worker timeout chặn, UI responsive; Date Calculation default "Cộng 1 ngày" → 2024-01-11 đúng; AI modal mở đúng tên tool.

## Review fixes (commit 1fbed59e)

Reviewer độc lập tìm 1 critical, 2 high, 7 medium/low — đã fix hết:
- CR-01 ReDoS: regex chạy trong Worker (`regexWorker.ts`) với timeout 1s terminate (trước đó `(a+)+$` treo >120s).
- HI-01 date default `''` bị hiểu thành subtract/ms; HI-02 Copy Output trống ở 6/8 tool (dùng computed output).
- MD-01 ngày không tồn tại (2024-02-30) bị chấp nhận; MD-02 encoder lỗi bị nuốt; MD-03 cron day-of-month/day-of-week dùng AND thay vì OR; MD-04 "Dùng now" ghi ms vào đơn vị giây; MD-05 đổi thuật toán hash không hủy async cũ; MD-06 cron 29/02 ngoài 366 ngày; MD-07 delimiter AI injectable + JWT credential gửi AI không cảnh báo.
- LO-01 flags `d`/`v`, HTML numeric entity; LO-02 JWT exp quá lớn; LO-03 dead state.
- AI tool-awareness (yêu cầu bổ sung của sếp): `buildMessages` nhận `toolId`, mỗi tool có `TOOL_CONTENT_CONTEXTS` riêng — "thêm header" trong Markdown được hiểu đúng; delimiter CONTENT/CONTEXT được escape chống injection; có 2 test chứng minh.
- 39/39 scoped tests pass, tsc/eslint sạch, `npm run build` sạch và `regexWorker-*.js` có trong dist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Old ToolExplorer test dùng selector AntD 4**
- **Found during:** Task 3
- **Issue:** `input.closest('.ant-input-search')` trả null với `SearchInput` hiện tại (AntD 6 dùng `.ant-input-affix-wrapper`); test đã fail ngay ở base HEAD `ea492721`, trước mọi thay đổi.
- **Fix:** đổi selector sang `.ant-input-affix-wrapper`, thay assertion `max-width` inline bằng kiểm tra lớp `css-var-root` + wrapper.MAX 100%. Chưa sửa logic search hay markup production.
- **Files modified:** `src/workbench/__tests__/ToolExplorerPanel.test.tsx`
- **Commit:** `9b216486`

**2. [Rule 1 - Bug] dateToTimestamp phụ thuộc timezone máy**
- **Found during:** Task 1
- **Issue:** `dayjs(dateStr).startOf('day').valueOf()` trả 57.600.000 cho `1970-01-02` máy UTC+7, test kỳ vọng UTC.
- **Fix:** parse `${dateStr}T00:00:00.000Z` — epoch cố định mọi máy.
- **Files modified:** `src/workbench/toolwindows/utilityToolHelpers.ts`
- **Commit:** `7234ce4b`

**3. [Rule 2 - Critical] Defaults cho select control**
- **Found during:** Task 2
- **Issue:** `DevToolContent` khởi tạo `option:''`, `option2:''` khiến select uncontrolled mismatch.
- **Fix:** fallback `|| 'encode' | 'base64' | 'ms' | 'add' | 'day' | 'upper' | 'SHA-256'` trong panel; helper cũng fallback tương ứng.
- **Files modified:** `src/workbench/toolwindows/UtilityToolPanel.tsx`, `utilityToolHelpers.ts`
- **Commit:** `89b072f9`

## Known Stubs

Không có.

## Threat Flags

Không có surface mới ngoài `<threat_model>`: không network endpoint, không luồng AI mới, không schema thay đổi.

## Self-Check: PASSED

- 11 file tồn tại, 3 commit xác nhận trong git history.
- Scoped vitest 22/22 pass; `tsc --noEmit` và eslint sạch.
