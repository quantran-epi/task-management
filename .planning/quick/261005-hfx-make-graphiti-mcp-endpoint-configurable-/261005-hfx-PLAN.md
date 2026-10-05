---
phase: quick
plan: 261005-hfx
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/ai_proxy.rs
  - src/services/ai/graphitiMcpClient.ts
  - src/components/settings/NineRouterConfigCard.tsx
  - src/components/ai/AIChatDrawer.tsx
  - tests/ai/graphitiMcpClient.test.ts
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements:
  - QUICK-261005-HFX-GRAPHITI-CONFIG-AND-SMARTVISTA-DICT
must_haves:
  truths:
    - "Graphiti MCP endpoint is configurable in Dexie settings (settings key `graphiti_mcp_endpoint`), defaulting to http://10.4.97.70:30456/mcp."
    - "NineRouterConfigCard in Settings > AI Assistant provides an editable endpoint field and test connection action for Graphiti MCP."
    - "Tauri proxy receives endpoint via parameter, validates that URL is an allowed HTTP/HTTPS LAN or local host with valid format, and executes MCP requests against it."
    - "AI Assistant system prompt injects SmartVista banking domain dictionary instructions into context grounding so model correctly understands card management and payment switch domain terminology."
    - "Graphiti MCP discovery and tool execution use the user-configured endpoint reactively."
    - "Focused Vitest tests for graphitiMcpClient and AIChatDrawer pass."
  artifacts:
    - path: "src-tauri/src/ai_proxy.rs"
      provides: "Configurable endpoint validation and request execution for Graphiti MCP"
      exports: ["graphiti_mcp_request"]
    - path: "src/services/ai/graphitiMcpClient.ts"
      provides: "Configurable endpoint retrieval, settings persistence, test connection, and MCP communication"
      exports: ["getGraphitiMcpEndpoint", "setGraphitiMcpEndpoint", "testGraphitiMcpConnection", "getGraphitiMcpToolDefinitions", "executeGraphitiMcpTool"]
    - path: "src/components/settings/NineRouterConfigCard.tsx"
      provides: "Settings UI section for Graphiti MCP endpoint with test connection button"
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "SmartVista dictionary domain guidance in system prompt and dynamic Graphiti endpoint usage"
    - path: "tests/ai/graphitiMcpClient.test.ts"
      provides: "Endpoint configuration, allowlist, and connection testing tests"
    - path: "tests/ai/AIChatDrawer.test.tsx"
      provides: "System prompt SmartVista instructions and tool execution tests"
  key_links:
    - from: "src/components/settings/NineRouterConfigCard.tsx"
      to: "src/services/ai/graphitiMcpClient.ts"
      via: "getGraphitiMcpEndpoint / setGraphitiMcpEndpoint / testGraphitiMcpConnection"
      pattern: "getGraphitiMcpEndpoint|setGraphitiMcpEndpoint|testGraphitiMcpConnection"
    - from: "src/services/ai/graphitiMcpClient.ts"
      to: "src-tauri/src/ai_proxy.rs"
      via: "invoke('graphiti_mcp_request', { endpoint, body, sessionId })"
      pattern: "graphiti_mcp_request"
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "SmartVista dictionary domain instructions in system prompt"
      via: "systemPromptContent string"
      pattern: "SmartVista"
---

<objective>
Make Graphiti MCP endpoint configurable in PlannerMate settings and inject SmartVista banking domain dictionary instructions into the AI Assistant system prompt.

Purpose: Allow switching Graphiti MCP endpoints across environments without code changes, and guide the AI assistant with SmartVista card switch & payment processing terminology.
Output: Configurable Graphiti endpoint settings, native proxy endpoint validation, settings UI controls, SmartVista banking instructions in AI drawer, and updated tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src-tauri/src/ai_proxy.rs
@src/services/ai/graphitiMcpClient.ts
@src/components/settings/NineRouterConfigCard.tsx
@src/components/ai/AIChatDrawer.tsx
@tests/ai/graphitiMcpClient.test.ts
@tests/ai/AIChatDrawer.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Support configurable Graphiti MCP endpoint in Rust proxy and TypeScript client</name>
  <files>src-tauri/src/ai_proxy.rs, src/services/ai/graphitiMcpClient.ts, tests/ai/graphitiMcpClient.test.ts</files>
  <behavior>
    - `graphiti_mcp_request` in Rust accepts optional `endpoint: Option<String>`. If omitted or empty, fallback to default `http://10.4.97.70:30456/mcp`.
    - Validate `endpoint` URL: must be valid http/https scheme, parseable URL, pointing to loopback or private IPv4/LAN host (using existing `is_allowed_http_host` helper or https). Reject malicious/arbitrary public targets.
    - Export `DEFAULT_GRAPHITI_MCP_ENDPOINT = 'http://10.4.97.70:30456/mcp'`, `getGraphitiMcpEndpoint(db?)`, `setGraphitiMcpEndpoint(endpoint, db?)`, and `testGraphitiMcpConnection(endpoint?, db?)` in `graphitiMcpClient.ts`.
    - `testGraphitiMcpConnection` initializes session, checks tools/list, and returns status with count of allowed tools discovered.
    - `invokeGraphiti` reads the configured endpoint (or uses provided endpoint) and passes it to `graphiti_mcp_request`.
    - When endpoint changes or test connection runs, session state resets cleanly.
  </behavior>
  <action>
