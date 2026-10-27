---
status: awaiting_human_verify
trigger: "AI chat MCP retrieval không tìm ra bảng ISS_CARD_NUMBER khi hỏi 'trường nào lưu số thẻ'. Khi hỏi trực tiếp 'bảng ISS_CARD có lưu số thẻ không' thì trả lời đúng và có nêu ISS_CARD_NUMBER. Nghi vấn retrieval/routing nông, không khai thác sâu MCP. Branch: fix/ai-chat-retrieval-routing"
created: 2026-10-26
updated: 2026-10-26
goal: find_and_fix
---

# AI Chat MCP Shallow Table Retrieval

## Symptoms

- Expected: A generic "where is X stored / which field stores X" question (e.g. `trường nào lưu số thẻ`) should surface the owning table(s) — including `MAIN1.ISS_CARD_NUMBER` whose summary literally reads "Card numbers are stored here".
- Actual: The grounded answer lists only columns that happen to be named/labelled like CARD_NUMBER/PAN (`POS_BATCH_DETAIL.CARD_NUMBER`, `ACI_ATM_SETL_TTL.HEADX_CRD_PAN`, `DIN_CARD.MERCHANT_PAN`, `T_DC_FILE_POS.PAN`). `ISS_CARD_NUMBER` is never cited.
- Contrast: An explicit table question (`bảng iss_card có lưu số thẻ không`) works — it answers correctly and even mentions `ISS_CARD_NUMBER` via `CARD_ID`.
- Errors: No visible error. MCP calls succeed (HTTP 200). Retrieve returns `SEED_ONLY` with 9 items in both runs.
- Timeline: Unknown; not tracked.
- Reproduction: Enable `graphiti-banking` MCP, ask `trường nào lưu số thẻ`, then ask `bảng iss_card có lưu số thẻ không`. Compare MCP `tools/call` sequences.

## Evidence

- timestamp: 2026-10-26T00:00:00Z
  observation: |
    Failing HAR `docs/tauri.localhost_fail_query_card_number.har` MCP calls:
      turn1 list_advertised_groups({})
      turn2 search_nodes {query:"card number PAN", entity_types:["Column","Table"], max_nodes:10}
      turn3 search_nodes {query:"PAN", entity_types:["Column"], max_nodes:10}
      turn4 done:true, toolCalls:[]
    Every node returned was a `Column` — 0 `Table` nodes were returned despite Table being in entity_types on turn 2. `ISS_CARD_NUMBER` never appears.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    Passing HAR `docs/tauri.localhost_fail_query_card_number_2.har` MCP calls:
      turn1 list_advertised_groups({})
      turn2 search_nodes {query:"ISS_CARD", entity_types:["Table","Column"], max_nodes:15}
           → returns TABLE::BO::SHB.MAIN1.ISS_CARD plus COLUMN::...ISS_CARD_NUMBER.CARD_ID
      turn3 get_catalog_object_context(ISS_CARD) + 2 neighbor pages
           → neighbors expose ISS_CARD_NUMBER
    Answer then correctly cites `ISS_CARD_NUMBER` via `CARD_ID`.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    Live MCP probe (this session): `search_nodes{query:"card numbers are stored here", entity_types:["Table"]}` returns `TABLE::BO::SHB.MAIN1.ISS_CARD_NUMBER` at rank 2. So the table IS reachable — the failing run simply never issued a Table-scoped or summary-worded search.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    `search_nodes` with mixed `entity_types:["Column","Table"]` and query `card number PAN` ranks Columns overwhelmingly; Tables are drowned out by similarly-named columns from DIN_CARD/BGN_CARD/TIE_CARD/etc.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    Planner prompt is in `src/services/ai/mcpRetrievalRunner.ts:251-285`. It has a "Granularity Rule" that pushes drill-down into known containers, but nothing that says "when the question is *where is data stored* and only columns were returned, you MUST search Table entities separately and/or inspect the owning table's neighbors". Turn budget is 4 (`MAX_RETRIEVAL_TURNS`), and the failing run exhausted it.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    Server instruction `DEFAULT_GRAPHITI_INSTRUCTION` (`src/services/ai/mcpClient.ts:21-34`) step 2 tells the planner to pass `entity_types ['Table','Column','View']` but gives no guidance for reverse lookup (column → owning table → sibling tables).
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    `get_catalog_object_context` neighbors on `ISS_CARD` DO expose `ISS_CARD_NUMBER`. This is the missing drill-down that the failing planner never attempted because it never found a Table node to anchor on.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    Live probe (Table-only `search_nodes`, group catalog-prod-20260802T070246Z):
      query "card number PAN"                  → ISS_CARD_NUMBER MISS at 25 nodes, rank 31 at 50 nodes
      query "card number column"               → ISS_CARD_NUMBER rank 2
      query "which field stores the card number" → ISS_CARD_NUMBER rank 1
      query "trường nào lưu số thẻ"             → ISS_CARD_NUMBER rank 3
      query "card numbers are stored here"     → ISS_CARD_NUMBER rank 2
    Column-only "card number PAN" returns 10 columns, zero tables. Mixed ["Column","Table"] returns 1 table (T_DC_FILE_POS) at rank 5 of 15.
    English keyword salad is hostile to table retrieval; "card number column" or the natural question phrasing works.
    Implication: container-scoped re-query with the user's own phrasing (not a shortened keyword) recovers the owning table. The failing run's turn 3 ("PAN", Column-only) was the decisive wrong move.
