---
phase: 41-ai-office-team-docs-zones
plan: 05
subsystem: ai-office/team-prompts
tags: [prompts, folder-facts, write-doc, approval-card, untrusted-data]
requires:
  - "write_doc team tool contract (plan 41-03)"
  - "wrapField / wrapUntrusted (untrusted-data boundary)"
provides:
  - "folderId on BuildEmployeeTurnRequestInput + the `Folder tài liệu của bạn` line"
  - "two-exception read-only policy (propose_skill_version, write_doc)"
  - "docsFolderId + memberFolders on BuildLeadTurnRequestInput"
  - "LEAD_NO_WRITE_DOC_LINE exported constant"
  - "the [THƯ MỤC TÀI LIỆU NHÓM] lead prompt block"
affects:
  - "src/services/ai/office/teamRunCoordinator.ts (plan 41-06 passes folderId / docsFolderId / memberFolders)"
tech-stack:
  added: []
  patterns:
    - "folder ids enter the prompt bare (UUIDs from context); names enter through wrapField"
    - "a prompt block is pushed only when its facts exist — no empty header, no claim about a missing folder"
    - "the negation sentence is an exported constant so the test pins the exact string"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamPrompts.ts
    - tests/services/ai/office/teamPrompts.test.ts
decisions:
  - "D-16: the folder id is a fixed fact for the turn, so it is prompt text, not a tool round"
  - "D-04: no refusal code appears in either prompt — the handler is the guard"
  - "D-07b: the lead prompt tells the leader to leave agent drafts untouched"
  - "T-41-35: the lead prompt names write_doc exactly once, inside the negation line, with no positive instruction"
metrics:
  duration: "~8 min"
  completed: "2026-11-15T04:57:33Z"
  tasks: 3
  files_changed: 2
---

# Phase 41 Plan 05: Prompt folder facts Summary

Both prompts now carry the folder facts the coordinator already knows: the employee is told its own folder id and that `write_doc` is the second permitted write, and the leader is told the team folder, every member's folder, the draft-read/final-write workflow, and one exported sentence forbidding `write_doc`.

## What Was Built

**Task 1 — employee prompt (`f524599f`)**
- `BuildEmployeeTurnRequestInput` gained `folderId?: string | undefined` with a JSDoc naming D-16 and the `TEAM_DOCS_NOT_READY` consequence of absence.
- The policy block's first sentence changed from `trừ một ngoại lệ duy nhất bên dưới` to `trừ hai ngoại lệ bên dưới`; the existing exception became `Ngoại lệ 1` (unchanged wording), and `Ngoại lệ 2` describes `write_doc`: writes into the caller's own folder, visible in Docs immediately, no approval card, cannot write outside, cannot create a folder, cannot delete.
- The trailing "if you need other data changes, say so in the report" line gained the word `khác` so it no longer contradicts the two exceptions.
- A separate `parts.push` emits `Folder tài liệu của bạn: ${folderId} — dùng write_doc (list/create/update) để ghi trong đó.` only when `folderId` is truthy. No folder id means no line and no claim (T-41-24).
- The literal `chỉ được đọc` survives, so the pre-existing assertion at the old line 206 still passes untouched.

**Task 2 — lead prompt (`9a659cb1`)**
- `BuildLeadTurnRequestInput` gained `docsFolderId?: string | undefined` and `memberFolders?: readonly { agentName: string; folderId: string }[] | undefined`.
- `LEAD_NO_WRITE_DOC_LINE` exported at module scope with the exact literal the plan pinned.
- New `[THƯ MỤC TÀI LIỆU NHÓM]` block pushed after `[DANH SÁCH NHÂN VIÊN]` and before the ledger block, only when at least one folder fact exists. It carries `Folder nhóm: …`, one `${wrapField('TÊN NHÂN VIÊN', agentName)} → ${folderId}` line per member, the `query_notes` draft-read instruction, the `create_note` final-write instruction with the approval card as the gate, the "leave drafts untouched" line (D-07b), and the negation constant.
- `[QUYỀN GHI]` untouched — the new block adds folder facts, it does not replace the write-permission statement.
- `wrapField` added to the existing `../untrustedData` import.

