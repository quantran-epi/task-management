# Phase 38: Hard token budget + accurate measurement - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Số token mà user thấy là đúng, và mỗi lần gọi model đều được ghi nhận đầy đủ vào ngân sách của người gọi.

Phase này gồm: đo `usage` input + output trên **mọi** request (kể cả retry và lượt bị abort); response thiếu `usage` vẫn được tính bằng ước lượng cục bộ có đánh dấu; increment nguyên tử (20 increment đồng thời cộng đúng); cảnh báo ngưỡng cấu hình được (global default + override nhóm) ở hai mức — member và tổng nhóm — kèm OS notification; top-up từng agent tăng cả tổng nhóm, top-up nhóm chia đều phần tăng, tất cả trong một transaction; WR-13 (top-up không tới được thành viên thêm sau snapshot) sửa tại seam roster; hiển thị granted/used/remaining tách input/output.

Phase này **không** gồm: skill versioning/enrichment (Phase 39); explorer 2 tầng, CRUD correctness, walkthrough tổng (Phase 40); thay đổi scheduler/concurrency (Phase 37 đã chốt); thay đổi mô hình participant/message/cursor (`.planning/ARCHITECTURE-TEAM-CHAT.md`).

**Override tiêu chí đã khoá — đọc kỹ:** user chốt trong discuss rằng **budget KHÔNG chặn** cứng. Ưu tiên hoàn thành công việc, không đứt giữa chừng. Điều này thay thế:
- `AIO-BUDGET-01` ("A turn whose prompt already exceeds the remaining budget is refused, not run") → turn **vẫn chạy**, chỉ cảnh báo.
- `AIO-BUDGET-09` ("Reaching the threshold pauses between tool rounds and resumes when the user tops up") → **không pause**; cảnh báo rồi tiếp tục.
- ROADMAP phase 38 success criteria 1 và 6 → đọc theo D-01/D-02 dưới đây, không theo wording cũ.
- `C-11` ("pause giữa tool rounds khi vượt ngưỡng") trong `.planning/MILESTONE-CONTEXT.md` → thay bằng cảnh báo + OS notification; user tự bấm Stop.

Các phase trước cũng đã ghi nhận việc này là điểm mở: 37-CONTEXT D-13 nói "Phase 38 làm đo chính xác", 37.1-CONTEXT D-13 chỉ yêu cầu ghi đúng chỗ. **Không tự thêm gate chặn trong lúc plan.**

**C-16 tiếp tục chi phối:** dữ liệu cũ là test, không cần migration bảo toàn. Nhưng validation, atomicity, backup đúng cho dữ liệu mới vẫn bắt buộc.

</domain>

<decisions>
## Implementation Decisions

### Ngưỡng và cảnh báo (OVERRIDE AIO-BUDGET-01/09, C-11)
- **D-01:** **Budget chỉ cảnh báo, không bao giờ chặn.** Không có pre-call refusal, không có pause-gate. Lượt vượt ngân sách vẫn được gửi tới model. Lý do (user): *"chỉ có ngưỡng cảnh báo, không được chặn, phải ưu tiên hoàn thành công việc chứ không phải đứt giữa chừng"*. — **Reversibility:** costly — đảo ngược nghĩa là thêm lại gate chặn trong `beforeToolRoundFor` và đổi contract của `budgetGate.ts`, cộng sửa criterion 1/6 lần nữa.
- **D-02:** Chạm/vượt 100% của member hoặc tổng nhóm → **cảnh báo trong app + OS notification**; user **tự bấm Stop** nếu muốn dừng. Không tự abort, không hỏi xác nhận trên chat, không nút "tiếp tục". Lý do (user): *"chỉ cảnh báo, gửi cả OS notification cho user, nếu cần user sẽ manual stop, không chặn cứng"*.
- **D-03:** Cảnh báo hai mức, **hai badge riêng**:
  - **Member**: người đó đã dùng vượt phần được cấp → cảnh báo nhẹ, gợi ý top-up.
  - **Nhóm**: tổng đã dùng vượt tổng đã cấp → cảnh báo mạnh.
  Hai mức độc lập: member vượt phần mình nhưng tổng nhóm còn dư → chỉ badge member.
