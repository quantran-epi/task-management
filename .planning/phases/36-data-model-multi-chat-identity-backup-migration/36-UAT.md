---
status: complete
phase: 36-data-model-multi-chat-identity-backup-migration
source: [36-VERIFICATION.md]
started: 2026-11-11T00:10:00Z
updated: 2026-11-11T06:39:11.948Z
---

## Current Test

[testing complete]

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
  1. Panel trái → AI Staff (Alt+8) → nút "Thêm Nhân viên AI" (dấu +) → tạo A.
  2. Cùng panel → nút "Thêm Lead AI" (vương miện) → tạo L.
  3. Panel trái → AI Office (Alt+7) → nút "+" → "Tạo nhóm" → mở nhóm → "Cài đặt nhóm" → Leader = L, "Thêm nhân viên" = A → đóng drawer.
  4. Chuột phải dòng L trong AI Staff → menu "Xóa" → hộp xác nhận "Xóa".
  5. Đọc alert. Đóng alert. Kiểm tra L vẫn còn trong danh sách.
  6. Gỡ A khỏi nhóm (Cài đặt nhóm) rồi chuột phải A → "Xóa" → "Xóa" → A phải biến mất, không alert.
expected: Bước 4–5: xoá L bị từ chối, alert đọc được nêu tên nhóm, không UUID, L vẫn còn. Bước 6: xoá A thành công, row mất, không alert.
why_human: AIO-GROUP-05 / C-15 require the refusal to be observable in the real UI, not only asserted in jsdom.
result: pass

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
result: pass

### 4. SQLite flush accepts the new tables
steps:
  1. Settings → card "Lưu cục bộ SQLite cho desktop" → "Chọn tệp SQLite" → trỏ tới một file `.sqlite` mới.
  2. Trong app: mở một chat tab, sửa một change request, tạo một row `aiSkillVersions` (DevTools console như test 3).
  3. Bấm "Ghi ngay", đợi "Lần ghi gần nhất" cập nhật.
  4. `sqlite3 <path>` → `.tables` và `select name from planner_rows where name in ('aiSkillVersions','chatTabs','systems','changeRequests');`
  5. Tìm `SQLITE_INVALID_TABLE` trong log app.
expected: Không có `SQLITE_INVALID_TABLE`; 4 bảng trên có row trong file `.sqlite`.
why_human: The Rust allowlist only takes effect in a Tauri build; the parity test is static.
result: skipped
reason: "Deferred follow-up: policy máy host không cho dùng SQLite — không thể tạo đường dẫn SQLite trong Settings. Chạy lại trên máy cho phép SQLite."

### 5. Optional: Rust allowlist test
steps:
  1. `cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence`
  2. Nếu build lỗi do fixture, ghi lại lỗi kèm tên test.
expected: Test `sqlite_persistence` pass. Fixture đã chuyển sang seed `notes` thay cho `projects`/`milestones` (IN-04, quick 261111-d2p) nhưng chưa từng compile — cần một lần cargo thật.
why_human: `src-tauri/target/` does not exist; the first build compiles rusqlite bundled + vendored openssl.
result: skipped
reason: "Deferred follow-up: first cargo build compiles bundled rusqlite + vendored openssl (~5–15 min); run it before the first desktop release, not as a UAT gate."

## Summary

total: 5
passed: 3
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

- gap_id: G-36-2
  truth: "Each delete (lead of an active group, agent on a roster, skill assigned to an agent) is refused with a readable alert naming the groups/agents; no row disappears; no UUID shown."
  status: resolved
  reason: "User reported: làm gì có nút xóa trên UI"
  severity: major
  test: 2
  note: "Fixed inline by commit 3ed9ab7c, not by a gap-closure plan — no resolved_by. AiStaffExplorer gained a per-row context menu calling deleteLead/deleteEmployee with the shared refusal alert; retested on a real build: refused lead names the team and stays, unreferenced employee deletes with no alert. The skill-delete leg stays unverified: no reachable UI creates or assigns a skill in the IntelliJ shell, so it is not part of the retested steps."
  artifacts:
    - path: "src/workbench/toolwindows/AiStaffExplorer.tsx"
      issue: "FIXED — context menu 'Xóa' → deleteLead/deleteEmployee, refusal Alert names teams/agents"
    - path: "src/components/ai/office/deleteRefusalMessage.ts"
      issue: "Shared refusal copy, used by both the explorer and AiOfficeView"
  missing: []
