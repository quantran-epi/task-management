# Phase 32: External Research via Claude Code Headless - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 32-external-research-via-claude-code-headless
**Areas discussed:** Cơ chế thực thi & stream, Định dạng lệnh & Parser, Trigger & Giao diện UX, Phạm vi Tool & Bảo mật (Multi-System)

---

## Cơ chế thực thi & stream

| Option | Description | Selected |
|--------|-------------|----------|
| Tái sử dụng SSH PTY session | Dùng `sshPtyService` có sẵn, stream PTY event | |
| ssh_exec_stream thuần | Viết Tauri `ssh_exec_stream`: channel exec thuần không PTY, stream log theo dòng, trả raw JSON/text sạch | ✓ |
| Ghi file tạm + đọc qua SFTP | Xuất ra file remote rồi dùng SFTP tải về | |

**User's choice:** ssh_exec_stream thuần
**Notes:** Non-PTY stream tránh dính mã điều khiển ANSI/terminal, đảm bảo JSON parse an toàn 100%. Khi hủy: kill PID qua SSH + đóng channel để tránh orphan process. Timeout 300s + fallback rõ ràng.

---

## Định dạng lệnh & Parser

| Option | Description | Selected |
|--------|-------------|----------|
| CLI JSON format + Prompt Schema | `claude -p "<prompt>" --output-format json` với schema findings chặt chẽ | ✓ |
| Markdown text thuần + Regex | Markdown có header `[EXTERNAL:...]` và regex parse | |
| Báo cáo Markdown tự do | Lưu nguyên văn báo cáo không bóc tách claim | |

**User's choice:** CLI JSON format + Prompt Schema
**Notes:** Lưu thành Note Artifact `kind: 'RESEARCH'` trong `db.notes`, quản lý đa phiên bản (`v1`, `v2`, ...). Tích hợp vào `sdlcPromptComposer` dưới dạng Delimited Segment có rank rõ ràng subordinate to internal.

---

## Trigger & Giao diện UX

| Option | Description | Selected |
|--------|-------------|----------|
| Kết hợp AI đề xuất + Nút Toolbar | AI phát hiện thiếu evidence xuất card đề xuất + Nút chủ động trên Toolbar | ✓ |
| Chỉ qua Chat Proposal Card | Chỉ trigger khi AI gọi proposal tool | |
| Chỉ dùng nút thủ công | Chỉ dùng nút thủ công trên Toolbar/Header | |

**User's choice:** Kết hợp AI đề xuất + Nút Toolbar
**Notes:** Khi chưa có SSH hoặc lỗi kết nối, hiển thị Banner cảnh báo + Nút bỏ qua. Hiển thị `ResearchSummaryCard` trên Step 1 & 2. Hoàn tất research hiển thị CTA để người dùng chủ động bấm gửi prompt tiếp tục.

---

## Phạm vi Tool & Bảo mật (Multi-System)

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only tools | Chỉ cho phép `WebSearch,WebFetch,Glob,Grep,Read`, cấm sửa code hoặc git push | ✓ |
| Quyền mặc định | Để Claude Code tự do kèm lời nhắc | |

**User's choice:** Read-only tools + Multi-System targeting
**Notes:** 
- Tích hợp theo kiến trúc Phase 31.1 (Systems Catalog & Multi-system CR): SSH và repo path được liên kết theo từng System.
- AI sẽ phân tích và gợi ý câu hỏi nào cần research trên System nào.
- Người dùng có thể chấp nhận gợi ý, hoặc chọn nhiều System / All Systems để research.
- Chạy trên user shell remote với auth có sẵn trên server.

---

## Claude's Discretion

- Thiết kế chi tiết modal inspect và log accordion theo chuẩn giao diện IntelliJ ExpUI.
- Logic fallback regex nếu LLM xuất JSON kèm text giải thích.

## Deferred Ideas

- Chuyển quyền điều khiển sang terminal tương tác nếu headless bị treo (đã có terminal panel của Phase 29.1).
- Lập lịch tự động research nền.
