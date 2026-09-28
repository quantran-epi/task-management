# Phase 12: In-App Notifications, Proactive Alerts & Custom Reminders - Research

**Researched:** 2026-09-28  
**Domain:** In-app notifications, proactive alerts, capacity overload detection, custom reminders, Dexie v4 schema upgrade, Web Notification API  
**Confidence:** HIGH  

## Summary

Phase 12 adds proactive in-app notifications and customizable reminders to Personal Task & Workload Planner without external server dependencies or push infrastructure. All computation runs 100% locally in browser via Dexie live queries over existing domain stores (`tasks`, `projects`, `milestones`, `capacityRules`, `capacityOverrides`, `plannedAllocations`, `settings`).

Core features:
1. Header notification bell (`NotificationBell`) with red badge counter in `AppShell` header.
2. Slide-out notification drawer (`NotificationDrawer`) with 5 tabs: All, Overdue & Due Soon, Capacity Overload, Stale Tasks, Reminders.
3. Custom reminder date (`reminderDate: YYYY-MM-DD`) and optional note (`reminderNote: string`) on `Project`, `Milestone`, `Task` entities with Dexie schema v4 indexing.
4. Automated 14-day capacity overload detection (>100% load) leveraging existing `getEffectiveDailyCapacity` and `calculateDayMetrics`.
5. Stale task detection (>5 days inactive in `In Progress` or `In Review`) resetting upon task update or allocation changes.
6. Day-scoped dismiss mechanism (`dismissedAlerts` map in `settings` table) valid for current calendar day on Stale and Reminder alerts only; Overdue and Overload cannot be dismissed.
7. Optional local browser desktop notification (`window.Notification`) on app startup if permitted.

**Primary recommendation:** Build a dedicated `useNotifications` hook backed by `useLiveQuery` that aggregates alerts reactively from Dexie, and keep modal/drawer opening self-contained inside `AppShell` or `NotificationDrawer` to allow instant resolution from any view.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reminder field storage | Database (IndexedDB via Dexie) | Models / Validation (`schemas.ts`) | `reminderDate` and `reminderNote` must persist durably offline across sessions with index support |
| Alert aggregation & reactivity | Client Hook (`useNotifications`) | Dexie (`useLiveQuery`) | Reactively computes active alerts across tasks, projects, milestones, rules, overrides, and allocations |
| Header badge display | Client UI (`AppShell` Header) | `NotificationBell` | Always visible across all routes to surface urgent problems immediately |
| Categorized alert browsing | Client UI (`NotificationDrawer`) | Ant Design `Tabs`, `List` | Multi-category organization prevents notification clutter and supports focused triage |
| Day-scoped dismiss persistence | Database (`settings` store) | Client Hook (`useNotifications`) | Stores `{ [alertKey]: 'YYYY-MM-DD' }` so dismiss survives page refresh but reactivates next calendar day |
| Quick complete action | Repository (`taskRepo.ts`) | UI (`Checkbox` in alert item) | Reuses `updateTaskStatus` for instant resolution directly from drawer |
| Planner day navigation | Router (`useHashRoute`) | UI (`Button` "Xem lịch") | Deep-links directly to `/planner?date=YYYY-MM-DD` |
| Local desktop notifications | Browser Native (`window.Notification`) | UI / Hook (`NotificationSettingsCard`) | Local tab-open notification only; zero server push dependencies |

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Drawer & Phân loại Thông báo (Notification Drawer & Categorization)
- **D-01:** Bố cục Drawer dạng Tabs: Gồm các tab "Tất cả", "Quá hạn & Đến hạn", "Quá tải công suất", "Ứ đọng", "Nhắc nhở" giúp phân loại mạch lạc và lọc nhanh khi có nhiều cảnh báo.
- **D-02:** Header Alert Badge: Đặt icon Chuông (`<BellOutlined />`) kèm Badge đỏ hiển thị tổng số cảnh báo đang kích hoạt (chưa được xử lý hoặc chưa bị ẩn) trên thanh Header của `AppShell`, nằm cạnh `StatusBadge` và `InstallButton`.
- **D-03:** Hành vi khi nhấp vào mục thông báo: Mở ngay `TaskDrawer` (đối với Task) hoặc Modal tương ứng (`ProjectModal`, `MilestoneModal`) để người dùng xem và xử lý lập tức; tự động đóng Drawer thông báo.
- **D-04:** Thao tác nhanh (Quick Action): Hỗ trợ Checkbox đánh dấu hoàn thành (Done) trực tiếp trên dòng cảnh báo task (kế thừa mẫu tương tác từ `AttentionTodayList`).
- **D-05:** Thứ tự ưu tiên sắp xếp trong tab "Tất cả":
  1. Tác vụ quá hạn (Overdue) - Nghiêm trọng nhất
  2. Ngày quá tải công suất (>100% Capacity)
  3. Tác vụ đến hạn hôm nay / ngày mai (Due soon)
  4. Tác vụ ứ đọng (>5 ngày không cập nhật)
  5. Nhắc nhở tùy chỉnh (Custom reminders)