In `src-tauri/src/ai_proxy.rs`:
1. Define helper `is_allowed_graphiti_target(url: &str) -> bool`: parses URL, allows http with loopback/private IPv4 or localhost/hostname on private subnet, or allows https.
2. Update `graphiti_mcp_request(body: String, session_id: Option<String>, endpoint: Option<String>)`:
   - If `endpoint` is provided and non-empty, trim it, validate with `is_allowed_graphiti_target`, and use it as target URL. Otherwise use `GRAPHITI_MCP_URL`.
   - Keep all existing method/tool allowlist and body size protections intact.

In `src/services/ai/graphitiMcpClient.ts`:
1. Add constant `DEFAULT_GRAPHITI_MCP_ENDPOINT = 'http://10.4.97.70:30456/mcp'`.
2. Add `getGraphitiMcpEndpoint(db: TaskPlannerDatabase = defaultDb): Promise<string>`: reads key `'graphiti_mcp_endpoint'` from `db.settings`.
3. Add `setGraphitiMcpEndpoint(endpoint: string, db: TaskPlannerDatabase = defaultDb): Promise<void>`: saves cleaned endpoint into `db.settings` under `'graphiti_mcp_endpoint'`, and calls `clearSession()`.
4. Add `testGraphitiMcpConnection(customEndpoint?: string, db?: TaskPlannerDatabase): Promise<{ ok: boolean; message: string; toolsCount?: number }>`: invokes initialization and `tools/list` through proxy, returns tool count.
5. In `invokeGraphiti`, pass `endpoint` parameter obtained from `getGraphitiMcpEndpoint()`.
6. Update `tests/ai/graphitiMcpClient.test.ts` to cover `getGraphitiMcpEndpoint`, `setGraphitiMcpEndpoint`, custom endpoint passing to `invokeMock`, and `testGraphitiMcpConnection`.
  </action>
  <verify>
    <automated>npm test -- tests/ai/graphitiMcpClient.test.ts</automated>
  </verify>
  <done>Graphiti MCP endpoint is configurable in Dexie settings, validated by Tauri proxy, testable via connection test function, and covered by unit tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add Graphiti MCP configuration UI to NineRouterConfigCard</name>
  <files>src/components/settings/NineRouterConfigCard.tsx</files>
  <behavior>
    - Settings > Trợ lý AI displays a dedicated Card/Section for "Graphiti MCP (Knowledge Graph)".
    - User can view and edit the Graphiti MCP endpoint input field (defaults to `http://10.4.97.70:30456/mcp`).
    - User can click "Kiểm tra kết nối" to run `testGraphitiMcpConnection` and see success/failure status message with discovered tool count.
    - Saving config updates `setGraphitiMcpEndpoint` and gives user feedback toast/alert.
  </behavior>
  <action>
In `src/components/settings/NineRouterConfigCard.tsx`:
1. Import `DEFAULT_GRAPHITI_MCP_ENDPOINT`, `getGraphitiMcpEndpoint`, `setGraphitiMcpEndpoint`, `testGraphitiMcpConnection` from `../../services/ai/graphitiMcpClient`.
2. Add state for `graphitiEndpoint`, `graphitiTesting`, `graphitiConnectionResult`.
3. In `loadData()` useEffect, load saved Graphiti endpoint with `getGraphitiMcpEndpoint(db)` and set state.
4. Add handler `handleTestGraphitiConnection`: calls `testGraphitiMcpConnection(graphitiEndpoint, db)` and updates `graphitiConnectionResult`.
5. In `handleSaveConfig`: call `setGraphitiMcpEndpoint(graphitiEndpoint, db)` alongside existing 9Router settings.
6. Render a Card section for Graphiti MCP within the AI settings view:
   - Input for Graphiti MCP Endpoint with placeholder and reset to default button.
   - Test Connection button with loading spinner and result alert tag/badge.
   - Informational text describing that Graphiti MCP provides read-only knowledge graph memory facts and catalog context for the AI assistant.
  </action>
  <verify>
    <automated>npm test -- tests/ai/graphitiMcpClient.test.ts</automated>
  </verify>
  <done>User can configure Graphiti MCP endpoint and test connection directly in the AI Assistant settings tab.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Inject SmartVista dictionary instructions into AI Assistant system prompt</name>
  <files>src/components/ai/AIChatDrawer.tsx, tests/ai/AIChatDrawer.test.tsx</files>
  <behavior>
    - System prompt contains a specialized SmartVista Banking Domain Dictionary instruction section.
    - Key SmartVista concepts covered:
      * Card Management & Issuing (CMS): Card product, BIN, PAN, Card lifecycle (Active, Blocked, Expired), PIN generation, Cardholder, Account linkage.
      * Transaction Processing & Switch (SVS): Authorization, Clearing, Settlement, ISO 8583 message specs (0100/0110, 0200/0210), Processing Codes, Response Codes (RC).
      * Terminal & Channel Integration: ATM / POS / VPOS / E-Commerce, 3D-Secure (OTP/ACS).
      * Reconciliation & Settlement: Fee calculation, Interchange, Clearing files, Dispute/Chargeback management.
    - Guide the model to use correct SmartVista terminology, interpret error codes/transaction flows accurately, and connect banking tasks with relevant SmartVista modules.
    - Existing anti-hallucination, database mutation, and Graphiti untrusted-data instructions remain fully intact.
  </behavior>
  <action>
