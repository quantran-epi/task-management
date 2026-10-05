# Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 15-Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer
**Areas discussed:** UI & Navigation, Execution & Worktree, Diff Reviewer UX, Permission & Safety

---

## UI & Navigation

### Q1: Vị trí của Agent Control
| Option | Description | Selected |
|--------|-------------|----------|
| Main Sidebar Route | Thêm mục 'Agent Control' (kèm badge số agent đang chạy) trực tiếp trên Sidebar Navigation chính, chia sẻ layout AppShell. | ✓ |
| Tab in AIChatDrawer | Tích hợp thành một Tab mới ngay bên trong AIChatDrawer hiện tại (bên cạnh Chat tab). | |
| Popout Window | Mở một cửa sổ hệ điều hành độc lập (Tauri Multi-window Popout) như Timer/Notes Popout để để sang màn hình thứ hai. | |

**User's choice:** Main Sidebar Route  
**Notes:** Nhất quán với các phân hệ lớn khác trong app, tiện theo dõi tổng quan.

### Q2: Bố cục giao diện Agent Control
| Option | Description | Selected |
|--------|-------------|----------|
| Split Pane 3-Column | Cột trái: Danh sách agent. Khu vực chính chia 2 panel: Trái là Terminal log + Chat prompt, Phải là Live Diff Viewer. | ✓ |
| Tabbed Pane (Log / Diff) | Cột trái: Danh sách agent. Khu vực chính dùng Tabs chuyển đổi qua lại giữa 'Live Log' và 'Git Changes Diff'. | |

**User's choice:** Split Pane 3-Column  
**Notes:** Tận dụng tối đa màn hình desktop, xem code thay đổi song song khi AI đang chạy.

### Q3: Điều hướng sau khi bấm Run Ghost Dev
| Option | Description | Selected |
|--------|-------------|----------|
| Toast + Stay on Page | Hiện Toast/Notification thông báo 'Ghost Dev đã bắt đầu' kèm nút 'Xem trong Agent Control', người dùng vẫn ở lại trang hiện tại không bị gián đoạn. | ✓ |
| Auto-Navigate to Agent | Tự động điều hướng ngay lập tức sang trang Agent Control và chọn đúng agent vừa khởi tạo. | |

**User's choice:** Toast + Stay on Page  
**Notes:** Không ngắt quãng luồng công việc hiện tại của người dùng.

### Q4: Thông báo nền
| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar Badge + OS Alert | Hiển thị cả Badge đếm số agent đang chạy trên Sidebar + phát Desktop Notification OS khi agent hoàn thành hoặc cần user approve lệnh. | ✓ |
| Sidebar Badge Only | Chỉ hiển thị Badge số lượng trên Sidebar, không gửi notification ra ngoài hệ điều hành. | |

**User's choice:** Sidebar Badge + OS Alert  
**Notes:** Tận dụng plugin desktop notification sẵn có của app.

---

## Execution & Worktree

### Q1: Kiến trúc Multi-Agent trong 1 Task
| Option | Description | Selected |
|--------|-------------|----------|
| Subagent CLI tự nhiên | Tận dụng lệnh subagent ngầm của CLI. | |
| Hierarchical Master-Worker | PlannerMate quản lý trực tiếp mô hình Master (Opus/Sonnet) lập kế hoạch, Workers (Haiku/Sonnet) thực thi song song. | ✓ |

**User's choice:** Hierarchical Master-Worker (Level 2 architecture from the beginning)  
**Notes:** Người dùng yêu cầu hỗ trợ mô hình Master điều phối Workers với các model khác nhau ngay từ nền tảng ban đầu.

### Q2: Cơ chế cách ly Git
| Option | Description | Selected |
|--------|-------------|----------|
| Git Worktree Isolation | Tự động tạo Git Worktree/Branch riêng (`pm-agent/task-<id>`) cho mỗi task để các agent sửa code không làm bẩn branch chính. | ✓ |
| Direct Working Tree | Chạy trực tiếp trên Working Tree hiện tại của repo. | |

**User's choice:** Git Worktree Isolation  
**Notes:** Đảm bảo an toàn tuyệt đối, cho phép chạy song song nhiều task trên cùng repo.

