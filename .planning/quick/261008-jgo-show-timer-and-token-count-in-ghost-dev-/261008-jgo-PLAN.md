---
phase: quick-261008-jgo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/agentMetrics.ts
  - src/utils/__tests__/agentMetrics.test.ts
  - src/components/agents/AgentTerminalLog.tsx
  - src/views/AgentControlView.tsx
autonomous: true
requirements: [QUICK-GHOST-DEV-METRICS]
must_haves:
  truths:
    - Live elapsed timer counts seconds while agent is running or thinking
    - Token count parses and accumulates tokens across stream chunks and turn results
    - Running banner and terminal header display live duration and token count in Claude Code style
    - Completed status preserves final execution duration and accumulated tokens
  artifacts:
    - src/utils/agentMetrics.ts
    - src/utils/__tests__/agentMetrics.test.ts
  key_links:
    - AgentControlView connects activeSession startedAt/finishedAt into AgentTerminalLog
    - AgentTerminalLog calculates live timer and tokens using agentMetrics utilities
---

<objective>
Display live timer and token count in Ghost Dev running agent in Claude Code style.

Purpose: Provide real-time visibility into agent execution duration and token consumption while running, and preserve final metrics on completion.
Output: Helper utilities for token extraction and duration formatting, integrated into AgentTerminalLog and AgentControlView with live update intervals.
</objective>

<execution_context>
@.planning/STATE.md
@src/types/agent.ts
@src/components/agents/AgentTerminalLog.tsx
@src/views/AgentControlView.tsx
</execution_context>

<context>
Ghost Dev runs Claude Code agents via Tauri background process streaming chunks formatted in stream-json.
Chunk events contain token usage inside `val.usage` (input_tokens, output_tokens, cache tokens) and turn `result` events containing `duration_ms` and `usage`.
AgentTerminalLog currently computes static metrics only when turn `result` is received, leaving the running indicator without live duration or token accumulation.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create agentMetrics utility and unit test suite</name>
  <files>src/utils/agentMetrics.ts, src/utils/__tests__/agentMetrics.test.ts</files>
  <behavior>
    - Test extractTokenCount: handles val.usage, val.total_tokens, val.message.usage, and sums input/output/cache tokens safely
    - Test calculateSessionTokens: accumulates tokens across stream-json chunks (result events, assistant messages, deltas) without double counting
    - Test formatDuration: formats seconds into `14s` when under 60 seconds and `1m 24s` when over 60 seconds
    - Test formatTokenCount: formats numbers into readable Claude Code strings like `850 tokens`, `3.2k tokens`, `124k tokens`
  </behavior>
  <action>
    Create src/utils/agentMetrics.ts exporting pure functions:
    - `extractTokenCount(val: Record<string, unknown>): number | null`: parses total_tokens, tokens, val.usage (input, output, cache_read, cache_creation), or val.message.usage.
    - `calculateSessionTokens(logs: GhostDevStreamChunk[]): number`: scans stream logs, aggregates tokens from turn `result` events and current turn's latest message usage, avoiding duplicate counting of the same turn.
    - `formatDuration(seconds: number): string`: converts elapsed seconds to concise string (`14s`, `2m 05s` or `1m 24s`).
    - `formatTokenCount(tokens: number): string`: converts token integer to string (`${n} tokens` or `${(n/1000).toFixed(1)}k tokens`).
    Create src/utils/__tests__/agentMetrics.test.ts with tests for edge cases, null handling, and formatting rules.
  </action>
  <verify>
    <automated>npx vitest run src/utils/__tests__/agentMetrics.test.ts</automated>
  </verify>
  <done>
    Unit tests pass for all token extraction, session calculation, and duration/token formatting functions.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire live timer and token metrics in AgentTerminalLog and AgentControlView</name>
  <files>src/components/agents/AgentTerminalLog.tsx, src/views/AgentControlView.tsx</files>
  <action>
    1. In src/views/AgentControlView.tsx:
       - Pass `startedAt={activeSession.startedAt}` and `finishedAt={activeSession.finishedAt}` to `AgentTerminalLog`.
    2. In src/components/agents/AgentTerminalLog.tsx:
       - Add optional `startedAt?: string` and `finishedAt?: string` to `AgentTerminalLogProps`.
       - Add state for `liveElapsedSec` updated via `setInterval` (every 1s) when `isRunning || isThinking` is true.
       - Base timer start time on `startedAt`, or latest prompt feedback send time, or first log timestamp. Freeze timer on finish using `finishedAt` or latest result duration.
       - Compute live tokens using `calculateSessionTokens(filteredLogs)`.
       - In terminal header next to title/line count, display live status badge: e.g. `<Tag color="blue"><LoadingOutlined spin /> {formatDuration(elapsed)} • {formatTokenCount(tokens)}</Tag>` when running, or `<Tag color="default"><CheckCircleOutlined /> {formatDuration(finalSec)} • {formatTokenCount(finalTokens)}</Tag>` when done.
       - In running status banner (`isThinking`): show `Claude AI đang xử lý / suy nghĩ... (${formatDuration(elapsed)} • ${formatTokenCount(tokens)})`.
       - In finished status banner: show completed duration and final tokens consistently using the calculated metrics.
  </action>
  <verify>
    <automated>npx vitest run src/utils/__tests__/agentMetrics.test.ts && npm run build</automated>
  </verify>
  <done>
    AgentTerminalLog updates timer and token count every second during agent execution and displays Claude Code style metrics in both header and status banner. TypeScript build succeeds without errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Stream Chunk JSON | Untrusted or malformed JSON from process stdout crosses into UI parser |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-01 | Denial of Service | agentMetrics.ts | low | mitigate | Wrap JSON parsing and token summation in try-catch blocks with defensive type guards and null coalescence |
| T-Q-02 | Tampering | AgentTerminalLog.tsx | low | mitigate | Validate timestamp strings with Date.parse and clamp negative elapsed values to 0 |
| T-Q-SC | Tampering | npm dependencies | high | accept | No new npm dependencies added; relies purely on existing stdlib and React hooks |
</threat_model>

<verification>
Run test suite and verify build:
`npx vitest run src/utils/__tests__/agentMetrics.test.ts && npm run build`
</verification>

<success_criteria>
Ghost Dev terminal log displays real-time timer and accumulated token count when Claude agent is executing, and preserves final duration and tokens on completion.
</success_criteria>

<output>
Execution produces updated AgentTerminalLog and AgentControlView with tested agentMetrics helper.
</output>
