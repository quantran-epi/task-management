# Phase 22 Plan 03: Unified Citations & UI Grounding with MCP Badges Summary

Unified multi-source citations across UI and synthesis engine with dedicated purple/geekblue badges for [M*] Live MCP tool citations and sanitized interactive observation drawer.

## Frontmatter

- **phase:** 22
- **plan:** 03
- **subsystem:** ai-grounded-chat
- **tags:** [mcp, citations, ui, synthesis, grounded-chat]
- **dependency graph:**
  - **requires:** [22-02]
  - **provides:** [MCP-SYNTH-01]
  - **affects:** [CitationChip, SourcesPanel, GroundedAnswerCard, groundedSynthesis]
- **tech-stack:**
  - **added:** none (used native Ant Design Tag, Modal, Typography)
  - **patterns:** [TDD RED/GREEN/REFACTOR, sanitized modal preview for live tool output]
- **key-files:**
  - **created:**
    - `tests/ai/CitationChip.test.tsx`
  - **modified:**
    - `src/components/ai/CitationChip.tsx`
    - `src/components/ai/grounded/CitationGroup.tsx`
    - `src/components/ai/grounded/GroundedAnswerCard.tsx`
    - `src/components/ai/grounded/SourcesPanel.tsx`
    - `src/services/ai/groundedSynthesis.ts`
    - `tests/ai/groundedSynthesis.test.ts`
- **decisions:**
  - D-04: Distinct purple badge styling and `[M*]` prefix for external MCP tool observations.
  - T-22-06: Raw MCP tool observation outputs sanitized via text string rendering and pre blocks, preventing XSS injection.
- **metrics:**
  - duration: ~15m
  - completed: 2026-10-20

## Summary of Accomplishments

1. **CitationChip & CitationGroup MCP Support:**
   - Supported `[M*]` citation tags with purple badge theme, `MCP: {toolName}` sub-label, and detailed tool/server tooltip.
   - Preserved backward compatibility for server `[N]` and local `[LN]` citations.
2. **GroundedAnswerCard Parsing:**
   - Updated citation regex in `renderProseWithCitations` to match `/\[(S\d+|L\d+|M\d+)\]/g` so `[M*]` citations render into interactive chips.
3. **SourcesPanel Live MCP Exploration:**
   - Partitioned citations into internal document sources and external `LIVE MCP` observations table.
   - Displayed server name, tool name, invocation arguments, and inspection modal with sanitized output text.
4. **groundedSynthesis System Prompt & Tolerant Normalization:**
   - Extended system prompt instructions to guide model when to cite `[M*]` for real-time facts observed from MCP tools.
   - Updated tolerant normalization to parse and extract inline `[M*]` tags and coerce claim citations cleanly without data loss.

## Deviations from Plan

None - plan executed exactly as written under TDD.

## TDD Gate Compliance

- `test(22-03): add failing component tests for MCP citations` (099031c)
- `feat(22-03): update CitationChip, GroundedAnswerCard, and SourcesPanel for [M*] citations` (4cccdf1)
- `test(22-03): add failing tests for MCP citation prompt and normalization` (db1a3b8)
- `feat(22-03): update groundedSynthesis system prompt and claim normalization for MCP citations` (33be87e)

## Verification Results

Targeted tests passed:
- `tests/ai/CitationChip.test.tsx` (3 passed)
- `tests/ai/groundedSynthesis.test.ts` (39 passed)
- `tests/ai/CitationChipAndQuickPreview.test.tsx` (24 passed)

## Self-Check: PASSED

- Found `tests/ai/CitationChip.test.tsx`
- Found commits 099031c, 4cccdf1, db1a3b8, 33be87e in git log.
