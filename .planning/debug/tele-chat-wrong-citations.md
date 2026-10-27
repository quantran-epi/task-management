---
status: awaiting_human_verify
trigger: "Investigate and fix Tele Chat adding unrelated Knowledge Server source citations. Evidence: docs/tauri.localhost_tele-wrong-citation.har. Preserve existing user changes; run only targeted tests."
created: 2026-10-27
updated: 2026-10-27
---

## Symptoms

- expected: Tele Chat cites only Knowledge Server sources directly relevant to the answer.
- actual: Successful Tele Chat answers include unrelated Knowledge Server sources.
- errors: No HTTP, console, or user-visible error reported.
- timeline: Unknown.
- reproduction: Use the complete captured flow in `docs/tauri.localhost_tele-wrong-citation.har`.

## Current Focus

- hypothesis: `formatGroundedAnswerForTelegram` lists every `grounding.citations` entry (full retrieval pack) deduped by title and truncated to 5, instead of only sources the answer cites.
- test: HAR cross-check plus regression test built from HAR shapes
- expecting: filter to cited IDs removes unrelated titles
- next_action: none — fix applied, awaiting human verification in Telegram
- reasoning_checkpoint:
  - hypothesis: "Telegram formatter renders the retrieval pack, not the cited subset. PubMed: HAR reply source line = first 5 unique titles of citations array order."
  - confirming_evidence: "Entry 19 answer claims cite S10/S16/M16/M8 only; reply cites 'Phân bổ thanh toán dư nợ thẻ tín dụng' (S1), 'live-graph-fixture-objects.md' (S6/S8), C06-05, C06-03, C06-06 — i.e. first 5 unique doc titles in pack order (S1,S6,S9,S10,S11)."
  - falsification_test: "If reply title list matched only S10/S16/M16/M8 titles, hypothesis false."
  - fix_rationale: "Restore cited-only filtering already used in ChatMessageBubble.tsx:279-312, in the Telegram formatter; addresses source of display, not model."
  - blind_spots: "Only HAR repro; runtime verification in Telegram pending. Fallback when citedIds empty keeps full list (parity with UI)."
- tdd_checkpoint:

## Evidence

- timestamp: 2026-10-27
  checked: HAR entries 0/2/4/19/21 (intent, retrieve, synthesis, telegram reply)
  found: retrieve returned 59 evidence items (S1-S22, M1-M37). Synthesis answer claims cite only S10, S16, M16, M8; citationReasons keys same. Telegram reply text "Nguồn tài liệu" lists "Phân bổ thanh toán dư nợ thẻ tín dụng, live-graph-fixture-objects.md, C06-05…, C06-03…, C06-06…" = first 5 unique doc titles in pack order; MCP line lists "list_advertised_groups, search_nodes" = first 2 unique MCP titles.
  implication: retrieval and synthesis are correct; display formatter surfaces entire retrieval pack.
- timestamp: 2026-10-27
  checked: src/services/telegram/telegramHeadlessWorker.ts:435-452 vs src/components/ai/ChatMessageBubble.tsx:279-312
  found: ChatMessageBubble builds citedIds from claims.citationIds + inline tags + citationReasons keys, filters citations; Telegram formatter had no filter.
  implication: root cause = missing cited-only filter in Telegram formatter.

## Eliminated

- hypothesis: retrieval over-included unrelated documents and that is the bug
  evidence: Pack has relevant C06 docs; model cited them correctly. Unrelated titles appeared only in the rendered source list, not in claims.
  timestamp: 2026-10-27
- hypothesis: model produced wrong citations
  evidence: answer.claims citationIds and citationReasons contain only S10/S16/M16/M8.
  timestamp: 2026-10-27

## Resolution

- root_cause: `formatGroundedAnswerForTelegram` rendered `grounding.citations` (the whole 59-item retrieval pack) deduped by title and truncated to 5, so unrelated retrieval-order documents were shown as sources. UI bubble already filters to cited IDs; Telegram path did not.
- fix: Build `citedIds` from `claims[].citationIds`, inline `[S#]/[L#]/[M#]/[#]` tags in conclusion+claims, and `citationReasons` keys; filter `grounding.citations` before grouping doc/MCP titles. Empty citedIds keeps full list (UI parity).
- verification: `npx vitest run src/services/telegram/__tests__/telegramFormat.test.ts` 4/4 passed (new HAR-shape regression). `npx vitest run tests/telegram/telegramHeadlessWorker.test.ts` 37/37 passed. `npx tsc --noEmit` clean. Pending: human verify in live Telegram.
- files_changed:
  - src/services/telegram/telegramHeadlessWorker.ts
  - src/services/telegram/__tests__/telegramFormat.test.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
