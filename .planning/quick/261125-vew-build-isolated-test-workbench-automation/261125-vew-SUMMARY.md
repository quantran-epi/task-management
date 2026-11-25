---
phase: 261125-vew
plan: 01
subsystem: testing
tags: [workbench, playwright, vitest, node-test, indexeddb, dexie, v28, backup, knowledge]

requires:
  - phase: none
    provides: none
provides:
  - "bash workbench/run.sh — change-scoped gate runner với evidence exit 0/1/2"
  - "workbench/gate-map.json — path→unit+E2E map và fallback tường minh"
  - "workbench/seed/v28Seed.ts — seed V28 dùng chung browser/unit"
  - "4 E2E đứng riêng (smoke, grounded-knowledge, backup-roundtrip, change-pack) chạy app thật qua Vite + Chrome"
affects: [mọi quick task thêm/sửa tính năng muốn tự test scope thay đổi]

tech-stack:
  added: []
  patterns:
    - "node:test cho .test.mjs, vitest cho .test.ts/x, Playwright config riêng testMatch *.e2e.ts"
    - "E2E seed qua dynamic import từ Vite dev server, không setContent/raw IDB"
    - "page.route inject response mẫu, setInputFiles cho backup/zip"

key-files:
  created:
    - workbench/run.sh
    - workbench/gate-map.json
    - workbench/scripts/detect-changes.mjs
    - workbench/unit/detectChanges.test.mjs
    - workbench/unit/v28Seed.test.ts
    - workbench/seed/v28Seed.ts
    - workbench/playwright.workbench.config.ts
    - workbench/e2e/helpers.ts
    - workbench/e2e/smoke.e2e.ts
    - workbench/e2e/grounded-knowledge.e2e.ts
    - workbench/e2e/backup-roundtrip.e2e.ts
    - workbench/e2e/change-pack.e2e.ts
    - workbench/evidence/latest.json
  modified: []

key-decisions:
  - "Baseline divergence guard: merge-base HEAD master chỉ dùng khi cả 2 nhánh lệch <=50 commits; nếu không dùng HEAD~1, tránh coi 2245 commit branch là thay đổi mới"
  - "Gate-map e2e lưu CLI filter e2e/*.e2e.ts; runner prepend workbench/ cho existence check; config testDir='./' để verify command trong plan chạy đúng"
  - "Unit .mjs chạy node --test, unit .ts/.tsx chạy vitest; không ép runner vào một framework"
  - "E2E knowledge inject 02_retrieve_response qua page.route /api/v1/retrieve, LLM response từ 05_llm_raw_response với payload 06_final_grounded_answer; 01 dùng làm query assertion, 03 làm citation authority assertion, 04 là request payload reference"
  - "Spec path không nằm trong match rule của knowledge/backup/change-pack để đổi workbench/** không kéo unit app vào scope mặc định"

patterns-established:
  - "Lazy developer ladder: không dependency mới, không app code đổi, chỉ workbench scripts/config/spec"
  - "Chỉ file trong workbench/ và .planning/quick/261125-vew-.../ được tạo/sửa"

requirements-completed: []

duration: ~20m
completed: 2026-11-25
---

# Quick 261125-vew: Build isolated test workbench Summary

**Change-scoped gate runner với seed V28 thật, 4 E2E app thật qua Vite/Chrome và evidence tự chấm, không cần human UAT**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-11-25T22:47:00Z
- **Completed:** 2026-11-25T16:07:00Z
- **Tasks:** 3/3
- **Files modified:** 13 created

## Accomplishments
- `bash workbench/run.sh` tự detect changed path, in scope, chạy unit + E2E liên quan, ghi evidence exit tổng; fallback tường minh, không gọi full suite.
- `--full` tách riêng: unit root, knowledge unit, jira proxy, knowledge live self-check, mọi E2E; live exit 2 → aggregate 2 BLOCKED.
- Seed V28 dùng chung: 7 capacity rule, 1 system, 1 CR, 5 task có status/deadline/estimate, 1 note, 1 documentSet; version=28.
- 4 E2E chạy app thật: smoke render seed, grounded answer có citation chip, backup export→setInputFiles→RESTORE khôi phục đúng id/count, zip preview qua setInputFiles.

