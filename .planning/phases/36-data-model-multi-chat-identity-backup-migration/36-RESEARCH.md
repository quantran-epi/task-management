# Phase 36: Data model, multi-chat identity, backup/migration - Research

**Researched:** 2026-11-10
**Domain:** Dexie schema evolution + backup/serialize contract trong Tauri desktop app (TaskMate, AI Office)
**Confidence:** HIGH cho source-grounded contract; MEDIUM cho vài ranh giới runtime (D-03/D-13) vì chưa chạy Tauri thật.

## Summary

Toàn bộ nền dữ liệu Phase 36 đã tồn tại dưới dạng sáu bảng AI Office từ Phase 34, và identity nhóm chat đã đúng: `buildScopeKey('team', teamId)` trả `team:<teamId>` và `ensureTeamThread` tái dùng thread theo scope. Không cần container mới, không cần namespace `team:<id>:chat:<uuid>` (D-25). Việc thật sự phải làm là **bốn lỗ hổng contract** và **một bảng mới**:

1. Nhóm rỗng (chưa có leader) hiện **không thể tồn tại**: `AiTeam.leadId` là bắt buộc ở cả type, Zod input và backup schema. D-05 đòi trạng thái này là hợp lệ.
2. Leader lock (D-09) chưa có trường lưu bền nào.
3. `deleteEmployee` / `deleteLead` / `deleteSkill` là bare delete. Hậu quả đã kiểm chứng: một `aiTeams.leadId` trỏ lead đã xóa **làm chính backup của app fail validation** (`validateBackup.ts:474-478`), tức vi phạm AIO-GROUP-05 và D-20 theo cách tự gây.
4. `targetAgentId` bị Zod strip khi import. **Đã chạy probe thật**: `BackupChatMessageRecordSchema.parse()` trả object **không còn** `targetAgentId` (`has targetAgentId after parse: false`). Đây là Pitfall 22/D-18, phải có regression tái hiện trước khi sửa.

Bảng mới `aiSkillVersions` chưa tồn tại ở bất kỳ đâu trong `src/`. Dexie version cuối là **V18** (`src/db/schema.ts:133`), nên V19 là số đúng.

Ngoài ra research phát hiện hai drift liên quan trực tiếp tới "all table lists synchronized": `src-tauri/src/sqlite_persistence.rs` `ALLOWED_TABLES` **thiếu** `chatTabs`, `systems`, `changeRequests` (và các bảng knowledge/telegram) trong khi TS `SQLITE_DOMAIN_TABLES` có — nghĩa là flush SQLite thật sẽ trả `SQLITE_INVALID_TABLE` cho các bảng đó. Và `AI_OFFICE_TABLE_KEYS` là danh sách sáu bảng cứng, thêm bảng thứ bảy mà quên nó thì restore sẽ không clear versions cũ.

**Primary recommendation:** Thêm Dexie V19 thuần additive (`aiSkillVersions` + index), mở `leadId` thành optional, thêm `leaderLockedAt`, thêm `targetAgentId` vào backup message schema, đổi envelope lên **12**, gom toàn bộ chín danh sách bảng vào một change set, và đặt live-reference guard ở repository trong transaction. Không thêm dependency, không thêm bảng trạng thái runtime.

## User Constraints

<user_constraints>
### Locked Decisions (nguyên văn từ 36-CONTEXT.md)

- **D-01:** Leader là entity domain riêng (C-05). Leader có hồ sơ toàn cục dùng lại trong nhiều nhóm; không sao chép hồ sơ riêng từng nhóm.
- **D-02:** Agent cũng có hồ sơ toàn cục dùng lại như leader. Sửa persona/model áp dụng cho lượt giao việc mới ở mọi nhóm đang dùng hồ sơ đó.
- **D-03:** Lượt đang chạy giữ cấu hình đã nhận. Lượt tiếp theo đọc hồ sơ mới ngay, không cần mở lại tab/app; không dùng hồ sơ cũ bị cache trong coordinator. Thay đổi giữa chừng không sửa hành vi lượt đang chạy.
- **D-04:** Từng nhóm tách hoàn toàn transcript, phân công và ngân sách/usage. Chỉ chung hồ sơ và skill; không tự nhớ lịch sử nhóm khác.
- **D-05:** Giữ luồng chat-first: tạo nhóm rỗng trước, thêm leader và agent sau; không bắt name + leader + budget trong form tạo. Nhóm chưa chọn leader phải là trạng thái dữ liệu hợp lệ.
- **D-06:** Không giới hạn số nhóm hoặc số agent mỗi nhóm (C-08/C-09). Xóa `MAX_ACTIVE_TEAMS`, `MAX_EMPLOYEES_PER_TEAM` và enforcement/copy tương ứng; không thay bằng cap khác. `MAX_BATCH_SIZE`/concurrency thuộc Phase 37, không dùng làm roster cap.
- **D-07:** Thêm/bớt agent sau tạo. Nếu đang xử lý một lượt yêu cầu, roster mới có hiệu lực từ lượt tiếp theo; lượt hiện tại tiếp tục với roster đã chốt. Không tự dừng agent vừa gỡ; agent mới không chen vào lượt hiện tại.
- **D-08:** Gỡ agent khỏi roster không xóa tin nhắn hoặc phân công cũ. Agent không nhận việc mới trong nhóm từ lượt tiếp theo.
- **D-09:** Leader được chọn/sửa trước lượt chạy đầu tiên. Khi bắt đầu lượt chạy đầu, leader bị khóa suốt đời nhóm: không đổi hoặc gỡ leader. Muốn leader khác sau mốc này thì tạo nhóm mới. Khóa phải được lưu bền và sống qua relaunch/backup, không chỉ disable control trong UI.
- **D-10:** Chặn xóa leader khi còn nhóm tham chiếu; thông báo rõ các nhóm đang dùng. Không tự xóa nhóm, không đổi leader ngầm.
- **D-11:** Chặn xóa agent khi còn membership đang dùng; cần gỡ khỏi các roster trước. Thông báo rõ nhóm đang dùng; không tự cascade.
- **D-12:** Chặn xóa skill khi còn được gán cho hồ sơ; user đổi/gỡ skill trước. Không âm thầm làm agent mất skill.
- **D-13:** Lượt đang chạy cũng chặn xóa hồ sơ/skill đang được nó sử dụng, kể cả đã gỡ liên kết cho lượt sau. Snapshot của lượt hiện tại phải được tính là live use đến khi kết thúc. Phần teardown/scheduler chuyên sâu vẫn thuộc Phase 37.
- **D-14:** Chỉ còn tham chiếu lịch sử thì cho xóa hồ sơ. Tin nhắn, attribution và phân công cũ vẫn đọc được; tên/ID lịch sử không đòi hồ sơ gốc tồn tại. Backup sau xóa vẫn phải validate. Phân biệt rõ live references (bắt buộc hợp lệ) với historical references (có thể trỏ hồ sơ đã xóa).
- **D-15:** Kiểm tra in-use và xóa dữ liệu phải nhất quán tại repository/trust boundary; không chỉ dựa vào count hiển thị trên UI. Mọi cập nhật nhiều bảng phải atomic, không để liên kết hỏng sau thao tác bị từ chối.
- **D-16:** Backup giữ cả lịch sử phiên bản skill đã duyệt và đề xuất đang chờ duyệt. Restore giữ đúng trạng thái; tuyệt đối không biến pending thành approved. Phase 36 chỉ dựng contract/store/round-trip, không triển khai UI hay cơ chế phê duyệt Phase 39.
- **D-17:** Tin nhắn giữ tên người gửi tại thời điểm gửi. Đổi tên hồ sơ không đổi tin nhắn cũ; tin mới lấy tên mới. Lịch sử vẫn hiển thị khi hồ sơ bị xóa.
- **D-18:** Giữ `targetAgentId` qua export → validate → restore, cùng attribution và lịch sử phân công. Viết regression tái hiện việc field bị strip trước khi sửa.
- **D-19:** Backup/relaunch khôi phục dữ liệu đã lưu hoàn chỉnh và token đã ghi nhận. Lượt chưa xong được đánh dấu gián đoạn/chưa hoàn tất; không tự gọi AI hoặc chạy lại, không lưu partial stream buffers, runtime objects hay secrets. Không tuyên bố có thể tiếp tục chính xác in-flight request sau restore.
- **D-20:** Backup mới sai định dạng hoặc hỏng live references bị từ chối toàn bộ trước mọi ghi dữ liệu. Báo lỗi rõ, không nhập một phần, không thay local data. Historical references tới hồ sơ đã xóa theo D-14 không phải lỗi.
- **D-21:** Giữ xác nhận rõ trước restore thay dữ liệu local và cơ chế transaction/snapshot đang có; C-16 không phải quyền ghi đè dữ liệu mới không xác nhận.
- **D-22:** Dexie mới dùng **V19**; V18 đã dùng cho purge SDLC của Phase 35. Sửa cách hiểu AIO-DATA-01 đang ghi V18; không tái sử dụng số migration.
- **D-23:** AIO-DATA-03/04 và Phase 36 success criteria 3/4 còn yêu cầu fixture pre-v1.4 và đọc backup hai chiều với build cũ: phần tương thích đó bị **C-16 thay thế**. Kiểm chứng round-trip dữ liệu mới, ID/counts/attribution/pending state/leader lock đầy đủ; không giữ schema cũ chỉ để thỏa wording lỗi thời.
- **D-24:** AIO-DATA-05/R-16 "giữ SDLC rows" đã bị C-16 và Phase 35 D-05..D-09 thay thế. SDLC bị xóa, không archive/filter-only, không khôi phục PL/CAB/change-pack state hay legacy schema. CR/Note/tài liệu generic còn dùng là context tùy chọn, không phải SDLC workflow.
- **D-25:** R-14 không đòi migration nhiều chat con/team: C-04 đã chốt một team = một nhóm chat. Không adopt legacy thread hoặc tạo namespace mới vì research cũ đề xuất.
- **R-01:** Cách lưu leader trong DB chưa chốt: giữ bảng hiện có hay biểu diễn khác tùy research; phải giữ leader là entity domain riêng và các D-quyết định trên. Không hỏi user cách chia bảng.
- **R-02:** Version envelope cụ thể chưa chốt; research chọn theo contract cuối, không bị ràng buộc giữ v11 hoặc đọc hai chiều với build cũ. File không hỗ trợ phải bị từ chối rõ trước ghi; không thêm bridge tương thích cũ.
- Schema/index tối thiểu cho `aiSkillVersions`, durable leader-lock và membership/history; tránh abstraction hoặc fields cho khả năng chưa được yêu cầu.
- Đảm bảo mọi table list TS/Rust, export/validate/restore/types/counts cùng cập nhật; giữ TS⊆Rust assertion theo roadmap. Không bắt buộc tạo registry mới nếu diff nhỏ hơn vẫn bảo đảm contract.
- Ranh giới đầu lượt và đầu lần chạy đầu phải được mô tả/test rõ; không để các tool round của cùng lượt nhận roster mới giữa chừng.

