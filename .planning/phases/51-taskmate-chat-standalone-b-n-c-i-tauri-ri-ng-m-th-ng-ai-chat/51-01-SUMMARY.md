---
phase: 51
plan: 01
subsystem: packaging
tags: [tauri, vite, build-config, chat-standalone, vitest, marker]

requires:
  - phase: 50
    provides: existing TaskMate Tauri bundle, Vite dist build, and #ai-popout route reused unchanged
provides:
  - Second Tauri bundle identity "TaskMate Chat" (com.personal.taskmate.chat) seeding index.html#ai-popout
  - Committed Vite chat config with static VITE_CHAT_STANDALONE="1" marker and chat-only npm/Tauri scripts
  - Six contract tests that pin identity, full window array, marker source, and base-file byte identity
affects: [51-02, 51-03, 51-04, standalone chat runtime grounding and settings work]

tech-stack:
  added: []
  patterns:
    - Tauri second config via `tauri build/dev -c src-tauri/tauri.conf.chat.json` over unchanged base config
    - Vite config overlay via `mergeConfig(baseConfig, defineConfig({ define: ... }))` — marker in committed source, never a .env file
    - TDD Wave 0 contract gate for config/package JSON with scoped Vitest + `npx tsc --noEmit`

key-files:
  created:
    - src-tauri/tauri.conf.chat.json
    - vite.chat.config.ts
    - tests/phase51/chatConfig.test.ts
  modified:
    - package.json

key-decisions:
  - "Chat config repeats all seven main-window fields because Tauri JSON Merge Patch replaces arrays wholesale; URL is index.html#ai-popout seeded at first paint."
  - "Standalone marker is a committed Vite define (import.meta.env.VITE_CHAT_STANDALONE = '1'), not an env file; .env/.env.* are gitignored and would be missing on fresh clone."
  - "Vite chat config uses mergeConfig over the base config so plugins, worker, base and test stay identical; only define differs."
  - "Chat build.beforeBuildCommand runs `npm run build:chat`, which invokes `vite build --config vite.chat.config.ts`; this is the CLI-pinned mechanism because `tauri build -c` selects the Tauri config, not the Vite config."
  - "No new dependency; Cargo.toml, capabilities/default.json, tauri.conf.json, vite.config.ts and all pre-existing scripts remain byte-identical."

patterns-established:
  - "Tauri dual-bundle config overlay: identity and window array changed, all other bundle/app fields reused verbatim."
  - "Build-time static marker in a committed Vite config, verified by source contract test plus a real `vite build --config vite.chat.config.ts`."

requirements-completed: [P51-PKG-01]

duration: 5min
completed: 2026-11-25
---

# Phase 51 Plan 01: TaskMate Chat packaging summary

**Second Tauri bundle `TaskMate Chat` with hash-seeded chat window and committed `VITE_CHAT_STANDALONE` Vite marker, added without changing TaskMate's base config or scripts**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-25T16:25:19Z
- **Completed:** 2026-11-25T16:30:45Z
- **Tasks:** 2/2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- Created `src-tauri/tauri.conf.chat.json` copying every base config field, changing only identity (`TaskMate Chat` / `com.personal.taskmate.chat`), window title, URL `index.html#ai-popout`, and chat build/dev commands.
- Added `tauri:build:chat` and `tauri:dev:chat` scripts passing `-c src-tauri/tauri.conf.chat.json`, plus `build:chat` and `dev:chat` selecting `vite.chat.config.ts`.
- Created `vite.chat.config.ts` that merges the base config and statically defines `import.meta.env.VITE_CHAT_STANDALONE` as `"1"`.
- Wrote `tests/phase51/chatConfig.test.ts` with six contract tests; RED observed before each implementation and GREEN after.
- Verified all six tests pass, `npx tsc --noEmit` exits 0, and a real `vite build --config vite.chat.config.ts` succeeds.

## Task Commits

Each task was committed atomically:

1. **Task 1: Chat Tauri config and build scripts** - `b3523d9c` (feat, after TDD RED test commit in same atomic task commit)
2. **Task 2: Committed Vite chat build with static standalone marker** - `deb79e81` (feat, after TDD RED test extension in same atomic task commit)

