# Phase 02: Work Hierarchy & Fast Task Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 02-Work Hierarchy & Fast Task Management
**Areas discussed:** Hierarchy Layout, Inline & Quick-Add, Task Reparenting, Cascade Deletion, Search & Filters, Estimate Input, Links & Notes, Keyboard Shortcuts & Accessibility

---

## Hierarchy Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Separate Tasks & Projects (Recommended) | Dedicated '/#/tasks' table view with filters, plus '/#/projects' view for managing projects and milestones. Reuses hash routing shell from Phase 1. | ✓ |
| Single Nested Tree View | Single unified tree/table view nesting projects -> milestones -> tasks with expandable rows. | |
| Master-Detail Split | Left panel lists projects and milestones, right panel displays tasks for selected item. | |

**User's choice:** Separate Tasks & Projects (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Breadcrumb Tag (Recommended) | Single compact badge/tag showing 'Project > Milestone' or 'Project' or 'Standalone'. Clicking filters the list. Saves horizontal table space. | ✓ |
| Separate Table Columns | Two dedicated table columns: one for Project, one for Milestone. Wider layout on desktop. | |
| Grouped Row Sections | Table rows grouped under collapsible Project/Milestone section headers. Standalone tasks in own group. | |

**User's choice:** Breadcrumb Tag (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable Table (Recommended) | Bảng Project có nút expand mở ra danh sách Milestone và Task thuộc Project. Tận dụng Table antd chuẩn. | ✓ |
| Card Grid | Mỗi Project là 1 Card chứa thanh progress, hạn chót, bấm vào để mở Drawer/Trang chi tiết. Phù hợp visual trực quan. | |
| Master-Detail Panel | Bên trái danh sách Project, bên phải hiển thị danh sách Milestone và Task của Project đang chọn. | |

**User's choice:** Expandable Table (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Filter & Segmented (Recommended) | Bộ lọc Project dropdown có mục 'Standalone' (hoặc 'No Project') + thanh Segmented nhanh trên đầu bảng lọc All / Projects / Standalone. Dễ lọc nhanh. | ✓ |
| Tách Tab riêng | Tách riêng 2 tab: tab 'Project Tasks' và tab 'Standalone Tasks'. Rõ ràng nhưng thêm chuyển tab. | |
| Dropdown lọc duy nhất | Chỉ hiển thị qua bộ lọc Project dropdown (chọn None để xem standalone). Giao diện tối giản nhất. | |

**User's choice:** Filter & Segmented (Recommended)

---

## Inline & Quick-Add

| Option | Description | Selected |
|--------|-------------|----------|
| Input Bar đầu bảng (Recommended) | Một thanh input trên đầu bảng Tasks, gõ tên nhấn Enter tạo ngay task Open. Có dropdown nhỏ chọn nhanh Project nếu cần. Nhanh nhất cho nhập liệu cá nhân. | ✓ |
| Drawer Form chi tiết | Bấm nút '+ New Task' mở Drawer bên phải có form nhập chi tiết (mô tả, deadline, estimate, project). Cẩn thận và đầy đủ ngay từ đầu. | |
| Inline Row trong bảng | Dòng đầu tiên của Table là ô input inline, gõ trực tiếp các cột rồi bấm Save hoặc Enter. Tiện nhưng hạn chế với các trường phức tạp. | |

**User's choice:** Input Bar đầu bảng (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Clickable Status Tag (Recommended) | Cột Status hiển thị Tag màu sắc (Open: blue, In Progress: processing, Done: success...). Bấm vào Tag mở Dropdown chọn đổi trạng thái ngay, tự động lưu vào IndexedDB. Phù hợp antd Tag/Dropdown. | ✓ |
| Checkbox Done + Menu phụ | Checkbox tròn ở đầu dòng: click là đánh dấu Done (hoặc uncheck về Open), muốn đổi trạng thái khác (In Progress, Resolved...) thì chọn menu. Giống To-Do app truyền thống. | |
| Nút chu kỳ trạng thái | Click nút hành động trong cột Actions (Next Status) để tự động đẩy tiến độ Open -> In Progress -> Done. Nhanh nhưng cố định luồng. | |

