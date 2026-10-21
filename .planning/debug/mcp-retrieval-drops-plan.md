---
status: resolved
trigger: "Thực hiện plan đã duyệt: sửa dynamic MCP retrieval để truyền instruction động của target MCP, watchdog 5 phút/user abort primary, không rơi valid plan, thêm targeted regression tests. Không hard-code Graphiti/tool names trong production."
created: 2026-10-21
updated: 2026-10-21
---

## Symptoms

### Expected behavior
Dynamic MCP planner receives each routed target server's instruction and tool schemas, respects cross-tool dependencies, executes valid planned calls, and lets user abort stop further work.

### Actual behavior
Planner omits server instruction, emits a dependent tool call before prerequisite output exists, then a 20-second runner-wide timeout can fire after corrected planning but before execution and silently drop valid calls.

### Errors
MCP validation rejects missing required dynamic arguments. Existing warning text incorrectly reports a 15-second timeout while constant is 20 seconds.

### Timeline
Observed in `docs/tauri.localhost_1.har` after recent AI request-amplification fixes. Root cause already correlated with current source and approved repair plan.

### Reproduction
Enable routed MCP and ask `ngày phát hành của thẻ được lưu ở đâu`; inspect planner responses and JSON-RPC `tools/call` sequence in HAR/debug trace.

## Current Focus

- hypothesis: Dynamic planner lacks target server instruction, and short runner-wide watchdog crosses between planner response and tool dispatch.
- test: Inject target instructions generically, use a five-minute safety watchdog with user abort primary, preserve a returned call batch, and add focused unit regressions.
- expecting: Prerequisite and dependent tools run on separate turns according to server instruction; valid returned calls are not silently dropped; abort/watchdog warnings are distinct.
- next_action: Runtime MCP verification requires the configured 9router service; code verification is complete.
- reasoning_checkpoint: Root cause confirmed; reviewed patch applied without hard-coded MCP-specific production rules.
- tdd_checkpoint: Nine targeted regression tests pass in the primary working tree.

## Evidence

- timestamp: 2026-10-21T00:00:00Z
  observation: `mcpRetrievalRunner.ts` builds planner prompt from schemas but omits `McpServerConfig.instruction`.
- timestamp: 2026-10-21T00:00:00Z
  observation: 20-second timer can abort after `completeJson` returns and before `executeDynamicMcpTool`.
- timestamp: 2026-10-21T00:00:00Z
  observation: UI already passes one turn AbortSignal through `groundedTurn` into `runMcpRetrieval`.

## Eliminated

- hypothesis: Maximum four-turn bound dropped turn-2 calls.
  reason: Every allowed turn executes its body; HAR stopped during turn 2.
- hypothesis: Dedup rejected corrected calls.
  reason: Corrected arguments changed call keys.
- hypothesis: Document retrieval consumed MCP timeout.
  reason: Document and MCP retrieval branches run concurrently with separate internal budgets.

## Resolution

- root_cause: Dynamic MCP planner omitted routed server instructions, so it could plan dependent tools before prerequisite outputs existed; the 20-second aggregate timeout could then expire after a corrected plan returned but before its calls executed.
- fix: Inject bounded instructions from enabled target MCP servers; keep orchestration generic; use a five-minute safety watchdog with user abort primary; execute a returned call batch before stopping on watchdog; execute calls even when `done` is true; retain failed attempts in planner history for repair turns.
- verification: `npx vitest run tests/ai/mcpRetrievalRunner.test.ts` passed 9/9; `npx tsc --noEmit` passed; `git diff --check` passed. Runtime UI loaded and accepted the query, but full MCP flow was blocked because configured 9router endpoint `http://localhost:20128` refused connections.
- files_changed:
  - `src/services/ai/mcpRetrievalRunner.ts`
  - `tests/ai/mcpRetrievalRunner.test.ts`
  - `.planning/debug/mcp-retrieval-drops-plan.md`
