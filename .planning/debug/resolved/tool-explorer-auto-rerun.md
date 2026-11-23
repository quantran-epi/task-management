---
status: resolved
trigger: "kiểm tra lại mấy cái tool trong tool explorer đi, mỗi tool phải có 1 nút trigger để chạy, ví dụ user nhập xong, chọn các option, có 1 nút run, hiện tại các tool mới thêm vào đang auto trigger rerun khi user chọn option, nhiều khi vẫn thấy có vẻ bị lỗi đó"
created: 2026-11-23T00:00:00Z
updated: 2026-11-23T06:38:55Z
---

## Current Focus

hypothesis: 6/8 tool mới (Encoder, Regex, Timestamp, Date Calc, Text Utilities, JWT) tính output tự động qua useMemo/useEffect trên mỗi lần đổi input/option; 2 tool (Cron, Hash & UUID) đã có nút Run riêng. Cần audit toàn bộ 8 tool qua UI thật, sửa auto-rerun, label, hướng dẫn, và ô "Số UUID" gây nhầm lẫn.
test: Chạy audit behavior-level cho cả 8 tool (Playwright/jsdom render thật); baseline 61 unit test cũ pass nhưng KHÔNG cover UI của 8 tool mới → giải thích false-pass.
expecting: Mỗi tool có nút Run explicit, mọi input/select có label rõ ràng, có hướng dẫn dùng, output chỉ đổi khi bấm Run, ô UUID có nhãn "Số lượng UUID cần tạo".
next_action: chạy audit 8 tool, fix defects, thêm regression test behavior-level.

## Symptoms

expected: Mọi tool trong Tool Explorer đều có 1 nút Run riêng; user nhập input, chọn option, rồi bấm Run mới chạy. Tool dễ dùng, có label và hướng dẫn đầy đủ.
actual: Các tool mới thêm vào đang auto-trigger rerun khi user chọn option; nhiều khi có vẻ bị lỗi; ô nhập "Số UUID" trong Hash & UUID gây nhầm lẫn; text utility camelCase/snake_case dường như không work.
errors: Không rõ — user nói "nhiều khi vẫn thấy có vẻ bị lỗi đó"; user báo camelCase/snakeCase "chả thấy work gì cả".
reproduction: Mở Tool Explorer, dùng 1 tool mới thêm vào, đổi 1 option; dùng Hash & UUID xem ô "Số UUID".
started: Khi 8 tool mới được thêm vào (commit 89b072f9 / 1fbed59e).

## Scope mở rộng (từ user follow-up)

- Audit cả 8 tool mới: Encoder/Decoder, Regex Tester, Timestamp Converter, Date Calculation, Text Utilities, Cron Expression, Hash & UUID, JWT Decoder.
- Mỗi tool: chạy thử case representative qua UI thật (Playwright hoặc behavior test jsdom), kiểm tra input/label/nút Run/output/hướng dẫn.
- Sửa mọi defect tìm được; fix tối thiểu, evidence-based.
- Acceptance: mọi input/select có visible label, có hướng dẫn dùng, không auto-rerun khi đổi option.

## Eliminated

- transformText helper: unit test xác nhận camel/snake/kebab đúng ('hello world-foo' → helloWorldFoo / hello_world_foo / hello-world-foo). Bug không nằm ở helper.
- ToolExplorerPanel.tsx: chỉ là danh sách + openTab, không có logic auto-run. Auto-run nằm trong UtilityToolPanel.tsx.

## Evidence

- timestamp: 2026-11-23T00:05:00Z
  checked: src/workbench/toolwindows/UtilityToolPanel.tsx (toàn bộ 1198 dòng)
  found: Các panel tool "mới" (dùng DevPanes/useCommonToolbar) tính output trong `useMemo` trên [input, option, option2]:
    - EncoderPanel:879-887 useMemo [input, option, option2]
    - RegexTesterPanel:914-928 useEffect [aux, option2, input] gọi runRegex ngay khi đổi field
    - TimestampPanel:951-958 useMemo [input, option, option2]
    - DateCalcPanel:990 useMemo [input, aux, op, amount, unit]
    - TextUtilitiesPanel:1026 useMemo [input, option]
    - JwtPanel:1112 useMemo [input]
    CronPanel:1047 & HashUuidPanel:1070 dùng useCallback + nút Run riêng → đúng mô hình mong đợi.
  implication: Đổi option hoặc gõ input lập tức rerun, khớp báo cáo "auto trigger rerun khi user chọn option". Regex chạy worker mỗi keystroke → có thể là "vẻ bị lỗi" (đang chạy, timeout, race) user thấy.

- timestamp: 2026-11-23T00:10:00Z
  checked: Baseline tests `npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx src/workbench/__tests__/utilityToolHelpers.test.ts`
  found: 61 tests pass, nhưng UtilityToolPanel.test.tsx chỉ cover 4 tool cũ (JSON, XML, Text Compare, Markdown) + AI/save/persistence; helper test cover hàm thuần, KHÔNG có test render/tương tác cho 8 panel mới.
  implication: False-pass — helper đúng nhưng UI 8 tool mới chưa từng được test behavior-level.

