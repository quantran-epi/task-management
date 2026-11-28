---
phase: 261128-fqs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/views/PlannerView.tsx
  - src/components/planner/planner-surface.css
  - src/components/planner/DayColumn.tsx
  - src/components/planner/DayColumnHeader.tsx
  - src/components/planner/TaskAllocationCard.tsx
  - src/components/planner/ActualWorklogPlanner.tsx
  - src/components/planner/AllocationModal.tsx
  - src/components/planner/FeasibilityModal.tsx
  - src/components/planner/WorkSessionDetailModal.tsx
  - src/components/planner/DayInsightPanel.tsx
  - src/components/planner/__tests__/plannerDarkSurface.test.ts
  - src/views/TasksView.tsx
  - src/components/tasks/tasklist-workspace.css
  - src/components/tasks/QuickAddBar.tsx
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/tasks/BatchActionBar.tsx
  - src/views/__tests__/TasksViewWorkspace.test.tsx
  - src/components/AppSplashScreen.tsx
  - src/components/app-splash.css
  - src/components/__tests__/AppSplashScreen.test.tsx
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Trang Kế hoạch công suất hiển thị đúng trong dark mode: không còn nền/border/chữ màu sáng hardcode, overlay modal và bảng actual cũng theo theme"
    - "Lưới tuần 7 cột và post-it allocation vẫn là hero trực quan; palette xanh dương/teal theo hệ AntD, không cream/serif/terracotta"
    - "Trang Danh sách tác vụ có bố cục workspace tool gọn, dày, nhất quán quanh bảng; giữ nguyên mọi testid, shortcut id và hành động lọc/thêm/hàng loạt"
    - "Splash là một khoảnh khắc orchestrated duy nhất: logo không đập vô hạn, tiến trình 4 bước khớp thời gian, tôn trọng prefers-reduced-motion"
    - "Không file nào thuộc quyền session khác bị đụng: workbench-tokens.css, STATE.md, TaskDrawer.tsx, TaskTable.tsx, ChangeRequestDetailView.tsx, StatusBar.tsx, GitHubSyncStatusDot.tsx, DocOutlineToC.tsx, DocumentSetForm.tsx, backup/*, sqlite_persistence.rs, ItemInsightView.tsx"
  artifacts:
    - path: src/components/planner/planner-surface.css
      provides: "Component-scoped CSS cho day column, allocation card, actual worklog, modal surfaces theo CSS var; không sửa workbench-tokens.css"
    - path: src/components/planner/__tests__/plannerDarkSurface.test.ts
      provides: "Guard chặn hex light hardcode quay lại planner surface"
    - path: src/components/tasks/tasklist-workspace.css
      provides: "Chrome quanh TaskTable: quick-add command strip, sticky filter toolbar, floating batch bar"
    - path: src/views/__tests__/TasksViewWorkspace.test.tsx
      provides: "Test pin cấu trúc workspace và testid/shortcut id trước/sau redesign"
    - path: src/components/app-splash.css
      provides: "Keyframes + reduced-motion cho splash, palette xanh dương/teal"
    - path: src/components/__tests__/AppSplashScreen.test.tsx
      provides: "Test tiến trình 4 bước, onReady sau minDuration, reduced-motion"
  key_links:
    - from: "src/views/PlannerView.tsx"
      to: "src/components/planner/planner-surface.css"
      via: "import CSS + class tm-planner-* trên grid/toolbar; child component dùng class tương ứng"
      pattern: "planner-surface\\.css|tm-planner-"
    - from: "src/views/TasksView.tsx"
      to: "src/components/tasks/tasklist-workspace.css"
      via: "import CSS + class tm-tasklist-*; QuickAddBar/TaskFilterBar/BatchActionBar nhận class hoặc tự apply"
      pattern: "tasklist-workspace\\.css|tm-tasklist-"
    - from: "src/components/AppSplashScreen.tsx"
      to: "src/components/app-splash.css"
      via: "import CSS; thay inline style/animation bằng class tm-splash-*"
      pattern: "app-splash\\.css|tm-splash"
