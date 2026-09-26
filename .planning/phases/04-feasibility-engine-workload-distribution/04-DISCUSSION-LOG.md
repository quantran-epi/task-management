# Phase 4: Feasibility Engine & Workload Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 04-Feasibility Engine & Workload Distribution
**Areas discussed:** Evaluation Scope & Inputs, Distribution Algorithm Rules, Infeasible Handling & Guidance, Review & Confirmation UI

---

## Evaluation Scope & Inputs

### Question 1: Default evaluation start date
| Option | Description | Selected |
|--------|-------------|----------|
| Today đến deadline (Recommended) | Tính từ ngày hiện tại (today) đến deadline. Quá khứ không thể lập kế hoạch mới. | ✓ |
| Task startDate đến deadline | Nếu task có startDate thì dùng startDate, nếu không có thì fallback về today đến deadline. | |
| Bắt buộc user chọn khoảng ngày | Không tự động suy luận; user luôn tự chọn start date và end date trên DatePicker. | |

**User's choice:** Today đến deadline (Recommended)
**Notes:** Quá khứ không thể lên kế hoạch mới nên bắt đầu từ today là thực tế nhất.

### Question 2: Xử lý task đã có allocation trước đó
| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ tính remaining minutes (Recommended) | Chỉ tính thời gian còn thiếu (remaining = estimate - allocated). Tránh trùng lặp giờ đã lên lịch. | ✓ |
| Remaining mặc định + toggle Full estimate | Mặc định tính remaining minutes, nhưng có checkbox cho phép user chọn đánh giá lại toàn bộ full estimate. | |
| Luôn tính full estimate | Luôn tính đủ full estimate, xóa hoặc ghi đè toàn bộ allocation cũ của task này. | |

**User's choice:** Chỉ tính remaining minutes (Recommended)
**Notes:** Chỉ phân bổ phần estimate còn thiếu để tránh đè hoặc nhân đôi công việc đã lên lịch.

### Question 3: Chế độ xác định khoảng thời gian đánh giá
| Option | Description | Selected |
|--------|-------------|----------|
| Dual mode: Deadline & Custom Range (Recommended) | Hỗ trợ 2 tab/mode: 'By Deadline' (nếu task có dueDate/milestone) và 'Custom Range' (RangePicker). Nếu không có deadline, default mở Custom Range (7 ngày tiếp theo). | ✓ |
| Chỉ hỗ trợ Task có Deadline | Task bắt buộc phải có dueDate hoặc milestone targetDate. Nếu chưa có, yêu cầu user gán dueDate trước. | |
| Chỉ dùng preset cố định | Cố định các preset nhanh: 7 ngày tới, 14 ngày tới, hết tháng này, không cho chọn khoảng ngày tùy ý. | |

**User's choice:** Dual mode: Deadline & Custom Range (Recommended)
**Notes:** Đảm bảo linh hoạt cho cả task có deadline và task chưa có hạn chót.

### Question 4: Tiêu chí lọc ngày hợp lệ (eligible dates)
| Option | Description | Selected |
|--------|-------------|----------|
| Lọc netBalance > 0 & capacity > 0 (Recommended) | Ngày hợp lệ là ngày có effectiveCapacity > 0 và netBalance > 0. Tự động loại trừ ngày 0-capacity (nghỉ/lễ), ngày đã full/overloaded, ngày quá khứ. Báo cáo chi tiết theo CALC-04. | ✓ |
| Lọc chuẩn + Toggle cho phép ngày nghỉ | Mặc định loại trừ ngày 0h, nhưng cung cấp toggle 'Bao gồm cả ngày nghỉ' để user có thể ép phân bổ nếu muốn. | |
| Chỉ loại trừ ngày quá khứ | Chỉ loại trừ ngày quá khứ (< today), tất cả ngày còn lại đều thử phân bổ kể cả ngày 0-capacity (sẽ gây overload). | |

**User's choice:** Lọc netBalance > 0 & capacity > 0 (Recommended)
**Notes:** Ngày hợp lệ phải có capacity dương và chưa đầy; báo cáo rõ ràng các ngày bị loại trừ.

---

## Distribution Algorithm Rules