- timestamp: 2026-10-26T00:00:00Z
  observation: |
    `get_catalog_object_context {group_ids, object_name}` returns validation_error — the tool's real argument shape differs (system_key/graph_key wrapper). Planner cannot rely on a guessed shape; the runner prompt already requires schema conformance. Not the root cause; noted so a fix does not depend on that call succeeding.

## Current Focus

- hypothesis: CONFIRMED. Recovery path from column-only evidence was missing at two layers: (1) planner system prompt had only a container→detail granularity rule, no detail→container (reverse) lookup rule; (2) server instruction step 2 pushed one mixed `entity_types ['Table','Column','View']` search, which is column-dominated, and never told the planner to re-run Table-only for "where is X stored" questions. Within the 4-turn budget the owning table was never retrieved.
- test: Fixed at both layers and unit-tested; live end-to-end chat run pending user verification.
- expecting: A generic "where is X stored" question now produces a Table-scoped `search_nodes` and the answer cites the owning table (`ISS_CARD_NUMBER`).
- next_action: User re-runs `trường nào lưu số thẻ` in the app with graphiti-banking enabled and reports whether `ISS_CARD_NUMBER` is cited.
- reasoning_checkpoint:
  hypothesis: The "where is data stored" question fails because the MCP planner only searches mixed Column+Table entity types, where columns dominate rankings, and never re-queries scoped to container types, so within 4 turns the owning table is never retrieved.
  confirming_evidence:
    - Failing HAR: turns 2 and 3 both returned 0 tables (mixed query "card number PAN" returned 1 table at rank 5; "PAN" Column-only returned 0 tables). ISS_CARD_NUMBER absent from all 20 nodes.
    - Live MCP probe: Table-only "trường nào lưu số thẻ" ranks ISS_CARD_NUMBER #3; "card number column" #2; "which field stores the card number" #1. Mixed ["Column","Table"] "card number PAN" buries it — MISS at 25 nodes, rank 31 at 50 nodes.
    - Passing HAR works because it happens to search Table-scoped with "ISS_CARD".
    - Planner prompt inspected: rule 3 only covered container→detail; nothing covered detail→container.
  falsification_test: If a plan that issues a Table-scoped search for the generic phrasing still fails to return ISS_CARD_NUMBER within 10 nodes, the hypothesis is wrong.
  fix_rationale: Both edits target the same decision point — the planner's choice of entity_types. Rule 4 forbids `done: true` while only detail entities were retrieved and mandates a container-scoped re-query using the user's own phrasing (probe shows shortening to a bare keyword is what killed table ranking). Server instruction step 2b makes the same requirement explicit in the server-level workflow. Neither hard-codes any table name.
  blind_spots: End-to-end LLM-run planner behaviour not yet verified against a live model; the planner may still choose to ignore rule 4, and the 4-turn budget was not raised (the failing run already spent a turn on a useless Column-only search, so rule 4 substitutes an existing turn rather than adding one — if the planner now also keeps its bad turn 3, budget may be tight).
- tdd_checkpoint:

## Resolution

root_cause: The MCP retrieval planner never searched container entities for "where is X stored" questions. Both the planner system prompt (`mcpRetrievalRunner.ts`) and the server instruction (`mcpClient.ts` DEFAULT_GRAPHITI_INSTRUCTION) directed one mixed Column+Table search plus column drill-down. Columns vastly outnumber tables and dominate graph search rankings, so in the failing run all 20 retrieved nodes were columns and the owning table `MAIN1.ISS_CARD_NUMBER` was never reachable within the 4-turn budget.
fix: Added rule 4 "REVERSE LOOKUP (Where-Is-It-Stored Rule)" and completion criterion (c) to the planner system prompt, plus Step 2b to DEFAULT_GRAPHITI_INSTRUCTION — both require a container-scoped (`entity_types: ["Table"]`) re-query using the user's own phrasing, and forbid `done: true` while only detail entities have been retrieved.
verification: 14/14 tests in `tests/ai/mcpRetrievalRunner.test.ts` pass including new prompt-contract test; `mcpClient`/`mcpEvidence` tests pass; `npx tsc --noEmit` clean. Live MCP probe confirms table-only search recovers ISS_CARD_NUMBER. End-to-end chat run awaiting user confirmation.
files_changed:
  - src/services/ai/mcpRetrievalRunner.ts
  - src/services/ai/mcpClient.ts
  - tests/ai/mcpRetrievalRunner.test.ts

## Eliminated

- hypothesis: MCP call failed or was suppressed.
  reason: All MCP `tools/call` requests return HTTP 200 with real results.
- hypothesis: Evidence normalization dropped the table record.
  reason: The table record was never retrieved in the failing run, so nothing was there to drop.
- hypothesis: Table not in graph.
  reason: Direct live `search_nodes` returns it immediately.
- hypothesis: Raising `max_nodes` on the mixed search would have recovered the table.
  reason: Table-only "card number PAN" at max_nodes=50 puts ISS_CARD_NUMBER at rank 31; mixed search ranks it lower still. Volume alone does not fix it — entity-type scoping does.
- hypothesis: `get_catalog_object_context` neighbor drill-down is required.
  reason: Live probe shows the generic phrasing reaches ISS_CARD_NUMBER directly in a Table-only search (rank 1-3). Drill-down is a fallback, not the fix.
