# Phase 41: AI Office team docs zones — Context

**Gathered:** 2026-11-15
**Status:** Ready for planning
**Owner decision:** This phase exists because the owner said so. No requirement, invariant, or prior decision outranks it. Where this document conflicts with an earlier phase's decision, this document wins and the earlier wording must be corrected in the same phase.

## Phase Boundary

Tạo một nhóm = tạo một cây thư mục trong TaskMate Docs. Mỗi thành viên (kể cả leader) có một thư mục con riêng và **chỉ được ghi trong thư mục đó**. Ghi xong là thấy ngay trong Docs — không có bản nháp ẩn, không có bảng chờ duyệt. Leader đọc được mọi thứ và ghi bản cuối cùng đã được owner duyệt vào thư mục gốc của nhóm.

Phase này gồm:

- Field `docsFolderId` trên `AiTeam` + Dexie V27 + backup schema + 5 danh sách bảng phối hợp.
- `createTeam` tạo cây thư mục trong **cùng transaction** với row team.
- Một team tool mới `write_doc` cho mọi thành viên (create + update), với guard thư mục do **code** kiểm, không phải prompt.
- Leader giữ nguyên toàn bộ mutation tool hiện có + thẻ phê duyệt hiện có.
- `deleteTeam` xoá cây thư mục.
- Backfill lazy cho nhóm tạo trước phase này.

Phase này **không** gồm:

- Recursive read của linked item (Phase 42).
- Git read tool (Phase 42).
- Skill body của BA/SA/Reviewer (viết sau khi tool surface chốt — xem §Deferred).
- Thay đổi `EMPLOYEE_READ_ONLY_ALLOWLIST` (xem D-03: không đụng).
- UI mới. Cây thư mục hiện ra trong DocsExplorer sẵn có, không cần view mới.

## Implementation Decisions

### Vì sao là team tool, không phải DB tool

- **D-01:** Agent ghi tài liệu bằng **team tool `write_doc`**, không phải bằng `create_note`/`update_note` của DB tool layer.
  **Lý do kỹ thuật, không phải thẩm mỹ:** `chatTurnRuntime.ts:397` từ chối **mọi** mutation của employee *trước cả* thẻ phê duyệt khi `mutationPolicy === 'read-only'`. Đây là gate cứng trong runtime, không phải prompt. Thêm `create_note` vào `EMPLOYEE_READ_ONLY_ALLOWLIST` **không có tác dụng** — call vẫn bị `READ_ONLY_REFUSAL` chặn. Hai lựa chọn thật:
  (a) đổi employee sang `mutationPolicy: 'approve'` → mọi write park trên thẻ duyệt → **trái yêu cầu "thấy ngay"**;
  (b) thêm policy thứ ba `'scoped-docs'` → sửa runtime, thêm nhánh vào `onMutationCheck`, thêm khái niệm mới vào một file đã có 6 nhánh.
  Team tool là đường thứ ba đã có tiền lệ: `propose_skill_version` (Phase 39 D-04/D-05/D-06) ghi row `pending` ngay, **cố ý không nằm trong `MUTATION_TOOLS`**, nên nó không đi qua `onMutationCheck` và không bị read-only chặn. `write_doc` theo đúng khuôn đó: dispatch ở `teamRunCoordinator.ts:1177` (`TEAM_TOOL_NAMES.has(...)` → `executeTeamTool`), trước cả `AI_DATABASE_TOOLS`. Không sửa runtime, không thêm policy, không đụng D-12.
  — **Reversibility:** reversible — xoá một entry khỏi `TEAM_TOOL_DEFINITIONS` + một case trong switch.

- **D-02:** `write_doc` có **hai mode trong một tool**: `mode: 'create'` và `mode: 'update'`. Không tách hai tool. Lý do: cùng một guard, cùng một chỗ test, cùng một refusal set. `update` nhận `noteId`; `create` nhận `title` + `body`.
  — **Reversibility:** reversible.

- **D-03:** **Không** đụng `EMPLOYEE_READ_ONLY_ALLOWLIST`. Agent vẫn không có `create_note`, `update_note`, `delete_note`, hay bất kỳ mutation DB nào. `write_doc` là cửa ghi duy nhất của agent, và nó chỉ ghi được trong thư mục của chính agent đó.