- **D-04:** Ngưỡng cấu hình: **global default trong Settings** + **override trên từng `AiTeam`**. Field override trên `AiTeam` phải đi đủ 5 danh sách (Dexie schema, export, restore, validate, SQLite TS + Rust); giá trị global nằm ở `settings` table và phải qua `isSafeBackupSetting` whitelist (theo Phase 31 D-03).
- **D-05:** Ngưỡng là **một con số % duy nhất** áp cho cả hai mốc (cảnh báo và "đã chạm trần"). Không có nhiều nấc. Áp dụng cho cả member và nhóm; nhóm dùng cùng giá trị trừ khi `AiTeam` override.
- **D-06:** Chống spam notification: mỗi (nhóm, mức cảnh báo) chỉ gửi **một** OS notification cho tới khi được reset bởi top-up hoặc lượt mới. Không lặp lại mỗi tool round.
- **D-07:** Đo prompt trước khi gọi bằng **tokenizer cục bộ** (`js-tiktoken`). Đây là dependency mới, được user chấp nhận tường minh — trái với "zero new deps" của các phase trước. Chỉ dùng để **ước lượng và cảnh báo**, không dùng để chặn (D-01), nên sai khác với model lạ (Qwen/Llama/…) là chấp nhận được. — **Reversibility:** reversible — bỏ js-tiktoken và quay lại heuristic ký tự ÷4 chỉ là thay một hàm ước lượng.
- **D-08:** Ước lượng phải nhất quán với số thật: khi provider trả `usage`, dùng số đó; `js-tiktoken` chỉ là fallback. Không trộn hai nguồn trong cùng một lượt nếu đã có số thật.

### Cách tính usage
- **D-09:** Charge **cả input lẫn output** trên mọi request. `normalizeUsageTotal` (`budgetGate.ts:94-96`) hiện cộng rồi vứt phần tách — phải giữ lại cả hai. `cache_read` và `cache_creation` **được tính vào budget** như token thường (user chốt "tính tất cả"). Hệ quả: budget là thước đo token luỹ kế theo provider, không phải thước đo chi phí quy đổi.
- **D-10:** Response **không có `usage`** → **ước lượng bằng tokenizer** trên prompt đã gửi + văn bản đã nhận, ghi rõ là ước lượng. Ledger/UI đánh dấu ước lượng (tiền tố `~` + tooltip). **Không bao giờ free**, không bao giờ im lặng ghi 0. — **Reversibility:** reversible — đổi chính sách fallback chỉ là đổi hàm ước lượng.
- **D-11:** Retry và lần fail đều tính tiền; usage ghi trên **attempt row tương ứng** để xem được lần nào tốn bao nhiêu. Attempt = row mới đã là quyết định Phase 37 D-23; phase này chỉ thêm field usage lên row đó.
- **D-12:** Stream bị abort giữa đường: dùng `usage` do provider trả nếu có; thiếu thì ước lượng phần đã nhận bằng tokenizer và đánh dấu ước lượng. Không bỏ qua lượt abort.
- **D-13:** `addUsedTokens` phải là **increment nguyên tử thật**. Hiện là get-then-`update` không transaction (`aiTeamRepo.ts:497-508`), comment "ba completion đồng thời không mất usage" là sai. Phải nằm trong `db.transaction('rw', …)` với read-modify-write bên trong, hoặc dùng `table.where(...).modify(...)`. Tiêu chí kiểm chứng: 20 increment đồng thời cộng đúng (AIO-BUDGET-04).

