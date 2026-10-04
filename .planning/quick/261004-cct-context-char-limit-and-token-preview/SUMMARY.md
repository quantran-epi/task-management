---
status: complete
date: 2026-10-04
slug: 261004-cct-context-char-limit-and-token-preview
---

# Quick Task Summary: Freely Configurable Context Char Limit with Token Preview

## Achievements
1. **Uncapped & Freely Configurable Input (`src/components/settings/NineRouterConfigCard.tsx`)**:
   - Removed the restrictive `max={32000}` limit, allowing any value up to 5,000,000 characters.
   - Added `min={1000}`, `step={1000}`, `formatter`, and `parser` for comma-separated number formatting.
   - Added `addonAfter="ký tự"`.
2. **Estimated Token Equivalent Preview & Presets (`src/components/settings/NineRouterConfigCard.tsx`)**:
   - Added live token equivalent calculation `~{Math.round(charLimit / 4).toLocaleString()} tokens (quy đổi xấp xỉ 1 token ≈ 4 ký tự)`.
   - Added quick preset tags using `Tag.CheckableTag`:
     - `12k (~3k tok) • Mặc định`
     - `32k (~8k tok) • Local vừa`
     - `128k (~32k tok) • Cân bằng`
     - `500k (~125k tok) • GPT-4o / Claude`
     - `1M (~250k tok) • Siêu lớn`
   - Added explanatory helper text describing when to pick smaller limits (local Ollama 8k–32k) vs larger limits (Claude 3.5, GPT-4o, Gemini 1M+).
3. **Tests & Build Verification**:
   - Added unit test in `tests/ai/nineRouterTokenService.test.ts` verifying support for large charLimits (500k, 1M).
   - Fixed `tests/ai/aiTools.test.ts` tool count expectation (41 tools with `read_file`).
   - Verified `npx tsc --noEmit` cleanly with `exactOptionalPropertyTypes: true`.
   - Verified `npm run build` succeeds cleanly.
