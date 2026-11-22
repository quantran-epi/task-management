# SMOKE — Button (Phase 59 / plan 01)

Chế độ: `SMOKE=1`, `PARITY_CONTROL=button`. Không hạ tiêu chí gate.

## Lệnh đã chạy (đều xanh)

```bash
SMOKE=1 PARITY_CONTROL=button npx playwright test e2e/control-parity.spec.ts --grep "button" --reporter=list
# 1 passed

SMOKE=1 PARITY_CONTROL=button npx vitest run tests/parity/parityEvidenceIntegrity.test.ts --bail=1
# 9 tests passed

npx vitest run src/components/ui/__tests__/parity-button.test.tsx --bail=1
# 3 tests passed

npx tsc --noEmit
# clean
```

## Artifacts

- 3 app × light/dark = 6 screenshot (reference, proof, wrapper).
- 13 computed metric/geometry: width, height, fontSize, padding, margin, border, borderRadius, boxShadow, iconWidth, iconHeight, alignment, overflow, screenshotHash.
- 5 interaction entries: click/hover thật từ reference + proof + wrapper, có before/after + asserted=true.
- `PASS.json`: `status="pending-human"`, `humanVerdict=null`, `consoleErrors=[]`.
- 12 file artifact theo §5: reference/wrapper L/D png, dom L/D, geometry L/D, interactions.json, DIFF.md, PASS.md, PASS.json.

## Pre-flight fail cứng (B3)

Thử nghiệm cô lập: thay `fetch` bằng stub unreachable → `preflight()` throw `PRE-FLIGHT FAILED [reference] ... unreachable after 30s. Start: ... Log: ...`, thoát nonzero. Không `test.skip`.

## Ghi chú

- Console noiseBenign (404 favicon, React warning `block` có sẵn ở `segmented.tsx`) bị lọc; đây là lỗi ngoài phạm vi plan 01, ghi deferred thay vì sửa production code.
- Reference dark dùng `data-theme="dark"` trên `:root` (token base), KHÔNG dùng `data-contrast=high` (đó là palette dark-hc khác).
- Không đụng `src/components/ui/button.tsx`. Không dependency mới. Không PWA.