### Guard thư mục

- **D-04:** Guard nằm trong **handler**, kiểm bằng code, không bằng prompt. Cụ thể:
  - `create`: `parentId` **bị bỏ qua hoàn toàn** nếu client gửi lên. Handler luôn dùng `ctx.folderId` (thư mục của chính caller, lấy từ context do coordinator dựng — **không** lấy từ `args`). Đây là cùng nguyên tắc "cross-team read guard" đã ghi ở đầu `teamTools.ts`: id luôn đến từ context, không bao giờ từ args.
  - `update`: đọc row hiện tại; nếu `note.parentId !== ctx.folderId` → refusal `DOC_NOT_IN_YOUR_FOLDER`. Không có ngoại lệ cho leader (leader dùng DB tool, xem D-06).
  - `type` luôn là `'document'`. Agent **không** tạo được `'folder'` — đó là cách duy nhất để nó không tự mở rộng vùng ghi.

- **D-05:** `TeamToolContext` thêm `folderId?: string | undefined`. Coordinator dựng nó trong `toolContext(agentId)` từ `AiTeam.docsFolderId` + member row. Thiếu `folderId` (nhóm cũ chưa backfill, hoặc team chưa có cây) → `write_doc` trả refusal `TEAM_DOCS_NOT_READY`, không tự tạo thư mục giữa lượt chạy. Lý do: tạo thư mục trong lúc chạy là write ngoài transaction của team và sẽ nhân bản khi hai agent chạy song song.

### Leader

- **D-06:** Leader **không** dùng `write_doc`. Leader đã có `create_note`/`update_note` trong payload (`leadTools()` ở `teamRunCoordinator.ts:1097`), và mỗi call park trên thẻ phê duyệt. Giữ nguyên. Đây chính là gate "owner duyệt bản cuối" — owner bấm accept = chữ ký. Không thêm đường ghi thứ hai cho leader.

- **D-07:** Leader ghi bản cuối vào **thư mục gốc của nhóm** (`docsFolderId`), không vào thư mục con. Prompt của leader (một dòng trong `buildLeadTurnRequest`) nêu: đọc draft của agent bằng `get_linked_context`/`query_notes`, tổng hợp, rồi ghi bản cuối vào thư mục gốc sau khi owner duyệt. Wording chính xác thuộc Claude's Discretion.

### Cây thư mục

- **D-08:** Cây gồm: 1 folder gốc tên `{team.name}` + 1 folder con cho mỗi member, tên = `{agent.name}`. Tất cả `type: 'folder'`, `parentId` trỏ đúng cấp. Không tạo folder con cho member thêm sau này trong phase này — xem D-11.
  Ghi `docsFolderId` (id folder gốc) lên `AiTeam`. Không cần bảng mới: `Note.parentId` đã đủ để dựng cây.

- **D-09:** Tạo cây **trong cùng transaction** với row team. `createTeam` (`aiTeamRepo.ts:91`) đã có `db.transaction('rw', [...])`; thêm `db.notes` vào danh sách bảng. Throw giữa chừng → không team, không folder. Không có "team mồ côi" và không có "folder mồ côi".

- **D-10:** `deleteTeam` (`aiTeamRepo.ts:344`) xoá cây trong cùng transaction hiện có: thu thập toàn bộ `Note.id` có `parentId === docsFolderId` (một cấp, không đệ quy — cấu trúc do D-08 chốt là phẳng 2 cấp) rồi xoá con trước, gốc sau. Thêm `db.notes` vào danh sách bảng của transaction.
  **Không** đệ quy: agent có thể tạo note trong folder của mình, nhưng không tạo được folder (D-04), nên cây không bao giờ sâu hơn 2 cấp. Nếu tương lai cho phép folder con, đây là chỗ phải sửa — ghi rõ trong plan.

