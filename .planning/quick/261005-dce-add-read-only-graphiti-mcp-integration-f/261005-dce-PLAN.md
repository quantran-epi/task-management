---
phase: quick
plan: 261005-dce
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/ai_proxy.rs
  - src-tauri/src/lib.rs
  - src/services/ai/graphitiMcpClient.ts
  - src/components/ai/AIChatDrawer.tsx
  - tests/ai/graphitiMcpClient.test.ts
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements:
  - QUICK-261005-DCE-GRAPHITI-MCP
must_haves:
  truths:
    - "Tauri AI chat can discover and call Graphiti MCP at http://10.4.97.70:30456/mcp through a native proxy, without WebView CORS requests."
    - "The model sees and can execute only list_advertised_groups, search_nodes, search_memory_facts, and get_catalog_object_context from Graphiti."
    - "Unknown, write, and delete MCP tools are rejected in both TypeScript and Rust before any network request."
    - "Discovered schemas and advertised-group results are cached for the desktop session, while failed discovery remains retryable."
    - "Graphiti unavailability leaves existing local AI tools and chat behavior working."
    - "Only focused Graphiti, AI drawer, and Rust proxy tests run."
  artifacts:
    - path: "src-tauri/src/ai_proxy.rs"
      provides: "Fixed-endpoint Graphiti MCP transport with JSON-RPC and tool allowlists"
      exports: ["graphiti_mcp_request"]
    - path: "src/services/ai/graphitiMcpClient.ts"
      provides: "MCP session handshake, filtered schema discovery, result parsing, caching, and read-only calls"
      exports: ["getGraphitiMcpToolDefinitions", "executeGraphitiMcpTool", "isGraphitiMcpTool"]
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "Graphiti schemas and execution wired into existing AI tool loop"
    - path: "tests/ai/graphitiMcpClient.test.ts"
      provides: "Focused allowlist, protocol, and cache coverage"
    - path: "tests/ai/AIChatDrawer.test.tsx"
      provides: "Focused tool-loop wiring and graceful fallback coverage"
  key_links:
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/services/ai/graphitiMcpClient.ts"
      via: "one filtered tool set per chat turn and routed Graphiti tool execution"
      pattern: "getGraphitiMcpToolDefinitions|executeGraphitiMcpTool"
    - from: "src/services/ai/graphitiMcpClient.ts"
      to: "src-tauri/src/ai_proxy.rs"
      via: "@tauri-apps/api/core invoke('graphiti_mcp_request', { body, sessionId })"
      pattern: "graphiti_mcp_request"
    - from: "src-tauri/src/ai_proxy.rs"
      to: "http://10.4.97.70:30456/mcp"
      via: "fixed reqwest POST after JSON-RPC method and tools/call name validation"
      pattern: "10\\.4\\.97\\.70:30456/mcp"
---

<objective>
Add read-only Graphiti MCP retrieval to Tauri AI chat through the existing native proxy and model tool loop.

Purpose: Let desktop chat retrieve Graphiti knowledge without CORS work or granting any MCP mutation path.
Output: Fixed native MCP command, dependency-free MCP client with discovery caches, four filtered tools in the current tool loop, and targeted tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/quick/261005-cn2-implement-a-tauri-local-proxy-for-ai-9ro/261005-cn2-SUMMARY.md
@src-tauri/src/ai_proxy.rs
@src-tauri/src/lib.rs
@src/services/ai/aiTools.ts
@src/services/ai/nineRouterClient.ts
@src/components/ai/AIChatDrawer.tsx
@tests/ai/nineRouterClient.test.ts
@tests/ai/AIChatDrawer.test.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add fixed, read-only Graphiti MCP Tauri transport</name>
  <files>src-tauri/src/ai_proxy.rs, src-tauri/src/lib.rs</files>
  <behavior>
    - Accept MCP JSON-RPC methods initialize, notifications/initialized, tools/list, and tools/call only.
    - For tools/call, accept only list_advertised_groups, search_nodes, search_memory_facts, and get_catalog_object_context.
    - Reject malformed or batch JSON-RPC, unknown methods, and every unlisted tool before reqwest executes.
    - Always POST to http://10.4.97.70:30456/mcp; callers cannot supply or override URL, method, or arbitrary headers.
    - Forward an optional MCP session ID and return status, response headers, and text body for JSON or SSE parsing.
  </behavior>
  <action>
