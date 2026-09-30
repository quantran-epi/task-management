# Phase 13: Enhanced Workload Analytics & Milestone Burndown - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 delivers a dedicated, lightweight analytics dashboard view (`#/analytics`) providing visual insights into delivery velocity, milestone burndown, and stakeholder workload distribution.

Key capabilities delivered:
1. **Milestone Burndown Chart (ANLT-01):** Lightweight SVG vector burndown tracking remaining work versus ideal pace over time with interactive tooltips and unit toggling (estimate hours vs task counts).
2. **Project Status Distribution & Completion Velocity (ANLT-02):** Visual stacked horizontal status bars and weekly throughput metrics (completed tasks and hours) across projects with historical rolling windows.
3. **Stakeholder Workload Allocation (ANLT-03):** Multi-dimensional workload breakdowns across Ops Owners, Business Analysts, and Work Types, honoring tag inheritance and displaying both planned hours and active task counts.
4. **AppShell Navigation Integration:** Dedicated top-level navigation item ("Phân tích") with deep-linking support from the Projects view.

</domain>

<decisions>
## Implementation Decisions

### Burndown Chart Metrics & Timeline
- **D-01:** Hỗ trợ Toggle linh hoạt đơn vị đo lường trục Y: Cho phép người dùng chuyển đổi xem giữa Tổng giờ ước lượng (Estimated Hours từ `estimateMinutes`) và Số lượng tác vụ còn lại (Remaining Task Count).
- **D-02:** Trục thời gian (X-axis) và đường tiến độ lý tưởng (Ideal Pace Line) tự động xác định kèm fallback: Mốc bắt đầu lấy từ `milestone.createdAt` hoặc `actualStartDate` sớm nhất của task; mốc kết thúc lấy từ `milestone.deadline`. Nếu Milestone chưa có deadline, tự động fallback sang deadline xa nhất của các task trực thuộc hoặc +14 ngày từ Start Date.
- **D-03:** Đường tiến độ thực tế (Actual Burndown Line) dừng tại mốc Hôm nay (Today): Đường thực tế chỉ vẽ từ Start Date đến Today với điểm đánh dấu (marker) nổi bật tại Hôm nay, không vẽ suy đoán cho tương lai.
- **D-04:** Trải nghiệm tương tác SVG tương tác cao (Interactive Hover Tooltip): Biểu đồ SVG thuần hỗ trợ vạch gióng dọc (vertical crosshair) và Tooltip card hiển thị chi tiết thông số tại điểm hover (Ngày, Thực tế còn lại, Chuẩn lý tưởng, Mức chênh lệch nhanh/chậm tiến độ).

### Completion Velocity Calculation & Status Distribution
- **D-05:** Chỉ số vận tốc hoàn thành kép (Dual Metric): Thống kê đồng thời cả số lượng task hoàn thành và tổng số giờ hoàn thành mỗi tuần (ví dụ: `8 tasks / tuần (~24h / tuần)`), kèm mini bar chart thể hiện phân bổ theo từng tuần.
- **D-06:** Cửa sổ thời gian tính vận tốc trung bình (Rolling Time Window): Mặc định tính trung bình trượt 4 tuần gần nhất (Rolling 4-week Average), có bộ chọn `Segmented` (2 tuần, 4 tuần, 8 tuần, 12 tuần) để theo dõi xu hướng ngắn hạn và dài hạn.
- **D-07:** Trực quan hóa phân bổ trạng thái tác vụ giữa các dự án (ANLT-02): Mỗi dự án hiển thị một thanh ngang xếp chồng nhiều màu (Stacked Bar) theo tỷ lệ trạng thái (`Open`, `In Progress`, `Resolved`, `In Review`, `Done`, `Cancelled`) kết hợp bảng so sánh hiển thị Velocity và khối lượng còn lại.
- **D-08:** Quy tắc xác định ngày hoàn thành của Task: Ưu tiên `actualEndDate` (YYYY-MM-DD); nếu thiếu thì fallback lấy ngày từ `updatedAt`. Chỉ tính trạng thái `Done` và `Resolved` (loại trừ `Cancelled`). Nếu task được mở lại thì tự động trừ ra khỏi tuần tương ứng.

### Stakeholder Workload Allocation Visualization
- **D-09:** Bố cục 3 chiều phân rã tải công việc (ANLT-03): Sử dụng `Segmented` hoặc `Tabs` gồm 3 mục: 'Ops Owner', 'Business Analyst', và 'Loại công việc (Work Type)' để giao diện gọn gàng, tập trung.
- **D-10:** Quy tắc kế thừa và gán tag đa chủ sở hữu: Áp dụng cơ chế kế thừa thẻ từ Milestone/Project (`resolveInheritedTags`) cho các task chưa có tag riêng. Nếu task có nhiều người phụ trách, tính đầy đủ vào thống kê của từng người (kèm nhãn phân bổ). Task không có tag gom vào nhóm 'Chưa phân công' (Unassigned).
- **D-11:** Phạm vi phân tích tải công việc (Workload Allocation Scope): Mặc định chỉ tính các tác vụ còn đang mở (Active Tasks: `Open`, `In Progress`, `In Review`, `Resolved`), đồng thời cung cấp bộ lọc toggle để cho phép xem toàn bộ tác vụ (bao gồm cả `Done`).
- **D-12:** Hình thức trực quan hóa phân bổ: Thanh tỷ trọng ngang nhiều màu (Horizontal Percentage Bar) ở trên kèm Bảng chi tiết bên dưới (Số task, Số giờ, Tỉ lệ %, hỗ trợ mở rộng xem danh sách task chi tiết khi nhấp chọn).

