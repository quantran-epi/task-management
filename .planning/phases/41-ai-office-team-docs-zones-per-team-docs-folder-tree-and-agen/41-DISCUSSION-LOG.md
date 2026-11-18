# Phase 41: AI Office team docs zones — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
**Areas discussed:** Vị trí folder nhóm, Folder bị xoá tay, Hình dạng tool write_doc, Agent biết folder id bằng cách nào, Đặt tên tài liệu, Draft sau khi accept, Member thêm sau, Xoá nhóm

---

## Vị trí folder nhóm trong Docs

| Option | Description | Selected |
|--------|-------------|----------|
| Gốc Docs, tên = tên nhóm | Team folder ở cấp gốc, cạnh các folder khác | |
| Dưới folder 'AI Teams' | Folder cha chung, mỗi nhóm là folder con | ✓ |
| Trong folder của CR | Nằm trong folder của CR đã link | |

**User's choice:** Dưới folder 'AI Teams'
**Notes:** Gom nhóm AI tách khỏi tài liệu cá nhân. Kéo theo: cần một setting key để định danh folder cha (`ai_teams_docs_root`), vì dò theo tên sẽ mất liên kết khi đổi tên. Cây thành 3 cấp.

---

## Folder của nhóm bị xoá tay trong DocsExplorer

| Option | Description | Selected |
|--------|-------------|----------|
| Tự tạo lại ở lượt sau | Coordinator phát hiện folder mất, tạo lại cây, ghi id mới | ✓ |
| Bắt user bấm tạo lại | Refusal cho tới khi user vào Settings bấm | |
| Chặn xoá ở DocsExplorer | Sửa DocsExplorer để từ chối xoá folder thuộc team | |

**User's choice:** Tự tạo lại ở lượt sau
**Notes:** Không sửa DocsExplorer. Hệ quả được chấp nhận: xoá tay làm mất draft trong cây cũ, nhưng agent không mất gì nó còn cần.

---

## Hình dạng tool write_doc

| Option | Description | Selected |
|--------|-------------|----------|
| 1 tool, 2 mode, trả noteId | `mode: 'create' \| 'update'` | |
| 2 tool riêng | `write_doc_create` + `write_doc_update` | |
| 1 tool + action list | `action: 'list' \| 'create' \| 'update'` | ✓ |

**User's choice:** 1 tool + action list
**Notes:** `list` là cách agent biết `noteId` để sửa lần sau, không phải đoán. Một tool = một guard, một chỗ test.

---

## Agent biết folder id của mình bằng cách nào

| Option | Description | Selected |
|--------|-------------|----------|
| Nhét vào prompt | Dòng `Folder tài liệu của bạn: {id}` trong system prompt | ✓ |
| Agent tự hỏi bằng tool | Thêm tool/action để agent hỏi | |
| Không cần biết | Tool tự dùng folder từ context | |

**User's choice:** Nhét vào prompt
**Notes:** Folder id cố định trong lượt, không có gì để khám phá. Leader có thêm danh sách `{agentName} → {folderId}` để biết đọc draft ở đâu.

---

## Đặt tên tài liệu do agent ghi

| Option | Description | Selected |
|--------|-------------|----------|
| Agent tự do đặt tên | Không ràng buộc | |
| Tự thêm tiền tố tên agent | Tool tự đặt `{agentName} — {title}` | ✓ |
| Tự gắn tag agent + draft | Title tự do, tag do tool gắn | |

**User's choice:** Tự thêm tiền tố tên agent
**Notes:** Tiền tố do **tool** thêm, không phải prompt — model không thể quên. Leader không bị áp tiền tố vì ghi bằng DB tool.

---

## Draft của agent sau khi owner accept bản cuối

| Option | Description | Selected |
|--------|-------------|----------|
| Note mới ở gốc, giữ draft | Leader tạo note mới; draft còn nguyên | ✓ |
| Note mới + xoá draft | Gọn hơn nhưng mất dấu vết | |
| Chuyển draft lên gốc | Một note duy nhất, mất bản nháp | |

**User's choice:** Note mới ở gốc, giữ draft
**Notes:** Owner so sánh được bản nháp với bản cuối. Không xoá, không di chuyển, không sửa draft.

---

## Member thêm vào nhóm sau khi đã tạo

| Option | Description | Selected |
|--------|-------------|----------|
| Tạo folder ngay khi thêm | `addTeamMember` tạo folder trong cùng transaction | ✓ |
| Để user bấm tạo lại | Refusal cho tới khi user bấm | |
| Tạo lazy ở lượt đầu | Giống backfill nhóm cũ | |

**User's choice:** Tạo folder ngay khi thêm
**Notes:** `addTeamMember` đã có transaction riêng, chỉ cần thêm `db.notes`. `removeTeamMember` **không** xoá folder — tài liệu đã viết vẫn còn để owner đọc.

---

## Xoá nhóm — xử lý tài liệu

| Option | Description | Selected |
|--------|-------------|----------|
| Xoá sạch cả cây | Cây thuộc về nhóm | ✓ |
| Giữ tài liệu ở folder gốc nhóm | Chuyển về gốc Docs | |
| Để tài liệu mồ côi | Rác | |

**User's choice:** Xoá sạch cả cây
**Notes:** Không xoá folder `AI Teams` (dùng chung) và không xoá setting `ai_teams_docs_root`.

---

## Claude's Discretion

- Tên chính xác của tool (`write_doc` vs `write_team_doc`) và tên field action.
- Wording prompt của leader về việc đọc draft và ghi bản cuối.
- Không thêm `get_team_docs` — `write_doc action='list'` đủ cho agent, `query_notes` đủ cho leader.
- Không đụng UI DocsExplorer — cây hiện ra tự nhiên vì là note folder bình thường.

## Deferred Ideas

- Cây sâu hơn 3 cấp / agent tự tạo folder.
- UI riêng cho docs của nhóm.
- Skill body của BA/SA/Reviewer — sau Phase 41 + 42.
- Xoá folder của member khi gỡ member khỏi nhóm.
