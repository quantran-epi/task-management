---
phase: 261128-ffo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/notes/DocOutlineToC.tsx
  - src/styles/workbench-tokens.css
  - src/components/knowledge/DocumentSetForm.tsx
  - src/components/shell/GitHubSyncStatusDot.tsx
  - src/workbench/StatusBar.tsx
  - src/workbench/__tests__/StatusBarIndicators.test.tsx
autonomous: true
must_haves:
  truths:
    - "DocOutlineToC tiêu đề + item + hover dùng CSS var theo theme; dark mode chữ sáng, hover không trắng chói, focus/keyboard vẫn rõ"
    - "Form cấu hình trong aside 260px gọn theo spacing 4/8/12/16, radio 2 cột, có tiêu đề nhóm/phân cách, control 28px; logic và data model không đổi"
    - "Status bar Knowledge phản ánh đúng trạng thật (disabled/checking/connected/disconnected) qua probe liveness, có retry + cleanup, không block render"
    - "Status bar sync dùng logic GitHubSyncStatusDot thay vì hardcode 'synced'"
  artifacts:
    - path: "src/components/notes/DocOutlineToC.tsx"
      provides: "ToC render dùng token thay vì màu cứng"
    - path: "src/styles/workbench-tokens.css"
      provides: "CSS class cho ToC + compact form (token-driven)"
    - path: "src/components/knowledge/DocumentSetForm.tsx"
      provides: "Form chèn class/group compact, không đổi logic"
    - path: "src/components/shell/GitHubSyncStatusDot.tsx"
      provides: "Export hàm derive trạng thái sync cho StatusBar dùng lại"
    - path: "src/workbench/StatusBar.tsx"
      provides: "Indicator Knowledge + sync theo tín hiệu thật"
    - path: "src/workbench/__tests__/StatusBarIndicators.test.tsx"
      provides: "Test derive status + probe (không chạy full suite)"
  key_links:
    - from: "src/workbench/StatusBar.tsx"
      to: "src/services/knowledge/knowledgeConfig.tsx"
      via: "useOptionalKnowledgeConfig() → enabled/baseUrl/ready"
      pattern: "useOptionalKnowledgeConfig"
    - from: "src/workbench/StatusBar.tsx"
      to: "src/components/shell/GitHubSyncStatusDot.tsx"
      via: "dùng lại deriveSyncStatus + useLiveQuery settings"
      pattern: "deriveSyncStatus"
    - from: "src/components/knowledge/DocumentSetForm.tsx"
      to: "src/styles/workbench-tokens.css"
      via: "className doc-set-form-compact"
      pattern: "doc-set-form-compact"
    - from: "src/components/notes/DocOutlineToC.tsx"
      to: "src/styles/workbench-tokens.css"
      via: "className doc-outline-toc thay inline màu cứng"
      pattern: "doc-outline-toc__"
---

<objective>

Sửa 3 điểm đã soi trực tiếp Chrome ở dark mode và status bar: (1) mục lục doc editor dùng màu cứng gần đen/trắng, (2) form cấu hình bộ tài liệu dồn trong aside 260px, (3) status bar hiện "Knowledge"/"Synced" giả dù daemon không chạy và sync chưa chắc đã khớp.

Purpose: dark mode đọc được, form gọn vừa inspector, indicator nói thật — không fake status, không đụng file session khác đang sửa.

Output: 6 file (4 source + 1 CSS + 1 test). KHÔNG đụng: `TaskDrawer.tsx`, `TaskDrawer.test.tsx`, `TaskTable.tsx`, `TaskTable.test.tsx`, `.planning/STATE.md`, `.planning/phases/52-*`.

Dark-mode TaskDrawer: nếu sau khi token hóa CSS dùng chung vẫn còn sót màu cứng trong `TaskDrawer.tsx`, KHÔNG edit file đó — báo orchestrator đây là block do session khác đang giữ file.

</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.claude/skills/sketch-findings-task-management/SKILL.md

@src/components/notes/DocOutlineToC.tsx
@src/styles/workbench-tokens.css
@src/components/knowledge/DocumentSetForm.tsx
@src/components/shell/GitHubSyncStatusDot.tsx
@src/workbench/StatusBar.tsx
@src/services/knowledge/knowledgeConfig.tsx
@src/context/GitHubAuthContext.tsx
@src/workbench/DocumentSetDetail.tsx

