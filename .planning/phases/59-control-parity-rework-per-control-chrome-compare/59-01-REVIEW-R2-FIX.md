---
phase: 59-control-parity-rework-per-control-chrome-compare
plan: 01
review_round: R2
fixed_at: 2026-11-22T08:35:19Z
review_path: .planning/phases/59-control-parity-rework-per-control-chrome-compare/59-01-REVIEW-R2.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 59 Plan 01: Code Review Fix Report — R2

**Fixed at:** 2026-11-22T08:35:19Z
**Source review:** `.planning/phases/59-control-parity-rework-per-control-chrome-compare/59-01-REVIEW-R2.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-R2-01, WR-R2-02; 0 blocker)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-R2-01: Gate chặn wrapper==proof nhưng không chặn wrapper==reference

**Files modified:** `tests/parity/parityEvidenceIntegrity.test.ts`
**Commit:** `27146657`
**Applied fix:** `checkOnDiskScreenshots()` giờ hash `reference-light.png` / `reference-dark.png` và từ chối wrapper trùng byte reference (`wrapper-{theme}.png is a copy of reference-{theme}.png`). Lỗ hổng cũ: reference-light != reference-dark nên cặp copy reference→wrapper vượt qua cả `checkScreenshotsDiffer` lẫn 2 check proof-copy. Thêm regression test dựng tmp có wrapper=reference (chứng minh fail trước fix: gate trả `[]`, sau fix trả 2 error). Không đụng wrapper control.

### WR-R2-02: Reproducibility sau fresh clone chưa đạt (default `/private/tmp` session-specific)

**Files modified:** `tests/helpers/parityEvidence.ts`, `tests/helpers/parityHarness.ts`, `tests/helpers/parityHarness.sp.test.ts` (mới), `.planning/phases/59-control-parity-rework-per-control-chrome-compare/59-PATTERNS.md`, `.planning/phases/59-control-parity-rework-per-control-chrome-compare/59-01-PLAN.md`, `.planning/debug/artifacts/control-parity/button/SMOKE.md`
**Commit:** `017e5e86`
**Applied fix:** Chọn nhánh "require `PARITY_SP` rõ ràng + docs" — fixture `openidea` ~594 MB + `oi-prototype` ~44 MB nên không commit vào repo. Thay default `/private/tmp/.../<uuid>/scratchpad` bằng `resolveSp()` (thuần, lazy): throw rõ khi `PARITY_SP` thiếu/blank; harness gọi qua `requireSp()` trong `assertFixtures()`/`startServer()`/error message, import-time không crash (Playwright vẫn collection được `CONTROL_REGISTRY`). Thêm 3 failing-first test. Ghi rõ precondition vào PATTERNS §0.1, plan 01 Task 1 verify, và SMOKE.md. Không đụng wrapper control.

## Verification

Chạy trong worktree isolated `gsd-reviewfix/59-50351` (symlink node_modules). Tất cả xanh:

- Gate integrity (SMOKE button): `SMOKE=1 PARITY_CONTROL=button npx vitest run tests/parity/parityEvidenceIntegrity.test.ts --bail=1` → 16 passed (15 cũ + 1 regression WR-R2-01).
- Resolver test: `npx vitest run tests/helpers/parityHarness.sp.test.ts --bail=1` → 3 passed.
- Focused parity test: `npx vitest run src/components/ui/__tests__/parity-button.test.tsx --bail=1` → 3 passed.
- TypeScript: `npx tsc --noEmit` → clean.
- Playwright smoke: `PARITY_SP=<scratchpad> SMOKE=1 PARITY_CONTROL=button npx playwright test e2e/control-parity.spec.ts --grep "button" --reporter=list` → 1 passed. Hash ảnh chụp mới wrapper-light/dark vẫn khác reference/proof (new anti-forgery check không false-positive). Artifact bị capture ghi đè (403 console noise do node_modules nằm ngoài worktree root qua symlink) đã restore về HEAD; chỉ giữ lại doc edit trên SMOKE.md. Gate chạy lại trên artifact HEAD → 16 passed.

**Ghi chú:** `gsd-tools` không có sẵn trong environment nên commit dùng `git commit` trực tiếp với message conventional + `Co-Authored-By: Claude Code <noreply@anthropic.com>`. Không chạy full Vitest suite. Không PWA. Không dependency mới.

---

_Fixed: 2026-11-22T08:35:19Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