**User's choice:** Clickable Status Tag (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Popover Slider & Input (Recommended) | Cột Progress hiển thị thanh Progress antd mini kèm số %. Click vào hiển thị Popover nhỏ có Slider (0-100%) hoặc ô nhập số, chỉnh xong đóng popover là lưu. Tránh click nhầm và rất mượt. | ✓ |
| Inline Cell Editing | Click trực tiếp vào ô phần trăm biến ô thành InputNumber, gõ số rồi bấm Enter/Tab để lưu. Nhập liệu bàn phím rất nhanh. | |
| Các mốc cố định 25% | Nút bấm nhanh các mốc cố định: 0% -> 25% -> 50% -> 75% -> 100%. Tiện trên điện thoại nhưng không chỉnh được số lẻ. | |

**User's choice:** Popover Slider & Input (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Drawer trượt bên phải (Recommended) | Click tên task (hoặc nút Edit) mở Drawer trượt ra từ bên phải. Cho phép chỉnh sửa đầy đủ mọi trường mà không rời khỏi danh sách, hỗ trợ phím Esc để đóng. Phù hợp antd Drawer. | ✓ |
| Modal Popup giữa màn hình | Mở Modal popup ở giữa màn hình. Tập trung vào form nhưng che khuất toàn bộ danh sách phía sau. | |
| Trang chi tiết riêng | Chuyển sang trang riêng (`/#/tasks/:id`). Rõ ràng cho task dài nhưng làm gián đoạn luồng làm việc danh sách. | |

**User's choice:** Drawer trượt bên phải (Recommended)

---

## Task Reparenting

| Option | Description | Selected |
|--------|-------------|----------|
| Cascading Select trong Form (Recommended) | Trong Drawer chi tiết (và action menu của dòng): có bộ chọn Project -> Milestone (hoặc để trống để thành Standalone). Đổi giá trị lưu ngay, UUID giữ nguyên. Đơn giản, tin cậy. | ✓ |
| TreeSelect Modal chuyên dụng | Nút 'Move' trên action menu mở Modal nhỏ có Tree Select: chọn trực tiếp nút đích (Root/Standalone, Project X, Milestone Y). Trực quan cấu trúc cây. | |
| Drag-and-Drop | Kéo thả dòng task thả vào Project/Milestone khác. Trực quan nhưng phức tạp và dễ lỗi trên mobile/touch screen. | |

**User's choice:** Cascading Select trong Form (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Tự động reset Milestone (Recommended) | Khi đổi sang Project khác, tự động xóa liên kết Milestone cũ (vì Milestone thuộc Project cũ). Task tạm thời thuộc Project mới (cấp Project), người dùng có thể chọn Milestone mới từ danh sách lọc theo Project mới. Tránh mâu thuẫn dữ liệu. | ✓ |
| Cảnh báo xác nhận trước | Hiển thị cảnh báo xác nhận: 'Thay đổi Project sẽ gỡ bỏ Milestone hiện tại. Bạn có chắc chắn không?' trước khi áp dụng. Cẩn trọng nhưng thêm bước bấm. | |
| Bắt buộc gỡ Milestone trước | Khóa không cho đổi Project trực tiếp nếu đang có Milestone, bắt buộc phải chọn 'Không Milestone' trước rồi mới được chọn Project khác. Quá cứng nhắc. | |

**User's choice:** Tự động reset Milestone (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Batch Selection Bar (Recommended) | Bảng Tasks có checkbox chọn nhiều dòng. Khi chọn >= 1 dòng, thanh Action Bar nổi lên cho phép: Chuyển Project/Milestone hàng loạt, Đổi Status hàng loạt, hoặc Xóa. Rất năng suất cho quản lý công việc. | ✓ |
| Chỉ chỉnh từng task (v1) | Trong v1 chỉ cho phép chỉnh từng task một qua Drawer/Inline. Đơn giản, an toàn, ít code thừa. Thao tác hàng loạt để v2. | |
| Chỉ Bulk Status | Chỉ hỗ trợ Bulk Status Change (đổi trạng thái hàng loạt), không hỗ trợ di chuyển phân cấp hàng loạt. | |