_Note: RED was observed by running the scoped test before implementation for each task; the plan's atomic task-commit protocol keeps test and implementation in one commit per task._

## Files Created/Modified

- `src-tauri/tauri.conf.chat.json` - second bundle identity, fully repeated window array with chat hash URL, chat build commands
- `vite.chat.config.ts` - base Vite config overlay defining the committed standalone marker
- `package.json` - four new chat scripts; all pre-existing scripts byte-identical
- `tests/phase51/chatConfig.test.ts` - six contract tests (identity, window, hash URL, base integrity, Vite marker, script wiring)

## Decisions Made

- Pinned the Vite config selection through `build.beforeBuildCommand: "npm run build:chat"` → `vite build --config vite.chat.config.ts`, after confirming installed CLI help shows `tauri build -c` only merges Tauri config and forwards runner args, not Vite config.
- Kept `tauri.conf.json`, `vite.config.ts`, `Cargo.toml`, `capabilities/default.json`, base scripts and icon assets unchanged; no new dependency added.
- Used source-level contract assertions for Vite config because importing `vite.config.ts` into Vitest triggers an ESM `import.meta.url` scheme mismatch; the real Vite build is verified separately.

## Deviations from Plan

None - plan executed as written. No auto-fix rules triggered.

## Issues Encountered

- Importing Vite config objects directly into the Vitest test failed with `TypeError: The URL must be of scheme file` from `fileURLToPath(new URL(..., import.meta.url))` in `vite.config.ts`. Resolved by asserting the committed source contract instead and running the real Vite chat build as the behavioral verification. No change to base config.
- `.gitignore` ignores `.env`/`.env.*`, so the marker was implemented strictly as a Vite `define` in committed source, per plan.

## Auth Gates

None.

## Known Stubs

None. The marker build is functional; downstream plans consume `VITE_CHAT_STANDALONE` to switch runtime behavior.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change introduced. `VITE_CHAT_STANDALONE` is the literal string `"1"` only, no secret. Capabilities remain unchanged.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- Chat bundle identity, hash route seeding, and committed marker are in place; downstream plans can gate standalone chat UI at `import.meta.env.VITE_CHAT_STANDALONE === '1'`.
- Real dual-app install smoke remains a phase-51 human checkpoint (per research open question 2), not part of this plan.

## Plan 04 build smoke (2026-11-26, final)

- Initial `npm run tauri:build:chat` failed at DMG step only: generated `bundle_dmg.sh` aborted on `Not authorized to send Apple events to Finder. (-1743)`. Tauri's create-dmg script supports `--skip-jenkins` when `CI` is set, so `tauri:build:chat` now sets `CI=true` for this script.
  - Verified identity with `PlistBuddy`: `CFBundleIdentifier = com.personal.taskmate.chat`, `CFBundleName = TaskMate Chat`.
  - App path: `src-tauri/target/release/bundle/macos/TaskMate Chat.app`.
  - DMG path: `src-tauri/target/release/bundle/dmg/TaskMate Chat_0.1.1_aarch64.dmg`; `hdiutil verify` reports checksum VALID.
  - `CI=true` skips Finder cosmetic AppleScript only; it does not skip DMG creation, signing input, or artifact verification.
- No files from concurrent sessions touched; no stash, reset, force-push, or new dependency.

## Self-Check: PASSED

- All four plan artifacts exist (`src-tauri/tauri.conf.chat.json`, `vite.chat.config.ts`, `package.json`, `tests/phase51/chatConfig.test.ts`).
- Commits `b3523d9c` (Task 1), `deb79e81` (Task 2), `e2334c87` (metadata) exist in git history.
- `npx vitest run tests/phase51/chatConfig.test.ts --bail=1` → 6/6 pass; `npx tsc --noEmit` → clean; real Vite chat build → succeeds.
- Protected files `tauri.conf.json`, `vite.config.ts`, `Cargo.toml`, `capabilities/default.json` unchanged (SHA-256 identical to baseline); no file deletions in any plan commit.

---
*Phase: 51-taskmate-chat-standalone*
*Completed: 2026-11-25*
