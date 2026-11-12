# Kiến trúc: Team Chat thống nhất (Participant / Message / Cursor)

**Trạng thái:** ĐÃ TRIỂN KHAI (Đợt 1 + Đợt 2) — dùng làm chuẩn cho mọi thay đổi tiếp theo.
**Ngày chốt:** 2026-11-12
**Bối cảnh:** Phase 37.1 UAT phát hiện 9 lỗi. Phân tích cho thấy 5 lỗi (1, 5, 6, 7, 9) cùng một nguyên nhân: có **5 đường riêng biệt** cho cùng một hành vi "A gửi tin cho B".

## Ghi chú triển khai (khác so với bản thiết kế ban đầu)

Thực tế đã làm hẹp hơn bản nháp ở hai điểm, có lý do:

1. **`phase` không bị xoá khỏi type — nó trở thành HÀM SUY RA (`derivePhase`).**
   Bản nháp nói "xoá `phase`". Thực tế: xoá biến lưu, thay bằng hàm đọc state sống. Không có
   setter thì không thể kẹt — đúng mục tiêu — nhưng `TeamRunPhase` vẫn còn vì UI cần một nhãn
   để chọn động từ. Hai bit thật sự thuộc về lượt (`leadTurnKind`, `synthesisPending`) được
   set/clear trong `finally` của chính lượt đó.

2. **`chatMessages` giữ nguyên làm bản ghi hiển thị; `teamMessages` là projection định tuyến.**
   Cùng một id, ghi trong cùng transaction (`appendForExistingMessage`). Không thay bảng cũ,
   nên backup schema, BM25, `ChatMessageList` không phải sửa.

3. **`deliver_steer` vẫn còn như công cụ của leader** — nhưng giờ nó *sinh ra một message thật*
   (`leader → agent`) trên log, thay vì ghi marker lên row của người dùng. Cursor của agent
   phủ message đó như mọi message khác.

---

## 1. Nguyên tắc gốc

> Việc user chat cho leader, user chat cho agent, hay leader giao việc cho agent — **tất cả chỉ là một lượt gửi tin từ participant A đến participant B**.

Khác nhau duy nhất: **quyền hạn** của người gửi.

Hệ quả trực tiếp: nếu chỉ có một primitive, thì chỉ có một chỗ để viết, một chỗ để test, một chỗ để sửa. Mọi lỗi "đường này làm được, đường kia không" biến mất về mặt cấu trúc.

### 1.1 Cách dùng thực tế: freestyle, như group chat thật

Người dùng vận hành nhóm bằng chat tự do, không qua menu hay lệnh đặc biệt:

- Muốn chỉ đạo trực tiếp một agent → **tag và nhắn thẳng** cho agent đó.
- **Leader vẫn thấy** tin đó (nó nằm trong log của nhóm), và có thể **tự can thiệp cảnh báo** nếu thấy vấn đề.
- Hoặc người dùng **chủ động** nhắn leader: "check tin nhắn của tao với Eva" → leader đọc log và xử lý.

Điều này buộc phải tách hai thứ mà bản nháp gộp làm một:

| Khái niệm | Nghĩa | Trường |
|---|---|---|
| **Định tuyến** (ai phải trả lời) | nghĩa vụ hành động | `to[]` |
| **Nhìn thấy** (ai đọc được) | quyền đọc transcript | toàn bộ log — mọi participant |

Nên: `to[]` **không** phải danh sách người được xem. Nó là danh sách người **có nghĩa vụ phản hồi**. Cả nhóm xem được mọi tin, như một group chat có @mention.

Hệ quả cho consumer (§4.1): cursor tiến qua **mọi** message trong log, nhưng `handle()` chỉ chạy khi `msg.to` chứa chính mình. Nhờ vậy "leader đã xem" là sự thật kiểm chứng được, mà leader không bị kéo vào mọi lượt.

---

## 2. Bốn khái niệm, không hơn

```
Participant   — ai (user | lead | agent)
Message       — nói gì, gửi cho ai
ReadCursor    — ai đã đọc tới đâu
Assignment    — việc đang ở trạng thái nào (sinh ra TỪ message)
```

Presence ("đang làm việc" / "rảnh") **không phải** khái niệm thứ năm trong DB. Nó là state tạm thời trong bộ nhớ, chết cùng consumer.

---

## 3. Mô hình dữ liệu

### 3.1 `teamParticipants` — ai tham gia