**User's choice:** Batch Selection Bar (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Nút + Add Task tại chỗ (Recommended) | Tại mỗi dòng Milestone (hoặc dòng Project), có nút '+ Add Task' để tạo ngay task mới đã điền sẵn Project/Milestone đó, hoặc mở popup chọn nhanh từ các Standalone Task. Thao tác tiện lợi không cần nhảy qua trang Tasks. | ✓ |
| Chỉ gán từ trang Tasks | Màn hình Projects chỉ để quản lý thông tin Project & Milestone (CRUD). Mọi thao tác thêm/gán Task đều thực hiện ở trang `/#/tasks`. Tách biệt rành mạch màn hình. | |
| Chỉ tạo mới tại chỗ | Chỉ cho tạo Task mới tại chỗ, không cho link Task cũ đã tồn tại. Gọn nhẹ form nhập. | |

**User's choice:** Nút + Add Task tại chỗ (Recommended)

---

## Cascade Deletion

| Option | Description | Selected |
|--------|-------------|----------|
| 2 lựa chọn: Xóa hết hoặc Giữ Task (Recommended) | Modal hiển thị rõ số lượng Milestone và Task con, cho 2 lựa chọn: (1) 'Xóa toàn bộ' (cascade delete sạch sẽ), hoặc (2) 'Chỉ xóa Project' (tách các Task con thành Standalone để không mất việc). Linh hoạt và an toàn dữ liệu tuyệt đối. | ✓ |
| Luôn xóa toàn bộ có cảnh báo số lượng | Chỉ có 1 tùy chọn xóa: Xóa sạch Project và toàn bộ con. Modal liệt kê số lượng bị xóa và yêu cầu xác nhận rõ ràng. Đơn giản, dứt khoát. | |
| Chặn xóa nếu còn con | Chặn xóa: Không cho xóa Project nếu còn Task/Milestone con. Người dùng phải tự tay xóa hoặc chuyển hết con đi trước. Rất an toàn nhưng thao tác thủ công nhiều. | |

**User's choice:** 2 lựa chọn: Xóa hết hoặc Giữ Task (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| 2 lựa chọn: Xóa hết hoặc Giữ về Project (Recommended) | Modal liệt kê số Task con của Milestone và cho 2 nút/tùy chọn: 'Xóa toàn bộ Task con' HOẶC 'Giữ lại Task' (chuyển Task lên cấp Project, chỉ gỡ milestoneId). Nhất quán với cách xử lý khi xóa Project. | ✓ |
| Luôn giữ lại Task về Project | Khi xóa Milestone, luôn luôn giữ lại Task và đưa về cấp Project (chỉ gỡ milestoneId về null), không bao giờ tự ý xóa Task. An toàn tối đa, không cần hỏi nhiều. | |
| Luôn xóa sạch Task con | Xóa Milestone là luôn xóa sạch toàn bộ Task thuộc Milestone đó sau khi người dùng bấm OK xác nhận. | |

**User's choice:** 2 lựa chọn: Xóa hết hoặc Giữ về Project (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Tách bạch Status & Nút Xóa (Recommended) | 'Cancelled' chỉ là một trạng thái lựa chọn qua Status dropdown (giữ nguyên toàn bộ dữ liệu, chỉ hiển thị mờ/gạch ngang và có thể lọc). Còn nút 'Delete' (biểu tượng thùng rác) là hành vi xóa vĩnh viễn khỏi IndexedDB. Tách bạch hoàn toàn. | ✓ |
| Gợi ý Cancelled khi bấm Xóa | Bấm nút Xóa sẽ hiện popup gợi ý: 'Bạn nên chuyển sang Cancelled để lưu vết, hoặc Xóa vĩnh viễn'. Hướng dẫn người dùng thói quen lưu trữ. | |
| Hạn chế quyền Delete | Chỉ cho phép Cancelled, không cho phép Delete nếu item đã từng có dữ liệu hoặc đã Done. Tránh mất dữ liệu nhưng làm rác DB. | |

