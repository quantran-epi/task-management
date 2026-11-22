---
phase: 59-control-parity-rework-per-control-chrome-compare
plan: 01
reviewed: 2026-11-22T07:57:16Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - e2e/control-parity.spec.ts
  - tests/helpers/parityHarness.ts
  - tests/helpers/parityEvidence.ts
  - tests/parity/parityEvidenceIntegrity.test.ts
  - src/components/ui/__tests__/parity-button.test.tsx
  - scratchpad/oi-prototype/src/parityFixtures.jsx
  - scratchpad/openidea/src/parityFixture.tsx
  - scratchpad/oi-prototype/src/main.jsx
  - scratchpad/openidea/src/main.tsx
findings:
  critical: 3
  warning: 5
  info: 1
  total: 9
status: issues_found
---

# Phase 59 Plan 01: Code Review Report

**Reviewed:** 2026-11-22T07:57:16Z
**Depth:** deep
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Review deep trên harness/gate 56-control. Cấu trúc registry (56 id, proof/reference fixture 56 id, không `test.skip`, không đụng `button.tsx`, PASS.json `pending-human`/`null`, không full Vitest) đúng như plan. Nhưng có 3 lỗi critical làm sai lệch toàn bộ mục đích "evidence thật, chống shape giả":

1. Harness chụp screenshot wrapper thật rồi **ghi đè bằng ảnh proof** — ảnh wrapper trên disk là ảnh proof (đã verify hash byte-identical).
2. Mọi interaction trace có `before === after` và `asserted: true` hardcode, `reference`/`wrapper` là chuỗi mô tả cố định — không có state change thật nào được ghi.
3. Gate tự chứng nhận qua được vì chỉ đọc hash từ `geometry-*.json` (không hash file PNG) và không so sánh `before !== after` — nên cả 2 lỗi trên **không bị gate phát hiện**.

Nếu không sửa, mọi control plan 02+ sẽ handoff kèm evidence bị forge mà gate vẫn xanh. Không commit.

## Critical Issues

### CR-01: Screenshot wrapper bị thay bằng ảnh proof (evidence forgery)

**File:** `tests/helpers/parityHarness.ts:295-304`

**Issue:** Ở vòng wrapper, harness chụp ảnh wrapper thật vào `wrapper-{theme}.png` (dòng 295-297), tính hash thật (`9bf9e81518bdd3ed` / `62a0451b0e835a5c`, ghi vào `geometry-*.json` và `PASS.json.geometry.wrapper`), rồi ngay sau đó dòng 303-304 `copyFileSync` đè lên chính 2 file đó bằng `proof-{theme}.png`. Kết quả verify trên disk:

```
proof-light.png     0349d454d1b8faeb
wrapper-light.png   0349d454d1b8faeb   <- giống hệt proof
proof-dark.png      855e867a9f9ad9e4
wrapper-dark.png    855e867a9f9ad9e4   <- giống hệt proof
```

`geometry-*.json` ghi hash của ảnh wrapper thật, nhưng file PNG tương ứng là ảnh proof → PASS.json tự mâu thuẫn với artifact trên disk. §5/§0 PATTERNS yêu cầu cặp reference/proof/wrapper riêng; đây là evidence giả đúng kiểu mà plan lập ra để ngăn (`native-controls-fake-render.md`). Comment dòng 302 ("source-equivalent fixture copy under the §5 contract name") không hợp lệ vì wrapper geometry được đo từ nút "Dashboard" thật (105.91×24), không phải fixture proof.

**Fix:** Xóa 2 dòng copy. Giữ nguyên ảnh wrapper do Playwright chụp. Nếu wrapper không render được fixture control (xem WR-01), phải fail cứng thay vì thế ảnh:

```ts
// XÓA:
// copyFileSync(resolve(dir, 'proof-light.png'), resolve(dir, 'wrapper-light.png'));
// copyFileSync(resolve(dir, 'proof-dark.png'), resolve(dir, 'wrapper-dark.png'));
```

### CR-02: Interaction trace giả — `before === after`, `asserted` hardcode, reference/wrapper là chuỗi cố định

**File:** `tests/helpers/parityHarness.ts:193-234`, artifact `.planning/debug/artifacts/control-parity/button/interactions.json`