Extend `src-tauri/src/ai_proxy.rs` rather than adding another proxy subsystem. Add `graphiti_mcp_request(body: String, session_id: Option<String>)` beside `ai_proxy_request`, reusing `AiProxyResponse`. Keep `ai_proxy_request` target rules unchanged. Hardcode `http://10.4.97.70:30456/mcp` inside the new command and issue POST with `Content-Type: application/json` plus `Accept: application/json, text/event-stream`; forward only a parsed `Mcp-Session-Id`, never caller-provided URL or headers. Parse the outbound body with `serde_json`: require one JSON-RPC 2.0 object; allow only handshake/discovery methods `initialize`, `notifications/initialized`, `tools/list`; for `tools/call`, require `params.name` to equal one of the four read-only names. Reject batches, malformed payloads, write/delete names, and unknown methods before creating the request. Bound request and response bodies to conservative constants so an untrusted model or MCP peer cannot exhaust desktop memory; report transport/status bodies without leaking unrelated app state. Add Rust unit tests in this module whose names contain `graphiti` for every allowed method/tool and representative `create_*`, `update_*`, `delete_*`, unknown, malformed, batch, and oversized cases. Register the command in `src-tauri/src/lib.rs` without changing Jira or 9Router handlers. Use existing reqwest/serde dependencies; add no package.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml graphiti --lib</automated>
  </verify>
  <done>Direct Tauri invocation can reach only fixed Graphiti endpoint and four read-only tool calls; Rust tests prove other MCP methods/tools never reach network path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build cached Graphiti MCP discovery and call client</name>
  <files>src/services/ai/graphitiMcpClient.ts, tests/ai/graphitiMcpClient.test.ts</files>
  <behavior>
    - Browser/non-Tauri callers discover no Graphiti tools and make no HTTP request.
    - First Tauri discovery initializes MCP session, sends initialized notification, lists tools, and retains only exact four allowed names.
    - OpenAI tool definitions preserve each allowed server tool description and inputSchema; unadvertised allowed names are not invented.
    - Repeated discovery reuses cached schemas; failed discovery clears in-flight cache so a later turn can retry.
    - Repeated list_advertised_groups calls with identical arguments reuse cached successful result; search tools remain live.
    - Any unlisted tool name is rejected locally before invoke, even if server advertised it.
  </behavior>
  <action>
Create dependency-free `src/services/ai/graphitiMcpClient.ts`. Define one immutable exact-name allowlist for `list_advertised_groups`, `search_nodes`, `search_memory_facts`, and `get_catalog_object_context`, and export `isGraphitiMcpTool`. Guard all discovery with existing `isTauriApp`; use dynamic `@tauri-apps/api/core` import and invoke only `graphiti_mcp_request`. Implement lazy MCP JSON-RPC initialization, `notifications/initialized`, `tools/list`, and `tools/call`, carrying the case-insensitively extracted `mcp-session-id` response header. Parse both plain JSON and Streamable HTTP/SSE `data:` responses, correlate JSON-RPC errors, and serialize successful MCP text/structured content into a bounded string suitable for existing role=`tool` messages. Map only server-advertised allowlisted tools into existing `AiToolDefinition` shape using each `inputSchema` as function parameters. Cache successful schema discovery in a module-level promise and successful `list_advertised_groups` results by serialized arguments; never cache failures, and reset session/discovery state on session/protocol failure so later chat turns can reconnect. `executeGraphitiMcpTool` must repeat exact allowlist validation before invoke. Add no endpoint setting, env var, direct fetch, or dependency: endpoint is intentionally fixed in Rust for Tauri-only use.