```ts
interface TeamParticipant {
  id: string;                        // uuid; user có id cố định 'user'
  teamId: string;
  kind: 'user' | 'lead' | 'agent';
  name: string;
  /** Nguồn cho quyền; xem §3.5 */
  role: 'user' | 'lead' | 'employee';
  createdAt: string;
}
```

Index: `id, teamId, [teamId+kind]`

**Không lưu quyền trong row.** Quyền suy từ `kind` + `role` (§3.5). Lý do: quyền là logic, không phải dữ liệu. Đổi quyền không được cần migration.

### 3.2 `teamMessages` — tin nhắn

```ts
interface TeamMessage {
  id: string;                        // uuid, client-generated → retry không nhân đôi
  teamId: string;
  seq: number;                       // tăng đơn điệu trong team; thứ tự đọc
  from: string;                      // participant id
  to: string[];                      // participant ids — BẮT BUỘC, không bao giờ rỗng
  content: string;
  /** Chỉ dùng để render; KHÔNG dùng để định tuyến. */
  kind: 'chat' | 'instruction' | 'report' | 'synthesis';
  /** Trỏ tới assignment sinh ra từ message này, nếu có. */
  assignmentId?: string;
  createdAt: string;
}
```

Index: `id, teamId, [teamId+seq], [teamId+createdAt], assignmentId`

**Ba bất biến của Message:**

| # | Bất biến | Vì sao |
|---|---|---|
| M1 | `to.length > 0` | Không có tin nhắn mồ côi. Đây chính là lỗi gap 5: `targetAgentId` là trường phụ, chỉ ghi khi user chọn dropdown. **`to[]` là nghĩa vụ phản hồi, không phải danh sách người được xem** (§1.1). |
| M2 | Bất biến — sửa tin = thêm tin mới | Có `seq` để replay. Audit được. |
| M3 | `seq` đơn điệu trong team | Cursor chỉ cần so sánh số. |

**`kind` KHÔNG phải định tuyến.** Nó chỉ để UI chọn cách hiển thị (bong bóng báo cáo khác bong bóng chat). Định tuyến hoàn toàn bằng `to[]`.

### 3.3 `teamReadCursors` — ai đã đọc tới đâu

```ts
interface TeamReadCursor {
  id: string;                        // `${teamId}:${participantId}`
  teamId: string;
  participantId: string;
  lastSeq: number;                   // đã đọc hết mọi message có seq <= lastSeq
  updatedAt: string;                 // ← thời điểm đọc gần nhất
}
```

Index: `id, [teamId+participantId]`

**Đây là seen receipt.** Không cần `seenBy[]` trên message, không đụng backup schema của `ChatMessage`, không bump Dexie version cho `chatMessages`.

Trạng thái giao tin của một message với một người nhận:

| Điều kiện | Hiển thị |
|---|---|
| Message đã ghi DB | ✓ đã gửi |
| `recipient` có trong `to[]` | ✓✓ đã tới |
| `cursor[recipient].lastSeq >= message.seq` | ✓✓ xanh, bấm xem "đã đọc lúc `cursor.updatedAt`" |

### 3.4 `aiTeamAssignments` — việc (GIỮ NGUYÊN HOÀN TOÀN)

Ledger hiện có đã đúng và **đã có sẵn liên kết chat ↔ việc**. Không đổi shape, không thêm trường:

```ts
instructionMessageId?: string;   // message đã sinh ra attempt này (đã có)
reportMessageId?: string;        // message agent sinh ra khi xong (đã có)
```

> **Sửa so với bản nháp trước:** bản nháp đề xuất thêm `originMessageId`. Sai — `instructionMessageId` đã làm đúng việc đó từ Phase 37. Không cần migration cho liên kết này.

**Quan hệ Message → Assignment là 1-nhiều, có điều kiện:**

```
Message(from:lead, to:[eva], kind:'instruction')   ← instructionMessageId
   └── sinh ra ──→ Assignment(agentId:eva, attemptNo:1)
                      └── sinh ra ──→ Message(from:eva, to:[lead], kind:'report')   ← reportMessageId
```

Một `instruction` message sinh ra **một** assignment. Retry sinh attempt mới **từ assignment cũ**, không sinh message mới (lý do: user không gửi lại tin — D-12 đã chốt "task lấy từ row, không phải text user gõ lại").

### 3.5 Bảng quyền