In `src/components/ai/AIChatDrawer.tsx`:
1. Define a structured `SMARTVISTA_DICTIONARY_INSTRUCTION`:
   - Clarify SmartVista role as payment switch, card management, and transaction processing platform.
   - Map key modules: SV FE (Front-End switch/routing), SV BO (Back-Office / CMS), SV POS/ATM controller, SV Settlement & Reconciliation.
   - ISO 8583 standard message types, processing flows, response code interpretations (RC 00, RC 05, RC 51, etc.).
   - Card lifecycle rules, BIN configuration, account relationship, dispute handling.
   - Instruction: "When discussing banking IT tasks, card processing, transactions, or system integration involving SmartVista or switch systems, adhere to these official domain definitions and terminology."
2. Inject `SMARTVISTA_DICTIONARY_INSTRUCTION` into `systemPromptContent` within `AIChatDrawer.tsx`.
3. In `tests/ai/AIChatDrawer.test.tsx`:
   - Add test assertion verifying that system prompt sent to model includes SmartVista domain dictionary instructions.
   - Ensure existing tests pass without regressions.
  </action>
  <verify>
    <automated>npm test -- tests/ai/AIChatDrawer.test.tsx tests/ai/graphitiMcpClient.test.ts</automated>
  </verify>
  <done>AI Assistant is equipped with SmartVista domain dictionary instructions, and all AI chat tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Settings UI to Tauri Proxy | User enters arbitrary endpoint string in UI, passed to native Rust HTTP proxy. |
| Model prompt to AI context | Domain instructions injected into system prompt. |
| Tauri Proxy to Network | Proxy executes HTTP POST against configured endpoint. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261005-HFX-01 | Elevation of Privilege / SSRF | `src-tauri/src/ai_proxy.rs` | high | mitigate | Restrict user-configured Graphiti endpoint in Rust to valid HTTP/HTTPS URLs targeting localhost, private IPv4 LAN addresses, or approved domains. Reject loopback ports if forbidden or arbitrary cloud metadata IPs (e.g. 169.254.169.254). |
| T-261005-HFX-02 | Information Disclosure | `graphitiMcpClient.ts` | medium | mitigate | Only send MCP JSON-RPC protocol payloads with session IDs; never send database tokens, API keys, or application credentials to the Graphiti endpoint. |
| T-261005-HFX-03 | Denial of Service | `graphitiMcpClient.ts` & proxy | low | mitigate | Keep response byte bounds (2MB) and request timeout in place so unreachable or malicious endpoints cannot hang the application. |
| T-261005-HFX-SC | Tampering | npm/cargo dependencies | high | mitigate | Zero new dependencies added. Rely solely on existing Dexie, React, Ant Design, reqwest, and serde. |
</threat_model>

<verification>
Run focused verification commands:
- `npm test -- tests/ai/graphitiMcpClient.test.ts`
- `npm test -- tests/ai/AIChatDrawer.test.tsx tests/ai/graphitiMcpClient.test.ts`
</verification>

<success_criteria>
- Graphiti MCP endpoint is configurable in Settings > AI Assistant and defaults to http://10.4.97.70:30456/mcp.
- Connection test verifies endpoint availability and displays discovered tool count.
- Rust proxy safely validates custom endpoint targets.
- SmartVista dictionary instructions are present in AI Assistant context grounding.
- Focused Vitest test suite passes.
</success_criteria>

<output>
Create `.planning/quick/261005-hfx-make-graphiti-mcp-endpoint-configurable-/261005-hfx-PLAN.md`
</output>
