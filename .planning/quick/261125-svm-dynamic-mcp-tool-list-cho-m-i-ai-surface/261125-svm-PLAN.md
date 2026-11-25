---
phase: quick
plan: 261125-svm
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/mcpClient.ts
  - src-tauri/src/ai_proxy.rs
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/telegram/telegramHeadlessWorker.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/__tests__/mcpClient.test.ts
  - tests/ai/mcpClientTransport.test.ts
  - tests/ai/AIChatDrawerConventions.test.tsx
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements:
  - DYNAMIC-MCP-TOOLS-01
must_haves:
  truths:
    - "Mọi tool mà MCP server advertise qua tools/list đều được đăng ký và quảng cáo cho model ở cả panel, team và Telegram."
    - "Khi server thêm/xoá tool, lượt chat tiếp theo dùng tool list mới mà không sửa code hay bấm reload; cache chỉ là tối ưu ngắn hạn."
    - "Tool mutation vẫn bị chặn ở JS dispatch và native proxy; URL/host policy không bị nới."
    - "Không còn hard-code allowlist tên tool (SOURCE_TOOL_NAMES, GRAPHITI_ALLOWED_TOOLS) làm điều kiện tool nào được dùng."
  artifacts:
    - path: src/services/ai/mcpClient.ts
      provides: "Discovery theo TTL, cache invalidation, resolve server theo tool map, read-only gate dựa trên advertise metadata."
      contains: "fetchServerTools"
    - path: src-tauri/src/ai_proxy.rs
      provides: "Native proxy forward mọi tools/call nhưng giữ method validation + URL policy; bỏ GRAPHITI_ALLOWED_TOOLS."
      contains: "validate_graphiti_request"
  key_links:
    - from: src/components/ai/AIChatDrawer.tsx
      to: src/services/ai/mcpClient.ts
      via: "Mỗi turn gọi discovery (có refresh) rồi getToolsForTurnWithRemote."
    - from: src/services/ai/office/teamRunCoordinator.ts
      to: src/services/ai/mcpClient.ts
      via: "refreshMcpTools mỗi turn refresh theo TTL; lead/employee nhận tool list mới."
    - from: src/services/telegram/telegramHeadlessWorker.ts
      to: src/services/ai/mcpClient.ts
      via: "Telegram headless gọi discoverAllMcpTools cho mỗi turn/loop có refresh."
---

<objective>
Đổi TaskMate từ allowlist tên tool cứng sang dynamic MCP tool list theo tinh thần Claude Code: mọi tool server advertise đều dùng được; tự reload theo lượt chat; áp dụng AI Chat panel, AI Chat team, Telegram AI chat. Giữ nguyên read-only/mutation gate và URL policy.

Không đụng code workstream khác. Không đụng rule markdown.