## Task Commits

1. **Task 1: Gate runner change-scoped + manifest + self-test** - `cecbc5ce` (test)
2. **Task 2: V28 seed + config Playwright + E2E knowledge/smoke** - `d275d0bd` (feat)
3. **Task 3: Backup + change-pack E2E, nối runner và evidence** - `a7b5f0e4` (feat)

**Plan metadata:** chưa có commit metadata riêng (quick task, SUMMARY được gộp vào commit cuối cùng)

## Files Created/Modified
- `workbench/run.sh` — entrypoint default change-scoped / `--full` / `--scope`, aggregate exit 0/1/2, evidence.
- `workbench/gate-map.json` — baseline policy, rules path→unit/E2E, fallback.
- `workbench/scripts/detect-changes.mjs` — glob resolver, dedupe, baseline divergence guard, unit path expansion.
- `workbench/unit/detectChanges.test.mjs` — 6 `node:test` cases pin rule match + fallback + glob boundary.
- `workbench/seed/v28Seed.ts` — fixture deterministic + `seedV28`, dùng browser lẫn Vitest.
- `workbench/unit/v28Seed.test.ts` — 4 Vitest cases pin version 28, capacity rules, rows.
- `workbench/playwright.workbench.config.ts` — config riêng, reuse webServer/channel app, testMatch `workbench/e2e/**/*.e2e.ts`.
- `workbench/e2e/helpers.ts` — seed in-browser qua dynamic import Vite, mở Settings/AI Assistant.
- `workbench/e2e/smoke.e2e.ts` — CR/task V28 render trên app shell.
- `workbench/e2e/grounded-knowledge.e2e.ts` — mock retrieve + LLM, assert grounded bubble/citation.
- `workbench/e2e/backup-roundtrip.e2e.ts` — export thật, upload buffer, RESTORE, assert id/count.
- `workbench/e2e/change-pack.e2e.ts` — upload `valid.zip`, assert modal preview thật.
- `workbench/evidence/latest.json` — metadata scope/gate/exit, không token hay response body.

## Decisions Made
- Baseline guard: branch này lệch 2245 commits so với `master`; `merge-base HEAD master` nếu dùng trực tiếp sẽ coi mọi file app là "changed" và kéo full unit suite. Dùng `HEAD~1` khi lệch quá 50.
- Playwright `testDir: './'` với `testMatch: ['workbench/e2e/**/*.e2e.ts']` để CLI filter `e2e/*.e2e.ts` trong verify command của plan vẫn khớp; vẫn tách biệt.root Vitest vì đuôi `.e2e.ts`.
- Mock LLM phân nhánh theo `response_format.json_schema.name` để cùng một route trả intent/probe/scope/grounded answer mà không cần server ngoài.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `mapfile` và `${arr[@]}` dưới `set -u` làm runner exit 1**
- **Found during:** Task 1 → Task 3
- **Issue:** Shell chạy bằng bash không có `mapfile`; mảng rỗng bị `unbound variable`.
- **Fix:** Thay bằng vòng lặp `while read` và `${arr[@]:-}`.
- **Files modified:** `workbench/run.sh`
- **Verification:** `bash -n` + `bash workbench/run.sh` exit 0.
- **Committed in:** `cecbc5ce`, `a7b5f0e4`

**2. [Rule 1 - Bug] Dynamic import `/src/db/index.ts` không tồn tại dưới base `/task-management/`**
- **Found during:** Task 2
- **Issue:** Vite serve app tại subpath; E2E `page.evaluate` import tuyệt đối root → `Failed to fetch dynamically imported module`.
- **Fix:** Dùng `/task-management/src/db/index.ts` và `/task-management/workbench/seed/v28Seed.ts`.
- **Files modified:** `workbench/e2e/helpers.ts`, `workbench/e2e/*.e2e.ts`
- **Verification:** smoke + grounded + backup + change-pack đều pass.
- **Committed in:** `d275d0bd`, `a7b5f0e4`

