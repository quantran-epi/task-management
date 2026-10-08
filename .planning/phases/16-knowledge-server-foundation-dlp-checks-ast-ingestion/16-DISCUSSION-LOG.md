# Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves alternatives considered.

**Date:** 2026-10-08
**Phase:** 16-Knowledge Server Foundation, DLP Checks & AST Ingestion
**Areas discussed:** Luồng publish, DLP rejection, AST chunks, Trạng thái index

---

## Luồng publish

### Đơn vị publish

| Option | Description | Selected |
|--------|-------------|----------|
| Document set | Publish một tập tài liệu có tên và membership ổn định. | ✓ |
| Từng document | Publish từng tài liệu độc lập. | |
| Folder trực tiếp | Folder hiện tại quyết định membership động. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Document set
**Notes:** Document set là đơn vị publish chính.

### Tạo document set

| Option | Description | Selected |
|--------|-------------|----------|
| Folder snapshot + chọn | Lấy snapshot tài liệu trong folder rồi cho phép điều chỉnh; lưu stable document IDs. | ✓ |
| Folder luôn đồng bộ | Membership thay đổi theo folder. | |
| Chọn thủ công | Chọn từng document từ đầu. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Folder snapshot + chọn
**Notes:** Set lưu stable document IDs; di chuyển folder không tự đổi membership.

### Local document thay đổi

| Option | Description | Selected |
|--------|-------------|----------|
| Đánh dấu stale, publish tay | Hiện local changes và chờ người dùng publish. | ✓ |
| Nhắc khi mở Docs | Chỉ nhắc khi người dùng vào workspace. | |
| Tự publish khi lưu | Gửi sau auto-save. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Đánh dấu stale, publish tay
**Notes:** Không publish-on-save.

### Document bị bỏ khỏi set

| Option | Description | Selected |
|--------|-------------|----------|
| Xác nhận rồi unpublish | Preview thay đổi, xác nhận trước khi bỏ server index. | ✓ |
| Giữ index cũ | Server tiếp tục giữ document ngoài set. | |
| Unpublish tự động | Bỏ ngay trong publish kế tiếp. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Xác nhận rồi unpublish
**Notes:** Không xóa Markdown local.

---

## DLP rejection

### Chính sách finding

| Option | Description | Selected |
|--------|-------------|----------|
| Bỏ DLP hoàn toàn | Không scan hoặc cảnh báo vì server nội bộ. | |
| Chỉ cảnh báo | Scan trước khi gửi, hiển thị finding, cho phép explicit override. | ✓ |
| Giữ hard reject | Finding chặn toàn bộ publish. | |

**User's choice:** Chỉ cảnh báo
**Notes:** User stated app and servers operate inside organization network, not public Internet. This conflicts with current `INGEST-02`, `QUAL-04`, ROADMAP success criteria, and PROJECT constraint; those artifacts require amendment before planning.

### Phạm vi override

| Option | Description | Selected |
|--------|-------------|----------|
| Xác nhận mỗi publish | Mỗi publish có finding đều yêu cầu xác nhận mới. | ✓ |
| Tin cậy document | Persist bypass cho document. | |
| Tin cậy loại finding | Persist bypass theo finding category. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Xác nhận mỗi publish
**Notes:** Không lưu bypass lâu dài.

### Finding preview

| Option | Description | Selected |
|--------|-------------|----------|
| Mask + vị trí | Hiện category, document, line/column, masked excerpt/value. | ✓ |
| Hiện nguyên giá trị | Hiện toàn bộ matched value. | |
| Chỉ số lượng | Không hiện vị trí hoặc excerpt. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Mask + vị trí
**Notes:** Không lặp complete secret trong UI.

### Override audit

| Option | Description | Selected |
|--------|-------------|----------|
| Lưu metadata tối thiểu | Timestamp, document IDs, categories/counts, content hashes. | ✓ |
| Không lưu audit | Không lưu dấu override. | |
| Lưu báo cáo đầy đủ | Lưu masked excerpt và vị trí. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Lưu metadata tối thiểu
**Notes:** Không lưu matched values hoặc excerpts.

