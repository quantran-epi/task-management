---
phase: quick-261118-cz2
plan: '01'
subsystem: security
tags: [tauri, rust, ssh, oracle, indexeddb, ai-tools, payload-gating, dexie]
requires: []
provides:
  - No AI tool or Tauri command reads local filesystem content; OS dialog kept as path-only gate
  - Browser FileReader helper with size cap + sanitization for explicit user file-content input
  - Renamed SSH tools (ssh_read_file_page / ssh_read_file_all) with slice command preserved
  - Per-team sshFsToolsEnabled/oracleToolsEnabled flags across type → schema → backup → repo → UI
  - getGatedAddenda + disabledToolNames payload gating for team chat, ordinary chat, Telegram
affects: [ai chat, team workspace, telegram assistant, settings, backup/restore, SSH FS tools, Oracle SQLcl tools]
tech-stack:
  added: []
  patterns:
    - Explicit user consent boundary for local file content (browser FileReader, no Rust read)
    - Payload-time tool gating via shared pure resolver (getGatedAddenda) + disabled-name sets
    - Per-team feature flags stored on aiTeams row with add/remove idiom for exactOptionalPropertyTypes
key-files:
  created:
    - src/services/ai/browserFileReader.ts
    - src/components/ai/__tests__/referencedFilesHint.test.ts
    - src/services/ai/__tests__/browserFileReader.test.ts
  modified:
    - src-tauri/src/jira_proxy.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/ssh_service.rs
    - src/services/ai/aiTools.ts
    - src/services/ai/chatTurnTools.ts
    - src/services/ai/contextGrounding.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/types/aiOffice.ts
    - src/validation/backupSchemas.ts
    - src/db/repositories/aiTeamRepo.ts
key-decisions:
  - "Checkpoint 261118-cz2 resolved by owner as browser-filereader: keep OS dialog/attachment UI for path; content only via explicit browser file-input confirmation using FileReader, with 2 MB cap and sanitize"
  - "SSH rename: AI tool ssh_read_file_page, Tauri whole-file ssh_read_file_all, ssh_read_file_slice unchanged"
  - "Enable/disable is per-team on aiTeams; global configs hold only shared connection settings with no enabled field"
  - "Lead and employee both receive full SSH+Oracle tools when their team flag is on and connection config exists"
patterns-established:
  - "getGatedAddenda({team?, sshConfigReady, oracleConfigReady}) is the single source for SSH/Oracle payload enablement; both team roles and no-team paths consume it"
  - "Optional per-team booleans use the mcpEnabled add/remove idiom in repo create/update so undefined clears the key"
requirements-completed: []
actuals:
  tokens: 22760
  tasks: 5
  commits: 5
  plan_head_before: ab2172c3e717ba8adbe1233f82665bb20157a60b
  plan_head_after: 47dd796d
plan_head_before: ab2172c3e717ba8adbe1233f82665bb20157a60b
plan_head_after: 47dd796d
coverage:
  - id: D1
    description: No local filesystem content read by AI tools or Tauri commands; item context keeps path metadata only
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/fileReference.test.ts#local read_file tool removed"
        status: pass
      - kind: unit
        ref: "tests/ai/contextGrounding.test.ts#keeps only path metadata for local files"
        status: pass
    human_judgment: false
  - id: D2
    description: Browser FileReader path reads file content only on explicit confirmation, capped and sanitized
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/browserFileReader.test.ts#browserFileReader"
        status: pass
      - kind: unit
        ref: "src/components/ai/__tests__/referencedFilesHint.test.ts#REFERENCED_FILES_HINT"
        status: pass
    human_judgment: false
  - id: D3
    description: SSH tools renamed consistently with slice preserved and SSH_READ_TOOLS export correct
    verification:
      - kind: unit
        ref: "tests/ai/aiTools.test.ts#SSH_READ_TOOLS"
        status: pass
    human_judgment: false
  - id: D4
    description: Per-team SSH/Oracle flags persist and round-trip through strict backup schema
    verification:
      - kind: unit
        ref: "tests/services/ai/office/aiTeamRepo.test.ts#per-team SSH FS / Oracle tool toggles"
        status: pass
      - kind: unit
        ref: "tests/validation/backupSchemas.test.ts#per-team SSH FS / Oracle toggles"
        status: pass
    human_judgment: false
  - id: D5
    description: SSH/Oracle tools gated at payload for team/chat/Telegram; both roles get full set when enabled
    verification:
      - kind: unit
        ref: "tests/ai/chatTurnTools.test.ts#quick cz2 enablement gating"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#advertises the Oracle read pair"
        status: pass
    human_judgment: false
  - id: D6
    description: Tauri Rust changes compile cleanly after command deletion and rename
    verification:
      - kind: other
        ref: "cargo check could not run (sandbox proxy blocked bit-vec v0.8.0 download); lexical brace/paren balance verified against baseline"
        status: unknown
    human_judgment: true
    rationale: "cargo check blocked by environment network proxy; a human/CI with crate access must confirm Rust compilation"
