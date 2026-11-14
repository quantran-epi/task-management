# Phase 39: Skill versioning + enrichment approval - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Một agent đề xuất được bài học; user xem nó dưới dạng diff; và **chỉ hành động duyệt của user** mới tạo ra đúng một version approved mới, giữ được version cũ để tra cứu.

Phase này gồm: tool `propose_skill_version` cho agent; row `pending` ghi ngay khi đề xuất (không đổi gì khác); duyệt/từ chối qua card chat và qua `SkillEditorDrawer`; duyệt ghi đè `aiSkills.name/description/body` trong một transaction; sửa tay cũng tạo version approved mới; pin `skillVersion` trên assignment row để agent đang chạy không bị đổi skill giữa chừng; `read_skill` tra đúng version đã pin; bọc untrusted cả `description` lẫn body; danh sách version + mục "Chờ duyệt" trong `SkillEditorDrawer`; **section "Kỹ năng" trong `AiStaffExplorer`** để tạo/sửa/xóa skill từ UI thật.

Phase này **không** gồm: leader/agent CRUD (Phase 40 — AIO-LEAD-01..04); explorer 2 tầng và walkthrough tổng (Phase 40); khôi phục version cũ (R-12 vẫn mở); nhiều skill per agent (R-11 vẫn mở, `AiEmployee.skillId` scalar giữ nguyên); token accounting (Phase 38 đã chốt); scheduler/concurrency (Phase 37 đã chốt).

**Override có chủ ý — đọc kỹ:** ROADMAP §Phase 39 success criterion 1 ghi *"Leader, agent, and skill CRUD work with validation, empty states, and error handling"*. Discuss chốt **Phase 39 chỉ làm skill CRUD**; phần leader/agent CRUD thuộc Phase 40 (AIO-LEAD-01..04 + criterion 3 của Phase 40). Criterion 1 đọc lại thành: *"Skill CRUD works with validation, empty states, and error handling — no crash on network or AI failure. Leader/agent CRUD is Phase 40."* Phải sửa wording trong `ROADMAP.md` và `REQUIREMENTS.md` cùng phase để agent sau không đọc wording cũ và tưởng đây là gap.

**C-16 tiếp tục chi phối:** dữ liệu cũ là test, không cần migration bảo toàn. Nhưng validation, atomicity, backup đúng cho dữ liệu mới vẫn bắt buộc.

</domain>

<decisions>
## Implementation Decisions

### Cơ chế đề xuất
- **D-01:** Agent đề xuất bằng **team tool `propose_skill_version`** nó tự gọi trong lượt. Không có bước tự động sau lượt, không có nút user bấm. Lý do: khớp `AIO-SKILL-02` ("after a run an agent can propose"), không tốn thêm lượt model, không sinh đề xuất rác khi không có gì mới. — **Reversibility:** reversible — thêm/bỏ một tool trong `TEAM_TOOL_DEFINITIONS` và payload agent.
- **D-02:** Tool chỉ cho phép đề xuất cho **skill đang gán cho chính agent gọi** (`ctx.skillId`). Leader không có skill nên bị loại tự nhiên; không cần thêm guard riêng cho leader. Gọi khi `ctx.skillId` rỗng → refusal `SKILL_NOT_ASSIGNED` (dùng lại mã đã có trong `teamTools.ts`).
- **D-03:** Đề xuất chứa **toàn văn body mới** + `name` + `description` + `evidence` tuỳ chọn. **Không** patch theo section. Lý do: version row đã có sẵn cả 3 field; diff sinh bằng `createUnifiedLineDiff(bodyCũ, bodyMới)`; một tool call, không cần `baseHash`/`sectionId`, không cần `get_artifact` trước. `patch_artifact_section` giữ nguyên cho note và sửa tay.
- **D-04:** Tool **ghi row `pending` ngay** khi được gọi và trả về diff. **Không** park trên approval card. Lý do: pending là dữ liệu trơ — không đổi gì cho tới khi user duyệt, đúng `AIO-SKILL-02` "the proposal changes nothing until the user approves it". Park trên card sẽ bắt user bấm hai lần (duyệt đề xuất, rồi duyệt version) cho cùng một việc.
- **D-05:** Tool **không** nằm trong `MUTATION_TOOLS`. Ghi một row `pending` không phải mutation theo nghĩa cần approval gate. Hệ quả: `isMutationTool('propose_skill_version')` phải trả `false`, và phải có test khẳng định điều đó — nếu không, `onMutationCheck` sẽ park nó và phá D-04.
- **D-06:** Tool nằm trong **employee payload** (không phải `LEAD_ONLY_TEAM_TOOLS`). Leader cũng nhận tool trong payload nhưng sẽ bị refusal `SKILL_NOT_ASSIGNED` khi gọi — chấp nhận được, rẻ hơn là tách payload riêng. **Không** đặt trong `EMPLOYEE_READ_ONLY_ALLOWLIST` (đó là allowlist tool DB, không phải team tool).

