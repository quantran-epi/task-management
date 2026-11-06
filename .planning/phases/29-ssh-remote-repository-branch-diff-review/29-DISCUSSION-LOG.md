# Phase 29: SSH Remote Repository Branch & Diff Review - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 29-SSH Remote Repository Branch & Diff Review
**Areas discussed:** SSH Profile & Repo Targeting, Branch Resolution & Git Status, Review UI Layout & Diff Preview, Snapshot Approval & Handoff

---

## 1. SSH Profile & Repo Targeting

| Option | Description | Selected |
|--------|-------------|----------|
| Per-Project Binding | Lưu sshConfigId và remoteRepoPath vào project metadata trong Dexie DB; khi mở Step 3 thì tự động bind sẵn profile và path đã chọn. | ✓ |
| Manual Selection mỗi lần | Mỗi lần mở Step 3 của CR thì người dùng tự chọn profile SSH từ dropdown và nhập repo path thủ công. | |
| Global Default Profile | Chỉ dùng một SSH Profile mặc định duy nhất trong toàn hệ thống Settings cho mọi project. | |

**User's choice:** Per-Project Binding
**Notes:** Giữ trải nghiệm mượt mà, không phải nhập lại host và path nhiều lần khi làm việc trên cùng một repository.

---

## 2. Base Branch Determination

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect với Default | Tự động dò origin/main hoặc origin/develop (hoặc config base branch trong Project/CR metadata, mặc định origin/main). | ✓ |
| Bắt buộc chọn thủ công | Bắt buộc người dùng nhập hoặc chọn Base branch thủ công trên UI trước khi so sánh diff. | |
| Fixed Hardcode | Luôn hardcode so sánh với origin/master hoặc HEAD~1. | |

**User's choice:** Auto-detect với Default
**Notes:** Mặc định origin/main, có thể tùy biến khi cần so sánh với branch khác.

---

## 3. Branch Resolution & Git Status

| Option | Description | Selected |
|--------|-------------|----------|
| Auto feature/{crCode} + Fallback | Ưu tiên tìm nhánh `feature/{crCode}` trên remote repo; nếu không thấy thì fallback về HEAD hiện tại, kèm dropdown cho phép chọn hoặc nhập nhánh khác. | |
| Dropdown Remote Branch Selection | Tự động fetch danh sách branch từ remote git và cho phép user pick từ dropdown. | ✓ |
| Current HEAD only | Chỉ kiểm tra HEAD hiện tại của repo từ xa, không cần tìm theo tên feature/{crCode}. | |
| Strict Manual Branch | Bắt buộc người dùng phải gõ chính xác tên nhánh từ xa. | |

**User's choice:** Dropdown Remote Branch Selection
**Notes:** Người dùng yêu cầu phải fetch danh sách branch và cho user chọn từ dropdown, không bắt nhập tay.

---

## 4. Uncommitted Changes (Dirty Working Tree)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn + Cho phép Review | Cảnh báo rõ ràng trên UI (danh sách uncommitted files) nhưng vẫn cho phép review commit diff đã commit, kèm tùy chọn xem cả staged/unstaged diff. | ✓ |
| Block khi Dirty | Chặn hoàn toàn: yêu cầu repo remote phải sạch sẽ (clean working tree) mới cho phép review và duyệt sang Step 4. | |
| Bỏ qua hoàn toàn | Bỏ qua kiểm tra status, chỉ chạy lệnh git log/diff giữa các commit. | |

**User's choice:** Warn + Cho phép Review
**Notes:** Không cản trở developer nếu đang dở tay vài file chưa commit, nhưng cảnh báo rõ ràng để tránh sót thay đổi.

---

## 5. Review UI Layout & Diff Preview

| Option | Description | Selected |
|--------|-------------|----------|
| Split View 2 Cột + Resizable + Fullscreen | Chia 2 cột/panel (trái: timeline & file tree; phải: diff preview) có thể kéo chỉnh kích thước (resizable) và có nút phóng to Fullscreen. | ✓ |
| Tabbed Panels | Dạng Tabs: Tab 1 xem Commit Log, Tab 2 xem File List, Tab 3 xem Toàn bộ Diff liên tục. | |
| Modal Popup per file | Dạng Modal popup: Bấm vào từng file trên danh sách thì mở modal xem diff riêng. | |

**User's choice:** Split View 2 Cột + Resizable + Fullscreen
**Notes:** Người dùng đặc biệt nhấn mạnh 2 cột/panel phải có thể resize và hỗ trợ chế độ xem toàn màn hình (fullscreen modal).

---

## 6. Diff Viewer Display & Sizing

| Option | Description | Selected |
|--------|-------------|----------|
| Unified + Split + Cap | Hỗ trợ toggle xem Unified (gộp dòng) hoặc Split (side-by-side 2 bên), hiển thị syntax highlight và giới hạn file lớn (> 1MB / > 5000 dòng có nút 'Load full'). | ✓ |
| Unified Plain Monospace | Chỉ hiển thị Unified diff đơn giản với nền xanh đỏ (monospaced text) giống git diff console. | |
| Fixed Split Side-by-Side | Chỉ hiển thị Split (side-by-side) cố định. | |

**User's choice:** Unified + Split + Cap
**Notes:** Linh hoạt chuyển đổi giữa Unified và Split xem mã nguồn dễ dàng, bảo vệ hiệu năng UI khi gặp file diff cực lớn.

---

## 7. Branch Snapshot Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Persist in CR State | Lưu Branch Snapshot ({ base, head, branch, commitShas, fileStats, approvedAt }) vào CR state/Dexie DB; đánh dấu Step 3 đã Duyệt (Approved). | ✓ |
| In-memory Transient State | Chỉ giữ trong React state in-memory của phiên làm việc hiện tại, reload lại trang thì phải bấm duyệt lại. | |
| Remote File on Server | Tạo một file commit-snapshot.json trực tiếp trên server remote qua SFTP/SSH. | |

**User's choice:** Persist in CR State
**Notes:** Bền vững trên client, tuân thủ nguyên tắc local-first và IndexedDB canonical storage của TaskMate.

---

## 8. Remote HEAD Drift Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Warn + Re-inspect CTA | Hiện banner cảnh báo "Remote HEAD đã thay đổi so với Snapshot đã duyệt" kèm nút 'Re-inspect & Cập nhật Snapshot' nhưng không xóa trắng tiến độ. | ✓ |
| Strict Invalidate & Lock Step 4 | Hủy hoàn toàn trạng thái duyệt của Step 3, buộc người dùng phải xem lại diff từ đầu và duyệt lại mới được vào Step 4. | |
| Ignore Remote Drift | Không kiểm tra lại, giữ nguyên snapshot cũ bất kể remote có push commit mới hay không. | |

**User's choice:** Warn + Re-inspect CTA
**Notes:** Cảnh báo trung thực khi có commit mới đẩy lên remote sau khi duyệt, cho phép re-inspect nhanh.

---

## Claude's Discretion

- Chi tiết thanh kéo co giãn (resize handle/splitter) giữa 2 panel.
- Badge và màu sắc thể hiện trạng thái file git (A - xanh lá, M - vàng/xanh dương, D - đỏ).
- Hàm bọc lệnh shell an toàn cho `ssh_exec_command`.

## Deferred Ideas

None — thảo luận tập trung đúng phạm vi Phase 29.
