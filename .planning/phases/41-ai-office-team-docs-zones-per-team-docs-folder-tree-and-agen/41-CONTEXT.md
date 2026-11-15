# Phase 41: AI Office team docs zones — Context

**Gathered:** 2026-11-15
**Status:** Ready for planning
**Owner decision:** This phase exists because the owner said so. No requirement, invariant, or prior decision outranks it. Where this document conflicts with an earlier phase's decision, this document wins and the earlier wording must be corrected in the same phase.

## Phase Boundary

Tạo một nhóm = tạo một cây thư mục trong TaskMate Docs. Mỗi thành viên (kể cả leader) có một thư mục con riêng và **chỉ được ghi trong thư mục đó**. Ghi xong là thấy ngay trong Docs — không có bản nháp ẩn, không có bảng chờ duyệt. Leader đọc được mọi thứ và ghi bản cuối cùng đã được owner duyệt vào thư mục gốc của nhóm.

Phase này gồm:

- Field `docsFolderId` trên `AiTeam` + Dexie V27 + backup schema + 5 danh sách bảng phối hợp.
- Folder cha `AI Teams` (một lần, dùng chung) + folder nhóm + folder con mỗi member.
- `createTeam` tạo cây trong **cùng transaction** với row team.
- `addTeamMember` tạo folder con ngay; `removeTeamMember` giữ folder.
- Một team tool mới `write_doc` cho mọi thành viên (`list` / `create` / `update`), với guard thư mục do **code** kiểm, không phải prompt.
- Leader giữ nguyên toàn bộ mutation tool hiện có + thẻ phê duyệt hiện có.
- `deleteTeam` xoá toàn bộ cây của nhóm (không xoá folder `AI Teams`).
- Backfill lazy cho nhóm tạo trước phase này, và tạo lại cây khi folder bị xoá tay.

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

- **D-02:** `write_doc` có **ba action trong một tool**: `list`, `create`, `update`. Không tách nhiều tool. Lý do: cùng một guard, cùng một chỗ test, cùng một refusal set.
  - `list` → không tham số. Trả `[{ noteId, title, updatedAt }]` của **folder của chính caller**. Đây là cách agent biết `noteId` để sửa lần sau.
  - `create` → `title` + `body`. Trả `{ noteId, title }`.
  - `update` → `noteId` + `body`, `title` tuỳ chọn. Trả `{ noteId, title }`.
  — **Reversibility:** reversible.

- **D-02b:** `create` **tự thêm tiền tố tên agent** vào title: `{agentName} — {title}`. `update` **không** thêm lại. Lý do: owner đọc Docs thấy ngay ai viết gì, không phải mở từng file. Tiền tố do tool thêm, không phải prompt — model không thể quên.
  Leader **không** bị áp tiền tố (leader ghi bằng DB tool, D-06).

- **D-03:** **Không** đụng `EMPLOYEE_READ_ONLY_ALLOWLIST`. Agent vẫn không có `create_note`, `update_note`, `delete_note`, hay bất kỳ mutation DB nào. `write_doc` là cửa ghi duy nhất của agent, và nó chỉ ghi được trong thư mục của chính agent đó.

### Guard thư mục

- **D-04:** Guard nằm trong **handler**, kiểm bằng code, không bằng prompt. Cụ thể:
  - `create`: `parentId` **bị bỏ qua hoàn toàn** nếu client gửi lên. Handler luôn dùng `ctx.folderId` (thư mục của chính caller, lấy từ context do coordinator dựng — **không** lấy từ `args`). Đây là cùng nguyên tắc "cross-team read guard" đã ghi ở đầu `teamTools.ts`: id luôn đến từ context, không bao giờ từ args.
  - `update`: đọc row hiện tại; nếu `note.parentId !== ctx.folderId` → refusal `DOC_NOT_IN_YOUR_FOLDER`. Không có ngoại lệ cho leader (leader dùng DB tool, xem D-06).
  - `list`: chỉ trả note có `parentId === ctx.folderId`.
  - `type` luôn là `'document'`. Agent **không** tạo được `'folder'` — đó là cách duy nhất để nó không tự mở rộng vùng ghi.