**User's choice:** Tách bạch Status & Nút Xóa (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Xóa sạch Allocations theo Task (Recommended) | Khi xóa vĩnh viễn Task khỏi DB, tự động xóa sạch các bản ghi 'plannedAllocations' của Task đó trong cùng một transaction Dexie để không tạo ra dữ liệu rác/mồ côi gây sai lệch tính toán công suất. Đảm bảo toàn vẹn dữ liệu. | ✓ |
| Chặn xóa nếu đã có lịch | Chặn xóa Task nếu Task đó đã được lên lịch phân bổ giờ (yêu cầu người dùng vào gỡ phân bổ giờ trước rồi mới xóa task). Quá nhiều bước phiền phức. | |
| Giữ lại phân bổ mồ côi | Giữ nguyên bản ghi phân bổ trong DB nhưng đánh dấu mồ côi. Dễ gây lỗi cho các Phase 3, 4 tính toán tải. | |

**User's choice:** Xóa sạch Allocations theo Task (Recommended)

---

## Search & Filters

| Option | Description | Selected |
|--------|-------------|----------|
| Thanh lọc ngang đầy đủ (Recommended) | Thanh lọc ngang trên đầu bảng: Ô tìm kiếm text + Dropdowns chọn Status, Priority, Project + Nhóm nút nhanh Date Horizon (Tất cả, Quá hạn, Hôm nay, Tuần này). Trực quan, dễ thao tác ngay. | ✓ |
| Nút mở Drawer lọc riêng | Chỉ để ô tìm kiếm text trên bảng, có nút 'Bộ lọc' mở Popover/Drawer chứa toàn bộ các tùy chọn lọc chi tiết. Giữ bảng rất gọn. | |
| Lọc trên tiêu đề cột Table | Tận dụng tính năng lọc có sẵn trên tiêu đề từng cột của Ant Design Table (Table Column Filters). Tối giản nhưng khó lọc đa tiêu chí cùng lúc. | |

**User's choice:** Thanh lọc ngang đầy đủ (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Debounce 200ms toàn diện (Recommended) | Tìm kiếm tức thì với debounce 200ms, không phân biệt hoa thường, quét cả 'name', 'description' và 'notes'. Phản hồi tức thì mượt mà. | ✓ |
| Nhấn Enter mới tìm | Chỉ bắt đầu lọc khi người dùng nhấn Enter hoặc bấm nút Kính lúp. Tránh tính toán liên tục khi đang gõ. | |
| Chỉ tìm theo tên Task | Chỉ tìm theo 'name' của Task để tối ưu tốc độ tối đa. Bỏ qua ghi chú và mô tả. | |

**User's choice:** Debounce 200ms toàn diện (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Deadline & Priority mặc định (Recommended) | Mặc định ưu tiên việc cần làm trước: Deadline gần nhất lên đầu, tiếp theo là Priority cao (Urgent -> High -> Medium -> Low). Người dùng có thể click tiêu đề bất kỳ cột nào để sort tùy ý. Rất tiện cho lập kế hoạch. | ✓ |
| Mới tạo lên đầu | Mặc định sắp xếp theo ngày tạo mới nhất (createdAt DESC). Task vừa thêm luôn ở đầu bảng. Có thể click cột để đổi. | |
| Dropdown chọn kiểu Sort | Có dropdown riêng trên thanh công cụ: 'Sắp xếp theo' (Hạn chót, Độ ưu tiên, Tên A-Z, Ngày cập nhật). Dễ hiểu trên mobile. | |