</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/261125-svm-dynamic-mcp-tool-list-cho-m-i-ai-surface/261125-svm-CONTEXT.md
@CLAUDE.md
@src/services/ai/mcpClient.ts
@src-tauri/src/ai_proxy.rs
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: MCP client discovery động, reload theo TTL, bỏ allowlist tên tool</name>
  <files>
    src/services/ai/mcpClient.ts,
    src/services/ai/__tests__/mcpClient.test.ts,
    tests/ai/mcpClientTransport.test.ts
  </files>
  <action>
    Trong `mcpClient.ts`: định nghĩa TTL ngắn cho cache discovery (ví dụ 10-30s) và hàm invalidate rõ ràng. `fetchServerTools` vẫn gọi `tools/list` mỗi lần discovery không còn cache vĩnh viễn; làm giảm cache staleness. Giữ metadata `readOnlyHint` và resolve map toolName->serverId. Bỏ `SOURCE_TOOL_NAMES` khỏi vị trí quyết định allow/deny; nếu cần cho prompt normalization thì giữ re-export riêng nhưng không dùng trong gate. `READ_ONLY_TOOL_ALLOWLIST` chỉ là fallback metadata cho server không gửi readOnlyHint, không phải danh sách "được dùng". `executeDynamicMcpTool` vẫn chặn mutation dựa trên metadata readOnly (fail-closed) + cờ allowMutation explicit; không tự resolve sang server cứng theo tên tool nữa, chỉ dùng toolToServerMap từ discovery gần nhất.

    Reload tự động: mỗi lần `discoverAllMcpTools`/`discoverGraphitiSqlMcpTools`/`discoverGatedMcpTools` được gọi trong một turn phải trả tool list mới nếu TTL đã hết hạn hoặc cache invalid. Không cache vĩnh viễn theo server. Thêm test: tools/list trả tool A rồi đổi thành tool B, sau invalidate/TTL expire discovery trả B và không còn A; mutation tool vẫn bị chặn.
  </action>
  <verify>
    <automated>npx vitest run src/services/ai/__tests__/mcpClient.test.ts tests/ai/mcpClientTransport.test.ts --bail=1</automated>
  </verify>
  <done>Discovery động, stale tool biến mất sau reload, tool mới xuất hiện, mutation vẫn fail-closed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Native proxy bỏ allowlist tên tool, giữ URL policy</name>
  <files>
    src-tauri/src/ai_proxy.rs
  </files>
  <action>
    Xoá `GRAPHITI_ALLOWED_TOOLS` khỏi `validate_graphiti_request`; `tools/call` chỉ cần params.name hợp lệ. Giữ nguyên method validation (initialize/notifications/initialized/tools/list/tools/call), request size, session validation và `is_allowed_graphiti_target`. Không mở URL policy; endpoint vẫn do người dùng cấu hình đã được validate. Cập nhật Rust test: mọi tool name mới được forward qua validate (kể cả tên lạ), nhưng mutation name vẫn bị JS gate chặn trước khi tới Rust (test JS lo phần đó); URL unsafe vẫn reject. Thêm test chứng minh tool list thay đổi không cần sửa Rust.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml ai_proxy</automated>
  </verify>
  <done>Rust proxy không còn hard-code tên tool; host/session policy giữ nguyên; Rust tests pass (trừ 2 baseline IPv6 nếu vẫn còn).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Nối 3 bề mặt AI + review diff + scoped verify</name>
  <files>
    src/services/ai/chatTurnTools.ts,
    src/services/ai/office/teamRunCoordinator.ts,
    src/services/telegram/telegramHeadlessWorker.ts,
    tests/ai/AIChatDrawerConventions.test.tsx,
    tests/services/ai/office/teamRunCoordinator.test.ts,
    tests/telegram/telegramHeadlessWorker.test.ts
  </files>
  <action>
    Panel: `AIChatDrawer` đã gọi discovery mỗi turn; giữ nguyên, chỉ đảm bảo helper dùng discovery mới. Team: `refreshMcpTools` gọi discovery theo TTL mỗi turn; lead/employee tool list dùng kết quả đó. Telegram: `discoverAllMcpTools` được gọi cho mỗi turn/loop; đảm bảo không dùng cached stale list. Bỏ mọi filter tên tool cứng trong allowlist khi xây payload (trừ read-only gate). Giữ WR-02 advertised-payload gate cho local DB tools.

    Review bắt buộc: đọc toàn bộ git diff, xác nhận (a) không file workstream khác bị commit, (b) rule hash nguyên vẹn, (c) mutation vẫn bị chặn JS, (d) URL policy Rust nguyên vẹn, (e) không còn allowlist tên tool cứng quyết định advertised/dispatch. Fix finding ngay trong task này. Chạy scoped tests + tsc.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/AIChatDrawerConventions.test.tsx tests/services/ai/office/teamRunCoordinator.test.ts tests/telegram/telegramHeadlessWorker.test.ts src/services/ai/__tests__/mcpClient.test.ts tests/ai/mcpClientTransport.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Panel/team/Telegram đều dùng tool list động; diff review sạch; scoped tests + typecheck pass.</done>
</task>

</tasks>

<verification>
1. Scoped Vitest theo lệnh từng task; TUYỆT ĐỐI không chạy full suite.
2. Rust: cargo test --manifest-path src-tauri/Cargo.toml ai_proxy.
3. Typecheck: npx tsc --noEmit.
4. Rule hash: cd public/ai-rules && shasum -a 256 -c SHA256SUMS.
5. Review diff: đọc toàn bộ, xác nhận workstream khác an toàn.
6. UAT tay: MCP server advertise tool mới → lượt chat kế tiếp thấy tool; xoá tool → lượt chat sau không thấy; mutation tool bị từ chối; panel/team/Telegram一致.
</verification>

<output>
Create .planning/quick/261125-svm-dynamic-mcp-tool-list-cho-m-i-ai-surface/261125-svm-SUMMARY.md when done.
</output>
