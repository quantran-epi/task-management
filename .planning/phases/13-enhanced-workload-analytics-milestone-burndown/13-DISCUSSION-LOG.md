# Phase 13: Enhanced Workload Analytics & Milestone Burndown - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-30
**Phase:** 13-Enhanced Workload Analytics & Milestone Burndown
**Areas discussed:** Burndown Chart Metrics & Timeline, Completion Velocity Calculation, Stakeholder Workload Visualization, Navigation & View Placement

---

## Burndown Chart Metrics & Timeline

| Option | Description | Selected |
|--------|-------------|----------|
| Hỗ trợ Toggle cả hai (Recommended) | Cho phép người dùng chuyển đổi xem theo Giờ ước tính (estimateMinutes) hoặc Số lượng task còn lại. Phù hợp cả khi task có estimate hoặc không. | ✓ |
| Chỉ theo Giờ (Estimated Hours) | Chỉ vẽ đường burndown theo tổng thời gian (hours) của các task còn lại. Phù hợp nhất với triết lý quản lý capacity/workload của ứng dụng. | |
| Chỉ theo Số lượng Task | Chỉ vẽ đường burndown theo số lượng task chưa hoàn thành (remaining task count). Đơn giản, không phụ thuộc vào việc ước lượng giờ. | |

**User's choice:** Hỗ trợ Toggle cả hai (Recommended)
**Notes:** Trục Y hỗ trợ chuyển đổi linh hoạt giữa Remaining Hours và Remaining Task Count.

| Option | Description | Selected |
|--------|-------------|----------|
| Tự động tính kèm fallback (Recommended) | Lấy từ ngày sớm nhất (createdAt hoặc actualStartDate của task) đến milestone.deadline. Nếu thiếu deadline, lấy deadline task xa nhất hoặc fallback +14 ngày từ ngày bắt đầu. | ✓ |
| Tự động kèm Date Range Picker | Mặc định tự động từ milestone timeline, nhưng cung cấp DateRangePicker trên thanh công cụ để người dùng linh hoạt thu phóng khoảng ngày hiển thị. | |
| Yêu cầu phải có Milestone Deadline | Nếu Milestone chưa được thiết lập deadline, hiển thị EmptyState/Alert hướng dẫn cập nhật deadline trước khi vẽ biểu đồ burndown. | |

**User's choice:** Tự động tính kèm fallback (Recommended)
**Notes:** Start Date từ `createdAt`/`actualStartDate` sớm nhất; End Date từ `milestone.deadline` với fallback linh hoạt.

| Option | Description | Selected |
|--------|-------------|----------|
| Dừng tại Hôm nay (Today) (Recommended) | Đường Actual còn lại vẽ từ Start Date đến Hôm nay (Today). Dừng tại Today với điểm nhấn (marker). Đơn giản, trung thực, không suy đoán. | ✓ |
| Vẽ thêm Forecast Trendline nét đứt | Từ Hôm nay (Today) vẽ thêm đường nét đứt (dashed trendline) phóng tới tương lai dựa trên tốc độ hoàn thành trung bình (velocity) để thấy dự kiến ngày về đích. | |
| Dự phóng theo Planned Allocations | Các ngày trong tương lai lấy từ bảng Planned Allocations (giờ đã lên lịch) để dự phóng đường giảm tải công việc theo kế hoạch đã lập. | |

**User's choice:** Dừng tại Hôm nay (Today) (Recommended)
**Notes:** Đường thực tế dừng ở Today với marker rõ ràng; không vẽ dự đoán giả định.

| Option | Description | Selected |
|--------|-------------|----------|
| Interactive Hover Tooltip (Recommended) | Hover chuột trên biểu đồ SVG hiển thị vạch gióng dọc (vertical crosshair) và Tooltip card với thông số chi tiết: Ngày, Còn lại thực tế, Chuẩn lý tưởng, Chênh lệch. | ✓ |
| Interactive kèm Click to Filter | Bao gồm cả hover tooltip, và khi click vào một điểm ngày trên chart sẽ lọc bảng task bên dưới theo ngày đó hoặc mở chi tiết. | |
| Static SVG kèm Milestone Data Callout | Biểu đồ SVG thuần tĩnh gọn gàng với legend rõ ràng, hiển thị nhãn số liệu ở các điểm mốc chính (Start, Today, Deadline), không dùng hover phức tạp. | |