---

<objective>
Rà và sửa 3 mặt UI: (1) dark-mode trang Kế hoạch công suất, (2) redesign UI trang Danh sách tác vụ phần quanh bảng, (3) polish splash screen. Ba việc độc lập, không đụng file thuộc session song song.

Purpose: Sếp có planner đọc được trong light lẫn dark, task list có chất lượng workspace tool thật (không SaaS card đồng loạt), và splash là một khoảnh khắc có chủ đích thay vì hiệu ứng neon lặp vô hạn. Palette theo ngữ cảnh capacity planning: xanh dương/teal hiện đại, hệ sinh thái Ant Design.

Output: 3 file CSS component-scoped mới, 3 file test mới, chỉnh sửa token/colors trong planner + tasklist chrome + splash. Không thêm dependency, không sửa logic DB/lọc/phân bổ, không đụng workbench-tokens.css hay STATE.md.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@/Users/tranducquan/Working/Personal/task-management/CLAUDE.md
@.planning/STATE.md

Facts đã xác nhận bằng broad-read, KHÔNG research lại:
- Token sẵn (src/styles/tokens.ts, inject qua applyCssVariables): `--bg-island`, `--bg-elev`, `--bg-app`, `--bg-hover`, `--border`, `--border-strong`, `--fg-strong`, `--fg`, `--fg-secondary`, `--fg-muted`, `--fg-faint`, `--accent`, `--accent-hover`, `--accent-soft`, `--accent-fg`, `--info`, `--info-fg`, `--success`, `--warning`, `--danger`, `--gap-2/8/12/16`, `--radius-control`, `--font-size-small`, `--font-size-xs`. Dark mode đổi giá trị các biến này nên chỉ cần dùng biến là tự đúng 2 mode; không tự định nghĩa lại palette.
- `useAntdToken()` (từ `../components/ui`) cho `token.colorBgContainer`, `token.colorBgElevated`, `token.colorText`, `token.colorTextSecondary`, `token.colorBorderSecondary`, `token.boxShadowSecondary` — dùng cho chỗ cần giá trị AntD động trong inline style. `useThemeMode()` (src/hooks/useThemeMode.ts) chỉ cần khi thực sự rẽ nhánh logic; ưu tiên CSS var.
- CSS component-scoped là pattern hợp lệ: src/workbench/search/find/FindInRemoteFiles.tsx import './find.css'; src/main.tsx import global css; WorkbenchLayout.tsx import workbench-tokens.css. File CSS mới tự import từ component owner tương ứng.
- Planner hardcode đã định vị: DayColumn.tsx L42 `#fafafa`, L44 `#f0f0f0`, L65 `#d9d9d9`; DayColumnHeader.tsx L63 `#52c41a`/`#ff4d4f`, L79 rgba(22,119,255,.05), L80 `#f0f0f0`; TaskAllocationCard.tsx L175 `#d9d9d9`, L176 `#fafafa`; ActualWorklogPlanner.tsx L358/473 `#f0f0f0`, L359/378/549 `#fafafa`/`#f5f5f5`; AllocationModal.tsx L376 `#f5f5f5`, L388 `#fa8c16`; FeasibilityModal.tsx L316/348 `#fafafa`, L319 `#f0f0f0`; WorkSessionDetailModal.tsx L228 `#e6f4ff`/`#fafafa`, L229 `#91caff`/`#f0f0f0`; DayInsightPanel.tsx L22-23 `#52c41a`/`#faad14`/`#ff4d4f`. PlannerView.tsx L217-244 toolbar dùng token.colorBgContainer đúng, L255-279 grid 7 cột giữ nguyên cấu trúc.
- TasksView.tsx L290-354: PageHeader + QuickAddBar + TaskFilterBar + TaskTable (KHÔNG ĐỤNG) + BatchActionBar + TaskDrawer (KHÔNG ĐỤNG) + modal. QuickAddBar L108-165 là `SpaceCompact` phẳng 3 Select + Input + Button, giữ `aria-label` và `#quick-add-input`/`data-shortcut-id`. TaskFilterBar L74-90 sticky dùng token.colorBgElevated đúng, có `data-testid="task-filter-bar"` và `#task-search-input`. BatchActionBar L140-160 floating dùng token đúng, có `data-testid="batch-action-bar"`.
- TasksViewActions.test.tsx đã mock QuickAddBar/TaskTable/TaskFilterBar/BatchActionBar/TaskDrawer/FeasibilityModal và pin hành động quick-add focus, timer event. Không sửa file test này.
- AppSplashScreen.tsx L55-203: mọi style inline, gradient `#0a0d14/#101420`, glow tím `#5b4fe8/#a855f7`, progress gradient `#38bdf8/#818cf8/#ec4899`. `animation: 'pulse 2.5s infinite ease-in-out'` tại L102 nhưng repo KHÔNG có `@keyframes pulse` — animation chết. BOOT_STEPS 4 bước, progress 15/45/80/100 theo timer 0.3/0.65/0.9/1.0 × minDuration (mặc định 1800, mount ở AppIntelliJ.tsx L144 với 1900), fade 350ms rồi gọi onReady. Chưa xử lý prefers-reduced-motion. Pattern reduced-motion có sẵn ở src/styles/team-chat.css L36.

