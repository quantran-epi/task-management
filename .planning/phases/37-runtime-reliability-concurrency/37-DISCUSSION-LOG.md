# Phase 37: Runtime reliability + concurrency - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 37-runtime-reliability-concurrency
**Areas discussed:** Scheduler concurrency, Stop / abort semantics, Double-submit + composer, Failure containment

---

## Scheduler concurrency

### Scope of the limit

| Option | Description | Selected |
|--------|-------------|----------|
| Toàn cục (khuyến nghị) | Một semaphore cho cả app; mọi agent của mọi nhóm cộng lại không vượt limit | |
| Theo nhóm | Mỗi coordinator có semaphore riêng; nhóm A 2 + nhóm B 2 = 4 | ✓ |
| Toàn cục + trần theo nhóm | Semaphore toàn cục + trần per-team nhỏ hơn | |

**User's choice:** Theo nhóm
**Notes:** —

### Default value and clamp

| Option | Description | Selected |
|--------|-------------|----------|
| 3, clamp 1–12 (khuyến nghị) | Khớp `ghostDevConfig.ts` | ✓ |
| 2, clamp 1–8 | Thận trọng hơn, giảm rủi ro rate-limit | |
| Tự theo roster, trần 4 | Tự thích ứng nhưng khó đoán, khó test success criterion #4 | |

**User's choice:** 3, clamp 1–12

### Setting location

| Option | Description | Selected |
|--------|-------------|----------|
| Một setting toàn app (khuyến nghị) | Key trong bảng `settings` | |
| Per-team, lưu trên AiTeam | Field mới trên `AiTeam`, chỉnh trong Team Settings Drawer | ✓ |
| Toàn app + override per-team | Null = mặc định | |

**User's choice:** Per-team, lưu trên `AiTeam`
**Notes:** —

### Live limit change

| Option | Description | Selected |
|--------|-------------|----------|
| Ngay, sống (khuyến nghị) | Tăng → nhả thêm slot; giảm → không cắt agent đang chạy | ✓ |
| Chốt ở đầu batch | Đổi chỉ ảnh hưởng batch kế tiếp | |

**User's choice:** Ngay, sống

### Queue order

| Option | Description | Selected |
|--------|-------------|----------|
| Thứ tự trong plan (khuyến nghị) | Khớp kế hoạch user đã duyệt trên AssignmentPlanCard | ✓ |
| Ưu tiên theo budget còn lại | Tối ưu throughput nhưng không đoán được | |
| Round-robin | Công bằng, thêm state phải lưu | |

**User's choice:** Thứ tự trong plan

### MAX_BATCH_SIZE (AIO-GROUP-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Batch = hằng 3, concurrency cấu hình (khuyến nghị) | Hai control riêng | |
| Bỏ hẳn cap | Concurrency là luật duy nhất | ✓ |
| Cả hai đều cấu hình per-team | Thêm 2 setting | |

**User's choice:** Bỏ hẳn cap
**Notes:** User hỏi "max batch size là cái gì", sau đó "tại sao phải giới hạn?". Giải thích: hằng 3 là di sản Phase 34 khi chưa có scheduler; sau khi có scheduler nó không bảo vệ tài nguyên, không chặn budget, không chống treo. User chọn bỏ hẳn.

### Scheduler implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Semaphore tự viết (khuyến nghị) | ~60 dòng, contract mirror `budgetGate.wait` | ✓ |
| p-limit | Thêm dependency, thiếu cancel/setLimit live | |
| Worker pool đọc ledger | N worker tuần tự | |

**User's choice:** Semaphore tự viết

### Ledger write concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| Transition có kiểm tra trạng thái (khuyến nghị) | `transitionAssignment(id, from, to, patch)` trong `rw` transaction | ✓ |
| Update trực tiếp | Ít code, dễ đua | |

**User's choice:** Transition có kiểm tra trạng thái

---

## Stop / abort semantics

### Stop on a queued agent

| Option | Description | Selected |
|--------|-------------|----------|
| Settle ngay, không start (khuyến nghị) | `stopped` + `incomplete`, không tốn token | ✓ |
| Start rồi abort ngay | Tốn một request, có thể ghi report rỗng | |
| Chỉ gỡ khỏi hàng, không ghi status | Mất dấu agent được giao việc | |

**User's choice:** Settle ngay, không start

### Global abort and the queue

| Option | Description | Selected |
|--------|-------------|----------|
| Kéo cả hàng đợi (khuyến nghị) | Abort tất cả, nhả park, `phase` về `ready` | ✓ |
| Chỉ dừng agent đang chạy | Agent xếp hàng vẫn chạy tiếp | |

**User's choice:** Kéo cả hàng đợi

### Retry path