duration: 38min
completed: 2026-11-18
status: complete
---

# Phase quick-261118-cz2: Remove local filesystem reads from AI flow Summary

**Removed every local-file read path from the AI flow (Rust commands, `read_file` tool, item-context head reader), added an explicit browser FileReader consent path, renamed SSH tools, and moved SSH/Oracle enablement to per-team payload gating.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-11-18T02:41:34Z
- **Completed:** 2026-11-18T03:19:28Z
- **Tasks:** 5 (1 owner-resolved checkpoint + 4 auto tasks)
- **Files modified:** 39

## Accomplishments
- Deleted `read_local_file_text_head` / `read_local_file_slice` Rust commands and registrations; kept `select_local_file` OS dialog intact. Removed the `read_file` AI tool, its dispatcher case, employee allowlist entry, and the item-context file reader (now metadata-only).
- Added `src/services/ai/browserFileReader.ts` with a 2 MB cap, NUL/binary rejection, and prompt-escape sanitization, wired to the browser file input behind an explicit `window.confirm` in `ChatInputBar.tsx`. Rewrote `<referenced_files>` and analysis-mode prompts around the owner's `browser-filereader` choice and pinned them with `REFERENCED_FILES_HINT`.
- Renamed AI tool `ssh_read_file` → `ssh_read_file_page`, Tauri command `ssh_read_file` → `ssh_read_file_all`, preserved `ssh_read_file_slice`, and exported `SSH_READ_TOOLS` (3 tools).
- Added `sshFsToolsEnabled` / `oracleToolsEnabled` across `AiTeam`, aiOffice schemas, strict backup record, repo create/update, TeamSettingsDrawer switches, and TeamWorkspace save; removed the global `enabled` field from SSH/Oracle config types and settings UI.
- Implemented `getGatedAddenda` + `disabledToolNames` and wired them into team lead/employee addenda, ordinary chat, and both Telegram paths; updated the tool catalog usage map to the new gated dispatch sites.

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint):** resolved by owner decision `browser-filereader` — no code commit
2. **Task 2: Remove local filesystem read gates** - `1690a00c` (feat)
3. **Task 3: Rename SSH tools and add SSH_READ_TOOLS** - `c9964e73` (refactor)
4. **Task 4: Per-team SSH/Oracle flags** - `33f7b402` (feat)
5. **Task 5: Gate payloads and update catalog** - `742f3981` (feat)
6. **Follow-up Rule 1: stale SSH test update** - `47dd796d` (test)

## Files Created/Modified
- `src-tauri/src/jira_proxy.rs` - deleted both local content-read commands; dialog preserved
- `src-tauri/src/lib.rs` - removed two read registrations; renamed SSH whole-file registration
- `src-tauri/src/ssh_service.rs` - renamed whole-file command to `ssh_read_file_all`
- `src/services/ai/aiTools.ts` - removed `read_file`, renamed SSH AI tool, added `SSH_READ_TOOLS`
- `src/services/ai/chatTurnTools.ts` - added `getGatedAddenda`, `disabledToolNames`, new catalog refs
- `src/services/ai/contextGrounding.ts` - local links are path metadata only
- `src/services/ai/browserFileReader.ts` - new capped/sanitized explicit FileReader helper
- `src/services/ai/office/teamRunCoordinator.ts` - gated addenda for both team roles
- `src/components/ai/AIChatDrawer.tsx` - new prompt, config-readiness gating for chat
- `src/types/aiOffice.ts`, `src/validation/aiOfficeSchemas.ts`, `src/validation/backupSchemas.ts`, `src/db/repositories/aiTeamRepo.ts` - per-team flags end to end
- `src/components/ai/office/TeamSettingsDrawer.tsx`, `src/components/ai/office/TeamWorkspace.tsx` - per-team switches and persistence
- `src/services/telegram/telegramHeadlessWorker.ts`, `src/services/telegram/telegramMutationSession.ts` - gated payloads
- Focused tests across `tests/ai`, `tests/services`, `src/services/ai/__tests__`, `src/components/ai/__tests__`

