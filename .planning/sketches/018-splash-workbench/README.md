---
sketch: 018
name: splash-workbench
question: "Splash screen TaskMate nên giữ chất workbench tối giản, kỹ thuật mà vẫn đủ cảm giác 'đang khởi động'?"
winner: null
tags: [splash, boot, workbench, dark, ant-design]
---

# Sketch 018: Splash Workbench

## Design Question
Redesign splash screen: khoảnh khắc có chủ đích, tối giản, kỹ thuật — mang thương hiệu riêng của TaskMate (không nhắc IntelliJ / Islands / Workbench) — bỏ cảm giác neon lặp vô hạn. Giữ lại progress percentage/bars, boot step text, tagline Private & Offline-First và credit tác giả theo lựa chọn của sếp.

## How to View
`open .planning/sketches/018-splash-workbench/index.html`

## Variants
- **A: Centered Mark** — Splash căn giữa trên gradient xanh-đen → indigo → teal có chiều sâu; không ghost rail (sếp phản hồi dễ nhầm là UI thật). Movement: mark settle một lần, sheen tĩnh, progress + percent chạy lên, fade out.
- **B: Workbench Rail** — Nền xanh đen có track circles + status bar `INDEXEDDB / LOCAL SQLITE / OFFLINE`; nhấn mạnh runtime local, ít hình hơn.
- **C: Boot Card** — Card nổi trên nền tối, logo + title nằm trong card, có dòng xác nhận "Dữ liệu local · không yêu cầu tài khoản hay mạng". Gần Ant Design, dễ đọc.

## What to Look For
- Dark palette: gradient `#0a1220 → #101a2c → #0a1b22` + blue/teal `#2f62d8/#1677ff/#13c2c2` — cùng hệ token TaskMate, không tím/hồng neon.
- Mọi variant đều có boot step + percent + progress bar + tagline + credit. So sánh mức độ "workbench" vs "card SaaS".
- Motion: replay để thấy mark vào vị trí một lần (no infinite), progress step 15/45/80/100, fade out 350ms.
- Text luôn một dòng (boot step, tagline, credit) — sếp yêu cầu không break line.
- Responsive: toolbar góc phải đổi 375 / 768 / full.
