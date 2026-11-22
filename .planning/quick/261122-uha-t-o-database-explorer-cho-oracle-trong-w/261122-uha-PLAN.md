---
id: 261122-uha
slug: t-o-database-explorer-cho-oracle-trong-w
title: Database Explorer cho Oracle trong Workbench
date: 2026-11-22
status: planned
scope: Workbench Tauri desktop. SELECT-only query editor + virtualized grid + Excel export, lazy schema tree, source/DDL viewer, AI dùng lại oracle_describe mở rộng. Không đụng PWA/GitHub Pages, không thêm dependency, không đụng repo gốc.
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/types/oracleSqlcl.ts
  - src/services/ai/oracleSqlclService.ts
  - src/services/ai/aiTools.ts
  - src/utils/dynamicFileSandbox.ts
  - src/components/common/DiffSyntaxHighlighter.tsx
  - src/workbench/store/layoutStore.ts
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/toolwindows/LeftToolWindow.tsx
  - src/workbench/EditorArea.tsx
  - src/workbench/toolwindows/DatabaseExplorer.tsx
  - src/workbench/editor/OracleObjectViewer.tsx
  - src/workbench/editor/OracleSqlComposer.tsx
  - src/services/ai/__tests__/oracleSqlclService.test.ts
  - src/services/ai/__tests__/oracleMultiConnection.test.ts
  - src/utils/__tests__/dynamicFileSandbox.test.ts
  - src/workbench/__tests__/DatabaseExplorer.test.tsx
must_haves:
  truths:
    - "Left stripe có item Database Explorer NGAY DƯỚI Remote Git Explorer; click mở schema browser tree trong left docked panel của LeftToolWindow"
    - "Click object (source/DDL) hoặc nút SQL composer mở tab ở center EditorArea, KHÔNG dùng Modal/Drawer; mở nhiều object/source cùng lúc tạo nhiều tab độc lập"
    - "Query editor chỉ chạy SELECT/WITH/EXPLAIN; multi-statement, SQLcl directive sau ';' và mọi DML/DDL bị chặn trước khi dựng script; ROWNUM limit <= 1000"
    - "Schema/object/filter đi qua safeOracleIdentifier hoặc quote helper có test; object type nằm trong whitelist; không có connectionString/password/SSH secret trong UI, log, AI prompt, tool result, backup"
    - "Mọi stdout/stderr/error từ SQLcl đi qua redactConnectionSecrets; ORA-/SP2- hiện rõ; cancel dùng callId/cancelToolCall có sẵn"
    - "Tree lazy load theo connection → schema → nhóm OBJECT_TYPE → object; cache theo connection/schema/type; search debounce + limit; grid result và code line đều ảo hóa"
    - "Excel export dùng grid columns+rows thật, không convert qua text grid; tên file đã sanitize; giới hạn rows/cells"
    - "AI oracle_describe mở rộng action vẫn là 1 tool: definition enum + existing dispatch + ORACLE_READ_TOOLS + gate/catalog không đổi tên; AI không nhận full result hay secret"
    - "npm run lint, npm run build, focused Vitest xanh; KHÔNG chạy full suite"
  artifacts:
    - path: "src/services/ai/oracleSqlclService.ts"
      provides: "assertSqlclSingleStatement, safeOracleObjectIdentifier, build metadata scripts, expose redaction, typed describe/query payloads"
      exports: ["executeOracleQuery", "executeOracleDescribe", "redactOracleText", "ORACLE_OBJECT_TYPES"]
    - path: "src/utils/dynamicFileSandbox.ts"
      provides: "ExcelJS grid export từ columns+rows"
      exports: ["generateXlsxBlobFromGrid"]
    - path: "src/components/common/DiffSyntaxHighlighter.tsx"
      provides: "Oracle SQL/PLSQL keyword tokenizer, giữ API cũ"
      exports: ["tokenizeCodeLine", "DiffLineCodeRenderer", "ORACLE_KEYWORDS"]
    - path: "src/workbench/editor/OracleObjectViewer.tsx"
      provides: "Center tab xem source/DDL: line number + highlight + virtualize + copy/search + cap"
    - path: "src/workbench/editor/OracleSqlComposer.tsx"
      provides: "Center tab SQL composer: editor, chạy/hủy, grid ảo hóa, export Excel"
    - path: "src/workbench/toolwindows/DatabaseExplorer.tsx"
      provides: "Left docked lazy schema tree + debounce search + openTab params"
    - path: "src/workbench/store/layoutStore.ts"
      provides: "2 EditorViewType mới cho tab object/source và composer"
  key_links:
    - from: "WorkbenchLayout.tsx DEFAULT_LEFT_ITEMS"
      to: "DatabaseExplorer trong LeftToolWindow"
      via: "leftActiveId === 'database_explorer'"
    - from: "DatabaseExplorer tree onSelect/onComposer"
      to: "EditorArea renderViewContent"
      via: "openTab({ id, viewType, params: { connectionId, schema, objectType, objectName, mode | composerId } })"
    - from: "OracleSqlComposer"
      to: "executeOracleQuery(..., crypto.randomUUID()) + cancelToolCall(callId)"
      via: "callId người dùng gửi khi bấm Cancel"
    - from: "OracleObjectViewer"
      to: "LineNumberedPane(visibleLines) + useVirtualizer + DiffLineCodeRenderer(language='sql')"
      via: "chỉ render dòng trong viewport"
    - from: "oracle_describe definition enum"
      to: "executeOracleDescribe"
      via: "ORACLE_READ_TOOLS/gate/catalog giữ nguyên tên tool"