### Chia budget và thành viên thay đổi
- **D-14:** Chia đều không hết → **phần dư dồn về leader** (giữ nguyên `writeEvenSplit` `aiTeamRepo.ts:86`). Quy tắc hiện bị **copy hai nơi** (`aiTeamRepo` và `TeamSettingsDrawer.tsx:57`) — gom về một hàm dùng chung để không lệch.
- **D-15:** Thêm agent sau khi đã cấp budget: **không chia lại**. Agent mới nhận `budgetTokens = 0` cho tới khi được top-up. Thành viên cũ giữ nguyên phần đã cấp. Nhất quán với D-07 Phase 36 (roster mới chỉ có hiệu lực từ lượt sau).
- **D-16:** **Top-up nhóm** → chia đều phần tăng cho mọi member hiện tại, trong **một** transaction, cùng hàm chia đều với D-14. Sửa lỗi hiện tại: `topUp` team-scope chỉ tăng `AiTeam.budgetTokens` mà không đụng member (`teamRunCoordinator.ts:3179-3217`), khiến gate member kẹt đóng.
- **D-17:** **Top-up từng agent** → tăng phần của agent đó **và tăng tổng nhóm** trong cùng một transaction (đúng `C-12`, `AIO-BUDGET-07`). User nhấn mạnh: *"nếu topup từng agent phải tăng tổng nhóm lên"*.
- **D-18:** **WR-13**: top-up phải **đọc roster tươi từ Dexie** thay vì dùng `ensureMembers` cache (`teamRunCoordinator.ts:1212-1217`, early return `membersLoaded`). Agent thêm giữa chừng top-up được ngay. Vẫn giữ D-07 Phase 36: nó chưa nhận việc trong lượt đang chạy, chỉ có ngân sách sẵn cho lượt sau.
- **D-19:** Mọi thay đổi budget nhiều bảng (member + team) là **một transaction**. Từ chối một nửa phép tính là không chấp nhận được (Phase 36 D-15).

### Hiển thị
- **D-20:** Vị trí: **header nhóm** (thanh tổng: đã cấp / đã dùng / còn lại) + **sidebar member** (số riêng từng người). **Không** hiện số trên từng bubble — transcript sạch.
- **D-21:** Đơn vị: **token thô có phân cách hàng nghìn + % phụ**. Không hiện tiền ước tính (không có bảng giá model).
- **D-22:** Số cập nhật **live trong lượt** từ coordinator live state, nhưng ledger chỉ ghi DB khi lượt/attempt kết thúc. UI và DB có thể lệch trong lúc chạy và phải thu về đúng khi xong. Đây là lý do `subscribe`/`listeners` vẫn cần (`.planning/ARCHITECTURE-TEAM-CHAT.md` §5 ngoại lệ có chủ đích).
- **D-23:** **Input và output lưu tách hai cột** trên member và attempt row; UI hiện tách. Cần đổi backup schema + SQLite TS + Rust trong cùng changeset.
- **D-24:** Hiển thị trạng thái ước lượng: giá trị ước lượng có tiền tố `~` và tooltip "ước lượng", để user không nhầm với số provider.

### Docs phải sửa cùng phase
- **D-25:** Ghi override D-01/D-02 vào `REQUIREMENTS.md` (AIO-BUDGET-01, AIO-BUDGET-09) và `ROADMAP.md` §Phase 38 success criteria 1 & 6, để agent sau không đọc wording cũ và tưởng đây là gap. Cùng cách Phase 37 đã xử lý AIO-RUNTIME-02.

### Claude's Discretion
- Tên field ledger cho input/output (phải qua `FORBIDDEN_BACKUP_KEYS`; tránh `error`, `runtime`, `prompt`, `stack`, `diagnostic`).
- Vị trí chính xác của badge trong header nhóm và sidebar.
- Cách hiển thị badge khi cả hai mức cùng vượt.
- Cache tokenizer instance giữa các lượt hay khởi tạo theo model.
- Số Dexie version kế tiếp và tên field override trên `AiTeam`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quyết định và phạm vi
- `.planning/ROADMAP.md` §Phase 38 — goal + success criteria 1–8; criterion 1 & 6 đọc theo D-01/D-02.
- `.planning/REQUIREMENTS.md` — AIO-BUDGET-01..09; AIO-BUDGET-01/09 bị D-01 override.
- `.planning/MILESTONE-CONTEXT.md` — C-11 (bị D-01/D-02 thay thế), C-12, C-15, C-16; R-03, R-04, R-06, R-15, R-19.
- `.planning/PROJECT.md` — constraints "Hard budget", "Verification honesty".
- `CLAUDE.md` — Tauri là runtime duy nhất; không làm PWA/GitHub Pages.

