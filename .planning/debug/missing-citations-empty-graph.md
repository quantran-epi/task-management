---
status: awaiting_human_verify
trigger: "tính năng AI chat, khi hỏi câu hỏi có kết quả truy vấn graph, UI hiển thị response kèm trích dẫn. Khi câu hỏi không có kết quả graph, chỉ có vector và full search, Ui hiển thị response không có trích dẫn, cần fix. chi tiết trace các request mà frontend thực hiện lần lượt từ retrieve đến 4 lần gọi LLM nằm trong @sample_ai_chat_turn/ui-inspect/sample.txt"
created: 2026-10-17T15:00:00Z
updated: 2026-10-17T15:50:00Z
---

## Current Focus

hypothesis: "When retrieval returns empty graph results, vector and fulltext retrieve up to 32 (or up to 50) chunks. ChatMessageGroundingSchema in groundedAnswerSchemas.ts strictly enforced 'citations: z.array(PersistedCitationSchema).max(20)'. When saveMessage() was called, ChatMessageGroundingSchema.safeParse threw 'Too big: expected array to have <=20 items', causing AIChatDrawer to silently fall back to the ungrounded operational tool loop (Requests 2, 3, 4 in sample.txt), which answered without citations. Furthermore, ChatMessageBubble regex failed to split multi-citations in single brackets such as '[S24, S25]' into separate interactive chips."
test: "1) Unit test in tests/ai/groundedAnswerSchemas.test.ts verifies ChatMessageGroundingSchema allows 32 citations. 2) Unit test in tests/ai/ChatMessageBubble.test.tsx verifies multi-citations '[S1, S2]' split and render as chips [1] and [2]. 3) Full build and test suite passes."
expecting: "Grounded answer with 32 citations saves without schema error, does not trigger operational loop fallback, and renders all citations including [S24, S25] as interactive chips."
next_action: "Await human verification to confirm interactive chips and document tags appear in user workspace."

reasoning_checkpoint:
  hypothesis: "ChatMessageGroundingSchema.citations.max(20) rejected retrieval results with >20 items (sample.txt had 32 chunks), causing saveMessage to throw and AIChatDrawer to silently fall back to operational loop (Request 2, 3, 4) with zero citations. Also ChatMessageBubble regex failed to split multi-citations like [S24, S25]."
  confirming_evidence:
    - "sample.txt has 32 chunk items returned by retrieveFederated."
    - "GroundedAnswerSchemaV2 and closure validation on Response 1 passed completely on attempt 1."
    - "ChatMessageGroundingSchema.safeParse failed with 'Too big: expected array to have <=20 items' on the 32 citations."
    - "saveMessage in chatRepo.ts line 77 throws Error('Malformed message grounding: Too big: expected array to have <=20 items') when safeParse fails."
    - "AIChatDrawer.tsx line 893 catches the error and executes the operational loop (Request 2, 3, 4 in sample.txt)."
    - "ChatMessageBubble.tsx regex /\[(S|L)?(\d+)\]/gi ignored multi-citations like '[S24, S25]'."
  falsification_test: "Pass grounding with 32 citations to ChatMessageGroundingSchema.safeParse and render text with '[S24, S25]'. Both now pass."
  fix_rationale: "Align ChatMessageGroundingSchema limits with retrieval budgets (maxItems 50-100) and normalize multi-citations in ChatMessageBubble."
  blind_spots: "Check if other schemas in groundedAnswerSchemas.ts have restrictive .max() constraints."

## Symptoms

expected: Grounded response with interactive citation chips and document source tags displayed when graph is empty and vector/fulltext return results
actual: Operational tool loop fallback with plain text response without citations
errors: Uncaught Malformed message grounding: Too big: expected array to have <=20 items
reproduction: Query returning >20 chunks (sample.txt trace)
started: When vector+fulltext returns >20 items without graph paths

## Eliminated

- hypothesis: "Grounded synthesis LLM call failed or timed out."
  evidence: "sample.txt Response 1 returned 200 OK with valid GroundedAnswerSchemaV2 JSON on first attempt."
  timestamp: 2026-10-17T15:20:00Z

- hypothesis: "validateGroundedAnswerClosure failed on Response 1."
  evidence: "Verified closure on Response 1 in node test; valid: true, issues: []."
  timestamp: 2026-10-17T15:25:00Z

## Evidence

- timestamp: 2026-10-17T15:30:00Z
  checked: "src/services/ai/groundedAnswerSchemas.ts line 279"
  found: "citations: z.array(PersistedCitationSchema).max(20)"
  implication: "Rejects any grounding with more than 20 citations. Retrieve request allows maxItems: 50."

- timestamp: 2026-10-17T15:32:00Z
  checked: "src/db/repositories/chatRepo.ts line 77"
  found: "saveMessage calls ChatMessageGroundingSchema.safeParse; throws if invalid."
  implication: "Throws INVALID_GROUNDING when citations > 20."

- timestamp: 2026-10-17T15:35:00Z
  checked: "src/components/ai/AIChatDrawer.tsx line 855 & line 893"
  found: "saveMessage is inside try-catch. Error triggers catch block, which logs warning and proceeds to operational loop."
  implication: "Operational loop runs (Requests 2, 3, 4 in sample.txt) and overwrites the turn with ungrounded text."

- timestamp: 2026-10-17T15:38:00Z
  checked: "sample.txt Response 1 conclusion text"
  found: "Contains '[S24, S25]'"
  implication: "ChatMessageBubble regex /\[(S|L)?(\d+)\]/gi does not match multiple tags inside single brackets, leaving them unchipped."

## Resolution

root_cause: "1) ChatMessageGroundingSchema.citations was capped at max(20), while retrieve request budget specifies maxItems: 50. When graph was empty, vector + fulltext returned 32 chunks, causing ChatMessageGroundingSchema.safeParse in saveMessage() to throw 'Too big: expected array to have <=20 items'. AIChatDrawer caught this error and silently fell back to the operational tool loop (Requests 2, 3, 4 in sample.txt), discarding the grounded response and displaying ungrounded text without citations. 2) ChatMessageBubble regex /\[(S|L)?(\d+)\]/gi did not match multi-citation brackets like '[S24, S25]' from LLM output."
fix: "1) Increased ChatMessageGroundingSchema.citations from max(20) to max(100), paths from max(20) to max(50), conflicts from max(10) to max(20), coverageWarnings from max(10) to max(50). 2) In ChatMessageBubble.tsx, normalize multi-citations in brackets (e.g. '[S24, S25]' -> '[S24] [S25]') before citation tag replacement and chip injection, and in attributeLinesWithCitations."
verification: "All unit tests pass (498 tests in tests/ai/); build passes; regression tests added for 32 citations grounding schema validation and multi-tag chip replacement."
files_changed:
  - "/Users/tranducquan/Working/Personal/task-management/src/services/ai/groundedAnswerSchemas.ts"
  - "/Users/tranducquan/Working/Personal/task-management/src/components/ai/ChatMessageBubble.tsx"
  - "/Users/tranducquan/Working/Personal/task-management/tests/ai/groundedAnswerSchemas.test.ts"
  - "/Users/tranducquan/Working/Personal/task-management/tests/ai/ChatMessageBubble.test.tsx"
