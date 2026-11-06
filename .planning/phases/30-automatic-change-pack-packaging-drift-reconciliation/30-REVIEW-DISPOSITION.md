# Phase 30 — Code Review Disposition

Source: `30-REVIEW.md` (status: issues_found)

| Finding | Severity | Disposition | Note |
|---------|----------|-------------|------|
| CR-01 | Critical | fixed | `JSZip.loadAsync` no longer forces `checkCRC32` (which decompressed every entry before any size guard); oversized entries are rejected from the central-directory size before `async()` decompresses them. Commit `711cfbcf`. |
| WR-01 | Warning | open | Packager metadata fabricates author/commit subjects. |
| WR-02 | Warning | open | `WIZARD_DEFERRED_HUNK` text-sniffing contract between packager and validator. |
| WR-03 | Warning | open | Active pack + success toast persisted before coordinator commit; host error swallowed. |
| WR-04 | Warning | open | `handleSelectActive` writes active pointer before reconciliation. |
| WR-05 | Warning | open | Drift/banner state not reset after success or manual upload. |
| WR-06 | Warning | open | Entry limit mismatch: packager 1000 vs reconciliation schema 512. |
| WR-07 | Warning | open | Retry-connection button shown for every error, not only SSH. |
| WR-08 | Warning | open | Raw `err.message` surfaces in UI. |
| WR-09 | Warning | open | Missing UI-SPEC items (commit count, tooltip/ellipsis, MultiPack paging). |
| WR-10 | Warning | open | Duplicate drift check; SSH call made without secret in UI path. |
| WR-11 | Warning | open | Non-ASCII/renamed Git paths parsed incorrectly. |
| WR-12 | Warning | open | Integration test not hermetic (depends on machine bash/git history). |
| IN-01 | Info | open | `getEffectiveChangePackLimits` / alias unused in practice. |
| IN-02 | Info | open | Unused `onPersistentWrite` parameter. |
| IN-03 | Info | open | Deprecated Ant Design prop. |
| IN-04 | Info | open | Missing/incorrect boundary and error-branch tests. |
| IN-05 | Info | open | `handleDeletePack` does not protect the active pack. |