```ts
type Permission =
  | 'send'        // gửi tin cho participant khác
  | 'dispatch'    // giao việc cho nhiều agent cùng lúc
  | 'amend'       // huỷ/viết lại assignment đang queued
  | 'synthesize'  // tổng hợp kết quả lô
  | 'stop';       // dừng agent khác

const PERMISSIONS: Record<TeamParticipant['role'], ReadonlySet<Permission>> = {
  user:     new Set(['send', 'dispatch', 'amend', 'synthesize', 'stop']),
  lead:     new Set(['send', 'dispatch', 'amend', 'synthesize', 'stop']),
  employee: new Set(['send']),   // chỉ trả lời, không giao việc
};
```

Kiểm tra quyền ở **một chỗ duy nhất**: hàm gửi tin. Không rải `if (isLead)` khắp nơi.

---

## 4. Luồng chạy

### 4.1 Consumer loop — mỗi participant một vòng

```ts
async function runConsumer(participantId: string): Promise<void> {
  let presence = 'idle';                    // TẠM THỜI, không lưu DB
  while (!disposed) {
    const cursor = await getCursor(teamId, participantId);
    // MỌI message trong log, không lọc theo `to` — ai cũng thấy cả nhóm đang nói gì.
    const pending = await readMessagesAfter(teamId, cursor.lastSeq);
    if (pending.length === 0) {
      presence = 'idle';
      await waitForAppend(teamId);          // push, không poll
      continue;
    }
    for (const msg of pending) {
      // Chỉ người được gọi tên mới có nghĩa vụ chạy; người khác chỉ đọc.
      const addressed = msg.to.includes(participantId);
      if (addressed) presence = 'working';
      try {
        if (addressed) await handle(participantId, msg);   // spawn task riêng (§4.2)
      } finally {
        await advanceCursor(teamId, participantId, msg.seq);   // ← seen by X at T
      }
    }
  }
  presence = 'offline';
}
```

**Bốn điểm cốt lõi:**

0. **Cursor tiến qua MỌI message, `handle()` chỉ chạy khi được gọi tên.** Đây là điều làm "leader đã xem tin của tao với Eva" thành sự thật kiểm chứng được, mà leader không bị kéo chạy mỗi lượt (§1.1).
1. **`presence` là biến cục bộ trong vòng lặp.** Không ai phải nhớ reset nó. Consumer chết → presence chết. Đây là lý do lỗi "treo đang tổng hợp mãi" (gap 9) **không thể tái diễn**: không có biến toàn cục nào để kẹt.
2. **`advanceCursor` nằm trong `finally`.** Đọc xong mới tiến; lỗi giữa chừng thì không tiến → đọc lại. Đây là at-least-once, đúng chuẩn.
3. **`waitForAppend` là push.** Không poll 25ms. Dùng Dexie `liveQuery` hoặc một `Promise` được resolve bởi `appendMessage`.
4. **Không có "busy phase".** Leader rảnh = `cursor == head`. Gõ tin mới = append → consumer tỉnh. Gap 1 và 6 biến mất.

### 4.2 Xử lý một message

```ts
async function handle(participantId: string, msg: TeamMessage) {
  const me = await getParticipant(participantId);

  // 1. User/lead gửi cho agent → có thể sinh assignment
  if (msg.kind === 'instruction' && me.role !== 'employee') {
    const agentIds = msg.to.filter(isAgent);
    for (const agentId of agentIds) {
      if (!hasPermission(me, 'dispatch')) continue;
      await createAssignment({ agentId, originMessageId: msg.id });
    }
    return;
  }

  // 2. Agent nhận chỉ đạo giữa lúc đang chạy → chèn vào vòng công cụ kế tiếp
  if (me.role === 'employee') {
    const runtime = registry.get(participantId);
    runtime.injectUserMessage(msg.content);   // ← thay cho drainSteerInbox
    return;
  }

  // 3. Leader/agent nhận tin → mở một lượt trả lời
  await runTurn(participantId, msg);
}
```

**Lưu ý quan trọng:** `runtime.injectUserMessage` là cơ chế **duy nhất** để chỉ đạo agent đang chạy. Không còn `deliver_steer` tool, không còn `steerMessageIds`, không còn `injectedSteerIdsByAttempt`. Agent đọc tin ở vòng công cụ kế tiếp — đúng như `beforeToolRound` hiện có, chỉ đổi nguồn.

### 4.3 Leader giao việc — không phải tool đặc biệt

Leader gọi `send({ to: [eva], content: '...', kind: 'instruction' })`. Đó là **cùng hàm** user gọi. Không có `deliver_steer`.

`delegate_batch` vẫn là tool riêng vì nó là **quyền `dispatch`**: một lần gửi cho nhiều người + tạo nhiều assignment trong một transaction. Nhưng nó chỉ là lớp mỏng trên `send`:

