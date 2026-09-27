# Phase 7: PWA Offline Capability & Lifecycle Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 07-PWA Offline Capability & Lifecycle Hardening
**Areas discussed:** Update & Reload Safety, Install Experience, Offline Feedback, Storage Persistence

---

## Update & Reload Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Notification Banner nổi (Khuyên dùng) | Thanh thông báo nổi cố định (Bottom Banner hoặc Top Alert) có nút 'Cập nhật ngay' và 'Để sau'. Không chặn màn hình đang thao tác. | ✓ |
| Modal Dialog Popup | Hộp thoại Ant Design Modal bật giữa màn hình thông báo phiên bản mới và xác nhận tải lại trang. | |
| Badge trong Settings | Chỉ hiện badge chấm đỏ ở Menu/Settings, người dùng chủ động vào xem và bấm cập nhật khi rảnh. | |

**User's choice:** Notification Banner nổi (Khuyên dùng)
**Notes:** Non-modal notification that allows continuing current task without disruption.

| Option | Description | Selected |
|--------|-------------|----------|
| Chặn nếu form đang mở (Khuyên dùng) | Nếu đang mở Drawer/Modal chỉnh sửa (TaskDrawer, AllocationModal, Settings), hiện cảnh báo yêu cầu lưu/hủy trước khi reload. Khi màn hình rảnh rỗi mới gọi skipWaiting. | ✓ |
| Theo dõi IndexedDB write locks | Tạo một trình theo dõi giao dịch IndexedDB đang ghi (active write mutex/counter), chặn reload cho đến khi mọi giao dịch Dexie hoàn tất. | |
| Xác nhận đơn giản rồi reload | Không chặn biểu mẫu, chỉ xác nhận nhẹ 'Dữ liệu chưa lưu có thể mất' rồi gọi reload ngay lập tức. | |

**User's choice:** Chặn nếu form đang mở (Khuyên dùng)
**Notes:** Prevents accidental data loss by guarding against reload while forms are active.

| Option | Description | Selected |
|--------|-------------|----------|
| Khi khởi động & chuyển tab (Khuyên dùng) | Tự động gọi updateServiceWorker khi app khởi động và mỗi khi người dùng chuyển lại tab (sự kiện focus / visibilitychange). Tiết kiệm CPU/mạng. | ✓ |
| Định kỳ 60 phút + focus tab | Kiểm tra nền định kỳ mỗi 60 phút (setInterval) kết hợp kiểm tra khi focus tab. Phù hợp nếu người dùng giữ tab mở liên tục nhiều ngày. | |
| Chỉ khi khởi chạy ứng dụng | Chỉ kiểm tra lúc khởi chạy ứng dụng lần đầu hoặc khi người dùng chủ động F5. Không chạy kiểm tra nền. | |

**User's choice:** Khi khởi động & chuyển tab (Khuyên dùng)
**Notes:** Balances prompt detection with minimal overhead.

| Option | Description | Selected |
|--------|-------------|----------|
| Thu nhỏ vào Header & Settings (Khuyên dùng) | Ẩn banner thông báo, nhưng thu nhỏ thành một biểu tượng/nút 'Cập nhật' nhỏ trên Header (kèm badge trong Cài đặt) để người dùng bấm lại khi sẵn sàng. | ✓ |
| Ẩn cho đến phiên tiếp theo | Đóng hoàn toàn thông báo trong phiên làm việc hiện tại, chỉ hiện lại khi mở tab mới hoặc khởi động lại app. | |
| Nhắc lại sau 1 giờ | Tạm ẩn và tự động hiển thị lại banner sau 1 giờ nếu người dùng chưa cập nhật. | |

**User's choice:** Thu nhỏ vào Header & Settings (Khuyên dùng)
**Notes:** Banner collapses into a non-intrusive header icon/badge.

---

## Install Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Nút Header & Settings (Khuyên dùng) | Hiển thị nút 'Cài đặt' trực tiếp trên Header (hoặc icon tải về cạnh StatusBadge) và thêm mục trạng thái cài đặt trong Cài đặt. Tự động ẩn khi đã cài đặt (standalone). | ✓ |
| Banner nổi mời cài đặt | Hiển thị một thanh banner nổi ở đáy màn hình mời cài đặt ứng dụng vào máy, có nút đóng. | |
| Chỉ đặt trong Settings | Chỉ đặt tùy chọn và trạng thái cài đặt bên trong trang Cài đặt (Settings), không thêm nút ở Header. | |

**User's choice:** Nút Header & Settings (Khuyên dùng)
**Notes:** Readily accessible in Header while visible in Settings.