- **D-05:** `TeamToolContext` thêm `folderId?: string | undefined`. Coordinator dựng nó trong `toolContext(agentId)` từ `AiTeam.docsFolderId` + member row.
  **Thứ tự bắt buộc:** cây được đảm bảo **trước khi lượt chạy bắt đầu** (D-12/D-12b: backfill + tạo lại khi folder mất), nên `folderId` phải có sẵn lúc `toolContext` được gọi. Nếu vẫn thiếu (ví dụ member chưa có folder vì lỗi dữ liệu) → `write_doc` trả refusal `TEAM_DOCS_NOT_READY`. Handler **không bao giờ** tự tạo folder — tạo folder là việc của coordinator, một chỗ duy nhất, trong transaction.

### Leader

- **D-06:** Leader **không** dùng `write_doc`. Leader đã có `create_note`/`update_note` trong payload (`leadTools()` ở `teamRunCoordinator.ts:1097`), và mỗi call park trên thẻ phê duyệt. Giữ nguyên. Đây chính là gate "owner duyệt bản cuối" — owner bấm accept = chữ ký. Không thêm đường ghi thứ hai cho leader.

- **D-07:** Leader ghi bản cuối vào **folder nhóm** (`docsFolderId`), không vào folder con. Prompt của leader (một dòng trong `buildLeadTurnRequest`) nêu: đọc draft của agent bằng `write_doc`-less read (`query_notes` theo `parentId`), tổng hợp, rồi ghi bản cuối vào folder nhóm sau khi owner duyệt. Wording chính xác thuộc Claude's Discretion.

- **D-07b:** Bản cuối là **note mới** ở folder nhóm. Draft của agent **giữ nguyên** trong folder riêng của nó — owner so sánh được bản nháp với bản cuối. Không xoá, không di chuyển, không sửa draft.

### Cây thư mục

- **D-08:** Cây gồm **ba cấp**:
  1. Một folder cha duy nhất tên `AI Teams` ở gốc Docs, `type: 'folder'`, `parentId` undefined. Tạo một lần, dùng chung cho mọi nhóm. Định danh bằng **setting key** `ai_teams_docs_root` trong `db.settings` (cùng khuôn `GLOBAL_CONVENTIONS_SETTING_KEY` ở `conventionService.ts:5`), **không** dò theo tên (đổi tên folder không được làm mất liên kết).
  2. Folder nhóm: `{team.name}`, `parentId` = folder `AI Teams`. Id ghi vào `AiTeam.docsFolderId`.
  3. Folder con cho mỗi member: `{agent.name}`, `parentId` = folder nhóm.
  Lý do ba cấp thay vì hai: owner chọn "Dưới folder 'AI Teams'" — gom nhóm AI tách khỏi tài liệu cá nhân, và xoá/đổi tên folder cha không phá từng nhóm.
  Không cần bảng mới: `Note.parentId` đã đủ để dựng cây.

- **D-08b:** Folder `AI Teams` tạo **lazy**, không tạo lúc app khởi động. Lần đầu một team cần cây: đọc setting `ai_teams_docs_root`; nếu trỏ tới note còn sống → dùng; nếu thiếu hoặc note đã bị xoá → tạo mới và ghi lại setting. Chạy trong cùng transaction với cây của team.

- **D-09:** Tạo cây **trong cùng transaction** với row team. `createTeam` (`aiTeamRepo.ts:91`) đã có `db.transaction('rw', [...])`; thêm `db.notes` và `db.settings` vào danh sách bảng. Throw giữa chừng → không team, không folder, không setting. Không có "team mồ côi" và không có "folder mồ côi".

