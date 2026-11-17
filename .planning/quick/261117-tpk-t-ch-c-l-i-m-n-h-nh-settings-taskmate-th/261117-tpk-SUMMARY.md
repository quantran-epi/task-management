---
phase: quick-261117-tpk
plan: '01'
subsystem: ui
tags: [settings, antd, react, ui-arrangement, dexie, regression-lock]
requires: []
provides:
  - "SettingsView data/ai/ssh tabs được gom thành nhóm có tiêu đề, giữ nguyên 100% card/prop/logic"
  - "Audit file khóa baseline + gate cơ khí chứng minh diff chỉ là sắp xếp UI"
  - "4 test mới khóa 6 tab, tab mặc định capacity, số card và callback wiring"
affects: [SettingsView, tests/views/SettingsView.test.tsx]
actuals:
  tokens: 3821
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - "Section headings là sibling Typography.Text trong cùng <Space>, KHÔNG bọc card trong wrapper — tránh làm hỏng useLiveQuery/IndexedDB timing của card con"
    - "Gate diff: forbidden-file pathspec + grep identifier logic trên diff -U0"
key-files:
  created:
    - .planning/quick/261117-tpk-t-ch-c-l-i-m-n-h-nh-settings-taskmate-th/261117-tpk-settings-audit.md
  modified:
    - src/views/SettingsView.tsx
    - tests/views/SettingsView.test.tsx
key-decisions:
  - "Dùng sibling section heading thay vì Card wrapper: A/B chứng minh bất kỳ wrapper nào quanh GitHubSyncCard làm pre-existing remote-pull test đỏ; heading sibling giữ nguyên cây component"
  - "Không đụng OracleAiToolConfigCard.tsx; chỉ ghi chú cú pháp SQLcl password có dấu @ vào audit theo chỉ thị coordinator"
  - "Tiêu đề nhóm mới tránh exact-match với mọi chuỗi test đang truy vấn"
requirements-completed: []
duration: ~30 min
completed: 2026-11-17
status: complete
---

# Quick 261117-tpk: Tổ chức Settings thành nhóm chức năng Summary

**8 tiêu đề nhóm sibling được chèn vào 3 tab data/ai/ssh của SettingsView, khóa bằng 4 test mới, trong khi mọi card/prop/storage key/handler giữ nguyên byte-for-byte**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-11-17T21:32:00Z
- **Completed:** 2026-11-17T22:02:41Z
- **Tasks:** 3/3
- **Files modified:** 3 (1 audit + 1 source + 1 test)
- **Plan metadata commit:** không tạo (coordinator commit docs artifacts)
- **Baseline HEAD:** `bccd832f` (clean src/tests diff, tsc exit 0, 5/5 test pass)

## Accomplishments

- Tab `data`: thêm 3 tiêu đề nhóm `Sao lưu & khôi phục`, `Đồng bộ GitHub`, `Lưu trữ & môi trường` — phân nhóm 9 card mà không đổi prop hay thứ tự render.
- Tab `ai`: thêm 3 tiêu đề nhóm `Quy ước & công cụ AI`, `Trợ lý & Ghost Dev`, `Ngân sách & Knowledge` — gom 8 card.
- Tab `ssh`: thêm 2 tiêu đề nhóm `Kết nối SSH`, `Phân loại hệ thống`.
- `capacity`/`jira`/`notifications` giữ nguyên; 6 tab key/label/icon/thứ tự, `defaultActiveTab='capacity'`, mọi handler và storage key byte-identical.
- Production diff: đúng 8 dòng THÊM trong `src/views/SettingsView.tsx`, 0 dòng xóa; 93 dòng test mới (0 xóa); forbidden-file diff rỗng.
- 9/9 focused test pass, `npx tsc --noEmit` exit 0; gate Task 3 xanh và ghi nhận vào audit.

## Task Commits

1. **Task 1: Kiểm toán baseline** - `d224b294` (chore) — khóa 6 tab/card/prop + baseline sạch + vùng cấm trùng text + ghi chú SQLcl.
2. **Task 2: Tổ chức SettingsView + test** - `d576d17e` (feat) — 8 tiêu đề nhóm sibling + 4 test locking, UI-only.
3. **Task 3: Gate kiểm toán cuối** - `3378d2f6` (chore) — append dòng xác nhận "diff only UI arrangement, zero config/behavior change".

## Files Created/Modified

- `src/views/SettingsView.tsx` — 8 dòng `Typography.Text strong` tiêu đề nhóm; KHÔNG đổi import/state/handler/prop/modal.
- `tests/views/SettingsView.test.tsx` — thêm import `KnowledgeConfigProvider` + 4 test mới (tabs/default, data cards, ai cards, ssh cards); 5 test cũ nguyên vẹn.
- `.planning/quick/.../261117-tpk-settings-audit.md` — artifact append-only: baseline, danh sách cam kết, vùng cấm text, ranh giới file, ghi chú SQLcl, kết quả gate.

