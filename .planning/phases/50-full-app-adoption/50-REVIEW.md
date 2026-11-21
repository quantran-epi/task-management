---
phase: 50-full-app-adoption
reviewed: 2026-11-21T15:11:33Z
depth: standard
files_reviewed: 115
files_reviewed_list:
  - e2e/adoption.spec.ts
  - scripts/adoption-codemod.mjs
  - src/AppIntelliJ.tsx
  - src/components/agents/AgentDiffReviewer.tsx
  - src/components/agents/AgentTerminalLog.tsx
  - src/components/agents/CodingZoneDiffPanel.tsx
  - src/components/agents/RunGhostDevModal.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatInputBar.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/MermaidViewer.tsx
  - src/components/ai/office/TeamWorkspace.tsx
  - src/components/ai/runtime/useChatTurn.ts
  - src/components/changeRequests/ChangeRequestModal.tsx
  - src/components/changeRequests/ChangeRequestTable.tsx
  - src/components/changeRequests/TargetSystemsSelector.tsx
  - src/components/dashboard/AttentionTodayList.tsx
  - src/components/knowledge/GraphEvidenceDrawer.tsx
  - src/components/notes/BacklinksSection.tsx
  - src/components/notes/DocEditorPane.tsx
  - src/components/notes/DocFolderContentsView.tsx
  - src/components/notes/DocFolderTree.tsx
  - src/components/notes/DocListPane.tsx
  - src/components/notes/DocOutlineToC.tsx
  - src/components/notes/DocsLibraryActions.tsx
  - src/components/notes/EntityNotesSection.tsx
  - src/components/notes/NormalizeDocModal.tsx
  - src/components/notes/NoteAttachmentsPanel.tsx
  - src/components/notes/NoteDetailModal.tsx
  - src/components/notes/NoteEditor.tsx
  - src/components/notes/QuickNoteEntry.tsx
  - src/components/notes/QuickPreviewDrawer.tsx
  - src/components/notes/SmartIngestionBanner.tsx
  - src/components/notes/ZipImportPreviewModal.tsx
  - src/components/palette/CommandPaletteModal.tsx
  - src/components/planner/ActualWorklogPlanner.tsx
  - src/components/planner/AllocationModal.tsx
  - src/components/planner/CandidateAllocationsTable.tsx
  - src/components/planner/CapacitySettingsModal.tsx
  - src/components/planner/DateInspectionBreakdown.tsx
  - src/components/planner/DayColumn.tsx
  - src/components/planner/DayColumnHeader.tsx
  - src/components/planner/DayInsightPanel.tsx
  - src/components/planner/FeasibilityModal.tsx
  - src/components/planner/TaskAllocationCard.tsx
  - src/components/planner/WeekNavigator.tsx
  - src/components/planner/WorkSessionDetailModal.tsx
  - src/components/systems/SystemTable.tsx
  - src/components/tasks/BatchActionBar.tsx
  - src/components/tasks/CreateJiraIssueModal.tsx
  - src/components/tasks/HierarchyBreadcrumb.tsx
  - src/components/tasks/InlineProgress.tsx
  - src/components/tasks/InlineStatusTag.tsx
  - src/components/tasks/LinkedKnowledgeSection.tsx
  - src/components/tasks/ManualWorkSessionModal.tsx
  - src/components/tasks/QuickAddBar.tsx
  - src/components/tasks/TaskChecklistSection.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/tasks/TaskDrawerPlanning.tsx
  - src/components/tasks/TaskFilterBar.tsx
  - src/components/tasks/TaskJiraSection.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/tasks/WorkSessionsTab.tsx
  - src/components/tasks/WorkTypeBadge.tsx
  - src/components/ui/__tests__/guardConfig.test.ts
  - src/components/ui/__tests__/inlineStyleSweep.test.ts
  - src/components/ui/__tests__/staticApiGuard.test.ts
  - src/components/ui/__tests__/wave02Wrappers.test.tsx
  - src/components/ui/antdTheme.ts
  - src/components/ui/config-provider.tsx
  - src/components/ui/date-picker.tsx
  - src/components/ui/icon.tsx
  - src/components/ui/index.ts
  - src/components/ui/input.tsx
  - src/components/ui/mentions.tsx
  - src/components/ui/splitter.tsx
  - src/components/ui/textarea.tsx
  - src/hooks/useNetworkStatus.ts
  - src/hooks/useTimerAlertMonitor.ts
  - src/services/ai/claudeCliService.ts
  - src/utils/documentLinks.tsx
  - src/utils/exportFolderZip.ts
  - src/utils/mermaidExport.ts
  - src/views/AIPopoutView.tsx
  - src/views/AgentControlView.tsx
  - src/views/AiOfficeView.tsx
  - src/views/AnalyticsView.tsx
  - src/views/ChangeRequestDetailView.tsx
  - src/views/ChangeRequestsView.tsx
  - src/views/ConfigProfilesView.tsx
  - src/views/DashboardView.tsx
  - src/views/ItemInsightView.tsx
  - src/views/MermaidAssistantView.tsx
  - src/views/NotesPopoutView.tsx
  - src/views/NotesView.tsx
  - src/views/PlannerView.tsx
  - src/views/SettingsView.tsx
  - src/views/StaffDetailView.tsx
  - src/views/SystemCatalogView.tsx
  - src/views/SystemDetailView.tsx
  - src/views/TasksView.tsx
  - src/views/TeamWorkspaceView.tsx
  - src/views/TelegramMonitorView.tsx
  - src/views/TimerPopoutView.tsx
  - src/views/__tests__/TasksViewActions.test.tsx
  - src/workbench/AntdThemeAdapter.tsx
  - src/workbench/TitleBar.tsx
  - src/workbench/__tests__/AntdThemeAdapter.test.tsx
  - src/workbench/__tests__/actionRegistry.test.ts
  - src/workbench/actions/actionRegistry.ts
  - src/workbench/hooks/useGlobalKeymap.ts
  - src/workbench/search/SearchEverywhereModal.tsx
  - src/workbench/toolwindows/DocsExplorer.tsx
  - src/workbench/toolwindows/RemoteGitExplorer.tsx
  - tests/ai/chatActions.test.ts
  - tests/fixtures/adoption/wave-01.txt
  - tests/fixtures/adoption/wave-02.txt
  - tests/fixtures/adoption/wave-03.txt
  - tests/fixtures/adoption/wave-04.txt
  - tests/fixtures/adoption/wave-05.txt
  - tests/fixtures/adoption/wave-06.txt
  - tests/fixtures/adoption/wave-07.txt
  - tests/fixtures/adoption/wave-08.txt
  - tests/utils/mermaidExport.test.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 50: Code Review Report