Quy ước bắt buộc: broad-read mỗi file 1 lần rồi Edit ngay, KHÔNG re-read đoạn vừa đọc (anti-read-loop). Tiếng Việt, xưng sếp, identifier/đường dẫn/lệnh/code giữ nguyên hình thức. CHỈ chạy vitest scoped path (quy tắc dự án: full suite >1 giờ) dùng `--bail=1`, tuyệt đối không dùng `-x` (Vitest 5 loại). `npx tsc --noEmit` sạch. Branch `pre-v1.6-baseline`, không tạo branch/worktree. Không dùng fenced code block trong `<action>`. Không tự ý thêm dependency. Sau khi chạy: review diff + verify Chrome light/dark theo thói quen dự án (không phải checkpoint trong plan).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sửa dark-mode planner bằng CSS var + class scoped, giữ lưới/post-it làm hero</name>
  <files>src/views/PlannerView.tsx, src/components/planner/planner-surface.css, src/components/planner/DayColumn.tsx, src/components/planner/DayColumnHeader.tsx, src/components/planner/TaskAllocationCard.tsx, src/components/planner/ActualWorklogPlanner.tsx, src/components/planner/AllocationModal.tsx, src/components/planner/FeasibilityModal.tsx, src/components/planner/WorkSessionDetailModal.tsx, src/components/planner/DayInsightPanel.tsx, src/components/planner/__tests__/plannerDarkSurface.test.ts</files>
  <action>
    Tạo `src/components/planner/planner-surface.css` rồi import một lần từ `src/views/PlannerView.tsx`. Định nghĩa các class `tm-planner-toolbar`, `tm-planner-grid`, `tm-planner-day`, `tm-planner-day-today`, `tm-planner-day-empty`, `tm-planner-card`, `tm-planner-card-active`, `tm-planner-actual-row`, `tm-planner-modal-panel` dùng `var(--bg-island)`, `var(--bg-elev)`, `var(--bg-hover)`, `var(--border)`, `var(--border-strong)`, `var(--fg-strong)`, `var(--fg-secondary)`, `var(--accent)`, `var(--accent-soft)`, `var(--info)`, `var(--info-fg)`, `var(--success)`, `var(--warning)`, `var(--danger)`, `color-mix(in srgb, var(--accent) 8%, transparent)` cho sắc thái xanh dương/teal nhẹ. Không cream/serif/terracotta, không gradient trang trí.

    Áp class vào đúng chỗ đã định vị, thay từng hardcode: DayColumn L42 nền ngày → `var(--bg-elev)` qua class, L44 border → `var(--border)`, L65 placeholder dashed → `var(--border-strong)`; DayColumnHeader L63 balance dùng `var(--success)`/`var(--danger)`, L79 highlight today → `color-mix(in srgb, var(--accent) 8%, transparent)`, L80 border today → `var(--accent)` còn lại `var(--border)`; TaskAllocationCard L175 active/inactive accent → `var(--accent)`/`var(--border-strong)`, L176 nền → `var(--bg-island)`/`var(--bg-elev)`; ActualWorklogPlanner L358/473 border → `var(--border)`, L359/378/549 nền → `var(--bg-elev)`; AllocationModal L376 nền → `var(--bg-elev)`, L388 cảnh báo quá estimate → `var(--warning)`; FeasibilityModal L316/348 → `var(--bg-elev)`, L319 → `var(--border)`; WorkSessionDetailModal L228 selected → `var(--accent-soft)` + chữ `var(--accent)`, unselected `var(--bg-elev)`, L229 border tương ứng `var(--accent)`/`var(--border)`; DayInsightPanel L22-23 delta → `var(--success)`/`var(--warning)`/`var(--danger)`. Giữ nguyên mọi text, số liệu, data-testid (`day-column-${day.date}`, `planner-grid`) và hành động click/allocate/insight — chỉ đổi lớp trình bày.

    Tạo `src/components/planner/__tests__/plannerDarkSurface.test.ts`: đọc source 8 file planner bằng `readFileSync` rồi assert không còn các literal `#fafafa`, `#f0f0f0`, `#d9d9d9`, `#f5f5f5`, `#52c41a`, `#ff4d4f`, `#faad14`, `#fa8c16`, `#e6f4ff`, `#91caff`, `rgba(22, 119, 255` trong phần style; assert `planner-surface.css` chứa `var(--bg-island)` và `var(--accent)`; assert PlannerView.tsx import CSS. Test này là guard chặn hardcode light quay lại, không render component.

    Verify: `npx vitest run src/components/planner/__tests__/plannerDarkSurface.test.ts --bail=1` và `npx tsc --noEmit`. Lưu ý chạy scoped, không chạy full suite.
  </action>
  <verify>
    <automated>npx vitest run src/components/planner/__tests__/plannerDarkSurface.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>
    Không còn hex light hardcode trong 8 file planner; mọi surface/border/status color đi qua CSS var theo theme; lưới 7 cột, thẻ allocation, bảng actual và 4 modal vẫn render đúng testid/hành động; Chrome light/dark thấy nền chữ tương phản và palette xanh dương/teal.
  </done>