---

# Database Explorer cho Oracle trong Workbench

<objective>
Xây Database Explorer cho Oracle trên Tauri Workbench: query editor SELECT-only, kết quả grid ảo hóa + Excel export, schema browser tree lazy load, viewer source/DDL có line number và syntax highlight. Dùng lại hạ tầng SQLcl/SSH, UI token và component có sẵn; AI tái dùng `oracle_describe` mở rộng thay vì tool mới.

Quyết định UX đã chốt: 1 stripe item trên left stripe, đặt **ngay dưới** Remote Git Explorer icon. Tree nằm trong left docked panel. Mở object/source hoặc SQL composer đều mở **tab center** (EditorArea), không Modal/Drawer. Nhiều object/source mở cùng lúc = nhiều tab center độc lập.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@CLAUDE.md

Facts đã khảo sát, KHÔNG khảo sát lại từ đầu:
- Oracle chạy SQLcl remote qua SSH `ssh_exec_command`; `src/services/ai/oracleSqlclService.ts` đã có `assertReadOnlyQuery` (:205), `applyQueryLimit` (:261, cap 1000), `safeOracleIdentifier` (:241), `escapeOracleLikeFilter` (:254), `redactConnectionSecrets` (:331), `detectRemoteFailure` (:353), `SET TRANSACTION READ ONLY` + `SET SQLFORMAT JSON` (:550), `executeOracleQuery` (:467, truncate 60KB), `executeOracleDescribe` (:624, mới chỉ TABLE).
- Connection profiles ở Dexie `oracle_ai_tool_config_list`; plaintext connectionString bị denylist backup (`src/services/backup/exportBackup.ts:11-50`); SSH secret qua keyring. Cancel có `cancelToolCall(callId)` trong `src/services/sshService.ts:273`.
- Reuse: `RemoteGitExplorer.tsx:464` (`<Tree loadData>`), `LineNumberedPane.tsx:115` (`visibleLines` + gutter), `DiffSyntaxHighlighter.tsx:26` (regex tokenizer + GitHub palette + memo), `VirtualizedList.tsx` (@tanstack/react-virtual), `fileExport.ts:491/618/679` (`generateXlsxBlob`, `downloadBlob`, `saveFileWithPicker` + `sanitizeFilename`), `exceljs` và `@tanstack/react-virtual` đã có trong package.json.
- UI wrappers: `src/components/ui/index.ts` có Tree/TreeNode, Table, Spin, Empty, Modal, InputSearch, Button, Select, Tooltip, Typography, message. ESLint chặn import trực tiếp `antd`/`@ant-design/icons` ngoài `src/components/ui/**` (`eslint.config.mjs:12-48`). Dùng `DatabaseOutlined`, `CodeOutlined` từ `src/components/ui/icon`.
- Workbench: stripe items `WorkbenchLayout.tsx:53-68`, left body `LeftToolWindow.tsx:29-138`, tab dispatch `EditorArea.tsx:567-671`, enum tab `layoutStore.ts:6-32`, `openTab` merge params theo id `layoutStore.ts:198`. AI: definition `aiTools.ts:2088-2181`, dispatch `:2351-2362`, `ORACLE_READ_TOOLS :5117`, gate/catalog `chatTurnTools.ts:86-94,245-272`.

