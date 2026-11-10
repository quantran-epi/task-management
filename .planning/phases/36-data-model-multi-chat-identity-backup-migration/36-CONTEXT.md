# Phase 36: Data model, multi-chat identity, backup/migration - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Dựng nền dữ liệu cho nhóm chat AI Office trước khi runtime phụ thuộc vào nó: định danh nhóm và thành viên, sửa roster, bảo vệ tham chiếu khi xóa, store `aiSkillVersions`, và backup/restore/SQLite đầy đủ dữ liệu mới.

Một `AiTeam` chính là một nhóm chat, transcript dùng `ChatThread` với `scopeKey = 'team:<teamId>'`. Nhiều nhóm nghĩa là nhiều `AiTeam`, không phải nhiều chat con trong một team. Không thêm container, không triển khai `team:<id>:chat:<uuid>`.

Phạm vi gồm đường UI tối thiểu để sửa roster sau tạo và kiểm chứng hành vi. Không làm lại explorer (Phase 40), scheduler/stop runtime (Phase 37), accounting token (Phase 38), hoặc UI enrichment (Phase 39).

**C-16 tiếp tục chi phối:** ứng dụng chưa production, dữ liệu cũ là test; không xây migration bảo toàn hoặc cầu tương thích backup cũ. Quy tắc này không miễn validation, xác nhận thay dữ liệu local, transaction hoặc backup đúng cho dữ liệu mới.
</domain>

<decisions>
## Implementation Decisions

### Hồ sơ dùng lại; trạng thái nhóm độc lập
- **D-01:** Leader là entity domain riêng (C-05). Leader có hồ sơ toàn cục dùng lại trong nhiều nhóm; không sao chép hồ sơ riêng từng nhóm.
- **D-02:** Agent cũng có hồ sơ toàn cục dùng lại như leader. Sửa persona/model áp dụng cho lượt giao việc mới ở mọi nhóm đang dùng hồ sơ đó.
- **D-03:** Lượt đang chạy giữ cấu hình đã nhận. Lượt tiếp theo đọc hồ sơ mới ngay, không cần mở lại tab/app; không dùng hồ sơ cũ bị cache trong coordinator. Thay đổi giữa chừng không sửa hành vi lượt đang chạy.
- **D-04:** Từng nhóm tách hoàn toàn transcript, phân công và ngân sách/usage. Chỉ chung hồ sơ và skill; không tự nhớ lịch sử nhóm khác.

### Thành viên và leader
- **D-05:** Giữ luồng chat-first: tạo nhóm rỗng trước, thêm leader và agent sau; không bắt name + leader + budget trong form tạo. Nhóm chưa chọn leader phải là trạng thái dữ liệu hợp lệ.
- **D-06:** Không giới hạn số nhóm hoặc số agent mỗi nhóm (C-08/C-09). Xóa `MAX_ACTIVE_TEAMS`, `MAX_EMPLOYEES_PER_TEAM` và enforcement/copy tương ứng; không thay bằng cap khác. `MAX_BATCH_SIZE`/concurrency thuộc Phase 37, không dùng làm roster cap.
- **D-07:** Thêm/bớt agent sau tạo. Nếu đang xử lý một lượt yêu cầu, roster mới có hiệu lực từ lượt tiếp theo; lượt hiện tại tiếp tục với roster đã chốt. Không tự dừng agent vừa gỡ; agent mới không chen vào lượt hiện tại.
- **D-08:** Gỡ agent khỏi roster không xóa tin nhắn hoặc phân công cũ. Agent không nhận việc mới trong nhóm từ lượt tiếp theo.
- **D-09:** Leader được chọn/sửa trước lượt chạy đầu tiên. Khi bắt đầu lượt chạy đầu, leader bị khóa suốt đời nhóm: không đổi hoặc gỡ leader. Muốn leader khác sau mốc này thì tạo nhóm mới. Khóa phải được lưu bền và sống qua relaunch/backup, không chỉ disable control trong UI.

