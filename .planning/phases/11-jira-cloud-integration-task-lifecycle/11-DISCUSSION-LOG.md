# Phase 11: Jira Cloud Integration & Task Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 11-jira-cloud-integration-task-lifecycle
**Areas discussed:** Xác thực & Credential, Tạo & Liên kết Issue, Workflow Transition, Hiển thị & Standup

---

## 1. Xác thực & Credential

### Q1: Lưu trữ Jira API Token và thông tin xác thực ở đâu?

| Option | Description | Selected |
|--------|-------------|----------|
| Lưu vào IndexedDB (db.settings) (Recommended) | Rất tiện dụng cho ứng dụng cá nhân: không phải nhập lại token mỗi lần mở lại trang hoặc F5. Token nằm hoàn toàn trong IndexedDB của trình duyệt máy bạn. | ✓ |
| Chỉ lưu trong RAM / Session Context | Mỗi lần F5 hoặc mở tab mới phải nhập lại API Token. Bảo mật tối đa vì không lưu secret vào ổ đĩa. | |
| Mã hóa token bằng Web Crypto Passphrase | Token được mã hóa bằng AES-GCM với Passphrase cá nhân trước khi lưu vào IndexedDB. Khi khởi động app cần nhập mật khẩu để mở khóa. | |

**User's choice:** Lưu vào IndexedDB (db.settings) (Recommended)
**Notes:** Ưu tiên tính tiện dụng và mô hình cá nhân offline-first, token lưu cục bộ trong IndexedDB.

### Q2: Giao diện cấu hình và chẩn đoán kết nối Jira Cloud nên được đặt ở vị trí nào trong trang Cài đặt (Settings)?

| Option | Description | Selected |
|--------|-------------|----------|
| Tab riêng "Tích hợp Jira" trong SettingsView (Recommended) | Thêm tab thứ 3 "Tích hợp Jira" trong SettingsView (bên cạnh "Công suất" và "Sao lưu & Dữ liệu"). Giao diện thoáng đãng, chuyên biệt cho kết nối và chẩn đoán Jira. | ✓ |
| Nằm trong Tab "Sao lưu & Dữ liệu" | Thêm một Card "Cấu hình Jira Cloud" bên trong Tab "Sao lưu & Dữ liệu", đặt cạnh Card GitHub. Không làm tăng số tab trên thanh điều hướng cài đặt. | |

**User's choice:** Tab riêng "Tích hợp Jira" trong SettingsView (Recommended)
**Notes:** Giúp phân định rõ ràng giữa quản lý công suất, sao lưu dự phòng, và tích hợp dịch vụ bên ngoài.

### Q3: Về CORS Proxy URL và tính năng kiểm tra kết nối (JIRA-01, JIRA-02), bạn muốn xử lý và thông báo lỗi chẩn đoán như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| CORS Proxy tùy chọn + Diagnostic thông minh (Recommended) | Mặc định gọi thẳng đến Atlassian Jira; nếu người dùng nhập CORS Proxy URL (VD: Cloudflare Worker) thì định tuyến qua proxy. Nút "Kiểm tra kết nối" sẽ gửi request chẩn đoán đến /rest/api/3/myself và báo rõ: Đang kết nối -> Bị chặn CORS (gợi ý dùng proxy) -> Sai token/401 -> Thành công. | ✓ |
| Bắt buộc cấu hình CORS Proxy URL | Cảnh báo bắt buộc nhập CORS Proxy URL ngay từ đầu trên môi trường web (trừ localhost) vì trình duyệt chắc chắn bị chặn CORS khi gọi trực tiếp sang Atlassian domain. | |

**User's choice:** CORS Proxy tùy chọn + Diagnostic thông minh (Recommended)
**Notes:** Hỗ trợ chẩn đoán thông minh, gợi ý cấu hình CORS Proxy khi phát hiện trình duyệt bị chặn CORS.

### Q4: Bạn có muốn lưu sẵn cấu hình Project Key và Issue Type mặc định trong Cài đặt để tăng tốc độ tạo issue từ task không?

| Option | Description | Selected |
|--------|-------------|----------|
| Có lưu Default Project & Issue Type (Recommended) | Trong tab Jira Settings, cho phép lưu sẵn Default Project Key (VD: SHB) và Default Issue Type (VD: Task). Khi tạo issue từ TaskDrawer, các giá trị này được điền sẵn, người dùng chỉ cần bấm 1 click là tạo xong. | ✓ |
| Không lưu mặc định, chọn động mỗi lần tạo | Chỉ lưu thông tin xác thực (Domain, Email, Token, Proxy). Khi tạo issue trên TaskDrawer thì mới load danh sách Project/Issue Type từ Jira để chọn thủ công. | |

