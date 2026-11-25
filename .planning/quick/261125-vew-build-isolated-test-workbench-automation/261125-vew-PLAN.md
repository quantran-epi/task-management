---
phase: 261125-vew
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workbench/run.sh
  - workbench/gate-map.json
  - workbench/scripts/detect-changes.mjs
  - workbench/unit/detectChanges.test.mjs
  - workbench/playwright.workbench.config.ts
  - workbench/seed/v28Seed.ts
  - workbench/unit/v28Seed.test.ts
  - workbench/e2e/smoke.e2e.ts
  - workbench/e2e/grounded-knowledge.e2e.ts
  - workbench/e2e/backup-roundtrip.e2e.ts
  - workbench/e2e/change-pack.e2e.ts
  - workbench/evidence/latest.json
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Mỗi lần thêm/sửa tính năng, chạy `bash workbench/run.sh` là tự nhận diện file đổi, chạy đúng gate liên quan (unit module đổi + E2E tương ứng) với seed V28 thật, tự in PASS/FAIL, exit 0/1 — không gọi sếp, không human UAT, không click Chrome tay"
    - "Không map được path thì fallback chạy unit gần nhất + E2E smoke; KHÔNG âm thầm chạy full suite"
    - "Full gate chỉ chạy khi `bash workbench/run.sh --full` (release/nghi lan); gồm unit root, knowledge unit, jira proxy, knowledge live self-check, mọi E2E và evidence"
    - "E2E đi app thật qua webServer Vite hiện có (channel chrome), seed V28 qua TaskPlannerDatabase + initializeDatabaseDefaults, knowledge inject bằng page.route từ 6 JSON sample_ai_chat_turn, backup/zip roundtrip qua setInputFiles"
    - "Mọi file tạo ra nằm trong workbench/ hoặc .planning/quick/261125-vew-.../; không sửa src/**, e2e/**, tests/**, config app, package.json, dependency"
  artifacts:
    - path: workbench/run.sh
      provides: "Entrypoint: mặc định change-scoped, --full, --scope <path>; aggregate exit 0/1/2; ghi evidence"
    - path: workbench/gate-map.json
      provides: "Map path→gate (unit paths + E2E specs) và fallback rule"
    - path: workbench/scripts/detect-changes.mjs
      provides: "Đọc git diff/untracked, resolve gate, in scope đã chọn"
    - path: workbench/playwright.workbench.config.ts
      provides: "Config Playwright riêng, reuse app webServer/channel, testDir workbench, testMatch *.e2e.ts"
    - path: workbench/seed/v28Seed.ts
      provides: "Seed V28 dùng chung fake-indexeddb và browser (import qua Vite dev URL)"
    - path: workbench/e2e/grounded-knowledge.e2e.ts
      provides: "E2E app thật, inject 6 response mẫu bằng page.route"
    - path: workbench/e2e/backup-roundtrip.e2e.ts
      provides: "E2E export→setInputFiles→xác nhận khôi phục→assert row V28"
    - path: workbench/e2e/change-pack.e2e.ts
      provides: "E2E setInputFiles zip fixture có sẵn"
    - path: workbench/evidence/latest.json
      provides: "Evidence tự chấm: scope, gate, lệnh, exit code, timestamp"
  key_links:
    - from: workbench/run.sh
      to: workbench/scripts/detect-changes.mjs
      via: "gọi detect để lấy unit+E2E paths trước khi chạy"
      pattern: "detect-changes.mjs|gate-map.json"
    - from: workbench/scripts/detect-changes.mjs
      to: workbench/gate-map.json
      via: "match rule theo changed path, else fallback"
      pattern: "rules|fallback"
    - from: workbench/e2e/*.e2e.ts
      to: workbench/seed/v28Seed.ts
      via: "page.evaluate dynamic import('/src/db/index.ts') rồi gọi seed; không setContent"
      pattern: "addInitScript|page.evaluate|import\\('/src/db"
    - from: workbench/playwright.workbench.config.ts
      to: playwright.config.ts (read-only)
      via: "dùng lại command/url/channel, override cwd=repo root và testMatch"
      pattern: "webServer.cwd|testMatch"
---

<objective>

Dựng workbench tự test trong worktree `test/workbench-automation`: một lệnh `bash workbench/run.sh` nhận diện thay đổi và chạy đúng gate liên quan với dữ liệu V28 thật, tự trả pass/fail. `--full` chỉ dành cho release/nghi ngờ lan.

Mục tiêu duy nhất: Claude tự test được, KHÔNG CẦN gọi sếp. Chrome channel có sẵn và được phép dùng cho E2E/screenshot/evidence; không cần human UAT hay click tay.

Ranh giới cứng (locked): CHỈ test + fixture/seed + script chạy test + evidence. Không sửa/rename/thêm code app (`src/**`, `e2e/**`, `package.json`, `vite.config.ts`, `playwright.config.ts`, `tsconfig*`, `eslint.config.mjs`, `docker-compose.yml`, `.github/**`, `CLAUDE.md`); không thêm dependency; không middleware/stub server ngoài đường chạy test; không đổi behavior app để dễ test. Mọi file mới nằm trong `workbench/` hoặc `.planning/quick/261125-vew-.../`. Skill `sketch-findings-task-management` chỉ là design-only cho doc-set/profile — không áp dụng vào workbench này.

</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@playwright.config.ts (đọc, KHÔNG sửa)
@vite.config.ts (đọc, KHÔNG sửa)
@src/db/index.ts (TaskPlannerDatabase, db name 'PersonalTaskPlannerDB')
@src/db/schema.ts (SCHEMA_V28, LATEST_SCHEMA_VERSION=28)
@src/db/seeds.ts:9 (initializeDatabaseDefaults)
@sample_ai_chat_turn/*.json (6 response mẫu)
@tests/fixtures/ai/change-packs/valid.zip
@scripts/test-knowledge-live.mjs (exit 0/1/2)
@src/components/settings/BackupImportCard.tsx (input accept .json,application/json)
@src/services/knowledge/knowledgeConfig.tsx (key knowledge_server_enabled / _base_url / _token)
@e2e/coding-zone.tsx (pattern __TAURI_INTERNALS__)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Gate runner change-scoped + manifest + self-test</name>
  <files>workbench/run.sh, workbench/gate-map.json, workbench/scripts/detect-changes.mjs, workbench/unit/detectChanges.test.mjs</files>
  <behavior>
    - Rule match: đổi `src/services/knowledge/**` → unit `tests/knowledge` + E2E `e2e/grounded-knowledge.e2e.ts`
    - Đổi `src/db/**` hoặc `src/services/backup/**` → unit backup/crypto/schema + E2E `e2e/backup-roundtrip.e2e.ts`
    - Đổi `src/components/notes/DocsLibraryActions.tsx` hoặc fixture change-pack → E2E `e2e/change-pack.e2e.ts`
    - Path không map → fallback unit `workbench/unit/detectChanges.test.mjs` + E2E `e2e/smoke.e2e.ts`, evidence ghi `scope=fallback`, KHÔNG gọi `npm test`
    - Nhiều rule trúng → union, dedupe; scope in ra stdout trước khi chạy
  </behavior>
  <action>Tạo `workbench/gate-map.json` với `baseline` (mặc định `git merge-base HEAD master`, fallback `HEAD`), mảng `rules` (match glob, unit paths, e2e specs) và `fallback`. Tạo `workbench/scripts/detect-changes.mjs`: lấy changed paths = union của `git diff --name-only $BASELINE`, `git diff --name-only`, `git ls-files --others --exclude-standard` (không dùng bare stash), resolve theo manifest bằng glob đơn giản tự viết (không thêm dep), in `{scope, changed, unit, e2e}` dạng JSON cho run.sh. Tạo `workbench/unit/detectChanges.test.mjs` dùng `node:test` + `assert` để pin 4 behavior trên bằng fixture path cứng (không cần git thật). Tạo `workbench/run.sh`: mặc định gọi detect rồi chạy `npx vitest run <unit paths> --bail=1` (bỏ qua nếu rỗng) + `npx playwright test --config workbench/playwright.workbench.config.ts <e2e specs>`; `--scope <path>` cho phép chọn tay mà vẫn đi detect; `--full` chạy `npm test -- --bail=1`, `npm run test:knowledge`, `node --test proxy/jira-proxy.test.mjs`, `node scripts/test-knowledge-live.mjs --self-check` (nếu có KNOWLEDGE_SERVER_TOKEN thì chạy thêm live), mọi E2E workbench, rồi aggregate. Exit 0 pass / 1 fail / 2 BLOCKED khi knowledge live trả 2 (BLOCKED không được tính pass). Ghi `workbench/evidence/latest.json`: timestamp, scope, changed, lệnh đã chạy, exit từng gate, exit tổng. KHÔNG gọi full suite trong đường mặc định, KHÔNG log token hay response body knowledge. Chưa có E2E specs thì vẫn viết runner trước; Task 2/3 tạo specs.</action>
  <verify>
    <automated>node --test workbench/unit/detectChanges.test.mjs && bash -n workbench/run.sh && bash workbench/run.sh --scope workbench/gate-map.json; test $? -le 1</automated>
  </verify>
  <done>Resolver pass cả 4 case; run.sh có cú pháp đúng, chạy scope tay in scope=explicit và không gọi `npm test`; evidence/latest.json có exit tổng 0 hoặc 1.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: V28 seed dùng chung + config Playwright riêng + E2E knowledge/smoke</name>
  <files>workbench/seed/v28Seed.ts, workbench/unit/v28Seed.test.ts, workbench/playwright.workbench.config.ts, workbench/e2e/smoke.e2e.ts, workbench/e2e/grounded-knowledge.e2e.ts</files>
  <behavior>
    - Seed tạo TaskPlannerDatabase mới, gọi initializeDatabaseDefaults, bulkAdd 1 systems + 1 changeRequests + 5 tasks (status/deadline/estimate thật) + 1 note + 1 documentSets; assert count/truy vấn khớp và version=28
    - E2E smoke: app thật boot qua Vite webServer, seed hiện trên UI (CR/task), không page.setContent
    - E2E knowledge: page.route chặn `/api/v1/retrieve` trả `02_retrieve_response.json`; lần lượt inject `03_evidence_pack.json`, `06_final_grounded_answer.json` theo đúng endpoint app dùng (đọc knowledgeClient.ts để lấy path); assert grounded answer render có citation và không có lỗi fallback
  </behavior>
  <action>Tạo seed module export `seedV28(db?)` và `v28FixtureRows()` — import `TaskPlannerDatabase`/`initializeDatabaseDefaults` từ src, dùng types có sẵn, id `crypto.randomUUID`, ngày `YYYY-MM-DD`. Dùng được trong Vitest (fake-indexeddb qua tests/setup.ts) và trong browser: E2E gọi `page.evaluate` với `await import('/src/db/index.ts')` + module seed qua Vite dev server rồi reload, KHÔNG inject raw IDB, KHÔNG setContent. Tạo config `workbench/playwright.workbench.config.ts`: import config gốc (đọc-only), giữ command/url webServer và `channel: 'chrome'`, override `testDir` về thư mục workbench, `testMatch: ['e2e/**/*.e2e.ts']` (đuôi `.e2e.ts` để root Vitest không nhặt), `webServer.cwd` = repo root (nếu không root config sẽ chạy npm run dev sai chỗ), reuseExistingServer=true. E2E smoke dùng selector hiện có từ app (đọc e2e/adoption.spec.ts và TitleBar/CRExplorer). E2E knowledge seed settings `knowledge_server_enabled=true`, base URL dummy local, token test-only nhập qua `aria-label="Token phiên"` (không ghi token vào file/source), route fulfill JSON mẫu, assert bubble grounded/citation bằng testid thật từ src/components/ai/ChatMessageBubble.tsx. Mọi assert tự chấm; screenshot thất bại lưu `workbench/evidence/shots/` nếu cần. Không sửa app để dễ test.</action>
  <verify>
    <automated>npx vitest run workbench/unit/v28Seed.test.ts --bail=1 && npx playwright test --config workbench/playwright.workbench.config.ts e2e/smoke.e2e.ts e2e/grounded-knowledge.e2e.ts</automated>
  </verify>
  <done>Unit seed pass, version 28 và capacity rules 7 dòng đúng; 2 E2E chạy trên app thật bằng Chrome, seed/knowledge inject có hiệu quả, exit 0.</done>