**Reviewed:** 2026-11-21T15:11:33Z
**Depth:** standard
**Files Reviewed:** 115
**Status:** issues_found

## Summary

Phase 50 là đợt migration cơ học quy mô lớn: đổi import `antd`/`@ant-design/icons` sang UI barrel, thay static `message`/`notification`/`Modal.confirm` bằng hook (`useMessage`/`useNotification`/`useTaskMateModal`), và thay token inline bằng CSS var. Đa số thay đổi là cơ học và nhất quán. Đã xác nhận bằng công cụ: `tsc --noEmit` sạch (exit 0), `eslint src` không có error (6 warning directive dư), 90 test scoped đều pass, mọi caller của `useTaskMateModal` đều render `contextHolder`, mọi root render đều nằm trong `ThemeAppHolder`, static API guard sạch.

Tuy nhiên tồn tại 6 vấn đề: 4 warning (1 regression hành vi thật từ migration, 1 stale closure tiềm ẩn, 1 lỗi codemod, 1 guard vô hiệu) và 2 info. Không có lỗi bảo mật hay mất dữ liệu.

## Warnings

### WR-01: Wrapper `Form` ghi đè `layout` của caller — form GitHub Sync chuyển từ inline sang vertical

**File:** `src/components/ui/form.tsx:23-31`; trigger tại `src/components/settings/GitHubSyncCard.tsx:517`

**Issue:** `Form` wrapper tính `layout` từ `labelPolicy` (mặc định `'top'` → `'vertical'`) rồi đặt `layout={layout}` SAU `...rest`. Vì `FormProps extends AntFormProps`, caller vẫn truyền được `layout` nhưng giá trị bị bỏ qua. Trước migration, `GitHubSyncCard` import `Form` trực tiếp từ `'antd'` và dùng `<Form layout="inline">` cho form cấu hình lịch tự động đồng bộ (chế độ / giờ chạy / mỗi phút). Sau migration sang UI barrel (commit `905adebd`), `layout="inline"` bị wrapper ép thành `vertical` — form bị xếp chồng thay vì nằm ngang. Đây là regression hành vi có thật do phase này gây ra. ESLint/tsc không bắt vì kiểu vẫn hợp lệ.

**Fix:** Tôn trọng `layout` của caller khi có:

```tsx
export function Form({ labelPolicy = 'top', style, ...rest }: FormProps) {
  const policyLayout = labelPolicy === 'inline' ? 'inline' : labelPolicy === 'left' ? 'horizontal' : 'vertical';
  return (
    <AntForm
      {...rest}
      layout={rest.layout ?? policyLayout}
      requiredMark={rest.requiredMark ?? true}
      style={{ ...formStyle(), ...style }}
    />
  );
}
```

### WR-02: `useGlobalKeymap` bắt closure `notify` trong effect có deps rỗng

**File:** `src/workbench/hooks/useGlobalKeymap.ts:14-16,116`

**Issue:** `notify` được tạo mới mỗi render (`(kind, text) => message[kind](text)`), nhưng `useEffect(..., [])` chỉ chạy một lần và capture bản đầu. Hiện tại `message` từ `AntApp.useApp()` tương đối ổn định nên chạy được, nhưng đây là stale-closure tiềm ẩn: nếu holder `ThemeAppHolder` mount lại hoặc AntD trả instance mới, mọi thông báo phím tắt (`Ctrl+K`, `Alt+1..9`, `Alt+T`...) sẽ gọi instance cũ, im lặng hoặc lỗi. Đặc biệt dự án chuyển đổi theme trong lúc chạy — holder nằm dưới `AntdThemeAdapter`, dễ bị re-mount. `eslint.config.mjs` chỉ bật `react-hooks/rules-of-hooks`, KHÔNG bật `exhaustive-deps`, nên không có gì cảnh báo.

