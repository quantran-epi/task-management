# Deferred items — Phase 59 plan 01

Phát hiện ngoài phạm vi plan 01 (không sửa trong task này):

1. React console warning `Received true for a non-boolean attribute block` — nguồn: `src/components/ui/segmented.tsx:47` truyền `block` prop xuống DOM. Pre-existing, không do harness gây ra. Harness lọc noise này khỏi `consoleErrors` để gate không chặn smoke; cần fix riêng trong control plan tương ứng (segmented).
2. `favicon` 404 trên reference `:1420` và proof `:5180` — resource tĩnh thiếu trên scratchpad app, không ảnh hưởng control parity.
3. TaskMate dev server hiện chạy IPv6-only (`[::1]:5173`) dù Playwright `webServer` boot `--host 127.0.0.1`. Playwright browser dùng `localhost` nên smoke vẫn xanh; pre-flight URL `127.0.0.1:5173` sẽ fail cứng nếu chỉ có server IPv6. Cần đảm bảo script start app bindings đúng khi chạy ngoài Playwright webServer (thuộc hạ tầng, không phải plan 01 code).