**User's choice:** Deadline & Priority mặc định (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ hiện việc Active (Recommended) | Mặc định chỉ hiện các Task đang hoạt động (Open, In Progress, Resolved, In Review). Ẩn Done và Cancelled để tránh rối mắt, có nút bấm nhanh 'Hiện việc đã đóng' khi cần xem lại. Giúp tập trung vào việc cần làm. | ✓ |
| Hiện tất cả mọi Status | Mặc định hiện toàn bộ tất cả các Task (không lọc status nào). Người dùng tự bấm lọc nếu muốn. Toàn diện nhưng nhanh đầy bảng. | |
| Chỉ hiện việc 7 ngày tới | Mặc định chỉ hiện việc có Deadline trong 7 ngày tới. Hẹp nhưng tập trung cao độ. | |

**User's choice:** Chỉ hiện việc Active (Recommended)

---

## Estimate Input

| Option | Description | Selected |
|--------|-------------|----------|
| 2 ô Giờ & Phút + Nút nhanh (Recommended) | 2 ô số liền nhau: [ Giờ ] h [ Phút ] m (bước nhảy phút là 15 hoặc 30m), kèm các nút bấm nhanh phổ biến (30m, 1h, 2h, 4h, 8h). Rất trực quan, tránh lỗi gõ sai cú pháp, tự quy đổi ra integer minutes. | ✓ |
| Ô nhập text tự parse cú pháp | Một ô nhập text thông minh: người dùng gõ '2h30m', '1.5h' hoặc '45m', hệ thống tự parse và hiển thị nhãn quy đổi bên dưới ('= 150 phút'). Nhanh cho người thích gõ bàn phím. | |
| 1 ô số Giờ (thập phân) | Chỉ 1 ô InputNumber duy nhất đơn vị Giờ (cho phép số lẻ như 1.5, 2.25). Ít ô nhập nhưng phải tính số thập phân. | |

**User's choice:** 2 ô Giờ & Phút + Nút nhanh (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Định dạng 'Xh Ym' (Recommended) | Hiển thị gọn gàng, tự nhiên theo Giờ và Phút: '2h 30m', '45m', '4h' (nếu phút = 0 thì ẩn số phút). Dễ nhìn, quen thuộc. | ✓ |
| Giờ thập phân ('2.5h') | Hiển thị số giờ dạng thập phân: '2.5h', '0.75h', '4.0h'. Dễ so sánh độ lớn nhanh. | |
| Chỉ số phút ('150m') | Hiển thị số phút nguyên bản: '150 phút'. Tuyệt đối chính xác nhưng khó hình dung thời gian trong ngày. | |

**User's choice:** Định dạng 'Xh Ym' (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Cú pháp '~2h' tùy chọn (Recommended) | Hỗ trợ cú pháp tùy chọn: gõ 'Tên task ~2h' hoặc '~30m' tự động bóc tách thành tên và estimate tương ứng (nếu không gõ cú pháp thì estimate = 0, sau này bổ sung sau). Cực kỳ tiện cho người dùng thích thao tác nhanh. | ✓ |
| Ô số kế bên ô tên task | Thêm 1 ô số nhỏ kế bên ô input tên task trên thanh Quick-Add để nhập số giờ trước khi bấm Enter. Trực quan nhưng thanh tạo task dài hơn. | |
| Luôn để mặc định 0 phút | Quick-Add chỉ nhập tên, estimate luôn = 0. Muốn ước lượng giờ thì bấm mở Drawer sửa sau. Đơn giản nhất. | |

**User's choice:** Cú pháp '~2h' tùy chọn (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Số nguyên 0-6000m + nhắc nhở (Recommended) | Chấp nhận từ 0 đến 6000 phút (100h), ép kiểu số nguyên không âm (Math.round). Cho phép 0 phút lúc tạo, nhưng hiển thị nhắc nhở nhẹ nếu chưa ước lượng khi đổi status sang 'In Progress'. An toàn và thực tế. | ✓ |
| Số nguyên >= 0 tự do | Chỉ yêu cầu số nguyên >= 0, không đặt trần tối đa, không nhắc nhở gì thêm. Tự do tuyệt đối cho người dùng. | |
| Bắt buộc estimate > 0 | Bắt buộc mọi Task phải có estimate > 0 mới cho tạo/lưu. Rất chặt chẽ cho lập kế hoạch nhưng gây ức chế khi muốn ghi nhanh việc. | |