- **D-10:** `deleteTeam` (`aiTeamRepo.ts:344`) xoá **toàn bộ cây** trong cùng transaction hiện có: thu thập folder con (một cấp) + mọi note có `parentId` thuộc {folder nhóm, các folder con} rồi xoá hết, folder nhóm sau cùng. Thêm `db.notes` vào danh sách bảng của transaction.
  **Không** xoá folder `AI Teams` và **không** xoá setting `ai_teams_docs_root` khi xoá team — folder cha dùng chung, và team khác có thể còn dùng.
  **Không** đệ quy: agent không tạo được folder (D-04), nên cây không bao giờ sâu hơn 3 cấp. Nếu tương lai cho phép folder con, đây là chỗ phải sửa — ghi rõ trong plan.
  Owner đã chốt: xoá nhóm = xoá sạch cả cây, kể cả tài liệu ở folder gốc nhóm.

- **D-11:** Member thêm vào nhóm sau khi tạo → **tự có folder con ngay khi thêm**. `addTeamMember` (`aiTeamRepo.ts:403`) tạo folder trong cùng transaction (thêm `db.notes` vào danh sách bảng của nó). Tên folder = `{agent.name}`; nếu đã có folder cùng tên trong folder nhóm thì thêm hậu tố ` (2)`, ` (3)`.
  `removeTeamMember` (`aiTeamRepo.ts:445`) **không** xoá folder của member — tài liệu họ đã viết vẫn còn để owner đọc; folder chỉ mất khi xoá cả nhóm. Ghi rõ trong plan để không ai "dọn" nhầm.

### Backfill

- **D-12:** Nhóm tạo trước Phase 41 không có `docsFolderId`. Lần chạy đầu tiên của coordinator: nếu `docsFolderId` rỗng → tạo cây **một lần** trong một transaction, ghi `docsFolderId`, rồi tiếp tục lượt. Lần chạy sau thấy có id → không làm gì.
  Idempotency: kiểm `docsFolderId` **bên trong** transaction (đọc lại row), không kiểm ngoài. Hai lượt chạy đồng thời trên cùng nhóm không được tạo hai cây.
  **Không** migration Dexie cho dữ liệu cũ (C-16: dữ liệu cũ là test).

- **D-12b:** `docsFolderId` trỏ tới folder **đã bị xoá** (owner xoá tay trong DocsExplorer) → coi như chưa có: coordinator tạo lại cây ở lượt chạy kế tiếp và ghi `docsFolderId` mới. Kiểm bằng `db.notes.get(docsFolderId)` + `deletedAt`/`type === 'folder'`. Không chặn xoá ở DocsExplorer — owner đã chốt "tự tạo lại ở lượt sau".
  Hệ quả phải ghi trong plan: tài liệu trong cây cũ đã bị xoá cùng folder, nên agent không mất gì nó còn cần; nhưng owner mất draft nếu xoá tay. Đây là hành vi được chọn, không phải bug.

### Schema và backup

- **D-13:** Dexie **V27**, thêm field `docsFolderId?: string` vào `AiTeam`. Đây là field trên row đã có, **không** thêm bảng → `SCHEMA_V27` chỉ spread `SCHEMA_V26`, không có index mới, không có `.upgrade()`.
  `LATEST_SCHEMA_VERSION` → 27.
- **D-13a:** (bổ sung 2026-11-15, owner chốt sau pattern mapping) `AiTeamMember` **cũng** có `docsFolderId?: string`. Lý do: D-05 nói `toolContext` dựng `folderId` từ member row, nhưng `AiTeamMember` không có cột nào chứa nó; dò theo tên folder (D-11) sẽ gãy khi owner đổi tên tay trong DocsExplorer. Thêm field trên row đã có — **không** thêm bảng, **không** thêm index, nên D-15 (năm danh sách bảng) vẫn không đổi. `toolContext` đọc thẳng `member.docsFolderId`; thiếu → `TEAM_DOCS_NOT_READY` (D-05).
- **D-14:** Backup: `BackupAiTeamRecordSchema` (`backupSchemas.ts`) thêm `docsFolderId` optional, và `BackupAiTeamMemberRecordSchema` thêm `docsFolderId` optional. Đây là **UUID**, không phải free text → không đụng `FORBIDDEN_BACKUP_KEYS`. Export/restore không cần sửa thêm vì `notes` đã round-trip sẵn.
- **D-15:** Năm danh sách bảng phối hợp (`src/db/index.ts` Table declarations, `schema.ts`, `SQLITE_DOMAIN_TABLES` ở `localSqlitePersistence.ts`, `ALLOWED_TABLES` ở `src-tauri/src/sqlite_persistence.rs`, `tableListParity.test.ts`) — **không đổi**, vì không thêm bảng. Chỉ `LATEST_SCHEMA_VERSION` đổi. Test parity phải vẫn xanh.