### Question 1: Chiến lược chia thời gian vào các ngày lowest-load
| Option | Description | Selected |
|--------|-------------|----------|
| Balanced Spread cân bằng tải (Recommended) | Phân bổ chia nhỏ sao cho sau khi gán, tải giữa các ngày hợp lệ được cân bằng nhất. Ưu tiên ngày tải thấp nhất, ngày sớm hơn phá vỡ hòa điểm (CALC-05). | |
| Greedy Fill dồn đầy ngày ít việc nhất | Đổ tối đa thời gian vào ngày ít việc nhất cho đến khi đầy hoặc đạt giới hạn ngày, sau đó mới sang ngày thấp nhì. | |
| Front-load ưu tiên ngày sớm nhất | Ưu tiên lấp đầy các ngày sớm nhất trước (front-load) để hoàn thành task càng sớm càng tốt, miễn là không quá tải. | |
| Cho phép user chọn động Strategy trên UI | Cho phép user linh hoạt chuyển đổi giữa Balanced Spread (mặc định), Front-load và Greedy Fill ngay trên UI. | ✓ |

**User's choice:** Cho phép user chọn động Strategy trên UI (Mặc định: Balanced Spread)
**Notes:** User đề xuất "why not allow user to pick algorithm dynamically?". Thuật toán mặc định là Balanced Spread (chuẩn CALC-05), kèm selector cho phép đổi chiến lược tức thì.

### Question 2: Giới hạn tối đa thời gian 1 task / 1 ngày (Daily Cap)
| Option | Description | Selected |
|--------|-------------|----------|
| Tự do theo netBalance + tùy chọn Max Cap (Recommended) | Mặc định tối đa bằng netBalance khả dụng của ngày đó, nhưng cung cấp input 'Max hours/day' (ví dụ tối đa 2h hoặc 4h/ngày cho task này) để user tùy chỉnh nếu muốn. | ✓ |
| Cố định cứng tối đa 4h/ngày | Cố định cứng một ngưỡng (ví dụ tối đa 4h/ngày cho 1 task), phần thừa bắt buộc chuyển sang ngày khác. | |
| Không giới hạn (lấp đầy 100% capacity) | Luôn lấp đầy 100% netBalance còn trống của ngày, không cần cấu hình cap. | |

**User's choice:** Tự do theo netBalance + tùy chọn Max Cap (Recommended)
**Notes:** Cho phép user kiểm soát độ tập trung của task trong ngày mà không bị ép buộc cứng.

### Question 3: Bước chia thời gian tối thiểu (Granularity)
| Option | Description | Selected |
|--------|-------------|----------|
| Bước 15 phút (Recommended) | Candidate allocation luôn là bội số của 15 phút (15m, 30m, 45m, 1h...). Đồng bộ với step 15m trong TaskDrawerPlanning hiện tại. Phút lẻ cuối cùng được gộp gọn. | ✓ |
| Bước 30 phút | Chỉ phân bổ theo khối 30 phút hoặc 1 giờ (30m, 60m, 90m...). Lịch trông gọn hơn nhưng kém linh hoạt với task ngắn. | |
| Số phút chính xác (không làm tròn) | Chia chính xác từng phút nguyên (ví dụ 43m, 78m). Không làm tròn, khớp 100% estimateMinutes nhưng số phút bị vụn vặt. | |

**User's choice:** Bước 15 phút (Recommended)
**Notes:** Bội số 15 phút đồng bộ hoàn toàn với Ant Design input step và cách lên lịch thực tế.

### Question 4: Xử lý khi ngày candidate đã có sẵn allocation của task này
| Option | Description | Selected |
|--------|-------------|----------|
| Cộng dồn & Merge record (Recommended) | Tính số phút thêm vào sao cho (đã có + thêm mới) không vượt capacity ngày đó. Khi lưu, merge thành 1 record duy nhất theo đúng D-12. Hiển thị rõ: 'Hiện có: Xm + Thêm: Ym = Zm'. | ✓ |
| Bỏ qua ngày đã có allocation | Chỉ phân bổ vào những ngày task này chưa có allocation nào, giữ nguyên các ngày đã lên lịch trước đó. | |
| Ghi đè số phút cũ | Ghi đè hoàn toàn: số phút candidate mới sẽ thay thế số phút cũ trên ngày đó. | |

**User's choice:** Cộng dồn & Merge record (Recommended)
**Notes:** Tuân thủ chặt chẽ ràng buộc duy nhất `(taskId, date)` đã thiết lập ở Phase 3.

---

## Infeasible Handling & Guidance

