---
id: 261122-uha
slug: t-o-database-explorer-cho-oracle-trong-w
title: Database Explorer cho Oracle trong Workbench
date: 2026-11-22
status: completed
type: execute
scope: Workbench Tauri desktop. SELECT-only query editor + virtualized grid + Excel export, lazy schema tree, source/DDL viewer, AI dùng lại oracle_describe mở rộng. Không đụng PWA/GitHub Pages, không thêm dependency, không đụng repo gốc.

key-files:
  created:
    - src/workbench/toolwindows/DatabaseExplorer.tsx
    - src/workbench/editor/OracleObjectViewer.tsx
    - src/workbench/editor/OracleSqlComposer.tsx
    - src/workbench/__tests__/OracleSqlComposer.test.tsx
    - src/components/common/__tests__/DiffSyntaxHighlighter.sql.test.ts
  modified:
    - src/types/oracleSqlcl.ts
    - src/services/ai/oracleSqlclService.ts
    - src/services/ai/aiTools.ts
    - src/utils/dynamicFileSandbox.ts
    - src/components/common/DiffSyntaxHighlighter.tsx
    - src/workbench/store/layoutStore.ts
    - src/workbench/WorkbenchLayout.tsx
    - src/workbench/toolwindows/LeftToolWindow.tsx
    - src/workbench/EditorArea.tsx

key-decisions:
  - "SQLcl directive + multi-statement bị chặn trước khi dựng script; object identifier/type đi qua whitelist trước khi nội suy."
  - "Mọi stdout/stderr/error đi qua redactOracleText; connectionString/password không bao giờ vào payload AI, UI, log hay tab params."
  - "Grid 1000 dòng / 2000 ký tự mỗi cell / ~500KB payload, viewer 5000 dòng + 200000 ký tự; cả hai đều ảo hóa."
  - "Tree cache theo node key; schema-wide ALL_OBJECTS query một lần rồi partition theo whitelist thay vì 14 query cho 14 type group."
  - "AI oracle_describe giữ nguyên tên tool, chỉ mở rộng enum action + params; gate/catalog không đổi."
---

# Database Explorer cho Oracle trong Workbench

Database Explorer hoạt động end-to-end trong workbench Tauri: cây schema lazy, query SELECT-only có hủy, viewer source/DDL ảo hóa, Excel export từ grid thật.

## Performance

- **Tasks:** 3/3
- **Files modified:** 17
- **Tests:** 9 focused files, 89 tests passed
- **Lint:** clean
- **Build:** clean

## Task Commits

1. **Task 1 — Service + export/tokenizer foundation** — `5310f520`
2. **Task 2 — Workbench shell** — `ed4829a6`
3. **Task 3 — Tree + viewer + composer** — `efae34ca`
4. **Review fixes — RCE heredoc/literal/gutter/cache/cancel** — `4c19629a`
5. **Search chuẩn fold tiếng Việt** — `9031b5a6`
6. **Review final — regression guard + search global** — `5cf19cb4`

## Kiểm tra đã chạy

- `npx vitest run` với 6 file focused sau review: 64 tests passed (bổ sung regression cho literal SQL, heredoc, fold search, PL/SQL guard, trailing comment)
- `npm run lint`: clean
- `npm run build`: thành công (chỉ cảnh báo chunk size/dynamic import có sẵn)
- Review độc lập 3 vòng: 2 CRITICAL + 3 HIGH + các MEDIUM/LOW đã đóng; verify cuối xác nhận không còn issue đáng sửa.

## Files Created/Modified

- `src/types/oracleSqlcl.ts` — action enum mở rộng, payload typed cho query/metadata
- `src/services/ai/oracleSqlclService.ts` — guard SQLcl, whitelist, redaction, metadata actions, grid cap
- `src/services/ai/aiTools.ts` — cập nhật definition `oracle_describe`
- `src/utils/dynamicFileSandbox.ts` — `generateXlsxBlobFromGrid` (chặn formula injection)
- `src/components/common/DiffSyntaxHighlighter.tsx` — tokenizer Oracle + `language="sql"`
- `src/workbench/store/layoutStore.ts` — 2 viewType center tab (additive)
- `src/workbench/WorkbenchLayout.tsx` — stripe item dưới `remote_explorer`
- `src/workbench/toolwindows/LeftToolWindow.tsx` — host Database Explorer
- `src/workbench/EditorArea.tsx` — dispatch 2 tab mới
- `src/workbench/toolwindows/DatabaseExplorer.tsx` — cây lazy/cache/search, search global (raw + fold) theo chuẩn `src/utils/searchText.ts`
- `src/workbench/editor/OracleObjectViewer.tsx` — source/DDL/columns viewer ảo hóa
- `src/workbench/editor/OracleSqlComposer.tsx` — query editor, hủy callId, grid, export
- Tests: `oracleSqlclService.test.ts`, `dynamicFileSandbox.test.ts`, `DatabaseExplorer.test.tsx`, `OracleSqlComposer.test.tsx`, `DiffSyntaxHighlighter.sql.test.ts`

## Dev/Live Verify

Không chạy UAT trình duyệt trong worktree này theo phạm vi quick task. Kiểm tra bằng focused Vitest + lint + build + review source.