### Claude's Discretion

Không có mục "Claude's Discretion" riêng trong 36-CONTEXT.md. Vùng tự quyết nằm ở R-01, R-02 và dòng "Schema/index tối thiểu…" ở trên; user đã uỷ quyền chọn khuyến nghị, không hỏi lại.

### Deferred Ideas (OUT OF SCOPE)

- Phase 37: concurrency/default/scope, queue, abort, runtime teardown khi xóa nhóm, `MAX_BATCH_SIZE` semantics.
- Phase 38: chia/top-up token khi roster đổi, accounting/retry/missing-usage/threshold. Phase 36 chỉ không làm mất giá trị đã lưu hoặc trộn ngân sách giữa nhóm.
- Phase 39: một/nhiều skill per agent (R-11), skill version restore (R-12), proposal generation/approval UI; việc giữ lịch sử trong backup không tự phê duyệt chức năng restore version cũ.
- Phase 40: explorer redesign và chi tiết trình bày transcript (R-09); context này chỉ khóa identity/isolation và historical attribution, không mở thêm per-agent threads.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| AIO-GROUP-02 | `AiTeam` *is* the group chat; transcript stays `ChatThread` with `scopeKey = 'team:<teamId>'` | Đã đúng sẵn: `chatRepo.ts:38-43` + `teamTranscriptRepo.ts:32-39`. Chỉ cần test khẳng định một thread/nhóm và cấm namespace lồng. |
| AIO-GROUP-03 | Roster sửa được sau tạo; bỏ `MAX_ACTIVE_TEAMS` / `MAX_EMPLOYEES_PER_TEAM` khỏi repo, `teamTools`, `TeamEditorDrawer` | Inventory chính xác 12 điểm cap (xem §Coordinated-file inventory). Cap nằm ở `aiTeamRepo`, `TeamEditorDrawer`, `TeamCard`, `TeamsView`, `types/aiOffice`. `teamTools` chỉ có `MAX_BATCH_SIZE`, thuộc Phase 37. |
| AIO-GROUP-05 | Xóa leader/agent/skill có live reference phải refuse rõ hoặc cascade một transaction; export kế tiếp phải validate | §Live-reference guards: 3 bare delete + 4 khoảng trống validation + seam in-flight. |
| AIO-DATA-01 | `aiSkillVersions` vào Dexie **V19** + export/restore/validate/SQLite flush; thêm bảng phải cập nhật cả năm danh sách | §Coordinated-file inventory liệt kê 9 file (năm danh sách gốc + 4 chỗ suy ra). |
| AIO-DATA-02 | `targetAgentId` sống qua export → restore | Probe xác nhận bị strip; fix một dòng schema + regression. |
| AIO-DATA-03 | Round-trip dữ liệu mới với counts/ID/attribution/pending state/leader lock khớp | Test plan: một fixture v12 đầy đủ, so `toEqual` từng bảng. Fixture pre-v1.4 bị D-23 thay thế. |
| AIO-DATA-04 | Backup build cũ vẫn import / backup build này đọc được bởi build cũ | D-23 thay thế bằng "từ chối rõ ràng". Envelope 12 làm cả hai chiều reject tường minh. |
| AIO-DATA-05 | SDLC rows xử lý non-destructive | D-24: đã xóa ở Phase 35; Phase 36 chỉ xác nhận không resurrect. |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identity nhóm = `team:<teamId>` | Dexie / Storage | Repository | `chatThreads.scopeKey` unique index là nguồn duy nhất; repo chỉ build key. |
| Leader lock bền | Dexie / Storage | Repository | Cột trên `aiTeams`; UI chỉ đọc, không phải nơi giữ sự thật. |
| Roster add/remove | Repository (transaction) | UI (AntD Select) | D-15: kiểm tra + ghi trong cùng transaction; UI không tự quyết. |
| Live-reference guard | Repository | UI (hiển thị lý do) | D-15 nói rõ không dựa vào count trên UI. |
| In-flight snapshot = live use | Runtime (module registry in-memory) | Repository (consult) | D-13; runtime object không được backup (D-19) nên không persist. |
| `aiSkillVersions` | Dexie / Storage | Backup contract | Phase 39 viết UI/approval; Phase 36 chỉ bảng + round-trip. |
| Backup envelope/version | Service (`backup/`) | Validation (`validation/`) | Zod là trust boundary; envelope version là cổng trước mọi ghi. |
| SQLite mirror | Service (TS list) + Rust allowlist | — | Hai ngôn ngữ, một contract; drift hiện có phải đóng lại. |

## Standard Stack

**Không thêm dependency nào.** Mọi thứ cần thiết đã có trong `package.json` hiện tại:

| Library | Version (đã cài) | Purpose | Ghi chú |
|---------|---------|---------|------|
| dexie | `^4.4.6` | Schema version + transaction | `version(19).stores()` theo đúng pattern V17/V18. |
| dexie-react-hooks | `^4.4.0` | `useLiveQuery` cho roster | Đã dùng ở `TeamsView`, `TeamWorkspace`. |
| zod | `^4.6.5` | Backup schema | `strictObject` cho bảng mới; `z.object` cho `chatMessages`. |
| vitest | `^5.0.2` | Test | `fileParallelism: false` trong `vite.config.ts` → chạy focused, không full suite. |
| fake-indexeddb | `^6.2.5` | Dexie trong Node | Đã cài global trong `tests/setup.ts`. |
| antd | `^6.6.5` | Roster UI tối thiểu | `Select mode="multiple"`, `Popconfirm`, `Alert`. |
| rusqlite | `0.40.2` (Rust) | SQLite mirror | Chỉ sửa `ALLOWED_TABLES`. |

**Installation:** không có. Không cần chạy `npm install` cho phase này.

**Version verification:** không áp dụng — phase không thêm package. Các version trên đọc trực tiếp từ `package.json:23-72` (đã tồn tại trong repo, không phải đề xuất mới).

## Package Legitimacy Audit

**Không có package mới.** Phase 36 là schema/contract work trên stack đã cài; theo CONTEXT "reuse installed stack, không thêm dependency cho nền dữ liệu này" và chỉ đạo của parent ("no dependency additions unless strictly necessary"), không có package nào cần kiểm tra legitimacy.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — (none added) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────────┐
  UI edit roster ─────▶│ Repository (transaction, D-15)           │
  (TeamSettingsDrawer) │  addTeamMember / removeTeamMember        │
                       │  assignLeader / lockLeader               │
                       └───────────────┬──────────────────────────┘
                                       │ reads/writes
                                       ▼
   UI delete profile ──▶┌──────────────────────────────────────────┐
   (AiOfficeView)       │ Guard (same transaction)                 │
                        │  live refs: aiTeams.leadId,              │
                        │    aiTeamMembers.agentId, aiEmployees.skillId
                        │  + in-flight snapshot registry (D-13)    │
                        │  → refuse (typed) | delete               │
                        └───────────────┬──────────────────────────┘
                                        ▼
                             ┌─────────────────────┐
                             │ Dexie V19            │
                             │  aiSkillVersions NEW │
                             │  aiTeams(+lock,opt)  │
                             └──────┬───────────────┘
                                    │  nine synchronized lists
              ┌─────────────────────┼───────────────────────────┐
              ▼                     ▼                           ▼
   exportBackup (schemaVersion 12)  validateBackup      localSqlitePersistence
              │                     │  (envelope gate,          │  TS list
              │                     │   live-refs only)         ▼
              ▼                     ▼                     Rust ALLOWED_TABLES
        restoreBackup  ◀──── validated envelope ◀────  (clear+add group)
              │
              ▼
        Dexie (atomic, snapshot rollback)
