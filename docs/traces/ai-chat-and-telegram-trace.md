# Báo Cáo Truy Vết Kỹ Thuật (Trace Architecture): Các Lần Gọi LLM Khi Chat

Tài liệu này phân tích chi tiết toàn bộ các luồng xử lý và các lần gọi mô hình ngôn ngữ lớn (LLM) trong hệ thống TaskMate cho hai giao diện:
1. **AI Chat Drawer** (giao diện Web App).
2. **Telegram Bot** (luồng nền qua `telegramHeadlessWorker`).

---

## PHẦN 1: AI CHAT DRAWER (`AIChatDrawer.tsx`)

### 1.1. Bảng Tổng Hợp Các Lần Gọi LLM Trong 1 Lượt Chat

Khi người dùng gửi 1 tin nhắn trên giao diện Web, tùy vào mục đích câu hỏi (Task cá nhân vs Tra cứu tài liệu vs Thao tác thay đổi), hệ thống sẽ kích hoạt từ **2 đến 7+ lần gọi LLM**:

| Lần gọi | Tên Module / Hàm | Endpoint & Giao thức | Khi nào kích hoạt? | Mục đích |
|---|---|---|---|---|
| **Lần 0** *(chạy ngầm)* | `compactThreadContext` (`contextCompaction.ts`) | `completeJson` (REST POST `/chat/completions`) | Khi số tin nhắn trong thread > 16 tin hoặc tổng số ký tự > 24.000 ký tự. | Tự động tóm tắt ngữ cảnh cũ của hội thoại để giảm token và tránh tràn context window. |
| **Lần 1** *(Bắt buộc)* | `routeIntent` (`intentRouter.ts`) | `completeJson` (REST POST `/chat/completions`) | **Mọi lượt chat** (trừ khi hệ thống mất API Key / offline hoàn toàn). | Phân loại câu hỏi thành 1 trong 5 intent: `operate_taskmate`, `query_taskmate`, `query_knowledge`, `mixed`, `clarify`. |
| **Lần 2** | `routeScope` (`semanticScopeRouter.ts`) | `completeJson` (REST POST `/chat/completions`) | Khi intent là `query_knowledge` hoặc `mixed` và Model hỗ trợ Structured Output (`strictJsonSchema`). | Phân loại câu hỏi thuộc bộ tài liệu nào (`domain`, `environment`, `version`, `comparisonMode`). |
| **Lần 3** | `runMcpRetrieval` (`mcpRetrievalRunner.ts`) | `completeJson` (REST POST `/chat/completions`) lặp 1 - 3 turns | Khi intent router phát hiện cần dữ liệu trực tiếp từ MCP server (`require_mcp = true`). | LLM làm planner chọn công cụ MCP cần gọi (tối đa 3 turn để trích xuất dữ liệu bên ngoài). |
| **Lần 4** | `synthesizeGroundedAnswer` (`groundedSynthesis.ts`) | `completeJson` (REST POST `/chat/completions`) | Khi có tài liệu/bằng chứng thu thập được từ Knowledge Server (BM25, Vector, Graphiti Neo4j) hoặc Local BM25. | Tổng hợp câu trả lời theo schema nghiêm ngặt (`GroundedAnswerSchemaV2`), bắt buộc đính kèm các mã trích dẫn `[S1]`, `[M1]`. |
| **Lần 5 .. N** | Operational Tool Loop: `streamChatEvents` (`AIChatDrawer.tsx:1166`) | SSE Streaming (POST `/chat/completions` với `stream: true`) lặp tối đa 30 turns | Khi intent là `operate_taskmate`, `query_taskmate`, hoặc `mixed` (sau khi tổng hợp tri thức), hoặc khi tra cứu tri thức bị lỗi fallback về TaskMate assistant. | Vòng lặp Agent gọi công cụ: LLM trả `tool_calls` -> app chạy tool trên IndexedDB/MCP -> gửi kết quả tool lại cho LLM -> LLM gọi tool tiếp hoặc stream text trả lời người dùng. |

---

### 1.2. Sơ Đồ Khối Luồng Xử Lý Chi Tiết (AI Chat Drawer)