### Xóa khi đang được dùng
- **D-10:** Chặn xóa leader khi còn nhóm tham chiếu; thông báo rõ các nhóm đang dùng. Không tự xóa nhóm, không đổi leader ngầm.
- **D-11:** Chặn xóa agent khi còn membership đang dùng; cần gỡ khỏi các roster trước. Thông báo rõ nhóm đang dùng; không tự cascade.
- **D-12:** Chặn xóa skill khi còn được gán cho hồ sơ; user đổi/gỡ skill trước. Không âm thầm làm agent mất skill.
- **D-13:** Lượt đang chạy cũng chặn xóa hồ sơ/skill đang được nó sử dụng, kể cả đã gỡ liên kết cho lượt sau. Snapshot của lượt hiện tại phải được tính là live use đến khi kết thúc. Phần teardown/scheduler chuyên sâu vẫn thuộc Phase 37.
- **D-14:** Chỉ còn tham chiếu lịch sử thì cho xóa hồ sơ. Tin nhắn, attribution và phân công cũ vẫn đọc được; tên/ID lịch sử không đòi hồ sơ gốc tồn tại. Backup sau xóa vẫn phải validate. Phân biệt rõ live references (bắt buộc hợp lệ) với historical references (có thể trỏ hồ sơ đã xóa).
- **D-15:** Kiểm tra in-use và xóa dữ liệu phải nhất quán tại repository/trust boundary; không chỉ dựa vào count hiển thị trên UI. Mọi cập nhật nhiều bảng phải atomic, không để liên kết hỏng sau thao tác bị từ chối.

### Backup, phiên bản skill, lượt gián đoạn
- **D-16:** Backup giữ cả lịch sử phiên bản skill đã duyệt và đề xuất đang chờ duyệt. Restore giữ đúng trạng thái; tuyệt đối không biến pending thành approved. Phase 36 chỉ dựng contract/store/round-trip, không triển khai UI hay cơ chế phê duyệt Phase 39.
- **D-17:** Tin nhắn giữ tên người gửi tại thời điểm gửi. Đổi tên hồ sơ không đổi tin nhắn cũ; tin mới lấy tên mới. Lịch sử vẫn hiển thị khi hồ sơ bị xóa.
- **D-18:** Giữ `targetAgentId` qua export → validate → restore, cùng attribution và lịch sử phân công. Viết regression tái hiện việc field bị strip trước khi sửa.
- **D-19:** Backup/relaunch khôi phục dữ liệu đã lưu hoàn chỉnh và token đã ghi nhận. Lượt chưa xong được đánh dấu gián đoạn/chưa hoàn tất; không tự gọi AI hoặc chạy lại, không lưu partial stream buffers, runtime objects hay secrets. Không tuyên bố có thể tiếp tục chính xác in-flight request sau restore.
- **D-20:** Backup mới sai định dạng hoặc hỏng live references bị từ chối toàn bộ trước mọi ghi dữ liệu. Báo lỗi rõ, không nhập một phần, không thay local data. Historical references tới hồ sơ đã xóa theo D-14 không phải lỗi.
- **D-21:** Giữ xác nhận rõ trước restore thay dữ liệu local và cơ chế transaction/snapshot đang có; C-16 không phải quyền ghi đè dữ liệu mới không xác nhận.

### Điều chỉnh tiêu chí cũ theo quyết định đã khóa
- **D-22:** Dexie mới dùng **V19**; V18 đã dùng cho purge SDLC của Phase 35. Sửa cách hiểu AIO-DATA-01 đang ghi V18; không tái sử dụng số migration.
- **D-23:** AIO-DATA-03/04 và Phase 36 success criteria 3/4 còn yêu cầu fixture pre-v1.4 và đọc backup hai chiều với build cũ: phần tương thích đó bị **C-16 thay thế**. Kiểm chứng round-trip dữ liệu mới, ID/counts/attribution/pending state/leader lock đầy đủ; không giữ schema cũ chỉ để thỏa wording lỗi thời.
- **D-24:** AIO-DATA-05/R-16 “giữ SDLC rows” đã bị C-16 và Phase 35 D-05..D-09 thay thế. SDLC bị xóa, không archive/filter-only, không khôi phục PL/CAB/change-pack state hay legacy schema. CR/Note/tài liệu generic còn dùng là context tùy chọn, không phải SDLC workflow.
- **D-25:** R-14 không đòi migration nhiều chat con/team: C-04 đã chốt một team = một nhóm chat. Không adopt legacy thread hoặc tạo namespace mới vì research cũ đề xuất.