Tasks dưới đây chạy tuần tự (W1 → W2 → W3). Mọi file đọc/ghi, lệnh git và test chạy trong worktree `/Users/tranducquan/Working/Personal/task-management/.claude/worktrees/database-explorer`, branch `feat/database-explorer`. Không đụng repo gốc.

<tasks>

<task id="1" title="Service + export/tokenizer foundation: Oracle metadata an toàn, Excel grid, highlight SQL">
<files>
- src/types/oracleSqlcl.ts
- src/services/ai/oracleSqlclService.ts
- src/services/ai/aiTools.ts
- src/utils/dynamicFileSandbox.ts
- src/components/common/DiffSyntaxHighlighter.tsx
- src/services/ai/__tests__/oracleSqlclService.test.ts
- src/services/ai/__tests__/oracleMultiConnection.test.ts
- src/utils/__tests__/dynamicFileSandbox.test.ts
</files>
<action>
1. `src/types/oracleSqlcl.ts`: mở rộng `OracleDescribeAction` thành `'list_tables' | 'describe_table' | 'get_ddl' | 'list_schemas' | 'list_objects' | 'describe_object' | 'get_object_source'`; giữ các action cũ tương thích 100%. Thêm type payload tối thiểu (`OracleSchemaEntry`, `OracleObjectEntry`, `OracleSourceLine`, kết quả `executeOracleQuery` dạng `{ success, columns: string[], rows: unknown[][], rowCount, truncated, executionTimeMs, error?, executedSql? }` cho UI). `OracleToolExecutionResult` cũ vẫn giữ `data` cho AI; KHÔNG đổi JSON trả về theo hướng làm gãy AI/tool test cũ.
2. `src/services/ai/oracleSqlclService.ts`:
   - Export `redactOracleText(text, config)` (bọc `redactConnectionSecrets`, thêm mask password component) để UI dùng cho mọi stdout/stderr/error. Export `ORACLE_OBJECT_TYPES` whitelist: TABLE, VIEW, MATERIALIZED VIEW, PACKAGE, PACKAGE BODY, PROCEDURE, FUNCTION, TRIGGER, SEQUENCE, SYNONYM, TYPE, TYPE BODY, INDEX + map riêng sang đối số `DBMS_METADATA.GET_DDL` hợp lệ (`MATERIALIZED_VIEW`, `PACKAGE_BODY`, …). Không nhận type ngoài whitelist.
   - Thêm `assertSqlclSingleStatement(sql)`: sau `stripCommentsAndLiterals`, chỉ cho đúng tối đa 1 `;` ở cuối (bỏ trailing `;` rồi reject nếu còn `;`); reject dòng bắt đầu `--` đã strip và directive SQLcl/`SET`/`EXIT`/`HOST`/`SPOOL`/`PROMPT`/`DEFINE`/`CONNECT`/`@`/`@@`/`/`/`!` ở đầu dòng. Gọi trước `assertReadOnlyQuery` và trước `applyQueryLimit` trong `executeOracleQuery`; dùng helper tương tự cho script metadata do UI truyền vào (UI không truyền script tùy ý — service tự dựng).
   - Thêm `safeOracleObjectIdentifier(value, label)`: accept unquoted qua `safeOracleIdentifier` hoặc quoted strict `^"[A-Za-z][A-Za-z0-9_$#]*"$` (không cho `"` bên trong, không cho escaped quote); trả về chuỗi đã normalized sẵn để nhúng literal. Có test riêng cho mixed-case + injection `X" UNION...`.
   - Metadata scripts: `list_schemas` từ `ALL_USERS` (hoặc `SELECT DISTINCT OWNER FROM ALL_OBJECTS`) lọc system schema, `OFFSET ? ROWS FETCH NEXT ? ROWS ONLY` với numeric clamp (pageSize <= 200, offset >= 0); `list_objects` từ `ALL_OBJECTS` lọc `OWNER`, `OBJECT_TYPE` whitelist, `OBJECT_NAME LIKE '%...%'` qua `escapeOracleLikeFilter`, phân trang; `describe_object` lấy columns qua `ALL_TAB_COLS` cho TABLE/VIEW/MATERIALIZED VIEW, tham số qua `ALL_ARGUMENTS` cho PACKAGE/PROCEDURE/FUNCTION, metadata cơ bản cho object còn lại; `get_object_source` từ `ALL_SOURCE` với `ORDER BY LINE` + `FETCH FIRST 5000 ROWS ONLY`; `get_ddl` mở rộng `DBMS_METADATA.GET_DDL('<mapped type>', '<name>', '<schema>')` với type đã whitelist. `SET SQLFORMAT JSON`, `SET TRANSACTION READ ONLY`, `SET LONG 200000` như pattern cũ.
   - `executeOracleQuery`: giữ output JSON cũ cho AI, thêm parsed `columns`/`rows` có chung nguồn `parsedJson` để UI không parse lại text; cap tổng cell (mỗi cell <= 2000 chars), cap payload UI <= ~500KB, row limit vẫn <= 1000; mọi error path (kể cả catch) dùng `redactOracleText`. Không đưa `connectionString` vào `executedSql`.
   - `executeOracleDescribe`: dispatch action mới qua cùng khung resolve/redact/extract error như cũ; mọi action trả JSON `{ success, action, data|columns|source|ddl, executionTimeMs, error? }`; source/DDL cap ký tự (200000) và trả cờ `truncated`. Giữ message lỗi name-only của `resolveOracleConnection`.