**User's choice:** Interactive Hover Tooltip (Recommended)
**Notes:** Tương tác mượt mà trên SVG với vertical crosshair và floating tooltip card.

---

## Completion Velocity Calculation

| Option | Description | Selected |
|--------|-------------|----------|
| Dual Metric: Cả Task và Giờ/tuần (Recommended) | Thống kê cả số task và số giờ hoàn thành mỗi tuần (vd: '8 tasks / tuần (~24h / tuần)'), kèm biểu đồ cột thể hiện theo từng tuần. Phù hợp cả khi task có estimate hoặc không. | ✓ |
| Chỉ tính theo Giờ hoàn thành (Hours/Week) | Chỉ tính tổng số giờ (estimated hours) của các task đã hoàn thành trong tuần. Thích hợp cho người dùng lập kế hoạch theo thời gian/công suất. | |
| Chỉ tính theo Số lượng Task (Tasks/Week) | Đo đơn thuần số lượng task chuyển sang trạng thái Done/Resolved trong tuần. Tương tự throughput trong Kanban. | |

**User's choice:** Dual Metric: Cả Task và Giờ/tuần (Recommended)
**Notes:** Kết hợp cả throughput (task count) và effort (hours).

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling 4 tuần kèm Toggle (Recommended) | Mặc định hiển thị trung bình 4 tuần gần nhất (Rolling 4-week Average), có Segmented control để đổi sang 2 tuần, 8 tuần hoặc 12 tuần nếu muốn nhìn xu hướng dài hơn. | ✓ |
| Cố định 4 tuần gần nhất | Cố định tính trên 4 tuần gần nhất. Giữ giao diện tinh gọn, không phát sinh thêm tùy chọn. | |
| Theo từng Tháng dương lịch | Nhóm dữ liệu theo từng tháng dương lịch trọn vẹn (VD: Tháng 8, Tháng 9) thay vì cửa sổ tuần trượt. | |

**User's choice:** Rolling 4 tuần kèm Toggle (Recommended)
**Notes:** Mặc định rolling 4 tuần; cho phép chuyển 2/4/8/12 tuần bằng Segmented.

| Option | Description | Selected |
|--------|-------------|----------|
| Thanh ngang xếp chồng & Bảng (Recommended) | Mỗi dự án là một hàng gồm tên dự án, thanh ngang nhiều màu thể hiện tỉ lệ trạng thái task (Open/In Progress/Done...), cột Velocity 4 tuần và khối lượng còn lại. Trực quan và dễ so sánh. | ✓ |
| Grid các Card Dự án riêng biệt | Mỗi dự án là một Card Ant Design riêng biệt chứa mini progress bar và badge vận tốc. Thích hợp khi có ít dự án (3-5 dự án). | |
| Bảng dữ liệu Table chi tiết | Sử dụng Ant Design Table chuẩn với các cột: Tên dự án, Số task theo từng trạng thái, Vận tốc tuần, Tỷ lệ hoàn thành (%). Dễ lọc và sắp xếp. | |

**User's choice:** Thanh ngang xếp chồng & Bảng (Recommended)
**Notes:** Trực quan hóa tiến độ các dự án qua thanh xếp chồng tỷ lệ trạng thái và bảng vận tốc so sánh.

| Option | Description | Selected |
|--------|-------------|----------|
| Ưu tiên actualEndDate, fallback updatedAt (Recommended) | Lấy actualEndDate nếu có; nếu trống lấy ngày từ updatedAt. Chỉ tính trạng thái Done và Resolved (loại bỏ Cancelled). Nếu task mở lại thì tự động trừ ra. | ✓ |
| Chỉ tính khi có actualEndDate | Chỉ ghi nhận velocity cho những task có điền actualEndDate rõ ràng. Task thiếu ngày sẽ bị loại trừ để bảo đảm tính chuẩn xác của mốc thời gian. | |
| Tính theo log cập nhật gần nhất | Tính theo ngày task được đánh dấu hoàn thành trong bảng lịch sử / logs hoặc ghi chú cập nhật gần nhất. | |

**User's choice:** Ưu tiên actualEndDate, fallback updatedAt (Recommended)
**Notes:** Thuật toán chuẩn hóa ngày hoàn thành tự động fallback updatedAt an toàn.

