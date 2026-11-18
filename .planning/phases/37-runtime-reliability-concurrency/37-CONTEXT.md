# Phase 37: Runtime reliability + concurrency - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Làm cho AI Office runtime **luôn kết thúc được**, **không hỏng state khi submit hai lần**, và **số agent chạy đồng thời là giới hạn thật, cấu hình được**. Kèm theo đó là một **sổ ghi lô** (batch/assignment ledger) đủ chi tiết để chạy lại (retry) một agent và để lead tổng hợp lại cả lô.

Phase này gồm: 5 defect runtime đã chỉ tới `file:line`; scheduler per-team; ledger 2 bảng + backup + SQLite; outbox queue khi lượt đang chạy; retry; per-agent stop + global abort; teardown khi xoá nhóm giữa lúc chạy; finish `teamTurnId` trong `finally`.

Phase này **không** gồm: token accounting đo input+output và ngưỡng (Phase 38); skill versioning/enrichment (Phase 39); explorer 2 tầng (Phase 40); **live steering** — leader nhận yêu cầu bổ sung giữa lúc chạy, tự sửa phân công (`amend_assignments`), gửi chỉ đạo realtime cho agent đang chạy (**Phase 37.1**, tách riêng vì khối lượng — xem D-19).

**C-16 tiếp tục chi phối:** dữ liệu cũ là test, không có yêu cầu bảo toàn. Đổi schema ledger không cần migration bảo toàn dữ liệu cũ; nhưng validation, atomicity, và backup đúng cho dữ liệu mới vẫn bắt buộc.
</domain>

<decisions>
## Implementation Decisions

### Scheduler concurrency (AIO-RUNTIME-05, AIO-GROUP-04)
- **D-01:** Giới hạn concurrency áp **theo nhóm** (per-team), không phải toàn cục. Mỗi coordinator sở hữu một scheduler riêng; hai nhóm chạy cùng lúc có thể dùng `2 + 2` slot. — **Reversibility:** costly — nếu sau này cần trần toàn cục, mọi điểm acquire/release phải đi qua thêm một tầng và ledger phải ghi thêm scope.
- **D-02:** Mặc định **3**, hợp lệ **1–12**. Khớp dải của `ghostDevConfig.ts` để toàn app nhất quán; clamp ở trust boundary, không chỉ ở UI.
- **D-03:** Limit lưu **trên `AiTeam`** (field mới), chỉnh trong Team Settings Drawer. Không dùng global setting trong bảng `settings`. — **Reversibility:** costly — field này phải vào backup schema, restore, SQLite TS + Rust và cả drawer; đổi sang global setting sau sẽ phải migrate.
- **D-04:** Đổi limit **giữa lúc batch đang chạy có hiệu lực ngay**: tăng → agent đang xếp hàng được nhả ra tới mức mới; giảm → không cắt agent đang chạy, chỉ ngừng nhận thêm cho tới khi số đang chạy xuống dưới mức mới. Scheduler phải hỗ trợ `setLimit(n)` + drain FIFO.
- **D-05:** Agent xếp hàng theo **thứ tự trong plan** (thứ tự lead đưa ra trong `delegate_batch`), khớp kế hoạch user nhìn thấy và phê duyệt trên `AssignmentPlanCard`. Không ưu tiên theo budget, không round-robin.
- **D-06:** **Bỏ hẳn `MAX_BATCH_SIZE`** (`types/aiOffice.ts:138`): xoá hằng, xoá refusal `BATCH_TOO_LARGE` (`teamTools.ts:296-301`), bỏ con số khỏi prompt lead (`teamPrompts.ts:161`). Lead giao bao nhiêu việc cũng được; scheduler per-team là luật duy nhất quyết định bao nhiêu agent chạy thật. Lý do: cap lô chỉ còn ý nghĩa khi chưa có scheduler; sau khi có scheduler, nó không bảo vệ tài nguyên, không bảo vệ budget (Phase 38 chặn theo request), không chống treo (D-11 làm việc đó). — **Reversibility:** one-way — hằng này đã được tham chiếu trong tool schema, prompt, test và tài liệu Phase 34; khôi phục sẽ phải sửa lại contract của tool `delegate_batch`.
- **D-07:** Scheduler **tự viết** (`src/services/ai/office/scheduler.ts`, ~60 dòng): `acquire(signal)`, `release()` idempotent, `setLimit(n)` drain FIFO, `cancel(handle)` cho assignment bị huỷ khi còn xếp hàng. Không thêm `p-limit`/`p-queue`/`async-mutex`. Contract và cách park theo abort mirror `budgetGate.ts` đã chứng minh đúng.
- **D-08:** Scheduler **đọc ledger làm nguồn sự thật** — không giữ danh sách assignment riêng. Lý do: Phase 37.1 cho leader huỷ/đổi assignment còn `queued`; hai nguồn sự thật sẽ đánh nhau.
- **D-09:** Mọi chuyển trạng thái assignment đi qua **một** hàm `transitionAssignment(id, from, to, patch)` trong Dexie `rw` transaction, kiểm tra `from` khớp mới ghi. Scheduler, retry, abort, teardown dùng chung một cửa. Ghi trực tiếp `table.update()` bị cấm cho trạng thái assignment.