</task>

<task type="auto">
  <name>Task 2: Redesign chrome trang Danh sách tác vụ thành workspace tool, không đụng TaskTable/Drawer</name>
  <files>src/views/TasksView.tsx, src/components/tasks/tasklist-workspace.css, src/components/tasks/QuickAddBar.tsx, src/components/tasks/TaskFilterBar.tsx, src/components/tasks/BatchActionBar.tsx, src/views/__tests__/TasksViewWorkspace.test.tsx</files>
  <action>
    Tạo `src/components/tasks/tasklist-workspace.css`, import từ `src/views/TasksView.tsx`. Mục tiêu: chrome quanh bảng đọc như workspace tool dày đặc (một command strip tiếp giáp bảng, toolbar sticky gọn, batch bar nổi có viền accent), KHÔNG card SaaS bo góc đồng loạt, KHÔNG gradient trang trí, KHÔNG cream/serif. Dùng `var(--bg-island)`, `var(--bg-elev)`, `var(--border)`, `var(--border-strong)`, `var(--fg-strong)`, `var(--fg-secondary)`, `var(--accent)`, `var(--accent-soft)`, `--gap-*`, `--radius-control`; riêng phần cần AntD động thì giữ `token.*` hiện có.

    Trong `TasksView.tsx`: bọc vùng PageHeader→QuickAddBar→TaskFilterBar→TaskTable bằng class `tm-tasklist` và class `tm-tasklist__toolstrip` trên nhóm quick-add/filter; giữ nguyên props, thứ tự render, PageHeader title/subtitle, Extra "Tự động phân bổ" và mọi handler (feasibility, initialCrId, quickAddRequest, selection, keyboard). TUYỆT ĐỐI không sửa nội dung `src/components/tasks/TaskTable.tsx` và `src/components/tasks/TaskDrawer.tsx`.

    Trong `QuickAddBar.tsx`: giữ `SpaceCompact` và 5 control, thêm class `tm-tasklist__quickadd` + class cho từng nhóm (chọn CR/subsystem/worktype gom thành `tm-tasklist__quickadd-selects`, input+Thêm thành `tm-tasklist__quickadd-submit`). Giữ nguyên `aria-label`, `id="quick-add-input"`, `data-shortcut-id="quick-add-input"`, placeholder, disabled, maxLength, parseQuickAddInput/createTask. Chỉ đổi class/box-shadow/border/thứ tự căn chỉnh.

    Trong `TaskFilterBar.tsx`: giữ class `tm-tasklist__filter` trên root alongside `data-testid="task-filter-bar"`, giữ sticky top:0, zIndex, ref, `#task-search-input`, mọi Segmented/Select/advanced toggle/reset và `onFilterChange` — đổi mỗi phần tử ui thành dải ngang gọn hơn (gap `--gap-8`, không padding thừa) bằng class CSS.

    Trong `BatchActionBar.tsx`: giữ `data-testid="batch-action-bar"` và position fixed; thêm class `tm-tasklist__batch`, làm nổi bật "Đã chọn N tác vụ" bằng `var(--accent)`/viền `var(--accent-soft)`, giữ nguyên Dropdown status/move/delete/Popconfirm/clear và mọi thông báo tiếng Việt.

    Tạo `src/views/__tests__/TasksViewWorkspace.test.tsx`: render `TasksView` trong `ThemeAppHolder` với mock tối thiểu cho `dexie-react-hooks`, `useTimer`, `useKeyboardShortcuts`, `useTaskFilters` và mock QuickAddBar/TaskFilterBar/TaskTable/BatchActionBar/TaskDrawer/FeasibilityModal bằng component có class/testid/aria-label thật mà redesign dùng. Assert (a) root có `tm-tasklist`, (b) `data-testid` `task-filter-bar`, `batch-action-bar` vẫn hiện, (c) `id="quick-add-input"` và `data-shortcut-id` vẫn hiện, (d) không đụng TaskTable prop `tasks`. Không chỉnh file test đã có `TasksViewActions.test.tsx`.

    Verify: `npx vitest run src/views/__tests__/TasksViewWorkspace.test.tsx src/views/__tests__/TasksViewActions.test.tsx --bail=1` và `npx tsc --noEmit`.
  </action>
  <verify>
    <automated>npx vitest run src/views/__tests__/TasksViewWorkspace.test.tsx src/views/__tests__/TasksViewActions.test.tsx --bail=1 && npx tsc --noEmit && git diff --name-only | grep -v -E '^(src/views/TasksView.tsx|src/components/tasks/(tasklist-workspace.css|QuickAddBar.tsx|TaskFilterBar.tsx|BatchActionBar.tsx)|src/views/__tests__/TasksViewWorkspace.test.tsx)$' | grep -E 'TaskTable.tsx|TaskDrawer.tsx' | wc -l | grep -qx 0</automated>
  </verify>
  <done>
    Trang tasklist có toolbar/command strip/batch bar thống nhất theo ngôn ngữ workspace tool; mọi testid, shortcut id, aria-label, handler lọc/thêm/hàng loạt giữ nguyên; TasksViewActions test cũ vẫn pass; diff không chạm TaskTable.tsx hay TaskDrawer.tsx.
  </done>