## Decisions Made

- Section heading là **sibling** trong `<Space>` chứ không bọc nhóm bằng `<Card>`/`<div>`: kết quả A/B (xem Issues) cho thấy bất kỳ wrapper nào cũng làm pre-existing remote-pull test đỏ.
- Không sửa `src/components/settings/OracleAiToolConfigCard.tsx`; ghi chú cú pháp `user/"pass@word"@host:port/service` (SQLcl parse đúng, `\@` không hoạt động) vào audit theo chỉ thị coordinator.
- Dùng `queryAllByText` cho `Knowledge Server` (15 lần) và `Loại hệ thống` (3 lần) để tránh `getByText` trùng khớp.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrapper approach trong plan làm pre-existing test đỏ**
- **Found during:** Task 2 (chạy `<verify>`第一次)
- **Issue:** Plan gợi ý bọc nhóm bằng `Card`/`Divider`/`Typography`. Mọi thử wrapper (antd `Card`, plain `<div>`) đều làm test `coordinates remote pull into ImportPreviewModal...` đỏ ở `expect(btn).toBeEnabled()`, dù thân test và logic SettingsView không đổi. A/B kiểm soát: HEAD source + test mới → remote-pull PASS; HEAD source + comment trivial → PASS; source có wrapper → FAIL. Nguyên nhân: wrapper thay đổi cây mount/timing của `GitHubSyncCard` (`useLiveQuery` đọc `github_owner`/`github_repo`), làm button không enable trong test.
- **Fix:** Bỏ hẳn wrapper; chèn 8 tiêu đề nhóm dạng sibling `Typography.Text strong` ngay trước card đầu nhóm. Vẫn đúng mục tiêu "nhóm/sắp xếp + tiêu đề", vẫn UI-only, không đụng logic/prop/key.
- **Files modified:** `src/views/SettingsView.tsx`
- **Verification:** 9/9 focused test pass (kể cả remote-pull), tsc exit 0, diff source = 8 dòng thêm / 0 xóa, logic-line gate sạch.
- **Committed in:** `d576d17e`

**2. [Rule 3 - Blocking] Test ai-tab thiếu KnowledgeConfigProvider**
- **Found during:** Task 2 (test mới render `defaultActiveTab="ai"`)
- **Issue:** `KnowledgeServerConfigCard` gọi `useKnowledgeConfig()` → throw `useKnowledgeConfig requires KnowledgeConfigProvider` khi mount trực tiếp.
- **Fix:** Import và bọc riêng test ai-tab bằng `<KnowledgeConfigProvider db={db}>`, theo pattern của `tests/knowledge/KnowledgeServerConfigCard.test.tsx`. Không đổi production.
- **Files modified:** `tests/views/SettingsView.test.tsx`
- **Verification:** Test ai-tab pass; KnowledgeConfigProvider đúng chữ ký `db={db}`.
- **Committed in:** `d576d17e`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 UI-timing, 1 Rule 3 test harness)
**Impact on plan:** Cả hai đều trong phạm vi UI/test, không chạm cấu hình/storage/logic. Mục tiêu plan đạt đúng; gate owner ("diff only UI arrangement") xanh. Plan gợi ý wrapper là gợi ý ("có thể tinh chỉnh"), không phải hard must-have — must-have là "nhóm/sắp xếp + tiêu đề", vẫn thỏa mãn.

## Issues Encountered

- Flaky remote-pull test khi chạy isolated đã được điều tra triệt để bằng A/B 6 lần; kết luận: không phải flake ngẫu nhiên mà là hệ quả xác định của việc bọc card.Đã đổi thiết kế sang sibling heading và xác nhận ổn định 9/9 ở lần chạy cuối (36.39s).
- Không chạy full suite theo quy tắc dự án (memory: full vitest >1 tiếng); chỉ chạy `tests/views/SettingsView.test.tsx`.

## Known Stubs

None.

## Threat Flags

None — không có endpoint/auth/file-access/schema mới; chỉ thêm text heading trong compose view.

## User Setup Required

None. Ghi chú cho user (không phải setup): password Oracle chứa `@` dùng cú pháp `user/"pass@word"@host:port/service`; `\@` không hoạt động. Chi tiết trong file audit.

## Next Phase Readiness

- Sẵn sàng: màn hình Settings có nhóm rõ ràng ở 3 tab từng phẳng; regression lock 9 test xanh.
- Không có blocker. Orchestrator cần commit các docs artifact (SUMMARY/STATE/PLAN) và cập nhật STATE.md Quick Tasks theo lượt;KHÔNG push từng plan (memory: push một lần mỗi lượt).

---
*Quick task: 261117-tpk*
*Completed: 2026-11-17*