**User's choice:** Số nguyên 0-6000m + nhắc nhở (Recommended)

---

## Links & Notes

| Option | Description | Selected |
|--------|-------------|----------|
| Danh sách URL động (Recommended) | Danh sách động: Mỗi dòng là một ô URL + nút xóa (icon thùng rác), bên dưới có nút '+ Thêm liên kết'. Kiểm tra URL hợp lệ cơ bản. Khi hiển thị là link bấm mở tab mới (target='_blank' rel='noopener noreferrer'). Dễ dùng và an toàn. | ✓ |
| TextArea dán nhiều dòng | Một ô TextArea cho phép paste nhiều link (mỗi dòng một link). Khi lưu tự động tách theo dòng và loại bỏ dòng trống. Tiện paste hàng loạt. | |
| Cặp Tiêu đề + URL | Cho phép nhập cả Tiêu đề và URL dạng cặp (Title + URL). Đầy đủ nhưng phức tạp hơn mảng string đơn giản hiện tại. | |

**User's choice:** Danh sách URL động (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Icon nhỏ + Hover Popover (Recommended) | Cột tiêu đề task (hoặc cột phụ) hiển thị icon kẹp giấy/link nhỏ kèm số lượng (ví dụ: [🔗 2]). Hover vào hiện Popover danh sách link để click mở nhanh mà không cần mở Drawer. Tiết kiệm diện tích. | ✓ |
| Chỉ báo có link, mở ở Drawer | Chỉ hiển thị icon link nếu task có link, muốn mở link phải bấm mở Drawer chi tiết. Đơn giản hóa bảng. | |
| Cột Links riêng trong bảng | Dành riêng một cột Links trong bảng để render thẳng các link ra ngoài. Rõ ràng nhưng chiếm nhiều chiều ngang. | |

**User's choice:** Icon nhỏ + Hover Popover (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| TextArea tự nhận diện URL (Recommended) | TextArea nhiều dòng (khoảng 4-6 dòng có thể kéo giãn), tự động nhận diện URL thành liên kết bấm được (linkify) và giữ nguyên khoảng cách xuống dòng (white-space: pre-wrap). Nhẹ nhàng, không cần cài thêm thư viện nặng. | ✓ |
| Markdown Editor & Preview | Trình soạn thảo Markdown đầy đủ (in đậm, danh sách dấu chấm, code block) có tab Preview. Đẹp cho tài liệu dài nhưng thêm dependencies. | |
| Plain Text thuần túy | Chỉ là ô text thông thường không linkify. Đơn giản nhất. | |

**User's choice:** TextArea tự nhận diện URL (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Trích đoạn 1 dòng dưới tên Task (Recommended) | Dưới tên Task có dòng chữ nhỏ màu xám nhạt trích đoạn 1 dòng đầu của Notes (hoặc icon sổ ghi chép nếu rê chuột vào hiện Tooltip xem nhanh). Giúp nhận diện việc nhanh mà không cần mở Drawer. | ✓ |
| Chỉ hiện icon ghi chú | Chỉ hiển thị một icon sổ ghi chép nhỏ; click hoặc hover vào mới đọc được tooltip. Bảng gọn gàng hơn. | |
| Chỉ xem trong Drawer | Không hiển thị gì trên bảng, chỉ mở Drawer mới đọc được ghi chú. Tối đa diện tích bảng cho các cột khác. | |

**User's choice:** Trích đoạn 1 dòng dưới tên Task (Recommended)

---

## Keyboard Shortcuts & Accessibility