```ts
async function delegateBatch(entries: AssignmentPlanEntry[]) {
  await db.transaction('rw', [db.teamMessages, db.aiTeamAssignments], async () => {
    for (const entry of entries) {
      const msg = await appendMessage({ to: [entry.agentId], kind: 'instruction', ... });
      await createAssignment({ agentId: entry.agentId, originMessageId: msg.id });
    }
  });
}
```

### 4.4 `amend_assignments` — vẫn là tool riêng

Vì nó **không phải gửi tin**. Nó sửa trạng thái việc: huỷ `queued`, hoặc viết lại task. Nó không tạo message cho agent (agent chưa chạy nên chưa ai đọc). Nó ghi vào ledger.

Phân biệt:

| Hành động | Là gì | Đi qua |
|---|---|---|
| "Eva, đổi sang bảng" | Gửi tin | `send` → message |
| "Huỷ việc của Eva" | Sửa việc | `amend` → ledger |
| "Giao 3 việc cho A, B, C" | Gửi tin ×3 + tạo việc ×3 | `dispatch` → transaction |

---

## 5. Xoá gì (bắt buộc, không để fallback)

Để lại bất kỳ mục nào = 2 nguồn sự thật = bug quay lại.

| Xoá | File | Vì sao |
|---|---|---|
| `phase`, `setPhase`, `LIVE_PHASES`, `BUSY_PHASES` | `teamRunCoordinator.ts:278-296,452,591` | Presence thay thế |
| `runLeadTurnSerialized` | `:608` | Consumer loop thay thế; không cần xếp hàng |
| Vòng poll 25ms trong `onBatchSettled` | `:2516-2525` | Push thay poll |
| `pendingSteerMessageIds` | `:567` | Cursor thay thế |
| `injectedSteerIdsByAttempt` | `:574` | Cursor thay thế |
| `listeners:Set` + `notify()` | `:507,576` | `liveQuery` thay thế |
| `batchOwnsTeamTurn` | `:2483` | Cursor quyết định |
| `steer()`, `deliverSteer`, tool `deliver_steer` | `:1455-1505, 1739-1817`, `teamTools.ts` | `send` thay thế |
| `parseMentionTarget`, `AGENT_MENTION` | `:253,1441-1451` | `to[]` thay thế |
| `targetAgentId` trên message | `models.ts`, `aiOffice.ts` | `to[]` thay thế |
| `messageKind: 'steer'` | 6 nơi | Không cần phân biệt |
| `TeamRunPhase` union | `aiOffice.ts:29-38` | Presence thay thế |

## 6. Giữ nguyên (đã đúng)

| Giữ | Vì sao |
|---|---|
| `teamRunRegistry` | Mỗi agent một runtime — đúng cho concurrency |
| `scheduler` | Slot/concurrency — đúng, không liên quan messaging |
| `budgetGate` | Budget park — đúng |
| `finalizeAttempt` | Single terminal writer — đúng, giữ kỷ luật này |
| `aiTeamAssignments` shape | Ledger đúng; `instructionMessageId`/`reportMessageId` đã nối chat ↔ việc sẵn |
| `beforeToolRound` hook | Đúng chỗ để inject tin giữa lượt |

---

## 7. Định nghĩa "xong"

Không phải "9 UAT test xanh". Xong khi **cả 5**:

1. **I1-I5 có test chứng minh** (xem §8)
2. **Grep ra 0** cho mọi mục ở §5 trong `src/`
3. **Replay được**: remount giữa lúc chạy → cursor đọc lại, không mất message
4. **Crash recovery**: tắt app giữa lượt → mở lại, message chưa đọc vẫn chưa đọc
5. **UAT 37.1 xanh** (9 test hồi quy)

---

## 8. Năm bất biến và test tương ứng

| # | Bất biến | Test |
|---|---|---|
| I1 | Lệnh user không xếp sau lượt leader | Append steer giữa lượt lead → cursor agent tiến trước khi lượt lead kết thúc |
| I2 | Leader rảnh ≠ leader không nghe | `cursor == head` nhưng append message mới → leader xử lý trong < 1 tick |
| I3 | Event đến → task riêng | Hai consumer cùng nhận → hai task độc lập, không chặn |
| I4 | Seen là hành vi consumer | Đọc message → `cursor.updatedAt` được ghi; UI hiện "X đã đọc lúc T" |
| I5 | Một nguồn sự thật | Grep §5 = 0 |

---

## 9. Lỗi cục bộ KHÔNG tự khỏi

Hai lỗi này độc lập với kiến trúc, phải sửa riêng:

