---
phase: quick
plan: 261125-ulp
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/__tests__/ghostDevUiHide.test.ts
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskTable.tsx
  - src/views/SettingsView.tsx
  - src/views/ConfigProfilesView.tsx
autonomous: true
requirements:
  - GHD-UI-TRIGGER
  - GHD-UI-CONFIG
  - GHD-DATA-PRESERVED
  - GHD-REGRESSION
user_setup: []
must_haves:
  truths:
    - "Không còn control nào trong TaskDrawer hoặc TaskTable cho phép khởi chạy Ghost Dev; nút Hỏi AI / Hỏi Trợ lý AI vẫn còn"
    - "Settings không còn nhãn 'Ghost Dev' và không render GhostDevConfigCard; mọi card AI khác vẫn render"
    - "Config Profiles không còn card cấu hình Ghost Dev trên tab AI & Team; dữ liệu ghostDevConfig vẫn export/import nguyên vẹn"
    - "Code/data runtime giữ nguyên: RunGhostDevModal.tsx, GhostDevConfigCard.tsx, services/agents/ghostDevConfig.ts, hooks useGhostDev*, Rust commands và cấu hình localStorage không đổi"
    - "Không nhầm Agent Developer (khác) với Ghost Dev (retired): AI team/Settings AI/Coding Zone không bị ẩn"
    - "Scoped test + tsc --noEmit pass; không chạy full suite"
  artifacts:
    - path: "src/workbench/__tests__/ghostDevUiHide.test.ts"
      provides: "Source-guard tests cho 4 bề mặt UI bị ẩn và invariant code/data được giữ"
      contains: "profile-ghost-dev-section"
    - path: "src/components/tasks/TaskDrawer.tsx"
      provides: "Drawer task không còn nút Ghost Dev; state + RunGhostDevModal vẫn còn nhưng không có trigger"
      contains: "ghostDevModalOpen"
    - path: "src/components/tasks/TaskTable.tsx"
      provides: "Context menu task không còn item Chạy Ghost Dev"
      contains: "ghostDevTask"
    - path: "src/views/SettingsView.tsx"
      provides: "Tab AI chỉ còn cấu hình AI thường; GhostDevConfigCard bị bỏ render"
      contains: "AiToolCatalogCard"
    - path: "src/views/ConfigProfilesView.tsx"
      provides: "Tab AI & Team không còn Card Ghost Dev config; helper dữ liệu ghostDevConfig giữ nguyên"
      contains: "profile-ai-team-section"
  key_links:
    - from: "src/components/tasks/TaskDrawer.tsx"
      to: "src/components/agents/RunGhostDevModal.tsx"
      via: "state ghostDevModalOpen — giữ modal nhưng bỏ nút trigger"
      pattern: "ghostDevModalOpen"
    - from: "src/components/tasks/TaskTable.tsx"
      to: "src/components/agents/RunGhostDevModal.tsx"
      via: "state ghostDevTask — giữ modal nhưng bỏ menu item trigger"
      pattern: "ghostDevTask"
    - from: "src/views/SettingsView.tsx"
      to: "src/components/settings/GhostDevConfigCard.tsx"
      via: "bỏ import + render; file card giữ nguyên"
      pattern: "GhostDevConfigCard"
---

<objective>
Ẩn mọi cấu hình và trigger Ghost Dev khỏi UI TaskMate, giữ nguyên code, data và runtime theo mô hình quick 261125-dax (đã làm với Database Explorer).

Purpose: Ghost Dev đã retired; sếp muốn người dùng không còn thấy hoặc khởi chạy được tính năng này, nhưng không xóa mã, không đổi schema/dữ liệu, không đụng Agent Developer hay AI team đang dùng.