### Q3: Giới hạn số Worker / Task
| Option | Description | Selected |
|--------|-------------|----------|
| Max 2 Workers / Task | Mặc định 1 Master + tối đa 2 Workers chạy song song cho 1 Task (tổng toàn app tối đa 6 processes). | ✓ |
| Sequential 1 Worker | Chỉ cho phép 1 Worker chạy tuần tự tại một thời điểm. | |
| Dynamic (No limit) | Không giới hạn số worker. | |

**User's choice:** Max 2 Workers / Task  
**Notes:** Cân bằng giữa sức mạnh tính toán song song và tài nguyên CPU/RAM.

### Q4: Cấu hình Model cho Master và Worker
| Option | Description | Selected |
|--------|-------------|----------|
| Settings Preset + Prompt Modal | Có bảng cấu hình Default Model cho Master & Workers trong Settings, kèm dropdown chọn nhanh trước khi bấm 'Start Ghost Dev'. | ✓ |
| Hardcoded Defaults | Cố định sẵn theo logic app: Master là Sonnet, Worker là Haiku. | |

**User's choice:** Settings Preset + Prompt Modal  
**Notes:** Linh hoạt thay đổi model theo nhu cầu từng task (task khó dùng Opus, task dễ dùng Haiku).

### Q5: Dừng tiến trình (Stop Action)
| Option | Description | Selected |
|--------|-------------|----------|
| Instant Hard Kill | Kill ngay lập tức toàn bộ Process Group (Master + mọi Worker đang chạy) qua SIGTERM/SIGKILL và dọn pipe buffers. | ✓ |
| Graceful with 10s Timeout | Chờ 10s để agent hoàn tất lệnh hiện tại rồi mới tắt. | |

**User's choice:** Instant Hard Kill  
**Notes:** Đảm bảo phản hồi ngay lập tức khi người dùng bấm dừng, tránh tốn thêm token không cần thiết.

### Q6: Cơ chế IPC điều phối Master - Worker
| Option | Description | Selected |
|--------|-------------|----------|
| Rust-Managed Tool Call | Master gọi tool `dispatch_subtask(role, task, model)` do Rust cung cấp; Rust spawn worker, đợi worker hoàn thành và trả output về cho Master. | ✓ |
| Shared JSON File in Worktree | Giao tiếp qua file trung gian `.plannermate/subtasks.json`. | |

**User's choice:** Rust-Managed Tool Call  
**Notes:** Tận dụng Rust quản lý stream và lifecycle chặt chẽ.

---

## Diff Reviewer UX

### Q1: Chế độ hiển thị Diff
| Option | Description | Selected |
|--------|-------------|----------|
| Toggle Side-by-side & Unified | Hỗ trợ cả 2 chế độ Side-by-side (2 cột) và Unified (1 cột), có nút toggle chuyển đổi nhanh. | ✓ |
| Unified Only | Chỉ dùng chế độ Unified Diff một cột duy nhất. | |
| Side-by-side Only | Chỉ dùng Side-by-side hai cột song song. | |

**User's choice:** Toggle Side-by-side & Unified  
**Notes:** Cho phép người dùng linh hoạt đổi chế độ tùy kích thước màn hình.

### Q2: Mức độ chi tiết Accept / Revert
| Option | Description | Selected |
|--------|-------------|----------|
| Per-File + All Actions | Cho phép duyệt/hủy theo từng file đơn lẻ VÀ nút 'Accept All' / 'Revert All' toàn bộ thay đổi. | ✓ |
| Batch All Only | Chỉ hỗ trợ cấp độ toàn bộ task: 'Accept All' hoặc 'Revert All'. | |

**User's choice:** Per-File + All Actions  
**Notes:** Linh hoạt khi chỉ muốn nhận 1 phần thay đổi code.

### Q3: Phản hồi trên Diff (Inline Feedback)
| Option | Description | Selected |
|--------|-------------|----------|
| Click to Comment on Diff | Cho phép bấm vào dòng code bất kỳ trên Diff để gõ comment feedback; câu hỏi được gửi thẳng vào Agent chat kèm ngữ cảnh `file:line`. | ✓ |
| Chat Input Only | Chỉ dùng ô Chat Input ở cột giữa để gõ prompt phản hồi chung. | |

