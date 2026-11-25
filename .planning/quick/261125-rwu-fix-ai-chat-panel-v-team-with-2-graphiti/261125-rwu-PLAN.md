---
phase: quick
plan: 261125-rwu
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/mcpClient.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/graphitiRules.ts
  - src-tauri/src/ai_proxy.rs
  - src/services/ai/__tests__/graphitiRules.test.ts
  - src/services/ai/__tests__/mcpClient.test.ts
  - tests/ai/mcpClientTransport.test.ts
  - tests/ai/AIChatDrawerConventions.test.tsx
  - tests/services/ai/office/teamPrompts.test.ts
autonomous: true
requirements:
  - GRAPHITI-SOURCE-TOOLS-01
must_haves:
  truths:
    - "Model gọi source tool đúng tên (`search_source`, `explore_source`, `source_callers`, `source_callees`, `read_source`) dù prompt có nhắc tên server `svng-source`; không còn tool call `svng source` vô nghĩa."
    - "Năm source tool được khám phá, quảng cáo và thực thi được cả trên Tauri lẫn web fallback, nhưng chỉ khi server `svng-source` được bật trong Settings; mọi tool ghi vào graph/catalog vẫn bị chặn."
    - "AI Chat panel và AI Chat team (lead + employee) dùng chung một nguồn định nghĩa tool và một prompt segment đã verify SHA-256; discovery lỗi được báo rõ, không im lặng rụt tools."
    - "Rule markdown dưới `public/ai-rules/` và `SHA256SUMS` giữ nguyên; không sửa rule để giải quyết lỗi."
  artifacts:
    - path: src/services/ai/mcpClient.ts
      provides: "Allowlist read-only mở rộng đúng 5 source tool; discover giữ tool có description/schema hợp lệ; executeDynamicMcpTool hoặc resolve được tên server từ prefix."
      contains: "READ_ONLY_TOOL_ALLOWLIST"
    - path: src/services/ai/aiTools.ts
      provides: "normalizeToolName sửa được dạng `svng source <tool>` trước khi dispatch."
      contains: "export function normalizeToolName"
    - path: src/services/ai/graphitiRules.ts
      provides: "Segment builder nhắc rõ `svng-source` LÀ TÊN SERVER, kèm 5 tên tool và lưu ý dùng source tool khi cần bằng chứng code."
      contains: "SOURCE_TOOL_NAMES"
    - path: src-tauri/src/ai_proxy.rs
      provides: "Rust proxy cho phép đúng 5 source tool, vẫn chặn mọi tên khác và vẫn kiểm tra URL endpoint."
      contains: "SOURCE_MCP_TOOLS"
    - path: src/services/ai/__tests__/graphitiRules.test.ts
      provides: "Test prompt segment có 5 tên tool và không gợi ý gọi server như tool."
    - path: tests/ai/mcpClientTransport.test.ts
      provides: "Test discovery giữ source tool và thực thi source tool bị từ chối nếu thiếu read-only grant."
  key_links:
    - from: src/services/ai/graphitiRules.ts (buildGraphitiSkillSegment)
      to: src/components/ai/AIChatDrawer.tsx (:1937) và src/services/ai/office/teamRunCoordinator.ts (:2395/:2643)
      via: "getGraphitiSkillSegment(db, text) trả segment chung cho panel và lead/employee; chỉ đổi builder, không sửa markdown."
    - from: src/components/ai/AIChatDrawer.tsx (:1923) và src/services/ai/office/teamRunCoordinator.ts (:1583)
      to: src/services/ai/mcpClient.ts (discoverGraphitiSqlMcpTools)
      via: "Cùng một discovery trả về 5 source tool khi svng-source enabled; tool list đi qua isReadOnlyMcpTool ở chatTurnTools.ts:125 và teamRunCoordinator.ts:1569."
    - from: src/services/ai/aiOrchestratorLoop.ts (:80) và src/services/ai/office/teamRunCoordinator.ts (:1648)
      to: src/services/ai/aiTools.ts (normalizeToolName) rồi src/services/ai/mcpClient.ts (executeDynamicMcpTool)
      via: "Tên model trả về được repair trước khi resolve server; server thật vẫn được xác định từ toolToServerMap hoặc id row."
    - from: src/services/ai/mcpClient.ts (invokeServerRpc, :324)
      to: src-tauri/src/ai_proxy.rs (validate_graphiti_request, :174)
      via: "Tauri gửi mọi tools/call qua graphiti_mcp_request; Rust phải cho phép 5 tên source tool thì mới tới endpoint svng-source."
---

<objective>