| Option | Description | Selected |
|--------|-------------|----------|
| Phím tắt '/', 'c', 'Esc' (Recommended) | Phím trực quan: '/' để nhảy vào ô tìm kiếm, 'c' để nhảy vào ô Quick-Add task, 'Esc' đóng Drawer/Modal (tự động bỏ qua khi đang gõ text trong input). Phục hồi focus chuẩn xác về nút vừa bấm. Nhanh và tiện dụng. | ✓ |
| Chỉ điều hướng Tab tiêu chuẩn | Chỉ dùng phím Tab / Shift+Tab và Enter tiêu chuẩn của trình duyệt và Ant Design, không gán phím tắt chữ cái để tránh xung đột gõ tiếng Việt / gõ Telex. An toàn tuyệt đối. | |
| Command Palette (Ctrl+K) | Hộp lệnh Command Palette (Ctrl+K / Cmd+K) tìm kiếm và kích hoạt mọi chức năng. Hiện đại nhưng phức tạp cho v1. | |

**User's choice:** Phím tắt '/', 'c', 'Esc' (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Lưu trigger ref & Focus chuẩn (Recommended) | Lưu lại phần tử kích hoạt (trigger element ref) trước khi mở Drawer/Modal; khi đóng, tự động focus lại chính xác phần tử đó. Áp dụng viền focus outline rõ nét (2px antd primary border) khi điều hướng bằng bàn phím. Đạt chuẩn WCAG 2.1 AA. | ✓ |
| Mặc định của Ant Design | Sử dụng hoàn toàn hành vi mặc định có sẵn của Ant Design Modal/Drawer (antd đã có sẵn bẫy focus và khôi phục cơ bản). Tiết kiệm code tùy biến. | |
| Trả focus về đầu bảng | Sau khi đóng Drawer/Modal, luôn luôn trả focus về ô tìm kiếm hoặc dòng đầu tiên của bảng. Đơn giản nhưng có thể làm người dùng mất vị trí đang duyệt. | |

**User's choice:** Lưu trigger ref & Focus chuẩn (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Mũi tên Lên/Xuống & Enter (Recommended) | Cho phép dùng phím mũi tên Lên/Xuống (hoặc J/K) để di chuyển hàng được chọn, nhấn 'Enter' để mở Drawer chi tiết của task đó, nhấn 'Space' để toggle chọn checkbox. Nâng cao năng suất thao tác phím. | ✓ |
| Chỉ điều hướng Tab tự nhiên | Dùng phím 'Tab' để tuần tự nhảy qua các nút và link trong dòng theo chuẩn web tự nhiên. Không cần thêm sự kiện lắng nghe phím tùy biến. Đơn giản, an toàn. | |
| Chỉ hỗ trợ cho Tree view | Chỉ hỗ trợ phím mũi tên khi đang ở chế độ xem cây (Tree navigation). Không áp dụng cho bảng phẳng. | |

**User's choice:** Mũi tên Lên/Xuống & Enter (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Message.success & aria-live (Recommended) | Hiển thị thông báo nhẹ antd 'message.success({ content: 'Đã lưu', duration: 1.5 })' ở góc trên kèm vùng 'aria-live="polite"' cho công nghệ hỗ trợ đọc màn hình. Rõ ràng, không gây phiền phức. | ✓ |
| Icon tích xanh tại chỗ | Chỉ hiển thị icon tích xanh nhỏ nhấp nháy 1 giây ngay tại ô vừa sửa, không bật thông báo popup/toast. Tối giản nhất. | |
| Im lặng, chỉ cập nhật UI | Không cần hiển thị thông báo gì, chỉ cập nhật giá trị giao diện. Hoàn toàn im lặng. | |

**User's choice:** Message.success & aria-live (Recommended)

---

## Claude's Discretion

- Token spacing, padding, và component sizing theo hệ thống Ant Design 6 đã thiết lập ở Phase 1.
- Tối ưu Dexie compound index cho các query tìm kiếm hoặc filter nếu cần.

## Deferred Ideas

- Task dependencies & subtasks (v2).
- Lưu cấu hình bộ lọc ưa thích (PROD-01, v2).
- Nhân bản task và task template (PROD-02, v2).
- Command Palette (Ctrl+K) (v2).