---

## Stakeholder Workload Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| Tab chuyển đổi 3 chiều (Recommended) | Dùng Segmented hoặc Tabs với 3 mục: 'Ops Owner', 'Business Analyst', và 'Loại công việc (Work Type)'. Mỗi tab tập trung hiển thị biểu đồ phân bổ và bảng số liệu riêng biệt, sạch sẽ. | ✓ |
| Grid 3 Card đồng thời | Chia thành 3 Card độc lập hiển thị cùng lúc trên một màn hình dashboard phân tích (Ops Owner, BA, và Work Type). Dễ so sánh tổng thể cùng lúc. | |
| Ma trận Pivot đa chiều | Ma trận phân bổ chéo (Cross-matrix), ví dụ dòng là Ops Owner và cột là Work Type, hiển thị số giờ ở các ô giao thoa. Phức tạp hơn. | |

**User's choice:** Tab chuyển đổi 3 chiều (Recommended)
**Notes:** 3 Tab riêng biệt giúp giao diện tập trung và không bị phân mảnh.

| Option | Description | Selected |
|--------|-------------|----------|
| Áp dụng kế thừa, tính đầy đủ (Recommended) | Tự động kế thừa từ Milestone/Project nếu task chưa gán riêng (nhất quán với Phase 9). Nếu task có nhiều người, tính đầy đủ vào thống kê của mỗi người. Task không có tag gom vào 'Chưa gán' (Unassigned). | ✓ |
| Kế thừa và chia đều số giờ | Áp dụng kế thừa từ Milestone/Project; nếu một task có nhiều người thì chia đều số giờ ước tính (VD: 6 giờ / 2 người = 3 giờ mỗi người). | |
| Chỉ tính tag gán trực tiếp | Chỉ tính những task được gán trực tiếp (explicit). Các task nhận kế thừa từ cha được xếp vào nhóm riêng để phân biệt rõ ràng. | |

**User's choice:** Áp dụng kế thừa, tính đầy đủ (Recommended)
**Notes:** Tận dụng `resolveInheritedTags` để phản ánh đúng thực tế chịu trách nhiệm của từng Ops Owner/BA.

| Option | Description | Selected |
|--------|-------------|----------|
| Active Tasks kèm Toggle All (Recommended) | Mặc định chỉ tính các tác vụ còn đang mở (Open, In Progress, In Review). Cung cấp bộ lọc trạng thái để người dùng có thể tùy chọn xem cả tác vụ đã hoàn thành (Done). | ✓ |
| Cố định chỉ Active Tasks | Cố định luôn chỉ phân tích các tác vụ đang mở (Active Backlog). Tập trung tuyệt đối vào khối lượng công việc hiện tại và tồn đọng. | |
| Theo khoảng thời gian kế hoạch | Tính trên các tác vụ có kế hoạch phân bổ (Planned Allocations) trong khoảng thời gian được chọn (VD: 30 ngày tới). | |

**User's choice:** Active Tasks kèm Toggle All (Recommended)
**Notes:** Tập trung vào backlog công việc còn mở cần làm, kèm tùy chọn mở rộng xem toàn bộ.

| Option | Description | Selected |
|--------|-------------|----------|
| Thanh tỷ trọng ngang & Bảng chi tiết (Recommended) | Thanh màu ngang thể hiện trực quan tỷ trọng phần trăm (%) giữa các bên, kèm Bảng chi tiết bên dưới (Số task, Số giờ, Tỉ lệ %, có thể nhấp để xem danh sách task tương ứng). | ✓ |
| Lưới Thẻ thống kê (Card Grid) | Grid các Card độc lập cho từng người/loại việc, mỗi Card có thanh Mini Progress và số liệu tóm tắt. Trực quan dạng khối. | |
| Bảng số liệu kèm Mini Progress | Ant Design Table tiêu chuẩn có thể sắp xếp theo Số giờ hoặc Số task giảm dần, tích hợp thanh tiến độ mini trong từng dòng. Tinh gọn, tiết kiệm diện tích. | |

**User's choice:** Thanh tỷ trọng ngang & Bảng chi tiết (Recommended)
**Notes:** Kết hợp trực quan thanh tỷ lệ phần trăm ngang và bảng chi tiết số liệu có thể tương tác.