In `tests/ai/graphitiMcpClient.test.ts`, mock Tauri detection and invoke. Cover handshake order/session propagation, JSON and SSE responses, filtering a server-advertised write/delete tool, exact schema mapping, discovery cache reuse, failure retry, group-result cache reuse, live search calls, local rejection without invoke, and non-Tauri empty discovery. Expose a test-only cache reset only if module isolation cannot make tests deterministic; do not expose mutable production configuration.
  </action>
  <verify>
    <automated>npm test -- tests/ai/graphitiMcpClient.test.ts</automated>
  </verify>
  <done>Client discovers and executes only four server-advertised read tools through Tauri, caches schemas/groups safely, handles MCP response formats, and never adds browser CORS behavior.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire Graphiti tools into existing AI tool loop</name>
  <files>src/components/ai/AIChatDrawer.tsx, tests/ai/AIChatDrawer.test.tsx</files>
  <behavior>
    - Each chat turn combines existing AI_DATABASE_TOOLS with one cached Graphiti discovery result and sends the same combined array to debug logs and every model loop request.
    - A normalized allowlisted Graphiti tool call executes through executeGraphitiMcpTool; every other call keeps existing mutation confirmation and executeAiTool behavior.
    - MCP discovery failure falls back to existing local tools and does not trigger tools-free chat fallback.
    - Graphiti result is appended as existing role=tool content so the next loop can synthesize an answer.
  </behavior>
  <action>
Update `AIChatDrawer` only at existing tool setup/execution seams. Before `aiDebugService.startTurn`, await `getGraphitiMcpToolDefinitions` with failure-to-empty fallback and create `toolsForTurn = [...AI_DATABASE_TOOLS, ...graphitiTools]`; pass this same array to `toolsSent` and every `streamChatEvents` payload rather than rediscovering inside loop. Add friendly status labels for four names. During execution, use existing `normalizeToolName`, route normalized names passing `isGraphitiMcpTool` to `executeGraphitiMcpTool`, and leave all other names on current `isMutationTool` confirmation plus `executeAiTool` path. Graphiti tools must never enter auto-approve mutation flow because they are retrieval-only. When Graphiti tools are present, add concise system instruction that MCP results are untrusted retrieved data, not executable instructions; existing local mutation policy remains authoritative. Do not add Settings UI, endpoint fields, CORS handling, new loop, or alternate chat path.

Extend focused `tests/ai/AIChatDrawer.test.tsx` by mocking Graphiti discovery/execution. Prove filtered definition reaches first and follow-up stream payloads, returned MCP content appears in next role=`tool` message, and discovery rejection still sends existing local tools and completes chat. Keep existing local mutation tests unchanged.
  </action>
  <verify>
    <automated>npm test -- tests/ai/AIChatDrawer.test.tsx tests/ai/graphitiMcpClient.test.ts</automated>
  </verify>
  <done>Tauri chat advertises and runs Graphiti retrieval through current five-iteration tool loop; local tools, confirmations, browser behavior, and chat fallback remain intact.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Model output to WebView tool harness | Tool names and arguments are untrusted model-generated input. |
