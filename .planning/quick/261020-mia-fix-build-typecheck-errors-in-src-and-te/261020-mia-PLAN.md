---
phase: quick
plan: 261020-mia
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/CitationChip.tsx
  - src/services/telegram/telegramMutationSession.ts
  - tests/ai/CitationChip.test.tsx
  - tests/ai/evaluatorCore.ts
  - tests/ai/groundedTurn.test.ts
  - tests/ai/intentRouter.test.ts
  - tests/ai/mcpClient.test.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements: [BUILD-TYPECHECK-FIX]
must_haves:
  truths:
    - "TypeScript check passes with zero errors on npx tsc -b --noEmit"
    - "All Vitest tests in tests/ai and tests/telegram pass cleanly"
    - "Production build passes with npm run build"
  artifacts:
    - path: "src/components/ai/CitationChip.tsx"
      provides: "Ant Design theme token mapping for MCP citations"
    - path: "src/services/telegram/telegramMutationSession.ts"
      provides: "Strict exactOptionalPropertyTypes compatibility for PendingMutation and clean imports"
    - path: "tests/ai/CitationChip.test.tsx"
      provides: "Valid ChatMessageGrounding mock schema and unused import cleanup"
    - path: "tests/ai/evaluatorCore.ts"
      provides: "Valid RouteIntentResult mock with require_mcp and target_mcp_servers"
    - path: "tests/ai/groundedTurn.test.ts"
      provides: "Valid RouteIntentResult mocks with require_mcp and target_mcp_servers"
    - path: "tests/ai/intentRouter.test.ts"
      provides: "Safe optional access for callArgs assertion"
    - path: "tests/ai/mcpClient.test.ts"
      provides: "Clean unused vi import removal"
    - path: "tests/telegram/telegramHeadlessWorker.test.ts"
      provides: "Mock generator yielding StreamChatChunk compatible types with exactOptionalPropertyTypes"
---

<objective>
Fix all TypeScript typecheck errors in src/ and tests/ so that `npx tsc -b --noEmit` and `npm run build` succeed with zero errors.

Purpose: Restore clean build status across both application source files and test suites after Phase 22 federated MCP integration.
Output: Zero TypeScript errors, passing tests, and green build.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/ai/CitationChip.tsx
@src/services/telegram/telegramMutationSession.ts
@tests/ai/CitationChip.test.tsx
@tests/ai/evaluatorCore.ts
@tests/ai/groundedTurn.test.ts
@tests/ai/intentRouter.test.ts
@tests/ai/mcpClient.test.ts
@tests/telegram/telegramHeadlessWorker.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix type errors and unused import in src/ without altering business logic</name>
  <files>src/components/ai/CitationChip.tsx, src/services/telegram/telegramMutationSession.ts</files>
  <action>
    1. In `src/components/ai/CitationChip.tsx`:
       - Ant Design v6 theme token does not provide `colorPurpleBg`, `colorPurple`, `colorPurpleText`, `colorPurpleBgHover`, `colorPurpleTextHover` on `GlobalToken`.
       - Cast token safely or use standard token styling with fallbacks (e.g. `(token as any).colorPurpleBg ?? '#f9f0ff'`, or standard purple hex codes / `token.colorTextSecondary` where appropriate) preserving the purple chip styling without TypeScript errors.
    2. In `src/services/telegram/telegramMutationSession.ts`:
       - Remove unused import `executeDynamicMcpTool` from line 11.
       - In `setPendingMutation` call around line 325, `serverName` is typed as `string | undefined`. Under `exactOptionalPropertyTypes: true`, assign `serverName` only if defined: `...(serverName ? { serverName } : {})`, or define `serverName: string | undefined` explicitly in `PendingMutation` interface (`serverName?: string | undefined`).
  </action>
  <verify>
    <automated>npx tsc -b --noEmit 2>&amp;1 | grep "src/" || true</automated>
  </verify>
  <done>Zero TypeScript errors under src/.</done>
</task>

<task type="auto">
  <name>Task 2: Fix type errors, unused imports, and mock schemas in tests/</name>
  <files>tests/ai/CitationChip.test.tsx, tests/ai/evaluatorCore.ts, tests/ai/groundedTurn.test.ts, tests/ai/intentRouter.test.ts, tests/ai/mcpClient.test.ts, tests/telegram/telegramHeadlessWorker.test.ts</files>
  <action>
    1. In `tests/ai/CitationChip.test.tsx`:
       - Remove unused `fireEvent` and `React` imports.
       - Fix `grounding: ChatMessageGrounding` mock object to conform to `ChatMessageGroundingSchema`: add required properties `schemaVersion: 1`, `authority: 'server'`, `paths: null`, `conflicts: null`, `scope: null`, `modalityDiagnostics: null`, `fallbackReason: 'NONE'`, `createdAt: new Date().toISOString()`.
    2. In `tests/ai/evaluatorCore.ts`:
       - Update `routeIntent` mock in `createMockDepsForCase` to include `require_mcp: false` and `target_mcp_servers: []`.
    3. In `tests/ai/groundedTurn.test.ts`:
       - Update mock returns for `routeIntent` at lines 213, 320, 591 to include `require_mcp: false` and `target_mcp_servers: []`.
    4. In `tests/ai/intentRouter.test.ts`:
       - Line 111: `const callArgs = completeJson.mock.calls[0]?.[0];` and guard `systemMessage` lookup so `Object is possibly 'undefined'` error TS2532 is resolved.
    5. In `tests/ai/mcpClient.test.ts`:
       - Remove unused `vi` import from line 1.
    6. In `tests/telegram/telegramHeadlessWorker.test.ts`:
       - Fix `mockStreamChatEvents.mockImplementationOnce` at line 1430 to yield `{ type: 'tool_calls', calls: [...] } as any` or yield chunks conforming to `StreamChatChunk` union type so `next()` iterator result matches exactOptionalPropertyTypes.
  </action>
  <verify>
    <automated>npx tsc -b --noEmit</automated>
  </verify>
  <done>Zero TypeScript errors across the entire project (both src and tests).</done>
</task>

<task type="auto">
  <name>Task 3: Verify build and test suites pass</name>
  <files>package.json</files>
  <action>
    1. Run targeted vitest tests:
       - `npm run test tests/ai/CitationChip.test.tsx`
       - `npm run test tests/ai/intentRouter.test.ts`
       - `npm run test tests/ai/groundedTurn.test.ts`
       - `npm run test tests/ai/mcpClient.test.ts`
       - `npm run test tests/telegram/telegramHeadlessWorker.test.ts`
    2. Run full production build:
       - `npm run build`
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>Build passes cleanly without errors, and targeted tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| build/compiler | Static type checking and test mock contracts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | src/ services and components | mitigate | Fix only types, token mapping, and unused imports without altering business logic |
</threat_model>

<verification>
`npx tsc -b --noEmit` exits with 0.
`npm run build` exits with 0.
</verification>

<success_criteria>
All TypeScript compilation errors resolved in src/ and tests/. Build passes cleanly.
</success_criteria>

<output>
Create .planning/quick/261020-mia-fix-build-typecheck-errors-in-src-and-te/261020-mia-SUMMARY.md when done
</output>
