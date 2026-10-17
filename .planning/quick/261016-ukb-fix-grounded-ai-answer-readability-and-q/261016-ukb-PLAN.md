# Quick Task 261016-ukb: Fix Grounded AI answer readability and QuickPreviewDrawer z-index under AIChatDrawer

**Quick Task ID:** 261016-ukb
**Slug:** fix-grounded-ai-answer-readability-and-q
**Date:** 2026-10-16

## Goal
Improve Grounded AI answer readability in `GroundedAnswerCard` / `ClaimBlock` and fix `QuickPreviewDrawer` z-index so clicking citations displays properly above the AI chat drawer.

## Tasks
1. **Fix z-index collision:**
   - Update `QuickPreviewDrawer.tsx` `zIndex` from `1100` to `1300` (exceeding `AIChatDrawer` `1200`).
2. **Improve Grounded answer readability & neatness:**
   - Update `GroundedAnswerCard.tsx` so the natural high-level conclusion (`conclusion`) is always displayed prominently when available, rather than being overshadowed or skipped when claims exist.
   - Update `ClaimBlock.tsx` and related styles so evidence classifications (like `OBSERVED`) and claims render in a clean, elegant card/list style with subtle indicator dots/tooltips instead of bulky raw uppercase badges everywhere.
3. **Verify tests:**
   - Run existing test suites for `GroundedAnswerCard`, `CitationChipAndQuickPreview`, and `groundedSynthesis` to ensure all functionality and contracts remain 100% green.