3. `src/services/ai/aiTools.ts`: cập nhật `oracle_describe` enum/description trong definition (:2129-2168) để liệt kê action mới. KHÔNG thêm tool name mới → `ORACLE_READ_TOOLS`, dispatch `:2351-2362`, `chatTurnTools.ts` gate/catalog giữ nguyên, không cần sửa 5 điểm.
4. `src/utils/dynamicFileSandbox.ts`: thêm `generateXlsxBlobFromGrid(columns: string[], rows: unknown[][], sheetTitle?)` dùng `ExcelJS` đã import, style header/auto-width y hệt `generateXlsxBlobWithExcelJS` (:125-175).Không convert qua `extractGridFromText`. Cap rows ở caller, helper chỉ lo ghi grid.
5. `src/components/common/DiffSyntaxHighlighter.tsx`: thêm `ORACLE_KEYWORDS` (SELECT, FROM, WHERE, WITH, JOIN, INNER/LEFT/RIGHT/FULL OUTER, ON, GROUP BY, ORDER BY, HAVING, UNION ALL, INSERT/UPDATE/DELETE (để hiển thị đỏ), CREATE/ALTER/DROP, PROCEDURE/FUNCTION/PACKAGE/BODY, BEGIN/END, IF/THEN/ELSE/ELSIF, LOOP/WHILE/FOR, CURSOR, RETURN, PRAGMA, EXCEPTION, NULL, IS, AS, IN, EXISTS, BETWEEN, LIKE, CASE, WHEN, THEN, GRANT/REVOKE, COMMENT, TABLE, VIEW, INDEX, SEQUENCE, TRIGGER, SYNONYM, TYPE, MATERIALIZED, DBMS_METADATA, ALL_* metadata views), case-insensitive lookup (`text.toUpperCase()`), comment `--` và block `/* */`, string `q'[...]'` giữ nguyên không tách nhầm. API cũ `tokenizeCodeLine(line)` / `DiffLineCodeRenderer` giữ nguyên, thêm prop optional `language?: 'sql' | 'auto'`; default `'auto'` để mọi test/component cũ không đổi.
</action>
<verify>
- `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts src/services/ai/__tests__/oracleMultiConnection.test.ts src/utils/__tests__/dynamicFileSandbox.test.ts`
- Focused test mới: multi-statement `SELECT 1; DELETE ...`, directive sau `;`, `SET`/`@`/`/` directive, `safeOracleObjectIdentifier('HR."MixCase"')` OK và injection bị reject, whitelist object type reject, mọi action metadata sinh đúng `ALL_OBJECTS`/`ALL_SOURCE` + OFFSET/FETCH, error stdout chứa connectionString bị mask, `generateXlsxBlobFromGrid` tạo blob có header tên cột đúng.
</verify>
<done>
Service trả payload typed, mọi script metadata chỉ dựng từ input đã validate, secret không lọt ra, Excel grid helper và tokenizer Oracle có test xanh. Không sửa UI, không dùng dependency mới.
</done>
</task>