| Option | Description | Selected |
|--------|-------------|----------|
| Có nút Chạy lại (khuyến nghị) | Bubble có "Chưa hoàn tất" + "Chạy lại" | ✓ |
| Không có nút, dựa vào @mention | Ít code, user tự nhớ task | |
| Nút Chạy lại cho cả lô | Thêm luồng phải test | |

**User's choice:** Hỏi ngược "chạy lại thì kết quả sẽ như nào, lead tổng hợp lại à?" sau đó chọn hướng có lead tổng hợp lại.

### Retry result

| Option | Description | Selected |
|--------|-------------|----------|
| A. Retry → lead tổng hợp lại cả lô (khuyến nghị) | Synthesis mới thay cũ, cần `batchId` + `assignmentId` | ✓ |
| B. Retry chỉ ghi report, không gọi lead | Rẻ, tổng hợp cũ sai | |
| C. Chạy lại cả lô từ đầu | Tốn token, ghi trùng | |

**User's choice:** A

### Lead awareness of stopped agents

| Option | Description | Selected |
|--------|-------------|----------|
| Lead phải nêu phần thiếu (khuyến nghị) | Tool result + prompt buộc nêu | ✓ |
| Chỉ nhãn ở UI | Không đổi prompt | |
| Lead dừng, hỏi user | Gián đoạn luồng | |

**User's choice:** Lead phải nêu phần thiếu

### Transcript fields

| Option | Description | Selected |
|--------|-------------|----------|
| Đủ bộ field cho retry (khuyến nghị) | batchId, assignmentId, runStatus, stopReason, incomplete | ✓ |
| Tối thiểu: assignmentId + runStatus | | |
| Giữ schema hiện tại | | |

**User's choice:** Đủ bộ, mở rộng lên "đủ cho flow phức tạp", không tối giản.

### Storage location

| Option | Description | Selected |
|--------|-------------|----------|
| Hai bảng riêng + link từ message (khuyến nghị) | `aiTeamBatches` + `aiTeamAssignments`, Dexie V20 | ✓ |
| Một bảng run ledger | Lặp planSnapshot trên từng row | |
| Chỉ mở rộng ChatMessage | Không index theo batch | |

**User's choice:** Hai bảng riêng

### Attempt representation

| Option | Description | Selected |
|--------|-------------|----------|
| Append-only attempt rows (khuyến nghị) | Row mới mỗi lần, `retryOfAssignmentId`, report cũ superseded | ✓ |
| Mutate một row, cộng dồn attempt | Mất lịch sử | |
| Append, không supersede | Dễ hiểu nhầm kết quả cuối | |

**User's choice:** Append-only attempt rows
**Notes:** User làm rõ: ý không phải "attempt nhiều lần" mà là AI team phải chạy được flow phức tạp như team dev thật; data phải đủ nhất có thể.

### Complex flows the schema must represent

| Option | Selected |
|--------|----------|
| Handoff agent → agent | ✓ |
| Nhiều lô trong một lượt | ✓ |
| Sửa kế hoạch trước khi chạy | ✓ |
| Agent hỏi ngược / báo kẹt | ✓ |

**User's choice:** Cả bốn
**Notes:** Kéo theo D-24 — schema biểu diễn được cả bốn; runtime Phase 37 chỉ chạy retry + nhiều lô + stop/abort.

### Runtime scope for those flows

| Option | Description | Selected |
|--------|-------------|----------|
| Schema đủ, runtime đủ cho retry + lô + stop (khuyến nghị) | Flow còn lại schema sẵn, UI sau | ✓ |
| Runtime cho cả 4 flow | Phase quá lớn | |
| Chỉ đúng success criteria | Retry phải tách phase riêng | |

**User's choice:** Schema đủ, runtime đủ cho retry + lô + stop

---

## Double-submit + composer

### Second submit while running

| Option | Description | Selected |
|--------|-------------|----------|
| Disable Gửi, giữ draft (khuyến nghị) | Không reject ngầm | |
| Cho bấm, báo lỗi rồi giữ draft | Đúng wording AIO-RUNTIME-02 | |
| Disable Gửi + hàng đợi gửi sau | Thêm queue phía client | |

**User's choice:** Hỏi "có khả thi nếu thiết kế thật mạnh mẽ như claude code không? claude code cho phép gửi tin nhắn queue" — dẫn tới thảo luận live steering.

### Queue vs reject

| Option | Description | Selected |
|--------|-------------|----------|
| Queue như Claude Code (khuyến nghị) | Outbox, huỷ được, dispatch khi settle; override AIO-RUNTIME-02 | ✓ |
| Disable Gửi, không queue | Không đạt "bổ sung yêu cầu giữa lúc chạy" | |
| Queue user, leader chỉ amend sau lượt | Hạn chế hơn | |

**User's choice:** Queue như Claude Code

### Live steering phase