```text
[Người dùng gửi tin nhắn trên AI Chat Drawer]
       │
       ├─► (Lưu tin nhắn người dùng vào IndexedDB: db.chatMessages)
       │
       ├─► [Chạy ngầm] compactThreadContext()
       │     └─► [LLM Call 0 nếu hội thoại dài] Nén các lượt chat cũ thành 1 Context Boundary
       │
       ▼
[BƯỚC 1: runGroundedTurn()]
       │
       ├─► [LLM Call 1] routeIntent() (intentRouter.ts)
       │     └─► Phân loại: operate_taskmate / query_taskmate / query_knowledge / mixed / clarify
       │
       ├─► Trường hợp A: clarify
       │     └─► Dừng pipeline -> Hiển thị câu hỏi làm rõ (Transient Clarify Message), không gọi thêm LLM.
       │
       ├─► Trường hợp B: operate_taskmate / query_taskmate thuần
       │     └─► Bỏ qua tra cứu tài liệu -> Nhảy thẳng sang BƯỚC 2 (Operational Tool Loop).
       │
       └─► Trường hợp C: query_knowledge hoặc mixed
             │
             ├─► [LLM Call 2 - Tùy chọn] routeScope() -> Xác định Document Set URN / Domain
             │
             ├─► Chạy song song 2 luồng truy xuất:
             │     ├─► Luồng 1: retrieveFederated() gọi Knowledge Server (Fulltext + Vector + Neo4j Graph).
             │     │            (Nếu offline: tự động fallback sang runLocalBm25 trên IndexedDB).
             │     └─► Luồng 2 (nếu require_mcp=true):
             │                  [LLM Call 3 - Lặp 1-3 lần] runMcpRetrieval() điều phối các tool MCP.
             │
             ├─► packEvidence() gom tất cả bằng chứng thành EvidencePack.
             │
             ├─► [LLM Call 4] synthesizeGroundedAnswer()
             │     └─► Ép schema JSON GroundedAnswer (yêu cầu trích dẫn [S1], [M1] và lý do relevanceReason).
             │
             ├─► Lưu tin nhắn Assistant dạng "grounding card" vào IndexedDB.
             │
             └─► Nếu intent là "query_knowledge" thuần: KẾT THÚC LƯỢT CHAT.
                 Nếu intent là "mixed": Tiếp tục đi xuống BƯỚC 2.
       ▼
[BƯỚC 2: Operational Tool Loop] (Chỉ chạy với operate_taskmate, query_taskmate, mixed, hoặc fallback)
       │
       ├─► Thu thập System Prompt + Ngữ cảnh Task/Project đang mở + Entity Mentions (@task, @project).
       ├─► Khám phá danh sách Tools (AI_DATABASE_TOOLS + Dynamic MCP Tools).
       │
       ▼
   ┌──► [Vòng lặp while (loopCount < 30)]
   │      │
   │      ├─► [LLM Call 5..N - SSE Streaming] streamChatEvents() gửi messages + tools lên AI endpoint.
   │      │
   │      ├─► LLM stream về các chunks (text, reasoning, tool_calls).
   │      │
   │      ├─► NẾU CÓ tool_calls:
   │      │     1. Cập nhật UI: "Đang truy vấn cơ sở dữ liệu: Tra cứu tác vụ / Tạo tác vụ..."
   │      │     2. Đưa tin nhắn assistant kèm tool_calls vào mảng messages.
   │      │     3. Chạy từng tool trên IndexedDB (Dexie) hoặc MCP Server.
   │      │     4. Đưa kết quả role 'tool' vào mảng messages.
   │      │     5. QUAY LẠI ĐẦU VÒNG LẶP (Gọi tiếp LLM Streaming turn tiếp theo).
   │      │
   │      └─► NẾU KHÔNG CÒN tool_calls (LLM stream xong text cuối cùng):
   │            1. Lưu tin nhắn Assistant vào IndexedDB.
   │            2. Dừng stream -> KẾT THÚC LƯỢT CHAT.
```

---

## PHẦN 2: TELEGRAM BOT (`telegramHeadlessWorker.ts`)

Telegram Worker chạy theo cơ chế **Long-Polling headless** trong background trình duyệt hoặc node runtime của app (`getTelegramUpdates`). Khi có tin nhắn từ chat Telegram gửi tới bot:

