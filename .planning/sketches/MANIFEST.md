# Sketch Manifest

## Design Direction
Workbench gọn, mật độ cao, dùng token Ant Design 6 / TaskMate hiện có. Với bộ tài liệu: rail trái chọn bộ, vùng phải tìm/chọn doc, search dính đầu + virtual scroll. Với chat standalone: chat là trung tâm, file SSH và policy Telegram phải hiện rõ trạng thái + bước tiếp theo, không giấu trong nhiều lớp modal. Telegram chỉ là cấu hình từ xa + whitelist model, không phải kênh chat dùng chung.

## Reference Points
- Codebase thật: `src/views/ConfigProfilesView.tsx`, `src/styles/tokens.ts`, `src/components/ui/ui-tokens.css`, `src/components/ai/AIChatDrawer.tsx`, `src/components/ai/StandaloneSshFileBrowser.tsx`, `src/views/TelegramMonitorView.tsx`
- Sketch trước: 007-chat-only-shell (winner A), 008-chat-ai-settings (winner C)
- Không có app/site ngoài được sếp nêu làm mẫu; 3 variant tự đề xuất cho mỗi sketch.

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | config-profiles-layout | Bố cục nào giúp soạn/đọc/đổi cấu hình cho người khác rõ ràng nhất? | C — Rail danh sách + editor | layout, settings, profiles, ant-design |
| 002 | doc-set-workbench-layout | Bố cục nào cho màn hình bộ tài liệu gọn trong workbench mà vẫn đủ thông tin? | A — Rail cố định + inspector | layout, doc-set, workbench, ant-design |
| 003 | doc-set-virtual-list | Danh sách docs lớn nên quét/tìm/chọn thế nào mà không lag? | A — Virtual scroll + filter dính | virtualization, search, list, performance |
| 004 | doc-set-heavy-states | Trạng thái nặng (hash/index/publish/empty/error/picker) nên hiển thị ra sao? | A — Inline progress + action | states, progress, picker, performance |
| 005 | profile-management-ui | Quản lý nhiều profile và luồng chọn → sửa → lưu → xuất bố trí ra sao? | C — List + detail + preview | layout, settings, profiles, management, ant-design |
| 006 | profile-review-controls | Làm rõ secret/path máy khi sửa profile cho người khác thế nào? | B — Review panel dính | states, review, checklist, secrets, profiles |
| 007 | chat-only-shell | Shell app chat-only nên gọn thế nào mà vẫn để đủ AI settings? | A — Chat full-bleed + gear | chat-only, shell, layout, ant-design |
| 008 | chat-ai-settings | Gom toàn bộ AI settings (provider, knowledge, MCP, Graphiti, Oracle, SSH, tool catalog) thế nào? | C — Side nav + accordion | settings, chat-only, tabs, ant-design |
| 009 | cr-detail-fast-scan | Màn hình chi tiết CR nên gom thông tin thế nào để quét nhanh mà không cuộn nhiều? | A — Header nén + 2 cột | cr-detail, layout, workbench, density |
| 010 | task-list-triage | Danh sách task từ nút Task trên taskbar nên lọc/chọn/cập nhật hàng loạt thế nào? | A — Bảng dày + toolbar dính | task-list, triage, batch, workbench, density |
| 011 | chat-ssh-file-browser | Chat standalone nên bố trí browser file SSH thế nào để chọn đúng tệp mà không làm chat bị lệch? | null | chat, ssh, file-browser, layout, standalone |
| 012 | telegram-remote-settings | Telegram chỉ dùng để setting từ xa và whitelist model theo từng user thì nên trình bày luồng nào để hiểu ngay ai/gì/ở đâu? | null | telegram, settings, whitelist, device-policy, per-user |
| 013 | standalone-access-request | User nhập Telegram ID + Request access, admin setup rồi Apply, standalone nhận settings tự động — luồng đó trình bày thế nào? | null | standalone, access-request, telegram, admin, push-settings, states |
| 014 | access-request-draft | Draft bám UI thật: đổi StandaloneDevicePolicyCard thành Request access, dùng card hàng chờ + modal whitelist có sẵn của #/telegram | null | draft, standalone, telegram, per-user, ant-design |
| 015 | ssh-file-picker | Chuẩn hoá chọn tệp SSH theo folder-picker của SSH Remote Explorer nhưng pick multiple files — bố cục/multi-select nào rõ nhất? | A — Two-column · VS Code faithful | chat, ssh, file-picker, multi-select, standalone, ant-design, consistency |
| 016 | doc-set-inspector-redesign | Thiết kế lại toàn màn hình Bộ tài liệu với right section không dồn control: đâu là cấu trúc đúng? | A — Inspector tách bạch | doc-set, inspector, modal, layout, workbench |
| 017 | tasklist-command-deck | Redesign toàn bộ trang Danh sách tác vụ — cấu trúc bảng/row nào giúp quét nhanh mà vẫn giữ thao tác hàng loạt? | A — Dense Table | task-list, command-deck, table, density, workbench, ant-design |
| 018 | splash-workbench | Splash screen TaskMate nên giữ chất workbench tối giản, kỹ thuật mà vẫn đủ cảm giác 'đang khởi động'? | E | splash, boot, workbench, dark, ant-design |