**User's choice:** Click to Comment on Diff  
**Notes:** Trải nghiệm hiện đại tương tự GitHub PR review / Copilot.

### Q4: Hành vi khi Accept All
| Option | Description | Selected |
|--------|-------------|----------|
| Commit + Merge Prompt | Commit trên worktree branch với commit message tự sinh, hiển thị nút 'Merge to Current Branch' hoặc 'Copy Branch Name'. | ✓ |
| Direct Auto-Merge | Tự động merge thẳng vào branch chính đang checkout của user. | |
| Apply Changes (No commit) | Chỉ copy các file đã sửa sang thư mục gốc. | |

**User's choice:** Commit + Merge Prompt  
**Notes:** Giữ lịch sử commit rõ ràng và cho người dùng quyền quyết định lúc merge.

---

## Permission & Safety

### Q1: Chính sách cấp quyền
| Option | Description | Selected |
|--------|-------------|----------|
| Auto Edit, Confirm Shell | Tự động duyệt đọc/sửa file trong repo; CHỈ hiện popup xin quyền khi Agent chạy lệnh Shell/Bash (npm, cargo, rm, v.v.). | ✓ |
| Strict (Confirm All) | Mọi thao tác sửa file hay chạy bash đều phải hiện banner xin phép Approve/Deny. | |
| Full Autonomous | Chạy hoàn toàn tự động (--dangerously-skip-permissions) không bao giờ hỏi. | |

**User's choice:** Auto Edit, Confirm Shell  
**Notes:** Tránh phiền toái khi sửa file thông thường trong worktree nhưng vẫn kiểm soát lệnh shell an toàn.

### Q2: Chính sách Timeout chờ cấp quyền
| Option | Description | Selected |
|--------|-------------|----------|
| Pause Indefinitely | Tạm dừng vô thời hạn (Pause), giữ nguyên tiến trình trong trạng thái chờ cho đến khi người dùng quay lại bấm quyết định. | ✓ |
| Auto-Deny after 5 mins | Tự động Deny sau 5 phút không phản hồi. | |

**User's choice:** Pause Indefinitely  
**Notes:** Đảm bảo không bị hủy ngang việc khi người dùng rời khỏi bàn làm việc.

### Q3: Whitelist lệnh Shell an toàn
| Option | Description | Selected |
|--------|-------------|----------|
| Whitelist Safe Commands | Hỗ trợ danh sách Whitelist (mặc định tự cho phép các lệnh test và read-only như `npm test`, `git status/diff`, `cargo check`), các lệnh khác mới phải hỏi. | ✓ |
| Prompt Every Command | Không dùng whitelist, bất kỳ lệnh Shell nào cũng phải hiện popup bắt người dùng bấm Approve. | |

**User's choice:** Whitelist Safe Commands  
**Notes:** Giảm bớt số lần phải bấm duyệt đối với các lệnh test/status vô hại.

### Q4: Thoát ứng dụng đột ngột
| Option | Description | Selected |
|--------|-------------|----------|
| Kill Clean + Keep Worktree | Tự động Kill sạch các process con chống rò rỉ RAM, lưu trạng thái 'Interrupted' vào DB và giữ nguyên Git Worktree để có thể Resume lần sau. | ✓ |
| Kill + Delete Worktree | Kill process và tự động xóa luôn Git Worktree để dọn dẹp sạch ổ cứng. | |

**User's choice:** Kill Clean + Keep Worktree  
**Notes:** Bảo toàn kết quả làm việc dở dang, không làm mất code.

---

## Claude's Discretion

- Rust batching IPC events lên React mỗi 50-100ms để giữ 60 FPS.
- Thư viện render Diff tương thích theme Ant Design (Monaco Diff Editor hoặc giải pháp nhẹ).
- Vị trí lưu trữ folder Git Worktree cô lập (`.plannermate/worktrees/task-<id>`).

## Deferred Ideas

- Chạy Agent trên Remote Cloud server.
- Prompt agent bằng giọng nói (Voice input).
- Tự động tạo Pull Request trên GitHub/GitLab.