Sửa AI Chat panel và AI Chat team để dùng trọn vẹn 2 MCP server đã cấu hình: `graphiti-banking` (namespace graphiti-memory) và `svng-source`. Hiện tại model gọi nhầm tên server thành tool, source tool bị rụt ở discovery/allowlist và bị Rust proxy chặn.

Purpose: Giữ nguyên cơ chế đã có — rule markdown verify SHA-256, 2 server do Settings card quản lý, discovery + read-only gate, cùng một segment cho panel và team — chỉ sửa đúng các điểm đứt. Không thêm abstraction, không nới allowlist ngoài 5 tool có trong rule.

Output: Diff nhỏ trên 4 file production (TS + Rust) và 5 file test. Không đụng `public/ai-rules/**`, `SHA256SUMS`, `CLAUDE.md`, `.claude/skills/`.

</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261125-hn9-build-dedicated-graphiti-sql-feature-wit/261125-hn9-PLAN.md
@src/services/ai/graphitiRules.ts
@src/services/ai/mcpClient.ts
@src/services/ai/aiTools.ts
@src-tauri/src/ai_proxy.rs
@src/components/ai/AIChatDrawer.tsx
@src/services/ai/office/teamRunCoordinator.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sửa prompt và repair tên tool `svng-source` thành 5 source tool thật</name>
  <files>
    src/services/ai/graphitiRules.ts,
    src/services/ai/aiTools.ts,
    src/services/ai/__tests__/graphitiRules.test.ts,
    src/services/ai/__tests__/mcpClient.test.ts
  </files>
  <action>
    Không sửa file markdown rule (đã khóa bởi SHA256SUMS). Sửa ở nơi xây segment và normalize:

    1. `graphitiRules.ts`: export `SOURCE_TOOL_NAMES = ['search_source','explore_source','source_callers','source_callees','read_source'] as const`. Trong `buildGraphitiSkillSegment`, đổi dòng `- svng-source đang bật (...)` thành dòng nói rõ đây là TÊN SERVER, không phải tên tool, kèm danh sách 5 tool (dùng `SOURCE_TOOL_NAMES.join(', ')` để không lặp literal) và một câu ngắn: chỉ gọi các tool đó khi cần bằng chứng source, tuyệt đối không gọi tool tên `svng source` / `svng-source`. Giữ nguyên mọi phần khác của segment, marker cắt section, và logic `selectGraphitiSkill`. Đây là state owner của prompt: cả panel và team đều nhận segment này qua `getGraphitiSkillSegment`.
    2. `aiTools.ts` trong `normalizeToolName`: sau các replace hiện tại, thêm một nhánh repair cho trường hợp model ghép server id vào tên tool: chuẩn hóa `_` và dấu gạch ngang thành space, rồi nếu prefix là `svng source` (hoặc `svng-source`) và phần sau khớp một trong 5 tên source tool, trả về đúng tên tool đó. Không sửa các tên khác, không đổi action của tool, không thêm dependency. `ponytail:` comment một dòng: ceiling là repair cho prefix này; mở rộng khi có server id khác gây nhiễu tương tự.
    3. Test `src/services/ai/__tests__/graphitiRules.test.ts`: thêm case bật riêng `source` (dùng fixture + `mockBundle` có sẵn) assert segment chứa đủ 5 tên tool, có cụm phân biệt "server" vs "tool", và không có cụm gợi gọi `svng-source` như tool. Giữ test hash mismatch hiện tại nguyên vẹn.
    4. Test `src/services/ai/__tests__/mcpClient.test.ts` hoặc `tests/ai/aiTools.test.ts`: assert `normalizeToolName('svng source search_source')`, `'svng-source source_callers'` trả đúng `search_source` / `source_callers`; assert `normalizeToolName('svng source')` (không có tool) vẫn trả chuỗi đã normalize, không bị cắt thành tool name.
  </action>
  <verify>
    <automated>npx vitest run src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts tests/ai/aiTools.test.ts --bail=1</automated>
  </verify>
  <done>Segment nhắc rõ 5 tên tool và phân biệt server/tool; normalize repair được tên model garbled mà không tạo tool mới; rule files và SHA256SUMS không đổi; test targeted pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Cho phép 5 source tool đi qua discovery, read-only gate và Tauri proxy</name>
  <files>
    src/services/ai/mcpClient.ts,
    src-tauri/src/ai_proxy.rs,
    tests/ai/mcpClientTransport.test.ts
  </files>
  <action>
    Giữ fail-closed; mở rộng đúng danh sách đã ghi trong rule.

    1. `mcpClient.ts`: thêm 5 source tool vào `READ_ONLY_TOOL_ALLOWLIST`. Trong `fetchServerTools`, bỏ condition `typeof tool.description === 'string'` (hiện tại tool có description thiếu bị rụt im lặng tại :421-426): vẫn yêu cầu `name` string và `inputSchema` hợp lệ; description khi thiếu tự động là `''` khi tạo `AiToolDefinition`. Trong `discoverToolsFrom` (:460-467), thay `console.warn` bằng `logAiChatError` tương đương của module (nếu chưa có import thì dùng `console.error` có prefix `[mcpClient]`) kèm server id và message, để discovery failure không còn vô hình; vẫn tiếp tục server khác, không throw.
    2. `mcpClient.ts` `executeDynamicMcpTool`: trước khi báo `Không rõ máy chủ MCP`, nếu `toolName` nằm trong 5 source tool và row `svng-source` tồn tại thì dùng `serverId = 'svng-source'` thay vì resolve từ map; nếu row disabled vẫn rơi vào nhánh "bị tắt" hiện tại. Đây là fallback cần thiết khi normalize chưa kịp chạy hoặc tool chưa discovery; không scan toàn bộ server.
    3. `src-tauri/src/ai_proxy.rs`: đổi `GRAPHITI_ALLOWED_TOOLS` thành 2 mảng (hoặc mở rộng mảng hiện tại) để `validate_graphiti_request` cho phép đúng 5 source tool bên cạnh 4 graphiti tool hiện có, vẫn reject mọi tên khác (mutation `add_memory`, `upsert_catalog_batch`, `clear_graph`, v.v.) và vẫn giữ nguyên `is_allowed_graphiti_target` + session validation. Update test `graphiti_rejects_mutations_and_unknown_tools` nếu `search_everything` trùng tên mới (không trùng), thêm assert 5 source tool được phép và mutation vẫn bị chặn. Không đổi fallback `GRAPHITI_MCP_URL`: endpoint vẫn lấy từ `server.url` do người dùng nhập qua invoke.
    4. `tests/ai/mcpClientTransport.test.ts`: thêm source server row có url private (`http://127.0.0.1:9102/mcp`); mock `tools/list` trả source tool có `description` thiếu và `inputSchema` hợp lệ; assert discovery giữ tool; assert `executeDynamicMcpTool('search_source', ...)` gọi đúng `tools/call` tới server id đó mà không cần `serverId` option; assert mutation tool vẫn bị chặn trước `tools/call`. Chạy Rust test bằng `cargo test --manifest-path src-tauri/Cargo.toml ai_proxy` hoặc filter tương đương nếu workspace config khác.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/mcpClientTransport.test.ts src/services/ai/__tests__/mcpClient.test.ts --bail=1 && cargo test --manifest-path src-tauri/Cargo.toml ai_proxy</automated>
  </verify>
  <done>5 source tool được discovery dù thiếu description, pass JS read-only gate, resolve đúng `svng-source`, được Rust proxy chuyển tiếp; mutation và URL unsafe vẫn bị chặn; test JS + Rust pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Nối wiring panel/team và review diff + verify scoped</name>
  <files>
    src/components/ai/AIChatDrawer.tsx,
    src/services/ai/office/teamRunCoordinator.ts,
    tests/ai/AIChatDrawerConventions.test.tsx,
    tests/services/ai/office/teamPrompts.test.ts
  </files>
  <action>
    Panel và team đã gọi chung `getGraphitiSkillSegment` và `discoverGraphitiSqlMcpTools`; task này CHỈ xác nhận path chạy xong, không thiết kế lại.

    1. `AIChatDrawer.tsx` tại :1923-1942: sau khi discovery, nếu `svng-source` enabled mà tool list không có source tool nào, thêm `appMessage.warning` một lần (Vietnamese, ngắn: không discovery được source tool) thay vì im lặng; đảm bảo vẫn gọi `getGraphitiSkillSegment(db, promptText)` như hiện tại. Không đổi master gate `turnMcpEnabled`.
    2. `teamRunCoordinator.ts` `refreshMcpTools` (:1583-1604): giữ cached list khi discovery timeout nhưng log rõ bằng instrument đã có (`diagnosticDetail`/event log nếu có sẵn; nếu không thì console.error có prefix) kèm reason; không đổi 5s bound. Đảm bảo `mcpReadOnlyTools()` dùng `isReadOnlyMcpTool` nên giờ giữ 5 source tool; lead/employee prompt vẫn nhận `graphitiSkillSegment` từ :2395 / :2643. Không thêm tool handler mới vào team — source tool đi qua `dispatchAiToolCall` hiện tại.
    3. Test `tests/ai/AIChatDrawerConventions.test.tsx`: mock `getGraphitiMcpToolDefinitions` + `getGraphitiSkillSegment` đã có; thêm case assert system prompt chứa segment có 5 tên tool, và panel không crash khi discovery source trả lỗi (warning được gọi, turn vẫn chạy). Test `tests/services/ai/office/teamPrompts.test.ts`: assert cả lead và employee builder truyền `graphitiSkillSegment` chứa danh sách tool (dùng literal trong fixture test, không đọc rule file).
    4. Review bắt buộc: chạy `git diff` đọc toàn bộ thay đổi, xác nhận (a) không file nào dưới `public/ai-rules/` đổi, (b) mọi nhánh read-only gate vẫn fail-closed, (c) không tool mutation nào được thêm vào allowlist TS lẫn Rust, (d) URL policy không bị nới. Sửa finding ngay trong task này rồi chạy lại scoped tests + `npx tsc --noEmit`. Không chạy full vitest suite.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/AIChatDrawerConventions.test.tsx tests/services/ai/office/teamPrompts.test.ts src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts tests/ai/mcpClientTransport.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Cả panel và team nhận cùng segment chứa 5 source tool, discovery failure có tín hiệu rõ; diff review sạch, hash rule nguyên vẹn, scoped tests + typecheck pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| model tool call → MCP execution | Tên tool do model sinh ra là untrusted; không được tự ý gọi server hoặc mutation. |