### Ngữ nghĩa version
- **D-07:** Duyệt ghi **đè `aiSkills.name`/`description`/`body`** từ version row trong **cùng một transaction** với việc set `status='approved'` + `decidedAt`. `aiSkills` tiếp tục là bản approved hiện hành; runtime `read_skill` và prompt không đổi nguồn đọc.
- **D-08:** **Giữ `aiSkills.body`.** Không bỏ field. Lý do: backup schema là `strictObject`; bỏ `body` buộc bump envelope và sửa `read_skill`, `patchProposal`, mọi chỗ đọc `skill.body`. Giữ lại thì diff nhỏ nhất và an toàn dữ liệu nhất.
- **D-09:** **Sửa tay trong `SkillEditorDrawer` cũng tạo một version `approved` mới** (do user tạo, `decidedAt` = thời điểm lưu) và cập nhật `aiSkills` trong cùng transaction. Hệ quả: **một quy tắc duy nhất** — mọi thay đổi name/description/body đều có history. Không còn đường ghi nào bỏ qua version.
- **D-10:** **Row version đầu tiên của một skill = version 1.** Baseline ngầm (body hiện tại trên `aiSkills` khi bảng version còn rỗng) chỉ tồn tại khi chưa có row nào. Không tạo row ngầm, không migration. Lần duyệt/sửa đầu tiên tạo `version = 1` và nó thay thế baseline.
- **D-11:** Version row gói **cả 3 field** `name`/`description`/`body`. Đề xuất của agent được đổi cả mô tả — vì mô tả là thứ agent thấy upfront và là chỗ cần cải thiện.
- **D-12:** Version cũ **chỉ xem, không khôi phục**. R-12 chưa được duyệt. Lịch sử hiển thị đủ nội dung từng bản, không có nút Restore.
- **D-13:** **Không thêm field `approvedBy`/`decidedBy`.** App chỉ có một user; `decidedAt` đã có là đủ. Field hằng số `'user'` không mang thông tin.

### Số version và phát hiện bản cũ
- **D-14:** **Pending không chiếm số version.** `version` chỉ được gán lúc duyệt (`max(version) + 1` trên các row `approved`). Hệ quả: `createSkillVersion` phải đổi — pending tạo ra với `version = 0` (hoặc bỏ trống) thay vì `latest + 1` như hiện tại. Lý do: ba pending cùng lúc không được đánh số v2/v3/v4 rồi để lại lỗ hổng khi chỉ một cái được duyệt.
- **D-15:** Thêm field **`baseVersion`** trên version row = số version `approved` lớn nhất tại thời điểm đề xuất (`0` khi chưa có bản approved nào). So `baseVersion` với version approved hiện tại để biết "dựa trên bản cũ". Field **optional** để backup cũ vẫn đọc được qua `strictObject` (vắng mặt = hợp lệ).
- **D-16:** Có nhiều pending cho cùng skill. **Duyệt một cái thì các pending còn lại vẫn `pending`** (không tự reject — trái C-13), nhưng card của chúng hiển thị cảnh báo "dựa trên bản cũ" và **nút Duyệt bị chặn** cho tới khi agent đề xuất lại. Lý do: cho duyệt bản cũ sẽ ghi đè nội dung vừa duyệt bằng diff cũ.