### 2.1. Bảng Tổng Hợp Các Lần Gọi LLM Trên Telegram

| Lần gọi | Tên Module / Hàm | Endpoint & Giao thức | Khi nào kích hoạt? | Mục đích |
|---|---|---|---|---|
| **Lần 1** *(Bắt buộc)* | `routeIntent` (`intentRouter.ts`) | `completeJson` (REST POST `/chat/completions`) | Mọi tin nhắn văn bản thông thường (nếu user không dùng lệnh slash `/start`, `/help`,... và `dataScope !== 'pure_llm'`). | Phân loại ý định người dùng, kiểm tra `require_mcp`, phát hiện `clarify`. |
| **Lần 2 (Nhánh Tra Cứu Tri Thức)** | `routeScope` & `synthesizeGroundedAnswer` qua `runGroundedTurn` | `completeJson` (REST POST `/chat/completions`) | Khi intent là `query_knowledge` và user có quyền truy cập (`full` hoặc `knowledge_only`). | Giống AI Chat Drawer: gọi Semantic Scope Router, gọi Knowledge Server, và gọi LLM Synthesis sinh câu trả lời kèm citation. |
| **Lần 2 .. N (Nhánh Admin Mutation)** | `executeAdminMutationTurn` (`telegramMutationSession.ts`) | `streamChatEvents` (SSE Streaming) lặp tối đa 5 turns | Khi intent là `operate_taskmate` hoặc `mixed`, VÀ người dùng là **Admin**. | LLM lập kế hoạch thay đổi dữ liệu: phát hiện tool mutation hoặc tool MCP -> tạo `PendingMutation` gửi preview bắt Admin xác nhận ("ok") trước khi thực thi. |
| **Lần 2 .. N (Nhánh Tra Cứu Task / Công Việc Cá Nhân)** | Read-Tool Loop (`telegramHeadlessWorker.ts:1100`) | `streamChatEvents` (SSE Streaming) lặp tối đa 5 turns | Khi intent là `query_taskmate`, hoặc `pure_llm`, hoặc fallback. | LLM gọi các tool đọc DB (`query_tasks`, `query_projects`, `get_daily_schedule`,...) để trả lời người dùng trên Telegram. |
| **Lần Cuối (Synthesis Pass)** | Synthesis Final Pass (`telegramHeadlessWorker.ts:1181`) | `streamChatEvents` (SSE Streaming) 1 turn bổ sung | Nếu ở vòng lặp trên LLM có gọi tool nhưng chưa sinh ra đoạn text tổng kết hoàn chỉnh. | Ép LLM đọc toàn bộ kết quả tool đã chạy và viết câu trả lời định dạng Telegram Markdown đẹp mắt, không gọi tool nữa. |

---

### 2.2. Sơ Đồ Khối Luồng Xử Lý Chi Tiết (Telegram Worker)