### Stop / abort semantics (AIO-LEAD-05, AIO-RUNTIME-04)
- **D-10:** Per-agent Stop trên agent còn **xếp hàng** (chưa `start()`) → settle ngay `runStatus:'stopped'`, `stopReason:'user-per-agent'`, `incomplete:true`; **không bao giờ gọi `start()`**, không tốn token, scheduler bỏ qua.
- **D-11:** Global abort **kéo cả hàng đợi**: agent đang chạy bị abort; agent xếp hàng bị settle `stopped`/`incomplete`; plan park và approval park được nhả; `phase` về `ready`; batch resolve. Không ngoại lệ.
- **D-12:** **Retry = chạy lại đúng task của assignment đó cho đúng agent đó, rồi lead tổng hợp lại cả lô.** Report mới ghi vào transcript; lead được gọi lại một lần với đủ report của lô (đọc từ ledger, gồm cả agent đã xong trước đó); synthesis cũ bị đánh dấu superseded bởi synthesis mới. Không chạy lại các agent đã thành công.
- **D-13:** Retry có đường riêng trên UI: bubble của agent đã stop/error hiện nhãn "Chưa hoàn tất" + nút "Chạy lại". Chạy lại không qua plan duyệt lại. Task lấy từ assignment row, không phải từ text user gõ lại.
- **D-14:** Khi có agent bị stop/error trong lô, **lead phải nêu rõ phần thiếu** trong câu tổng hợp: tool result của `delegate_batch` ghi rõ agent nào chưa hoàn tất và vì sao; prompt lead buộc nêu phần thiếu thay vì coi lô là xong.
- **D-15:** Không có watchdog timeout cứng. Dựa vào timeout của provider/9router và nút Stop. Lý do: lượt dài hợp lệ (agent đọc nhiều context) không bị cắt nhầm.

### Failure containment (AIO-RUNTIME-01, AIO-RUNTIME-03, AIO-RUNTIME-04)
- **D-16:** `start()` throw → assignment row `runStatus:'error'`, `stopReason:'provider'`; deferred **luôn resolve trong `finally`**; batch resolve với error row đó; lead nhận tool result ghi rõ agent lỗi (thông điệp sanitized). Không có đường nào treo ở `batch-running`.
- **D-17:** Lỗi hiển thị cho user/lead là **thông điệp sanitized cố định** (không stack, không URL, không key), theo pattern `SANITIZED_TURN_ERROR`. Chi tiết kỹ thuật chỉ ghi trong assignment row ở field riêng, không vào transcript và không vào backup. Tên field phải tránh `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:194-198` cấm `error`, `runtime`, `prompt`, `stack`, ...) — dùng `runStatus`, `stopReason`, `diagnosticDetail` (kiểm tra regex trước khi đặt tên).
- **D-18:** **Chuyển `coordinatorRegistry` ra `src/services/ai/office/teamRunManager.ts`**; `deleteTeam` gọi `dispose(teamId)` **trước khi** xoá row: huỷ mọi inbox, abort mọi agent, resolve mọi deferred, đóng ledger (batch `abortedBy:'team-deleted'`), rồi mới xoá. Explorer xoá nhóm mà không mount workspace vẫn phải teardown đúng. — **Reversibility:** costly — registry hiện là module-level trong component; mọi nơi giữ coordinator (TeamWorkspace, explorer, Phase 40 badge) phải đổi sang manager API.
- **D-19:** `registerTeamTurn()` phải được **finish trong `finally` của `send()`** (hiện đăng ký `team:<teamId>` ở `:562-571` và không bao giờ finish). `getActiveTurns()` phải rỗng sau mọi lượt. Abort callback của team turn vẫn trỏ `abortAll`.