### Kiến trúc hiện hành — đọc trước khi sửa
- `.planning/ARCHITECTURE-TEAM-CHAT.md` — §5 ngoại lệ có chủ đích (`listeners`/`subscribe` giữ vì live state), §6 "budgetGate giữ nguyên" (nay bị D-01 làm mất nghĩa gate; xem lại trước khi sửa). Cổng verify: `bash .planning/scripts/verify-team-chat-architecture.sh`.

### Quyết định phase trước — không mở lại
- `.planning/phases/37-runtime-reliability-concurrency/37-CONTEXT.md` — D-13 (Phase 38 làm đo chính xác), D-22/D-23 (ledger append-only, attempt = row mới), D-09 (`transitionAssignment` là cửa ghi trạng thái duy nhất).
- `.planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-CONTEXT.md` — D-13 (ai gọi LLM thì tính người đó), D-24 (baseline usage key theo lượt; token của lượt dispatch không bị lượt synthesis xoá).
- `.planning/phases/36-data-model-multi-chat-identity-backup-migration/36-CONTEXT.md` — D-02/D-03 (lượt đang chạy giữ cấu hình), D-07 (roster chốt đầu lượt), D-15 (transaction), D-16..D-21 (backup), D-22 (Dexie version kế tiếp).

### Source contracts — đọc trước khi sửa
- `src/services/ai/office/budgetGate.ts` — `bucketOf` (:78-82), `shouldNotifyPause` (:89-91, hard-coded 0.8), `normalizeUsageTotal` (:94-96).
- `src/services/ai/office/teamRunCoordinator.ts` — `handleUsage` (:1242-1285), `hydrateBudgets` (:1187-1210), `ensureMembers` (:1212-1217), `beforeToolRoundFor` (:1325-1347), `topUp` (:3179-3217), `setTeamBudget` (:3019-3029), `loadRoster` (:1997-2000), `onUsage` (:1171).
- `src/db/repositories/aiTeamRepo.ts` — `splitBudget` (:69-71), `writeEvenSplit` (:73-91), `topUpMemberBudget` (:467-480), `setMemberBudget` (:483-494), `addUsedTokens` (:497-508 — **không nguyên tử**), `createTeam` (:156), `applyEvenSplit`.
- `src/types/aiOffice.ts` — `AiTeamMember` (:98-105), `BUDGET_PAUSE_THRESHOLD` (:260).
- `src/components/ai/office/TeamSidebar.tsx` (:119, :140-154), `BudgetTopUpModal.tsx`, `TeamSettingsDrawer.tsx` (:50-57 — quy tắc chia đều copy lần hai), `TeamWorkspace.tsx` (:147-150, :686-715, :1043-1075).
- `src/services/ai/nineRouterClient.ts` (:634-644 — nguồn `usage`), `src/services/ai/aiOrchestratorLoop.ts` (:305-314), `src/components/ai/runtime/chatTurnRuntime.ts` (:118 `onUsage` dep, :351-357 wiring).
- `src/validation/aiOfficeSchemas.ts` (:34, :97-121), `src/validation/backupSchemas.ts` (:194-198 `FORBIDDEN_BACKUP_KEYS`, :649, :663, :724, :759).
- `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts` + `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` — 5 danh sách phải cập nhật cùng lúc.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — mở rộng, không thay thế.

