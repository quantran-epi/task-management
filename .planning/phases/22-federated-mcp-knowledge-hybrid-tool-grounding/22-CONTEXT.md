# Phase 22: Federated MCP Knowledge & Hybrid Tool Grounding — Context

<domain>
## Phase Goal
Cho phép AI Chat Drawer và Telegram Bot tận dụng tất cả các MCP Server đang được bật (enabled) trong hệ thống TaskMate (không chỉ riêng Graphiti hay Oracle) để tra cứu dữ liệu/tri thức và thao tác. Khi `intentRouter` phân tích thấy câu hỏi liên quan đến khả năng của một hoặc nhiều MCP server, hệ thống thực thi truy vấn song song (Knowledge Docs RAG + MCP Tool loop), sau đó tổng hợp kết quả cuối cùng từ nhiều nguồn có dẫn chứng đầy đủ.
</domain>

<decisions>
## Implementation Decisions

### 1. Generic & Server-Agnostic
- **Không hardcode bất kỳ server ID nào**: Mọi logic lấy MCP server đều dựa trên `getMcpServers(db).filter(s => s.enabled)`.
- Đọc động toàn bộ tool list và instruction từ tất cả server đang enable qua `discoverAllMcpTools(db)` và `getEnabledMcpInstructions(db)`.

### 2. Intent Routing với Dynamic MCP Capabilities
- Đưa metadata rút gọn của các server MCP đang bật (name, instruction/description, danh sách tool chính) vào prompt của `intentRouter`.
- Mở rộng Zod schema `IntentResultSchema`:
  - `require_mcp: boolean`
  - `target_mcp_servers: string[]` (danh sách ID các MCP server phù hợp, rỗng nếu không cần)
- Giữ nguyên các intent hiện tại (`operate_taskmate`, `query_taskmate`, `query_knowledge`, `mixed`, `clarify`), bổ sung khả năng kích hoạt MCP độc lập với intent đó.

### 3. Federated Parallel Execution (Docs RAG + MCP Tool Execution)
- Khi `require_mcp = true`:
  - **Kênh A (Knowledge Docs)**: Tiếp tục chạy pipeline federated retrieval hiện tại (Knowledge Server Fastify hoặc BM25 local).
  - **Kênh B (MCP Tool Execution)**: Tự động chạy tool-calling loop đối với các tool của `target_mcp_servers` để thu thập dữ liệu thực tế (ví dụ: schema, bảng, cột, quan hệ...).
  - Cả hai kênh chạy song song (`Promise.allSettled`), có timeout bảo vệ để không làm treo luồng chat nếu MCP server phản hồi chậm.

### 4. Đóng gói Bằng chứng & Trích dẫn (Evidence Packing & Citations)
- Chuẩn hóa kết quả trả về từ MCP tools vào `EvidencePack`:
  - Format citation: `[MCP:serverName/toolName]` hoặc URN định danh tài nguyên MCP.
  - Phân loại bằng chứng (`OBSERVED`, authority: `server`).
- UI hiển thị trích dẫn MCP rõ ràng trên Chat Bubble (ví dụ chip/badge phân biệt giữa Knowledge Doc và Live MCP data).

### 5. Đồng bộ Telegram Bot Gateway
- Nạp động các MCP tools đang bật vào luồng xử lý của `telegramHeadlessWorker.ts` và `telegramMutationSession.ts`.
- Hỗ trợ user Telegram có quyền tra cứu/thao tác thông qua MCP song song với tài liệu TaskMate.
</decisions>

<canonical_refs>
## Canonical References
- `src/services/ai/mcpClient.ts` — Quản lý cấu hình MCP, discovery tool, và gọi tool qua proxy Tauri.
- `src/services/ai/intentRouter.ts` — Phân loại ý định người dùng (Zod schema & system prompt).
- `src/services/ai/groundedTurn.ts` — Điều phối pipeline RAG tri thức và synthesis.
- `src/services/ai/evidencePack.ts` — Đóng gói bằng chứng và citations.
- `src/components/ai/AIChatDrawer.tsx` — UI Chat Drawer và luồng operational tool loop hiện tại.
- `src/services/telegram/telegramHeadlessWorker.ts` — Worker xử lý tin nhắn Telegram bot nền.
</canonical_refs>

<specifics>
## Specific Requirements
- MCP-ROUTE-01: `intentRouter` chấp nhận danh sách dynamic MCP server capabilities và trả về cờ `require_mcp` cùng `target_mcp_servers`.
- MCP-FEDERATED-01: `groundedTurn` chạy song song Knowledge Docs retrieval và MCP tool retrieval khi `require_mcp` được bật.
- MCP-SYNTH-01: Synthesis kết hợp bằng chứng từ Docs và MCP, hỗ trợ hiển thị citation MCP trên giao diện.
- MCP-TELE-01: Telegram headless worker hỗ trợ MCP song song với Docs cho các câu hỏi của người dùng được cấp quyền.
</specifics>