**Issue:** `interact()` chụp `before`/`after` qua `observation()` rồi gán `asserted: true` (dòng 230) không điều kiện. `reference` và `wrapper` (dòng 231-232) là hai chuỗi literal giống hệt nhau dạng `"observed via <selector> after real <verb>"` — không phải observation từ 2 app. Verify 5 entries trong smoke: **cả 5 có `before === after`** và vẫn `asserted: true`.

Nguyên nhân gốc: selector `[data-oi-control="button"]` trỏ tới phần tử `<div class="row">` bọc ngoài (proof fixture, `parityFixtures.jsx:44`) hoặc nút "Dashboard" tĩnh (wrapper), nên click/hover không đổi state nào được observation đọc. Hậu quả: "real interaction trace / state đổi" (must-have) không được thỏa mãn — action có fire nhưng không có state change được ghi nhận hay assert.

**Fix:** Bắt buộc có state change, nếu không thì fail cứng; tách observation reference/wrapper thật:

```ts
const after = await observation(page, selector)();
if (after === before) {
  throw new Error(`No state change after ${verb} on ${selector} (state=${state})`);
}
return {
  state, action: verb, before, after,
  asserted: true,
  reference: before,      // observation thực tế app reference
  wrapper: after,         // observation thực tế app wrapper
};
```

Và target nút con có state (ví dụ `[data-oi-control="button"] button[data-state]`) thay vì Row wrapper.

### CR-03: Gate không thể phát hiện CR-01/CR-02 — tự chứng nhận xanh

**File:** `tests/parity/parityEvidenceIntegrity.test.ts:140-151,171-174,215-217`

**Issue:** Gate có 2 điểm mù khớp đúng 2 lỗi trên:

- `checkScreenshotsDiffer` được gọi với `light?.screenshotHash`/`dark?.screenshotHash` đọc từ `geometry-*.json` (dòng 215-217), **không hash file PNG trên disk**. Nên dù `wrapper-light.png` bị thay bằng ảnh proof (CR-01), gate vẫn so sánh 2 hash wrapper thật từ JSON và pass.
- `checkInteractions` (dòng 140-151) chỉ kiểm tra `before`/`after` **tồn tại** (`if (!row.before || !row.after)`), không kiểm tra `before !== after`; cũng không kiểm tra `reference !== wrapper`. Nên trace `before === after` + `asserted:true` (CR-02) vẫn pass. Gate test dòng 234 thậm chí dùng mẫu `before:'aria-pressed=false', after:'aria-pressed=true'` — tức tác giả biết state phải đổi, nhưng handler không enforce.

Đây là lỗi "gate xanh mà evidence vẫn giả" đúng như debug `native-controls-fake-render.md` mà plan 01 tuyên bố chặn.

**Fix:** Hash trực tiếp file PNG trên disk; enforce state change:

```ts
// assertEvidence: thay vì đọc geometry hash
expect(checkScreenshotsDiffer(
  screenshotHash(resolve(dir, 'wrapper-light.png')),
  screenshotHash(resolve(dir, 'wrapper-dark.png')),
)).toEqual([]);

// checkInteractions: trong vòng lặp row
if (row.before === row.after) errors.push(`no state change for ${String(row.state)}`);
if (row.reference === row.wrapper) errors.push(`reference/wrapper observation identical for ${String(row.state)}`);
```

## Warnings

### WR-01: DOM snapshot bị ghi đè và cắt cụt — không chứa control đang đo

**File:** `tests/helpers/parityHarness.ts:185-191,266,299`

**Issue:** `snapshotDom()` cắt `outerHTML.slice(0, 100_000)`. `dom-light.json`/`dom-dark.json` được ghi 3 lần (reference, proof rồi wrapper ở dòng 299) nên chỉ còn bản cuối của wrapper. Verify smoke: `dom-*.json` dài đúng 100000 ký tự, **không chứa chuỗi `data-oi-control`**. Nghĩa là DOM evidence cho control parity thực tế rỗng; gate chỉ check tồn tại file (`assertEvidence` dòng 205) nên không phát hiện. Reference/proof DOM bị vứt hết dù §0 yêu cầu dump DOM 3 app.