### Pin version
- **D-17:** Pin `skillVersion` **trên assignment row** lúc `createAssignment` = số version `approved` lớn nhất tại thời điểm đó (`0` khi chưa có row approved nào → baseline ngầm). Field `AiTeamAssignment.skillVersion` đã tồn tại trong type và backup schema; phase này chỉ điền giá trị ở cả 3 chỗ `createAssignment` (`teamRunCoordinator.ts:2303`, `:3245`, và chỗ dispatch ban đầu `:2857`).
- **D-18:** `read_skill` **tra đúng version row khớp số đã pin**, fallback `aiSkills.body` khi không có row (baseline ngầm hoặc `skillVersion = 0`). Cần truyền `skillVersion` vào `TeamToolContext`. Đây là **thực thi pin thật** — nếu chỉ ghi số mà vẫn đọc `aiSkills.body`, duyệt giữa batch sẽ đổi skill của agent đang chạy, vi phạm criterion 5 và đúng Pitfall 18.
- **D-19:** **Chốt đầu lượt, không đổi giữa lượt.** Roster đọc tươi đầu mỗi lượt (Phase 36 D-07); attempt row pin số tại lúc tạo. Duyệt giữa batch **không** ảnh hưởng agent đang chạy. **Lượt sau, retry, và agent mới trong cùng nhóm nhận version mới ngay** — không cần tạo nhóm mới, không cần relaunch.
- **D-20:** Prompt **không nêu số version**. Prompt chỉ có tên + mô tả như hiện tại. Số version là dấu vết kỹ thuật, không giúp model làm việc tốt hơn.
- **D-19a (chốt khi plan, 2026-11-14):** **Retry = lần chạy mới → pin lại theo version approved mới nhất.** Code hiện tại tại `teamRunCoordinator.ts:3246` đang inherit pin của attempt nguồn — phải sửa thành tính lại. Phân biệt rõ: **amend** (`:2304`) inherit (cùng attempt, task mới); **retry** (`:3246`) tính lại; **dispatch** (`:2852`) tính lần đầu.

### Bảo mật prompt
- **D-21:** Bọc **cả `description`** bằng `wrapUntrusted` trong `buildEmployeeTurnRequest` (`teamPrompts.ts:90-98`), không chỉ body. Lý do: sau khi duyệt, mô tả có thể do model viết → kênh prompt injection. Đúng tinh thần `AIO-SKILL-06` ("skill bodies, including approved ones, are wrapped as untrusted data").
- **D-22:** `read_skill` tiếp tục bọc body (đã đúng, `teamTools.ts:290`). Khi đọc theo version đã pin, vẫn bọc — approved **không** có nghĩa là trusted.

### Duyệt và UI
- **D-23:** Duyệt/từ chối **ghi DB ngay tại UI** bằng `decideSkillVersion(id, status)`. Không resolve tool rồi để agent gọi lại — thêm vòng model và model có thể không gọi, khiến user tưởng đã duyệt nhưng DB không đổi. Đúng `AIO-SKILL-04`: chỉ hành động của user mới ghi.
- **D-24:** Card chat **tái dùng `PatchDiffApprovalCard`** (đã render diff note/skill). Thêm nhánh cho đề xuất skill: nút Duyệt/Từ chối gọi `decideSkillVersion`. Không viết component mới.
- **D-25:** Duyệt ở **hai nơi**: card trong transcript (duyệt tức thì) và mục "Chờ duyệt" trong `SkillEditorDrawer` (duyệt sau, kể cả sau relaunch). Cả hai đọc cùng một pending row và gọi cùng một hàm.
- **D-26:** Lịch sử version **mở rộng `SkillEditorDrawer`** hiện có: danh sách version (số, ngày, trạng thái) + mục "Chờ duyệt" với diff và nút Duyệt/Từ chối. Không tạo view/drawer mới.