| Option | Description | Selected |
|--------|-------------|----------|
| Modal hướng dẫn iOS (Khuyên dùng) | Khi người dùng bấm 'Cài đặt' trên iOS Safari, mở modal hướng dẫn trực quan: Bấm nút Chia sẻ (Share) -> chọn 'Thêm vào MH chính' (Add to Home Screen). | ✓ |
| Ẩn nút trên iOS Safari | Ẩn hoàn toàn nút cài đặt trên iOS Safari vì không gọi được prompt native của trình duyệt. | |
| Tooltip giải thích liên tục | Hiển thị tooltip giải thích vĩnh viễn trên Header khi phát hiện trình duyệt không có beforeinstallprompt. | |

**User's choice:** Modal hướng dẫn iOS (Khuyên dùng)
**Notes:** Guides iOS Safari users through manual home screen addition.

| Option | Description | Selected |
|--------|-------------|----------|
| Bộ icon chuẩn PWA + maskable (Khuyên dùng) | Tạo bộ icon PNG tiêu chuẩn (192x192, 512x512, 512x512 maskable) với theme màu #1677ff và biểu tượng task/calendar để đạt chuẩn Lighthouse PWA và hiển thị sắc nét trên mọi OS. | ✓ |
| Chỉ dùng SVG duy nhất | Chỉ cấu hình 1 file SVG vector duy nhất cho manifest để giảm thiểu dung lượng asset. | |
| Icon cơ bản không maskable | Dùng bộ icon tối giản 192x192 và 512x512 cơ bản không cần phiên bản maskable. | |

**User's choice:** Bộ icon chuẩn PWA + maskable (Khuyên dùng)
**Notes:** Ensures clean Lighthouse audit score and crisp presentation.

| Option | Description | Selected |
|--------|-------------|----------|
| Message thông báo + cập nhật Badge (Khuyên dùng) | Bắn thông báo Ant Design message + AriaLiveRegion 'Ứng dụng đã được cài đặt thành công', đồng thời chuyển trạng thái trong Settings thành 'Đã cài đặt' (Badge xanh). | ✓ |
| Ẩn âm thầm không thông báo | Âm thầm ẩn nút cài đặt ngay khi sự kiện appinstalled kích hoạt, không hiển thị thêm thông báo nào. | |
| Modal popup chào mừng | Mở popup chào mừng giải thích cách mở app từ thanh taskbar hoặc màn hình chính. | |

**User's choice:** Message thông báo + cập nhật Badge (Khuyên dùng)
**Notes:** Immediate positive feedback on app installation.

---

## Offline Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Message thông báo chuyển trạng thái (Khuyên dùng) | Khi mất mạng: message.warning kèm thông báo qua AriaLiveRegion ('Đang làm việc ngoại tuyến, dữ liệu lưu cục bộ'). Khi có mạng lại: message.success ('Đã kết nối lại mạng'). StatusBadge đổi màu tương ứng. | ✓ |
| Banner Alert cố định khi offline | Hiển thị một thanh Ant Design Alert màu vàng cố định ngay dưới Header trong suốt thời gian mất mạng, chỉ ẩn khi có mạng trở lại. | |
| Chỉ dùng StatusBadge sẵn có | Chỉ thay đổi màu sắc và text của StatusBadge trên Header, không hiển thị thêm bất kỳ toast hay banner nào. | |

**User's choice:** Message thông báo chuyển trạng thái (Khuyên dùng)
**Notes:** Dual notification through UI message and accessible AriaLiveRegion.

| Option | Description | Selected |
|--------|-------------|----------|
| Precache toàn bộ build assets (Khuyên dùng) | Precache 100% tài nguyên build tĩnh (HTML, JS, CSS, SVG, icons) bằng Workbox precache. Tài nguyên ngoài (nếu có, như font) dùng StaleWhileRevalidate. Đảm bảo offline 100% ngay từ lần tải đầu. | ✓ |
| NetworkFirst cho HTML | Dùng NetworkFirst cho file HTML (luôn thử tải mới trước khi dùng cache) và CacheFirst cho JS/CSS tĩnh. Có thể gây trễ khi mạng yếu. | |
| Precache tối thiểu | Chỉ cache tối thiểu file index.html và 2 bundle JS/CSS chính, bỏ qua các icon và static json để tiết kiệm bộ nhớ cache. | |

**User's choice:** Precache toàn bộ build assets (Khuyên dùng)
**Notes:** True offline-first guarantees without network delay.

| Option | Description | Selected |
|--------|-------------|----------|
| SPA navigateFallback subpath (Khuyên dùng) | Cấu hình navigateFallback về '/task-management/index.html' (khớp với base repo Vite) để khi offline, mọi thao tác reload trang hay gõ URL đều nạp SPA mượt mà không lỗi 404. | ✓ |
| Trang offline.html riêng | Tạo riêng một file offline.html độc lập chỉ hiện chữ 'Bạn đang ngoại tuyến' khi truy cập URL mới. (Không khuyến khích vì app là offline-first). | |
| Để mặc định không chỉ định | Không cấu hình navigateFallback, dựa vào cơ chế cache mặc định của trình duyệt. | |

**User's choice:** SPA navigateFallback subpath (Khuyên dùng)
**Notes:** Prevents 404s when navigating subpath offline.

