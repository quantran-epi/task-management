---
phase: quick
plan: 261125-gyl
type: execute
wave: 1
depends_on: []
files_modified:
  - public/ai-rules/graphiti/graphiti-mcp-rules.md
  - public/ai-rules/graphiti-sql/sql-agent-memory-prompt.md
  - public/ai-rules/SHA256SUMS
  - src/services/ai/graphitiRules.ts
  - src/services/ai/__tests__/graphitiRules.test.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - src/components/settings/McpConfigCard.tsx
  - tests/components/settings/McpConfigCard.test.tsx
autonomous: true
requirements:
  - GRAPHITI-RULES-01
  - GRAPHITI-RULES-02
  - GRAPHITI-RULES-03
must_haves:
  truths:
    - "Settings > MCP card has a single action that verifies bundled rule files against SHA256SUMS and, only on full match, writes the shared rule text into the Graphiti server config and the SQL rule text into an svng-source server config."
    - "Any hash mismatch, missing file, or failed fetch surfaces an error and leaves mcp_servers unchanged."
    - "Team chat lead and employee prompts receive the same dynamic getEnabledMcpInstructions(db) string that the AI Chat panel already injects, gated by liveTeam.mcpEnabled."
    - "No Graphiti tool is hard-coded, no URL for svng-source is embedded, no Claude Code MCP CLI install happens, and no long rule string literal is added to TypeScript."
  artifacts:
    - path: public/ai-rules/graphiti/graphiti-mcp-rules.md
      provides: "Bundled shared Graphiti rule text (exact bytes from extracted bundle)."
    - path: public/ai-rules/graphiti-sql/sql-agent-memory-prompt.md
      provides: "Bundled Graphiti-SQL agent memory rule text (exact bytes from extracted bundle)."
    - path: public/ai-rules/SHA256SUMS
      provides: "Expected hashes of the two bundled rule files."
    - path: src/services/ai/graphitiRules.ts
      provides: "fetch + Web Crypto SHA-256 verification helper and MCP upsert action."
    - path: src/services/ai/office/teamPrompts.ts
      provides: "mcpInstructionsSegment accepted by both prompt builders."
    - path: src/services/ai/office/teamRunCoordinator.ts
      provides: "Gated fetch of dynamic MCP instructions for both lead and employee turns."
    - path: src/components/settings/McpConfigCard.tsx
      provides: "Apply Graphiti/SQL rules action in Settings."
  key_links:
    - from: src/components/settings/McpConfigCard.tsx
      to: src/services/ai/graphitiRules.ts
      via: "applyGraphitiRules(db) called from one button; returns verified rule text."
    - from: src/services/ai/graphitiRules.ts
      to: db.settings 'mcp_servers'
      via: "upsertMcpServer for graphiti-banking and svng-source, reusing existing instruction field."
    - from: src/services/ai/office/teamRunCoordinator.ts
      to: src/services/ai/mcpClient.ts
      via: "getEnabledMcpInstructions(db) fetched once per run when liveTeam.mcpEnabled !== false."
    - from: src/services/ai/office/teamRunCoordinator.ts
      to: src/services/ai/office/teamPrompts.ts
      via: "mcpInstructionsSegment passed after pinnedContextSegment in both builders."
---

<objective>

Integrate the Graphiti and Graphiti-SQL rule texts from the office bundle into TaskMate's existing dynamic MCP instruction path. Same rule text serves the AI Chat drawer and, newly, AI Office team chat (lead + employees). Rules load from bundled static files and are verified by SHA-256 before any settings write.

Purpose: The rules are domain knowledge, not code. TaskMate already has dynamic MCP discovery, per-server `instruction` injection into the single-chat prompt, and a per-team `mcpEnabled` gate. Reusing those means zero hard-coded Graphiti tool handlers, zero Claude Code CLI installs, and no `CLAUDE.md` or `.claude/skills/` changes.

Output: Two verified rule files under `public/ai-rules/`, one `graphitiRules.ts` service with tests, a Settings action, and team prompt injection with tests.