- **D-11:** Member thêm vào nhóm sau khi tạo → **không** tự có folder trong phase này. `write_doc` trả `TEAM_DOCS_NOT_READY` cho member đó. Lý do: tạo folder khi thêm member là một write thứ hai vào `db.notes` từ `TeamSettingsDrawer`, và owner chưa yêu cầu. Ghi thành Deferred.

### Backfill

- **D-12:** Nhóm tạo trước Phase 41 không có `docsFolderId`. Lần chạy đầu tiên của coordinator: nếu `docsFolderId` rỗng → tạo cây **một lần** trong một transaction, ghi `docsFolderId`, rồi tiếp tục lượt. Lần chạy sau thấy có id → không làm gì.
  Idempotency: kiểm `docsFolderId` **bên trong** transaction (đọc lại row), không kiểm ngoài. Hai lượt chạy đồng thời trên cùng nhóm không được tạo hai cây.
  **Không** migration Dexie cho dữ liệu cũ (C-16: dữ liệu cũ là test).

### Schema và backup

- **D-13:** Dexie **V27**, thêm field `docsFolderId?: string` vào `AiTeam`. Đây là field trên row đã có, **không** thêm bảng → `SCHEMA_V27` chỉ spread `SCHEMA_V26`, không có index mới, không có `.upgrade()`.
  `LATEST_SCHEMA_VERSION` → 27.
- **D-14:** Backup: `BackupAiTeamRecordSchema` (`backupSchemas.ts`) thêm `docsFolderId` optional. Đây là **UUID**, không phải free text → không đụng `FORBIDDEN_BACKUP_KEYS`. Export/restore không cần sửa thêm vì `notes` đã round-trip sẵn.
- **D-15:** Năm danh sách bảng phối hợp (`src/db/index.ts` Table declarations, `schema.ts`, `SQLITE_DOMAIN_TABLES` ở `localSqlitePersistence.ts`, `ALLOWED_TABLES` ở `src-tauri/src/sqlite_persistence.rs`, `tableListParity.test.ts`) — **không đổi**, vì không thêm bảng. Chỉ `LATEST_SCHEMA_VERSION` đổi. Test parity phải vẫn xanh.

### Claude's Discretion

- Tên chính xác của tool (`write_doc` vs `write_team_doc`) và tên field `mode`.
- Wording prompt của leader về việc đọc draft và ghi bản cuối.
- Có thêm `get_team_docs` (liệt kê cây) hay để agent dùng `query_notes` sẵn có — **khuyến nghị: không thêm**, `query_notes` đã đọc được theo `parentId`.
- Cách hiển thị cây trong DocsExplorer — **khuyến nghị: không đụng UI**, cây hiện ra tự nhiên vì nó là note folder bình thường.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quyết định và phạm vi
- `.planning/ROADMAP.md` §Phase 41 — goal + 6 success criteria.
- `.planning/REQUIREMENTS.md` — `AIO-DOCS-01..06`.
- `.planning/MILESTONE-CONTEXT.md` — C-15 (verify bằng quan sát), C-16 (không migration dữ liệu cũ).
- `CLAUDE.md` — Tauri là runtime duy nhất; IndexedDB là store chuẩn; UUID client-generated.

### Quyết định phase trước — không mở lại, trừ khi D-01 ở trên override
- `.planning/phases/39-skill-versioning-enrichment-approval/39-CONTEXT.md` — **D-04/D-05/D-06** là tiền lệ trực tiếp cho D-01 (team tool ghi dữ liệu, cố ý không nằm trong `MUTATION_TOOLS`, không park trên card).
- `.planning/phases/36-data-model-multi-chat-identity-backup-migration/36-CONTEXT.md` — D-15 (transaction), D-22 (Dexie version).
- `.planning/ARCHITECTURE-TEAM-CHAT.md` — §1 nguyên tắc participant/message; §3.5 quyền suy từ `kind` + `role`.