### Submit + outbox (override AIO-RUNTIME-02)
- **D-20:** **Ghi đè AIO-RUNTIME-02.** Gửi khi lượt đang chạy **không bị reject** mà **vào outbox** (hiện phía trên composer, huỷ được), tự dispatch khi lượt hiện tại settle. Một lượt chạy tại một thời điểm; submit thứ hai xếp hàng và **hiện rõ là đang xếp hàng**, không bao giờ mất chữ, không bao giờ `TURN_IN_PROGRESS` rơi vào void. Wording cũ ("rejected visibly at the composer") bị thay thế vì user chọn mô hình queue như Claude Code. — **Reversibility:** one-way — override này đổi acceptance criterion của roadmap; quay lại reject nghĩa là xoá outbox khỏi composer và kiểm chứng lại toàn bộ luồng submit.
- **D-21:** Khi lượt đang **park** (`awaiting-budget` / `awaiting-mutation-approval`): **cho gửi nhưng không chồng lượt**. Message vào outbox; nó chỉ dispatch sau khi lượt hiện tại thực sự settle. Không mở lượt thứ hai song song với một lượt đang park.

### Ledger schema (retry + flow phức tạp)
- **D-22:** Hai bảng Dexie mới (**V20**), không nhét vào `ChatMessage`:
  - `aiTeamBatches`: `id`, `teamId`, `threadId`, `batchIndex`, `userRequest`, `leadId`, `planSnapshot` (assignment list lúc duyệt), `planDecision` (`approved|rejected|auto`), `startedAt`, `endedAt`, `phaseAtEnd`, `abortedBy` (`user|team-deleted|app-exit|none`).
  - `aiTeamAssignments`: `id`, `batchId`, `agentId`, `agentName` (snapshot), `skillId` + `skillVersion` (snapshot — Phase 39 pin version), `model` (snapshot), `task`, `runStatus` (`queued|running|done|stopped|error|skipped`), `stopReason` (`user-per-agent|user-abort|team-deleted|provider|tool-limit|budget-pause|none`), `attemptNo`, `retryOfAssignmentId`, `incomplete`, `queuedAt`, `startedAt`, `endedAt`, `instructionMessageId`, `reportMessageId`, `tokenUsage`, `toolCallCount`.
  - `ChatMessage` chỉ thêm **link**: `batchId`, `assignmentId`, `attemptNo`, `runStatus`, `stopReason`, `incomplete`, `supersededByMessageId`, `supersededAt`. Link để transcript render/ghép chính xác; nguồn sự thật của trạng thái là ledger.
  - — **Reversibility:** one-way — thêm 2 bảng nghĩa là cập nhật đồng thời 5 danh sách (schema, export, restore, validate, SQLite TS + Rust) cộng backup version; đổi shape về sau cần migration và đổi envelope.