```text
[Người dùng gửi tin nhắn trên Telegram]
       │
       ▼
[telegramHeadlessWorker: processIncomingUpdate()]
       │
       ├─► Kiểm tra cơ bản: Chat ID hợp lệ, Whitelist/Pending User Check.
       ├─► Xử lý Command cứng (Slash Commands: /start, /help, /reset, /scope, /admin,...) -> Phản hồi ngay, không gọi LLM.
       ├─► Kiểm tra Quota hàng ngày (Rate-limiting & Spam threshold).
       │
       ├─► Bật trạng thái bot: sendAction(chat_id, "typing")
       │
       ▼
[BƯỚC 1: Intent Routing]
       │
       ├─► [LLM Call 1] routeIntent() (intentRouter.ts)
       │     └─► Gửi query + 5 turns lịch sử Telegram gần nhất + MCP capabilities.
       │
       ├─► Nếu intent là "clarify":
       │     └─► Gửi ngay câu hỏi làm rõ về Telegram -> Dừng, không gọi thêm LLM.
       │
       ├─► Gate bảo mật phạm vi dữ liệu (Scope Security Gate):
       │     ├─► Nếu user là 'tasks_only' mà hỏi knowledge / mcp -> Từ chối truy cập (Refusal HTML), dừng.
       │     └─► Nếu user là 'knowledge_only' mà hỏi task -> Từ chối truy cập, dừng.
       │
       ▼
[BƯỚC 2: Rẽ Nhánh Xử Lý Theo Intent]

       ┌───────────────────────────────┬───────────────────────────────┐
       ▼                               ▼                               ▼
 [Nhánh 1: operate_taskmate / mixed]  [Nhánh 2: query_knowledge]      [Nhánh 3: query_taskmate / pure_llm]
       │                               │                               │
       ├─► Kiểm tra quyền Admin:        ├─► [LLM Call 2: runGrounded]  ├─► [LLM Call 2..N: Read-Tool Loop]
       │   Nếu KHÔNG PHẢI Admin:       │   - routeScope (nếu cần)      │   - Chạy vòng lặp while (< 5 loops).
       │   Gửi thông báo từ chối.      │   - retrieveFederated (Server/│   - LLM gọi tool đọc dữ liệu
       │   DỪNG.                       │     Neo4j/BM25)               │     (query_tasks, get_timer,...).
       │                               │   - MCP retrieval runner      │   - Thực thi tool trên IndexedDB.
       ├─► Nếu LÀ Admin:               │   - synthesizeGroundedAnswer  │   - Nếu có tool calls nhưng chưa có
       │   [LLM Call 2..N]:            │                               │     lời thoại:
       │   executeAdminMutationTurn()  ├─► Format kết quả trích dẫn:   │     [LLM Call Cuối]: Synthesis Pass
       │   - Chạy loop stream tools.   │   formatGroundedAnswerFor-    │     ép LLM tổng kết Markdown Telegram.
       │   - Nếu LLM gọi tool sửa      │   Telegram()                  │
       │     (create_task, update,...):│                               │
       │     TẠO PendingMutation,      ▼                               ▼
       │     gửi tin nhắn PREVIEW      Gửi câu trả lời về Telegram     Gửi câu trả lời về Telegram
       │     chờ Admin nhắn "ok".
       │   - Nếu Admin đã gõ "ok":
       │     Thực thi mutation DB.
       │
       ▼
   Gửi tin nhắn về Telegram
       │
       ▼
[BƯỚC 3: Ghi Nhật Ký Phiên (logTelegramSession vào IndexedDB)]
```

---

## PHẦN 3: SO SÁNH ĐIỂM GIỐNG & KHÁC NHAU

| Tiêu chí | AI Chat Drawer (Web) | Telegram Bot Worker |
|---|---|---|
| **Bộ định tuyến ý định (Intent Router)** | Dùng chung `routeIntent` (cùng System Prompt, cùng Taxonomy). | Dùng chung `routeIntent` (cùng System Prompt, cùng Taxonomy). |
| **Hệ thống Grounding tri thức** | Dùng chung `runGroundedTurn` (Federated + Graphiti Neo4j + Vector + Local BM25). | Dùng chung `runGroundedTurn` (kết quả hiển thị được format ngắn gọn hơn cho Telegram). |
| **Quyền thay đổi dữ liệu (Mutation)** | Người dùng cá nhân thao tác trực tiếp trên UI (có modal duyệt hoặc auto-approve). | Chỉ **Admin** mới được phép; bot sinh bản xem trước (Preview) và yêu cầu nhắn `ok`/`xác nhận` trước khi áp dụng. |
| **Giới hạn số vòng lặp Tool Loop** | Tối đa **30 lượt** (`MAX_TOOL_LOOPS = 30`). | Tối đa **5 lượt** (`MAX_LOOPS = 5`) để tiết kiệm token và tránh timeout Telegram. |
| **Định dạng hiển thị đầu ra** | Markdown phong phú, Khối Thẻ Grounding (Grounding Cards), Component React Tree, Drawer xem tài liệu. | Chuyển đổi qua Telegram HTML (`markdownToTelegramHtml`), tự động chia nhỏ tin nhắn nếu dài hơn 4096 ký tự (`splitTelegramMessage`). |
| **Cơ chế Nén Hội Thoại** | Tự động kích hoạt `compactThreadContext` nén ngầm khi thread dài. | Dựa vào giới hạn cửa sổ trượt `maxHistoryTurns` (mặc định 5 turns gần nhất). |
