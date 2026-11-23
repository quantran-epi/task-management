---
id: 261123-et1
status: complete
date: 2026-11-23
plan: 261123-et1
scope: AI Office team chat draft persistence, trusted instruction framing, technical diagnostics
---

# 261123-et1 — Team chat draft, trusted instructions, diagnostics

## Tasks

### Task 1 — Draft theo conversation
- Added `src/services/ai/office/teamChatDraftStore.ts`: module-level Map keyed `team:<id>`; no React/Dexie; session-only (ponytail comment notes `db.settings` upgrade path).
- `src/components/ai/office/TeamWorkspace.tsx`: draft seeded from store, resynced on team prop change, stable `setDraft` callback; existing restore/clear call sites unchanged.
- New `tests/components/ai/office/TeamWorkspaceDraft.test.tsx`: remount persistence, team isolation, submit clear, blocked restore.
- Commit: `cf04a416`; typing follow-up `4d4be556`.

### Task 2 — Pin & global convention thành trusted instruction
- `src/services/ai/conventionsSegment.ts`: added `TRUSTED_INSTRUCTION_BOUNDARY`; global header `[QUY ƯỚC TỔ CHỨC — CHỈ DẪN ĐƯỢC TIN CẬY]`; pin header `[NGỮ CẢNH NHÓM ĐƯỢC GHIM — CHỈ DẪN ĐƯỢC TIN CẬY]`; pin emitted verbatim without `wrapUntrusted`/nonce/"bỏ qua mệnh lệnh". Conflict policy, global→repo order, full text, empty→'' and closing tag kept.
- `src/services/ai/office/teamPrompts.ts`: comments updated only; builder signatures/order unchanged.
- New `tests/services/ai/conventionsSegment.test.ts`; updated pinned-context describe in `tests/services/ai/office/teamPrompts.test.ts`.
- Commit: `85020d1f`.

### Task 3 — Technical diagnostics + SQLcl exit-status/data (USER-APPROVED extra scope)
- `src/services/ai/office/teamRunCoordinator.ts`:
  - `boundedDiagnostic` now handles `Error`, plain string, plain object (`name`/`code`/`message`, JSON-safe fallback), and primitives; always `.slice(0, 300)`; still only `diagnosticDetail`, never bubble/backup.
  - `truthfulLocalReport` recognises plain-object rejections with `code === 'WORKTREE_NOT_AVAILABLE'` or local message marker; genuine `Error` instances (e.g. `APIError`) stay sanitized.
  - Worktree config throw now names exact missing setting: linked system (direct or via CR) needs SSH config + remote repo path in Settings > Systems.
  - CR-only resolution already shares `listLinkedSystems` with direct links and has passing tests; no code gap found — only user-side config missing.
- `src-tauri/src/tool_cancel.rs`: non-cancelled reader calls `channel.wait_close()` before `exit_status()`; source-guard Rust test added.
- `src/services/ai/oracleSqlclService.ts`: `exitStatus === -1` with non-empty stdout, no stderr, no explicit cancel is treated as unreliable and returns null so stdout is parsed; real nonzero exits, stderr and cancel still fail.
- Tests: new `tests/services/ai/oracleSqlclService.detectRemoteFailure.test.ts`; additions to `tests/services/ai/office/teamRunCoordinator.test.ts`.
- Commit: `81378439`.

## Files changed
- `src/services/ai/office/teamChatDraftStore.ts` (new)
- `src/components/ai/office/TeamWorkspace.tsx`
- `src/services/ai/conventionsSegment.ts`
- `src/services/ai/office/teamPrompts.ts`
- `src/services/ai/office/teamRunCoordinator.ts`
- `src-tauri/src/tool_cancel.rs`
- `src/services/ai/oracleSqlclService.ts`
- `tests/components/ai/office/TeamWorkspaceDraft.test.tsx` (new)
- `tests/services/ai/conventionsSegment.test.ts` (new)
- `tests/services/ai/office/teamPrompts.test.ts`
- `tests/services/ai/office/teamRunCoordinator.test.ts`
- `tests/services/ai/oracleSqlclService.detectRemoteFailure.test.ts` (new)

## Tests & verification
- `npx vitest run tests/components/ai/office/TeamWorkspaceDraft.test.tsx --bail=1` → 4 passed.
- `npx vitest run tests/services/ai/conventionsSegment.test.ts tests/services/ai/office/teamPrompts.test.ts --bail=1` → 71 passed.
- `npx vitest run tests/services/ai/oracleSqlclService.detectRemoteFailure.test.ts --bail=1` → 4 passed.
- Filtered coordinator diagnostics group + sanitization test → passed.
- `npx vitest run tests/services/ai/office/teamTools.test.ts -t "resolveAgentDeveloperWorktree" --bail=1` → 5 passed.
- `npx tsc --noEmit` → clean.
- `cd src-tauri && cargo check` / `cargo test tool_cancel` → BLOCKED: `cargo` not installed in this environment. Rust source-guard test added but not executed.
- Full Vitest suite intentionally not run (project rule: >1h).

## Known pre-existing failures (out of scope, unchanged by this plan)
- `teamRunCoordinator.test.ts` "composes the lead payload…" fails: `code_edit` missing from lead tool list; unrelated to 261123-et1 diff.
- `teamTools.test.ts` "exposes the twelve team tool definitions" fails: expects 12 definitions, repo has 13; unrelated to 261123-et1 diff.

## Security invariants
- Bubble/report text remains sanitized for provider errors; only `diagnosticDetail` carries bounded technical text; secret redaction in `detectRemoteFailure` preserved.
- Read-only/write guards remain code-enforced in tool handlers; trusted prompt text grants no write permission.

## Commits
- `cf04a416` feat: draft per conversation
- `4d4be556` test: draft mock typing
- `85020d1f` feat: trusted instruction framing
- `81378439` fix: diagnostics/data preservation

Docs artifacts (PLAN/SUMMARY/STATE) left uncommitted per task constraints; orchestrator handles them.
