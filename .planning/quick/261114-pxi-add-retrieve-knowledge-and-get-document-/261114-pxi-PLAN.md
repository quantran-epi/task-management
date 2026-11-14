---
phase: quick-261114-pxi
plan: '01'
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/chatTurnTools.ts
  - tests/ai/chatTurnTools.test.ts
autonomous: true
requirements: []
---

# Add knowledge research tools to the AI Office allowlists

AI Office leader and employees currently reach only `search_knowledge_base` (local BM25). The AI Chat panel can also call `retrieve_knowledge` (hybrid fulltext + vector + graph via the knowledge server) and `get_document_details` (full document read from `db.notes`). Add both to `EMPLOYEE_READ_ONLY_ALLOWLIST`; the lead list inherits them automatically because `LEAD_TOOL_ALLOWLIST` spreads the employee list and filters only `get_item_details`.

Both are safe to advertise unconditionally:
- `retrieve_knowledge` returns a structured error string when the knowledge server is disabled — it does not throw, so no capability probe is needed.
- `get_document_details` reads local `db.notes` only and wraps `title` / `body` / `tags` through `wrapField`, so the untrusted-data boundary holds (unlike `get_item_details`, which stays excluded from the lead list).
- Neither name is in `MUTATION_TOOLS`, so `payloadHasMutationTool` stays false.

## Tasks

<task type="auto">
  <name>Task 1: Add the two knowledge tools to the employee allowlist</name>
  <files>src/services/ai/chatTurnTools.ts</files>
  <action>
In `EMPLOYEE_READ_ONLY_ALLOWLIST`, append `'retrieve_knowledge'` and `'get_document_details'` after the existing `'search_knowledge_base'` entry, keeping `'read_file'` last. Do not touch `LEAD_TOOL_ALLOWLIST` — it spreads the employee list, so both names reach the lead payload through the existing filter (which removes only `get_item_details`). Do not touch the coordinator (`src/services/ai/office/teamRunCoordinator.ts`) — it already passes `EMPLOYEE_READ_ONLY_ALLOWLIST` into `getToolsForTurn`. Do not modify `src/services/ai/aiTools.ts`; both tool definitions and dispatch cases already exist. Extend the doc comment above the array to note the two knowledge-research tools mirror the AI Chat panel's capability.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i 'chatTurnTools' ; echo "tsc-scan-done"</automated>
  </verify>
  <done>`EMPLOYEE_READ_ONLY_ALLOWLIST` contains `retrieve_knowledge` and `get_document_details`; `LEAD_TOOL_ALLOWLIST` still excludes `get_item_details` and still includes the three team tools; no other file changed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Assert both tools reach the employee and lead payloads</name>
  <files>tests/ai/chatTurnTools.test.ts</files>
  <behavior>
    - `getToolsForTurn(true, [], EMPLOYEE_READ_ONLY_ALLOWLIST)` payload names contain `retrieve_knowledge` and `get_document_details`.
    - `getToolsForTurn(true, [], LEAD_TOOL_ALLOWLIST)` payload names contain `retrieve_knowledge` and `get_document_details`.
    - Both names are in `EMPLOYEE_READ_ONLY_ALLOWLIST` and `LEAD_TOOL_ALLOWLIST`.
    - Existing assertions still pass: employee payload has no mutation tool; lead payload has no mutation tool; `get_item_details` stays out of the lead list.
  </behavior>
  <action>
Add one `it` block to the existing `describe('chatTurnTools allowlists (D-12, D-27)')` suite, placed after the `WR-03` test. It should build both payloads with `getToolsForTurn(true, [], <allowlist>)`, map names through `normalizeToolName`, and assert `toContain('retrieve_knowledge')` and `toContain('get_document_details')` for each. Also assert both names appear in each allowlist array. Reuse the imports already at the top of the file (`getToolsForTurn`, `normalizeToolName`, both allowlist constants) — add no new imports. Do not assert an exact array length or exact contents; that would break on every future allowlist addition.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run tests/ai/chatTurnTools.test.ts</automated>
  </verify>
  <done>All tests in `tests/ai/chatTurnTools.test.ts` pass, including the new payload assertion for both allowlists.</done>
</task>

## Verification

```bash
cd /Users/tranducquan/Working/Personal/task-management
npx vitest run tests/ai/chatTurnTools.test.ts
git diff --stat
```

Expected: test file green; diff touches exactly the two files above.

## Success criteria

- AI Office leader and employee tool payloads include `retrieve_knowledge` and `get_document_details`.
- No mutation tool reaches either payload.
- `get_item_details` remains employee-only.
- Diff is limited to the allowlist array plus one test block.