<task id="2" title="Workbench shell: stripe item, viewType, tab params, multi-tab center">
<files>
- src/workbench/store/layoutStore.ts
- src/workbench/WorkbenchLayout.tsx
- src/workbench/toolwindows/LeftToolWindow.tsx
- src/workbench/EditorArea.tsx
- src/workbench/__tests__/DatabaseExplorer.test.tsx
</files>
<action>
1. `layoutStore.ts`: thêm `'oracle_object_view' | 'oracle_sql_composer'` vào `EditorViewType`; KHÔNG bump `LAYOUT_STORAGE_KEY` (viewType mới là additive, persisted tab cũ vẫn hợp lệ). Document params contract ngay cạnh enum: object tab `{ connectionId, schema, objectType, objectName, mode: 'source' | 'ddl' | 'columns' }`, composer tab `{ connectionId?, composerId? }`.
2. `WorkbenchLayout.tsx`: thêm `{ id: 'database_explorer', name: 'Database Explorer', icon: <DatabaseOutlined /> }` vào `DEFAULT_LEFT_ITEMS` **ngay sau** item `remote_explorer` (:63-67). Không cấp shortcut mới trùng keymap hiện hữu. Không đổi cấu trúc PanelGroup.
3. `LeftToolWindow.tsx`: thêm `isDatabaseExplorer = leftActiveId === 'database_explorer'` vào title/icon/body; title `'Database Explorer'`, body `<DatabaseExplorer db={db} />` import từ `./DatabaseExplorer` (tạo ở task 3). Giữ pattern fallback CRExplorer.
4. `EditorArea.tsx`: thêm icon (DatabaseOutlined/CodeOutlined) trong `getEditorTabIcon`; thêm 2 case trong `renderViewContent`:
   - `'oracle_object_view'` → `<OracleObjectViewer {...tab.params} />` (src/workbench/editor/OracleObjectViewer.tsx, task 3).
   - `'oracle_sql_composer'` → `<OracleSqlComposer {...tab.params} />` (src/workbench/editor/OracleSqlComposer.tsx, task 3).
   Tab id do caller tạo từ `connectionId|schema|objectType|objectName|mode` (object) và `composer:<connectionId || 'active'>` (composer) nên click nhiều object = nhiều tab; `openTab` merge params đã xử lý reuse. KhôngModal/Drawer.
5. Test `src/workbench/__tests__/DatabaseExplorer.test.tsx`: mock `DatabaseExplorer`, `OracleObjectViewer`, `OracleSqlComposer`, `dexie-react-hooks` theo pattern `StripeRemoteExplorer.test.tsx`; assert stripe order (Remote Git Explorer → Database Explorer), click đổi `leftActiveId`, header/title đúng, và `openTab` với params tạo 2 tab center khác nhau khi click 2 object khác nhau.
</action>
<verify>
- `npx vitest run src/workbench/__tests__/DatabaseExplorer.test.tsx src/workbench/__tests__/StripeRemoteExplorer.test.tsx src/workbench/__tests__/layoutStore.test.ts src/workbench/__tests__/EditorArea.test.tsx`
- `npm run lint` (chặn import antd trực tiếp, hook rule).
</verify>
<done>
Stripe item đúng vị trí, left panel host tree, 2 viewType và tab dispatch hoạt động, nhiều tab object mở cùng lúc; không modal/drawer.
</done>
</task>

