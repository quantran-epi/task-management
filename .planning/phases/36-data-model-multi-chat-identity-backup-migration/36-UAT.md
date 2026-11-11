---
status: testing
phase: 36-data-model-multi-chat-identity-backup-migration
source: [36-VERIFICATION.md]
started: 2026-11-11T00:10:00Z
updated: 2026-11-11T00:20:00Z
---

## Current Test

number: 3
name: Export → restore keeps attribution and pending state
expected: |
  Attribution and targetAgentId intact, the pending version still pending, counts match.
awaiting: user response

## Tests

### 1. Leader lock survives relaunch
steps:
  1. Văn phòng AI → "Tạo lead" (L) và "Tạo nhân viên" (A).
  2. Nhóm AI → "Tạo nhóm" → chỉ nhập "Tên nhóm" → lưu.
  3. Mở nhóm → "Cài đặt nhóm" → chọn Leader = L → đóng drawer.
  4. Gửi một tin nhắn bất kỳ trong workspace nhóm.
  5. Kiểm tra select "Leader" đã bị disable.
  6. Thoát app (đóng cửa sổ Tauri) rồi mở lại, vào lại nhóm.
  7. DevTools → IndexedDB → bảng `aiTeams` → row của nhóm vẫn còn `leaderLockedAt`.
expected: Select Leader bị disable ngay sau lần gửi đầu; sau relaunch select vẫn disable và row `aiTeams` vẫn giữ `leaderLockedAt`.
why_human: D-09 requires the lock to survive a real process restart; jsdom cannot prove Tauri relaunch durability.
result: pass

### 2. Delete refusals are readable in the real UI
steps:
  1. Văn phòng AI (tab Nhân viên) → tạo A. Sang tab Kỹ năng → tạo S. Sửa A → gán kỹ năng S.
  2. Văn phòng AI (tab Lead) → tạo L.
  3. Nhóm AI → "Tạo nhóm" → "Cài đặt nhóm" → Leader = L, "Thêm nhân viên" = A → đóng drawer.
  4. Xoá L: Văn phòng AI → tab Lead → nút "Xóa" (chữ đỏ, góc phải dưới card, cạnh "Sửa") → "Xóa".
  5. Xoá A: tab Nhân viên → nút "Xóa" trên card A → "Xóa".
  6. Xoá S: tab Kỹ năng → nút "Xóa" trên card S → "Xóa".
  7. Sau mỗi lần: đóng alert, kiểm tra card vẫn còn.
expected: Cả 3 lần xoá bị từ chối, alert đọc được nêu tên nhóm/nhân viên liên quan, không hiện UUID, không card nào biến mất.
why_human: AIO-GROUP-05 / C-15 require the refusal to be observable in the real UI, not only asserted in jsdom.
result: issue
reported: "làm gì có nút xóa trên UI"
severity: major

### 3. Export → restore keeps attribution and pending state
steps:
  1. Tạo nhóm có leader + nhân viên, gửi 2–3 tin để có transcript.
  2. Tạo row `aiSkillVersions` status `pending` + một instruction có `targetAgentId` — chưa có UI (D-16), nên chạy DevTools console gọi `createSkillVersion`, hoặc `scripts/simulate-chat-turn.ts`.
  3. Settings → "Sao lưu dữ liệu" → "Xuất bản sao lưu (JSON)" → lưu file.
  4. Xoá nhóm: panel trái AI Office → nút thùng rác trên dòng nhóm → "Xóa". Nhóm, transcript và tab chat biến mất.
  5. Settings → card nhập JSON → kéo thả file vừa xuất → xác nhận nhập.
  6. Mở lại nhóm + Văn phòng AI, đối chiếu file JSON (attribution, `targetAgentId`, status).
expected: Sau bước 4 nhóm không còn trong danh sách; sau bước 5 nhóm trở lại với attribution và `targetAgentId` nguyên vẹn, version vẫn `pending` (không `decidedAt`), số row khớp file xuất.
why_human: AIO-DATA-02/03 need the real filesystem + process path, not the in-memory envelope.
result: [pending]

### 4. SQLite flush accepts the new tables
steps:
  1. Settings → card "Lưu cục bộ SQLite cho desktop" → "Chọn tệp SQLite" → trỏ tới một file `.sqlite` mới.
  2. Trong app: mở một chat tab, sửa một change request, tạo một row `aiSkillVersions` (DevTools console như test 3).
  3. Bấm "Ghi ngay", đợi "Lần ghi gần nhất" cập nhật.
  4. `sqlite3 <path>` → `.tables` và `select name from planner_rows where name in ('aiSkillVersions','chatTabs','systems','changeRequests');`
  5. Tìm `SQLITE_INVALID_TABLE` trong log app.
expected: Không có `SQLITE_INVALID_TABLE`; 4 bảng trên có row trong file `.sqlite`.
why_human: The Rust allowlist only takes effect in a Tauri build; the parity test is static.
result: [pending]

### 5. Optional: Rust allowlist test
steps:
  1. `cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence`
  2. Nếu build lỗi do fixture, ghi lại lỗi kèm tên test.
expected: Test `sqlite_persistence` pass. Fixture đã chuyển sang seed `notes` thay cho `projects`/`milestones` (IN-04, quick 261111-d2p) nhưng chưa từng compile — cần một lần cargo thật.
why_human: `src-tauri/target/` does not exist; the first build compiles rusqlite bundled + vendored openssl.
result: [pending]

## Summary

total: 5
passed: 1
issues: 1
pending: 3
skipped: 0
blocked: 0

## Gaps

- gap_id: G-36-2
  truth: "Each delete (lead of an active group, agent on a roster, skill assigned to an agent) is refused with a readable alert naming the groups/agents; no row disappears; no UUID shown."
  status: failed
  reason: "User reported: làm gì có nút xóa trên UI"
  severity: major
  test: 2
  artifacts:
    - path: "src/workbench/TitleBar.tsx"
      issue: "No view button opens the 'agents' or 'teams' tab; only dashboard/tasks/planner/telegram/analytics are reachable"
    - path: "src/workbench/WorkbenchLayout.tsx"
      issue: "handleOpenView maps 'agents'/'teams' titles but no caller requests those keys"
    - path: "src/components/palette/CommandPaletteModal.tsx"
      issue: "No AI Office entry in the command palette"
    - path: "src/workbench/toolwindows/AiOfficeExplorer.tsx"
      issue: "Team list has create/open only — no delete affordance"
    - path: "src/workbench/toolwindows/AiStaffExplorer.tsx"
      issue: "Staff list opens a detail tab — no delete affordance"
    - path: "src/views/AiOfficeView.tsx"
      issue: "Delete buttons + refusal alert live here, but the view renders only for unreachable viewType 'agents'/'teams'"
  missing: []
