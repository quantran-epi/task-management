# SMOKE — Button (Phase 59 / plan 01, post-review fix)

Chế độ: `SMOKE=1`, `PARITY_CONTROL=button`, `PARITY_SP=<scratchpad root>`. Không hạ tiêu chí gate.

## Lệnh đã chạy (đều xanh)

```bash
SMOKE=1 PARITY_CONTROL=button PARITY_SP=<scratchpad> npx playwright test e2e/control-parity.spec.ts --grep "button" --reporter=list
# 1 passed

SMOKE=1 PARITY_CONTROL=button npx vitest run tests/parity/parityEvidenceIntegrity.test.ts --bail=1
# 15 tests passed (10 gate cases + 5 regression cases cho CR-01/CR-02/CR-03/WR-04)

npx vitest run src/components/ui/__tests__/parity-button.test.tsx --bail=1
# 3 tests passed

npx tsc --noEmit
# clean
```

## Artifacts

- 3 app × light/dark = 6 screenshot thật (reference, proof, wrapper). `wrapper-*.png` là ảnh Playwright chụp, KHÔNG copy từ proof (CR-01). Hash disk: wrapper-light `9bf9e81518bdd3ed`, wrapper-dark `62a0451b0e835a5c` — khác proof.
- 13 computed metric/geometry + field `app` theo §5 (IN-01).
- 5 interaction entries: click/hover thật trên control node hoặc child có state, mỗi entry `before !== after`, `reference === before`, `wrapper === after` (CR-02). Observation gồm ARIA, `data-state`, computed background/color/shadow, focus.
- DOM snapshot riêng per-app (`dom-{reference,proof,wrapper}-{light,dark}.json`) + legacy `dom-{theme}.json` (wrapper). Mỗi snapshot có `controlHtml` chứa selector, `truncated` flag (WR-01).
- Server log dùng `appendFileSync`; `shutdownServers()` chạy trong `afterAll` (WR-02/WR-03).
- `PASS.json`: `status="pending-human"`, `humanVerdict=null`, `consoleErrors=[]`.
- Gate hash trực tiếp PNG trên disk, chặn copy proof, chặn `before===after`, chặn `reference===wrapper` (CR-03).

## Pre-flight fail cứng (B3)

`preflight()` gọi `assertFixtures()` → fail rõ nếu `PARITY_SP` không trỏ tới scratchpad chứa `openidea/` + `oi-prototype/`. URL unreachable → throw `PRE-FLIGHT FAILED [...]`, exit nonzero. Không `test.skip`.

## Ghi chú

- Fixture scratchpad nằm ngoài repo (`/private/tmp`), truyền qua `PARITY_SP`. Fresh clone cần cung cấp scratchpad root có 2 app fixture (WR-05); pre-flight chặn rõ khi thiếu.
- Console noiseBenign (404 favicon, React warning `block` ở `segmented.tsx`) bị lọc; deferred, không đụng production code.
- Reference dark dùng `data-theme="dark"`; proof dùng `button.themeBtn` + dataset.
- Không đụng `src/components/ui/button.tsx`. Không dependency mới. Không PWA. Không full Vitest.
