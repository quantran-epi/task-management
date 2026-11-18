# Phase 39: Skill versioning + enrichment approval - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 39-skill-versioning-enrichment-approval
**Areas discussed:** Cơ chế đề xuất, Ngữ nghĩa version, Pin version, Ranh giới CRUD, UI tạo skill

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Cơ chế đề xuất | Tool mới vs tự động sau lượt vs nút user | ✓ |
| Ngữ nghĩa version | Approval ghi aiSkills hay runtime đọc version row | ✓ |
| Pin version | Cách agent đang chạy giữ version | ✓ |
| Ranh giới CRUD | Leader/agent/skill hay chỉ skill | ✓ |

**User's choice:** Cả 4 vùng.
**Notes:** Không chọn vùng nào ngoài 4 vùng trên.

---

## Cơ chế đề xuất

| Option | Description | Selected |
|--------|-------------|----------|
| Tool agent tự gọi | `propose_skill_version` trong payload agent; không tốn thêm lượt model | ✓ |
| Tự động sau lượt | Coordinator chạy thêm lượt tóm tắt bài học; tốn token mỗi lượt | |
| User bấm nút | User chủ động sinh đề xuất; không khớp "agent can propose" | |

**User's choice:** Tool agent tự gọi.
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Toàn văn body mới | Version row có sẵn name/description/body; diff bằng `createUnifiedLineDiff` | ✓ |
| Patch theo section | Phải `get_artifact` trước, bounded 120 dòng, không sửa được cấu trúc | |
| Cả hai | Nhiều nhánh, nhiều test, hai định dạng proposal | |

**User's choice:** Toàn văn body mới.

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ agent, skill của mình | `ctx.skillId`; leader không có skill nên bị loại tự nhiên | ✓ |
| Agent + leader | Leader phải nêu skillId; không có ngữ cảnh sâu | |

**User's choice:** Chỉ agent, skill của mình.

| Option | Description | Selected |
|--------|-------------|----------|
| Card chat + skill detail | Hai đường duyệt, cùng một pending row | ✓ |
| Chỉ skill detail | Transcript sạch nhưng không thấy ngay sau lượt | |
| Chỉ card chat | Mất đề xuất nếu đóng chat/relaunch | |

**User's choice:** Card chat + skill detail.

| Option | Description | Selected |
|--------|-------------|----------|
| Ghi DB ngay tại UI | `decideSkillVersion` gọi thẳng từ UI, một transaction | ✓ |
| Resolve rồi agent ghi | Thêm vòng model; model có thể không gọi | |

**User's choice:** Ghi DB ngay tại UI.

| Option | Description | Selected |
|--------|-------------|----------|
| Body hiện tại = v1 ngầm | Baseline chỉ tồn tại khi bảng version rỗng; không migration | ✓ |
| Tự tạo row v1 khi chạy | History đầy đủ nhưng ghi ngầm + phải xử lý đua | |
| Từ chối cho tới khi duyệt | Phá mọi skill hiện có | |

**User's choice:** Body hiện tại = v1 ngầm.

| Option | Description | Selected |
|--------|-------------|----------|
| Ghi pending ngay | Tool ghi row pending + trả diff; pending là dữ liệu trơ | ✓ |
| Park trên approval card | Hai lần bấm cho cùng một việc | |

**User's choice:** Ghi pending ngay.

| Option | Description | Selected |
|--------|-------------|----------|
| Tái dùng PatchDiffApprovalCard | Đã render diff note/skill; thêm nhánh skill | ✓ |
| Viết card riêng | Thêm component + test mới | |

**User's choice:** Tái dùng PatchDiffApprovalCard.

---

## Ngữ nghĩa version

| Option | Description | Selected |
|--------|-------------|----------|
| Ghi đè aiSkills khi duyệt | Runtime vẫn đọc `aiSkills`; version row là history | ✓ |
| Runtime đọc version row | Đúng mô hình version hơn nhưng sửa `read_skill`, `skillFor`, prompt | |

**User's choice:** Ghi đè aiSkills khi duyệt.

| Option | Description | Selected |
|--------|-------------|----------|
| Tạo version approved mới | Mọi thay đổi đều có history; một quy tắc duy nhất | ✓ |
| Ghi thẳng, không version | Không đối xứng, không truy được | |
| Tạo version pending | Vô lý vì chính user vừa sửa | |

**User's choice:** Tạo version approved mới.

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ xem history | R-12 chưa duyệt; đúng phạm vi phase | ✓ |
| Cho khôi phục version cũ | Thêm capability ngoài scope | |

**User's choice:** Chỉ xem history.