- timestamp: 2026-11-23T00:12:00Z
  checked: HashUuidPanel.tsx dòng 1065-1105 + makeUuids (utilityToolHelpers.ts:312)
  found: input `aria-label="Số UUID"` value=`option2` chỉ được dùng bởi `makeUuids(Number(option2) || 1)` khi bấm "Tạo UUID". Nó là SỐ LƯỢNG UUID cần tạo (1-100), KHÔNG phải ô nhập UUID để hash. Label "Số UUID" + placeholder "số UUID" gây hiểu nhầm; input này nằm chung toolbar với input hash nên user tưởng nhập UUID.
  implication: Cần đổi label rõ ràng ("Số lượng UUID (1–100)") + hướng dẫn.

- timestamp: 2026-11-23T00:15:00Z
  checked: aria-label trên 8 panel mới
  found: Có aria-label cho select/input (Chiều, Định dạng, Pattern, Flags, Đơn vị, Phép tính, Số lượng, Phép biến đổi, Thuật toán, Số UUID) nhưng KHÔNG có visible label — chỉ placeholder/aria. Không có help text giải thích từng field.
  implication: Vi phạm acceptance "mọi input có label" + "hướng dẫn đầy đủ".

- timestamp: 2026-11-23T00:18:00Z
  checked: Playwright availability
  found: Playwright browsers có sẵn (~/Library/Caches/ms-playwright/chromium-1223); playwright.config.ts webServer `npm run dev -- --host 127.0.0.1`, baseURL `/task-management/`; e2e/utility-editor-lag.spec.ts có helper `openTool(page, title)`.
  implication: Có thể chạy audit UI thật qua Playwright.

- timestamp: 2026-11-23T00:30:00Z
  checked: Playwright baseline audit `e2e/tool-explorer-8-tools.spec.ts` (Chrome thật, 8 case)
  found: 8/8 fail. 6 tool (Encoder, Timestamp, Date Calc, Text Utilities, JWT, Regex) auto-compute output ngay khi fill input — vi phạm yêu cầu nút Chạy. Regex đặc biệt: chạy Worker trên mỗi thay đổi. Text Utilities "không work" thực chất là auto-rerun khi đổi option, output đổi trước khi user kịp thấy; helper đúng (`PROBE_OUTPUT="helloWorldFoo"`).
  implication: Khớp chính xác báo cáo user. Test cũ pass vì không có bất kỳ test UI nào cho 8 tool này.

- timestamp: 2026-11-23T00:45:00Z
  checked: Playwright audit sau fix
  found: 8/8 pass (chạy riêng lẻ Hash do selector `/Hash/` khớp nhầm nhãn "Thuật toán"; đổi regex thành `/^Hash$/` → pass).
  implication: Mọi tool có nút Chạy explicit, output rỗng trước khi bấm, đúng sau khi bấm.

## Resolution

root_cause:
  1. Sáu panel mới dùng `useMemo`/`useEffect` tính output trực tiếp từ state input/option → auto-rerun mỗi lần thay đổi, không có nút Chạy. Regex chạy Worker trên mỗi thay đổi → "vẻ bị lỗi" (đang chạy/timeout).
  2. Convention của 4 tool cũ (JSON/XML/Compare/Markdown) là explicit Format/Run; 8 tool mới không theo convention → gây nhầm lẫn.
  3. Thiếu visible label và help text; ô `Số UUID` là số lượng UUID cần tạo (1-100) nhưng label/placeholder gây hiểu là ô nhập UUID để hash.
  4. Test gap: 61 test cũ chỉ cover helper + 4 tool cũ; không có test behavior-level cho UI 8 tool mới → false pass.

fix:
  - Đổi 6 panel (Encoder, Timestamp, Date Calc, Text Utilities, JWT, Regex) sang tính output trong `run` callback gọi từ nút "Chạy"; input/option đổi chỉ clear output. Regex chỉ gọi `runRegex` khi bấm Chạy (tránh ReDoS auto).
  - Giữ nút "5 lần chạy tiếp" (Cron) và "Hash"/"Tạo UUID" (Hash & UUID), thêm help text.
  - Thêm `DevField` (visible label) cho mọi select/input toolbar, `DevHelp` (1 dòng hướng dẫn/tool), label可见 cho textarea input/output trong `DevPanes`.
  - Đổi label ô UUID thành "Số lượng UUID (1–100)" + aria-label "Số lượng UUID" + help giải thích rõ đây KHÔNG phải nội dung hash.
  - Thêm `src/workbench/__tests__/DevTools8.test.tsx` (10 test behavior-level) và `e2e/tool-explorer-8-tools.spec.ts` (8 case Chrome thật). Không thêm dependency mới — helper transformText đã đúng, không cần lib case-conversion.

verification:
  - `npx tsc --noEmit` — pass.
  - `npx vitest run src/workbench/__tests__/UtilityToolPanel.test.tsx src/workbench/__tests__/ToolExplorerPanel.test.tsx src/workbench/__tests__/utilityToolHelpers.test.ts src/workbench/__tests__/DevTools8.test.tsx --bail=1` — 4 files, 74 tests pass.
  - `npx playwright test e2e/tool-explorer-8-tools.spec.ts --reporter=list` — 8/8 pass (xác nhận trong Chrome thật).
  - `npx eslint src/workbench/toolwindows/UtilityToolPanel.tsx src/workbench/__tests__/DevTools8.test.tsx` — 0 error.

files_changed:
  - src/workbench/toolwindows/UtilityToolPanel.tsx
  - src/workbench/__tests__/DevTools8.test.tsx (new)
  - e2e/tool-explorer-8-tools.spec.ts (new)
  - .planning/debug/tool-explorer-auto-rerun.md