</task>

<task type="auto">
  <name>Task 3: Splash orchestrated một lần, palette xanh dương/teal, tôn trọng reduced-motion</name>
  <files>src/components/AppSplashScreen.tsx, src/components/app-splash.css, src/components/__tests__/AppSplashScreen.test.tsx</files>
  <action>
    Tạo `src/components/app-splash.css` rồi import từ `src/components/AppSplashScreen.tsx`. Chuyển toàn bộ inline style L55-203 sang class `tm-splash`, `tm-splash__ambient`, `tm-splash__mark`, `tm-splash__title`, `tm-splash__eyebrow`, `tm-splash__progress`, `tm-splash__progress-fill`, `tm-splash__step`, `tm-splash__footer`. Palette nền xanh dương đậm/teal (`var(--accent)`-derived, dùng `color-mix`), bỏ neon tím/hồng (`#5b4fe8`, `#a855f7`, `#ec4899`, `#818cf8`). Không serif, không cream.

    Thay `animation: 'pulse 2.5s infinite ease-in-out'` (tham chiếu `@keyframes pulse` KHÔNG tồn tại trong repo) bằng keyframes có thật `tm-splash-settle` chạy ĐÚNG 1 lần (logo vào vị trí rồi đứng yên), không infinite. Progress bar chuyển từ `transition: width 0.25s` sang `transition: width 0.25s linear`. Giữ nguyên BOOT_STEPS 4 bước, mốc timer 0.3/0.65/0.9/1.0 × minDuration, fade 350ms rồi `onReady?.()`, props `onReady`/`minDuration`, text tiếng Việt và footer tác giả. Giữ `position: fixed`, `zIndex: 99999`, `userSelect: none`, focus/aria không đổi ngữ nghĩa.

    Trong CSS thêm `@media (prefers-reduced-motion: reduce)` đặt `animation: none` cho `.tm-splash__mark`, `transition: none` cho `.tm-splash__progress-fill` và `.tm-splash`, đồng thời assertion trong test phải chứng minh nhánh này được áp dụng (mock matchMedia trả matches=true). Dùng CSS media query thay JS để không thêm state.

    Tạo `src/components/__tests__/AppSplashScreen.test.tsx` với `vi.useFakeTimers()`: (1) render mặc định, assert bước 0 và progress 15%, advance 0.3×minDuration → bước 1 / 45%, 0.65× → bước 2 / 80%, 0.9× → bước 3 / 100%; (2) advance tới minDuration+350ms → `onReady` gọi đúng 1 lần; (3) mock `window.matchMedia('(prefers-reduced-motion: reduce)')` matches=true, assert class `tm-splash` vẫn render và không có inline `animation` nào chứa `infinite`; (4) unmount trước khi finish → không gọi `onReady` (cleanup timer). Không thêm dependency.

    Verify: `npx vitest run src/components/__tests__/AppSplashScreen.test.tsx --bail=1` và `npx tsc --noEmit`.
  </action>
  <verify>
    <automated>npx vitest run src/components/__tests__/AppSplashScreen.test.tsx --bail=1 && npx tsc --noEmit && ! grep -qE '#5b4fe8|#a855f7|#ec4899|#818cf8|pulse 2\.5s infinite' src/components/AppSplashScreen.tsx src/components/app-splash.css</automated>
  </verify>
  <done>
    Splash dùng class CSS + keyframes có định nghĩa, không animation vô hạn, không neon tím/hồng; 4 bước boot và onReady giữ nguyên thời gian; reduced-motion tắt animation/transition; test fake-timer xanh.
  </done>