| JS allowlist → Tauri proxy | Cả 2 lớp phải đồng ý tên tool; JS nới mà Rust không nới thì source tool vẫn chết, Rust nới quá rộng thì mutation lọt. |
| rule file → prompt | Rule text đã verify SHA-256; chỉ được cắt section, không được viết lại để giải quyết bug. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261125-rwu-01 | Elevation of Privilege | `READ_ONLY_TOOL_ALLOWLIST` + `GRAPHITI_ALLOWED_TOOLS` | mitigate | Thêm đúng 5 tool đọc đã document; giữ reject mọi tên ngoài danh sách, kể cả mutation Graphiti. |
| T-261125-rwu-02 | Tampering | `normalizeToolName` repair | mitigate | Chỉ map prefix `svng source` sang 5 tên có sẵn; không tạo tên tool mới, không bỏ qua cổng server enabled. |
| T-261125-rwu-03 | Information Disclosure | `svng-source` endpoint | mitigate | Giữ `is_allowed_graphiti_target` và URL do người dùng nhập; không nhúng endpoint mới, không log URL đầy đủ vào prompt/error. |
</threat_model>

<verification>

1. Scoped Vitest (tuyệt đối không chạy full suite — project rule):
   - `npx vitest run src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts tests/ai/aiTools.test.ts --bail=1`
   - `npx vitest run tests/ai/mcpClientTransport.test.ts --bail=1`
   - `npx vitest run tests/ai/AIChatDrawerConventions.test.tsx tests/services/ai/office/teamPrompts.test.ts --bail=1`