**User's choice:** Có lưu Default Project & Issue Type (Recommended)
**Notes:** Giúp tăng tốc tạo issue từ TaskDrawer lên 1-click.

---

## 2. Tạo & Liên kết Issue

### Q1: Vị trí và cách bố trí khu vực tương tác Jira bên trong TaskDrawer nên như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Section "Tích hợp Jira" trong TaskDrawer (Recommended) | Một phần riêng biệt (Card/Collapse) nằm trong TaskDrawer. Khi chưa liên kết: hiển thị nút "Tạo Jira Issue mới" và ô "Gắn Jira Key có sẵn". Khi đã liên kết: hiển thị Jira Key badge (bấm để mở Jira web), trạng thái, và nút Hủy liên kết. | ✓ |
| Đặt ngay dưới Tiêu đề Task | Đặt ngay dưới tiêu đề Task ở phần đầu TaskDrawer dưới dạng một thanh trạng thái nhỏ gọn. Nhìn thấy ngay khi mở Drawer. | |

**User's choice:** Section "Tích hợp Jira" trong TaskDrawer (Recommended)
**Notes:** Đảm bảo bố cục ngăn nắp, đầy đủ không gian cho cả tạo mới, gắn key, và workflow transitions.

### Q2: Khi người dùng bấm tạo Jira Issue mới từ Task (JIRA-03), luồng thao tác nên diễn ra như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Modal xác nhận & chỉnh sửa trước khi tạo (Recommended) | Bấm "Tạo Jira Issue" sẽ mở một Modal nhỏ: Tự điền sẵn Summary (tên task), Description (mô tả task), Project Key & Issue Type (từ Cài đặt). Người dùng có thể chỉnh sửa trước khi xác nhận tạo. Tránh tạo nhầm hoặc thiếu sót. | ✓ |
| 1-Click tạo ngay không cần Modal | Bấm "Tạo Jira Issue" là gọi API tạo ngay lập tức với Project Key và Issue Type mặc định, không cần popup xác nhận. Tạo xong tự động gắn Jira Key vào task. | |

**User's choice:** Modal xác nhận & chỉnh sửa trước khi tạo (Recommended)
**Notes:** Cho phép xem trước và tinh chỉnh tóm tắt/mô tả trước khi đẩy lên hệ thống Jira doanh nghiệp.

### Q3: Khi gửi mô tả (description) lên Jira REST API v3 dưới định dạng ADF, bạn muốn cấu trúc nội dung như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Chuyển đổi thuần task.description (Recommended) | Chuyển đổi task.description thành các đoạn văn (paragraphs) chuẩn Atlassian Document Format (ADF) v3. Đơn giản, sạch sẽ, không thừa thãi. | ✓ |
| Kèm thêm thông tin phụ (Metadata enrichment) | Ngoài task.description, tự động thêm một khối thông tin phụ trong ADF (VD: Hạn chót, Ops Owner, BA, Link tài liệu) để issue trên Jira có đầy đủ ngữ cảnh nghiệp vụ ngân hàng. | |

**User's choice:** Chuyển đổi thuần task.description (Recommended)
**Notes:** Giữ nguyên vẹn nội dung mô tả, không chèn metadata không cần thiết vào mô tả Jira.

### Q4: Về tính năng gắn Jira Key có sẵn (JIRA-04) và hủy liên kết, bạn muốn giao diện hoạt động ra sao?

| Option | Description | Selected |
|--------|-------------|----------|
| Hỗ trợ Gắn + Hủy liên kết + Mở link web (Recommended) | Cho phép nhập Jira Key (regex kiểm tra định dạng [A-Z]+-[0-9]+). Sau khi gắn, cho phép bấm nút "Hủy liên kết" (Unlink) để gỡ Jira Key ra khỏi task nếu gắn nhầm (không xóa issue trên Jira). Bấm vào badge Key sẽ mở tab mới đến URL Jira web. | ✓ |
| Chỉ là text field thông thường | Chỉ cho phép nhập và sửa key như một trường text bình thường trong TaskDrawer form, không có thao tác Unlink riêng biệt. | |

**User's choice:** Hỗ trợ Gắn + Hủy liên kết + Mở link web (Recommended)
**Notes:** Có thao tác Unlink an toàn kèm link mở trực tiếp web Jira.

---

## 3. Workflow Transition