Quy ước: tiếng Việt, xưng "sếp". Không chạy full vitest suite (trên 1 giờ) — luôn scoped path. Theme tokens（`--fg-secondary`, `--fg-muted`, `--fg-default`, `--accent`, `--accent-soft`, `--bg-hover`, `--success`, `--warning`, `--danger`, `--border-strong`）được `applyCssVariables()` inject theo light/dark từ `src/styles/tokens.ts`; CSS import sẵn qua `WorkbenchLayout.tsx`. spacing 4/8/12/16, control 28px, inspector 260px.
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Token hóa DocOutlineToC + compact DocumentSetForm</name>
  <files>src/components/notes/DocOutlineToC.tsx, src/styles/workbench-tokens.css, src/components/knowledge/DocumentSetForm.tsx</files>
  <action>
    (1) DocOutlineToC: bỏ các màu cứng `#595959`, `#262626`, `#f5f5f5` khỏi style inline. Thay bằng class CSS scoped trong `src/styles/workbench-tokens.css` (file đã import sẵn): `.doc-outline-toc__title` dùng `var(--fg-secondary)`, `.doc-outline-toc__item` dùng `var(--fg-default)` cho level 1 / `var(--fg-secondary)` cho level 2 (thêm class modifier), `.doc-outline-toc__item:hover` dùng `background: var(--bg-hover)` + `color: var(--accent)`. Giữ nguyên `role="button"`, `tabIndex`, `onKeyDown` Enter/Space, indentation theo level, ellipsis, smooth-scroll — chỉ đổi màu/hover sang token. Thêm `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }` cho item. Không dùng `!important`.

    (2) DocumentSetForm: thêm `className="doc-set-form-compact"` trên `<Form layout="vertical">` (giữ nguyên mọi state/handler/payload/validation — chỉ CSS/layout). Trong `workbench-tokens.css` thêm rule scoped dưới `.doc-set-form-compact`: `.ant-form-item { margin-bottom: 8px }`, control (`input`, `.ant-select-selector`, `.ant-radio-wrapper`, `.ant-btn`) min-height 28px, font `--font-size-small`. Radio preset (6 option đang `<Space direction="vertical">` cao ~215px) đổi layout thành 2 cột: thêm class trên `<Space>` của preset (`doc-set-preset-grid`) và CSS `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 4px` — giữ nguyên 6 `<Radio>` và `onChange`. Tương tự cho radio "Khởi tạo từ" và "Relation kind" nếu dùng chung class. Thêm `.doc-set-form-compact .ant-form-item-label > label { font-size: var(--font-size-small) }` và tiêu đề nhóm phân cách: thêm `<div className="doc-set-form-group-title">` trước preset, trước Collapse "Thiết lập nâng cao", trước "Tên bộ tài liệu" và trước membership — CSS `border-top: 1px solid var(--border-strong); padding-top: 8px; margin-top: 12px; font-weight: 600; color: var(--fg-secondary)`. Collapse `marginBottom` đổi sang 12px. Giữ `aria-label` và `data-testid` hiện có nguyên vẹn; KHÔNG đổi data model, validation, `onSave` payload hay `VirtualizedList`.

    Lưu ý: chỉ sửa fileThuộc task này. Không Edit `TaskDrawer.tsx` dù tìm thấy màu cứng tương tự — session khác đang giữ file.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx tsc --noEmit && npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx --bail=1</automated>
    <human-check>Mở Chrome http://localhost:5173/#/tasks → mở doc editor có headings, chuyển dark mode: tiêu đề/item sáng, hover nền xám đậm không chói, focus bàn phím rõ. Vào tab Bộ tài liệu → mở form cấu hình trong aside 260px: preset 2 cột, nhóm có phân cách, control gọn, không tràn ngang.</human-check>
  </verify>
  <done>ToC không còn hex cứng, dark mode đọc rõ + focus/hover đúng token. Form compact nhưng mọi aria-label/testid/logic/payload giữ nguyên; tsc + 2 test scoped xanh; Chrome dark mode xác nhận.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: StatusBar indicator theo tín hiệu thật (Knowledge probe + GitHub sync)</name>
  <files>src/workbench/StatusBar.tsx, src/components/shell/GitHubSyncStatusDot.tsx, src/workbench/__tests__/StatusBarIndicators.test.tsx</files>
  <action>
    (1) `src/components/shell/GitHubSyncStatusDot.tsx`: tách pure function `deriveSyncStatus({ hasToken, enabled, dirtySince, retryState, lastError })` trả về `{ kind: 'off' | 'paused' | 'error' | 'dirty' | 'synced', label, tooltip }` dùng chung cho Badge và text. Giữ component render/testid/`data-testid="github-sync-status"` y hệt — chỉ refactor để export hàm. Đây là nguồn logic sync thật, không viết lại ở StatusBar.

    (2) `src/workbench/StatusBar.tsx`: bỏ 2 prop hardcode `knowledgeStatus='connected'`/`syncStatus='synced'` (giữ interface props optional để không vỡ caller, nhưng mặc định giờ derive từ nguồn thật). Knowledge: gọi `useOptionalKnowledgeConfig()` lấy `ready/enabled/baseUrl`. Thêm custom hook `useKnowledgeProbe({ ready, enabled, baseUrl })` trong file: state `checking | connected | disconnected | disabled`; khi `!ready` → checking; khi `!enabled || !baseUrl` → disabled; ngược lại `fetch(baseUrl + '/api/v1/health/liveness', { signal })` (endpoint không auth, knowledge-server/src/server.ts:99), timeout 3s qua `AbortController` + `setTimeout`, clear timer + abort trong cleanup `useEffect`. Retry: `setTimeout` 15s khi fail, 60s khi success, cleanup rõ ràng, KHÔNG await trong render, KHÔNG block render (mặc định checking). Token KHÔNG gửi vào probe liveness. Dùng token màu: disabled → `--fg-muted`, checking → `--warning`, connected → `--success`, disconnected → `--danger`; tooltip tiếng Việt mô tả đúng trạng thái + baseUrl (không lộ token). Sync: dùng `useGitHubAuth().hasToken` + `useLiveQuery` đọc 4 settings key giống GitHubSyncStatusDot (`github_auto_sync_enabled`, `github_auto_sync_dirty_since`, `github_auto_sync_state`, `github_auto_sync_last_error`), gọi `deriveSyncStatus`, render icon `CloudSyncOutlined` + nhãn/tooltip theo `kind` (off → "Tắt"/muted, paused → "Tạm dừng"/danger, error → "Lỗi"/danger, dirty → "Chưa đồng bộ"/warning, synced → "Đã đồng bộ"/success). Giữ IndexedDB indicator như cũ (không fake — nó chỉ nói local store). KHÔNG thêm indicator cho Telegram/AI nếu không có nguồn tín hiệu thật.

    (3) `src/workbench/__tests__/StatusBarIndicators.test.tsx`: test thuần cho `deriveSyncStatus` (5 kind) và `useKnowledgeProbe` qua `renderHook` với `global.fetch` mock: disabled khi config tắt, checking rồi connected khi fetch 200, disconnected + retry khi fetch reject, cleanup abort on unmount. Dùng scoped path, không chạy full suite.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx tsc --noEmit && npx vitest run src/workbench/__tests__/StatusBarIndicators.test.tsx --bail=1</automated>
    <human-check>Chrome http://localhost:5173/#/tasks: (a) daemon tắt + config chưa bật → "Knowledge" xám, tooltip "chưa bật"; (b) bật config tới `http://127.0.0.1:3001` nhưng daemon không chạy (`curl .../api/v1/health/liveness` → 000) → indicator đỏ "mất kết nối", không còn xanh giả; (c) bật daemon → xanh sau probe; (d) sync indicator đổi theo trạng thái GitHub thật, không còn chữ "Synced" cứng.</human-check>
  </verify>
  <done>Knowledge indicator 4 trạng thái đúng tín hiệu, probe có timeout/retry/cleanup; sync dùng lại logic GitHubSyncStatusDot; test scoped xanh; Chrome xác nhận không còn status giả.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI → knowledge daemon | baseUrl lấy từ settings (do user nhập), fetch tới endpoint liveness — KHÔNG gửi token, KHÔng tin response body |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ffo-01 | Information disclosure | StatusBar knowledge probe | mitigate | Chỉ gọi `/api/v1/health/liveness` không auth; không đưa `token` vào URL/header; tooltip chỉ hiện baseUrl đã validate, không lộ secret |

</threat_model>

<verification>

1. `npx tsc --noEmit` — clean.
2. `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx src/workbench/__tests__/StatusBarIndicators.test.tsx --bail=1` — scoped, xanh. KHÔNG chạy `npm test` (full suite > 1 giờ).
3. Chrome dev server `http://localhost:5173/#/tasks`: dark mode ToC, compact form, status bar 4 trạng thái + sync thật.
4. `git diff --name-only` — xác nhận KHÔNG xuất hiện TaskDrawer.tsx / TaskTable.tsx / STATE.md / phases/52-*.

</verification>

<success_criteria>

- Dark mode mục lục doc editor đọc rõ, hover/focus đúng token.
- Form bộ tài liệu compact trong aside 260px, logic/data model/aria/testid giữ nguyên.
- Status bar Knowledge + sync phản ánh tín hiệu thật; không fake status; probe có cleanup.
- Không file nào bị session khác giữ bị đụng; scoped test + tsc xanh; Chrome verified.

</success_criteria>

<output>
Tạo `.planning/quick/261128-ffo-s-a-dark-mode-m-c-l-c-doc-editor-v-task-/261128-ffo-SUMMARY.md` khi xong.
</output>