<task id="3" title="DatabaseExplorer tree + center object viewer + SQL composer">
<files>
- src/workbench/toolwindows/DatabaseExplorer.tsx
- src/workbench/editor/OracleObjectViewer.tsx
- src/workbench/editor/OracleSqlComposer.tsx
- src/workbench/__tests__/DatabaseExplorer.test.tsx
</files>
<action>
1. `src/workbench/toolwindows/DatabaseExplorer.tsx` (mới): dùng `getOracleConnectionProfiles` + `listOracleConnectionSummaries` (chỉ id/name/environment/isActive; KHÔNG render connectionString). `<Tree loadData>` theo pattern `RemoteGitExplorer.tsx:464`, `motion={false}`, `blockNode`, `selectedKeys`/`expandedKeys` local. Node hierarchy: Connection → Schema → nhóm OBJECT_TYPE (từ `ORACLE_OBJECT_TYPES`) → object. `loadData` chỉ fetch khi expand; cache `Map<key, node[]>` theo `connectionId|schema|type|filter|page`, invalidate khi đổi connection. Schema search dùng `InputSearch` + debounce 300ms + `list_schemas` limit 200; object search `list_objects` limit 200 + `ON` load-more. Double-click/Enter object → `openTab` object view (`mode: 'source'` cho PL/SQL/PACKAGE/PROCEDURE/FUNCTION/TRIGGER/TYPE BODY, `'ddl'` cho TABLE/VIEW/MATERIALIZED VIEW/INDEX/SEQUENCE/SYNONYM/TYPE, `'columns'` cho describe); nút "SQL Composer" trong header panel → `openTab` composer. Error hiển thị qua `redactOracleText` + `Alert`/message từ ui barrel. Không re-render toàn cây: setState theo node key, node con `React.memo`.
2. `src/workbench/editor/OracleObjectViewer.tsx` (mới, center tab): gọi `executeOracleDescribe` với action `get_object_source` hoặc `get_ddl`/`describe_object` theo `mode`, `callId` riêng từ `crypto.randomUUID()`; cancel qua `cancelToolCall`. Pretty-print nhẹ bằng regex formatting có sẵn (xuống dòng sau `;`, `CREATE OR REPLACE`, `BEGIN/END`, indent) + transform DBMS_METADATA (`REPLACE ... SEGMENT CREATION...` không bắt buộc); KHÔNG thêm dep formatter. Line number: `LineNumberedPane` với `visibleLines` lấy từ `useVirtualizer` (@tanstack/react-virtual, cùng lib `VirtualizedList`) để chỉ render dòng viewport; mỗi dòng dùng `DiffLineCodeRenderer` với `language="sql"`, `React.memo`, `useMemo` tokenize. Cap 200000 chars / 5000 lines, hiện banner truncated. Copy toàn bộ (navigator.clipboard) + ô search trong code (highlight dòng khớp, scrollToIndex). Mọi text đưa qua `redactOracleText` trước khi render, dù service đã lọc.
3. `src/workbench/editor/OracleSqlComposer.tsx` (mới, center tab): textarea SQL + Select connection (từ summaries) + InputNumber limit (1..1000) + Button Chạy/Hủy. Khi Chạy: `assertReadOnlyQuery` + `assertSqlclSingleStatement` ở service (không tự implement lại guard), `callId = crypto.randomUUID()`, gọi `executeOracleQuery({ query, limit, connectionId }, db, callId)`; Cancel gọi `cancelToolCall(callId)`. Kết quả: header `rowCount · executionTimeMs · truncated`, error `ORA-/SP2-` (đã redact) hiện `Alert`; grid dùng `VirtualizedList` với columns lấy từ payload, cell render dạng text, row/cell cap từ task 1. Export Excel: `generateXlsxBlobFromGrid(columns, rows.slice(0, 1000))` rồi `saveFileWithPicker` với filename `oracle_<connectionName>_<YYYYMMDD-HHmm>.xlsx` (connection name đã sanitize + helper tự sanitize). KHÔNG convert qua text grid, KHÔNG log SQL/connectionString, KHÔNG đưa full result vào AI.
4. Mở rộng test `src/workbench/__tests__/DatabaseExplorer.test.tsx`: mock service trả profile summaries + object tree; assert tree chỉ gọi loadData sau expand (không fetch lúc mount), cache không fetch lại khi collapse/expand, click object gọi `openTab` đúng params, composer button mở đúng tab id, credential không xuất hiện trong DOM (`queryByText(/pass@/)`).
</action>
<verify>
- `npx vitest run src/workbench/__tests__/DatabaseExplorer.test.tsx`
- `npm run lint && npm run build`
</verify>
<done>
Tree lazy/cache/search, viewer line-number + highlight + virtualize, composer chạy/hủy/grid ảo/export Excel; UI token-based, không leak secret, không lag khi render kết quả lớn.
</done>
</task>

</tasks>

<verification>
- Mọi lệnh trong worktree `/Users/tranducquan/Working/Personal/task-management/.claude/worktrees/database-explorer`;KHÔNG chạy full suite (quy tắc project: >1 giờ).
- `npm run lint` (app-wide AntD import guard), `npm run build` (Vite/Tauri build), focused Vitest theo từng task ở trên.
- Review critical/warning trước khi commit: SQL injection / read-only bypass (multi-statement, directive, quote identifier, object type whitelist), credential leak (stdout/stderr/error/UI/log/AI prompt/backup), OOM (row/cell/payload/cap + virtualization), error handling (ORA-/SP2-, SSH failure, cancel), token compliance (chỉ ui barrel, `var(--...)`). Fix hết findings rồi mới đánh dấu xong.
</verification>