| Option | Description | Selected |
|--------|-------------|----------|
| Giữ body đồng bộ | Backup schema không đổi, không bump envelope | ✓ |
| Bỏ body khỏi aiSkills | Sạch hơn nhưng sửa strictObject + nhiều chỗ đọc | |

**User's choice:** Giữ body đồng bộ.

| Option | Description | Selected |
|--------|-------------|----------|
| Row đầu = v1 | Baseline ngầm chỉ tồn tại khi bảng rỗng | ✓ |
| Row đầu = v2 | v1 không có row — lỗ hổng số | |

**User's choice:** Row đầu = v1.

| Option | Description | Selected |
|--------|-------------|----------|
| Version gói cả 3 | name/description/body; đề xuất đổi được mô tả | ✓ |
| Version chỉ gói body | Hạn chế đúng chỗ agent cần cải thiện | |

**User's choice:** Version gói cả 3.

| Option | Description | Selected |
|--------|-------------|----------|
| Pending không chiếm số | `version` gán lúc duyệt; nhiều pending không đụng số nhau | ✓ |
| Pending chiếm số ngay | Ba pending = v2/v3/v4; duyệt v3 để lại lỗ hổng | |

**User's choice:** Pending không chiếm số.

| Option | Description | Selected |
|--------|-------------|----------|
| Thêm field baseVersion | Số approved lớn nhất lúc đề xuất; optional để backup cũ đọc được | ✓ |
| Lưu baseHash | Không cần version number nhưng hash khó đọc trong UI | |
| Suy từ timestamp | Không biết pending dựa vào bản nào — báo sai | |

**User's choice:** Thêm field baseVersion.

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ decidedAt | App một user; field hằng số không mang thông tin | ✓ |
| Thêm decidedBy = 'user' | Tường minh hơn nhưng luôn là hằng số | |

**User's choice:** Chỉ decidedAt.

| Option | Description | Selected |
|--------|-------------|----------|
| Mở rộng SkillEditorDrawer | Danh sách version + mục "Chờ duyệt"; không view mới | ✓ |
| View riêng cho version | Tách bạch nhưng thêm navigation + component | |

**User's choice:** Mở rộng SkillEditorDrawer.

---

## Pin version

| Option | Description | Selected |
|--------|-------------|----------|
| Pin trên assignment row | Field `skillVersion` đã có trong type + backup schema | ✓ |
| Pin trong bộ nhớ roster | Không truy được sau lượt, không hiển thị được | |

**User's choice:** Pin trên assignment row.

| Option | Description | Selected |
|--------|-------------|----------|
| Đọc body hiện hành, pin là dấu vết | Ban đầu chọn — **xung đột** với criterion 5 | (ban đầu ✓, sau đổi) |
| Đọc đúng version đã pin | Truyền `skillVersion` vào `TeamToolContext`; tra version row | ✓ (sau khi làm rõ) |

**User's choice:** Ban đầu "đọc body hiện hành"; sau khi phát hiện mâu thuẫn, chốt "đọc đúng version đã pin".
**Notes:** Đã giải thích bằng ngôn ngữ đời thường (photo sách / nhớ trong đầu / không làm gì). User hỏi: *"thế nếu đang chạy mà agent đề xuất skill hữu ích, không thể áp dụng ngay trong nhóm cho những lượt chạy sau được à"* → làm rõ pin theo **lần chạy**, lượt sau nhận version mới ngay.

| Option | Description | Selected |
|--------|-------------|----------|
| Chốt đầu lượt, không đổi | Roster đọc tươi đầu lượt (Phase 36 D-07); attempt pin số lúc tạo | ✓ |
| Đọc version mới nhất mỗi lần | Vi phạm criterion 5 và Pitfall 18 | |

**User's choice:** Chốt đầu lượt, không đổi.

| Option | Description | Selected |
|--------|-------------|----------|
| Không nêu version | Số version là dấu vết kỹ thuật | ✓ |
| Nêu số version trong prompt | Model biết nhưng không hành động khác đi | |

**User's choice:** Không nêu version.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Đọc đúng version đã pin | Pin theo lần chạy; lượt sau nhận bản mới ngay | ✓ |
| B — Nhớ sẵn trong bộ nhớ lượt | Cùng hành vi, rủi ro đọc lại từ DB giữa lượt | |
| C — Không pin | Việc đang dở trộn hai bản quy trình | |

**User's choice:** A.

---

## Ranh giới CRUD

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ skill | Leader/agent → Phase 40 (AIO-LEAD-01..04) | ✓ |
| Cả 3 loại ngay | Trùng Phase 40, phase phình to | |
| Skill đầy đủ + sửa lỗi nhỏ leader/agent | Phần còn lại → Phase 40 | |

