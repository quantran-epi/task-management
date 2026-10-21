# Quick Task Summary: 261021-mcp - Fix MCP retrieval formatting and schema wrapper handling

**Status:** complete
**Date:** 2026-10-21

## Summary of Changes
1. **MCP Result Entity / Markdown Formatter (`src/services/ai/mcpRetrievalRunner.ts`)**:
   - Implemented `formatGraphEntity` and enhanced `pruneMcpRawResult` to detect graph entity/node list outputs (`nodes`, `entities`, `items`).
   - Formats list results as concise Markdown bullet points (e.g. `- [Entity/Column] COLUMN::BO::SHB.MAIN1.ISS_CARD_INSTANCE.ISS_DATE: Card instance issuing date`).
   - Prevents truncated JSON syntax corruption and ensures 100% of discovered database columns fit into the prompt evidence without truncation.
2. **Schema Wrapper Auto-wrap (`src/services/ai/mcpRetrievalRunner.ts`)**:
   - Implemented `adaptToolArguments` to inspect tool schema properties. If the tool expects a single root wrapper object (e.g., `request`), and flat arguments are provided by the planner LLM, it automatically wraps them into `{ [wrapperKey]: call.args }`.
   - Updated Planner system prompt with `2. SCHEMA CONFORMANCE` instruction.
3. **Evidence Pack Packing (`src/services/ai/evidencePack.ts`)**:
   - Allowed full clean MCP excerpt (up to 2,500 chars) into `promptEvidence` and citations, aligning with `pruneMcpRawResult` budget instead of premature 1,500 char slicing.
4. **Verification**:
   - Added unit test suites for `pruneMcpRawResult` and `adaptToolArguments` in `tests/ai/mcpRetrievalRunner.test.ts`.
   - All 37 AI test suites passed (534 tests).
   - TypeScript `tsc --noEmit` passed with 0 errors.
