# Quick Task: 261021-mcp - Fix MCP retrieval formatting and schema wrapper handling

## Problem
In HAR traces (`tauri.localhost_3.har`), when user asked "ngày phát hành của thẻ được lưu ở đâu":
1. MCP tool `search_nodes` returned 10 nodes including `COLUMN::BO::SHB.MAIN1.ISS_CARD_INSTANCE.ISS_DATE`, but raw JSON string was ~13KB and got brutally truncated (`slice(0, 1500)`) in `evidencePack.ts` / `pruneMcpRawResult`, cutting off the exact card column and corrupting JSON syntax in the evidence pack.
2. Planner tried to drill down with `get_catalog_object_context` but failed with `validation_error` because Pydantic MCP schema expects `{ "request": { ... } }`, while LLM passed arguments flattened at top level.

## Solution
1. **Entity / Markdown Formatter (`mcpRetrievalRunner.ts`)**:
   - Detect graph/entity list responses (`nodes`, `entities`, `items`, `rows`).
   - Extract essential fields: `name`, `type/labels`, `summary/description`, `attributes` (column type, table).
   - Format into clean Markdown bullet points.
   - For non-list responses, prune internal noisy fields without breaking JSON structure.
2. **Schema Wrapper Auto-wrap (`mcpRetrievalRunner.ts` / `mcpClient.ts`)**:
   - When tool schema specifies a single required root object property (e.g. `request` or `params`), and planner LLM supplied child properties flattened at the top-level, automatically wrap them into `{ [wrapperKey]: call.args }`.
   - Update Retrieval Planner system prompt with clear schema conformance instructions.
3. **Evidence Pack integration (`evidencePack.ts`)**:
   - Allow clean markdown summary from MCP to pass into `promptEvidence` without arbitrary 1500-char truncation slicing when within overall budget.

## Tasks
- [ ] Task 1: Update `pruneMcpRawResult` and add structured entity formatter in `src/services/ai/mcpRetrievalRunner.ts`
- [ ] Task 2: Implement automatic argument wrapping in `src/services/ai/mcpRetrievalRunner.ts` (and schema conformance prompt)
- [ ] Task 3: Adjust `src/services/ai/evidencePack.ts` to cleanly pack formatted MCP items
- [ ] Task 4: Add unit tests in `tests/ai/mcpRetrievalRunner.test.ts` and verify build & tests pass