**User's choice:** Chỉ skill.
**Notes:** User hỏi *"CRUD về cái gì nhỉ, chưa hiểu"* trước khi chọn — đã giải thích 3 loại hồ sơ (leader/agent/skill) và 4 thao tác.

| Option | Description | Selected |
|--------|-------------|----------|
| Xóa cả version rows | Code hiện tại đã đúng; chặn khi còn dùng | ✓ |
| Giữ version làm lịch sử | Row mồ côi; backup validation phải xử lý thêm | |

**User's choice:** Xóa cả version rows.

| Option | Description | Selected |
|--------|-------------|----------|
| Treo tới khi bạn quyết | Không tự hết hạn (C-13) | ✓ |
| Tự hết hạn sau N ngày | Cần job dọn dẹp + ngưỡng chưa đặt | |

**User's choice:** Treo tới khi bạn quyết.

| Option | Description | Selected |
|--------|-------------|----------|
| Nhiều pending, duyệt độc lập | Duyệt một cái không đụng các cái khác | ✓ |
| Tối đa 1 pending mỗi skill | Gọn nhưng chặn đề xuất hợp lệ | |

**User's choice:** Nhiều pending, duyệt độc lập.

| Option | Description | Selected |
|--------|-------------|----------|
| Cảnh báo + chặn duyệt bản cũ | Tránh ghi đè bản vừa duyệt bằng diff cũ | ✓ |
| Tự từ chối các pending còn lại | Tự động quyết thay user — trái C-13 | |
| Cho duyệt hết, ghi đè lần lượt | Mất nội dung vừa duyệt | |

**User's choice:** Cảnh báo + chặn duyệt bản cũ.

| Option | Description | Selected |
|--------|-------------|----------|
| Bọc cả mô tả | Mô tả có thể do model viết → kênh injection | ✓ |
| Chỉ bọc body | Mô tả vào prompt trần — lỗ hổng | |
| Cấm agent đổi mô tả | Hạn chế đúng chỗ agent cần cải thiện | |

**User's choice:** Bọc cả mô tả.

| Option | Description | Selected |
|--------|-------------|----------|
| propose_skill_version | Nói rõ đây là đề xuất, không phải ghi | ✓ |
| propose_skill_lesson | "lesson" gây hiểu nhầm là chỉ thêm một mục | |

**User's choice:** propose_skill_version.

---

## UI tạo skill (phát sinh)

| Option | Description | Selected |
|--------|-------------|----------|
| Thêm vào AI Staff tool window | `AiStaffExplorer` đã có danh sách + nút tạo + drawer + lỗi | ✓ |
| Thêm vào AI Office tool window | AI Office là nơi quản nhóm, không phải hồ sơ AI | |
| Làm tab agents truy cập được | Phase 40 sẽ xóa/thay explorer — làm hai lần | |

**User's choice:** Thêm vào AI Staff tool window.
**Notes:** User hỏi *"phase này sẽ tạo skill đúng ko, vì tôi chưa thấy chỗ nào trên UI cho phép tạo create new skill"*. Đã xác minh: `AiOfficeView` có nút "Tạo kỹ năng" nhưng **không có trigger nào mở `viewType: 'agents'`** → dead code. Hai tool window thật (`ai_staff`, `ai_office`) không có chữ "skill".

| Option | Description | Selected |
|--------|-------------|----------|
| Để nguyên, Phase 40 xử lý | Diff nhỏ nhất, không rủi ro | ✓ |
| Xóa AiOfficeView ngay | Giảm dead code nhưng thêm rủi ro | |

**User's choice:** Để nguyên, Phase 40 xử lý.

---

## Claude's Discretion

- Tên chính xác của field `baseVersion` (phải qua `FORBIDDEN_BACKUP_KEYS`).
- Cách biểu diễn `version = 0` cho pending (số `0` hay bỏ trống field).
- Vị trí chính xác của mục "Chờ duyệt" và danh sách version trong `SkillEditorDrawer`.
- Cách hiển thị diff khi `aiSkills.body` là baseline ngầm.
- Nội dung và cách hiển thị `evidence` trong card duyệt.
- Có cần thêm index Dexie mới hay dùng lại `[skillId+version]`.

## Deferred Ideas

- Leader/agent CRUD → Phase 40.
- Khôi phục version cũ (R-12) — chưa duyệt.
- Nhiều skill per agent (R-11) — `AiEmployee.skillId` scalar giữ nguyên.
- Explorer 2 tầng, walkthrough tổng → Phase 40.
- Tự hết hạn đề xuất pending — không cần.
- Xóa `AiOfficeView` (dead code) → Phase 40.