### Q1: Khi inspect các workflow transition có sẵn từ Jira (JIRA-05), bạn muốn hiển thị các hành động này trên TaskDrawer như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown chọn trạng thái đích + Nút xác nhận (Recommended) | Dropdown hiển thị các transition Jira đang cho phép (VD: "Bắt đầu làm", "Hoàn thành",...) kèm nút "Thực hiện". Gọn gàng và an toàn, tránh bấm nhầm. | ✓ |
| Các nút bấm (Buttons) trực tiếp | Hiển thị danh sách các nút bấm (Buttons) trực tiếp cho từng transition có sẵn. Chuyển trạng thái trong 1-click. | |

**User's choice:** Dropdown chọn trạng thái đích + Nút xác nhận (Recommended)
**Notes:** Giao diện trực quan, gọn gàng, tránh bấm nhầm.

### Q2: Khi thực hiện transition thành công trên Jira, bạn có muốn tự động cập nhật trạng thái (status) của Task trong TaskPlanner không?

| Option | Description | Selected |
|--------|-------------|----------|
| Tự động đồng bộ trạng thái Task (Recommended) | Tự động cập nhật trường status của Task cục bộ theo từ khóa thông minh (VD: Jira "Done"/"Closed" -> Task "Done"; "In Progress" -> Task "In Progress"; "In Review" -> Task "In Review"). Tiết kiệm thời gian, không phải đổi 2 lần. | ✓ (với yêu cầu mapping rõ ràng) |
| Checkbox tùy chọn khi xác nhận transition | Hiển thị một checkbox nhỏ "Đồng thời cập nhật trạng thái Task nội bộ" (mặc định tích chọn) để người dùng chủ động kiểm soát. | |
| Tách biệt hoàn toàn, không đồng bộ | Không đồng bộ: Chỉ cập nhật trạng thái trên Jira, trạng thái Task trong app người dùng tự điều chỉnh riêng. | |

**User's choice:** Tự động đồng bộ trạng thái Task với cơ chế ánh xạ thông minh (Jira status <-> TaskPlanner status)
**Notes:** Người dùng yêu cầu cơ chế mapping rõ ràng vì tên trạng thái Jira và TaskPlanner không hoàn toàn giống nhau.

### Q3: Về việc ánh xạ (mapping) giữa Jira Status và TaskPlanner Status, bạn muốn cơ chế hoạt động như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Bảng quy tắc Mapping chuẩn + Fallback an toàn (Recommended) | Sử dụng bảng quy tắc map chuẩn kết hợp Jira Status Category (To Do -> Open; In Progress/Developing -> In Progress; Review/PR -> In Review; Testing/UAT -> Resolved; Done/Closed -> Done). Nếu trạng thái Jira không khớp quy tắc nào thì giữ nguyên trạng thái Task cũ. | ✓ |
| Cấu hình Mapping thủ công trong Settings | Cho phép cấu hình ánh xạ chi tiết (Status Mapping Table) ngay trong tab Cài đặt Jira: Chọn từng trạng thái Task tương ứng với tên trạng thái Jira của dự án bạn. | |

**User's choice:** Bảng quy tắc Mapping chuẩn + Fallback an toàn (Recommended)
**Notes:** Bảng mapping chuẩn kết hợp Jira statusCategory và từ khóa trạng thái phổ biến, có fallback giữ nguyên trạng thái nếu không nhận diện được.

### Q4: Về việc tự động làm mới trạng thái và xử lý lỗi khi workflow Jira yêu cầu các trường bắt buộc (transition screens), bạn muốn ứng dụng phản hồi ra sao?

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch tự động + Alert lỗi chi tiết & Link web (Recommended) | Tự động fetch trạng thái và transitions khi mở TaskDrawer. Khi transition gặp lỗi (VD: workflow Jira đòi hỏi nhập Resolution/Comment bắt buộc qua web screen), hiển thị Alert lỗi rõ ràng kèm nút "Mở trên Jira Web" để người dùng chuyển trạng thái thủ công trên Jira. | ✓ |
| Chỉ fetch theo yêu cầu (Manual trigger) | Chỉ fetch khi người dùng bấm nút "Lấy transitions" để giảm thiểu tối đa số lượng request gọi sang Jira API. | |

**User's choice:** Fetch tự động + Alert lỗi chi tiết & Link web (Recommended)
**Notes:** Tự động nạp dữ liệu khi mở Drawer và báo lỗi chi tiết nếu workflow Jira yêu cầu nhập màn hình chuyển trạng thái trên web.

---

## 4. Hiển thị & Standup