Output: 4 bề mặt UI sạch trigger/cấu hình Ghost Dev + 1 file source-guard test scoped, không dependency/schema/branch/worktree mới.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/quick/261125-dax-hide-database-explorer-feature-from-ui-k/261125-dax-PLAN.md
@src/workbench/__tests__/shellRemoval.test.ts
@src/components/tasks/TaskDrawer.tsx
@src/components/tasks/TaskTable.tsx
@src/views/SettingsView.tsx
@src/views/ConfigProfilesView.tsx

Điều tra tại thời điểm lập plan (grep toàn `src` + `src-tauri`):

- Trigger Ghost Dev còn sống chỉ ở 2 chỗ: `TaskDrawer.tsx:941-948` (nút `aria-label="Khởi chạy Ghost Dev"`, text `Ghost Dev`) và `TaskTable.tsx:317-324` (menu item `key: 'run-ghost-dev'`, label `Chạy Ghost Dev`). Hai chỗ này mở `RunGhostDevModal` qua `ghostDevModalOpen` / `ghostDevTask`.
- Cấu hình Ghost Dev còn sống ở 2 chỗ: `SettingsView.tsx:18,260,272,273` (import `GhostDevConfigCard`, nhãn tab `Trợ lý AI & Ghost Dev`, nhãn section `Trợ lý & Ghost Dev`, render card) và `ConfigProfilesView.tsx:863-953` (`Card data-testid="profile-ghost-dev-section"` với 4 input `ghostDevConfig.*` trên tab `AI & Team`).
- `AgentControlView.tsx`, `AgentSessionList.tsx`, `AgentTerminalLog.tsx`, `ShellPermissionModal.tsx` là phần runtime/session cũ. `layoutStore.ts:172` đã đưa `'agents'` vào `RETIRED_VIEW_TYPES`; không có route, stripe, command palette hay keymap nào mở lại màn hình đó. `rg` trên `src/workbench/search`, `src/workbench/actions`, `src/workbench/hooks` không có kết quả Ghost Dev. Giữ nguyên các file này.
- `AppIntelliJ.tsx:43-44` mount `useGhostDevNotifications` cho session còn chạy; `src/workbench/__tests__/shellRemoval.test.ts:27` pin cụ thể dòng này, và memory dự án yêu cầu notification realtime. Đây là runtime, không phải entry point — KHÔNG sửa.
- `useGhostDevNotifications.ts` (label OS notification), `hooks/useGhostDev*.ts`, `services/agents/*`, `src-tauri/src/agent_manager.rs`, `lib.rs` là runtime — KHÔNG sửa.
- `ghost` trong `DailyReviewModal.tsx:632`, `ChangeRequestDetailView.tsx:458`, `AgentTerminalLog.tsx:1619/1692/1786` là prop `ghost` của AntD `Collapse`/`Button`, không liên quan Ghost Dev — KHÔNG sửa.
- Phân biệt bắt buộc: quick 261121-hza (prompt ủy thác `code_edit` cho Agent Developer) và 261125-dqj (bỏ tool `code_edit` của Agent Developer) nói về **Agent Developer**, không phải Ghost Dev. Plan này không đụng `src/services/ai/office/`, `src/components/ai/`, Coding Zone, hay AI team config cards.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Thêm source-guard cho trigger và ẩn trigger Ghost Dev trên TaskDrawer + TaskTable</name>
  <files>src/workbench/__tests__/ghostDevUiHide.test.ts, src/components/tasks/TaskDrawer.tsx, src/components/tasks/TaskTable.tsx</files>
  <behavior>
    - Guard đọc text nguồn (pattern đã dùng ở `shellRemoval.test.ts`): TaskDrawer không chứa `Khởi chạy Ghost Dev` hay `>Ghost Dev<`, vẫn chứa `Hỏi AI về tác vụ này`; TaskTable không chứa `key: 'run-ghost-dev'` hay `Chạy Ghost Dev`, vẫn chứa `key: 'ai-chat'`.
    - Guard khẳng định `RunGhostDevModal.tsx` vẫn tồn tại trên disk và `ghostDevModalOpen` / `ghostDevTask` vẫn còn trong source (chỉ mất trigger, không mất code).
    - Chạy guard trước khi sửa → RED; sau khi sửa → GREEN.
  </behavior>
  <action>Tạo `src/workbench/__tests__/ghostDevUiHide.test.ts` theo mẫu `src/workbench/__tests__/shellRemoval.test.ts`: dùng `readFileSync(resolve(process.cwd(), relativePath), 'utf8')` và `existsSync`; viết riêng block `describe('Ghost Dev UI triggers hidden')` với các assert trên, chạy `npx vitest run src/workbench/__tests__/ghostDevUiHide.test.ts --bail=1` để xác nhận RED. Sau đó trong `src/components/tasks/TaskDrawer.tsx` xóa đúng block `<Button ... aria-label="Khởi chạy Ghost Dev">Ghost Dev</Button>` tại dòng 941-948, giữ nguyên nút `Hỏi AI`, state `ghostDevModalOpen` (dòng 126) và render `<RunGhostDevModal>` (dòng 983-987). Trong `src/components/tasks/TaskTable.tsx` xóa đúng object menu item `key: 'run-ghost-dev'` tại dòng 317-324, giữ nguyên item `ai-chat`, state `ghostDevTask` (dòng 141), import `RunGhostDevModal` (dòng 29) và render modal (dòng 1096-1099). Không đổi `RobotOutlined` import (vẫn dùng cho AI), không đổi `RunGhostDevModal.tsx`, không thêm feature flag hay shortcut mới.</action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/ghostDevUiHide.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Guard block trigger chuyển từ RED sang GREEN; không còn nút/menu item nào mở Ghost Dev từ task; nút Hỏi AI và modal code vẫn còn; `tsc --noEmit` clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Thêm source-guard cho cấu hình và ẩn cấu hình Ghost Dev trên Settings + Config Profiles</name>
  <files>src/workbench/__tests__/ghostDevUiHide.test.ts, src/views/SettingsView.tsx, src/views/ConfigProfilesView.tsx</files>
  <behavior>
    - Guard: `SettingsView.tsx` không chứa `GhostDevConfigCard`, không chứa `Trợ lý AI & Ghost Dev` hay `Trợ lý & Ghost Dev`; vẫn chứa `GlobalConventionsCard`, `AiToolCatalogCard`, `NineRouterConfigCard`, `KnowledgeServerConfigCard`.
    - Guard: `ConfigProfilesView.tsx` không chứa `profile-ghost-dev-section` hay `Ghost Dev config`; vẫn chứa `profile-ai-team-section`, và vẫn chứa `ghostDevConfig` ở phần helper (chứng minh đường dữ liệu export/import không bị cắt).
    - Guard: `GhostDevConfigCard.tsx`, `services/agents/ghostDevConfig.ts`, `AppIntelliJ.tsx` vẫn còn; `AppIntelliJ.tsx` vẫn giữ `useGhostDevNotifications`.
    - Guard block mới RED trước sửa, GREEN sau sửa; block Task 1 vẫn GREEN.
  </behavior>
  <action>Bổ sung block `describe('Ghost Dev config surfaces hidden')` vào cùng file test, chạy scoped test để xác nhận RED (block Task 1 vẫn pass). Trong `src/views/SettingsView.tsx` xóa import `GhostDevConfigCard` (dòng 18), đổi nhãn tab dòng 260 từ `Trợ lý AI & Ghost Dev` thành `Trợ lý AI`, đổi nhãn section dòng 272 từ `Trợ lý & Ghost Dev` thành `Trợ lý AI`, xóa dòng 273 `<GhostDevConfigCard />`; giữ nguyên mọi card AI khác (GlobalConventions, Mcp, GraphitiSql, AiToolCatalog, OracleAiTool, SshFsAiTool, NineRouter, BudgetWarnThreshold, KnowledgeServer). Trong `src/views/ConfigProfilesView.tsx` xóa trọn block JSX `Card` từ dòng 863 (`data-testid="profile-ghost-dev-section"`) đến dòng 953, giữ tab `profile-ai-team-section` và các Card còn lại; KHÔNG sửa các dòng 152-153, 199-209, 240, 460-465 (dữ liệu `ghostDevConfig` trong draft/export/import), KHÔNG sửa `machineWarning` hay `InputNumberField` (vẫn dùng chỗ khác). Không đụng `src/services/configProfiles/*`, `src/validation/configProfileSchemas.ts`, `PostProfileImportChecklist.tsx`, hay bất kỳ file AI team/Coding Zone nào.</action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/ghostDevUiHide.test.ts src/workbench/__tests__/shellRemoval.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>Cả hai block guard pass; Settings/Config Profiles không còn nhãn hay control Ghost Dev; mọi card AI khác và dữ liệu ghostDevConfig trong profile vẫn nguyên; shellRemoval.test.ts vẫn pass chứng minh runtime notification không đổi.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| source → UI discovery | Nhãn/menu/card tĩnh là bề mặt duy nhất để user phát hiện và kích hoạt Ghost Dev. |