### Question 1: Thông tin và đề xuất khi Infeasible
| Option | Description | Selected |
|--------|-------------|----------|
| Deficit + Gợi ý ngày sớm nhất có thể xong (Recommended) | Hiển thị rõ số giờ thiếu hụt (ví dụ: 'Thiếu 3h 15m') VÀ tự động tính gợi ý 'Ngày sớm nhất có thể hoàn thành nếu mở rộng khoảng thời gian' (Earliest Feasible Date). Giúp user biết nên dời deadline đến ngày nào. | ✓ |
| Chỉ hiển thị Deficit & Breakdown tắc nghẽn | Chỉ hiển thị con số thiếu hụt cụ thể, kèm danh sách các ngày bị nghẽn (full/overloaded). Không đoán ngày tương lai. | |
| Deficit + Gợi ý mức estimate tối đa vừa vặn | Hiển thị Deficit và gợi ý giảm Scope/Estimate (ví dụ: 'Để vừa hạn chót này, hãy giảm estimate xuống tối đa 4h45m'). | |

**User's choice:** Deficit + Gợi ý ngày sớm nhất có thể xong (Recommended)
**Notes:** Dự báo ngày sớm nhất giúp định hướng dời hạn chót có căn cứ.

### Question 2: Phân bổ một phần (Partial Allocation) khi Infeasible
| Option | Description | Selected |
|--------|-------------|----------|
| Cho phép phân bổ phần khả dụng + Cảnh báo (Recommended) | Cho phép nút 'Phân bổ tối đa phần khả dụng (Xh Ym)'. Candidate allocations được tạo lấp đầy phần khả dụng, cảnh báo phần còn thiếu sẽ cần lên lịch sau. Không bao giờ tự ý gây overload. | ✓ |
| Chặn hoàn toàn nếu Infeasible | Khóa hoàn toàn nút phân bổ. Feasible = false thì không sinh candidate allocations. | |
| Cho phép ép phân bổ dù gây overload | Vẫn tạo phân bổ đủ 100% estimate nhưng chấp nhận làm quá tải (overload) các ngày được chọn. | |

**User's choice:** Cho phép phân bổ phần khả dụng + Cảnh báo (Recommended)
**Notes:** Tối ưu hóa thời gian thực tế: cho phép lên lịch phần làm được trước mà không làm hỏng dữ liệu quá tải.

### Question 3: Cách trình bày phân tích các ngày (CALC-04)
| Option | Description | Selected |
|--------|-------------|----------|
| Tóm tắt tổng quan + Bảng chi tiết từng ngày (Recommended) | Hiển thị danh sách/bảng ngày gọn gàng với status tag (Available, Full, Overloaded, Excluded-Holiday/Weekend), số giờ netBalance còn lại. Kèm thanh tổng hợp tóm tắt. | ✓ |
| Chỉ hiển thị card số liệu tổng quan | Chỉ hiển thị tóm tắt tổng quan dạng card metrics, không hiển thị danh sách từng dòng. | |
| Lịch mini mã màu (Calendar Heatmap) | Hiển thị dưới dạng lịch tuần/tháng thu nhỏ với mã màu trên từng ô ngày. | |

**User's choice:** Tóm tắt tổng quan + Bảng chi tiết từng ngày (Recommended)
**Notes:** Cung cấp cả góc nhìn tổng hợp số lượng ngày và khả năng inspect sâu từng ngày.

### Question 4: Lối tắt hành động (Action Shortcuts) khi Infeasible
| Option | Description | Selected |
|--------|-------------|----------|
| Bộ 3 Action Shortcuts (Nới ngày, Override, Sửa estimate) (Recommended) | Nút 'Mở rộng đến ngày gợi ý' (tự động cập nhật khoảng ngày sang Earliest Feasible Date và tính lại tức thì); nút 'Thêm Override tăng giờ' (mở nhanh modal chỉnh capacity); nút 'Chỉnh Estimate'. | ✓ |
| Chỉ nút 'Áp dụng ngày gợi ý' | Chỉ có một nút duy nhất: 'Áp dụng ngày gợi ý' để mở rộng khoảng ngày đánh giá tới Earliest Feasible Date. | |
| Không cung cấp shortcut | Không có shortcut; user tự đóng modal để điều chỉnh ở các view khác. | |

**User's choice:** Bộ 3 Action Shortcuts (Nới ngày, Override, Sửa estimate) (Recommended)
**Notes:** Giúp khắc phục nhanh tình trạng thiếu dung lượng ngay tại chỗ.

---

## Review & Confirmation UI