</task>

<task type="auto">
  <name>Task 6: Sketch 017 winner A — Dense Table full tasklist redesign</name>
  <files>src/components/tasks/tasklist-workspace.css, src/views/TasksView.tsx, src/components/tasks/TaskTable.tsx, src/components/tasks/__tests__/TaskTableDense.test.tsx</files>
  <action>
    Triển khai variant A (Dense Table) đã được sếp duyệt: bảng dày, mỗi row là high-signal line gồm tên + CR/Mốc/Subsystem, status badge, priority dots, due date có màu; light+dark đều đẹp; KHÔNG group header, KHÔNG card layout. Bổ sung class scoped `.tm-tasklist__deck`, `.tm-tasklist__deck-head`, `.tm-tasklist__deck-stat`, `.tm-tasklist__table`, `.tm-tasklist__task-name`, `.tm-tasklist__meta`, `.tm-tasklist__status`, `.tm-tasklist__priority`, `.tm-tasklist__due`, `.tm-tasklist__due--late`, `.tm-tasklist__due--today`, `.tm-tasklist__avatar`, `.tm-tasklist__rowops` trong tasklist-workspace.css dùng CSS var token có sẵn, header cột không wrap, row ~44px. Trong TaskTable gộp CR/Mốc/Subsystem thành cột "Tên tác vụ · CR · Mốc" theo sketch A, cập nhật column config keys/test phù hợp, giữ nguyên data/schema, sorting, sticky header, keyboard nav, context menu, rowSelection, pagination, column customisation, standup copy, timer, progress, workType filters, opsOwner/BA inheritance, Jira/link/note/recurring indicators, ghost dev, mọi data-testid/id/aria-label/STORAGE_COLUMNS_KEY/ALL_CUSTOMIZABLE_COLUMNS/DEFAULT_VISIBLE_COLUMNS. Priority render 5 dots với aria-label="Ưu tiên <label>/5", giữ weights sort hiện tại (Urgent=4..Low=1). Due date overdue `var(--danger)`, today `var(--warning)`, còn lại `var(--fg-secondary)`, format YYYY-MM-DD. Giữ InlineStatusTag, bọc `.tm-tasklist__status`. Table `size="small"`, className `tm-tasklist__table`, thay inline `token.colorText`/`token.colorTextQuaternary` bằng CSS var. Trong TasksView bọc TaskTable trong section `.tm-tasklist__deck` với deck head gọn: title + stats "Đang làm / Quá hạn / Tổng" từ filteredTasks, giữ PageHeader và nút "Tự động phân bổ" nguyên aria-label/handler. Tạo test guard `src/components/tasks/__tests__/TaskTableDense.test.tsx` cho header gộp, class table, priority dots, due --late, keyboard Arrow/Enter, checkbox selection. Chạy scoped `npx vitest run src/views/__tests__/TasksViewWorkspace.test.tsx src/components/tasks/__tests__/TaskTableDense.test.tsx --bail=1` và `npx tsc --noEmit`. Verify Chrome riêng light/dark qua Playwright, screenshot /tmp/fqs-verify/tasklist-dense-{light,dark}.png. KHÔNG đụng file peer đã khóa. Commit riêng code+test+plan update, KHÔNG commit STATE.md.
  </action>
  <verify>
    <automated>npx vitest run src/views/__tests__/TasksViewWorkspace.test.tsx src/components/tasks/__tests__/TaskTableDense.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>
    Tasklist là dense table variant A, header không wrap, row ~44px, priority dots/due màu đúng light+dark; mọi hành động/testid/sort/filter cũ nguyên vẹn; scoped test và tsc xanh; screenshot light/dark có đường dẫn báo cáo; commit chỉ chứa file mình.
  </done>
