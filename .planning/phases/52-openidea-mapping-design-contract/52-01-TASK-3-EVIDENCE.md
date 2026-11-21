---
artifact: 52-01-VERIFICATION
phase: 52-openidea-mapping-design-contract
plan: 01
created: 2026-11-22
scope: MAP-01, MAP-02, MAP-03
status: passed — documentation-only verification, no source changes
---

# 52-01 — Bằng chứng verify design contract

Contract `.planning/phases/52-openidea-mapping-design-contract/52-UI-SPEC.md` đã `status: approved` (gsd-ui-checker, 2026-11-22, 6/6 dimension). Plan này CHỈ verify/khóa — không sửa contract, không đổi `src/`, không cài dependency, không chạy full Vitest.

## Task 3 — MAP-03 API lock + baseline + focused gate

Gate từ PLAN §Task 3:

```
CONTRACT_SECTIONS_OK

 RUN  v5.0.2

 Test Files  3 passed (3)
      Tests  12 passed (12)
   Duration  1.76s

src status: []
```

- §7.1 đủ 10 khía cạnh API, cột After = byte-for-byte giữ nguyên/không đổi.
- §7.2 đúng 56 dòng, cột Sau = `identical` mọi wrapper; `data-oi-control`/`data-state`/`data-lead` ghi rõ là measurement hook, không phải prop API.
- §6 copy VN byte-for-byte (`Xác nhận`/`Hủy`, duration 4.5, topRight, pauseOnHover, realtime không reload).
- §9 keyboard/focus/validation/a11y đo được: focus `rgb(56,113,225)` offset 1 (icon -2), focus trap, backdrop transparent, double ring invalid, reduced motion, forced colors, no reload.
- §8 token migration ghi before→after: controlHeight 30→28, accent `#2f62d8`/`#6a9bff`→`#3871e1` both, popup radius 8→10, `--danger` control-level tách D-12, bg-input dark `#191a1c`, 6 bước migration đến Phase 56.
- Focused Vitest: 3 file / 12 test passed. Không chạy full suite.