```

Luồng chính của phase: sửa dữ liệu → chín danh sách đồng bộ → export → validate → restore → so khớp counts/ID/status.

### Recommended Project Structure (thay đổi tối thiểu)

```
src/
├── types/
│   ├── aiOffice.ts            # AiTeam.leadId?: string; leaderLockedAt?; AiSkillVersion
│   └── backup.ts              # + aiSkillVersions vào BackupTableData/Counts
├── validation/
│   ├── aiOfficeSchemas.ts     # AiTeamInput: leadId optional; AiSkillVersionInputSchema
│   └── backupSchemas.ts       # + BackupAiSkillVersionRecordSchema; targetAgentId; envelope 12
├── db/
│   ├── schema.ts              # SCHEMA_V19 (additive)
│   ├── index.ts               # Table + version(19)
│   └── repositories/
│       ├── aiOfficeRepo.ts    # delete* → guard + transaction
│       ├── aiTeamRepo.ts      # bỏ cap; assignLeader/lockLeader; add/remove member
│       ├── aiSkillVersionRepo.ts   # NEW, ~60 dòng
│       └── teamTranscriptRepo.ts   # không đổi contract
├── services/
│   ├── ai/office/
│   │   ├── liveUseRegistry.ts # NEW, in-memory, ~30 dòng (D-13)
│   │   └── teamRunCoordinator.ts  # roster snapshot theo lượt (seam, không rewrite)
│   ├── backup/{export,validate,restore}Backup.ts
│   └── localSqlitePersistence.ts
└── components/ai/office/
    ├── TeamEditorDrawer.tsx   # tạo nhóm rỗng
    ├── TeamSettingsDrawer.tsx # roster add/remove + leader (khóa)
    ├── TeamCard.tsx           # bỏ cap tooltip
    └── EmployeeCard.tsx       # copy xóa = refuse, không cascade
src-tauri/src/sqlite_persistence.rs  # ALLOWED_TABLES
```

### Pattern 1: Dexie additive version

**What:** thêm bảng và index mới mà không đụng index cũ, không cần `.upgrade()`.
**When to use:** V19 — đúng tiền lệ V17 (`src/db/schema.ts:119-129`, comment "Purely additive — no existing store index spec is touched, so no index rebuild and no `.upgrade()` hook is needed").

```ts
// src/db/schema.ts — sau SCHEMA_V18
// Phase 36 (D-16, D-22): skill version history. Purely additive.
export const SCHEMA_V19 = {
  ...SCHEMA_V18,
  aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt',
} as const;
```
`[skillId+version]` cho phép `where('[skillId+version]')` lấy bản mới nhất mà không `toArray()` toàn bảng — cần cho Phase 39.

### Pattern 2: Guard + delete trong một transaction, refuse bằng typed error

**What:** đếm live reference và xóa trong cùng `db.transaction('rw', ...)`; từ chối bằng object có `code` để UI phân biệt "đang dùng" với lỗi khác.
**When to use:** `deleteEmployee`, `deleteLead`, `deleteSkill` (D-10/D-11/D-12/D-15).

```ts
// Hình dạng khuyến nghị (chưa phải code cuối)
export type LiveRefRefusal = { code: 'IN_USE'; entity: 'lead' | 'employee' | 'skill';
  usedBy: Array<{ teamId: string; teamName: string }> | Array<{ employeeName: string }> };