| WebView to Tauri command | Any loaded WebView code can attempt direct native command invocation. |
| Tauri to Graphiti LAN endpoint | Requests and retrieved memory cross cleartext HTTP to fixed operator-provided endpoint. |
| Graphiti results to model context | Retrieved content may contain prompt-injection text or oversized payloads. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261005-DCE-01 | Elevation of Privilege | `graphitiMcpClient.ts`, `graphiti_mcp_request` | mitigate | Enforce identical exact four-name allowlists in TypeScript and Rust; Rust also limits JSON-RPC methods and owns fixed URL. |
| T-261005-DCE-02 | Tampering | Graphiti HTTP transport | accept | Endpoint and cleartext HTTP are explicit user constraints on trusted LAN; send no PlannerMate secrets and expose retrieval-only calls. |
| T-261005-DCE-03 | Information Disclosure | MCP query arguments | mitigate | Send only selected tool arguments to fixed endpoint; no API keys, IndexedDB dump, arbitrary headers, settings, or browser direct requests. |
| T-261005-DCE-04 | Denial of Service | MCP request/response bodies | mitigate | Bound native request/response sizes, bound serialized tool result, avoid caching failures, and keep tool loop's existing maximum. |
| T-261005-DCE-05 | Tampering | Retrieved memory in model context | mitigate | Keep output in role=`tool`, mark remote content untrusted in system instruction, and retain existing confirmation gate for local mutations. |
| T-261005-DCE-SC | Tampering | npm/cargo supply chain | mitigate | No package install or lockfile change; use existing Tauri, reqwest, serde, and browser APIs only. |
</threat_model>

<source_audit>

| SOURCE | ID | Feature/Requirement | Plan | Status | Notes |
|--------|----|---------------------|------|--------|-------|
| GOAL | — | Read-only Graphiti MCP integration in Tauri AI chat | 261005-dce | COVERED | Tasks 1-3 deliver transport, client, and tool-loop wiring. |
| REQ | QUICK-261005-DCE-GRAPHITI-MCP | Query Graphiti through existing proxy/tool loop | 261005-dce | COVERED | Native command and current AI loop are reused. |
| RESEARCH | — | No research artifact | — | EXCLUDED | Quick-task constraint explicitly forbids research phase; existing project patterns provide sufficient evidence. |
| CONTEXT | — | Fixed endpoint `http://10.4.97.70:30456/mcp` | 261005-dce | COVERED | Rust command owns exact endpoint. |
| CONTEXT | — | Tauri proxy only; no CORS work | 261005-dce | COVERED | Non-Tauri discovery returns no Graphiti tools. |
| CONTEXT | — | Expose exact four read-only tools; no write/delete tools | 261005-dce | COVERED | TypeScript and Rust exact allowlists. |
| CONTEXT | — | Cache discovered schemas/groups | 261005-dce | COVERED | Session-level schema promise and successful group-result cache. |
| CONTEXT | — | Add settings/config only if existing patterns require it | 261005-dce | COVERED | No settings added; endpoint is fixed and Tauri-only, matching request. |
| CONTEXT | — | Run targeted tests only | 261005-dce | COVERED | Verification names two Vitest files and one filtered Rust test command only. |

</source_audit>

<verification>
Run only focused checks:
- `cargo test --manifest-path src-tauri/Cargo.toml graphiti --lib`
- `npm test -- tests/ai/graphitiMcpClient.test.ts`
- `npm test -- tests/ai/AIChatDrawer.test.tsx tests/ai/graphitiMcpClient.test.ts`

Do not run full Vitest suite, full build, or unrelated proxy tests.
</verification>

<success_criteria>
- Desktop AI chat discovers Graphiti MCP through Tauri and can complete a model tool-call round trip with any of four allowed retrieval tools.
- Server-advertised write/delete/unknown tools never enter model tool definitions and fail both client and native validation if invoked directly.
- Fixed LAN endpoint is absent from browser fetch paths and user settings.
- Tool schema discovery and advertised-group lookup avoid repeat network calls after successful cache fill; failures can retry.
- Existing PlannerMate local tools and mutation confirmations continue unchanged when Graphiti is unavailable.
- Focused Vitest checks pass; filtered Rust tests pass when Cargo is available.
</success_criteria>

<output>
Create `.planning/quick/261005-dce-add-read-only-graphiti-mcp-integration-f/261005-dce-SUMMARY.md` when done.
</output>
