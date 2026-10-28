---
status: resolved
trigger: "Sửa Mermaid diagram trong AI chat drawer: thiếu chữ; fullscreen bị cắt và không scroll hết; cải thiện giao diện; thêm zoom in/out, reset, fit-to-view, pan và phím tắt. Dùng agent Haiku."
created: 2026-10-28
updated: 2026-10-28
---

# Debug: AI Chat Mermaid render

## Symptoms

- expected: Mermaid trong AI chat drawer hiển thị đủ chữ, đẹp, responsive; fullscreen xem được toàn diagram với scroll ngang/dọc, zoom in/out, reset, fit-to-view, pan và phím tắt; không bị rác "Syntax error in text mermaid version 11.17.2" ở góc dưới màn hình.
- actual: Nhiều diagram thiếu chữ; fullscreen bị cắt và không thể scroll để xem hết; giao diện chưa đẹp; lỗi cú pháp tự vẽ error SVG ra ngoài document.body.
- errors: Mermaid syntax error SVG bị leak ra document.body.
- timeline: Phát sinh khi tích hợp Mermaid viewer vào AI chat.
- reproduction: Mở AI chat drawer, nhận câu trả lời có mermaid block, mở modal fullscreen; test trường hợp Mermaid syntax error.

## Current Focus

hypothesis: Mermaid thiếu cấu hình font & padding khiến bounding-box tính sai làm cụt chữ; fullscreen modal dùng flex center tĩnh không có zoom/pan; Mermaid tự động inject SVG fallback error vào document.body khi gặp syntax error.
test: Chạy app thật bằng Playwright/Chrome với Mermaid dài; kiểm tra label, inline scroll, fullscreen zoom 200%, scroll ngang/dọc, reset, fit, pan và phím tắt; chạy type-check và 8 test liên quan.
expecting: Sơ đồ có đủ label, vùng scroll tăng theo zoom, kéo được đến max scroll, reset/fit/pan/shortcut hoạt động, type-check và test pass.
next_action: complete session

reasoning_checkpoint:
  hypothesis: "1) Mermaid default font 'inherit' kết hợp htmlLabels khiến bbox tính sai dẫn đến text bị cắt hoặc thiếu chữ. 2) SVG render mặc định có max-width 100% inline gây thu nhỏ hoặc cắt viền. 3) Fullscreen modal dùng flex center tĩnh khiến sơ đồ lớn bị clip ra ngoài và không cuộn được. 4) Thiếu interactive canvas (pan/drag, scale, shortcuts). 5) Mermaid inject SVG lỗi trực tiếp vào document.body khi cú pháp sai."
  confirming_evidence:
    - "MermaidViewer.tsx ban đầu không set explicit fontFamily hoặc flowchart/sequence padding."
    - "Modal ban đầu dùng max-height 75vh tĩnh không có cơ chế zoom hay drag canvas."
    - "Mermaid engine mặc định thêm SVG 'Syntax error in text mermaid version 11.17.2' vào body nếu không có suppressErrorRendering: true."
  falsification_test: "Cung cấp zoom/pan canvas, cấu hình mermaid font/padding, thêm suppressErrorRendering: true, dọn sạch DOM orphan, thêm responsive CSS rules và phím tắt (+, -, 0, f, esc)."
  fix_rationale: "Chuẩn hóa Mermaid init với font hệ thống, padding an toàn, chặn leak error SVG; tạo interactive viewport với scale, pan translation, nút zoom và phím tắt."
  blind_spots: "Không còn."

## Evidence

- timestamp: 2026-10-28T17:45:00
  checked: MermaidViewer.tsx, markdown.css
  found: Thiếu font-family chuẩn cho Mermaid; container SVG bị giới hạn kích thước; modal không có zoom/pan controls.
  implication: Gây cụt chữ và không xem được sơ đồ kích thước lớn trong modal.
- timestamp: 2026-10-28T18:00:00
  checked: ChatMessageBubbleMermaid.test.ts
  found: Toàn bộ 8/8 test suite đã pass (markdown parsing, rendering SVG, code toggle, zoom in/out/reset, keyboard shortcuts).
  implication: Logic xử lý và tương tác bàn phím hoạt động chính xác.
- timestamp: 2026-10-28T18:12:00
  checked: Mermaid error handling & body leak
  found: Đã bổ sung suppressErrorRendering: true và cleanup DOM elements trong catch block.
  implication: Mermaid không tự vẽ error SVG rác ra document.body.
- timestamp: 2026-10-28T18:44:00
  checked: App thật qua Playwright với Chrome, AI chat drawer và Mermaid dài 5 node.
  found: SVG inline có đủ 5 label, viewBox 1169x310 và scrollWidth 1169 trên drawer 266px. Fullscreen tại 200% có scrollWidth 2225 > clientWidth 1320 và scrollHeight 774 > clientHeight 720; cuộn được tới maxLeft 905/maxTop 54; reset, fit, pan, phím + và phím 0 hoạt động. Screenshot: .planning/debug/mermaid-fullscreen-zoom.png.
  implication: Chữ không bị co/cắt; diagram lớn xem được toàn bộ bằng zoom, pan và scroll hai chiều.
- timestamp: 2026-10-28T18:44:30
  checked: TypeScript build và src/components/ai/__tests__/ChatMessageBubbleMermaid.test.ts.
  found: Type-check pass; 8/8 test pass.
  implication: Thay đổi hợp lệ về type và có regression coverage cho render/controls/shortcuts.

## Eliminated

- Không phải lỗi do Markdown parser hay ChatMessageBubble container.

## Resolution

root_cause: Mermaid dùng font kế thừa và SVG max-width làm chữ bị thu nhỏ/cắt trong drawer; modal fullscreen chỉ render SVG trong flexbox tĩnh nên transform scale không mở rộng scroll area; thiếu pan/zoom và bàn phím điều khiển; Mermaid tự vẽ error SVG vào document.body khi gặp cú pháp lỗi vì thiếu suppressErrorRendering.
fix: Cấu hình font hệ thống và suppressErrorRendering; chuẩn hóa SVG theo viewBox thành natural width/height để drawer scroll thay vì ép nhỏ; kích thước wrapper fullscreen theo viewBox x scale để overflow thật sự cuộn được; thêm zoom 20%-400%, fit-to-view, reset, pan/drag, Ctrl+wheel và phím tắt (+, -, 0, f, Esc); dùng theme Mermaid light/dark.
verification: App thật qua Playwright/Chrome PASS cho đủ 5 label, inline horizontal scroll, fullscreen zoom 200%, scroll ngang/dọc tới giới hạn, reset, fit, pan và shortcut. Screenshot .planning/debug/mermaid-fullscreen-zoom.png. Type-check pass; 8/8 test liên quan pass.
files_changed:
  - src/styles/markdown.css
  - src/components/ai/MermaidViewer.tsx
  - src/components/ai/__tests__/ChatMessageBubbleMermaid.test.ts
