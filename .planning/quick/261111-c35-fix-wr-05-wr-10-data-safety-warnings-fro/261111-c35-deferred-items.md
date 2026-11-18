# Quick 261111-c35 — Deferred warnings

WR-05 and WR-10 are fixed by this task. The six below stay open and are recorded here so the
owning phase picks them up when planned. No source file named below was touched.

Source: `.planning/phases/36-data-model-multi-chat-identity-backup-migration/36-REVIEW.md`
lines 193-253; owner assignment from `36-CHECKPOINT.md` lines 52-59.

| ID | File:line (as stated in 36-REVIEW.md) | Defect | Target phase |
|---|---|---|---|
| WR-07 | `src/db/repositories/teamTranscriptRepo.ts:128-158`; `src/components/ai/office/TeamWorkspace.tsx:181-186` | Interrupted-turn inference fires for a turn still running (instruction row with no report yet). | 37 |
| WR-08 | `src/db/repositories/aiSkillVersionRepo.ts:68-85` (post-task-2: `:75-92`) | `decideSkillVersion` overwrites an already-decided row, destroying the recorded decision instead of versioning it. | 39 |
| WR-09 | `src/validation/aiOfficeSchemas.ts:123-130`; `src/validation/backupSchemas.ts:686-697`; `src/types/aiOffice.ts:1-10` | `evidence` is unbounded free text that round-trips through backup and is not covered by the forbidden-key scan. | 39 |
| WR-11 | `src/db/repositories/aiOfficeRepo.ts:117-133`, `:197-209`, `:265-278` | Delete guard and delete are not atomic — awaits sit between the live-use check and the delete. | 37 |
| WR-12 | `src/components/ai/office/TeamWorkspace.tsx:408-440`, `:542-547`, `:683-688`; `src/views/TeamsView.tsx:164-166` | Repo calls fired with `void` and no `.catch()` produce unhandled rejections with no UI feedback. | 37 |
| WR-13 | `src/services/ai/office/teamRunCoordinator.ts:470-475`, `:951-958` | `topUp` cannot top up a member added since the last turn snapshot (`membersLoaded` early-return). | 38 |

## Notes

- These six are assigned to phases 37/38/39 in `36-CHECKPOINT.md`, but none of the warning ids
  appears in `.planning/ROADMAP.md`. The ROADMAP entries for phases 37-39 should absorb them when
  those phases are planned. This task deliberately does not edit ROADMAP.md.
- Line numbers come from a review written at commit `b3e1ee3b` with HEAD at `a73a7749`.
- Task 2 of this quick task adds an existence guard plus a named message to
  `src/db/repositories/aiSkillVersionRepo.ts`, which shifts the WR-08 range down. The post-task-2
  location of `decideSkillVersion` is `src/db/repositories/aiSkillVersionRepo.ts:75-92` — anchor
  the phase-39 plan there, not on the review's `:68-85`.