</task>

<task type="auto">
  <name>Task 3: Backup + change-pack E2E qua setInputFiles, nối runner và evidence</name>
  <files>workbench/e2e/backup-roundtrip.e2e.ts, workbench/e2e/change-pack.e2e.ts, workbench/evidence/latest.json</files>
  <behavior>
    - Backup: seed V28 → export JSON bằng helper có sẵn trong src/services/backup (đọc tên export cụ thể) → setInputFiles buffer vào input accept `.json,application/json` của Settings > "Nhập & Khôi phục dữ liệu" → xác nhận preview → assert các row V28 trở lại đúng sau restore
    - Zip: setInputFiles `tests/fixtures/ai/change-packs/valid.zip` vào input `accept=".zip"` ("Nhập Zip" trong DocsLibraryActions) → assert preview hiện; KHÔNG dùng corrupt/traversal zip cho smoke gate
  </behavior>
  <action>Tạo 2 spec theo convention `*.e2e.ts`, dùng seed module từ Task 2 và config riêng. Dùng `page.setInputFiles` (buffer cho JSON export, path tuyệt đối cho zip fixture), đợi modal xác nhận bằng text thật từ app (`Xem trước & Xác nhận Khôi phục`, `RESTORE`), assertion so sánh row id/count thay vì chỉ "có modal". Sau khi specs chạy xanh, chạy lại `bash workbench/run.sh` trên chính thay đổi workbench để xác nhận scope mặc định chọn `workbench/**` rule (unit + E2E smoke, không full) và evidence ghi đúng. Nếu assertion nào không thay thế được human UAT, ghi rõ vào SUMMARY là CHƯA đạt "no human UAT" — không tự đánh dấu pass.</action>
  <verify>
    <automated>npx playwright test --config workbench/playwright.workbench.config.ts e2e/backup-roundtrip.e2e.ts e2e/change-pack.e2e.ts && bash workbench/run.sh; test $? -le 1</automated>
  </verify>
  <done>Roundtrip backup và zip tự chấm pass trên app thật; runner mặc định tự chọn scope workbench, exit 0/1 đúng, latest.json phản ánh đúng lệnh đã chạy.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| fixture zip / JSON → browser upload | Dữ liệu test không tin cậy, chỉ nạp qua input của app thật |