### Question 1: Vị trí kích hoạt tính năng (Entry Points)
| Option | Description | Selected |
|--------|-------------|----------|
| TaskDrawer + Toolbar Planner/Tasks (Recommended) | Đặt nút nổi bật '✨ Feasibility & Auto-Distribute' ngay trong TaskDrawer (mục Planning) cho task đang xem; đồng thời có nút trên thanh toolbar PlannerView/TasksView để chọn nhanh task cần tính. | ✓ |
| Chỉ tích hợp trong TaskDrawer | Chỉ tích hợp bên trong TaskDrawer (phần Planning). | |
| Trang riêng (Dedicated View) | Mở một trang màn hình độc lập (route riêng /#/feasibility) để phân tích chuyên sâu. | |

**User's choice:** TaskDrawer + Toolbar Planner/Tasks (Recommended)
**Notes:** Dễ tiếp cận từ mọi màn hình quản lý công việc và kế hoạch.

### Question 2: Hình thức container giao diện
| Option | Description | Selected |
|--------|-------------|----------|
| Modal chuyên dụng (FeasibilityModal) (Recommended) | Dùng Modal chuyên dụng (`FeasibilityModal`, width ~720px) với các bước: Chọn khoảng ngày & chiến lược -> Kết quả Feasible/Infeasible -> Bảng Candidate Review -> Nút 'Apply Allocations'. | ✓ |
| Nhúng thẳng vào TaskDrawer hiện tại | Nhúng trực tiếp một Card/Section có thể thu gọn mở rộng ngay bên trong TaskDrawerPlanning. | |
| Drawer toàn màn hình | Mở một Drawer phụ toàn màn hình (Fullscreen Drawer) che toàn bộ view cũ. | |

**User's choice:** Modal chuyên dụng (FeasibilityModal) (Recommended)
**Notes:** Không gian đủ rộng để hiển thị bảng phân bổ và các số liệu phân tích rõ ràng.

### Question 3: Tinh chỉnh trên bảng Candidate Allocations (CALC-06)
| Option | Description | Selected |
|--------|-------------|----------|
| Bảng tương tác: Checkbox + Sửa số phút (Recommended) | Bảng cho phép tích/bỏ chọn từng ngày (checkbox) VÀ chỉnh sửa số phút/giờ phân bổ trên từng ngày (InputNumber). Tổng phút phân bổ tự cập nhật theo thời gian thực. | ✓ |
| Chỉ cho phép bật/tắt ngày | Chỉ cho phép bật/tắt (checkbox) từng ngày, giữ nguyên số phút do thuật toán đề xuất. | |
| Read-only chỉ đọc + Nút Apply | Xem danh sách đề xuất dạng read-only, user chỉ có thể chọn 'Apply All' hoặc 'Hủy'. | |

**User's choice:** Bảng tương tác: Checkbox + Sửa số phút (Recommended)
**Notes:** Toàn quyền kiểm soát và điều chỉnh trước khi cam kết ghi vào cơ sở dữ liệu.

### Question 4: Phản hồi sau khi bấm Apply Allocations
| Option | Description | Selected |
|--------|-------------|----------|
| Thông báo thành công + Link xem Planner (Recommended) | Hiển thị notification/message thành công, đóng Modal, cập nhật tức thì dữ liệu reactive. Nếu đang ở TasksView, cung cấp nút link nhanh 'Xem trên Planner'. | ✓ |
| Tự động nhảy sang PlannerView | Đóng Modal và tự động chuyển hướng màn hình sang /#/planner tại đúng tuần chứa ngày phân bổ đầu tiên. | |
| Giữ nguyên Modal báo hoàn tất | Giữ nguyên Modal ở trạng thái 'Đã áp dụng thành công', không tự đóng. | |

**User's choice:** Thông báo thành công + Link xem Planner (Recommended)
**Notes:** Trải nghiệm mượt mà, thông báo rõ ràng kèm đường dẫn đến tuần làm việc tương ứng.

---

## Claude's Discretion

- Layout spacing, component decomposition (`FeasibilityModal`, `CandidateTable`, `DateBreakdownTable`).
- Architecture of pure math/algorithm module `src/utils/feasibility.ts`.

## Deferred Ideas

- Long-range dashboard views (7-day, 14-day, next-month forecast) (Phase 5).
- Multi-task batch auto-scheduling across entire milestone (v2).
- Automatic rebalancing of allocations on urgent task arrival (v2).