</task>

<task type="auto">
  <name>Task 7: Điều chỉnh implementation sát hơn sketch 017 variant A — deck head, command bar 1 dòng, countline, rowops</name>
  <files>.planning/quick/261128-fqs-check-fix-capacity-planner-page-dark-mod/261128-fqs-PLAN.md, src/views/TasksView.tsx, src/components/tasks/tasklist-workspace.css, src/components/tasks/QuickAddBar.tsx, src/components/tasks/TaskFilterBar.tsx, src/components/tasks/BatchActionBar.tsx, src/components/tasks/TaskTable.tsx, src/components/tasks/__tests__/TaskTableDense.test.tsx</files>
  <action>
    Chỉnh implementation Task 6 theo đúng sketch A: deck head gồm title + subtitle ".command deck · quản lý, phân bổ, theo dõi" + stats + nút "+ Thêm" đặt trong deck; PageHeader giữ nguyên aria-label/handler, có thể đổi subtitle. Command bar gộp thành 1-2 dòng tối đa: search + segmented "Tất cả / CR / Độc lập" + select CR/Subsystem/Sort + "⚙ Tuỳ biến cột"; giữ quick-add, status/priority/date filters bằng Popover "Bộ lọc nâng cao" — KHÔNG xoá, giữ id `quick-add-input`, `data-shortcut-id`, `data-testid="task-filter-bar"`, aria-label, handler, refs. TaskTable: đưa sort control vào countline/command bar phía trên, bỏ toolbar trùng lặp; CR tag bordered + tint riêng; mốc/subsystem rõ ràng; thêm avatar tròn 22px + nút "⋯" rowops opacity thấp hiện khi hover (owner từ opsOwner/BA, fallback initials từ tên); giữ "Sao chép Standup" ở deck head. CSS dùng token, light/dark đẹp, row 44-54px, header nowrap. Cập nhật TaskTableDense.test.tsx nếu cần; giữ TasksViewWorkspace.test.tsx xanh. Chạy scoped tests + tsc. Verify Chrome riêng light/dark (context riêng, không đóng tab peer), screenshot overwrite /tmp/fqs-verify/tasklist-dense-{light,dark}.png, kiểm tra computed style command bar height, CR tag tint, priority dot, batch bar. Commit riêng `git add -- <exact paths>`, kiểm tra `git diff --cached --name-only`, message ending Co-Authored-By: Claude Code <noreply@anthropic.com>. KHÔNG commit .planning/STATE.md hay file peer.
  </action>
  <verify>
    <automated>npx vitest run src/views/__tests__/TasksViewWorkspace.test.tsx src/components/tasks/__tests__/TaskTableDense.test.tsx --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>
    Tasklist trông sát sketch A: deck head chứa stats + "+ Thêm", command bar 1-2 dòng, countline có hint, CR tag tint/bordered, mốc/subsystem rõ, avatar + rowops, sort không trùng lặp; logic/testid/shortcut/handler giữ nguyên; screenshots light/dark được overwrite; commit riêng chỉ chứa file được phép.
  </done>
