---
phase: quick
plan: 261125-gyl
subsystem: ai
tags: [graphiti, mcp, sha256, rules, team-prompts, settings]
requires:
  - phase: existing-mcp-instruction-path
    provides: "getEnabledMcpInstructions(db), per-server instruction field, getMcpServers/saveMcpServers, mcpEnabled gate"
provides:
  - "Two SHA-256 verified rule files bundled under public/ai-rules plus a checksum manifest"
  - "graphitiRules.ts loader/apply service: verify before write, single read-modify-write of mcp_servers"
  - "Dynamic MCP instruction segment injected into team lead and employee prompts, gated by liveTeam.mcpEnabled"
  - "Settings > MCP card action applying verified rules with success/error reporting"
affects: [ai-chat, ai-office-team-chat, settings-mcp]
actuals:
  tokens: 9727
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - "Bundled static rule text verified via Web Crypto SHA-256 against a SHA256SUMS manifest before any settings write"
    - "One getMcpServers -> modify in memory -> saveMcpServers cycle for multi-row MCP config updates"
    - "Coordinator-built trusted instruction segment appended after pinned context in both team prompt builders"
key-files:
  created:
    - public/ai-rules/graphiti/graphiti-mcp-rules.md
    - public/ai-rules/graphiti-sql/sql-agent-memory-prompt.md
    - public/ai-rules/SHA256SUMS
    - src/services/ai/graphitiRules.ts
    - src/services/ai/__tests__/graphitiRules.test.ts
  modified:
    - src/services/ai/office/teamPrompts.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamPrompts.test.ts
    - src/components/settings/McpConfigCard.tsx
    - tests/components/settings/McpConfigCard.test.tsx
key-decisions:
  - "Verified rule bytes, not a hard-coded string literal, are the single source of Graphiti/SQL instruction text"
  - "graphiti-banking instruction = shared rules + blank line + SQL rules; svng-source instruction = shared rules only (it reads source code, not SQL schema)"
  - "svng-source URL stays empty or user-supplied; the service never embeds an endpoint and avoids upsertMcpServer because sanitizeUrl rejects an empty URL"
  - "Team MCP instruction segment is fetched once per turn via getEnabledMcpInstructions(db), gated by mcpEnabled !== false, with read failure degrading to no segment"
patterns-established:
  - "Rule text lives in static files; TypeScript only references paths and hashes from the manifest"
  - "Verification failure leaves mcp_servers byte-identical"
requirements-completed: [GRAPHITI-RULES-01, GRAPHITI-RULES-02, GRAPHITI-RULES-03]
coverage:
  - id: D1
    description: "Bundled rule files with exact SHA-256 hashes and a repo-relative checksum manifest"
    requirement: GRAPHITI-RULES-01
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/graphitiRules.test.ts#returns both verified texts and applies them to the two MCP configs"
        status: pass
      - kind: other
        ref: "cd public/ai-rules && shasum -a 256 -c SHA256SUMS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Apply action verifies hashes first and writes both MCP rows atomically; svng-source gets no invented URL"
    requirement: GRAPHITI-RULES-01
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/graphitiRules.test.ts#throws on a tampered rule body and leaves mcp_servers byte-identical"
        status: pass
      - kind: unit
        ref: "src/services/ai/__tests__/graphitiRules.test.ts#preserves an existing graphiti-banking row and an existing svng-source URL"
        status: pass
    human_judgment: false
  - id: D3
    description: "Team lead and employee prompts carry the same dynamic MCP instruction string, gated by team mcpEnabled"
    requirement: GRAPHITI-RULES-02
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamPrompts.test.ts#dynamic MCP instructions segment"
        status: pass
    human_judgment: false
  - id: D4
    description: "Settings MCP card has one action applying verified rules and surfaces verification errors without mutating settings"
    requirement: GRAPHITI-RULES-03
    verification:
      - kind: unit
        ref: "tests/components/settings/McpConfigCard.test.tsx#applies verified Graphiti/SQL rules and refreshes the rendered list"
        status: pass
      - kind: unit
        ref: "tests/components/settings/McpConfigCard.test.tsx#shows verification errors without changing the rendered server list"
        status: pass
    human_judgment: false
duration: ~12min
completed: 2026-11-25
status: complete
---

# Quick 261125-gyl: Integrate Graphiti and Graphiti-SQL rules via dynamic MCP instructions Summary

**Bundled SHA-256 verified Graphiti/SQL rule text now feeds AI Chat and AI Office team prompts, with a Settings apply action that refuses to write mcp_servers on any hash mismatch.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3
- **Files modified:** 10
- **Commits:** 5

## Accomplishments

- Copied both rule files verbatim from the extracted bundle (5770 + 6138 bytes) into `public/ai-rules/` and published exact bundled digests in `SHA256SUMS`.
- Added `graphitiRules.ts`: base-path-safe fetch, Web Crypto SHA-256 verification, descriptive failures, and one read-modify-write of `mcp_servers` for both rows.
- Correct rule mapping per user clarification: `graphiti-banking` gets shared rules + blank line + SQL rules; `svng-source` gets shared rules only, URL never fabricated.
- Injected the coordinator's `getEnabledMcpInstructions(db)` string after pinned context into both team prompt builders, gated by `liveTeam.mcpEnabled`, with read failures degrading to no segment.
- Added the Settings MCP card "Áp dụng luật Graphiti/SQL" button with success/error feedback and a note that svng-source still needs a URL.