| Option | Description | Selected |
|--------|-------------|----------|
| Thẻ trạng thái trong Cài đặt (Khuyên dùng) | Thêm một Card 'Trạng thái PWA & Ngoại tuyến' trong Cài đặt: hiển thị Trạng thái Service Worker (Đang chạy), Chế độ offline (Sẵn sàng), và nút kiểm tra cập nhật thủ công. Giúp kiểm tra trực quan. | ✓ |
| Ẩn hoàn toàn trong Cài đặt | Không thêm gì vào Cài đặt để giữ giao diện tối giản; mọi thứ tự động hoạt động ngầm. | |
| Chỉ nút Clear Cache | Chỉ thêm nút 'Xóa bộ nhớ đệm (Clear SW Cache)' dành riêng cho mục đích gỡ lỗi (debug). | |

**User's choice:** Thẻ trạng thái trong Cài đặt (Khuyên dùng)
**Notes:** Gives visual certainty about offline status and cache readiness.

---

## Storage Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Tự động kích hoạt khi khởi động (Khuyên dùng) | Tự động kiểm tra navigator.storage.persisted() khi app nạp. Nếu chưa, tự động gọi navigator.storage.persist() ngầm để yêu cầu trình duyệt không tự dọn dẹp IndexedDB (đặc biệt Safari/iOS). | ✓ |
| Nút bật thủ công trong Cài đặt | Hiển thị mục 'Bảo vệ dữ liệu cục bộ' trong Cài đặt với switch hoặc nút bấm để người dùng chủ động yêu cầu quyền. | |
| Kích hoạt kèm cài đặt PWA | Chỉ kích hoạt lưu trữ bền vững khi người dùng cài đặt ứng dụng thành công (sự kiện appinstalled). | |

**User's choice:** Tự động kích hoạt khi khởi động (Khuyên dùng)
**Notes:** Proactively protects IndexedDB on startup without waiting for manual action.

| Option | Description | Selected |
|--------|-------------|----------|
| Hiển thị trạng thái & dung lượng (Khuyên dùng) | Trong tab Dữ liệu của Settings, hiển thị thẻ 'Bộ nhớ cục bộ': Trạng thái lưu trữ bền vững (Bền vững / Tạm thời) và Dung lượng ước tính đã dùng (navigator.storage.estimate - ví dụ: 2.4 MB / 15 GB). | ✓ |
| Chỉ hiển thị trạng thái bật/tắt | Chỉ hiển thị nhãn trạng thái 'Lưu trữ bền vững: Đã bật', không hiển thị số liệu dung lượng MB/GB. | |
| Không hiển thị thông tin bộ nhớ | Không đưa thông tin bộ nhớ vào Settings để tránh làm người dùng bối rối. | |

**User's choice:** Hiển thị trạng thái & dung lượng (Khuyên dùng)
**Notes:** Transparent overview of storage usage and durability status.

| Option | Description | Selected |
|--------|-------------|----------|
| Cảnh báo mềm trong Settings (Khuyên dùng) | Nếu trình duyệt từ chối persistent storage (trả về false), hiển thị cảnh báo mềm màu vàng trong Settings: 'Trình duyệt đang lưu trữ tạm thời. Hãy thường xuyên tải bản sao lưu JSON'. Không làm phiền màn hình chính. | ✓ |
| Modal cảnh báo khi vào app | Bật modal cảnh báo người dùng ngay khi vào app nếu storage không được cấp quyền bền vững. | |
| Bỏ qua không cảnh báo | Âm thầm bỏ qua, không hiện cảnh báo nào. | |

**User's choice:** Cảnh báo mềm trong Settings (Khuyên dùng)
**Notes:** Gently informs user to maintain regular JSON backups without annoying popups.

| Option | Description | Selected |
|--------|-------------|----------|
| Feature detection & fallback an toàn (Khuyên dùng) | Kiểm tra feature detection nghiêm ngặt cho từng API ('serviceWorker' in navigator, 'storage' in navigator, ...), bọc try/catch. Trên Safari/Firefox không hỗ trợ install prompt thì vẫn chạy mượt mà như web app chuẩn. | ✓ |
| Cảnh báo trình duyệt ngoài Chrome/Edge | Hiển thị banner cảnh báo nếu người dùng không dùng Chrome hoặc Edge. | |
| Giả định hỗ trợ đầy đủ | Bỏ qua các trình duyệt cũ, giả định mọi trình duyệt đều hỗ trợ đầy đủ API PWA hiện đại. | |

**User's choice:** Feature detection & fallback an toàn (Khuyên dùng)
**Notes:** Guarantees solid cross-browser experience across Chrome, Edge, Firefox, and Safari.

---

## Claude's Discretion

- Token-based design for floating update banner and status indicators.
- SVG artwork for app icon generation conforming to `#1677ff` styling.
- Internal hook abstractions for service worker events and storage persistence.

## Deferred Ideas

None — discussion stayed within phase scope.