- **D-23:** **Attempt = row mới, append-only.** Mỗi lần chạy (lần đầu + mọi retry) tạo `aiTeamAssignments` row mới: `attemptNo` tăng, `retryOfAssignmentId` trỏ lần trước; report cũ set `supersededByMessageId`. Giữ đủ lịch sử: lần nào fail vì gì, token mỗi lần, kết quả nào là cuối.
- **D-24:** Shape dữ liệu phải **biểu diễn được trước** 4 flow phức tạp, kể cả khi runtime/UI của chúng ở phase sau — mục tiêu là "đội AI chạy như team dev thật", không phải happy path:
  - **Handoff agent → agent**: assignment có cạnh phụ thuộc (`dependsOn: assignmentId[]`) và trạng thái `blocked`/`unblocked` biểu diễn được.
  - **Nhiều lô trong một lượt**: `batchIndex` tăng trong cùng lượt; lead synthesis giữa các lô persist được.
  - **Sửa kế hoạch trước khi chạy**: `planSnapshot` giữ bản gốc, bản đã sửa và quyết định; không ghi đè mất bản gốc.
  - **Agent hỏi ngược / báo kẹt**: `runStatus:'needs-input'` và đường quay lại sau khi có câu trả lời biểu diễn được.
  - Phase 37 **chạy runtime** cho: retry (D-12/D-13), nhiều lô, per-agent stop/abort, scheduler. **Không chạy runtime** cho: handoff agent→agent, sửa plan trên card, agent hỏi ngược — schema + trạng thái lưu được, logic/UI ở phase sau (37.1 hoặc 40).
- **D-25:** Ledger ghi **snapshot** `agentName`, `skillId`+`skillVersion`, `model` tại thời điểm chạy, để retry và lịch sử không phụ thuộc hồ sơ hiện tại (khớp Phase 36 D-02/D-17).
- **D-26:** Backup/restore/validate và SQLite TS + Rust phủ cả 2 bảng mới trong **cùng changeset**; thêm assertion TS⊆Rust. Không có ngoại lệ "làm sau".

### Verify
- **D-27:** Verify bằng **focused Vitest cho từng success criterion** (throwing `start`, double-submit vào outbox, `getActiveTurns()` rỗng, limit 2 với batch 5, delete mid-run, stop/abort, retry) **và walkthrough Tauri thật** cho luồng batch có scheduler. C-15 đòi hành vi quan sát được. **Không chạy full Vitest suite** (user rule).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quyết định và phạm vi
- `.planning/MILESTONE-CONTEXT.md` — C-01..C-16; đặc biệt C-05, C-08/C-09/C-10, C-15, C-16.
- `.planning/PROJECT.md` — constraints; Tauri-only scope theo `CLAUDE.md`.
- `.planning/REQUIREMENTS.md` — AIO-RUNTIME-01..05, AIO-GROUP-04, AIO-LEAD-05. **D-20 override AIO-RUNTIME-02 wording.**
- `.planning/ROADMAP.md` — Phase 37 + success criteria 1–6 + WR-13 follow-up.

### Quyết định phase trước (không mở lại)
- `.planning/phases/36-.../36-CONTEXT.md` — D-02/D-03 (lượt chạy giữ cấu hình đã nhận; lượt sau đọc hồ sơ mới), D-07 (roster chốt đầu lượt), D-13 (live-use claim), D-16..D-21 (backup/restore), D-22 (Dexie V19 đã dùng; **V20 là số kế tiếp**).
- `.planning/phases/35-.../35-CONTEXT.md` — SDLC deletion, reusable patch primitives, fresh-data-only.
- `.planning/phases/35-.../35-VERIFICATION.md` — debt đã công khai.

### Research — kiểm chứng lại trên cây code hiện tại, không phải authority
- `.planning/research/SUMMARY.md` — Pitfalls 7, 8, 9, 10, 15, 16, 18, 25; module inventory.
- `.planning/research/ARCHITECTURE.md` — đề xuất chuyển registry, semaphore tự viết.
- `.planning/research/PITFALLS.md` — defect đã trace `file:line`.
- `.planning/research/STACK.md` — zero new dependency.