## Task Commits

1. **Task 1 RED** - `09f67c70` (test): failing tests for verified rule loader + bundled rule files
2. **Task 1 GREEN** - `4cbf8601` (feat): SHA-256 rule loader and MCP config apply
3. **Task 2 RED** - `84fbb293` (test): failing tests for team prompt MCP injection
4. **Task 2 GREEN** - `8f895fb5` (feat): team prompt injection and first rule mapping
5. **Task 3** - `f1d444d7` (feat): Settings apply action + corrected rule-to-server mapping

## Files Created/Modified

- `public/ai-rules/graphiti/graphiti-mcp-rules.md` - verbatim shared Graphiti rule text (5770 bytes)
- `public/ai-rules/graphiti-sql/sql-agent-memory-prompt.md` - verbatim SQL memory prompt (6138 bytes)
- `public/ai-rules/SHA256SUMS` - two exact bundled digests, repo-relative paths
- `src/services/ai/graphitiRules.ts` - fetch, verify, and apply service
- `src/services/ai/__tests__/graphitiRules.test.ts` - 5 cases covering hashes, tampering, field preservation, URL handling, BASE_URL
- `src/services/ai/office/teamPrompts.ts` - optional `mcpInstructionsSegment` in both builders
- `src/services/ai/office/teamRunCoordinator.ts` - gated fetch of dynamic instructions on both turn paths
- `tests/services/ai/office/teamPrompts.test.ts` - two focused injection cases
- `src/components/settings/McpConfigCard.tsx` - apply button, handler, explanatory paragraph
- `tests/components/settings/McpConfigCard.test.tsx` - success and rejection cases with mocked helper

## Decisions Made

- Keep `DEFAULT_GRAPHITI_INSTRUCTION` in `mcpClient.ts` byte-identical for backward compatibility; the Apply action replaces it with verified text.
- Use `saveMcpServers` directly instead of `upsertMcpServer` for both rows, since `sanitizeUrl` would reject an empty svng-source URL.
- Preserve all existing MCP row fields except `instruction`; seed `graphiti-banking` from `DEFAULT_MCP_SERVERS[0]` if absent.
- Use conditional spreads for the optional segment so `exactOptionalPropertyTypes` never sees an explicit `undefined`.

## Deviations from Plan

### Instruction-driven corrections

**1. User correction (via coordinator): rule-to-server mapping**
- **Found during:** Task 2 completion
- **Issue:** First correction said svng-source should get shared + SQL; final user correction reversed it: graphiti-banking gets both, svng-source gets only shared rules because it reads source code.
- **Fix:** `graphitiRules.ts` builds `graphitiInstruction = shared + '\n\n' + sql`; svng-source keeps only `graphitiRules`. Tests updated for both rows.
- **Committed in:** `f1d444d7`

### Auto-fixed Issues

**1. [Rule 1 - Bug] Web Crypto guard returned object without `digest`**
- **Found during:** Task 1 GREEN
- **Issue:** `webCrypto()` returned `globalThis.crypto` when only `subtle` existed in the jsdom test environment, causing `digest is not a function`.
- **Fix:** Guard now returns `{ subtle }` and calls `.subtle.digest(...)`.
- **Committed in:** `4cbf8601`

**2. [Rule 1 - Bug] Settings test mock missing App context methods**
- **Found during:** Task 3 RED
- **Issue:** `useMessage()` reads `AntApp.useApp().message`; partial-mocking only antd static `message` left `message.error` undefined in toggles test.
- **Fix:** Mocked `App.useApp()` to return message spies; also made the timerPopout mock partial to preserve other exports.
- **Committed in:** `f1d444d7`

**Total deviations:** 2 auto-fixed bugs + 1 user-driven mapping correction.
**Impact on plan:** All changes required for correctness; no scope creep, no new dependencies.

## Issues Encountered

- Test fixture initially used an 8-character hex digest; changed to a full 64-character zero digest so the manifest parser accepted it.
- No full `npm test` per project rule; only targeted files plus `tsc --noEmit` were run.

## Verification

- `npx vitest run src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts --bail=1` — 14 passed
- `npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts --bail=1` — 270 passed
- `npx vitest run tests/components/settings/McpConfigCard.test.tsx --bail=1` — 6 passed
- `npx tsc --noEmit` — clean
- `cd public/ai-rules && shasum -a 256 -c SHA256SUMS` — both OK
- Grep proofs: no `claude mcp add`, no embedded svng URL, no rule text literal in TypeScript, no changes to `CLAUDE.md` or `.claude/skills/`

## User Setup Required

None. svng-source URL remains blank by design and can be filled through the existing edit form.

## Next Phase Readiness

Ready. No blockers. No PWA/GitHub Pages behavior touched.

---
*Phase: quick*
*Completed: 2026-11-25*

## Self-Check: PASSED

All 6 created/modified files exist and all 5 task commits are present in git history.