---

## AST chunks

### Chunk boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Section-first | H2/H3 section là đơn vị chính; oversized section tách tại AST block. | ✓ |
| Mỗi AST block | Paragraph/table/code mỗi block một chunk. | |
| Kích thước cố định | Gom đến character/token threshold. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Section-first
**Notes:** Ưu tiên semantic context và stable incremental indexing.

### Oversized structured block

| Option | Description | Selected |
|--------|-------------|----------|
| Giữ block nguyên tử | Không cắt table row, code/SQL block, hoặc ASCII diagram; reject nếu vượt hard limit. | ✓ |
| Tách có cấu trúc | Chia table/code/diagram theo quy tắc riêng. | |
| Truncate phần dư | Index phần đầu, bỏ phần còn lại. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Giữ block nguyên tử
**Notes:** Reject document với exact location và hướng dẫn tách source nếu atomic block vượt hard limit.

### Stable chunk identity

| Option | Description | Selected |
|--------|-------------|----------|
| ID từ document + nội dung | Stable document UUID + normalized chunk-content SHA-256. | ✓ |
| ID từ heading path | Identity thay đổi khi rename/move heading. | |
| ID từ ordinal | Identity thay đổi khi chèn section phía trước. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** ID từ document + nội dung
**Notes:** Không phụ thuộc line number hoặc ordinal.

### Source coordinates

| Option | Description | Selected |
|--------|-------------|----------|
| Line + offset + snapshot hash | Lưu line range, character offsets, document version hash. | ✓ |
| Chỉ line range | Dễ đọc nhưng kém chính xác khi document đổi. | |
| Chỉ character offsets | Chính xác nhưng khó hiển thị. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Line + offset + snapshot hash
**Notes:** Hỗ trợ citation dễ đọc và xác minh đúng published snapshot.

---

## Trạng thái index

### Set-level state model

| Option | Description | Selected |
|--------|-------------|----------|
| 6 trạng thái rõ nghĩa | Never published, In sync, Local changes, Publishing, Warning, Failed. | ✓ |
| 3 trạng thái gọn | Not synced, Syncing, Synced. | |
| Pipeline chi tiết | Scanning, Parsing, Chunking, Hashing, Indexing, Complete, Warning, Failed. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** 6 trạng thái rõ nghĩa
**Notes:** Một trạng thái chính; chi tiết per-document.

### Status placement

| Option | Description | Selected |
|--------|-------------|----------|
| Set panel + doc badges | Panel quản lý set và badge trong Docs. | ✓ |
| Chỉ set panel | Không hiện status gần document. | |
| Chỉ doc badges | Không có tổng quan set/history. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Set panel + doc badges
**Notes:** Tái dùng 3-column Docs workspace.

### Partial failure semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Giữ snapshot cũ | Candidate snapshot chỉ activate sau khi toàn set thành công. | ✓ |
| Giữ phần thành công | Server dùng version hỗn hợp. | |
| Xóa set khi lỗi | Knowledge unavailable sau lỗi. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** Giữ snapshot cũ
**Notes:** Failed attempt không phá active snapshot.

### History retention

| Option | Description | Selected |
|--------|-------------|----------|
| 10 lần gần nhất | Metadata bounded cho chẩn đoán. | ✓ |
| Chỉ lần gần nhất | Không giữ lịch sử gần đây. | |
| Giữ không giới hạn | Audit tăng không giới hạn. | |
| Bạn quyết định | Để planner chọn. | |

**User's choice:** 10 lần gần nhất
**Notes:** Lưu timestamp, duration, changed/unchanged/removed counts, warning count, error summary; không lưu content hoặc DLP excerpt.

---

## Claude's Discretion

- Exact chunk size and atomic-block hard limit.
- Exact status badge colors and presentation.
- Retry and transport mechanics within manual-publish and atomic-snapshot decisions.

## Deferred Ideas

None.