### Notification
- Tìm `Notification`/notification service hiện có (Phase 12 đã làm in-app notifications; Phase 37.1 quick task 261113-ita đã làm desktop notifications cho tin nhóm) trước khi viết cơ chế mới.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `budgetGate.ts` — `bucketOf` + `shouldNotifyPause` là nền của cảnh báo hai mức; có thể thay hằng 0.8 bằng giá trị truyền vào thay vì viết mới.
- `handleUsage` — đã có delta baseline theo `agentId:seq` (D-24 Phase 37.1), đúng chỗ để thêm split input/output và cờ ước lượng.
- `onUsage` trong `chatTurnRuntime` — funnel duy nhất cho usage; mọi đường gọi model đều đi qua đây.
- `teamTranscriptRepo.saveTeamMessage` — đã ghi `tokenUsage` trên message; nguồn để đối chiếu tổng.
- `BudgetTopUpModal.tsx` — đã có UI top-up; chỉ cần sửa semantics phía sau.
- Desktop notification path từ quick task 261113-ita — tái dùng, không viết mới.

### Established Patterns
- `FORBIDDEN_BACKUP_KEYS` chặn theo regex tên key (`error`, `runtime`, `prompt`, `stack`, `diagnostic`).
- Mọi thay đổi bảng phải cập nhật **5 danh sách** cùng lúc (schema, export, restore, validate, SQLite TS + Rust).
- Domain state trong Dexie; Zustand chỉ cho UI state. Live runtime state ở service module-level + `subscribe`.
- `transitionAssignment` là cửa ghi duy nhất cho trạng thái assignment.
- Không chạy full Vitest suite (user rule); test tập trung theo từng success criterion.

### Integration Points
- `beforeToolRoundFor` — chỗ hiện gọi `gate.wait(signal)`; **bỏ phần chờ** theo D-01, thay bằng phát cảnh báo.
- `handleUsage` → `aiTeamRepo.addUsedTokens` — chỗ sửa atomicity (D-13).
- `topUp` — chỗ sửa D-16/D-17/D-18 (roster tươi, transaction hai bảng).
- `TeamSidebar.tsx` header + member rows — chỗ hiển thị granted/used/remaining và badge ước lượng.
- `settings` table + `isSafeBackupSetting` — chỗ đặt global threshold.
- `js-tiktoken` — dependency mới, chỉ dùng cho ước lượng (D-07).

</code_context>

<specifics>
## Specific Ideas

- User về chặn cứng: **"chỉ có ngưỡng cảnh báo, không được chặn, phải ưu tiên hoàn thành công việc chứ không phải đứt giữa chừng"** — nguồn của D-01.
- User về hành vi khi cạn budget: **"chỉ cảnh báo, gửi cả OS notification cho user, nếu cần user sẽ manual stop, không chặn cứng"** — nguồn của D-02/D-06.
- User về top-up agent: **"chia đều phần tăng và lưu ý là nếu topup từng agent phải tăng tổng nhóm lên"** — nguồn của D-16/D-17.
- Từ 37.1 vẫn giữ nguyên hiệu lực: **"agent nào chạy thì tính token chứ, tóm lại cứ agent nào gọi LLM thì hết bao nhiêu token thì tính"** — nguồn của D-09/D-11.
- **"đừng bao giờ suggest tôi là làm cái này thì đơn giản, cái tôi cần là chất lượng"** (37-CONTEXT) — không tối giản schema, không bỏ edge case.

### Ambiguity resolved during discussion
- "Thêm tokenizer" trái với nguyên tắc zero-new-deps của các phase trước → user chấp nhận rõ ràng; ghi ở D-07 để planner không coi là vi phạm constraint.
- "Chỉ cảnh báo" trái với AIO-BUDGET-01/09 và C-11 → ghi override tường minh ở `<domain>` + D-01 + D-25, kèm việc sửa REQUIREMENTS/ROADMAP.

</specifics>

<deferred>
## Deferred Ideas

- Skill versioning/enrichment → Phase 39.
- Explorer 2 tầng, CRUD correctness, walkthrough tổng → Phase 40.
- Bảng giá model / quy đổi token sang tiền → không có trong phase này (user chọn token thô + %).
- Cảnh báo budget trên kênh khác ngoài OS notification (email, webhook) — không cần, app offline-first.
- Migration bảo toàn dữ liệu budget cũ — C-16 loại bỏ.

Không có todo pending khớp Phase 38 (`todo.match-phase` = 0).

</deferred>

---

*Phase: 38-hard-token-budget-accurate-measurement*
*Context gathered: 2026-11-13*