### Source contracts — đọc trước khi sửa
- `src/services/ai/office/teamRunCoordinator.ts` — toàn bộ state machine, `runBatch`, `send`, `stopAgent`, `abortAll`, `topUp`, `settleAgent`, `handleUsage`, `registerTeamTurn`.
- `src/services/ai/office/teamRunRegistry.ts` — một `ChatTurnRuntime` per agent; `clear()` hiện chưa được gọi ở đâu.
- `src/services/ai/office/budgetGate.ts` — contract park/resolve để mirror trong scheduler.
- `src/services/ai/office/liveUseRegistry.ts` — live-use claim (D-13 Phase 36), không persist.
- `src/services/ai/office/teamTools.ts` — `delegate_batch` validator, `MAX_BATCH_SIZE` refusal.
- `src/services/ai/office/teamPrompts.ts` — prompt lead/employee, chỗ bỏ con số batch cap.
- `src/components/ai/runtime/chatTurnRuntime.ts` — `start()` throw `TURN_IN_PROGRESS` (`:216`), `beforeToolRound`, `ChatTurnPhase`.
- `src/services/ai/aiOrchestratorLoop.ts` — nơi `beforeToolRound` được await; seam của Phase 37.1.
- `src/services/ai/aiTurnManager.ts` — `registerTurn`/`finishTurn`/`getActiveTurns`, purge 800ms.
- `src/components/ai/office/TeamWorkspace.tsx` — `coordinatorRegistry` (`:72`), `sendTurn` (`:386-406`), composer wiring (`:700-760`).
- `src/db/repositories/aiTeamRepo.ts` — `deleteTeam` (`:306`), `topUpMemberBudget`, `lockLeader`.
- `src/db/repositories/teamTranscriptRepo.ts` — `saveTeamMessage`, `listInterruptedAssignments`, `listAssignmentHistory`.
- `src/types/models.ts` §`ChatMessage` (`:281-303`) — chỗ thêm link field.
- `src/types/aiOffice.ts` — `MAX_BATCH_SIZE` (`:138`), `BUDGET_PAUSE_THRESHOLD`, `AgentRunState`.
- `src/validation/backupSchemas.ts` — `FORBIDDEN_BACKUP_KEYS` (`:194-198`), `BackupChatMessageRecordSchema` (`:291-333`).
- `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts` — table lists phải cập nhật cùng lúc.
- `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` — TS/Rust table parity.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 45+ test hiện có; mở rộng, không thay thế.

### Lịch sử — không tự kế thừa
- `.planning/phases/34-.../34-CONTEXT.md` — D-02 (`MAX_BATCH_SIZE` = 3) là nguồn của quyết định bị D-06 bác bỏ.
- `.planning/debug/ai-office-group-chat-bugs.md` — 4 bug UX đã sửa; không mở lại.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `budgetGate.ts` — pattern park/resolve + abort-aware `wait(signal)`; scheduler nên copy đúng cấu trúc này thay vì tự nghĩ ra.
- `teamRunRegistry.ts` — mỗi agent một runtime, đã đúng cho concurrency thật; `clear()` có sẵn nhưng chưa được gọi → dùng cho `dispose`.
- `aiTurnManager.ts` — `registerTurn`/`finishTurn`/`getActiveTurns` đã có, tự purge sau 800ms; chỉ thiếu lời gọi `finishTurn` cho `teamTurnId`.
- `teamTranscriptRepo.saveTeamMessage` — đã ghi `targetAgentId`, `messageKind`, `tokenUsage`; chỉ cần thêm link field.
- `aiTeamRepo.deleteTeam` — đã transact đúng 6 bảng; chỉ cần gọi `dispose` trước.
- Dexie `transition`-style guard: pattern transaction + đọc-trước-ghi đã dùng trong `lockLeader`, `activateTeam`.

### Established Patterns
- `FORBIDDEN_BACKUP_KEYS` chặn theo regex trên **tên key**, đệ quy: `error`, `runtime`, `prompt`, `stack`, `diagnostic` đều bị chặn — đặt tên field ledger phải kiểm tra regex trước.
- Mọi thay đổi bảng phải cập nhật **5 danh sách** cùng lúc (Pitfall 23, Phase 36 D-26).
- Không dùng Zustand cho domain state; runtime state (inbox/outbox/scheduler) là module-level service như `coordinatorRegistry`.
- Prompt lead nằm trong `teamPrompts.ts`; mọi thay đổi hành vi lead phải sửa cả tool description và system prompt.