### Q1: Bạn muốn hiển thị Jira Key trên bảng danh sách tác vụ (TaskTable) như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Tag Jira Key trong cột Tên tác vụ (Recommended) | Hiển thị Tag Jira Key (VD: SHB-1234 có icon link) ngay dưới hoặc cạnh tên Task trong cột "Tên tác vụ". Click vào Tag sẽ mở trực tiếp trang web Jira trong tab mới (không kích hoạt mở Drawer). Tiết kiệm diện tích bảng, rất trực quan. | ✓ |
| Thêm một cột riêng trên bảng | Thêm một cột riêng "Jira Key" trên TaskTable. Cột này có thể ẩn/hiện hoặc sắp xếp riêng. Tốn thêm diện tích chiều ngang của bảng. | |

**User's choice:** Tag Jira Key trong cột Tên tác vụ (Recommended)
**Notes:** Tiết kiệm không gian cột, click tag mở thẳng web issue mà không kích hoạt mở TaskDrawer.

### Q2: Về tính năng tìm kiếm và lọc task theo Jira trong thanh TaskFilterBar, bạn muốn cấu hình ra sao?

| Option | Description | Selected |
|--------|-------------|----------|
| Tìm kiếm từ khóa + Lọc Có/Không gắn Jira (Recommended) | Ô tìm kiếm từ khóa hiện tại (searchQuery) tự động khớp cả Jira Key (gõ "SHB-123" tìm được ngay) + Thêm tùy chọn lọc "Trạng thái Jira" (Tất cả / Đã gắn Jira / Chưa gắn Jira) trong Bộ lọc nâng cao. | ✓ |
| Chỉ tìm kiếm qua ô từ khóa | Chỉ cần tìm kiếm qua ô từ khóa thông thường, không cần thêm bộ lọc Có/Không gắn Jira để giữ giao diện tối giản. | |

**User's choice:** Tìm kiếm từ khóa + Lọc Có/Không gắn Jira (Recommended)
**Notes:** Ô tìm kiếm chung tự động so khớp `jiraKey`, kết hợp bộ lọc Có/Chưa gắn Jira trong bộ lọc nâng cao.

### Q3: Khi xuất báo cáo Markdown Standup (Phase 10), bạn muốn Jira Key hiển thị theo định dạng nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Badge [JiraKey] sau WorkType (Recommended) | Thêm badge Jira Key ngay sau WorkType: "- [Lập trình][SHB-1234] Tên Task (Dự án: ... | Hạn: ... | Phụ trách: ...)". Chuẩn format báo cáo ngắn gọn, chuyên nghiệp cho đội Banking IT. | ✓ |
| Markdown Hyperlink clickable | Biến tên task hoặc key thành đường link Markdown clickable: "- [Lập trình] [SHB-1234: Tên Task](https://domain.atlassian.net/browse/SHB-1234) (Dự án: ...)". Tiện click trực tiếp khi gửi qua Teams/Slack. | |
| Nằm trong phần metadata ngoặc đơn | Đặt Jira Key vào phần thông tin metadata trong ngoặc đơn: "... | Jira: SHB-1234)". Giữ cấu trúc đầu dòng nguyên vẹn như Phase 10. | |

**User's choice:** Badge [JiraKey] sau WorkType (Recommended)
**Notes:** Định dạng: `- [Lập trình][SHB-1234] Tên Task (Dự án: ... | Hạn: ... | Phụ trách: ...)`.

### Q4: Trên các thẻ công việc phân bổ theo ngày ở màn hình Lập kế hoạch tuần (/planner), bạn có muốn hiển thị Jira Key không?

| Option | Description | Selected |
|--------|-------------|----------|
| Hiển thị tag Jira Key nhỏ trên thẻ tuần (Recommended) | Hiển thị một tag nhỏ xíu Jira Key (VD: SHB-1234) trên thẻ công việc ở màn hình Lịch tuần /planner. Giúp người dùng khi xem kế hoạch ngày có thể nhận diện ngay issue tương ứng trên Jira. | ✓ |
| Không hiển thị trên thẻ tuần | Không hiển thị trên thẻ tuần để giữ thẻ tối giản và không chiếm diện tích trong cột ngày vốn chật hẹp. Chỉ xem Jira Key trong TaskTable hoặc TaskDrawer. | |

**User's choice:** Hiển thị tag Jira Key nhỏ trên thẻ tuần (Recommended)
**Notes:** Hiển thị micro-badge Jira Key giúp đối chiếu nhanh trên tuần.

---

## Claude's Discretion

- Chi tiết layout, flex wrap, và loading spinner cho các thao tác mạng với Jira REST API.
- Cấu hình timeout mặc định (10 giây) và cơ chế che giấu token (redaction) trong error message phòng ngừa lộ token trong log hoặc UI.
- Thêm trường `jiraKey?: string` vào model `Task` và cập nhật Dexie schema v3 nếu cần index tìm kiếm nhanh.

## Deferred Ideas

- None — discussion stayed within phase scope.