**Fix:** Dùng ref cho notify, hoặc đưa `message` vào deps:

```tsx
const notifyRef = useRef<ActionNotify>((kind, text) => message[kind](text));
notifyRef.current = (kind, text) => message[kind](text);
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // ... executeAction('...', notifyRef.current)
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### WR-03: Codemod bỏ sót static `Modal` — có thể sinh mã crash khi chạy lại

**File:** `scripts/adoption-codemod.mjs:11,91`

**Issue:** `STATIC_APIS = new Set(['message', 'notification'])` không chứa `Modal`. Với file import `Modal` từ `'antd'` và gọi `Modal.confirm(...)`, codemod không cảnh báo mà rewrite lặng lẽ import `Modal` từ UI barrel — component `Modal` declarative (`src/components/ui/modal.tsx:38`) không có static `.confirm`; static `Modal.confirm` chỉ có qua `useTaskMateModal()`. Kết quả: `Modal.confirm is not a function` lúc runtime. Đã reproduce bằng probe: input `import { Modal, message } from 'antd'` + `Modal.confirm()` → output `import { Modal } from '../ui'` + `Modal.confirm()` không có warning cho `Modal`. Các file hiện tại đã convert hết sang `modal.confirm` nên không ảnh hưởng ngay, nhưng tool vẫn là nguồn sinh mã trong repo và sẽ tái phạm nếu chạy lại trên file cũ.

**Fix:** Thêm `'Modal'` vào `STATIC_APIS` và đảm bảo warning nhắc convert sang `useTaskMateModal`:

```js
const STATIC_APIS = new Set(['message', 'notification', 'Modal']);
```

### WR-04: Guard `inlineStyleSweep` dùng regex sai — không chặn được literal `gap` số

**File:** `src/components/ui/__tests__/inlineStyleSweep.test.ts:11`

**Issue:** Pattern `/\bgap:\s*[diagram]\b/i` viết nhầm thành character class. `[diagram]` chỉ khớp MỘT ký tự trong tập `{d,i,a,g,r,m}` kèm `\b` phía sau, nên chỉ bắt được `gap: d` (không tồn tại trong code) và BỎ SOT mọi giá trị thật như `gap: 6`, `gap: 8`, `gap: 12`. Kiểm chứng: `gap: 8` → false, `gap: diagram` → false, `gap: d` → true. Guard này tạo cảm giác an toàn giả cho mục tiêu D-09 ("token phải đi qua CSS var, không literal"), trong khi bỏ sót đúng thứ nó cần chặn — giống hệt các pattern `fontSize`/`borderRadius`/hex đi kèm. Ảnh hưởng tới độ tin cậy của test guard (nằm trong scope review).

**Fix:** Sửa thành pattern bắt số literal, ví dụ:

```ts
/\bgap:\s*\d+\b/,
```

hoặc nếu ý định là cấm các token cụ thể, dùng grouping đúng: `/\bgap:\s*(?:diagram|6|8|12)\b/i`.

## Info

### IN-01: Directive `eslint-disable react-hooks/exhaustive-deps` dư sau migration

**File:** `src/components/changeRequests/ChangeRequestModal.tsx:114`, `src/components/notes/NormalizeDocModal.tsx:142`, `src/workbench/toolwindows/RemoteGitExplorer.tsx:459`, `src/workbench/search/find/FindInRemoteFiles.tsx:103`

**Issue:** `eslint src` báo 6 warning "Unused eslint-disable directive". Các directive này từng chặn `exhaustive-deps` trước migration; sau khi migration thay đổi dependency array, chúng trở nên vô dụng và gây nhiễu. Không gây lỗi runtime nhưng là tín hiệu deps array đã thay đổi mà chưa rà soát lại.

**Fix:** Xóa các directive dư (hoặc bật lại `exhaustive-deps` nếu muốn guard thực sự — hiện tại config chỉ có `rules-of-hooks`).

### IN-02: Helper trong `documentLinks` có noop default — mất feedback/confirm im lặng nếu caller quên truyền

**File:** `src/utils/documentLinks.tsx:9-10,57,84,198`

**Issue:** `openLocalPathInExplorer`, `launchClaudeAtLocalPath`, `promptLocalPathAction` nhận `notify`/`confirm` với default `noopNotify`/`noopConfirm`. `noopConfirm` trả `{ destroy(){} }` và không gọi resolve — nếu caller tương lai quên truyền `confirm`, `promptLocalPathAction` hiện dialog vô hình và `openDocumentLink` có thể treo không phản hồi. Hiện tại mọi caller nội bộ đã truyền đủ callback (đã kiểm tra), nên chỉ là rủi ro tiềm ẩn.

**Fix:** Bỏ default, bắt buộc caller truyền `notify`/`confirm` (type-level) để lỗi lộ ra lúc compile thay vì im lặng lúc runtime.

---

_Reviewed: 2026-11-21T15:11:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