2. Rust: `cargo test --manifest-path src-tauri/Cargo.toml ai_proxy`
3. Typecheck: `npx tsc --noEmit`
4. Hash proof: `cd public/ai-rules && shasum -a 256 -c SHA256SUMS` — phải `OK` cả 2 file.
5. Diff review: `git diff --stat` + đọc `git diff`; xác nhận không đổi `public/ai-rules/**`.
6. UAT tay (Tauri dev đang chạy): bật 2 server trong Settings > Graphiti/SQL, mở AI chat panel hỏi một câu source evidence, và hỏi cùng câu trong team chat; cả hai phải gọi được `search_source`/`read_source` (xem tool call log), không còn tool `svng source`; thử gọi `add_memory` phải bị từ chối ở cả JS và Rust.

</verification>

<success_criteria>

- Segment prompt của panel và team liệt kê đúng 5 source tool, phân biệt rõ server id `svng-source` với tên tool.
- `normalizeToolName` sửa được tool call model garbled mà không ảnh hưởng tool khác.
- 5 source tool discovery được ở Tauri, vượt read-only gate, và được Rust proxy chuyển tiếp; mutation tool vẫn bị chặn ở cả 2 lớp.
- Không file rule markdown hay SHA256SUMS nào thay đổi; URL policy và fail-closed behavior giữ nguyên.
- Scoped tests, Rust tests, typecheck và hash proof đều đạt; diff đã review, không có band-aid hay abstraction mới.

</success_criteria>

<output>

Create `.planning/quick/261125-rwu-fix-ai-chat-panel-v-team-with-2-graphiti/261125-rwu-SUMMARY.md` when done.

</output>