</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@CLAUDE.md
@src/services/ai/mcpClient.ts
@src/services/ai/office/teamPrompts.ts
@src/services/ai/office/teamRunCoordinator.ts
@src/components/settings/McpConfigCard.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bundle rule files and build verified rule loader service</name>
  <files>
    public/ai-rules/graphiti/graphiti-mcp-rules.md
    public/ai-rules/graphiti-sql/sql-agent-memory-prompt.md
    public/ai-rules/SHA256SUMS
    src/services/ai/graphitiRules.ts
    src/services/ai/__tests__/graphitiRules.test.ts
  </files>
  <action>
    Copy the two rule text files verbatim from the extracted bundle into `public/ai-rules/graphiti/graphiti-mcp-rules.md` (source: `.claude/skills/graphiti/references/graphiti-mcp-rules.md`, 5770 bytes) and `public/ai-rules/graphiti-sql/sql-agent-memory-prompt.md` (source: `.claude/skills/graphiti-sql/references/sql-agent-memory-prompt.md`, 6138 bytes). Use `cp`, never retype. Copy the bundle's `SHA256SUMS` content into `public/ai-rules/SHA256SUMS`, keeping only the two lines for those files and rewriting their paths repo-relative (`graphiti/graphiti-mcp-rules.md`, `graphiti-sql/sql-agent-memory-prompt.md`) with the EXACT original hex digests (`fc7e78e87b4fdbfde16a42473bd9904c93d20c4c5ca4aee4581934a1df4487b1` and `6319e57a5f669a4332f199a4defd2d66887242c6d690116e3d230ad268b37507`). Do NOT copy `SKILL.md`, `START-HERE.md`, the bundle `CLAUDE.md`, `office-claude-code-rules.updated.zip`, or any URL/credential text into the app.

    Create `src/services/ai/graphitiRules.ts` exposing:
    - `RULES_BASE_URL`: a base-path-safe URL built from `import.meta.env.BASE_URL` (normalize it to end with `/`, then append `ai-rules/`), so Tauri and any Vite subpath both resolve. Do not derive it from `document.baseURI`.
    - `loadVerifiedRules(fetchImpl = fetch)`: fetch the checksum manifest and both rule files as text, compute SHA-256 with `crypto.subtle.digest('SHA-256', ...)` over the UTF-8 bytes, compare against the manifest entries case-insensitively, and return `{ graphitiRules, sqlRules }`. Throw a descriptive Error on non-OK responses, missing/duplicate manifest entries, hash mismatch, or missing Web Crypto. Never use a string literal of rule text in TypeScript.
    - `applyGraphitiRules(db: TaskPlannerDatabase = defaultDb)`: call `loadVerifiedRules()` BEFORE any settings write, then do ONE `getMcpServers(db)` -> modify in memory -> `saveMcpServers(next, db)` cycle so the two row changes cannot clobber each other. For id `graphiti-banking`, preserve every existing field (or seed from `DEFAULT_MCP_SERVERS[0]` if absent) and replace only `instruction` with the verified shared rules. For id `svng-source`, create or update a config with `name: 'SVNG Source MCP'`, `enabled: true`, `desktopOnly: true`, the SQL rules as `instruction`, and `url` equal to the existing row's URL if present, otherwise the empty string — never an embedded endpoint. Do not call `upsertMcpServer` here: its `sanitizeUrl` rejects an empty URL. Return the updated server list.

    Test `src/services/ai/__tests__/graphitiRules.test.ts` with `fake-indexeddb/auto`, a mocked `fetch` that returns controlled text, and a single named Dexie test db (beforeEach/afterEach pattern from `mcpClient.test.ts`). Cover: (1) correct hashes yield the two texts and `applyGraphitiRules` sets `instruction` on `graphiti-banking` and creates/updates `svng-source` with the SQL text and no invented URL; (2) a tampered rule body or bad manifest hash throws and leaves `mcp_servers` byte-identical; (3) existing `graphiti-banking` fields other than `instruction` survive; (4) `BASE_URL` is honored by the fetch URL construction.

    Note: existing `DEFAULT_GRAPHITI_INSTRUCTION` in `mcpClient.ts` stays untouched for backward compatibility; the Apply action replaces that instruction with the verified bundled text.

    No npm dependencies added. No token/comment string reproducing any rule body in test fixtures.
  </action>
  <verify>
    <automated>npx vitest run src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts --bail=1</automated>
  </verify>
  <done>All four test cases pass; rule files copied verbatim; manifest hashes match the bundled SHA256SUMS entries; no rule text literal exists in TypeScript; no settings write occurs on verification failure.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Inject dynamic MCP instructions into team lead and employee prompts</name>
  <files>
    src/services/ai/office/teamPrompts.ts
    src/services/ai/office/teamRunCoordinator.ts
    tests/services/ai/office/teamPrompts.test.ts
  </files>
  <action>
    In `teamPrompts.ts`, add optional input `mcpInstructionsSegment?: string | undefined` to both `BuildEmployeeTurnRequestInput` and `BuildLeadTurnRequestInput`. In both builders, destructure it and append it to `parts` AFTER `pinnedContextSegment` via a conditional spread (`...(mcpInstructionsSegment ? [mcpInstructionsSegment] : [])`), matching the conventions/pin pattern. Add a short doc comment stating the segment is coordinator-built from `getEnabledMcpInstructions(db)` and that teamPrompts stays pure. Do not wrap it again or add role-specific filtering — the helper already frames it.

    In `teamRunCoordinator.ts`, import `getEnabledMcpInstructions` from `../mcpClient` alongside the existing `discoverAllMcpTools` import. Fetch the instruction string once per run/turn into a local `mcpInstructionsSegment`, gated by `liveTeam.mcpEnabled !== false` (the same gate as `refreshMcpTools`): call `await getEnabledMcpInstructions(db)` and catch failures to `''` so a settings read error never blocks a turn. Use the existing `globalConventions` fetch as the nearest fetch point (near the `buildConventionsSegment` call sites around :2382 and :2623). Pass the segment via conditional spread into both `buildEmployeeTurnRequest` (:2393) and `buildLeadTurnRequest` (:2634), immediately after `pinnedContextSegment`. Preserve `exactOptionalPropertyTypes` behavior: never pass an explicit `undefined`.

    Extend `tests/services/ai/office/teamPrompts.test.ts` with two focused cases: with the segment supplied, both builders' returned `systemMessages` include the exact segment once, positioned after the pinned-context segment; with the segment absent, no MCP instruction block appears and both builders behave as before. Keep existing tests unchanged.

    No hard-coded tool names, no new tools, no changes to `refreshMcpTools` or the tool allowlist.
  </action>
  <verify>
    <automated>npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts --bail=1</automated>
  </verify>
  <done>Both builders emit the exact dynamic instruction segment after pinned context when supplied; coordinator supplies it only when the team MCP gate is on; no segment appears when disabled or on read failure; existing tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add Settings action to apply verified rules into MCP configs</name>
  <files>
    src/components/settings/McpConfigCard.tsx
    tests/components/settings/McpConfigCard.test.tsx
  </files>
  <action>
    In `McpConfigCard.tsx`, import `applyGraphitiRules` from `../../services/ai/graphitiRules`. Add one secondary Ant Design Button in the Card `extra` beside "Thêm máy chủ" with stable accessible label `Áp dụng luật Graphiti/SQL`. On click: set `loading`, call `applyGraphitiRules(db)`, replace local `servers` state with the returned list, show `message.success` with a concise Vietnamese summary, call `onConfigChange?.()`, and on any throw show `message.error('Không thể áp dụng luật Graphiti/SQL: ' + (err?.message || 'Lỗi không xác định'))` without touching local state. Add a short inline `Paragraph type="secondary"` under the card description noting that the action verifies bundled rule hashes and that `svng-source` still needs its URL filled in via the edit form (no URL embedded).

    Extend `tests/components/settings/McpConfigCard.test.tsx` with a `vi.mock` of `../../services/ai/graphitiRules` that exposes a controllable `applyGraphitiRules` mock. Cover: (1) clicking the new button calls the helper once with the injected db, updates rendered server list from its return value, and fires `onConfigChange`; (2) a rejecting helper shows the error message and leaves rendered list unchanged. Mock only this helper; keep the existing fetch-free tests intact.

    Do NOT add npm packages, modify `CLAUDE.md`, touch `.claude/skills/`, or register MCP servers in Claude Code CLI.
  </action>
  <verify>
    <automated>npx vitest run tests/components/settings/McpConfigCard.test.tsx --bail=1</automated>
  </verify>
  <done>The Settings button applies verified rules on success, reports hash/verification failure without mutating settings, and does not invent an svng-source URL.</done>
