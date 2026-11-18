---
phase: 35
status: triaged
source: 35-REVIEW.md
---

# Phase 35 Review Disposition

Review returned 3 critical, 6 warning, 6 info claims. These counts are reviewer claims, not verified defect counts. No additional security/UI/validation audits: user explicitly requested stopping unnecessary work. No push until phase completion.

| Finding | Disposition | Evidence / next action |
|---|---|---|
| CR-01 | fixed | Commit `713afc2b`: V18 strips only retired document-set metadata, preserving sets/notes. Regression covers surviving content and successful edit/reorder. Post-merge focused tests pass; typecheck clean. |
| CR-02 | no_change_needed | Rejected as a defect: D-06 and UI-SPEC explicitly require rejecting backups containing retired `sdlc` tabs, without coercion/partial restore. Do not undo this decision or bump backup version solely on this finding. Specified Vietnamese rejection copy is separately still missing. |
| CR-03 | needs_scope_resolution | preparePatch intentionally returns proposals only for Phase 39 reuse (35-01 objective). No writer exists, but production reachability and truthful approval responses need resolution alongside WR-01/02. Do not add an unrequested patch writer or describe this as an observed reachable production critical. |
| WR-01 | deferred | Tool payload wiring is intentionally restricted; primitive extraction is explicitly requested for later reuse. No need to advertise tools without an owning editor/writer. |
| WR-02 | deferred | Approval UI retained per D-04; future host integration belongs with patch application, not deletion of explicitly requested primitive. |
| WR-03 | deferred | Do not expose patch tools to scoped production turns without reviewing note/skill scope checks. No new security audit requested. |
| WR-04 | fixed | Commit `353a8cff`: legacy-tab backfill retains messages only for surviving threads. Regression proves ordinary messages survive and the next export validates. Post-merge focused tests: 33/33 across 3 files; typecheck clean. |
| WR-05 | deferred | Soft-deleted note reads merit a targeted guard before exposing patch tools. version=0/approvalState constants are explicit plan 35-01 requirements, not accidental omissions. |
| WR-06 | no_change_needed | Refusal union retained explicitly by plan 35-01. Cleanup not needed to close data-safety defects. |
| IN-01 | deferred | Cosmetic comment; no runtime defect. |
| IN-02 | deferred | Split string in fixture is poor gate ergonomics, not runtime failure. No cleanup audit requested. |
| IN-03 | deferred | Unknown-view filtering claim exceeds current retired-only set; inspect alongside layout acceptance, no broad refactor now. |
| IN-04 | no_change_needed | V18 alias deliberately required by plan; whitespace not phase blocker. |
| IN-05 | no_change_needed | Public extraction API explicitly retained for reuse; deleting its documented single-repo branch is outside scope. |
| IN-06 | deferred | Retained patch display support is explicit scope; remove only if owning feature is dropped by user decision. |

## Other known gates

- Plan 35-12 reported typecheck and build green.
- Phase focused test sweep reported 580 passing assertions plus one failing pre-existing KnowledgeServerConfigCard selector test; not an all-green sweep.
- Manual Tauri layout hydration walkthrough remains pending; no claim of runtime verification.
- InterruptedBanner description and backup invalid-tab copy differ from untracked UI-SPEC; not fixed yet.
- Confirmed data defects CR-01/WR-04 are fixed. User clarified fresh-data-only scope; legacy compatibility, legacy-layout walkthrough, and exact copy differences are accepted non-blocking debt. Phase may advance; no claim that these debt items were fixed.
