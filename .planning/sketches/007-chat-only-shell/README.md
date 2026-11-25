---
sketch: 007
name: chat-only-shell
question: "Shell app chat-only nên gọn thế nào mà vẫn để đủ AI settings?"
winner: "A"
tags: [chat-only, shell, layout, ant-design]
---

# Sketch 007: Chat-only shell

## Design Question
Shell app chat-only nên gọn thế nào mà vẫn để đủ AI settings?

## How to View
`open .planning/sketches/007-chat-only-shell/index.html`

## Variants
- **A: Chat full-bleed + gear** (WINNER) — Chat chiếm toàn bộ cửa sổ, một nút gear duy nhất mở drawer AI settings. Không shell quản lý, không rail, không top menu.
- **B: Chat + tool rail** — Rail icon dọc cho knowledge/MCP/Oracle/SSH; tiện nhưng làm app trông như workbench quản lý.
- **C: Chat + top bar** — Menu desktop truyền thống; dễ đoán nhưng chiếm chiều cao và pha cảm giác app quản lý vào chat.

## What to Look For
- A giữ tối đa không gian cho hội thoại, đúng yêu cầu "mở app chỉ có AI chat panel".
- Drawer settings trượt từ phải, không đẩy nội dung chat.
- B/C bị loại vì thêm cấu trúc điều hướng không cần thiết cho user chỉ cần chat.

## Decision
Chọn **A**: full-bleed chat, gear ở titlebar mở AI settings. Kết hợp với sketch 008 winner C (drawer có side nav 7 nhóm).