### Source contracts — đọc trước khi sửa
- `src/components/ai/runtime/chatTurnRuntime.ts:390-400` — `onMutationCheck`, nhánh `mutationPolicy === 'read-only'`. **Đây là lý do D-01 tồn tại; không sửa file này.**
- `src/services/ai/office/teamTools.ts` — `TeamToolContext` (:21), `TeamToolRefusalCode` (:41), `TEAM_TOOL_DEFINITIONS` (:64), `LEAD_ONLY_TEAM_TOOLS` (:251), `executeTeamTool` switch (:708), `getLinkedContext` (:428).
- `src/services/ai/office/teamRunCoordinator.ts` — `TEAM_TOOL_NAMES` (:324), `EMPLOYEE_TEAM_TOOLS` (:329), `toolContext` (:1075), `leadTools` (:1097), `employeeTools` (:1111), dispatch (:1177).
- `src/db/repositories/aiTeamRepo.ts` — `createTeam` (:91), `deleteTeam` (:344), `listTeamMembers`.
- `src/db/repositories/noteRepo.ts` — `createNote` (:17), `updateNote` (:71), `getNotesByFolder` (:177).
- `src/db/schema.ts` — `notes` index (:70), `aiTeams` index (:126), `SCHEMA_V26` (:185), `LATEST_SCHEMA_VERSION` (:191).
- `src/db/index.ts` — `this.version(26)` (:657) là mẫu cho V27.
- `src/types/aiOffice.ts` — `AiTeam` (:76), `AiTeamMember` (:99).
- `src/types/models.ts` — `Note` (:192), `NoteType` (:190).
- `src/validation/aiOfficeSchemas.ts` — `AiTeamInputSchema` (:97), `AiTeamUpdateSchema` (:113).
- `src/validation/backupSchemas.ts` — `BackupAiTeamRecordSchema`, `FORBIDDEN_BACKUP_KEYS` (:194).
- `src/services/ai/office/teamPrompts.ts` — `buildLeadTurnRequest` (:143), `buildEmployeeTurnRequest` (:52).
- `tests/db/tableListParity.test.ts` — parity guard phải vẫn xanh.

## Existing Code Insights

### Reusable Assets
- `Note.parentId` + `type: 'folder'` — cây thư mục đã có sẵn, không cần model mới.
- `createNote`/`updateNote` trong `noteRepo` — `write_doc` gọi thẳng hai hàm này, không viết lại.
- Tiền lệ `propose_skill_version` — khuôn mẫu đầy đủ cho "team tool ghi dữ liệu mà không qua approval card".
- `db.transaction('rw', [...])` trong `createTeam`/`deleteTeam` — chỉ cần thêm `db.notes` vào danh sách.

### Established Patterns
- Id luôn đến từ `TeamToolContext`, không bao giờ từ `args` (cross-team read guard, đầu file `teamTools.ts`).
- Refusal là **giá trị trả về**, không phải throw (`TeamToolRefusal`).
- Tool result là data → wrap bằng `wrapUntrusted`/`wrapField` ở boundary.
- Mọi write đa bảng nằm trong một Dexie transaction.

### Integration Points
- `toolContext(agentId)` — nơi duy nhất dựng context; thêm `folderId` ở đây.
- `TEAM_TOOL_DEFINITIONS` + `executeTeamTool` switch — thêm `write_doc` ở hai chỗ này.
- `createTeam` / `deleteTeam` — thêm `db.notes` vào transaction.
- Coordinator khởi tạo lượt — nơi đặt backfill lazy (D-12).

### Dead code — không chạm
- `AiOfficeView.tsx` — dead code, Phase 40 quyết.
- `AiStaffExplorer` — Phase 40 gộp explorer.

## Specific Ideas

- Test tối thiểu phải có: (1) `createTeam` tạo đúng số folder và rollback sạch khi throw; (2) `write_doc` create bỏ qua `parentId` client gửi; (3) `write_doc` update note ngoài folder → refusal; (4) agent gọi `create_note` DB tool vẫn bị `READ_ONLY_REFUSAL` (chứng minh D-03 không hở); (5) `deleteTeam` xoá cây; (6) backfill chạy hai lần không nhân bản.

## Deferred Ideas

- Folder con cho member thêm sau (D-11).
- Skill body của BA/SA/Reviewer — viết **sau** khi Phase 41 + 42 xong, vì skill mô tả hành vi dựa trên tool surface thật.
- Cây sâu hơn 2 cấp.
- UI riêng cho docs của nhóm.
