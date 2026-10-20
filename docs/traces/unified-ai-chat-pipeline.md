# Tài Liệu Thiết Kế: Luồng Hợp Nhất AI Chat Drawer & Telegram (Unified Chat Pipeline)

Tài liệu này ghi lại kiến trúc, luồng xử lý và các nguyên tắc tối ưu hóa cho hệ thống AI Assistant trên cả hai giao diện: **AI Chat Drawer (Web UI)** và **Telegram Bot Worker**.

---

## 1. Mục Tiêu Tối Ưu

1. **Hiệu quả Token (Token Efficiency)**: Giảm chi phí token từ mức bùng nổ (~150.000 tokens do vòng lặp ReAct nhiều lượt) xuống mức chuẩn **5.000 – 15.000 tokens** cho mỗi câu hỏi tra cứu schema/kỹ thuật.
2. **Đầy đủ dữ kiện (Information Completeness)**: Cả Web và Telegram đều trả lời đúng, sâu và đầy đủ trường dữ liệu (khắc phục lỗi Telegram dừng sớm và chỉ gọi MCP 2 lần).
3. **Dynamic MCP Granularity**: Duy trì tính mở động (agnostic) cho mọi máy chủ MCP ngoài, không hardcode tên tool cụ thể vào prompt của model.
4. **Kiến Trúc Dùng Chung (Single Pipeline)**: Tránh duplicate logic giữa Web và Telegram, thống nhất qua một orchestrator.

---

## 2. Sơ Đồ Kiến Trúc Luồng Tổng Thể

```text
               [1. Người dùng gửi tin nhắn (Web / Telegram)]
                                    │
                                    ▼
                     [2. LLM Call 1: intentRouter]
   Phân loại intent: operate_taskmate / query_taskmate / query_knowledge / mixed / clarify
                                    │
                                    ▼
                        [3. Scope Guard Check]
   Đối chiếu Intent với quyền hạn người dùng (tasks_only / knowledge_only / Admin):
   ├─ Vi phạm phạm vi (VD: tasks_only hỏi knowledge) ──► Từ chối ngay, DỪNG.
   ├─ Ý định là clarify ─────────────────────────────► Trả lời câu hỏi làm rõ, DỪNG.
   └─ HỢP LỆ: Rẽ nhánh xử lý
            │
            ├─────────────────────────────────────────┐
            ▼                                         ▼
[NHÁNH A: operate_taskmate / query_taskmate]    [NHÁNH B: query_knowledge / mixed]
 (Thao tác / Đọc công việc, lịch trình)         (Tra cứu quy trình, schema, kỹ thuật)
            │                                         │
            │                                         ▼
            │                         [4. Chạy Song Song Retrieval]
            │                         ├─ Federated: Fulltext + Vector + Neo4j Graph
            │                         └─ Dynamic MCP Runner:
            │                              Áp dụng Granularity Planner:
            │                              Nếu hỏi field/attribute cụ thể mà mới
            │                              ra node/bảng cha -> BẮT BUỘC gọi tiếp
            │                              tool chi tiết, KHÔNG dừng sớm ("done": true).
            │                              Cắt tỉa output (bỏ metadata rác).
            │                                         │
            │                                         ▼
            │                         [5. Kiểm tra độ đầy đủ bằng chứng]
            │                         ├─ BẰNG CHỨNG ĐỦ VÀ INTENT = query_knowledge THUẦN:
            │                         │    └─► [LLM Call: synthesizeGroundedAnswer]
            │                         │        Tổng hợp câu trả lời kèm citation.
            │                         │        -> HOÀN THÀNH LƯỢT CHAT (5k-8k tokens).
            │                         │
            │                         └─ THIẾU BẰNG CHỨNG / MIXED / RETRIEVAL LỖI:
            │                              Chuyển tiếp (Continuation) xuống Nhánh C.
            │                                         │
            └───────────────────┬─────────────────────┘
                                │
                                ▼
         [NHÁNH C: Operational Tool Loop (SSE Streaming Loop)]
   ├─ Dynamic Tool Pruning (Lọc công cụ theo ngữ cảnh):
   │   ├─ Đến từ Knowledge thiếu dữ kiện: CHỈ nạp Dynamic MCP Tools (Graphiti).
   │   │  (Gạt bỏ toàn bộ 15+ tool Task/Project/Timer để tiết kiệm prompt token).
   │   ├─ Đến từ Query Task: CHỈ nạp Task/Project Read Tools.
   │   └─ Đến từ Mutation / Mixed: Nạp đúng các tool tương ứng.
   │
   ├─ Vòng lặp Tool Calling (Tối đa 5 turns):
   │   ├─ LLM gọi tool -> Thực thi -> Cắt tỉa kết quả thô -> Gửi lại LLM.
   │   └─ Khi có lời thoại cuối: Thoát vòng lặp.
   │
   └─ Xuất kết quả cuối cùng:
       ├─ Web: Render Component, Rich Markdown, Tooltip Citations.
       └─ Telegram: Chuyển sang Telegram HTML + đính kèm nguồn tham khảo.
```

---

## 3. Các Nguyên Tắc Kỹ Thuật Trọng Tâm

### 3.1. Dynamic MCP Granularity Planner (`mcpRetrievalRunner.ts`)
Không hardcode tên công cụ (như `get_catalog_object_context` hay `describe_table`). Prompt chỉ dẫn LLM dựa trên cấp độ thông tin:
```text
DYNAMIC MCP RETRIEVAL RULES:
1. CHECK INFORMATION DEPTH:
   - If the user asks for fine-grained details (such as specific fields, columns, attributes, parameters, enum values, error codes, or formulas) but the data retrieved so far only contains high-level container objects (such as table/file/document/entity names without property-level details):
   - DO NOT set "done": true.
   - You MUST pick the next inspection/detail tool provided in the server's tool list to drill down into that container entity.
2. COMPLETION CRITERIA:
   - Set "done": true ONLY when:
     a) The specific attribute/field answering the query has been found in the tool results, OR
     b) All available detail/inspection tools for the relevant entity have been exhausted.
```

### 3.2. Cắt Tỉa Dữ Liệu MCP (Output Projection)
Trước khi ghi kết quả từ tool MCP vào role `tool`, lược bỏ các trường nặng không cần thiết:
- Loại bỏ: `embeddings`, `raw_chunks`, `metadata` nội bộ, tọa độ visual.
- Giữ lại: `name`, `type`, `description`, `attributes/columns`, `relations` trực tiếp.

### 3.3. Lọc Công Cụ Động (Contextual Tool Pruning)
Khi bước vào Operational Tool Loop:
- Nếu đến từ luồng Knowledge/Kỹ thuật: gạt bỏ toàn bộ các tool quản lý cá nhân (`create_task`, `update_task`, `start_timer`, `query_worklogs`,...). Chỉ gửi các công cụ MCP tra cứu.
- Nếu đến từ luồng Task/Lịch trình: gạt bỏ các tool MCP tra cứu sâu không liên quan.

### 3.4. Chiến Lược Áp Dụng
1. **Pha 1**: Hoàn thiện và đo kiểm hiệu năng trên AI Chat Drawer (Web).
2. **Pha 2**: Tái sử dụng trọn vẹn luồng này cho Telegram Bot Worker qua bộ điều phối chung, bảo toàn Scope Guard của Telegram.
