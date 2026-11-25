---
quick: 261125-svm
status: locked
created: 2026-11-25
---

# Quyết định đã chốt với sếp

- Scope: **mọi MCP server** đã cấu hình (generic + `graphiti-banking` + `svng-source`), không riêng 2 server chuyên biệt.
- Nguyên tắc: server advertise tool nào qua `tools/list` thì tool đó được đăng ký/dùng được. Không giữ allowlist tên tool cứng trong TS lẫn Rust cho mục đích "tool nào được phép".
- Áp dụng cho **mọi bề mặt AI**: AI Chat panel, AI Chat team (lead/employee), Telegram AI chat.
- Mutation: **vẫn chặn** tool ghi/ mutation của MCP. Không mở permission cho mutation; giữ fail-closed project policy. Tool read-only (theo `readOnlyHint` hoặc policy read-only đã xác định) mới được gọi.
- Reload: **tự động theo lượt chat**. Mỗi turn refresh `tools/list` (cache ngắn có TTL + invalidation khi cần), tool mới/xoá phản ánh mà không cần user bấm reload. Không bắt buộc nút reload UI.
- Không được làm mất code của workstream khác đang sửa `AIChatDrawer.tsx` / `AIChatContext.tsx` / footer indicator. Chỉ đụnh file liên quan MCP theo plan, tránh rebase/reset/stash toàn repo.
- Không đụng `public/ai-rules/**` và `SHA256SUMS` (đã verify).
- Mọi thảo luận/báo cáo tiếng Việt; code identifiers giữ nguyên.
- Không chạy full vitest suite. Chỉ scoped paths.

## Ghi chú nghiên cứu Claude Code (tham khảo, không copy nguyên)

Claude Code không hard-code allowlist tên MCP tool; discovery lấy `tools/list`, tên dạng `mcp__<server>__<tool>`; permission là layer ngoài (`deny → ask → allow`). Có thể refresh qua `notifications/tools/list_changed`. Tuy nhiên TaskMate là desktop app có renderer + Tauri proxy nhận URL từ client, nên vẫn giữ host policy + mutation gate ở native side; bỏ allowlist tên tool không có nghĩa là bỏ host validation hay bỏ read-only gate.