### Implementation discretion — research/planner xử lý, không phải lựa chọn sản phẩm mới
- **R-01:** Cách lưu leader trong DB chưa chốt: giữ bảng hiện có hay biểu diễn khác tùy research; phải giữ leader là entity domain riêng và các D-quyết định trên. Không hỏi user cách chia bảng.
- **R-02:** Version envelope cụ thể chưa chốt; research chọn theo contract cuối, không bị ràng buộc giữ v11 hoặc đọc hai chiều với build cũ. File không hỗ trợ phải bị từ chối rõ trước ghi; không thêm bridge tương thích cũ.
- Schema/index tối thiểu cho `aiSkillVersions`, durable leader-lock và membership/history; tránh abstraction hoặc fields cho khả năng chưa được yêu cầu.
- Đảm bảo mọi table list TS/Rust, export/validate/restore/types/counts cùng cập nhật; giữ TS⊆Rust assertion theo roadmap. Không bắt buộc tạo registry mới nếu diff nhỏ hơn vẫn bảo đảm contract.
- Ranh giới đầu lượt và đầu lần chạy đầu phải được mô tả/test rõ; không để các tool round của cùng lượt nhận roster mới giữa chừng.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Không có external spec được user đưa thêm trong cuộc thảo luận.

### Quyết định và phạm vi
- `.planning/MILESTONE-CONTEXT.md` — C-01..C-16; đặc biệt C-03..C-05, C-08/C-09, C-13 và C-16. R-items chưa tự động trở thành locked decisions.
- `.planning/PROJECT.md` — constraints và C-16; Tauri-only scope hiện tại theo `CLAUDE.md`.
- `.planning/REQUIREMENTS.md` — AIO-GROUP-02/03/05, AIO-DATA-01..05; áp dụng các overrides D-22..D-25 ở trên.
- `.planning/ROADMAP.md` — Phase 36, dependency Phase 35, V19, coordinated lists, TS⊆Rust check; legacy compatibility criteria bị C-16 thay thế.
- `.planning/phases/35-shared-primitive-extraction-sdlc-behavior-removal/35-CONTEXT.md` — SDLC deletion và reusable patch primitives; không resurrect legacy schemas.
- `.planning/phases/35-shared-primitive-extraction-sdlc-behavior-removal/35-VERIFICATION.md` — fresh-data-only acceptance, debt đã công khai; không mở lại compatibility work.
- `.planning/phases/34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul/34-CONTEXT.md` — chỉ là lịch sử, không tự kế thừa caps/fixed roster/v11 decisions đã mở lại.

### Research cũ — kiểm chứng lại, không coi là authority
- `.planning/research/SUMMARY.md` — Pitfalls 22/23/24 và module inventory còn hữu ích. Bác các đề xuất giữ legacy schema, backup compatibility, SDLC state, hoặc `team:<id>:chat:<uuid>` trái quyết định đã khóa.
- `.planning/research/ARCHITECTURE.md` — inventory tham chiếu; C-16 và context này ưu tiên cao hơn đề xuất thiết kế cũ.
- `.planning/research/PITFALLS.md` — assignment-history stripping, dangling references và coordinated table lists; reverify live tree.
- `.planning/research/STACK.md` — reuse installed stack, không thêm dependency cho nền dữ liệu này.

