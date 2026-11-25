---
sketch: 008
name: chat-ai-settings
question: "Gom toàn bộ AI settings (provider, knowledge, MCP, Graphiti, Oracle, SSH, tool catalog) thế nào?"
winner: "C"
tags: [settings, chat-only, tabs, ant-design]
---

# Sketch 008: Full AI settings

## Design Question
Gom toàn bộ AI settings — provider/key/model/context, knowledge server, MCP, Graphiti, Oracle SQLcl, SSH FS, tool catalog — thế nào cho rõ mà không làm chat nặng?

## How to View
`open .planning/sketches/008-chat-ai-settings/index.html`

## Variants
- **A: Một cột cuộn** — Tất cả section xếp dọc; thấy hết bằng cuộn nhưng danh sách dài, khó nhớ vị trí.
- **B: Tabs nhóm** — 4 tab Provider/Knowledge/Tools/Catalog; gọn view nhưng setting ít dùng nằm sâu, dễ sót.
- **C: Side nav + accordion** (WINNER) — Side nav 7 mục rõ ràng, nội dung từng nhóm mở accordion. Đủ mọi setting, nhận diện nhóm ngay, không cuộn một cột dài.

## What to Look For
- C liệt kê đủ 7 nhóm: Provider, Knowledge Server, MCP, Graphiti, Oracle SQLcl, SSH File System, Tool Catalog.
- Field name lấy từ codebase thật: `API Endpoint`, `API Key`, `Default Model`, `Context window`, `URL Graphiti Memory`, `URL SVNG Source`, `Base Path`, v.v.
- Bị loại: A quá dài, B giấu setting ít dùng.

## Decision
Chọn **C** làm cấu trúc drawer settings mở từ gear của sketch 007 A.