---

## Navigation & View Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Mục riêng trên Sidebar ('Phân tích') (Recommended) | Bổ sung 'analytics' vào AppRoute và Menu Sidebar với nhãn 'Phân tích' (icon BarChartOutlined/LineChartOutlined), đặt trước 'Cài đặt'. Đúng chuẩn 'Dedicated analytics view' trong Roadmap. | ✓ |
| Tab trong DashboardView | Đặt thành tab thứ 2 trong màn hình DashboardView ('Tổng quan ngày' và 'Phân tích & Burndown'). Không làm dài thêm danh sách menu chính. | |
| Tích hợp trong ProjectsView | Đặt thành một nút/tab 'Phân tích tiến độ' bên trong màn hình Quản lý Dự án (ProjectsView). Tập trung theo góc nhìn dự án. | |

**User's choice:** Mục riêng trên Sidebar ('Phân tích') (Recommended)
**Notes:** Thêm `'analytics'` vào `AppRoute` và menu sidebar AppShell.

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard cuộn dọc 3 Section (Recommended) | Bố cục trang cuộn liền mạch với 3 Section/Card lớn: (1) Milestone Burndown với bộ chọn Milestone, (2) Vận tốc & Trạng thái giữa các Dự án, (3) Phân bổ Tải Stakeholder. Dễ dàng quan sát toàn diện. | ✓ |
| Tabs 3 chuyên mục riêng biệt | Sử dụng Ant Design Tabs với 3 Tab con: 'Biểu đồ Burndown', 'Vận tốc Dự án', 'Phân bổ Stakeholder'. Mỗi tab có không gian rộng rãi tối đa. | |
| Bố cục lưới 2 tầng (Grid 2 rows) | Hàng trên chia 2 cột: Burndown (trái) và Velocity (phải). Hàng dưới là bảng phân bổ Stakeholder chiếm toàn chiều rộng. Tiết kiệm chiều dọc trên màn hình lớn. | |

**User's choice:** Dashboard cuộn dọc 3 Section (Recommended)
**Notes:** Bố cục 3 Card lớn trên trang cuộn dọc liền mạch, trực quan.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-select gần nhất & Deep link (Recommended) | Mặc định chọn Milestone đang mở (status !== 'Done') có deadline gần nhất; hỗ trợ URL/onNavigate param (milestoneId) để từ ProjectsView có thể click nhảy thẳng sang xem Burndown. | ✓ |
| Dropdown trống, yêu cầu chọn | Luôn hiển thị dropdown chọn Milestone trống ban đầu kèm EmptyState 'Vui lòng chọn một Milestone để xem biểu đồ Burndown'. Không tự động chọn trước. | |
| Ghi nhớ Milestone xem gần nhất | Lưu lại Milestone gần nhất mà người dùng đã xem vào localStorage để tự động khôi phục khi quay lại trang Phân tích. | |

**User's choice:** Auto-select gần nhất & Deep link (Recommended)
**Notes:** Tự động chọn milestone đang mở có hạn gần nhất, cho phép link trực tiếp từ ProjectsView.

| Option | Description | Selected |
|--------|-------------|----------|
| EmptyState theo từng Section (Recommended) | Từng Section độc lập hiển thị EmptyState riêng khi thiếu dữ liệu (kèm nút dẫn đến ProjectsView hoặc TasksView để tạo thêm). Không làm block các phần còn lại. | ✓ |
| EmptyState toàn màn hình | Nếu toàn bộ cơ sở dữ liệu chưa có Project hoặc Task nào, hiển thị một EmptyState toàn màn hình mời tạo dữ liệu đầu tiên. | |
| Vẽ biểu đồ Zero-state | Vẫn vẽ khung biểu đồ với giá trị 0 và hiển thị huy hiệu hoặc watermark 'Chưa đủ dữ liệu thống kê'. | |

**User's choice:** EmptyState theo từng Section (Recommended)
**Notes:** EmptyState cục bộ kèm Call to Action (CTA) điều hướng.

---

## Claude's Discretion

- Bảng màu và SVG ViewBox: Sử dụng các token màu sắc chuẩn từ Ant Design theme tokens và hỗ trợ co giãn responsive cho SVG viewBox.

## Deferred Ideas

- None — discussion stayed within phase scope.