#### Nhắc nhở Tùy chỉnh & Nâng cấp Dữ liệu (Custom Reminders & Data Model)
- **D-06:** Mô hình dữ liệu Reminder: Bổ sung 2 trường tùy chọn trực tiếp vào interface `Project`, `Milestone`, và `Task` trong `src/types/models.ts`:
  - `reminderDate?: string` (định dạng chuẩn `YYYY-MM-DD`)
  - `reminderNote?: string` (chuỗi ghi chú nội dung nhắc nhở)
- **D-07:** Nâng cấp Dexie schema lên Version 4: Đánh index `reminderDate` trên cả 3 bảng `projects`, `milestones`, `tasks` để hỗ trợ truy vấn phản ứng nhanh qua `useLiveQuery`. Cập nhật Zod validation schemas (`schemas.ts` và `backupSchemas.ts`) để đồng bộ sao lưu và phục hồi.
- **D-08:** Giao diện nhập liệu: Bổ sung trường chọn "Ngày nhắc nhở" (Ant Design `DatePicker`) và "Ghi chú nhắc nhở" (Ant Design `Input`) trong form tạo/sửa của `ProjectModal`, `MilestoneModal`, và `TaskDrawer`.
- **D-09:** Điều kiện kích hoạt nhắc nhở (Active Alert): Hiển thị cảnh báo khi `currentDate >= reminderDate` VÀ trạng thái item chưa hoàn thành (`status !== 'Done'` và `status !== 'Cancelled'`).
- **D-10:** Điều kiện kết thúc nhắc nhở: Tự động hết cảnh báo khi item chuyển sang `Done` hoặc `Cancelled`, hoặc khi người dùng xóa trắng trường `reminderDate` trong form.

#### Quy tắc Phát hiện Quá tải & Tác vụ Ứ đọng (Overload & Stale Detection Rules)
- **D-11:** Phạm vi quét Quá tải công suất (Overload Horizon): Quét trong phạm vi 14 ngày tới (từ `currentDate` đến `currentDate + 14 ngày`). Cảnh báo mọi ngày có tổng số phút phân bổ kế hoạch vượt quá 100% công suất làm việc khả dụng (tính theo CapacityRule tuần + CapacityOverride ngoại lệ).
- **D-12:** Tương tác cảnh báo Quá tải: Dòng cảnh báo hiển thị rõ Ngày, Tỷ lệ quá tải (VD: `10h / 8h - 125%`), và số lượng tác vụ phân bổ. Khi nhấp vào, điều hướng người dùng sang `PlannerView` và cuộn/tập trung vào đúng ngày đó để điều phối lại lịch làm việc.
- **D-13:** Tiêu chí Tác vụ Ứ đọng (Stale Task): Xác định đối với các tác vụ có trạng thái `In Progress` hoặc `In Review` mà khoảng cách `currentDate - updatedAt > 5 ngày`. Mọi thao tác chỉnh sửa task (tiến độ, phân bổ, ghi chú) đều tự động cập nhật `updatedAt` và thiết lập lại bộ đếm 5 ngày.

#### Cơ chế Ẩn/Bỏ qua Cảnh báo (Dismiss & Snooze Policy)
- **D-14:** Lưu trữ trạng thái Dismiss: Lưu danh sách các cảnh báo đã bỏ qua trong bảng `settings` của IndexedDB dưới key `dismissedAlerts` dạng bản đồ `{ [alertKey]: dismissedDate }`.
- **D-15:** Giới hạn phạm vi Dismiss: Chỉ cho phép người dùng bấm "Bỏ qua" (Dismiss) đối với Cảnh báo việc ứ đọng và Nhắc nhở tùy chỉnh. Các cảnh báo nghiêm trọng (Tác vụ quá hạn và Quá tải công suất) KHÔNG cho phép dismiss, bắt buộc phải giải quyết trên dữ liệu thực tế.
- **D-16:** Hiệu lực Dismiss: Cảnh báo đã bỏ qua chỉ bị ẩn đến hết ngày hiện tại (`dismissedDate === currentDate`). Sang ngày mới, nếu vấn đề vẫn tồn tại, hệ thống sẽ kích hoạt cảnh báo trở lại để không bị lãng quên.
- **D-17:** Không cung cấp nút "Ẩn tất cả" (Dismiss All / Clear All) nhằm tránh thao tác xóa hàng loạt làm mất tập trung vào các trách nhiệm cá nhân cần giải quyết.

#### Thông báo Trình duyệt Cục bộ (Local Browser Desktop Notifications)
- **D-18:** Bổ sung tùy chọn "Thông báo trình duyệt" sử dụng Web Notification API tiêu chuẩn của trình duyệt (`window.Notification`). Tính năng này chạy cục bộ khi tab web đang mở, không phụ thuộc máy chủ push bên ngoài.
- **D-19:** Cơ chế kích hoạt: Cung cấp nút bật/tắt (Toggle) trong màn hình Cài đặt (SettingsView) hoặc ngay trên Drawer thông báo (mặc định tắt). Khi người dùng kích hoạt, ứng dụng gọi `Notification.requestPermission()`. Nếu được cấp quyền, ứng dụng sẽ phát một thông báo tóm tắt trên màn hình hệ điều hành khi mở app nếu phát hiện có việc quá hạn, quá tải hoặc có nhắc nhở đến hạn hôm nay.

