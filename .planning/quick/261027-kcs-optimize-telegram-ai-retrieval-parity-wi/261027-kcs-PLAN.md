---
phase: quick
plan: 261027-kcs
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/telegram/telegramHeadlessWorker.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements: [KCS-MIXED-GROUNDED, KCS-CLARIFY-STOP, KCS-FALLBACK-PARITY, KCS-TITLE-PARITY]
must_haves:
  truths:
    - "A mixed request runs grounded retrieval before the admin mutation turn and produces exactly one reply"
    - "Grounded evidence reaches the mutation turn as context text, not as a separately sent answer"
    - "Non-admin / mixed still receives the admin authorization refusal; no mutation preview is created"
    - "clarify_intent, clarify_entity and error grounded results send one message and never fall through to the ungrounded tool loop"
    - "Fallback tool loop runs up to 30 loops with AI-Chat-parity dynamic MCP tools merged"
    - "Every citation document title survives Telegram formatting and lossless chunk splitting"
  artifacts:
    - path: "src/services/telegram/telegramHeadlessWorker.ts"
      provides: "Shared grounded-turn helper, mixed continuation, explicit grounded-result dispatch, 30-loop MCP-parity fallback"
      contains: "maxLoops: 30"
    - path: "tests/telegram/telegramHeadlessWorker.test.ts"
      provides: "Behavioral regressions for mixed ordering, clarify/error stop, 30-loop + dynamic MCP, title survival"
      contains: "grounded before operational"
---

<objective>
Bring Telegram AI retrieval behavior to parity with AI Chat Drawer on four verified gaps, with the smallest diff confined to one service file plus its test file.

Verified facts:
- query_knowledge already inherits MCP novelty/cursor and federated budgets 200/56000 via shared groundedTurn; no duplicate test needed.
- mixed is intercepted before grounded retrieval.
- fallback loop uses maxLoops 5 and only AI_DATABASE_TOOLS.
- clarify_intent, clarify_entity, error fall through to ungrounded loop.
- source title arrays are capped despite lossless Telegram splitting.
</objective>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Grounded-first mixed routing and fallback parity</name>
  <files>src/services/telegram/telegramHeadlessWorker.ts</files>
  <action>
1. Extract existing grounded setup into module-scope `runTelegramGroundedTurn` returning `GroundedTurnResult`; reuse for mixed and query_knowledge. Keep existing AbortController signal because headless worker has no cancellation source.
2. Add `formatGroundedNonAnswer(result): string | null` for clarify_intent, clarify_entity, and error with concise Vietnamese messages; callers send/log/return so no ungrounded fall-through.
3. Split operate_taskmate and mixed behavior while preserving non-admin refusal and quota refund. For admin mixed, run grounded first. If terminal clarify/error, reply once and stop. If grounded_answer, format it and append to existing `contextText`, then invoke `executeAdminMutationTurn`; do not send grounded answer separately. Keep mutation preview/confirmation semantics.
4. Replace inline Step 6 grounded setup with helper and terminal dispatcher.
5. Change fallback `maxLoops: 5` to `30`. For `full`/`knowledge_only`, merge `discoverAllMcpTools(db)` into local tools, with warning-only discovery failure. Do not expose MCP for pure_llm/tasks_only. Leave mutation gate/read-only MCP execution intact. Add comment that there is no natural cancellation source.
6. Remove `.slice(0,3)` / title-array `.slice(0,5)` caps. Keep SEED_ONLY entity caps. Do not dump raw evidence.
  </action>
  <verify>npm test -- tests/telegram/telegramHeadlessWorker.test.ts</verify>
  <done>Mixed is grounded before mutation with one reply; clarify/error stop; fallback uses 30 loops + dynamic MCP; titles uncapped.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Focused Telegram parity regressions</name>
  <files>tests/telegram/telegramHeadlessWorker.test.ts</files>
  <action>
Add focused behavior tests using existing mocks:
- mixed grounded before operational; grounded claim reaches mutation system context; exactly one preview reply; no task written before confirmation.
- clarify_intent, clarify_entity, and ERROR_AUTH each send one useful reply and never call fallback stream.
- query_taskmate/full fallback performs 6 tool rounds then final text (proves >5) and first payload tools include mocked dynamic MCP tool.
- formatted answer with 6 distinct cited document titles contains every title after Telegram HTML conversion and splitting.
Do not duplicate shared groundedTurn budget/MCP-ID tests already in tests/ai/groundedTurn.test.ts.
  </action>
  <verify>npm test -- tests/telegram/telegramHeadlessWorker.test.ts && npx tsc --noEmit</verify>
  <done>Targeted Telegram tests and typecheck pass.</done>
</task>

</tasks>

<verification>
- npm test -- tests/telegram/telegramHeadlessWorker.test.ts
- npx tsc --noEmit
- No maxLoops: 5 remains in telegramHeadlessWorker.ts.
- No source-title caps remain; only SEED_ONLY entity caps may use slice(0,5).
- Only service + test files changed.
</verification>

<output>
Create .planning/quick/261027-kcs-optimize-telegram-ai-retrieval-parity-wi/261027-kcs-SUMMARY.md.
</output>