</task>

</tasks>

<verification>
Chạy lần lượt 3 lệnh scoped (tuyệt đối không chạy full vitest):
- `npx vitest run src/components/planner/__tests__/plannerDarkSurface.test.ts --bail=1`
- `npx vitest run src/views/__tests__/TasksViewWorkspace.test.tsx src/views/__tests__/TasksViewActions.test.tsx --bail=1`
- `npx vitest run src/components/__tests__/AppSplashScreen.test.tsx --bail=1`
- `npx tsc --noEmit`
- `git diff --name-only` đối chiếu danh sách files_modified; xác nhận 0 file locked xuất hiện.
Sau đó review diff và verify Chrome ở cả light/dark cho 3 màn hình theo thói quen dự án.
</verification>

<success_criteria>
- Task 1: 0 hardcode light hex trong planner surface, palette xanh dương/teal, dark mode không còn nền sáng/chữ tối; lưới 7 cột và post-it allocation giữ nguyên.
- Task 2: tasklist chrome là workspace tool nhất quán quanh bảng; mọi testid/shortcut id/hành động giữ nguyên; TaskTable.tsx và TaskDrawer.tsx byte-identical.
- Task 3: splash có keyframes thật chạy 1 lần, reduced-motion được tôn trọng, onReady đúng hạn, không neon tím/hồng.
- Không file thuộc session song song nào bị sửa; không dependency mới; scoped test + tsc sạch.
</success_criteria>

<output>
Create `.planning/quick/261128-fqs-check-fix-capacity-planner-page-dark-mod/261128-fqs-SUMMARY.md` when done
</output>