```
Không throw chuỗi thô: UI cần đọc `usedBy` để hiện "nhóm A, nhóm B" theo D-10/D-11. Pattern refuse-by-value đã có tiền lệ trong `teamTools.ts:37-46` (`TeamToolRefusal`).

### Pattern 3: Snapshot theo lượt, không cache trong coordinator

**What:** đầu mỗi lượt (`send()` hoặc `runBatch`), coordinator đọc roster/profile tươi từ DB và chốt vào một biến của lượt; mọi tool round của lượt đó dùng đúng snapshot ấy.
**When to use:** D-03, D-07 và dòng "không để các tool round của cùng lượt nhận roster mới giữa chừng".

Hiện trạng vi phạm: `TeamWorkspace.tsx:170-264` tạo coordinator một lần với `employees`/`skills` là prop chụp tại thời điểm effect, và effect deps chỉ có `[team.id, db, createRuntimeDeps]` (comment WR-06 cố ý bỏ roster khỏi deps). Coordinator lưu `employees` trong closure (`teamRunCoordinator.ts:200`) → sửa persona/model **không bao giờ** tới lượt sau cho tới khi remount. Đây đúng là điều D-03 cấm ("không dùng hồ sơ cũ bị cache trong coordinator").

Seam tối thiểu, không rewrite runtime:
- `TeamRunCoordinatorOptions` nhận `loadRoster?: () => Promise<{ lead: AiLead; employees: AiEmployee[]; skills: AiSkill[] }>`; production truyền hàm đọc repo, test truyền mảng tĩnh (giữ nguyên 100% test hiện có).
- `send()` gọi `loadRoster()` **một lần** rồi giữ `turnRoster` cho tới khi lượt kết thúc; `parseMentionTarget`, `startEmployeeTurn`, `skillFor`, `runBatch` đọc `turnRoster`, không đọc closure.
- Không đổi `TeamRunSnapshot` công khai (tránh phá `TeamsView`/`TeamWorkspace`).

### Anti-Patterns to Avoid

- **Thêm bảng "run state" để đánh dấu lượt gián đoạn.** D-19 cấm lưu runtime objects/partial buffer; trạng thái gián đoạn suy ra được từ việc thiếu row `messageKind='report'` sau user message cuối. Thêm bảng là schema cho khả năng chưa được yêu cầu.
- **Đặt guard ở UI bằng `countTeamsUsingEmployee`.** D-15 cấm; UI chỉ hiển thị kết quả refuse.
- **Cascade xóa khi user chưa xác nhận.** D-10/D-11/D-12 chọn refuse, không cascade (trừ `deleteTeam` đã cascade member/link từ Phase 34 — giữ nguyên).
- **Bump envelope mà quên `assertNoLegacyTables`.** Cổng đó chạy trước envelope check (`validateBackup.ts:50-63`); giữ nguyên thứ tự.
- **Đặt `targetAgentId` vào live-reference validation.** Nó là historical (D-14/D-18); validate sẽ làm mọi backup sau khi xóa agent bị reject.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Versioned schema | Migration framework/registry mới | `db.version(19).stores(SCHEMA_V19)` | Dexie đã làm; CONTEXT nói "không bắt buộc tạo registry mới nếu diff nhỏ hơn". |
| Roster reactivity | Custom subscription/EventEmitter | `useLiveQuery` (đã dùng) | `dexie-react-hooks` cập nhật view khi bảng đổi. |
| Validation | Hand-rolled shape checks | Zod `strictObject` / `z.object` | Đã là trust boundary của backup. |
| Atomic multi-table | try/catch + rollback thủ công | `db.transaction('rw', [...], ...)` | Dexie rollback tự động; đã là pattern của `deleteTeam`, `createTeam`. |
| Version numbering | Tự đếm `max(version)+1` bằng query | Đọc `schemaVersion` trong envelope + hằng số | Hằng số là contract; query sẽ chậm và dễ sai. |
| SQLite mirror | Sync engine mới | `enqueueLocalSqliteChange` + hook có sẵn | `attachSqliteTableHooks` đã phủ `SQLITE_TABLES`. |

**Key insight:** Phase này là "làm đúng contract đã có", không phải xây hạ tầng mới. Mọi abstraction thêm vào đều làm tăng bề mặt phải đồng bộ giữa 9 danh sách.

## Runtime State Inventory

> Phase 36 là migration/schema-change phase → section này bắt buộc.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | Dexie `PersonalTaskPlannerDB`: 6 bảng AI Office + `chatThreads`/`chatMessages` (team scope) + `settings`. Dữ liệu test theo C-16 → không cần bảo toàn. | V19 additive: không đổi row cũ. `aiSkillVersions` khởi tạo rỗng. Không backfill. |
| **Stored data (row shape)** | Row `aiTeams` cũ luôn có `leadId`. Sau khi mở optional, row cũ vẫn hợp lệ (`leadId` defined). Row mới có thể thiếu. | Không migration. Validator phải chấp nhận cả hai. |
| **Live service config** | Không có service ngoài. Knowledge daemon không giữ dữ liệu AI Office. | None — verified: `src/services/knowledge/*` không tham chiếu `aiTeams`/`aiSkill`. |
| **OS-registered state** | Không có. Không task scheduler/pm2/launchd nào đăng ký TaskMate. | None. |
| **Secrets / env vars** | `ninerouter_api_key`, `knowledge_server_token`, `github_token`, `backup_passphrase` là setting bị loại khỏi export (`exportBackup.ts:8-34`) và khỏi SQLite queue (`localSqlitePersistence.ts:74`). Phase 36 **không** thêm secret nào. | None; giữ nguyên deny-list. |
| **Build artifacts / installed packages** | `src-tauri/target/` **không tồn tại** (chưa build Rust trên máy này). `dist/` không có. | Không cần dọn. Lần `cargo test` đầu sẽ build `rusqlite bundled` + `ssh2 vendored-openssl` → chậm; xem §Environment Availability. |
| **In-memory runtime state** | `coordinatorRegistry` (module Map, `TeamWorkspace.tsx:59`), `aiTurnManager` (singleton), `teamRunRegistry` (per team). Tất cả mất khi relaunch, không persist. | D-13 cần một registry in-memory để guard biết "ai đang chạy". Không persist, không backup. |
| **File on disk** | SQLite file do user chọn (`tauri_sqlite_path`), chứa `planner_rows` với `table_name` bất kỳ trong `ALLOWED_TABLES`. File cũ **không có** row `aiSkillVersions` — chấp nhận (hydrate chỉ `put` row có sẵn). | Không migration file. Chỉ cần Rust allowlist chứa tên bảng mới. |

**Canonical question — sau khi mọi file trong repo đã sửa, runtime nào còn giữ chuỗi cũ?**
- SQLite file của user: không chứa `aiSkillVersions` (không có gì để sửa), nhưng **sẽ từ chối** row `chatTabs`/`systems`/`changeRequests` cho tới khi Rust `ALLOWED_TABLES` được bổ sung. Đây là runtime state thật, không phải file trong git.
- Backup JSON đã export trước phase: version 11 → sẽ bị reject bởi build mới (D-23 chấp nhận).
- Zustand `layoutStore` persist trong `localStorage`: có thể còn tab AI Office với id team đã xóa; không thuộc phase này (Phase 40).

## Common Pitfalls

### Pitfall 1: Zod `z.object` strip field mới (đúng lỗi `targetAgentId`)
**What goes wrong:** thêm field vào `ChatMessage`/`AiTeam` nhưng quên schema backup → export có, import mất, không lỗi nào được ném.
**Why it happens:** `BackupChatMessageRecordSchema` là `z.object` (không strict), Zod mặc định strip key không khai báo. **Đã chứng minh bằng probe:** `has targetAgentId after parse: false`, output JSON chỉ còn 7 key.
**How to avoid:** mọi field mới đi vào backup phải được khai báo tường minh trong schema record tương ứng; test round-trip `toEqual` toàn row, không chỉ `toMatchObject`.
**Warning signs:** test restore pass nhưng UI mất attribution; `restoredMessage.targetAgentId === undefined`.

### Pitfall 2: `z.strictObject` reject field mới ở build cũ
**What goes wrong:** `BackupAiTeamRecordSchema` là `z.strictObject` (`backupSchemas.ts:650`). Thêm `leaderLockedAt` mà **không** bump envelope → build cũ nhận file version 11 và **reject** vì unexpected key, với thông điệp khó hiểu.
**Why it happens:** strictObject + version không đổi = "cùng version, khác shape".
**How to avoid:** bump envelope lên 12 **trong cùng change set** với field mới. Khi đó build cũ reject ở envelope gate với thông điệp "phiên bản không tương thích", đúng D-20.
**Warning signs:** lỗi validation nói về key lạ thay vì về version.

### Pitfall 3: Thêm bảng mà bỏ sót một trong chín danh sách
**What goes wrong:** bảng tồn tại trong Dexie, export được, nhưng restore không clear/add → dữ liệu cũ lẫn mới; hoặc SQLite flush trả `SQLITE_INVALID_TABLE`.
**Why it happens:** `restoreBackup.ts` có **hai** chỗ (`RESTORE_TABLES` và `AI_OFFICE_TABLE_KEYS` + `replaceTables` add/clear/snapshot), không chỉ một.
**How to avoid:** dùng inventory ở §Coordinated-file inventory như checklist; viết test parity TS↔Rust và test restore-clear.
**Warning signs:** `aiSkillVersions` có row sau restore dù payload rỗng; `missingPath`/`SQLITE_INVALID_TABLE` trong log Tauri.

### Pitfall 4: Xóa leader/agent làm chính backup fail
**What goes wrong:** `deleteLead` bare delete → `aiTeams.leadId` trỏ hư → `validateBackupPayload` báo `AiTeam references leadId ... not found in aiLeads` (`validateBackup.ts:474-478`). User bị chặn export bởi chính thao tác hợp lệ trước đó.
**Why it happens:** Phase 34 chọn "no cascade" (`aiOfficeRepo.ts:22-23` comment) nhưng lại thêm live-ref validation ở backup.
**How to avoid:** guard tại repository (refuse) **và** giữ validation; hai bên phải nói cùng một ngôn ngữ về live vs historical.
**Warning signs:** export lỗi sau khi xóa; `countTeamsUsingEmployee` > 0 nhưng UI vẫn cho xóa.

### Pitfall 5: `leadId` optional làm vỡ invariant leader-row
**What goes wrong:** nhóm có `leadId` nhưng không có member row `role='lead'` (hoặc ngược lại) → budget lead = 0 → `beforeToolRound` chờ gate không bao giờ mở, turn treo. Chính comment ở `teamRunCoordinator.ts:641-644` đã cảnh báo dạng lỗi này cho non-member.
**Why it happens:** hai nguồn sự thật: `aiTeams.leadId` và `aiTeamMembers.role='lead'`.
**How to avoid:** ghi cả hai trong **một** transaction; validator khẳng định `(team.leadId === undefined) === (không có lead row)`; test cả hai chiều.
**Warning signs:** nhóm "chưa có leader" nhưng vẫn có row lead; hoặc có leadId mà `listTeamMembers` không trả role lead.

### Pitfall 6: Nhầm cap roster với cap batch
**What goes wrong:** gỡ `MAX_ACTIVE_TEAMS` rồi vô tình gỡ luôn `MAX_BATCH_SIZE` (Phase 37 sở hữu), hoặc thay cap cũ bằng cap mới.
**Why it happens:** ba hằng số nằm cạnh nhau (`aiOffice.ts:115-117`).
**How to avoid:** D-06 nói rõ "không thay bằng cap khác"; chỉ xóa hai hằng số đầu và mọi enforcement/copy.
**Warning signs:** test `delegate_batch` 4 phần tử không còn bị refuse `BATCH_TOO_LARGE`.

### Pitfall 7: Guard D-13 bỏ qua lượt đang chạy
**What goes wrong:** user gỡ agent khỏi roster rồi xóa agent ngay; lượt đang chạy vẫn dùng persona/skill của agent đó → xóa xong turn đọc `undefined`, prompt rỗng hoặc crash.
**Why it happens:** guard chỉ đếm DB row; snapshot của lượt đang chạy không nằm trong DB.
**How to avoid:** registry in-memory `Map<agentId, { skillIds: string[] }>` do coordinator đăng ký lúc bắt đầu lượt và gỡ khi settle; guard đọc registry **trong cùng transaction** (đọc memory là đồng bộ nên không phá atomicity).
**Warning signs:** xóa thành công nhưng turn đang chạy sinh báo cáo vô nghĩa; test D-13 không tái hiện được.

### Pitfall 8: SQLite allowlist drift (đang tồn tại)
**What goes wrong:** `SQLITE_DOMAIN_TABLES` có `systems`, `changeRequests`, `chatTabs` (`localSqlitePersistence.ts:14-33`) nhưng Rust `ALLOWED_TABLES` (`sqlite_persistence.rs:6-27`) không có → flush thật trả `SQLITE_INVALID_TABLE`.
**Why it happens:** hai ngôn ngữ, sửa một bên. Rust còn giữ `projects`/`milestones` đã bị V16 xóa.
**How to avoid:** test parity đọc cả hai file nguồn và assert mọi phần tử TS có mặt trong Rust; thêm `aiSkillVersions` cả hai bên.
**Warning signs:** log Tauri `SQLITE_INVALID_TABLE`; queue không bao giờ rỗng.

### Pitfall 9: Test cũ khẳng định chính hành vi phải đổi
**What goes wrong:** sửa code đúng nhưng đỏ 12 test cũ; tưởng là regression.
**Why it happens:** Phase 34 đã khóa cap và bare-delete bằng test.
**How to avoid:** danh sách test phải viết lại nằm trong inventory: `aiTeamRepo.test.ts:75-114` (cap), `aiOfficeRepo.test.ts:84-101,117-131` (bare delete), `TeamsView.test.tsx` (`'Đang hoạt động 1/3'`, cap tooltip, `maxCount 3`), `v2Compatibility.test.ts:24-25`, `validateBackup.test.ts:90`, `officeBackup.test.ts:176` (`schemaVersion` 11).
**Warning signs:** đỏ đúng những file này là dấu hiệu đúng, không phải hỏng.

## Code Examples

### Sửa `targetAgentId` (D-18)

```ts
// src/validation/backupSchemas.ts — trong BackupChatMessageRecordSchema (hiện tại 290-325)
    agentKind: z.enum(['lead', 'employee']).optional(),
    messageKind: z.enum(['instruction', 'report', 'synthesis', 'plan']).optional(),
    // Phase 36 D-18: historical assignee. Live-ref validation must NOT check this field.
    targetAgentId: uuidSchema.optional(),
```

### `aiSkillVersions` — contract tối thiểu (D-16)

```ts
// src/types/aiOffice.ts
export type AiSkillVersionStatus = 'pending' | 'approved' | 'rejected';

/** Phase 36 D-16: contract + round-trip only. Phase 39 owns proposal/approval UX. */
export interface AiSkillVersion {
  id: string;
  skillId: string;
  /** Monotonic per skill, 1-based. Lets Phase 39 pin a version without a new field. */
  version: number;
  status: AiSkillVersionStatus;
  name: string;
  description: string;
  body: string;
  /** Agent-proposed evidence. Optional: a user-authored version has none. */
  evidence?: string | undefined;
  createdAt: string;
  decidedAt?: string | undefined;
}
```
```ts
// src/validation/backupSchemas.ts — same length caps as BackupAiSkillRecordSchema
export const BackupAiSkillVersionRecordSchema = z.strictObject({
  id: uuidSchema,
  skillId: uuidSchema,
  version: z.number().int().positive(),
  status: z.enum(['pending', 'approved', 'rejected']),
  name: aiNameSchema,
  description: aiSkillDescriptionSchema,
  body: z.string().trim().min(1, 'Body is required'),
  evidence: z.string().optional(),
  createdAt: z.string(),
  decidedAt: z.string().optional(),
});
```
`evidence` không được chứa key bị `FORBIDDEN_BACKUP_KEYS` chặn (`backupSchemas.ts:193-198`). Tên field `evidence` an toàn; nếu đổi thành `prompt`/`rawResponse` sẽ bị reject.

### Guard refuse-by-value (D-10/D-11/D-12)

```ts
// src/db/repositories/aiOfficeRepo.ts — thay ba bare delete
export async function deleteLead(id: string, db: TaskPlannerDatabase = defaultDb) {
  const users = await db.aiTeams.where('leadId').equals(id).toArray();
  if (users.length > 0) {
    return { deleted: false as const, code: 'IN_USE' as const,
      usedBy: users.map((t) => ({ teamId: t.id, teamName: t.name })) };
  }
  if (liveUseRegistry.holdersOf(id).length > 0) {
    return { deleted: false as const, code: 'IN_USE' as const, usedBy: [] };
  }
  await db.aiLeads.delete(id);
  return { deleted: true as const };
}
```
Lưu ý: `aiTeams: 'id, name, leadId, status, createdAt'` (`schema.ts:126`) → `where('leadId')` dùng index. `aiEmployees.skillId` (`schema.ts:123`) và `aiTeamMembers.agentId` (`schema.ts:127`) cũng có index. Không cần index mới cho guard.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Giữ schema cũ để backup cũ import được | C-16: xóa kèm dữ liệu, reject backup cũ tường minh | Phase 31.2 (D-49), Phase 35 | Envelope 12 reject v11 là hành vi đúng, không phải regression. |
| Cap roster cứng (3 team, 3 agent) | Không cap (C-08/C-09) | Phase 36 (D-06) | Xóa hằng số + copy; `MAX_BATCH_SIZE` ở lại Phase 37. |
| Membership row là nguồn duy nhất cho roster | `aiTeams.leadId` (danh tính) + member row (budget), kèm invariant | Phase 36 | Cần validator cho invariant này. |

**Deprecated/outdated:**
- `MAX_ACTIVE_TEAMS` / `MAX_EMPLOYEES_PER_TEAM` / `ACTIVE_TEAM_CAP_MESSAGE`: xóa.
- "AIO-DATA-01 V18": sai, dùng V19 (D-22).
- Fixture pre-v1.4 và "đọc hai chiều với build cũ": bị D-23 thay thế.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Envelope nên lên 12 (không giữ 11) | Summary, Pitfall 2 | Nếu planner giữ 11, build cũ sẽ reject bằng "unexpected key" thay vì "version"; D-20 vẫn thoả nhưng thông điệp xấu. Thấp. |
| A2 | Lượt gián đoạn nên suy ra từ thiếu row `report`, không thêm bảng trạng thái | Anti-Patterns, Pitfall | Nếu user muốn dấu hiệu tường minh trong transcript, Phase 37/39 phải thêm; không phá schema nếu thêm sau. Trung bình. |
| A3 | Xóa skill nên cascade `aiSkillVersions` cùng transaction sau khi guard pass | Open Questions | Nếu user muốn giữ version history của skill đã xóa, phải nới validator thành historical. Trung bình. |
| A4 | `leadId` optional là cách biểu diễn "nhóm rỗng" (thay vì bảng `aiTeamLeaders` riêng) | Pattern 2, Pitfall 5 | Nếu chọn bảng riêng, diff lớn hơn nhiều và phải thêm danh sách bảng thứ 10. Thấp. |
| A5 | Không cần backfill `leaderLockedAt` cho nhóm đã chạy | Runtime State Inventory | Nhóm test cũ (nếu có) sẽ hiện "chưa khóa"; C-16 nói dữ liệu cũ là test. Thấp. |
| A6 | `cargo test` cho Rust không chạy được trong môi trường này (chưa có `target/`, cần build `vendored-openssl`) | Environment Availability | Nếu chạy được thì tốt; nếu không, parity test bằng TS là guard chính. Thấp. |

## Open Questions (RESOLVED)

> All three are settled by executable plan content; the resolution column names where.

| # | Question | Resolution | Settled in |
|---|---|---|---|
| 1 | Xóa skill: cascade hay giữ version history? | **Cascade** — `deleteSkill` removes the skill and every `aiSkillVersions` row for it in one `rw` transaction, only after the in-use guard passes; `validateBackup` therefore treats versions as live children of an existing skill and rejects a version whose skill is missing. | 36-03 T2 (code) + 36-02 T3 constraint 4 (validator) |
| 2 | `skillVersionId` trên assignment/message có cần ngay? | **No field in Phase 36** — `aiSkillVersions.version` is monotonic per skill, so Phase 39 can pin by `(skillId, version)` without a schema change. Adding a field now would guess at R-11. | 36-05 T1 (repo contract) |
| 3 | `aiTeamMembers.agentId` có nên là live reference trong validator? | **Yes** — an employee member must resolve in `aiEmployees ∪ aiLeads`; a lead member must resolve to that team's `leadId`. Old test data failing export once is accepted under C-16 and is the signal to clean it. | 36-02 T3 constraint 3 |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest, tsc | ✓ | `v26.13.0` | — (CLAUDE.md ghi 24 LTS; Vitest 5 chấp nhận `>=26`) |
| npm | scripts | ✓ | `11.20.0` | — |
| npx / tsx | probe, script | ✓ | tsx có trong devDeps | — |
| Vitest | focused tests | ✓ | `^5.0.2` | — |
| TypeScript | `tsc --noEmit` | ✓ | `^7.0.2` | — |
| fake-indexeddb | Dexie test | ✓ | `^6.2.5` (global trong `tests/setup.ts`) | — |
| Rust toolchain | `cargo test` | ✓ | `rustc 1.93.1`, `cargo 1.93.1` | `src-tauri/target/` **chưa tồn tại** → build đầu rất chậm (rusqlite bundled, ssh2 vendored-openssl). Fallback: parity test bằng TS đọc file nguồn. |
| Tauri runtime (desktop) | manual validation | ✓ (DISPLAY=`:0`) | — | Không chạy trong phase này; ghi là manual chưa thực thi. |
| `ctx7` CLI | docs lookup | ✗ | — | Không cần: research offline theo chỉ đạo parent. |
| graphify | graph context | ✗ (disabled) | — | `gsd-tools graphify status` → `{"disabled": true}`. Bỏ qua. |
| Brave/Exa/Firecrawl/Tavily | web research | ✗ | — | `.planning/config.json` đều `false`. Research source-grounded. |

**Missing dependencies with no fallback:** none blocking.
**Missing dependencies with fallback:** `cargo test` (fallback TS parity test), web providers (fallback: đọc source).

## Validation Architecture

> `workflow.nyquist_validation: true` trong `.planning/config.json` → section bắt buộc.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^5.0.2` (+ `@testing-library/react 16.3.3`, `fake-indexeddb 6.2.5`, `jsdom`) |
| Config file | `vite.config.ts` (`test:` block, dòng 65+; `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| Quick run command | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/aiOfficeRepo.test.ts` |
| Full suite command | **Không chạy.** Memory + parent: full vitest suite chậm cả tiếng. "Phase gate" = tập focused dưới đây + `npx tsc --noEmit`. |
| Estimated runtime | ~20-60s cho một file Dexie; `teamRunCoordinator.test.ts` lâu nhất (~30-60s do `waitFor`/sleep). |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIO-GROUP-02 | Một nhóm = một thread `team:<teamId>`; gọi `ensureTeamThread` hai lần trả cùng id; không có scope chứa `:chat:` cho team | unit | `npx vitest run tests/services/ai/office/teamTranscriptRepo.test.ts` | ✅ (thêm case) |
| AIO-GROUP-03 | Tạo >3 nhóm active và >3 agent/nhóm không bị chặn; không còn `ACTIVE_TEAM_CAP_MESSAGE` | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ✅ (viết lại 3 case cap: dòng 75-114) |
| AIO-GROUP-03 | UI không còn copy cap; roster thêm/bớt sau tạo hoạt động | component | `npx vitest run tests/views/TeamsView.test.tsx` | ✅ (sửa `'Đang hoạt động 1/3'`, cap tooltip, `maxCount`) |
| AIO-GROUP-05 | `deleteLead`/`deleteEmployee`/`deleteSkill` refuse khi có live ref; export ngay sau đó validate `valid: true` | unit | `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts` | ✅ (viết lại 2 case bare-delete) |
| AIO-GROUP-05 | Guard D-13: đang chạy lượt thì refuse xóa dù đã gỡ khỏi roster | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ✅ (thêm case mới) |
| AIO-DATA-01 | V19 tạo `aiSkillVersions`, row V18 sống nguyên, bảng rỗng | migration | `npx vitest run tests/db/schemaV19Migration.test.ts` | ❌ Wave 0 (mẫu: `tests/db/schemaV17Migration.test.ts`) |
| AIO-DATA-01 | Chín danh sách bảng đồng bộ; TS⊆Rust | static/unit | `npx vitest run tests/db/tableListParity.test.ts` | ❌ Wave 0 |
| AIO-DATA-02 | `targetAgentId` sống qua export→validate→restore | round-trip | `npx vitest run tests/services/backup/officeBackup.test.ts` | ✅ (thêm case; regression đỏ trước khi sửa) |
| AIO-DATA-03 | Round-trip v12: counts khớp, `status: 'pending'` giữ nguyên, `leaderLockedAt` giữ nguyên | round-trip | `npx vitest run tests/services/backup/officeBackup.test.ts` | ✅ (mở rộng seed) |
| AIO-DATA-03 | Restore payload có `aiSkillVersions` phải clear bảng cũ trước khi add | unit | `npx vitest run tests/services/backup/restoreBackup.test.ts` | ✅ (thêm case) |
| AIO-DATA-04 | Envelope 12: reject 11 và 13 tường minh, trước mọi ghi | unit | `npx vitest run tests/services/backup/validateBackup.test.ts tests/services/backup/v2Compatibility.test.ts` | ✅ (sửa mốc 11 → 12) |
| AIO-DATA-05 | Không còn bảng/field SDLC; không resurrect | static scan | `npx vitest run tests/services/backup/validateBackup.test.ts` (+ rg thủ công) | ✅ |
| D-16 | `aiSkillVersionRepo` list/create/decide; pending không tự thành approved | unit | `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` | ❌ Wave 0 |
| D-03/D-07 | Đầu lượt đọc roster tươi; tool round giữa lượt không thấy roster mới | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ✅ (thêm case; seam `loadRoster`) |
| D-17 | Đổi tên employee không sửa `agentName` của message cũ | unit | `npx vitest run tests/services/ai/office/teamTranscriptRepo.test.ts` | ✅ (thêm case) |
| SQLite | `aiSkillVersions` vào `SQLITE_TABLES`; queue nhận row; không rò secret | unit | `npx vitest run tests/services/localSqlitePersistence.test.ts` | ✅ (thêm case) |

### Regression boundaries (thứ tự chạy đề xuất)

1. **Baseline trước khi sửa** (phải xanh): `npx vitest run tests/services/backup/officeBackup.test.ts tests/services/backup/validateBackup.test.ts tests/services/ai/office/aiTeamRepo.test.ts`
2. **Regression đỏ chủ đích** (D-18): thêm case `targetAgentId` vào `officeBackup.test.ts`, chạy → phải đỏ. Đây là bằng chứng "reproduce before fix" của AIO-VERIFY-02.
3. Sửa schema → case đó xanh.
4. Sau mỗi plan: file test tương ứng + `npx tsc --noEmit`.
5. Cuối phase: chạy trọn tập focused dưới đây một lần.

**Tập focused cuối phase (một lệnh, không phải full suite):**
```
npx vitest run \
  tests/db/schemaV19Migration.test.ts \
  tests/db/tableListParity.test.ts \
  tests/services/ai/office/aiSkillVersionRepo.test.ts \
  tests/services/ai/office/aiOfficeRepo.test.ts \
  tests/services/ai/office/aiTeamRepo.test.ts \
  tests/services/ai/office/teamTranscriptRepo.test.ts \
  tests/services/ai/office/teamRunCoordinator.test.ts \
  tests/services/backup/officeBackup.test.ts \
  tests/services/backup/restoreBackup.test.ts \
  tests/services/backup/validateBackup.test.ts \
  tests/services/backup/v2Compatibility.test.ts \
  tests/services/backup/exportBackup.test.ts \
  tests/validation/backupSchemas.test.ts \
  tests/services/localSqlitePersistence.test.ts \
  tests/views/TeamsView.test.tsx \
  tests/views/AiOfficeView.test.tsx
```
+ `npx tsc --noEmit`

### Sampling Rate
- **Per task commit:** file test của task + `npx tsc --noEmit`.
- **Per wave merge:** nhóm file test thuộc wave (2-4 file).
- **Phase gate:** tập focused ở trên xanh + `npx tsc --noEmit` exit 0. **Không** chạy `npm test`.
- **Max feedback latency:** ~90s mỗi lần chạy focused.

### Wave 0 Gaps
- [ ] `tests/db/schemaV19Migration.test.ts` — copy cấu trúc `tests/db/schemaV17Migration.test.ts` (seed bằng `new Dexie(name).version(18).stores(SCHEMA_V18)` rồi mở `TaskPlannerDatabase`).
- [ ] `tests/db/tableListParity.test.ts` — đọc `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` bằng `readFileSync`, parse hai danh sách, assert TS ⊆ Rust; assert `aiSkillVersions` có ở cả hai.
- [ ] `tests/services/ai/office/aiSkillVersionRepo.test.ts` — create pending, list theo skill, decide approved/rejected, `version` tăng đơn điệu.
- [ ] Case mới trong các file đã có (không tạo file): `targetAgentId`, leader lock round-trip, guard D-13, roster tươi theo lượt, D-17 rename.

*Không cần cài framework — hạ tầng test đã đủ.*

### Manual-Only Verifications (chưa thực thi — ghi trung thực)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tạo nhóm rỗng rồi gán leader, chạy lượt đầu, leader khóa; relaunch vẫn khóa | D-05, D-09 | Cần Tauri + DB thật; khóa phải sống qua process restart. | `npm run tauri:dev` → tạo nhóm chỉ có tên → mở Cài đặt nhóm → chọn leader → gửi 1 tin → kiểm tra select leader disabled → thoát app, mở lại → vẫn disabled và DB row có `leaderLockedAt`. |
| Xóa leader/agent/skill đang dùng bị chặn với thông báo nêu tên nhóm | AIO-GROUP-05, D-10..D-12 | Cần UI thật; copy refuse phải đọc được. | Xóa lead của nhóm đang active → phải thấy alert nêu tên nhóm, không có row nào biến mất. |
| Export → restore trong app thật, giữ `targetAgentId` và pending skill version | AIO-DATA-02/03 | Cần file system + process thật. | Export backup, xóa DB local (hoặc dùng profile mới), restore, mở transcript nhóm → attribution còn; mở skill versions → pending vẫn pending. |
| SQLite flush không trả `SQLITE_INVALID_TABLE` cho `chatTabs`/`systems`/`changeRequests`/`aiSkillVersions` | Pitfall 8 | Rust allowlist chỉ có hiệu lực trong build Tauri. | Bật SQLite path trong Settings, thao tác trên CR + chat tab + skill version, xem log không có `SQLITE_INVALID_TABLE`, mở file `.sqlite` kiểm tra `planner_rows`. |
| `cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence` | Pitfall 8 | Chưa có `target/`; build đầu rất chậm và có thể fail offline (`vendored-openssl`). | Tùy chọn. Nếu chạy được, cập nhật test Rust đang dùng `"projects"` (dòng 201/212) sang bảng còn tồn tại. |

*Không có mục nào ở trên được tuyên bố đã chạy. Toàn bộ §Validation Architecture là kế hoạch.*

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` trong `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Ứng dụng một người dùng, không có auth. |
| V3 Session Management | no | Không có session. |
| V4 Access Control | no | Không có role; guard live-reference là integrity, không phải access control. |
| V5 Input Validation | **yes** | Zod tại `validation/backupSchemas.ts` + `validation/aiOfficeSchemas.ts`. Mọi field mới phải có schema, length cap và nằm trong `strictObject` nếu là bảng backup. Envelope version là cổng trước ghi. |
| V6 Cryptography | no | Không đụng Web Crypto trong phase này. |
| V7 Error Handling & Logging | **yes** (mức 1) | Refuse message không được chứa secret/path; dùng copy tiếng Việt nêu tên nhóm, không nêu token. `FORBIDDEN_BACKUP_KEYS` phải giữ nguyên. |
| V12 Files & Resources | partial | SQLite `ALLOWED_TABLES` là allowlist tên bảng — không nhận tên bảng từ input người dùng. |

### Known Threat Patterns for Dexie + backup stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret rò vào backup qua field mới (`evidence`, `persona`, `body`) | Information Disclosure | `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:193-198`) + test export không chứa `ninerouter_api_key`/`github_token`. |
| Backup độc hại chứa bảng lạ để ghi đè dữ liệu | Tampering | `RESTORE_TABLES` allowlist + `replaceTables` chỉ add bảng đã khai báo. Bảng mới **không** tự động được restore. |
| `aiSkillVersions` bị inject `status:'approved'` từ file ngoài | Tampering / Elevation | Zod enum giới hạn 3 giá trị; nhưng D-16 nói "không biến pending thành approved" — restore **phải** giữ đúng status đã lưu (đó là dữ liệu, không phải hành động duyệt). Ghi rõ trong PLAN để không ai "chuẩn hóa" status khi restore. |
| Guard bị bypass bằng đường khác (bulk delete, restore, SQLite hydrate) | Tampering | Restore là bulk add có validation trước; D-20 chấp nhận. SQLite hydrate dùng `put` row đã có — không tạo live ref mới vì row đến từ chính DB trước đó. Ghi nhận, không mở rộng. |
| Refuse message làm lộ id nội bộ | Information Disclosure | Copy chỉ nêu tên nhóm/agent, không nêu UUID. |

## Sources

### Primary (HIGH confidence — đọc trực tiếp source, có trích dòng)
- `src/db/schema.ts:121-133` — `SCHEMA_V17` sáu bảng AI Office, `SCHEMA_V18` là bản cuối.
- `src/db/index.ts:85-91` — khai báo `Table`; `:493` `version(17)`; `:497` `version(18)` kèm purge hook.
- `src/types/aiOffice.ts:67-89` — `AiTeam.leadId` bắt buộc, `AiTeamMember`; `:115-119` ba hằng số cap/threshold.
- `src/validation/aiOfficeSchemas.ts:86-101` — `AiTeamInputSchema.leadId` bắt buộc.
- `src/db/repositories/aiOfficeRepo.ts:86-99,150-155,202-215` — bare delete + hai hàm count.
- `src/db/repositories/aiTeamRepo.ts:23-24,42-49,92-95,112-142,228-259` — cap, even split, roster.
- `src/db/repositories/teamTranscriptRepo.ts:25,32-39,57,96-105` — `targetAgentId`, `team:<id>` scope, assignment history.
- `src/db/repositories/chatRepo.ts:38-43` — `buildScopeKey`.
- `src/types/models.ts:216-303` — `ChatThread`/`ChatTab`/`ChatMessage` + `targetAgentId` (dòng 302).
- `src/validation/backupSchemas.ts:193-198` (forbidden keys), `:290-325` (message schema thiếu `targetAgentId`), `:598-677` (sáu schema AI Office, `strictObject`), `:680-686` (envelope literal 11).
- `src/services/backup/exportBackup.ts:7` (`CURRENT_SCHEMA_VERSION = 11`), `:166-305` (đọc + counts).
- `src/services/backup/validateBackup.ts:47-104` (envelope gate), `:469-493` (Stage 5 live refs).
- `src/services/backup/restoreBackup.ts:25-64` (`RESTORE_TABLES`, `AI_OFFICE_TABLE_KEYS`), `:218-284` (clear/add/snapshot).
- `src/services/localSqlitePersistence.ts:13-36` (`SQLITE_DOMAIN_TABLES`/`SQLITE_TABLES`).
- `src-tauri/src/sqlite_persistence.rs:6-27` (`ALLOWED_TABLES`).
- `src/services/ai/office/teamRunCoordinator.ts:197-254` (closure `employees`/`skills`), `:641-645` (non-member comment), `:729-754` (instruction row + `targetAgentId`).
- `src/components/ai/office/TeamWorkspace.tsx:59-61,170-264` (coordinator registry + effect deps).
- `src/components/ai/office/TeamEditorDrawer.tsx:50-53,144-157` (cap + `maxCount`).
- `src/components/ai/office/TeamCard.tsx:23-24,46-48` (`ROSTER_CAP`, `capReached`).
- `src/components/ai/office/TeamSettingsDrawer.tsx:36-47,118-138` (even split, không có roster add/remove).
- `src/views/AiOfficeView.tsx:116-124` (bare delete callers), `src/views/TeamsView.tsx:117-118` (copy cap).
- `tests/setup.ts:1-2` — fake-indexeddb global.
- `vite.config.ts:65-77` — cấu hình Vitest.

### Primary (probe thực thi trong session này)
- `npx tsx` + `BackupChatMessageRecordSchema.parse({... targetAgentId ...})` → in ra `has targetAgentId after parse: false` và JSON không còn key. Bằng chứng trực tiếp cho AIO-DATA-02.
- `gsd-tools query init.phase-op 36` → `has_research: false`, `padded_phase: "36"`, `commit_docs: true`.
- `gsd-tools graphify status` → `{"disabled": true, ...}`.
- `node --version` → `v26.13.0`; `npm --version` → `11.20.0`; `rustc 1.93.1`; `cargo 1.93.1`.

### Secondary (MEDIUM confidence)
- `.planning/phases/35-.../35-VERIFICATION.md` — Phase 35 đóng với fresh-data scope; manual Tauri walkthrough chưa chạy; debt đã công khai.
- `.planning/phases/35-.../35-CONTEXT.md` — C-16 áp dụng, patch primitives để Phase 39 tái dùng.
- `.planning/MILESTONE-CONTEXT.md` — C-01..C-16.

### Tertiary (LOW confidence / chưa kiểm chứng trong session)
- Hành vi thực tế của Rust allowlist khi flush (chưa build Tauri, `src-tauri/target/` không tồn tại).
- Việc `cargo test` có chạy được offline hay không.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — không thêm package; mọi version đọc từ `package.json`.
- Architecture: HIGH cho data/backup contract (đọc toàn bộ chuỗi file + probe); MEDIUM cho ranh giới runtime D-03/D-07/D-13 (chưa chạy Tauri, seam chưa tồn tại).
- Pitfalls: HIGH — mỗi pitfall gắn với một dòng source hoặc một probe; riêng Pitfall 8 (SQLite drift) là suy luận trực tiếp từ hai danh sách nguồn, chưa quan sát log Tauri.
- Migration numbering (V19): HIGH — `SCHEMA_V18` là bản cuối trong `src/db/schema.ts:133`.

**Research date:** 2026-11-10
**Valid until:** ~2026-12-10 (stable: stack không đổi, schema nội bộ; hết hạn nếu Phase 37 sửa coordinator hoặc Phase 39 sửa skill contract).

---

## Coordinated-file inventory (planner checklist)

### A. Chín danh sách bảng phải sửa trong **một** change set

| # | File | Vị trí | Việc phải làm |
|---|------|--------|----------------|
| 1 | `src/db/schema.ts` | sau dòng 133 | Thêm `SCHEMA_V19 = { ...SCHEMA_V18, aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt' }`. |
| 2 | `src/db/index.ts` | `:85-91` khai báo, `:493-544` version | `aiSkillVersions!: Table<AiSkillVersion, string>;` + `this.version(19).stores(SCHEMA_V19);` (không `.upgrade()`). |
| 3 | `src/types/backup.ts` | `:43-71`, `:73-101` | `aiSkillVersions?: AiSkillVersion[]` + `aiSkillVersions?: number`. |
| 4 | `src/validation/backupSchemas.ts` | sau `:677`; `:680` | `BackupAiSkillVersionRecordSchema` (strictObject) + `BACKUP_SCHEMA_VERSION = 12`; `targetAgentId` vào message schema (`:290-325`); `leaderLockedAt` vào team schema (`:650-660`); `leadId` optional. |
| 5 | `src/services/backup/exportBackup.ts` | `:7`, `:166-305` | `CURRENT_SCHEMA_VERSION = 12`; thêm `aiSkillVersions` vào destructure, `Promise.all`, `tables`, `counts`. |
| 6 | `src/services/backup/validateBackup.ts` | `:215-238`, `:507-568` | `validateTable('aiSkillVersions', …)`; thêm vào `envelope.tables` và `envelope.counts`; Stage 5 thêm ràng buộc version (xem D). |
| 7 | `src/services/backup/restoreBackup.ts` | `:25-54`, `:56-64`, `:182-201`, `:236-241`, `:273-278` | `RESTORE_TABLES` + `AI_OFFICE_TABLE_KEYS` + `captureSnapshot` + `clearAiOffice` + `add(targetDb.aiSkillVersions, …)`. **Năm chỗ**, không phải một. |
| 8 | `src/services/localSqlitePersistence.ts` | `:14-33` | Thêm `'aiSkillVersions'` vào `SQLITE_DOMAIN_TABLES`. |
| 9 | `src-tauri/src/sqlite_persistence.rs` | `:6-27` | Thêm `"aiSkillVersions"`, `"chatTabs"`, `"systems"`, `"changeRequests"` (ba cái sau đang thiếu = bug hiện hữu). Giữ `"projects"`/`"milestones"` để không phải sửa test Rust dòng 201/212. |

### B. Type + Zod domain (cùng change set)

| File | Việc |
|------|------|
| `src/types/aiOffice.ts` | `AiTeam.leadId?: string \| undefined`; thêm `leaderLockedAt?: string \| undefined`; `AiSkillVersion` + `AiSkillVersionStatus`; **xóa** `MAX_ACTIVE_TEAMS`, `MAX_EMPLOYEES_PER_TEAM` (`:115-116`). Giữ `MAX_BATCH_SIZE`, `RECENT_WINDOW_TURNS`, `ASSIGNMENT_HISTORY_CAP`, `BUDGET_PAUSE_THRESHOLD`. |
| `src/validation/aiOfficeSchemas.ts` | `AiTeamInputSchema.leadId: uuidSchema.optional()`; `AiTeamUpdateSchema` thêm `leaderLockedAt` (chỉ repo ghi — nếu để trong update schema phải chặn ở repo). Thêm `AiSkillVersionInputSchema`. |
| `src/db/repositories/aiSkillVersionRepo.ts` | NEW: `listSkillVersions(skillId)`, `createSkillVersion(input)`, `decideSkillVersion(id, 'approved'\|'rejected')`. Không expose qua AI tool. |
| `src/db/repositories/aiTeamRepo.ts` | Xóa `MAX_ACTIVE_TEAMS`/`MAX_EMPLOYEES_PER_TEAM`/`ACTIVE_TEAM_CAP_MESSAGE` (`:3,23-24,42-49,92-95,112-116,240-246`); `addTeamMember` bỏ nhánh cap employee nhưng **giữ** "một lead/nhóm"; thêm `assignLeader(teamId, leadId)` + `lockLeader(teamId)` (một transaction ghi `aiTeams.leadId` + member row role lead). |
| `src/db/repositories/aiOfficeRepo.ts` | Ba delete → guard + transaction, trả `{deleted, code?, usedBy?}`. `deleteSkill` cascade `aiSkillVersions` cùng transaction (A3). |
| `src/services/ai/office/liveUseRegistry.ts` | NEW: đăng ký `agentId → skillIds[]` khi turn bắt đầu, gỡ khi settle; `holdersOf(agentId)`. In-memory, không persist. |
| `src/services/ai/office/teamRunCoordinator.ts` | Thêm option `loadRoster?`; `send()`/`runBatch` chốt snapshot theo lượt; đăng ký/gỡ liveUse. **Không** đổi public `TeamRunSnapshot`. |

### C. UI tối thiểu (không có UI-SPEC cho phase này)

| File | Việc |
|------|------|
| `src/components/ai/office/TeamEditorDrawer.tsx` | Chỉ cần `name` để tạo; leader/employee/budget thành tùy chọn. Bỏ `capReached`, `maxCount={3}`, copy "tối đa 3". |
| `src/components/ai/office/TeamSettingsDrawer.tsx` | Thêm khối roster: danh sách member hiện tại + nút gỡ; `Select` thêm agent; `Select` leader (disabled khi `leaderLockedAt` có giá trị). |
| `src/components/ai/office/TeamCard.tsx` | Bỏ `capReached`/tooltip `ACTIVE_TEAM_CAP_MESSAGE`; giữ `ROSTER_CAP` (chỉ hiển thị avatar, không phải cap dữ liệu). |
| `src/views/TeamsView.tsx` | Bỏ `'Đang hoạt động ${activeCount}/3'` và `activeCount === 3`; giữ `activeCount` nếu còn hiển thị dạng "đang hoạt động N". |
| `src/views/AiOfficeView.tsx` | `handleDelete*` nhận kết quả refuse và hiện `Alert`/`message.error` với `usedBy`; không `void` im lặng. |
| `src/components/ai/office/EmployeeCard.tsx` | Sửa copy `Popconfirm`: hiện đang hứa "sẽ bị xóa khỏi mọi nhóm đang dùng" (cascade) — trái D-11. Đổi thành "phải gỡ khỏi các nhóm trước". `LeadCard` tương tự; `SkillCard` tương tự ("chạy bằng persona thuần" trái D-12). |

### D. Validator cần thêm (D-14/D-15/D-20)

| Ràng buộc | Live hay historical | Ghi chú |
|-----------|---------------------|---------|
| `aiTeams.leadId` → `aiLeads` | **live**, chỉ khi `leadId` defined | Đã có (`validateBackup.ts:474-478`); thêm guard `!== undefined`. |
| `aiTeamMembers.teamId` → `aiTeams` | live | Đã có. |
| `aiTeamLinks.teamId` → `aiTeams` | live | Đã có. |
| `aiEmployees.skillId` → `aiSkills` | live | Đã có. |
| `aiTeamMembers.agentId` → `aiEmployees ∪ aiLeads` | live | **THÊM**. Lead row dùng `leadId`, nên phải hợp hai tập. |
| `aiSkillVersions.skillId` → `aiSkills` | live | **THÊM** — hợp lệ vì `deleteSkill` cascade versions (A3). Nếu chọn giữ history thì đây là historical và **không** được validate. |
| `aiSkillVersions.version` unique theo `skillId` | live | THÊM: trùng version là dữ liệu hỏng. |
| `chatMessages.targetAgentId` | **historical** | **KHÔNG** validate (D-14/D-18). Ghi comment trong code để người sau không "sửa" nhầm. |
| `chatMessages.agentId` / `agentName` | historical | **KHÔNG** validate — đã đúng hiện trạng. |
| `(aiTeams.leadId === undefined) === (không có member row role='lead')` | live | THÊM (Pitfall 5). |
| `chatThreads.scopeKey` cho team | live | THÊM: `scopeType === 'team'` ⇒ `scopeKey === 'team:' + entityId`, và `entityId ∈ aiTeams`. Hiện **không** có check nào. |

### E. Test phải viết lại (đỏ có chủ đích)

| File | Dòng / nội dung | Vì sao |
|------|------------------|--------|
| `tests/services/ai/office/aiTeamRepo.test.ts` | `:21,75-114` (import hằng số + 3 case cap) | D-06 xóa cap. |
| `tests/services/ai/office/aiOfficeRepo.test.ts` | `:84-101` ("deletes an employee without cascading"), `:117-131` ("keeps employees when their skill is deleted") | D-11/D-12 đổi thành refuse. |
| `tests/views/TeamsView.test.tsx` | `'Đang hoạt động 1/3'`; case "disables activation at three active teams"; case "caps employee selection at 3" | Copy + cap bị xóa. |
| `tests/services/backup/officeBackup.test.ts` | `:176` `expect(envelope.schemaVersion).toBe(11)` | Envelope 12. |
| `tests/services/backup/v2Compatibility.test.ts` | `:24-25` `expect(CURRENT_SCHEMA_VERSION).toBe(11)` | Envelope 12. |
| `tests/services/backup/validateBackup.test.ts` | `:90` `expect(result.envelope?.schemaVersion).toBe(11)` | Envelope 12. |
| `tests/services/backup/exportBackup.test.ts` | `:114` dùng `CURRENT_SCHEMA_VERSION` (không hardcode) | Không cần sửa — kiểm tra lại. |

### F. Không được đụng trong phase này

- `MAX_BATCH_SIZE`, `delegate_batch` semantics, concurrency, abort → Phase 37.
- Top-up/split khi roster đổi, threshold → Phase 38.
- Proposal generation UI, approval diff, `PatchDiffApprovalCard` → Phase 39.
- Explorer 2 tầng, trigger AI Office, virtualization → Phase 40.
- PWA/GitHub Pages.