</task>

</tasks>

<verification>

1. Targeted tests (project rule: never run full `npm test`):
   - `npx vitest run src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts --bail=1`
   - `npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts --bail=1`
   - `npx vitest run tests/components/settings/McpConfigCard.test.tsx --bail=1`
2. Typecheck: `npx tsc --noEmit` (or `npm run build` if typecheck-only script unavailable).
3. Hash proof outside the app: `cd public/ai-rules && shasum -a 256 -c SHA256SUMS` (on macOS `shasum`; manifest uses the exact two bundled digests).
4. Grep proof (repo root): `grep -R "claude mcp add" public/ai-rules src/services/ai/graphitiRules.ts` must find nothing; `grep -R "SVNG_SOURCE_MCP_URL\|http://10.4.97.70" src/services/ai/graphitiRules.ts` must find nothing besides the preserved default in `mcpClient.ts`.
5. `git status` must show no change to `CLAUDE.md` or `.claude/skills/`.

</verification>

<success_criteria>

- Both rule files exist under `public/ai-rules/` and their SHA-256 values match `public/ai-rules/SHA256SUMS`.
- Apply action writes verified instruction text to `graphiti-banking` and creates/updates `svng-source` with an empty/user-supplied URL, never a fabricated endpoint.
- Any verification failure leaves `mcp_servers` untouched and shows an error.
- Team lead and employee prompts carry the same dynamic `getEnabledMcpInstructions(db)` string as AI Chat, gated by `liveTeam.mcpEnabled`.
- No hard-coded Graphiti tool implementation, no CLI MCP registration, no new npm dependency, no modification to `CLAUDE.md` or `.claude/skills/`.

</success_criteria>

<output>

Create `.planning/quick/261125-gyl-integrate-graphiti-and-graphiti-sql-rule/261125-gyl-SUMMARY.md` when done.

</output>