### Phạm vi CRUD
- **D-27:** Phase 39 chỉ làm **skill CRUD** (tạo/sửa/xóa skill + lịch sử version + danh sách chờ duyệt). Leader/agent CRUD → Phase 40.
- **D-31:** **UI quản lý skill đặt trong `AiStaffExplorer`** (tool window `ai_staff`, "AI Staff"). Thêm section "Kỹ năng" thứ ba bên cạnh nhân viên và lead, tái dùng `SkillCard` + `SkillEditorDrawer`. Lý do: `AiStaffExplorer` đã có sẵn danh sách + nút tạo + drawer sửa + thông báo lỗi; AI Staff là nơi quản hồ sơ AI, không phải nơi quản nhóm chat. Phase 40 sẽ gộp thành explorer 2 tầng.
- **D-32:** `AiOfficeView` (`src/views/AiOfficeView.tsx`, render qua `viewType: 'agents'`) là **dead code trong runtime hiện tại** — không có trigger nào mở tab `'agents'`. **Để nguyên**, không xóa trong phase này; Phase 40 quyết xóa hay gộp. Không sửa file đó trừ khi cần cho test.
- **D-33:** Đường vào UI skill là **section "Kỹ năng" trong `AiStaffExplorer`** (xem D-31). Nút tạo, danh sách, sửa, xóa đều nằm ở đó. Không thêm route/tab mới, không hồi sinh `AiOfficeView`.
- **D-28:** Xóa skill **xóa luôn toàn bộ version rows** trong cùng transaction (code hiện tại đã đúng — `deleteSkill` ở `aiOfficeRepo.ts:295`). Vẫn chặn xóa khi còn agent gán hoặc đang chạy (Phase 36 D-12/D-13). Không đổi hành vi.
- **D-29:** Đề xuất pending **treo tới khi user quyết**. Không tự hết hạn, không job dọn dẹp, không ngưỡng thời gian.

### Docs phải sửa cùng phase
- **D-30:** Ghi override D-27 vào `ROADMAP.md` §Phase 39 success criterion 1 và `REQUIREMENTS.md` (`AIO-SKILL-01`), để agent sau không đọc wording cũ và tưởng leader/agent CRUD là gap của phase này. Cùng cách Phase 37/38 đã xử lý override.

### Claude's Discretion
- Tên chính xác của field `baseVersion` (phải qua `FORBIDDEN_BACKUP_KEYS`; tránh `error`, `runtime`, `prompt`, `stack`, `diagnostic`).
- ~~Cách biểu diễn `version = 0` cho pending~~ — **đã chốt bởi research (A1):** pending **bỏ trống** `version`. Lý do đã kiểm chứng bằng probe: `BackupAiSkillVersionRecordSchema.version` là `positive()` nên `version: 0` **fail import**; và `validateBackup` dedupe theo `${skillId}:${version}` nên hai pending cùng `0` **từ chối toàn bộ payload**. Bỏ trống thì compound index bỏ qua row, `where('skillId')` vẫn tìm được, `getLatestSkillVersion` đúng theo cấu trúc.
- Vị trí chính xác của mục "Chờ duyệt" và danh sách version trong `SkillEditorDrawer`.
- Cách hiển thị diff khi `aiSkills.body` là baseline ngầm (không có row để so) — **research đề xuất:** dùng `aiSkills.body` làm base, nhãn `a/skill:<id> (bản hiện tại)`.
- Nội dung chính xác của `evidence` và cách hiển thị nó trong card duyệt — **research đề xuất:** panel `Collapse` "Bằng chứng" thu gọn dưới diff, chỉ hiển thị, không đưa vào prompt.
- Có cần thêm index Dexie mới hay dùng lại `[skillId+version]` đã có — **research kết luận:** không cần index mới, không bump Dexie, không bump envelope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quyết định và phạm vi
- `.planning/ROADMAP.md` §Phase 39 — goal + success criteria 1–6; criterion 1 đọc theo D-27/D-30.
- `.planning/REQUIREMENTS.md` — `AIO-SKILL-01..06`; `AIO-SKILL-01` bị D-27 override phần leader/agent.
- `.planning/MILESTONE-CONTEXT.md` — C-13 (skill enrichment do user duyệt version), C-14 (UI), C-15 (verify bằng quan sát), C-16 (không migration); R-11 (một skill per agent — vẫn mở), R-12 (restore version — vẫn mở).
- `.planning/PROJECT.md` — constraints "Studio artifact writes", "Verification honesty".
- `CLAUDE.md` — Tauri là runtime duy nhất; không làm PWA/GitHub Pages.

### Nghiên cứu — đọc trước khi plan
- `.planning/research/SUMMARY.md` — §Phase 39 (delivers + acceptance), §"Zero new dependencies", §"Critical Pitfalls".
- `.planning/research/PITFALLS.md` — **Pitfall 18** (skill edit mutate in place → pin version), **Pitfall 19** (enrichment writes directly / claims approval), **Pitfall 20** (`strictObject` backup forward-compat).
- `.planning/research/ARCHITECTURE.md` — `patchProposal.ts` extraction, `PatchDiffApprovalCard` generalization.