| Lỗi | File | Sửa |
|---|---|---|
| Nhóm mới mở lần đầu mất thanh chat | `chatRepo.ts:53-76` | Bọc read-then-add trong `db.transaction('rw', db.chatThreads, ...)`; thêm `.catch()` cho bootstrap IIFE ở `TeamWorkspace.tsx:217-332` |
| Popover cắt bước, thiếu giờ, không cuộn | `teamRunCoordinator.ts:644`, `TeamActivityIndicator.tsx:76-115` | Nâng cap có chặn; thêm `maxHeight`+`overflowY`; render `step.at`; thêm `detail?` nạp từ `event.args` |

---

## 10. Thứ tự thực hiện

```
Đợt 1 — lỗi cục bộ (không đụng kiến trúc)
  ├── Sửa race createOrGetThread
  ├── Sửa popover (cap/scroll/timestamp/detail)
  └── Sửa địa chỉ tin nhắn (to[] bắt buộc) — bước đệm cho đợt 2

Đợt 2 — nền tảng participant/message/cursor
  ├── Schema V23: teamParticipants, teamMessages, teamReadCursors
  ├── teamEventLog.ts + teamConsumer.ts
  ├── Di trú coordinator sang consumer loop
  ├── Xoá §5 (grep = 0)
  └── Chứng minh I1-I5 + replay + crash

Đợt 3 — UAT hồi quy 9 test + test năng lực mới
```

---

## 11. Trạng thái triển khai (2026-11-12)

### Đã xong

| Hạng mục | File |
|---|---|
| Types participant/message/cursor + bảng quyền | `src/types/teamChat.ts` |
| Schema V23 + 3 bảng mới | `src/db/schema.ts`, `src/db/index.ts` |
| Event log (append/read/cursor/seen) | `src/services/ai/office/teamEventLog.ts` |
| Phase suy ra thay vì lưu | `teamRunCoordinator.ts` — `derivePhase()` |
| Steer đi qua log, leader là cổng | `steer()`, `deliverSteer()` |
| Drain đọc bằng cursor | `drainSteerInbox()`, `drainLeaderSteerQueue()` |
| Seen receipt UI | `ChatMessageBubble.tsx`, `ChatMessageList.tsx`, `TeamWorkspace.tsx` |
| Popover: scroll, timestamp, expand | `TeamActivityIndicator.tsx` |
| Race tạo thread | `chatRepo.ts` |
| Abort có thẩm quyền | `chatTurnRuntime.ts` |
| Proxy Tauri có timeout | `src-tauri/src/ai_proxy.rs` |

### Bất biến đã có test

| # | Bất biến | Test |
|---|---|---|
| L1 | Tin nhắn phải có người nhận | `teamEventLog.test.ts` — "refuses to append a message with no recipient" |
| L2 | `seq` đơn điệu, không trùng khi concurrent | "allocates a monotonic seq per team, even under concurrent appends" |
| L3 | Cursor chỉ tiến | "never moves a cursor backward" |
| I4 | Cursor tiến = đã đọc | "reports who read a message and when" |
| — | Phase không kẹt busy sau batch | `teamRunCoordinator.test.ts` — "never leaves a busy phase behind after the batch settles" |
| — | Steer gõ tay giao được | "delivers a plain-text steer when the leader names the target" |
| — | Target ngoài roster bị từ chối | "refuses a steer target that is not in the roster" |
| — | Thread race không throw | `chatRepo.test.ts` — "createOrGetThread resolves concurrent callers to one thread without throwing" |
| — | Popover đủ bước/giờ/expand | `TeamChatIndicator.test.tsx` — 3 test mới |

### Chưa làm (còn lại của kiến trúc đích)

- `pendingSteerMessageIds` vẫn còn như **cache hiển thị** trong snapshot (nguồn sự thật là cursor).
- `injectedSteerIdsByAttempt` đã bỏ khỏi đường drain; còn dùng ở nhánh deadline — dọn tiếp khi chạm.
- `steerMessageIds` trên ledger vẫn được ghi (backup schema đã khai báo) nhưng không còn là nguồn
  sự thật cho badge; UI đọc `seenStates` từ cursor.
- `runLeadTurnSerialized` vẫn còn: nó tuần tự hoá các lượt trên MỘT runtime, không phải cơ chế
  "busy phase". Consumer loop thật (mỗi participant một vòng) là bước tiếp theo nếu cần.
- `listeners:Set` + `notify()` vẫn còn; UI đã đọc thêm `useLiveQuery` trên log.