### Prompt

- **D-16:** Agent biết folder của mình qua **prompt**, không qua tool. `buildEmployeeTurnRequest` thêm một dòng: `Folder tài liệu của bạn: {folderId} — dùng write_doc (list/create/update) để ghi trong đó.` Leader có thêm hai dòng: `Folder nhóm: {docsFolderId}` và danh sách `{agentName} → {folderId}` để biết đọc draft ở đâu.
  Lý do: tiết kiệm một lượt tool, và folder id là dữ kiện cố định trong lượt — không có gì để agent "khám phá".

### Claude's Discretion

- Tên chính xác của tool (`write_doc` vs `write_team_doc`) và tên field action.
- Wording prompt của leader về việc đọc draft và ghi bản cuối.
- Có thêm `get_team_docs` (liệt kê cây) hay để agent dùng `query_notes` sẵn có — **khuyến nghị: không thêm**, `write_doc action='list'` đã đủ cho agent, `query_notes` đã đủ cho leader.
- Cách hiển thị cây trong DocsExplorer — **khuyến nghị: không đụng UI**, cây hiện ra tự nhiên vì nó là note folder bình thường. Chỉ cần kiểm: folder `AI Teams` không bị lọc khỏi `root_docs` view (`DocsExplorer.tsx:97` coi mọi filter không thuộc danh sách đặc biệt là folder id, nên folder gốc hiện đúng).

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

- Test tối thiểu phải có: (1) `createTeam` tạo đúng số folder (AI Teams + team + N member) và rollback sạch khi throw; (2) `write_doc` create bỏ qua `parentId` client gửi và tự thêm tiền tố tên agent; (3) `write_doc` update note ngoài folder → refusal; (4) `write_doc list` chỉ trả note trong folder của caller; (5) agent gọi `create_note` DB tool vẫn bị `READ_ONLY_REFUSAL` (chứng minh D-03 không hở); (6) `deleteTeam` xoá cả cây nhưng **không** xoá folder `AI Teams`; (7) backfill chạy hai lần không nhân bản; (8) `docsFolderId` trỏ folder đã xoá → tạo lại; (9) `addTeamMember` tạo folder con ngay; (10) `removeTeamMember` **không** xoá folder.

## Deferred Ideas

- Cây sâu hơn 3 cấp / agent tự tạo folder.
- UI riêng cho docs của nhóm (cây hiện trong DocsExplorer là đủ).
- Skill body của BA/SA/Reviewer — viết **sau** khi Phase 41 + 42 xong, vì skill mô tả hành vi dựa trên tool surface thật.
- Xoá folder của member khi gỡ member khỏi nhóm (owner chọn giữ lại).

## Wording Corrections Required This Phase

ROADMAP §Phase 41 success criteria 2 and 4, and REQUIREMENTS `AIO-DOCS-02`/`AIO-DOCS-04`, say a member calls `create_note`/`update_note`. That wording is **wrong** and is superseded by D-01: the runtime's read-only gate (`chatTurnRuntime.ts:397`) refuses every employee mutation before the approval card, so a DB-tool write can never land. The member's write path is the team tool `write_doc`. The plan must correct that wording in `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` in the same phase (this document wins per its Owner decision header).