### Quyết định phase trước — không mở lại
- `.planning/phases/36-data-model-multi-chat-identity-backup-migration/36-CONTEXT.md` — **D-12** (chặn xóa skill khi còn gán), **D-13** (lượt đang chạy chặn xóa), **D-16** (backup giữ pending + approved, restore không đổi status), **D-15** (transaction), **D-22** (Dexie version).
- `.planning/phases/37-runtime-reliability-concurrency/37-CONTEXT.md` — D-22/D-23 (ledger append-only, attempt = row mới), D-09 (`transitionAssignment` là cửa ghi trạng thái duy nhất).
- `.planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-CONTEXT.md` — D-24 (baseline usage key theo lượt), D-27/D-28 (`LEAD_ONLY_TEAM_TOOLS` khai báo một nơi).
- `.planning/phases/38-hard-token-budget-accurate-measurement/38-CONTEXT.md` — D-01 (budget chỉ cảnh báo, không chặn), D-09 (`normalizeUsageTotal`).

### Source contracts — đọc trước khi sửa
- `src/db/repositories/aiSkillVersionRepo.ts` — toàn bộ file. `createSkillVersion` (:52-83) phải đổi cho D-14; `decideSkillVersion` (:85-101) phải đổi cho D-07 (ghi đè `aiSkills` cùng transaction) và D-14 (gán số lúc duyệt); `getLatestSkillVersion` (:40-50) đang đọc theo `[skillId+version]` — phải xem lại khi pending không chiếm số.
- `src/db/repositories/aiOfficeRepo.ts` — `createSkill` (:233-252), `updateSkill` (:254-272 — phải tạo version theo D-09), `deleteSkill` (:285-301 — đã đúng theo D-28), `countAgentsUsingSkill` (:303+).
- `src/db/schema.ts` — `aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt'` (:139); `aiSkills: 'id, name, createdAt'` (:125).
- `src/types/aiOffice.ts` — `AiSkill` (:69-76), `AiSkillVersion` (:126-138), `AiSkillVersionStatus` (:124), `AiEmployee.skillId` (:52-53), `AiTeamAssignment.skillId`/`skillVersion` (:212-213).
- `src/validation/aiOfficeSchemas.ts` — `AiSkillVersionInputSchema` (:143-150), `AiSkillInputSchema`/`AiSkillUpdateSchema`.
- `src/validation/backupSchemas.ts` — `BackupAiSkillRecordSchema` (:637-644, `strictObject`), `BackupAiSkillVersionRecordSchema` (:690-701, `strictObject`), `FORBIDDEN_BACKUP_KEYS` (:194-198), `skillVersion` trên assignment (:753).
- `src/services/ai/office/teamTools.ts` — `TEAM_TOOL_DEFINITIONS` (:53), `LEAD_ONLY_TEAM_TOOLS` (:216-219), `TeamToolContext` (:21-29), `TeamToolRefusalCode` (:31-41), `readSkill` (:277-292), `executeTeamTool` switch (:494-516).
- `src/services/ai/office/teamPrompts.ts` — `wrapUntrusted` (:47-54), `neutralizeDelimiters` (:36-41), `buildEmployeeTurnRequest` skill block (:90-98 — chỗ bọc `description` theo D-21).
- `src/services/ai/office/teamRunCoordinator.ts` — `skillFor` (:1072-1076), `employeeTools` (:1092-1094), `leadTools` (:1078-1090), `toolContext` (:1062-1070), `createAssignment` call sites (:2303, :2857, :3245 — chỗ pin `skillVersion` theo D-17), `TurnRoster.skills` (:205).
- `src/services/ai/patchProposal.ts` — `ArtifactPatchProposal` (:60-74), `preparePatch` (:191+), `readPatchTarget` (:97-122), `createUnifiedLineDiff` wiring.
- `src/utils/lineDiff.ts` — `createUnifiedLineDiff`, `MAX_DIFF_CELLS`.
- `src/components/ai/widget/PatchDiffApprovalCard.tsx` — toàn bộ file (component tái dùng theo D-24).
- `src/components/ai/office/SkillEditorDrawer.tsx` — toàn bộ file (mở rộng theo D-09/D-26).
- `src/components/ai/office/SkillCard.tsx` — card hiện tại; có thể cần badge số pending.
- `src/workbench/toolwindows/AiStaffExplorer.tsx` — toàn bộ file (thêm section "Kỹ năng" theo D-31/D-33). Đã có: search, nút tạo, `EmployeeEditorDrawer`/`LeadEditorDrawer`, `refusalMessage`, `openTab` cho staff detail.
- `src/workbench/toolwindows/LeftToolWindow.tsx` — `ai_staff` render `AiStaffExplorer` (:140-141).
- `src/workbench/WorkbenchLayout.tsx` — `DEFAULT_BOTTOM_LEFT_ITEMS` khai báo `ai_staff` (:66-72).
- `src/components/ai/AiChatWidget.tsx` — `PatchDiffApprovalCard` render (:485-486), `artifactApprovalState`/`artifactDecision` props (:75-76).
- `src/components/ai/runtime/chatTurnRuntime.ts` — patch branch trong `onMutationCheck` (:400-435), `PATCH_TOOL_NAME` (:160), `preparedPatches`.
- `src/services/ai/aiTools.ts` — `MUTATION_TOOLS` (:4706-4752), `isMutationTool` (:4763-4773), `executeAiTool` switch case `patch_artifact_section` (:2152-2154).
- `src/services/ai/chatTurnTools.ts` — `EMPLOYEE_READ_ONLY_ALLOWLIST` (:15-32), `LEAD_TOOL_ALLOWLIST` (:35-40), `getToolsForTurn`.
- `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts` + `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` — 5 danh sách phải cập nhật cùng lúc nếu thêm field.
- `tests/services/ai/office/aiSkillVersionRepo.test.ts` — mở rộng, không thay thế.
- `tests/services/ai/office/teamTools.test.ts` — mở rộng cho `propose_skill_version`.
- `tests/services/ai/office/teamPrompts.test.ts` — mở rộng cho bọc `description`.
- `tests/ai/chatTurnRuntime.test.ts`, `tests/ai/PatchDiffApprovalCard.test.tsx` — mở rộng.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`aiSkillVersions` table + repo đã tồn tại** (`aiSkillVersionRepo.ts`) nhưng **không nơi nào trong production ghi vào** — chỉ test. Phase này nối nó vào đường thật, không dựng lại.
- `AiSkillVersion` type đã có đủ `name`/`description`/`body`/`evidence`/`status`/`createdAt`/`decidedAt` — đúng shape cho D-11, chỉ thiếu `baseVersion`.
- `PatchDiffApprovalCard` đã render diff với `+/−` lines, cảnh báo stale, nút Duyệt/Từ chối — tái dùng nguyên cho D-24.
- `wrapUntrusted` + `neutralizeDelimiters` đã có và đã áp cho `read_skill` body; chỉ cần áp thêm cho `description`.
- `createUnifiedLineDiff` + `MAX_DIFF_CELLS` đã có, không cần thư viện diff.
- `deleteSkill` đã cascade version rows trong transaction — đúng D-28, không sửa.
- `TeamToolRefusal` pattern (refusal là giá trị trả về, không throw) — dùng cho `propose_skill_version`.
- `LEAD_ONLY_TEAM_TOOLS` khai báo một nơi, payload employee derive từ đó (37.1 D-27/D-28) — thêm tool mới tự động vào employee payload.