### Integration Points
- `TeamWorkspace.tsx` composer (`AiChatWidget.onSubmit` → `handleSubmit` → `void sendTurn`) là chỗ thêm outbox UI và trạng thái "đang xếp hàng".
- `AiOfficeExplorer.handleDeleteTeam` (`:82-86`) gọi `deleteTeam` **không** mount workspace → đây chính là đường làm teardown (D-18) trở nên bắt buộc.
- `teamRunCoordinator.runBatch` (`:872-930`) là chỗ thay `Promise.allSettled(started)` bằng scheduler acquire/release.
- `startEmployeeTurn` (`:610-688`) và `startLeadTurn` (`:690-761`) là chỗ thêm ledger transition và `finally` cho deferred.
</code_context>

<specifics>
## Specific Ideas

- User on AI teams: **"ứng dụng AI teams sẽ có rất nhiều flow phức tạp, giống như 1 team dev ngoài đời thực, không phải lúc nào cũng đi theo đúng happy case, nên phải thiết kế data đầy đủ nhất có thể để có thể handle được những case sử dụng phức tạp nhất"** — nguồn của D-22/D-23/D-24. Không tối giản schema; không đề xuất "bản đơn giản hơn".
- User on submit: **"claude code cho phép gửi tin nhắn queue… thiết kế code và kiến trúc phải đủ flexible để mỗi agent hay lead đều như 1 team member thực sự"** — nguồn của D-20 và việc tách Phase 37.1.
- User on leader steering (verbatim): **"tôi có thể bổ sung yêu cầu cho leader và leader lập tức phân tích lại xem cần thay đổi gì về phân việc hay không, hay có cần gửi thêm thông tin cho agent đang chạy không. leader có thể amend và chỉ đạo realtime cho các agent"** — định nghĩa scope của Phase 37.1, không phải Phase 37.
- User on batch cap: **"tại sao phải giới hạn?"** → dẫn tới D-06 bỏ hẳn.
- User on quality: **"đừng bao giờ suggest tôi là làm cái này thì đơn giản, cái tôi cần là chất lượng"**.
- User on scope: chọn tách Phase 37.1 thay vì gộp, sau khi được ước lượng khối lượng.

### Ambiguity resolved during discussion
- "Scheduler là cái gì" — giải thích: bộ phận quyết định agent nào chạy thật/agent nào chờ, giữ slot, nhả slot kể cả khi lỗi/stop, đổi limit live. Hiện `runBatch` chạy tất cả cùng lúc.
- "Chạy lại thì kết quả như thế nào, lead tổng hợp lại à?" — trả lời: có, lead tổng hợp lại cả lô (D-12), synthesis cũ superseded.
- "Có khả thi nếu thiết kế như Claude Code không?" — có, nhưng tách Phase 37.1 để Phase 37 không vỡ chất lượng.
</specifics>

<deferred>
## Deferred Ideas

- **Phase 37.1 — Live steering**: outbox + inbox agent, drain ở `beforeToolRound`, tool `amend_assignments` (cancel/update task/steer), leader re-plan giữa lô, UI steer agent đang chạy. Schema Phase 37 sẵn sàng (D-22/D-24).
- **Phase 38**: token accounting input+output, atomic `addUsedTokens`, retry charging, threshold config, top-up per-agent tăng tổng nhóm, hiển thị budget. Phase 37 chỉ giữ nguyên giá trị đã lưu và không trộn ngân sách giữa nhóm.
- **Phase 39**: skill versioning/enrichment; `skillVersion` snapshot trong ledger (D-25) là điểm nối.
- **Phase 40**: explorer 2 tầng, live run badge (dùng `teamRunManager.peekRun`), CRUD correctness, walkthrough tổng.
- **Handoff agent→agent**, **sửa plan trên card**, **agent hỏi ngược**: schema biểu diễn được (D-24) nhưng runtime/UI chưa làm trong milestone phase này — ghi nhận khi plan Phase 37.1/40.
- Wording AIO-RUNTIME-02 trong `.planning/REQUIREMENTS.md` bị D-20 override; cân nhắc cập nhật REQUIREMENTS khi chốt phase để tránh agent sau đọc lại wording cũ.

Không có todo pending khớp Phase 37 (`todo.match-phase` = 0).
</deferred>

---

*Phase: 37-runtime-reliability-concurrency*
*Context gathered: 2026-11-11*
