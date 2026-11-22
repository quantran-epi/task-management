---
phase: 59-control-parity-rework-per-control-chrome-compare
plan: 01
review_round: R2
reviewed: 2026-11-22T08:23:04Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - tests/helpers/parityHarness.ts
  - tests/helpers/parityEvidence.ts
  - tests/parity/parityEvidenceIntegrity.test.ts
  - e2e/control-parity.spec.ts
  - src/components/ui/__tests__/parity-button.test.tsx
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 59 Plan 01: Re-Review R2 (sau fixes 947ee1cd / 4c9007b6 / 3c698651)

**Reviewed:** 2026-11-22T08:23:04Z
**Depth:** deep
**Files Reviewed:** 5 (+ smoke artifacts trên disk)
**Status:** issues_found (0 blocker, 2 warning tồn dư)

## Summary

Re-review hostile đối chứng 9 finding của v1 với source hiện tại và artifact trên disk. **Cả 3 critical (CR-01/02/03) được sửa thật, verified bằng hash disk + chạy lại gate.** Không có blocker. Hai warning tồn dư: gate chặn wrapper==proof nhưng sót wrapper==reference (WR-R2-01), và reproducibility sau fresh clone vẫn chưa đạt dù fixer đánh dấu WR-05 "fixed" (WR-R2-02).

Không re-run lệnh Playwright capture vì lệnh đó ghi đè artifact đang track (vi phạm chế độ read-only); thay vào đó verify trực tiếp bytes/JSON trên disk từ commit regenerate `3c698651` và chạy lại hai lệnh không ghi file. Tree sạch, không sửa source.

## Verify hostile — kết quả

| # | Kiểm tra | Kết quả |
|---|---|---|
| 1 |Không `copyFileSync` overwrite | PASS — `copyFileSync` chỉ còn trong comment tại `parityEvidenceIntegrity.test.ts:379`; harness chụp wrapper thật (`parityHarness.ts:378-381`) |
| 2 |Screenshot bytes distinct + gate hash disk | PASS — 6 PNG SHA256 riêng biệt; wrapper-light `9bf9e815…`, wrapper-dark `62a0451b…` ≠ proof; `checkOnDiskScreenshots` hash `readFileSync` thật (`:229-245`) |
| 3 |Interactions `before!==after` trên control thật | PASS — 5/5 entry trong `interactions.json` distinct, `reference===before`, `wrapper===after`; target là child `<button>` actionable (`parityHarness.ts:277-280`, `:302-304` hard-fail) |
| 4 |Gate reject `reference===wrapper` | PASS — `checkInteractions:163-165` + test `:354` |
| 5 |Gate reject missing selector | PASS — `checkDomSelectors:201-221` + `assertEvidence:290` |
| 6 |Gate reject shape-only test | PASS — `focusedTestErrors:181-189` strip comment, bắt fireEvent + matcher có đối số, chặn className/style; test `:404` |
| 7 |Gate reject self-assigned humanVerdict | PASS — `checkPassArtifact:143` + test `:332`; PASS.json disk vẫn `pending-human`/`null` |
| 8 |DOM per-app chứa selector | PASS — 8 file `dom-{reference,proof,wrapper}-{light,dark}.json` + legacy đều có `data-oi-control="button"` trong `controlHtml` và flag `truncated` |
| 9 |Log append | PASS — `appendFileSync` tại `parityHarness.ts:64`, truncate 1 lần `:56`; `reference.log` 1302 bytes nhiều chunk |
| 10 |Shutdown trong afterAll | PASS — `control-parity.spec.ts:20` |
| 11 |Fixture guard | PASS — `assertFixtures()` tại `parityHarness.ts:25-35`, gọi từ `preflight():102`, throw rõ kèm hướng dẫn `PARITY_SP` |

**Re-chạy (không ghi file):** `SMOKE=1 PARITY_CONTROL=button npx vitest run tests/parity/parityEvidenceIntegrity.test.ts --bail=1` → 15 passed; `npx vitest run src/components/ui/__tests__/parity-button.test.tsx --bail=1` → 3 passed. `git status` sạch.

## Warnings

### WR-R2-01: Gate chặn wrapper==proof nhưng không chặn wrapper==reference

**File:** `tests/parity/parityEvidenceIntegrity.test.ts:236-243`

**Issue:** `checkOnDiskScreenshots` so sánh wrapper với proof (đúng CR-01) và wrapper-light vs wrapper-dark, nhưng không so sánh wrapper với `reference-{light,dark}.png`. Do reference-light ≠ reference-dark, một forgery copy `reference-light.png → wrapper-light.png` và `reference-dark.png → wrapper-dark.png` vượt qua cả `checkScreenshotsDiffer` lẫn 2 check proof-copy, dù wrapper không phải ảnh chụp của riêng nó. Đây là lỗ hổng anti-forgery còn lại trong chính gate được lập ra để ngăn evidence giả.

**Fix:** thêm đối chiếu reference vào cùng hàm:
```ts
const refLight = hash('reference-light.png');
const refDark = hash('reference-dark.png');
if (light && refLight && light === refLight) errors.push('wrapper-light.png is a copy of reference-light.png');
if (dark && refDark && dark === refDark) errors.push('wrapper-dark.png is a copy of reference-dark.png');
```
kèm 1 regression test dựng tmp có wrapper=reference.

### WR-R2-02: Reproducibility sau fresh clone vẫn chưa đạt

**File:** `tests/helpers/parityHarness.ts:22-23`

**Issue:** `SP` mặc định là đường dẫn session-specific `/private/tmp/claude-503/-Users-.../<uuid>/scratchpad` — sẽ bị xoá khi reboot và không tồn tại trên máy/clone khác. 4 file fixture không được track trong git (`git ls-files | grep parityFixtures` → rỗng). Fix WR-05 chỉ thêm env override + pre-flight guard; fixer tự ghi nhận "fixture vẫn là hard dependency ngoài repo". Nên WR-05 được đánh dấu `fixed` là lạc quan: guard giúp fail rõ, nhưng fresh clone vẫn không tự boot được harness. Nếu thiết kế phase cố tình giữ fixture ở scratchpad ngoài repo, cần ghi rõ vào SMOKE.md/plan như một precondition có chủ đích thay vì để mặc định trỏ vào temp path chết.

**Fix:** tối thiểu bỏ default path cứng, bắt buộc `PARITY_SP` (throw nếu thiếu) để không có đường dẫn "giả vờ chạy được":
```ts
export const SP = process.env.PARITY_SP ?? (() => {
  throw new Error('PARITY_SP is required: scratchpad root with openidea/ and oi-prototype/ fixtures');
})();
```
Hoặc commit bản copy fixture vào `tests/fixtures/parity/` nếu fresh-clone reproducibility là yêu cầu thật.

---

_Reviewed: 2026-11-22T08:23:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_Round: R2_