### Navigation & View Placement
- **D-13:** Mục điều hướng riêng trên Sidebar Menu — **Reversibility:** costly — touches AppRoute navigation, AppShell, Navigation component, and hash routing: Thêm `'analytics'` vào `AppRoute` với nhãn 'Phân tích' (icon `BarChartOutlined`), đặt trước 'Cài đặt'.
- **D-14:** Bố cục giao diện `AnalyticsView`: Thiết kế Dashboard cuộn dọc 3 Section rõ ràng: (1) Milestone Burndown với bộ chọn Milestone Dropdown, (2) Vận tốc & Trạng thái giữa các Dự án, (3) Phân bổ Tải Stakeholder.
- **D-15:** Cơ chế chọn Milestone mặc định và liên kết điều hướng: Tự động chọn Milestone đang mở (`status !== 'Done'`) có deadline gần nhất. Hỗ trợ nhận `milestoneId` từ route params (`onNavigate('analytics', { milestoneId })`) để từ `ProjectsView` có thể click nhảy thẳng sang xem Burndown của Milestone đó.
- **D-16:** Trải nghiệm khi chưa có dữ liệu (Empty State): Từng Section hiển thị `EmptyState` độc lập kèm nút hành động (CTA) hướng dẫn tạo Milestone, thêm Task hoặc hoàn thành task, không làm gián đoạn các section khác.

### Claude's Discretion
- Màu sắc và phong cách SVG: Sử dụng bảng màu Ant Design chuẩn (`#1677ff` primary, `#52c41a` success, `#fa8c16` warning, `#ff4d4f` error, `#8c8c8c` secondary) để giữ tính đồng bộ với toàn bộ ứng dụng.
- SVG ViewBox & Responsive: Thiết kế SVG với `viewBox` co giãn linh hoạt và CSS `width: 100%` để biểu đồ hiển thị mượt mà trên cả desktop và tablet/mobile.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Roadmap & Requirements
- `.planning/ROADMAP.md` §Phase 13 — Goal, dependencies, and 3 success criteria.
- `.planning/REQUIREMENTS.md` §ANLT-01, §ANLT-02, §ANLT-03 — Formal requirement definitions.

### Data Models & State
- `src/types/models.ts` — Entity definitions for `Milestone`, `Task`, `Project`, `WorkType`, and status/priority types.
- `src/types/navigation.ts` — Definition of `AppRoute` and `NavigateFunction`.
- `src/components/shell/Navigation.tsx` — Navigation menu items and icons in `AppShell`.
- `src/db/repositories/tagRepo.ts` — Tag inheritance and resolution helpers (`resolveInheritedTags`).
- `src/db/repositories/milestoneRepo.ts` & `src/db/repositories/taskRepo.ts` — Queries for milestones, tasks, and project aggregates.

### Existing UI & Utilities
- `src/components/tasks/WorkTypeBadge.tsx` — Colors and labels for work types (`code`, `document`, `meeting`, etc.).
- `src/components/tasks/InlineStatusTag.tsx` — Color mapping for task statuses (`Open`, `In Progress`, `Done`, etc.).
- `src/utils/time.ts` — Time formatting helper (`formatMinutes`).
- `src/utils/date.ts` — Calendar date helpers (`formatDate`, `getTodayDateString`, `isValidCalendarDate`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkTypeBadge`: Visual badge and color mapping for the 7 work types.
- `InlineStatusTag`: Standard badge colors for task statuses (`Open`, `In Progress`, `Done`, `Resolved`, `Cancelled`, `In Review`).
- `resolveInheritedTags` in `src/db/repositories/tagRepo.ts`: Automatically resolves Ops Owner and BA tags from milestone or project ancestors.
- `useLiveQuery` from `dexie-react-hooks`: Reactive data subscriptions directly from IndexedDB without custom event emitters.
- `formatMinutes` from `src/utils/time.ts`: Formats integer minutes into human-readable hours and minutes (e.g. `2h 30m`).

### Established Patterns
- **Pure Native SVG:** Drawing lightweight vector charts directly in React JSX using `<svg>`, `<polyline>`, `<path>`, `<line>`, `<circle>`, `<text>` without external charting packages.
- **Dual Metric Representation:** Combining task counts and estimated effort (hours) in cards, tooltips, and table rows.
- **URL Hash Routing:** State passing via `AppRoute` and `params` (e.g., `params.milestoneId`) handled through `useHashRoute`.
- **Ant Design System:** Utilizing `Card`, `Segmented`, `Table`, `Select`, `Progress`, `Empty`, and `Space` for clean layout.

### Integration Points
- `src/types/navigation.ts`: Add `'analytics'` to `AppRoute`.
- `src/components/shell/Navigation.tsx`: Add 'Phân tích' menu item with `BarChartOutlined`.
- `src/App.tsx`: Route renderer branching to include `<AnalyticsView />`.
- `src/views/ProjectsView.tsx`: Add 'Xem Burndown' action link on Milestone cards/rows to navigate to `analytics` with `milestoneId`.

</code_context>

<specifics>
## Specific Ideas

- Đường Burndown SVG cần có vạch đứng đứt đoạn (vertical dash line) đánh dấu vị trí ngày Hôm nay (`Today`) để người dùng dễ nhìn thấy tiến độ đang ở đâu so với toàn bộ chu kỳ milestone.
- Khi hover lên điểm trên biểu đồ SVG, hiển thị tooltip nổi với đầy đủ: Ngày, Giờ/Task còn lại thực tế, Giờ/Task lý tưởng, và chênh lệch (Nhanh hơn / Chậm hơn tiến độ).
- Thanh ngang xếp chồng trạng thái task của từng dự án (Project Status Bar) nên có tooltip khi hover lên từng đoạn màu để biết chính xác số lượng task của trạng thái đó.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-Enhanced Workload Analytics & Milestone Burndown*
*Context gathered: 2026-09-30*