### Source contracts và persistence
- `src/types/aiOffice.ts` — entities, membership, current caps.
- `src/types/models.ts` — ChatThread/ChatMessage và attribution.
- `src/db/repositories/aiOfficeRepo.ts` — CRUD, bare deletes và existing in-use counters.
- `src/db/repositories/aiTeamRepo.ts` — group/membership operations, transaction pattern.
- `src/db/repositories/teamTranscriptRepo.ts` — team thread, assignment history, `targetAgentId`.
- `src/db/repositories/chatRepo.ts` — `team:<teamId>` scope identity.
- `src/db/schema.ts` — V17 AI tables, V18, V19 extension point.
- `src/db/index.ts` — typed tables, registered migration, V18 purge.
- `src/types/backup.ts` — table and count types.
- `src/validation/backupSchemas.ts` — attribution schema, table schemas, version and forbidden keys.
- `src/services/backup/exportBackup.ts` — coordinated reads/tables/counts.
- `src/services/backup/validateBackup.ts` — version, shape and reference checks before writes.
- `src/services/backup/restoreBackup.ts` — table allowlists, clear/add, atomic restore.
- `src/services/localSqlitePersistence.ts` — TS SQLite table lists and flush.
- `src-tauri/src/sqlite_persistence.rs` — Rust `ALLOWED_TABLES`.
- `src/components/ai/office/TeamEditorDrawer.tsx` — existing create path; locate/reverify before roster UI work.
- `src/services/ai/office/teamRunCoordinator.ts` — cached profile/roster boundaries; minimal integration needed for snapshots and subsequent fresh reads, not runtime rewrite.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Six AI Office tables/types already exist: employees, leads, skills, teams, members, links. `AiTeam` plus `team:<teamId>` already provides required identity; no new chat container needed.
- `addTeamMember`/`removeTeamMember` already exist but scout found no UI callers. `deleteTeam` already transacts membership/link deletion.
- `countTeamsUsingEmployee`/`countAgentsUsingSkill` can inform messages; current UI counts alone do not enforce integrity.
- `ChatMessage` has attribution and `targetAgentId`; `listAssignmentHistory` uses `targetAgentId ?? agentId`. Existing `agentName` enables historical display without live profile.
- Existing backup validation, transactional restore and pre-import safety should be reused, not rebuilt.

### Established Patterns and Gaps
- V18 is occupied by SDLC purge. `aiSkillVersions` does not exist yet; add V19 and all persistence surfaces together.
- Current backup envelope is v11 with literal-version validation. `targetAgentId` is absent from `BackupChatMessageRecordSchema`, so Zod strips it on import.
- Live reference validation currently covers some lead/team/skill references, but membership agent references need review. Do not turn historical attribution into a foreign-key requirement.
- Current deleteEmployee/deleteLead/deleteSkill use bare deletes, leaving references. Fix at repository level, reconcile UI copy with actual refusal behavior.
- Group creation currently requires more up front and UI hardcodes roster/active caps. Existing group model requires research for valid empty-group state and durable leader lock.
- No TS⊆Rust assertion currently guards table parity. Test only focused contracts; never run full Vitest suite.

### Integration Points
- Coordinate Dexie schemas/table declarations, backup table types/schema/export/validate/restore, TS SQLite table lists and Rust allowlist in the same change set. Preserve full canonical rows across Tauri flush/reload.
- Minimal roster editing plus snapshot boundary must support D-07 without taking on Phase 37 scheduler work.
- `aiSkillVersions` contract must support pending versus approved history without introducing an AI-approved writer. Phase 39 decides detailed enrichment/restore UX.
- Observe real Tauri behavior for roster edit, delete refusal and backup round-trip; code reading alone is not runtime verification. No PWA/Pages work.
</code_context>

<specifics>
## Specific Ideas

- User on profile updates: **“nếu đang chạy thì vẫn giữ, chạy xong rồi thì lượt sau phải load realtimne”** — in-flight stable; subsequent turn refreshes immediately.
- User on leader: **“không cho phép thay leader”**, clarified **“Khóa khi bắt đầu chạy”** — editable before first run, immutable afterwards.
- All four proposed discussion areas were selected and resolved. No matching pending todos; no external references supplied by user.
</specifics>

<deferred>
## Deferred Ideas

Không có capability mới được user yêu cầu ngoài scope.

Ranh giới với phase sau, không coi là quyết định đã chốt:
- Phase 37: concurrency/default/scope, queue, abort, runtime teardown khi xóa nhóm, `MAX_BATCH_SIZE` semantics.
- Phase 38: chia/top-up token khi roster đổi, accounting/retry/missing-usage/threshold. Phase 36 chỉ không làm mất giá trị đã lưu hoặc trộn ngân sách giữa nhóm.
- Phase 39: một/nhiều skill per agent (R-11), skill version restore (R-12), proposal generation/approval UI; việc giữ lịch sử trong backup không tự phê duyệt chức năng restore version cũ.
- Phase 40: explorer redesign và chi tiết trình bày transcript (R-09); context này chỉ khóa identity/isolation và historical attribution, không mở thêm per-agent threads.
</deferred>

---
*Phase: 36-data-model-multi-chat-identity-backup-migration*
*Context gathered: 2026-11-10*