| Option | Description | Selected |
|--------|-------------|----------|
| Đủ live steering trong Phase 37 (khuyến nghị) | Phase lớn nhất milestone | |
| Seam + queue ở 37, UI steer ở 40 | Giảm rủi ro | |
| Phase riêng cho steering | | |

**User's choice:** Hỏi "phase 37 có lớn quá không, có hiệu quả không?" → sau khi thấy ước lượng khối lượng, chọn tách.

### Split

| Option | Description | Selected |
|--------|-------------|----------|
| 37 = runtime+scheduler+retry+ledger; 37.1 = steering (khuyến nghị) | Mỗi phase verify độc lập | ✓ |
| 37 = runtime+queue; 37.1 = retry+amend | | |
| Gộp hết, không tách | Rủi ro cao nhất | |

**User's choice:** 37 = runtime+scheduler+retry+ledger; 37.1 = steering

### Parked phase submit

| Option | Description | Selected |
|--------|-------------|----------|
| Cho gửi, nhưng không chồng lượt (khuyến nghị) | Vào outbox, dispatch sau khi lượt settle | ✓ |
| Disable cho tới khi hết park | | |
| Cho gửi, mở lượt mới song song | State khó đúng | |

**User's choice:** Cho gửi, nhưng không chồng lượt

---

## Failure containment

### Throwing start

| Option | Description | Selected |
|--------|-------------|----------|
| Settle error row + resolve deferred trong finally (khuyến nghị) | Không đường nào treo | ✓ |
| Settle + watchdog timeout | Tăng độ bền | |
| Đánh dấu cả lô lỗi | Mất chi tiết | |

**User's choice:** Settle error row + finally

### Watchdog

| Option | Description | Selected |
|--------|-------------|----------|
| Không watchdog (khuyến nghị) | Dựa provider timeout + nút Stop | ✓ |
| Watchdog theo assignment | Cắt nhầm lượt dài hợp lệ | |
| Watchdog cho cả lượt | | |

**User's choice:** Không watchdog

### Error display level

| Option | Description | Selected |
|--------|-------------|----------|
| Sanitized cho user, chi tiết chỉ ở ledger (khuyến nghị) | Tránh `FORBIDDEN_BACKUP_KEYS` | ✓ |
| Hiện đầy đủ lỗi gốc | Vi phạm forbidden key | |
| Chỉ nhãn lỗi chung | Không điều tra được | |

**User's choice:** Sanitized cho user, chi tiết chỉ ở ledger

### Delete mid-run teardown

| Option | Description | Selected |
|--------|-------------|----------|
| Manager + dispose trước khi xoá (khuyến nghị) | Registry ra `teamRunManager.ts` | ✓ |
| Giữ registry cũ, chỉ abort | Explorer xoá không mount workspace → không teardown | |

**User's choice:** Manager + dispose

### Active turns

| Option | Description | Selected |
|--------|-------------|----------|
| Finish teamTurnId trong finally (khuyến nghị) | `getActiveTurns()` rỗng sau lượt | ✓ |
| Bỏ team-level turn, chỉ per-agent | Mất tín hiệu cấp nhóm | |

**User's choice:** Finish trong finally

### Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Focused tests + walkthrough Tauri (khuyến nghị) | C-15 đòi hành vi quan sát được | ✓ |
| Chỉ focused tests | Vi phạm C-15 | |

**User's choice:** Focused tests + walkthrough Tauri

---

## Claude's Discretion

- Cấu trúc file scheduler (`src/services/ai/office/scheduler.ts`) và API nội bộ — miễn là `acquire(signal)` / `release()` idempotent / `setLimit(n)` / `cancel(handle)`.
- Tên field ledger và bảng — miễn tránh `FORBIDDEN_BACKUP_KEYS` và giữ đủ ngữ nghĩa ở D-22.
- Cách biểu diễn cạnh phụ thuộc `dependsOn` (D-24) — chưa có runtime, chỉ cần schema chứa được.
- Số thứ tự Dexie V20 và cách cập nhật 5 danh sách — planner/researcher quyết theo cây code.
- Cách hiển thị "đang xếp hàng" trên composer (chip, dòng chữ, khu vực riêng) — miễn là huỷ được và không mất chữ.

## Deferred Ideas

- **Phase 37.1 — Live steering**: outbox + inbox agent, drain ở `beforeToolRound`, tool `amend_assignments`, leader re-plan giữa lô, UI steer agent đang chạy.
- **Handoff agent → agent**, **sửa plan trên card**, **agent hỏi ngược**: D-24 đảm bảo schema biểu diễn được; runtime/UI để phase sau.
- **Watchdog timeout**: user chọn không làm; nếu provider treo thực tế xuất hiện, đưa lại vào Phase 38 hoặc phase riêng.
- **Wording AIO-RUNTIME-02** trong REQUIREMENTS.md bị D-20 override — cân nhắc cập nhật khi chốt phase.
