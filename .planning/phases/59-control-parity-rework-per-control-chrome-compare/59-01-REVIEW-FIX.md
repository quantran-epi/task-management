---
phase: 59-control-parity-rework-per-control-chrome-compare
fixed_at: 2026-11-22T08:18:41Z
review_path: .planning/phases/59-control-parity-rework-per-control-chrome-compare/59-01-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 59 Plan 01: Code Review Fix Report

**Fixed at:** 2026-11-22T08:18:41Z
**Source review:** .planning/phases/59-control-parity-rework-per-control-chrome-compare/59-01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (3 critical, 5 warning, 1 info)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: Screenshot wrapper bị thay bằng ảnh proof (evidence forgery)

**Files modified:** `tests/helpers/parityHarness.ts`, `tests/parity/parityEvidenceIntegrity.test.ts`, `.planning/debug/artifacts/control-parity/button/{wrapper-light,wrapper-dark,proof-light}.png`
**Commit:** `947ee1cd`, `4c9007b6`, `3c698651`
**Applied fix:** Xóa 2 dòng `copyFileSync` ghi đè wrapper PNG. Gate hash trực tiếp PNG trên disk và chặn wrapper==proof byte-identical. Re-smoke: wrapper-light `9bf9e815…`, wrapper-dark `62a0451b…` (khác proof), khớp hash geometry.

### CR-02: Interaction trace giả — `before === after`, `asserted` hardcode, reference/wrapper literal

**Files modified:** `tests/helpers/parityHarness.ts`, `tests/parity/parityEvidenceIntegrity.test.ts`, `.planning/debug/artifacts/control-parity/button/interactions.json`
**Commit:** `947ee1cd`, `4c9007b6`, `3c698651`
**Applied fix:** `interact()` target control node thực (hoặc child có state), reset pointer/focus trước mỗi action, observation gồm ARIA/data-state/computed style; fail cứng nếu `after === before`; `reference=before`, `wrapper=after` là observation thật. Gate chặn `before===after`, `reference===wrapper`, và mismatch reference/wrapper với before/after. 5 entry smoke đều `before!==after`.

### CR-03: Gate tự chứng nhận — không hash PNG, không enforce state change

**Files modified:** `tests/parity/parityEvidenceIntegrity.test.ts`
**Commit:** `947ee1cd`
**Applied fix:** `checkOnDiskScreenshots(dir)` hash bytes trên disk (wrapper L/D + so proof copy), dùng trong `assertEvidence`. `checkInteractions` enforce state change + distinct observations. 6 failing test được thêm trước (red), sau đó implemented (green). Gate: 15 passed.

### WR-01: DOM snapshot bị ghi đè và cắt cụt

**Files modified:** `tests/helpers/parityHarness.ts`, `tests/helpers/parityEvidence.ts`, `tests/parity/parityEvidenceIntegrity.test.ts`, artifacts `dom-*.json`
**Commit:** `947ee1cd`, `4c9007b6`, `3c698651`
**Applied fix:** `writeDom(dir, theme, app, dom)` ghi `dom-{app}-{theme}.json` riêng cho 3 app + giữ legacy `dom-{theme}.json` (wrapper). `snapshotDom(page, selector)` đính kèm `controlHtml` chứa selector và flag `truncated` khi cắt 100k. Gate `checkDomSelectors` assert selector + flag có mặt.

### WR-02: Log server bị truncate mỗi chunk

**Files modified:** `tests/helpers/parityHarness.ts`
**Commit:** `4c9007b6`
**Applied fix:** `appendFileSync` thay `writeFileSync` trong stream handler; truncate có chủ đích 1 lần lúc start.

### WR-03: `shutdownServers()` không bao giờ được gọi

**Files modified:** `e2e/control-parity.spec.ts`
**Commit:** `4c9007b6`
**Applied fix:** `test.afterAll(() => shutdownServers())` trong describe.

### WR-04: Gate focused-test bằng regex dễ bị certify shape giả

**Files modified:** `tests/parity/parityEvidenceIntegrity.test.ts`
**Commit:** `947ee1cd`
**Applied fix:** Strip comment trước khi scan; yêu cầu `fireEvent|userEvent.<verb>` thật + matcher `expect(...).to...(...)` có đối số (hỗ trợ nested parens); vẫn chặn className/style static. Failing test cho fireEvent trong comment → green sau fix.

### WR-05: Harness phụ thuộc fixture `/private/tmp` tuyệt đối

**Files modified:** `tests/helpers/parityHarness.ts`
**Commit:** `4c9007b6`
**Applied fix:** `SP = process.env.PARITY_SP ?? <default>`. `preflight()` gọi `assertFixtures()` → fail rõ, hướng dẫn set `PARITY_SP`, không capture im lặng. Fixture scratchpad vẫn là hard dependency ngoài repo (đúng thiết kế phase) nhưng giờ có pre-flight guard và env override. SMOKE.md ghi rõ.

### IN-01: geometry-{light,dark}.json ghi đè 3 lần, không nhãn app

**Files modified:** `tests/helpers/parityEvidence.ts`, `tests/helpers/parityHarness.ts`
**Commit:** `4c9007b6`, `3c698651`
**Applied fix:** Thêm field `app?: string` vào `Geometry`; mỗi lần `writeGeometry` kèm `app` ('reference'/'proof'/'wrapper'). PASS.json geometry có nhãn rõ.

## Skipped Issues

None.

## Verification

3 lệnh yêu cầu, đều xanh sau fix:
- `SMOKE=1 PARITY_CONTROL=button npx playwright test e2e/control-parity.spec.ts --grep "button" --reporter=list` → 1 passed.
- `SMOKE=1 PARITY_CONTROL=button npx vitest run tests/parity/parityEvidenceIntegrity.test.ts --bail=1` → 15 passed.
- `npx vitest run src/components/ui/__tests__/parity-button.test.tsx --bail=1` → 3 passed.
- `npx tsc --noEmit` → clean.

`PASS.json` vẫn `status="pending-human"`, `humanVerdict=null`, `consoleErrors=[]`. Không đụng `src/components/ui/button.tsx`. Không chạy full Vitest.

---

_Fixed: 2026-11-22T08:18:41Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