### Claude's Discretion
- Chiều rộng Drawer: Khoảng 420px trên màn hình desktop, 100% chiều rộng trên thiết bị di động (mobile breakpoint).
- Icon và màu sắc Tag nhận diện cho từng loại thông báo (Quá hạn: Error/Đỏ, Quá tải: Warning/Cam, Đến hạn: Processing/Xanh dương, Ứ đọng: Purple, Nhắc nhở: Gold/Cyan).
- Xử lý âm thanh/rung: Giữ thông báo nhẹ nhàng, không phát âm thanh làm phiền.

### Deferred Ideas (OUT OF SCOPE)
- **FUTR-01**: Đồng bộ webhook 2 chiều với Jira Cloud (yêu cầu server backend).
- **FUTR-03**: Native Browser Push Notification API với Service Worker Background Sync (thông báo khi đóng hoàn toàn trình duyệt - yêu cầu push service / backend).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | User can set custom reminder date (`reminderDate: YYYY-MM-DD`) and optional note on Project, Milestone, and Task. | Supported by models update (`models.ts`), Dexie schema v4 indexing (`schema.ts`, `db/index.ts`), Zod validation schemas (`schemas.ts`, `backupSchemas.ts`), and form additions in `ProjectModal`, `MilestoneModal`, `TaskDrawer`. |
| NOTIF-02 | User sees proactive in-app alert badge and notification drawer in application header showing active alerts. | Supported by `NotificationBell` in `AppShell` header with badge count, `NotificationDrawer` with 5 tabs, responsive width (420px desktop / 100% mobile), and click-to-inspect navigation. |
| NOTIF-03 | System alerts user to overdue tasks and tasks approaching deadline (today/tomorrow). | Supported by `useNotifications` deadline scanner: filters tasks with `deadline < today` (overdue) or `deadline === today \|\| deadline === tomorrow` where status is active (`!== 'Done' && !== 'Cancelled'`). |
| NOTIF-04 | System alerts user to days where planned work exceeds available capacity (>100% overload). | Supported by 14-day horizon scanner: runs `getEffectiveDailyCapacity` and sums active task allocations; flags days where load > 100%; click links to `/planner?date=YYYY-MM-DD`. |
| NOTIF-05 | System alerts user to stale tasks in 'In Progress' or 'In Review' status with no activity for more than 5 days. | Supported by stale task scanner: checks status in `['In Progress', 'In Review']` with `dayjs(today).diff(dayjs(task.updatedAt.slice(0, 10)), 'day') > 5`; resets when task or allocation is updated. |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- **100% Local Application Behavior**: No application server, no third-party notification push gateway.
- **Persistence**: IndexedDB is working data store via Dexie. Upgrades must not destroy data (`db.version(n).stores(...).upgrade(...)`).
- **Dates**: Store calendar days as `YYYY-MM-DD` strings to prevent timezone drift.
- **UI System**: Ant Design 6 bundled components and `@ant-design/icons` only; no `@types/antd`, no third-party notification or toast libraries.
- **Identifiers**: Native `crypto.randomUUID()`.
- **Validation**: Zod validation at trust boundaries (backup import/export, form inputs, migrations).
- **Service Worker / PWA**: Must operate offline without broken cached assets or silent data loss.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `antd` | 6.6.5 | Drawer, Tabs, Badge, List, Checkbox, Tag, Switch, DatePicker, Input | Fixed UI framework [VERIFIED: package.json] |
| `@ant-design/icons` | 6.3.4 | BellOutlined, CalendarOutlined, EyeInvisibleOutlined, ExclamationCircleOutlined | Fixed icon system [VERIFIED: package.json] |
| `dexie` | 4.4.6 | Schema v4 indexing, reactive queries, settings storage | Fixed persistence library [VERIFIED: package.json] |
| `dexie-react-hooks` | 4.4.0 | `useLiveQuery` reactive synchronization | Re-evaluates alerts on any IndexedDB record change [VERIFIED: package.json] |
| `dayjs` | 1.11.23 | Date difference, horizon generation, formatting | Lightweight immutable date utility [VERIFIED: package.json] |
| `zod` | 4.6.5 | Runtime model and backup validation | Strict validation for new reminder fields [VERIFIED: package.json] |
| Web Notification API | Browser Native | Optional desktop notification when tab open | Built-in browser API; no external dependencies [CITED: developer.mozilla.org] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | 6.2.5 | In-memory Dexie mock for Vitest | Repository & live-query unit testing [VERIFIED: package.json] |
| `@testing-library/react` | 16.3.3 | Component behavior testing | Test `NotificationBell`, `NotificationDrawer`, form interactions [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Notification API | Push API + Service Worker | Push API requires remote application server & VAPID keys; violates static GitHub Pages constraint (deferred to FUTR-03). |
| Native `window.Notification` | Custom sound / Web Audio | Audio notifications are intrusive in banking environment; rejected per D-Claude's Discretion. |
| Global Notification Drawer in `AppShell` | Route-specific drawers | Drawer in `AppShell` allows inspecting/closing alerts from any view without navigation loss. |
| Storing dismiss in `settings` table | `localStorage` | `settings` table in Dexie keeps persistence uniform, backup-compatible, and offline-resilient. |

**Installation:**
Zero new packages needed. All dependencies are already installed in the project.

---

## Package Legitimacy Audit

No new packages installed. Phase 12 uses existing dependencies from `package.json` and native browser APIs only.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `antd` | npm | 9+ yrs | ~1.4M/wk | github.com/ant-design/ant-design | OK | Already installed |
| `@ant-design/icons` | npm | 6+ yrs | ~1.3M/wk | github.com/ant-design/ant-design-icons | OK | Already installed |
| `dexie` | npm | 10+ yrs | ~700k/wk | github.com/dexie/Dexie.js | OK | Already installed |
| `dexie-react-hooks` | npm | 5+ yrs | ~250k/wk | github.com/dexie/Dexie.js | OK | Already installed |
| `dayjs` | npm | 6+ yrs | ~20M/wk | github.com/iamkun/dayjs | OK | Already installed |
| `zod` | npm | 4+ yrs | ~15M/wk | github.com/colinhacks/zod | OK | Already installed |

**Packages removed due to [SLOP] verdict:** None  
**Packages flagged as suspicious [SUS]:** None  

---

## Architecture Patterns

### System Architecture Diagram

```
User Interactions & Live Stores
┌────────────────────────────────────────────────────────────────────────┐
│  Dexie Stores:                                                         │
│  tasks, projects, milestones, rules, overrides, allocations, settings  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ reactive subscription via useLiveQuery
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  useNotifications Hook / notificationService                           │
│  - Compute Overdue Tasks (deadline < today, status active)             │
│  - Compute 14-Day Overload (planned > capacity via calculateDayMetrics)│
│  - Compute Due Soon Tasks (deadline in [today, tomorrow])              │
│  - Compute Stale Tasks (status in [In Progress, In Review], diff > 5d) │
│  - Compute Custom Reminders (reminderDate <= today, status active)     │
│  - Filter out dismissedAlerts[alertKey] === today                      │
│  - Sort unified list by priority order (D-05)                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
       ┌───────────────────────────┐ ┌───────────────────────────┐
       │ AppShell Header           │ │ NotificationDrawer        │
       │ NotificationBell          │ │ - Tabs (All, Deadline,    │
       │ - Bell icon + Badge count │ │   Overload, Stale, Remind)│
       │ - Click toggles Drawer    │ │ - Task quick toggle Done  │
       └───────────────────────────┘ │ - Click navigates/inspects│
                                     │ - Dismiss Stale/Reminder  │
                                     └─────────────┬─────────────┘
                                                   │
                      ┌────────────────────────────┼───────────────────────────┐
                      ▼                            ▼                           ▼
        ┌───────────────────────────┐┌───────────────────────────┐┌───────────────────────────┐
        │ TaskDrawer (In-Place)     ││ Project/Milestone Modal   ││ PlannerView               │
        │ Edit task / clear reminder││ Edit reminder date/note   ││ /planner?date=YYYY-MM-DD  │
        └───────────────────────────┘└───────────────────────────┘└───────────────────────────┘
```

### Recommended Project Structure
```
src/
├── types/
│   ├── models.ts                    # Updated: reminderDate?, reminderNote? on Project, Milestone, Task
│   └── notifications.ts             # NEW: AlertType, NotificationItem, NotificationCounts interfaces
├── db/
│   ├── schema.ts                    # Updated: SCHEMA_V4 with reminderDate index on projects, milestones, tasks
│   ├── index.ts                     # Updated: db.version(4).stores(SCHEMA_V4)
│   └── repositories/
│       ├── taskRepo.ts              # Updated: reminderDate/reminderNote handling; updateTask updates updatedAt
│       ├── projectRepo.ts           # Updated: reminderDate/reminderNote handling
│       ├── milestoneRepo.ts         # Updated: reminderDate/reminderNote handling
│       ├── allocationRepo.ts        # Updated: upsert/update/delete touches parent task updatedAt
│       └── notificationRepo.ts      # NEW: dismissedAlerts get/set/cleanup in settings table
├── validation/
│   ├── schemas.ts                   # Updated: reminderDate/reminderNote on input/update schemas
│   └── backupSchemas.ts             # Updated: reminderDate/reminderNote on backup schemas
├── utils/
│   └── notifications.ts             # NEW: pure evaluation functions (overdue, overload, stale, reminder)
├── hooks/
│   ├── useNotifications.ts          # NEW: live Dexie query hook aggregating active alerts
│   └── useDesktopNotification.ts    # NEW: local Notification API permission and summary trigger
├── components/
│   ├── notifications/
│   │   ├── NotificationBell.tsx     # NEW: header bell icon + badge counter
│   │   ├── NotificationDrawer.tsx   # NEW: 5-tab drawer with notification list items
│   │   └── NotificationItemRow.tsx  # NEW: individual alert row with status tag, actions
│   ├── settings/
│   │   └── NotificationSettingsCard.tsx # NEW: desktop notification toggle card in SettingsView
│   ├── shell/
│   │   └── AppShell.tsx             # Updated: embed NotificationBell and NotificationDrawer
│   ├── tasks/
│   │   └── TaskDrawer.tsx           # Updated: DatePicker reminderDate & Input reminderNote
│   └── projects/
│       ├── ProjectModal.tsx         # Updated: DatePicker reminderDate & Input reminderNote
│       └── MilestoneModal.tsx       # Updated: DatePicker reminderDate & Input reminderNote
└── views/
    └── SettingsView.tsx             # Updated: render NotificationSettingsCard
```

### Pattern 1: Reactive Multi-Domain Alert Aggregation (`useNotifications`)
**What:** Single live query hook reading from relevant Dexie tables, delegating evaluation to pure functions.  
**When to use:** Keeps alert logic unified, reactive to any database mutation without custom event emitters.  
**Implementation:**
```typescript
// Source: Dexie useLiveQuery documentation & project codebase pattern
export function useNotifications(targetDb: TaskPlannerDatabase = defaultDb) {
  const todayDate = useMemo(() => getTodayDateString(), []);
  const maxOverloadDate = useMemo(() => dayjs(todayDate).add(14, 'day').format('YYYY-MM-DD'), [todayDate]);

  const data = useLiveQuery(async () => {
    const [tasks, projects, milestones, rules, overrides, allocations, dismissedSetting] =
      await Promise.all([
        targetDb.tasks.toArray(),
        targetDb.projects.toArray(),
        targetDb.milestones.toArray(),
        targetDb.capacityRules.toArray(),
        targetDb.capacityOverrides.where('date').between(todayDate, maxOverloadDate, true, true).toArray(),
        targetDb.plannedAllocations.where('date').between(todayDate, maxOverloadDate, true, true).toArray(),
        targetDb.settings.get('dismissedAlerts'),
      ]);

    const dismissedMap: Record<string, string> = (dismissedSetting?.value as Record<string, string>) ?? {};

    return computeAllNotifications({
      tasks,
      projects,
      milestones,
      rules,
      overrides,
      allocations,
      dismissedMap,
      todayDate,
    });
  }, [targetDb, todayDate, maxOverloadDate]);

  return data ?? DEFAULT_NOTIFICATION_STATE;
}
```

### Pattern 2: Day-Scoped Transient Alert Dismissal
**What:** Store dismissed alert keys mapped to `YYYY-MM-DD` in `settings` table.  
**When to use:** Only Stale Tasks and Custom Reminders can be dismissed. On subsequent calendar days (`todayDate > dismissedDate`), alerts reactivate automatically.  
**Implementation:**
```typescript
export async function dismissAlertToday(
  alertKey: string,
  todayDate: string,
  targetDb: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await targetDb.transaction('rw', targetDb.settings, async () => {
    const existing = await targetDb.settings.get('dismissedAlerts');
    const map: Record<string, string> = (existing?.value as Record<string, string>) ?? {};

    // Prune stale entries older than today to prevent unbounded storage growth
    const cleanedMap: Record<string, string> = {};
    for (const [k, d] of Object.entries(map)) {
      if (d === todayDate) {
        cleanedMap[k] = d;
      }
    }
    cleanedMap[alertKey] = todayDate;

    await targetDb.settings.put({
      key: 'dismissedAlerts',
      value: cleanedMap,
    });
  });
}
```

### Pattern 3: Zero-Overhead Dexie Schema v4 Migration
**What:** Define `SCHEMA_V4` adding `reminderDate` to `projects`, `milestones`, `tasks`.  
**When to use:** Dexie handles optional property indexing without requiring table re-writes.  
**Implementation:**
```typescript
export const SCHEMA_V4 = {
  projects: 'id, status, deadline, reminderDate, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, reminderDate, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, jiraKey, reminderDate, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

// In TaskPlannerDatabase constructor:
this.version(4).stores(SCHEMA_V4);
```

### Anti-Patterns to Avoid
- **Polled setInterval for notifications:** Do not poll database via `setInterval`. `useLiveQuery` automatically triggers re-render when IndexedDB tables change.
- **Dismissing Overdue & Overload alerts:** Bypassing overdue tasks or overloaded capacity leads to silent work slippage. Enforce D-15: hide dismiss button on Overdue and Overload items.
- **Permanent deletion on dismiss:** Dismiss must be scoped to the calendar day (`dismissedDate === todayDate`). Never delete the underlying entity or reminder date on dismiss.
- **Direct browser Notification spam:** Do not trigger desktop notifications on every live query update or tab switch. Throttle to once per user session or day via `sessionStorage`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Daily capacity calculation | Custom daily load calculator | `getEffectiveDailyCapacity` & `calculateDayMetrics` from `src/utils/capacity.ts` | Existing utils already handle weekly rules, date overrides, context switching, and 0-minute edge cases. |
| Drawer sliding container | Custom CSS sidebar / fixed overlay | Ant Design `Drawer` | Built-in focus trap, responsive width, animation, mobile backdrop, escape key handling. |
| Category switching | Custom stateful filter pills | Ant Design `Tabs` | Accessible ARIA tablist/tabpanels, badge counts on tab labels, keyboard tab navigation. |
| Form date picking | Native HTML `<input type="date">` | Ant Design `DatePicker` (dayjs-backed) | Consistent UI theme, clearable input, format normalization to `YYYY-MM-DD`. |
| Backup schema validation | Manual JSON property inspection | Zod schema parsing in `validateBackupPayload` | Zod safely handles optional fields, regex validations, and provides actionable error details. |

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | IndexedDB tables `projects`, `milestones`, `tasks` will contain optional `reminderDate` and `reminderNote` fields | Code edit: Add `this.version(4).stores(SCHEMA_V4)` in `src/db/index.ts`. No record rewriting needed as fields are optional. |
| Live service config | None — verified 100% offline-first application | None |
| OS-registered state | Browser Notification permission (`Notification.permission`) stored in browser preferences | Handled via standard `Notification.requestPermission()` call |
| Secrets/env vars | None — no API keys or server tokens required for in-app notifications | None |
| Build artifacts | None — pure TypeScript / React build | None |

---

## Common Pitfalls

### Pitfall 1: Timezone Drift in Stale Task Comparison
**What goes wrong:** `updatedAt` is stored as an ISO timestamp (`2026-09-20T14:32:00.000Z`), while calendar comparisons use `YYYY-MM-DD`. Using raw millisecond differences across midnight or UTC conversion can misclassify tasks as stale prematurely or a day late.  
**Why it happens:** ISO strings contain UTC time, while user's browser is in local timezone.  
**How to avoid:** Compare calendar dates by extracting `task.updatedAt.slice(0, 10)` and computing `dayjs(todayDate, 'YYYY-MM-DD').diff(dayjs(task.updatedAt.slice(0, 10), 'YYYY-MM-DD'), 'day') > 5`.  
**Warning signs:** Tasks created 5 days ago in the afternoon showing up as stale in the morning.

### Pitfall 2: Stale Timer Not Resetting on Allocation or Progress Edits
**What goes wrong:** User plans or allocates hours for a task on the Planner board, but the task still shows as "Stale (>5 days inactive)".  
**Why it happens:** `upsertAllocation` modifies `plannedAllocations` table without touching `task.updatedAt`.  
**How to avoid:** In `upsertAllocation`, `updateAllocation`, and `deleteAllocation`, touch `task.updatedAt = new Date().toISOString()` and put the task back within the transaction (per D-13).  
**Warning signs:** Tasks actively worked on in the weekly planner flagged as stale.

### Pitfall 3: Dismiss Map Unbounded Growth
**What goes wrong:** The `dismissedAlerts` map in `settings` accumulates thousands of dismissed keys over months of usage.  
**Why it happens:** App only adds keys to the map without pruning obsolete dates.  
**How to avoid:** During `dismissAlertToday` and query filtering, filter out keys where `dismissedDate !== todayDate`.  
**Warning signs:** Slow serialization of settings or bloated backup JSON.

### Pitfall 4: Backup Schema Version Incompatibility
**What goes wrong:** Backups generated prior to Phase 12 fail to restore, or Phase 12 backups fail validation on older versions.  
**Why it happens:** Adding required fields to backup schemas or mismatching `CURRENT_SCHEMA_VERSION`.  
**How to avoid:** Ensure `reminderDate` and `reminderNote` are `.optional()` in `BackupProjectRecordSchema`, `BackupMilestoneRecordSchema`, and `BackupTaskRecordSchema`. Keep `CURRENT_SCHEMA_VERSION = 2` (or bump to 3 with backward-compatible validation check: `candidate.schemaVersion < 1 || candidate.schemaVersion > CURRENT_SCHEMA_VERSION`).  
**Warning signs:** `restoreBackupPayload` throwing validation errors on existing test payloads.

---

## Code Examples

### Evaluation Logic for Active Alerts
```typescript
// Source: src/utils/notifications.ts
import dayjs from 'dayjs';
import type { Task, Project, Milestone, CapacityRule, CapacityOverride, PlannedAllocation } from '../types/models';
import { getEffectiveDailyCapacity, calculateDayMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';

export interface AlertNotificationItem {
  id: string; // unique key e.g. "overdue:task:123"
  category: 'overdue' | 'overload' | 'due-soon' | 'stale' | 'reminder';
  title: string;
  subtitle?: string;
  date?: string;
  tagColor: string;
  tagLabel: string;
  entityType: 'task' | 'project' | 'milestone' | 'capacity';
  entityId?: string;
  canDismiss: boolean;
  priorityOrder: number; // 1: overdue, 2: overload, 3: due-soon, 4: stale, 5: reminder
}

export function evaluateNotifications(params: {
  tasks: Task[];
  projects: Project[];
  milestones: Milestone[];
  rules: CapacityRule[];
  overrides: CapacityOverride[];
  allocations: PlannedAllocation[];
  dismissedMap: Record<string, string>;
  todayDate: string;
}): AlertNotificationItem[] {
  const { tasks, projects, milestones, rules, overrides, allocations, dismissedMap, todayDate } = params;
  const tomorrowDate = dayjs(todayDate, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const results: AlertNotificationItem[] = [];

  // 1. Overdue Tasks
  for (const task of tasks) {
    if (task.status === 'Done' || task.status === 'Cancelled') continue;
    if (task.deadline && task.deadline < todayDate) {
      const daysOverdue = dayjs(todayDate, 'YYYY-MM-DD').diff(dayjs(task.deadline, 'YYYY-MM-DD'), 'day');
      results.push({
        id: `overdue:task:${task.id}`,
        category: 'overdue',
        title: task.name,
        subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
        date: task.deadline,
        tagColor: 'error',
        tagLabel: `Quá hạn ${daysOverdue} ngày`,
        entityType: 'task',
        entityId: task.id,
        canDismiss: false,
        priorityOrder: 1,
      });
    }
  }

  // 2. Capacity Overload (14-day horizon)
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const allocsByDate = new Map<string, PlannedAllocation[]>();
  for (const a of allocations) {
    const list = allocsByDate.get(a.date) ?? [];
    list.push(a);
    allocsByDate.set(a.date, list);
  }

  for (let i = 0; i <= 14; i++) {
    const checkDate = dayjs(todayDate, 'YYYY-MM-DD').add(i, 'day').format('YYYY-MM-DD');
    const capMinutes = getEffectiveDailyCapacity(checkDate, rules, overrides);
    const dayAllocs = allocsByDate.get(checkDate) ?? [];

    let activeAllocatedMinutes = 0;
    const activeTaskIds = new Set<string>();
    for (const alloc of dayAllocs) {
      const task = taskMap.get(alloc.taskId);
      if (task && isTaskActive(task.status)) {
        activeAllocatedMinutes += alloc.allocatedMinutes;
        activeTaskIds.add(alloc.taskId);
      }
    }

    const metrics = calculateDayMetrics(checkDate, capMinutes, activeAllocatedMinutes, 0, activeTaskIds.size);
    if (metrics.isOverloaded) {
      const allocHours = (activeAllocatedMinutes / 60).toFixed(1).replace('.0', '');
      const capHours = (capMinutes / 60).toFixed(1).replace('.0', '');
      results.push({
        id: `overload:date:${checkDate}`,
        category: 'overload',
        title: `Quá tải ngày ${checkDate}`,
        subtitle: `${activeTaskIds.size} tác vụ được phân bổ`,
        date: checkDate,
        tagColor: 'warning',
        tagLabel: `Quá tải ${metrics.percent}% (${allocHours}h / ${capHours}h)`,
        entityType: 'capacity',
        canDismiss: false,
        priorityOrder: 2,
      });
    }
  }

  // 3. Due Soon Tasks (today or tomorrow)
  for (const task of tasks) {
    if (task.status === 'Done' || task.status === 'Cancelled') continue;
    if (task.deadline === todayDate || task.deadline === tomorrowDate) {
      const isToday = task.deadline === todayDate;
      results.push({
        id: `due-soon:task:${task.id}`,
        category: 'due-soon',
        title: task.name,
        subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
        date: task.deadline,
        tagColor: isToday ? 'processing' : 'blue',
        tagLabel: isToday ? 'Đến hạn hôm nay' : 'Đến hạn ngày mai',
        entityType: 'task',
        entityId: task.id,
        canDismiss: false,
        priorityOrder: 3,
      });
    }
  }

  // 4. Stale Tasks (>5 days no update)
  for (const task of tasks) {
    if (task.status !== 'In Progress' && task.status !== 'In Review') continue;
    const alertKey = `stale:task:${task.id}`;
    if (dismissedMap[alertKey] === todayDate) continue;

    const lastUpdatedDate = task.updatedAt.slice(0, 10);
    const diffDays = dayjs(todayDate, 'YYYY-MM-DD').diff(dayjs(lastUpdatedDate, 'YYYY-MM-DD'), 'day');
    if (diffDays > 5) {
      results.push({
        id: alertKey,
        category: 'stale',
        title: task.name,
        subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
        date: lastUpdatedDate,
        tagColor: 'purple',
        tagLabel: `Chưa cập nhật ${diffDays} ngày`,
        entityType: 'task',
        entityId: task.id,
        canDismiss: true,
        priorityOrder: 4,
      });
    }
  }

  // 5. Custom Reminders (reminderDate <= todayDate)
  const checkEntityReminder = (
    entity: Project | Milestone | Task,
    type: 'project' | 'milestone' | 'task',
    name: string
  ) => {
    if (entity.status === 'Done' || entity.status === 'Cancelled') return;
    if (!entity.reminderDate || entity.reminderDate > todayDate) return;

    const alertKey = `reminder:${type}:${entity.id}`;
    if (dismissedMap[alertKey] === todayDate) return;

    results.push({
      id: alertKey,
      category: 'reminder',
      title: name,
      subtitle: entity.reminderNote || 'Nhắc nhở công việc',
      date: entity.reminderDate,
      tagColor: 'gold',
      tagLabel: 'Nhắc nhở',
      entityType: type,
      entityId: entity.id,
      canDismiss: true,
      priorityOrder: 5,
    });
  };

  for (const p of projects) checkEntityReminder(p, 'project', p.name);
  for (const m of milestones) checkEntityReminder(m, 'milestone', m.name);
  for (const t of tasks) checkEntityReminder(t, 'task', t.name);

  // Sort by priorityOrder (D-05)
  return results.sort((a, b) => a.priorityOrder - b.priorityOrder);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polled dashboard attention list | Reactive header bell + categorized drawer | Phase 12 | User notified across any view immediately instead of only when looking at Dashboard |
| Hardcoded deadline checks only | Multi-domain alerts (Overdue + Overload + Stale + Custom Reminders) | Phase 12 | Comprehensive visibility covering capacity breaches and stagnant work |
| Permanent dismiss / delete reminder | Scoped daily dismiss with automatic reactivation | Phase 12 | Prevents forgotten commitments; issues resurface daily until resolved |
| Server push notifications (Firebase/WebPush) | Local Web Notification API (`window.Notification`) | Phase 12 | Zero server infrastructure, privacy-preserving, works fully offline |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Desktop notification fires once per session on startup to avoid spamming the user | Code Examples / Architecture | User might expect repeated notifications or notifications on every change |
| A2 | Dexie schema v4 does not need table data modification since new fields are optional | Architecture Patterns | If Dexie requires default values for indexed fields, upgrade block needed |

*Both assumptions verified: Dexie tolerates undefined on indexed fields without failure; sessionStorage-based single-dispatch per session prevents browser popup spam.*

---

## Open Questions

1. **How should desktop notification summarize alerts on boot?**
   - What we know: D-19 specifies emitting a summary notification when opening app if active alerts exist.
   - Recommendation: Format as: `Task Planner: Bạn có ${overdueCount} việc quá hạn, ${overloadCount} ngày quá tải, và ${reminderCount} nhắc nhở cần xử lý.` Throttled to once per day/session via `sessionStorage`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tooling & test runner | ✓ | v24.2.0 | — |
| Vite | Dev & build | ✓ | 8.3.1 | — |
| Vitest | Test execution | ✓ | 5.0.2 | — |
| Web Notification API | Desktop notifications | Browser native | Standard | Silent fallback to in-app bell badge if unsupported/denied |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 with `@testing-library/react` and `fake-indexeddb` |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run tests/utils/notifications.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | Set/clear reminderDate and reminderNote on Project, Milestone, Task; Dexie schema v4 indexing | unit / db | `npx vitest run tests/db/schemaV4.test.ts` | ❌ Wave 0 |
| NOTIF-02 | Header NotificationBell shows count badge; clicking opens NotificationDrawer with 5 tabs | component | `npx vitest run tests/components/notifications/NotificationDrawer.test.tsx` | ❌ Wave 0 |
| NOTIF-03 | Overdue and due soon (today/tomorrow) detection and display | unit | `npx vitest run tests/utils/notifications.test.ts` | ❌ Wave 0 |
| NOTIF-04 | 14-day capacity overload detection (>100%) and navigation link to PlannerView | unit / integration | `npx vitest run tests/utils/notifications.test.ts` | ❌ Wave 0 |
| NOTIF-05 | Stale tasks (>5 days in In Progress/In Review) detection; reset on task/allocation edit; daily dismiss | unit / repo | `npx vitest run tests/services/notificationService.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/utils/notifications.test.ts`
- **Per wave merge:** `npm test` (all 79+ files green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/utils/notifications.test.ts` — pure alert evaluation tests for overdue, overload, due-soon, stale, reminder
- [ ] `tests/db/schemaV4.test.ts` — Dexie schema v4 migration, index persistence, and backward compatibility
- [ ] `tests/components/notifications/NotificationDrawer.test.tsx` — drawer tabs, list rendering, quick Done, dismiss action
- [ ] `tests/components/notifications/NotificationBell.test.tsx` — bell badge display and drawer toggle behavior

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `reminderDate` (`YYYY-MM-DD` regex) and `reminderNote` (max 500 chars) via Zod schemas in `schemas.ts` and `backupSchemas.ts` |
| V8 Data Protection | yes | All notification evaluations execute 100% locally in browser memory/IndexedDB; zero notification telemetry or external network calls |
| V13 API & Web Service Security | yes | Desktop notifications use local `window.Notification` only; no push server endpoints or third-party webhooks |

### Known Threat Patterns for Local Notifications

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS injection via `reminderNote` in notifications | Tampering / Information Disclosure | Ant Design components auto-escape strings; `Notification` body passes raw text without HTML rendering |
| Permission denial crash | Denial of Service | Gracefully check `Notification.permission === 'granted'` and wrap `requestPermission()` in try/catch |
| Data leakage across origins | Information Disclosure | IndexedDB is strictly origin-scoped; no cross-origin iframe embedding permitted |

---

## Sources

### Primary (HIGH confidence)
- `src/types/models.ts` — Existing Project, Milestone, Task, Setting domain interfaces
- `src/db/schema.ts` — Current schema versions (v1, v2, v3)
- `src/db/index.ts` — `TaskPlannerDatabase` definition and upgrade hooks
- `src/utils/capacity.ts` — `getEffectiveDailyCapacity` and `calculateDayMetrics`
- `src/components/dashboard/AttentionTodayList.tsx` — Overdue task detection and quick Done toggle pattern
- `src/components/shell/AppShell.tsx` — Header toolbar layout and drawer integration points
- `developer.mozilla.org/en-US/docs/Web/API/Notification` — Web Notification API specification

### Secondary (MEDIUM confidence)
- `.planning/phases/12-in-app-notifications-proactive-alerts-custom-reminders/12-CONTEXT.md` — User implementation decisions (D-01 to D-19)
- `.planning/phases/12-in-app-notifications-proactive-alerts-custom-reminders/12-UI-SPEC.md` — Approved UI design contract

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Zero new packages, reuses existing AntD 6, Dexie 4, Dayjs, Zod
- Architecture: HIGH — Reactive hook pattern matches existing codebase (`useDashboardForecast`)
- Pitfalls: HIGH — Timezone drift and allocation-updatedAt synchronization verified in code

**Research date:** 2026-09-28  
**Valid until:** 2026-10-28 (stable local architecture)