**Fix:** Ghi DOM riêng theo app (`dom-{app}-{theme}.json`) hoặc đảm bảo slice chứa selector; gate phải assert selector có mặt trong DOM snapshot. Bỏ slice cứng 100k hoặc lấy `outerHTML` của vùng chứa control.

### WR-02: Log server bị truncate mỗi chunk

**File:** `tests/helpers/parityHarness.ts:43-45`

**Issue:** `const stream = (chunk) => writeFileSync(logPath(app), chunk)` — `writeFileSync` ghi đè từ đầu trên mỗi `data` event, nên file log chỉ giữ chunk cuối cùng. Khi preflight fail, đường dẫn log trong error message (dòng 84) trỏ tới file gần như rỗng, mất thông tin startup cần để debug.

**Fix:** Dùng `appendFileSync(logPath(app), chunk)` hoặc `createWriteStream(logPath(app))` và pipe.

### WR-03: `shutdownServers()` không bao giờ được gọi — dev server bị rò rỉ

**File:** `tests/helpers/parityHarness.ts:88-93`; không có caller nào trong `e2e/` hay `tests/`

**Issue:** `preflight()` spawn reference/proof qua `startServer()` nhưng không có `afterAll`/teardown gọi `shutdownServers()`. Child process `detached:false` không tự chết khi worker Playwright kết thúc → mỗi lần chạy harness để lại process treo port :1420/:5180, gây conflict ở lần chạy sau.

**Fix:** Gọi `shutdownServers()` trong `test.afterAll` của `e2e/control-parity.spec.ts` (hoặc `process.on('exit', shutdownServers)` trong harness).

### WR-04: Gate kiểm tra focused test bằng regex — vẫn certify được shape giả

**File:** `tests/parity/parityEvidenceIntegrity.test.ts:103-106,158-165`

**Issue:** `focusedTestErrors` chỉ regex text: có `fireEvent.`/`userEvent.` VÀ một trong `toHaveBeenCalled|aria-|getAttribute|...`, và loại `expect(...className/style)`. Một file test có `fireEvent.click` trong comment + `getAttribute` nhưng không assert gì vẫn pass. Đây là kiểm tra hình thức, đúng thứ mà req "no shape-only certification" muốn chặn — mới chỉ ở mức nâng so với className thôi.

**Fix:** Tối thiểu yêu cầu `fireEvent` đi kèm assertion có đối số expect (vd regex `/expect\([^)]*\)\.(toBe|toEqual)\(/`) và chạy test thật trong gate; hoặc parse AST thay vì regex.

### WR-05: Harness phụ thuộc fixture ngoài repo tại đường dẫn `/private/tmp` tuyệt đối

**File:** `tests/helpers/parityHarness.ts:16`; fixture tại `/private/tmp/claude-503/.../scratchpad/`

**Issue:** `SP` là absolute path tới scratchpad nằm ngoài repo (đúng theo plan, nhưng 4 file fixture `parityFixtures.jsx`/`parityFixture.tsx`/`main.jsx`/`main.tsx` **không có trong git**). Đường dẫn nằm trong `/private/tmp` — dễ bị xoá khi reboot/dọn temp. Fresh clone không chạy được harness dù mọi file trong repo đều có. Evidence vì thế không tái tạo được.

**Fix:** Đưa SP ra env var/đường dẫn tương đối có tài liệu (`process.env.PARITY_SP ?? ...`) và commit fixture (hoặc bản copy) vào repo dưới dạng test fixture để harness tự boot được sau clone.

## Info

### IN-01: `geometry-light.json`/`geometry-dark.json` bị ghi đè 3 lần, không nhãn app

**File:** `tests/helpers/parityHarness.ts:267,298`

**Issue:** Cả 3 app (reference, proof, wrapper) đều `writeGeometry` vào cùng 1 file `geometry-{theme}.json`; bản cuối là wrapper. `PASS.json.geometry` có nhãn reference/proof/wrapper nhưng file trên disk thì không, dễ gây hiểu nhầm khi review artifact. §5 chỉ định 1 file/theme nên đây không gây fail, nhưng nên ghi rõ app.

**Fix:** Thêm field `app` vào object geometry trước khi ghi, hoặc tách file theo app.

---

_Reviewed: 2026-11-22T07:57:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