## Decisions Made
- Owner checkpoint choice `browser-filereader` (not path-metadata-only): attachment UI stays; content requires an explicit browser file-input re-selection and confirmation before it enters context.
- SSH/Oracle enable/disable is per-team on `aiTeams`; global configs are connection-only with no `enabled` field. Absent flag = off.
- Lead and employee receive the same full tool set when enabled (decision 5) gated by `getGatedAddenda`.
- `git_read`'s `read_file` action and `SshFsToolResult.action: 'read_file'` are remote-only and intentionally retained — they do not read local filesystem content.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale SSH `enabled` test after global-toggle removal**
- **Found during:** Final overall verification
- **Issue:** `src/services/ai/__tests__/sshFsToolService.test.ts` still mocked `enabled: false` and asserted a "chưa được bật" error that no longer exists after `enabled` was removed from `SshFsToolConfig`.
- **Fix:** Replaced with an assertion that `enabled` is no longer a config field; removed the stale mock value.
- **Files modified:** `src/services/ai/__tests__/sshFsToolService.test.ts`
- **Verification:** All 12 focused test files (251 tests) pass; `tsc --noEmit` clean.
- **Committed in:** `47dd796d`

**2. [Rule 2 - Missing Critical] Browser FileReader helper and confirmation wiring**
- **Found during:** Task 2 (implementing owner's `browser-filereader` checkpoint choice)
- **Issue:** Plan named the option but the codebase had no FileReader path; without one, the chosen "read content only on explicit browser selection" contract would be a stub.
- **Fix:** Added capped/sanitized `browserFileReader.ts` and wired it into `ChatInputBar`'s browser branch behind explicit confirmation.
- **Files modified:** `src/services/ai/browserFileReader.ts`, `src/components/ai/ChatInputBar.tsx`, new focused tests
- **Verification:** 5 FileReader unit tests + 2 prompt-constant tests pass.
- **Committed in:** `1690a00c`

## Issues Encountered
- `cargo check --manifest-path src-tauri/Cargo.toml` could not run: the sandbox proxy (McAfee Web Gateway) blocked downloading uncached `bit-vec v0.8.0`; `--offline` failed for the same reason. Rust syntax was validated by lexical brace/paren balance against baseline, and the edits were mechanical deletions/rename only. Logged in `deferred-items.md` for CI/human confirmation.
- Four timing-sensitive `teamRunCoordinator.test.ts` scheduler/R6 tests fail. Verified they also fail on baseline `HEAD` before Task 5 changes — pre-existing and out of scope; logged in `deferred-items.md`. All tool-resolution/Oracle tests pass.
- `git_read`'s internal `read_file` action and `SshFsToolResult.action: 'read_file'` are remote/SSH-only; confirmed not local reads and intentionally left unchanged.

## Known Stubs
None. The browser FileReader path is wired to a real explicit user action; per-team flags are persisted and consumed.

## Threat Flags
None beyond the plan's threat model. All new surface (browser FileReader, per-team flags, gating helper) is covered by the plan's T-quick-01..05 mitigations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AI chat no longer has any local filesystem content-read path; attachment and prompt behavior follow the owner's explicit choice.
- SSH/Oracle tool enablement is per-team and gated at the payload; catalog references point to the new dispatch sites.
- Follow-up: CI with crate download access should run `cargo check` to confirm the Rust changes compile.

## Self-Check: PASSED

All created files and all 5 task commits verified present.

---
*Phase: quick-261118-cz2*
*Completed: 2026-11-18*