| profile file → ConfigProfilesView | File profile do user nhập; đường dữ liệu ghostDevConfig phải giữ nguyên để export/import không mất dữ liệu. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ulp-01 | I (Information disclosure) | `TaskDrawer.tsx`, `TaskTable.tsx`, `SettingsView.tsx`, `ConfigProfilesView.tsx` | low | mitigate | Bỏ 4 bề mặt discovery/render cụ thể; source-guard test chặn tái xuất hiện nhãn/menu/card. |
| T-ulp-02 | T (Tampering) | `ConfigProfilesView.tsx` helpers, `services/configProfiles/*` | medium | mitigate | Chỉ xóa JSX Card; helpers `ghostDevConfig` ở dòng 152-240/460-465 giữ byte-nguyên; guard test pin sự hiện diện. |
| T-ulp-03 | T (Tampering) | `AppIntelliJ.tsx`, `useGhostDevNotifications.ts` | low | accept | Runtime notification phục vụ session còn chạy và bị `shellRemoval.test.ts` pin; không phải entry point nên không ẩn trong quick này. |
| T-ulp-SC | Tampering | npm/pip/cargo installs | high | accept | Không cài dependency; chỉ dùng Vitest/TypeScript có sẵn. |

</threat_model>

<verification>
1. `npx vitest run src/workbench/__tests__/ghostDevUiHide.test.ts src/workbench/__tests__/shellRemoval.test.ts --bail=1` — pass. Chỉ chạy scoped; full suite > 1 giờ, không chạy.
2. `npx tsc --noEmit` — clean (noUnusedLocals/noUnusedParameters bật).
3. `git diff --name-only` — đúng 5 file trong `files_modified`; không có file nào dưới `src/services/ai/`, `src/components/ai/`, `src/services/configProfiles/`, `src-tauri/`, `.planning/debug/`, `.planning/quick/261125-svm-.../`, hay file đang sửa của session khác (`src/services/ai/office/teamRunCoordinator.ts`).
</verification>

<success_criteria>
- Task drawer và task table không còn trigger Ghost Dev; settings và config profiles không còn cấu hình Ghost Dev.
- Mọi control AI/Agent Developer/Coding Zone giữ nguyên; `RunGhostDevModal.tsx`, `GhostDevConfigCard.tsx`, config service, hooks, Rust command, schema và dữ liệu localStorage/backup/profile không đổi.
- Không branch/worktree/dependency/schema shortcut/palette entry mới; không commit/push trong plan này.
- Scoped Vitest + typecheck pass; full suite không chạy.
</success_criteria>

<output>
Tạo `.planning/quick/261125-ulp-n-ho-n-to-n-m-i-c-u-h-nh-v-trigger-li-n-/261125-ulp-SUMMARY.md` khi xong
</output>