### Established Patterns
- `strictObject` trên backup schema: field mới **phải optional** để backup cũ vẫn validate (Pitfall 20).
- `FORBIDDEN_BACKUP_KEYS` chặn theo regex tên key (`error`, `runtime`, `prompt`, `stack`, `diagnostic`).
- Mọi thay đổi bảng phải cập nhật **5 danh sách** cùng lúc (schema, export, restore, validate, SQLite TS + Rust).
- Domain state trong Dexie; Zustand chỉ cho UI state.
- `transitionAssignment` là cửa ghi duy nhất cho trạng thái assignment.
- Refusal là giá trị trả về có `code` + `message`, không throw.
- Không chạy full Vitest suite (user rule); test tập trung theo từng success criterion.

### Integration Points
- `TEAM_TOOL_DEFINITIONS` — nơi thêm `propose_skill_version` (D-01).
- `executeTeamTool` switch — nơi dispatch handler mới.
- `TeamToolContext` — nơi thêm `skillVersion` cho D-18.
- `readSkill` — nơi đọc version đã pin thay vì `aiSkills` trực tiếp (D-18).
- `buildEmployeeTurnRequest` skill block — nơi bọc `description` (D-21).
- `createAssignment` × 3 call sites — nơi pin `skillVersion` (D-17).
- `decideSkillVersion` — nơi ghi đè `aiSkills` + gán số version (D-07, D-14).
- `updateSkill` — nơi tạo version approved khi sửa tay (D-09).
- `SkillEditorDrawer` — nơi thêm lịch sử version + mục "Chờ duyệt" (D-26).
- `AiStaffExplorer` — nơi thêm section "Kỹ năng" + nút tạo + drawer (D-31/D-33).
- `MUTATION_TOOLS` — nơi **không** thêm `propose_skill_version` (D-05).