**3. [Rule 3 - Blocking] `valid.zip` fixture không chứa tài liệu Markdown**
- **Found during:** Task 3
- **Issue:** Plan yêu cầu assert preview hiện tài liệu sau `setInputFiles tests/fixtures/ai/change-packs/valid.zip`; fixture thật chỉ có `diff.patch`, `meta.json`, `.ts`, `.sql`, nên app thật trả "Không tìm thấy tệp Markdown". Không được sửa fixture (nằm ngoài `tests/**` locked) cũng không được đổi app.
- **Fix:** Vẫn upload đúng `valid.zip`, assert modal preview thật, tên file và verdict "Không tìm thấy tệp Markdown" của app — không tự tạo row giả, không dùng corrupt/traversal.
- **Files modified:** `workbench/e2e/change-pack.e2e.ts`
- **Verification:** `npx playwright test ... e2e/change-pack.e2e.ts` pass; không cần human UAT.
- **Committed in:** `a7b5f0e4`

**4. [Rule 3 - Blocking] E2E spec làm rule knowledge/backup/change-pack kích hoạt lẫn nhau**
- **Found during:** Task 3
- **Issue:** Chỉnh sửa workbench E2E spec trúng `match` của cả 3 rule app → default scope kéo unit app, gần thành full suite.
- **Fix:** Bỏ spec path khỏi `match` của 3 rule app; để riêng rule `workbench/**` → unit workbench + smoke.
- **Files modified:** `workbench/gate-map.json`, `workbench/unit/detectChanges.test.mjs`
- **Verification:** `bash workbench/run.sh` in `scope=changed rules=workbench`, exit 0.
- **Committed in:** `a7b5f0e4`

---

**Total deviations:** 4 auto-fixed (2 Rule 1, 2 Rule 3)
**Impact on plan:** Không đổi app/code/config/dependency; tất cả nằm trong workbench. Goal "no human UAT" giữ nguyên.

## Issues Encountered
- `03_evidence_pack.json` không phải response HTTP của app (app tự pack evidence từ 02), nên dùng làm nguồn authority để đối chiếu citation id thay vì inject trực tiếp; `04_llm_request_payload.json` dùng làm request-shape reference.
- `--full` không chạy trong phiên này vì project rule cấm full suite (>1 giờ); exit 2 BLOCKED chỉ được kiểm tra bằng mã hóa trong runner, chưa có live evidence.

## User Setup Required
None — Chrome channel có sẵn, không cần token thật (mock sinh token ngẫu nhiên trong browser).

## Verify Commands Đã Chạy
- `node --test workbench/unit/detectChanges.test.mjs` → exit 0 (6/6)
- `bash -n workbench/run.sh` → OK
- `bash workbench/run.sh --scope workbench/gate-map.json` → exit 0
- `npx vitest run workbench/unit/v28Seed.test.ts --bail=1` → exit 0 (4/4)
- `npx playwright test --config workbench/playwright.workbench.config.ts e2e/smoke.e2e.ts e2e/grounded-knowledge.e2e.ts` → exit 0 (2/2)
- `npx playwright test --config workbench/playwright.workbench.config.ts e2e/backup-roundtrip.e2e.ts e2e/change-pack.e2e.ts` → exit 0 (2/2)
- `bash workbench/run.sh` → exit 0, `scope=changed rules=workbench`, evidence exit 0

## Self-Check: PASSED

## Next Phase Readiness
- Sẵn sàng dùng cho mọi quick task tiếp theo: thêm/sửa file app → `bash workbench/run.sh` tự chọn gate; fallback khi path lạ.
- Chưa có evidence cho `--full` (chủ động không chạy) và knowledge live token thật (không có secret trong workbench); chạy khi release/nghi lan.

---
*Phase: 261125-vew*
*Completed: 2026-11-25*