| knowledge response → page.route | Response giả mạo từ sample JSON, không gửi token thật ra ngoài |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-WB-01 | Tampering | workbench/e2e/change-pack.e2e.ts | mitigate | Chỉ dùng `valid.zip` có sẵn; assert preview trước khi import, không đọc path user |
| T-WB-02 | Information disclosure | workbench/evidence/latest.json | mitigate | Ghi metadata (scope/exit/latency), không ghi response body, query text, token hay credential |
| T-WB-03 | Tampering | npm/pip/cargo installs | accept | Không có lệnh cài đặt nào trong workbench; chỉ dùng dependency đã có, nên không phát sinh gate [ASSUMED]/[SUS] |

</threat_model>

<verification>
- `node --test workbench/unit/detectChanges.test.mjs` — resolver 4 case
- `npx vitest run workbench/unit/v28Seed.test.ts workbench/unit/detectChanges.test.mjs --bail=1` — unit workbench
- `bash workbench/run.sh` — scope theo thay đổi, in scope rồi tự chấm, evidence cập nhật
- `bash workbench/run.sh --full` — chỉ khi release/nghi lan; knowledge live trả 2 thì exit 2 BLOCKED, không tính pass
- Kiểm tra `git diff --name-only HEAD` chỉ thấy file trong `workbench/` và `.planning/quick/261125-vew-.../`
</verification>

<success_criteria>
- Sau mỗi lần thêm/sửa tính năng, một lệnh `bash workbench/run.sh` tự chạy đúng gate liên quan với seed V28 thật, tự trả PASS/FAIL, không cần sếp hay human UAT.
- Không map được → fallback tường minh (unit gần nhất + smoke), không âm thầm full.
- E2E là app thật qua webServer Vite + Chrome channel có sẵn; knowledge inject bằng page.route; backup/zip qua setInputFiles.
- `--full` là flag riêng; exit 0/1/2 và evidence được ghi đúng.
- Zero file app/config/dependency bị sửa; mọi file mới nằm đúng ranh giới workbench/quick.
</success_criteria>

<output>
Tạo `.planning/quick/261125-vew-build-isolated-test-workbench-automation/261125-vew-SUMMARY.md` khi xong. Nếu còn assert nào cần human UAT, ghi rõ CHƯA đạt chuẩn "no human UAT" trong SUMMARY thay vì tự đánh dấu pass.
</output>