**Task 3 — prompt tests (`ad46e4bf`)**
- Added a `buildLead` helper mirroring `buildEmployee`, and imported `LEAD_NO_WRITE_DOC_LINE` from the source module rather than retyping the literal.
- Nine new tests: employee folder + `write_doc`; employee folder line absent without `folderId`; two exceptions stated and `một ngoại lệ duy nhất` absent; no `DOC_NOT_IN_YOUR_FOLDER` / `TEAM_DOCS_NOT_READY` in the prompt; lead team folder + member folder + `query_notes`; member name wrapped under `TÊN NHÂN VIÊN`; lead block absent without folder facts; `QUYỀN GHI` + `thẻ phê duyệt` preserved; `LEAD_NO_WRITE_DOC_LINE` present, `Folder tài liệu của bạn` absent, `create_note` present.
- No existing test was modified. Test count 27 → 36.

## Verification

- `npx vitest run tests/services/ai/office/teamPrompts.test.ts` — 1 file, 36 tests passed (27 pre-existing + 9 new).
- `npx tsc --noEmit` — clean.
- Acceptance greps: `một ngoại lệ duy nhất` ×0; `chỉ được đọc` ×1; `write_doc` ×4 in the source; `THƯ MỤC TÀI LIỆU NHÓM` ×1; `QUYỀN GHI` ×1; `LEAD_NO_WRITE_DOC_LINE` ×2 (declaration + one push); `memberFolders` ×4; `it(` in the test file 45 (was 36).

## Requirements

- `AIO-DOCS-02`, `AIO-DOCS-03` — the prompt half only; both were already satisfied by plan 41-03 and stay checked.
- `AIO-DOCS-05` — **left unchecked deliberately.** This plan states the leader's approval-card rule in the prompt, but the rule itself is enforced by the DB-tool payload and the approval card. Plan 41-06 (which also declares `AIO-DOCS-05`) owns the wiring that makes it true end to end. Marking it here would record prompt text as enforcement — the exact D-04 split this plan refuses.

## Deviations from Plan

**1. [Rule 1 - Bug] The "report other changes to the lead" line contradicted the new second exception**
- **Found during:** Task 1
- **Issue:** The policy line read `Nếu cần thay đổi dữ liệu, hãy nêu rõ trong báo cáo…`. With `write_doc` now permitted, that sentence reads as "you may not change data", directly contradicting `Ngoại lệ 2` two lines above — the exact prompt-contradicts-payload failure the plan set out to remove.
- **Fix:** Added `khác` → `Nếu cần thay đổi dữ liệu khác…`. No test asserted the old wording.
- **Files modified:** `src/services/ai/office/teamPrompts.ts`
- **Commit:** `f524599f`

## Known Stubs

None. The prompt builders accept the new optional fields but nothing passes them yet — plan 41-06 wires them from the coordinator's turn context. Absence is a supported state by design (no folder line, no lead block), so the current behaviour is correct, not a stub.

## Threat Flags

None beyond the plan's register. T-41-21 (member name through `wrapField`, asserted by `expectWrapped`), T-41-24 (folder line only when `folderId` is present), T-41-35 (one `write_doc` occurrence, inside the negation constant; employee-style positive folder line asserted absent from the lead prompt) and T-41-22/T-41-23 (accepted: the handler and payload filter remain the controls) are all as planned.

## Self-Check: PASSED

- `src/services/ai/office/teamPrompts.ts` — FOUND (`folderId`, `docsFolderId`, `memberFolders`, `LEAD_NO_WRITE_DOC_LINE`, `[THƯ MỤC TÀI LIỆU NHÓM]`)
- `tests/services/ai/office/teamPrompts.test.ts` — FOUND (36 tests, 9 new)
- commits `f524599f`, `9a659cb1`, `ad46e4bf` — FOUND in `git log`