### Dead code — không chạm
- `src/views/AiOfficeView.tsx` render qua `viewType: 'agents'` trong `EditorArea.tsx:596`, nhưng **không có trigger nào mở tab `'agents'`** (không có `openTab({viewType:'agents'})` trong `TitleBar`, `SearchEverywhereModal`, `AiStaffExplorer`, `AiOfficeExplorer`). Đây là dead code trong runtime Tauri/IntelliJ. Phase 39 **không sửa** (D-32); Phase 40 quyết.

</code_context>

<specifics>
## Specific Ideas

- User về phạm vi pin: **"thế nếu đang chạy mà agent đề xuất skill hữu ích, không thể áp dụng ngay trong nhóm cho những lượt chạy sau được à"** — nguồn của D-19. Pin theo **lần chạy**, không theo nhóm; lượt sau trong cùng nhóm nhận version mới ngay.
- User về CRUD: **"CRUD về cái gì nhỉ, chưa hiểu"** — dẫn tới việc giải thích 3 loại hồ sơ (leader/agent/skill) và chốt D-27 (chỉ skill).
- User về UI tạo skill: **"phase này sẽ tạo skill đúng ko, vì tôi chưa thấy chỗ nào trên UI cho phép tạo create new skill"** — nguồn của D-31/D-32/D-33. Đã xác minh: `AiOfficeView` có nút "Tạo kỹ năng" nhưng là dead code; hai tool window thật (`ai_staff`, `ai_office`) không có chữ "skill" nào.
- User chọn "pin trên assignment" + "đọc body hiện hành" ban đầu — hai lựa chọn xung đột; đã phát hiện và chốt lại bằng D-18 (đọc đúng version đã pin) để criterion 5 thực sự được thực thi.
- **"đừng bao giờ suggest tôi là làm cái này thì đơn giản, cái tôi cần là chất lượng"** (37-CONTEXT) — không tối giản schema, không bỏ edge case.

### Ambiguity resolved during discussion
- "Pin chỉ là dấu vết" vs "pin thực thi" — ban đầu user chọn dấu vết, nhưng điều đó không đáp ứng criterion 5. Đã giải thích bằng ngôn ngữ đời thường (photo sách / nhớ trong đầu / không làm gì) và chốt D-18.
- Pending có chiếm số version hay không — chốt D-14 (không), kéo theo phải đổi `createSkillVersion` và thêm `baseVersion` (D-15) để phát hiện bản cũ.

</specifics>

<deferred>
## Deferred Ideas

- Leader/agent CRUD → Phase 40 (AIO-LEAD-01..04, criterion 3).
- Khôi phục version cũ (R-12) — chưa được duyệt; phase này chỉ cho xem lịch sử.
- Nhiều skill per agent (R-11) — `AiEmployee.skillId` scalar giữ nguyên.
- Explorer 2 tầng, walkthrough tổng → Phase 40.
- Tự hết hạn đề xuất pending — user chọn treo tới khi quyết (D-29).
- Đề xuất mới thay pending cũ — không cần; nhiều pending duyệt độc lập (D-16).

Không có todo pending khớp Phase 39 (`todo.match-phase` = 0).

</deferred>

---

*Phase: 39-skill-versioning-enrichment-approval*
*Context gathered: 2026-11-14*
