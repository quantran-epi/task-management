# Phase 8: Optional Encrypted GitHub Backup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 8-Optional Encrypted GitHub Backup
**Areas discussed:** Credentials & Repo Setup, Conflict & Overwrite UX, Encrypted Payload Format, Remote Restore Flow

---

## Credentials & Repo Setup

### Question 1: Thông tin target repository (owner, repo, branch) và secret (token, passphrase) nên được lưu trữ như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Lưu repo info vào DB, secret trong memory | Owner, repo name, branch lưu vào bảng settings (IndexedDB) để tiện tái sử dụng; riêng GitHub fine-grained PAT và encryption passphrase chỉ lưu trong runtime session memory (mất khi reload/đóng tab). | ✓ |
| Tất cả chỉ lưu session memory | Tất cả gồm owner, repo, branch, token và passphrase chỉ nằm trong session memory. F5 hoặc đóng tab là xóa trắng toàn bộ. | |
| Nhập lại toàn bộ mỗi lần sync | Mỗi lần thực hiện sync mới mở modal nhập toàn bộ từ owner, repo đến token và passphrase. Không lưu lại gì. | |

**User's choice:** Lưu repo info vào DB, secret trong memory
**Notes:** Giúp giảm ma sát người dùng khi chỉ phải nhập repo owner/name/branch một lần, trong khi tuân thủ nghiêm ngặt ràng buộc SYNC-01 và SYNC-02 cho secret.

### Question 2: Vòng đời lưu trữ của GitHub token và passphrase trong runtime session memory nên như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Session Context có nút xóa chủ động | Nhập 1 lần dùng xuyên suốt phiên của tab qua React Context/in-memory singleton. Có nút bấm chủ động 'Xóa phiên đăng nhập' và tự mất sạch khi F5/đóng tab. | ✓ |
| Action-scoped: Nhập theo từng tác vụ | Mỗi lần bấm Backup hoặc Restore mới mở modal nhập token + passphrase. Xong tác vụ là purge khỏi biến ngay lập tức, lần sau phải nhập lại. | |

**User's choice:** Session Context có nút xóa chủ động
**Notes:** Tránh việc người dùng phải liên tục gõ lại token và passphrase dài trong cùng một phiên làm việc, đồng thời trao quyền chủ động purge credential bất cứ lúc nào.

### Question 3: Khu vực quản lý và thao tác GitHub Backup nên được tích hợp ở vị trí nào trong UI?
| Option | Description | Selected |
|--------|-------------|----------|
| Tab 'Sao lưu & Dữ liệu' tại Cài đặt | Đặt các card 'Cấu hình GitHub' và 'Sao lưu & Đồng bộ đám mây' trong tab 'Sao lưu & Dữ liệu' của SettingsView, liền mạch với các tính năng export/import file JSON hiện tại. | ✓ |
| Tab riêng 'GitHub Sync' tại Cài đặt | Tạo thêm tab thứ 3 trong SettingsView: 'capacity', 'data', 'github-sync' để tách biệt hoàn toàn sao lưu file nội bộ với sao lưu đám mây. | |
| Header AppShell Action Modal | Thêm nút/icon trên AppHeader mở Modal đồng bộ nhanh từ bất cứ trang nào mà không cần vào SettingsView. | |

**User's choice:** Tab 'Sao lưu & Dữ liệu' tại Cài đặt
**Notes:** Giữ nguyên kiến trúc 2 tab (`capacity` và `data`) đã thiết lập ở Phase 6, tập trung toàn bộ nghiệp vụ sao lưu vào một nơi trực quan.

### Question 4: Ứng dụng nên xác thực GitHub token và quyền truy cập repository như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Nút Kiểm tra kết nối chủ động | Cung cấp nút 'Kiểm tra kết nối' gọi GitHub API kiểm tra repo existence, branch và quyền contents (read/write), đồng thời hiển thị trạng thái file backup hiện có trên remote (SHA, kích thước, ngày sửa). | ✓ |
| Chỉ kiểm tra khi thực hiện thao tác | Không kiểm tra trước; chỉ gọi API khi người dùng ấn nút Upload hoặc Download, nếu lỗi quyền hoặc sai token sẽ hiển thị Alert/Notification thông báo lỗi. | |

**User's choice:** Nút Kiểm tra kết nối chủ động
**Notes:** Giúp người dùng xác minh token và permissions sớm trước khi chuẩn bị dữ liệu mã hóa.

---

## Conflict & Overwrite UX

### Question 1: Khi phát hiện SHA trên GitHub không khớp (do thiết bị khác đã push hoặc file bị sửa), ứng dụng nên xử lý thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Modal cảnh báo xung đột 3 lựa chọn | Chặn upload tự động. Bật Modal cảnh báo xung đột chi tiết, cho người dùng các lựa chọn rõ ràng: 'Tải và xem trước bản remote', 'Ghi đè bản remote bằng dữ liệu máy này (Force)', hoặc 'Hủy bỏ'. | ✓ |
| Chặn hoàn toàn, bắt buộc pull trước | Không cho phép ghi đè dưới bất kỳ hình thức nào khi SHA không khớp; bắt buộc người dùng phải tải/khôi phục từ remote trước rồi mới được push. | |
| Popconfirm ghi đè nhanh | Chỉ hiển thị popconfirm đơn giản 'Remote đã thay đổi, vẫn ghi đè?' rồi gọi API với SHA mới nhất của remote. | |

**User's choice:** Modal cảnh báo xung đột 3 lựa chọn
**Notes:** Cung cấp quyền kiểm soát đầy đủ cho người dùng, ngăn chặn việc vô tình làm mất dữ liệu remote.

### Question 2: Khi người dùng chủ động chọn 'Ghi đè bản remote (Force Overwrite)', cơ chế xác nhận an toàn nào nên được áp dụng?
| Option | Description | Selected |
|--------|-------------|----------|
| Nhập từ khóa 'OVERWRITE' | Yêu cầu gõ chính xác từ khóa 'OVERWRITE' vào ô input để kích hoạt nút ghi đè (nhất quán với mẫu 'RESTORE' ở Phase 6 và 'DELETE' ở ResetDb). | ✓ |
| Checkbox xác nhận rủi ro | Tick chọn checkbox 'Tôi chấp nhận ghi đè dữ liệu trên remote' để mở khóa nút bấm ghi đè. | |
| Modal cảnh báo cấp 2 | Hiện thêm một dialog Modal xác nhận cảnh báo đỏ cấp 2 trước khi gửi request với SHA mới. | |

**User's choice:** Nhập từ khóa 'OVERWRITE'
**Notes:** Đảm bảo tính nhất quán tuyệt đối về UX confirmation guard trong toàn bộ ứng dụng.

### Question 3: Ứng dụng nên kiểm tra SHA của remote file vào thời điểm nào khi người dùng bấm Upload?
| Option | Description | Selected |
|--------|-------------|----------|
| Pre-flight GET kiểm tra trước | Trước khi upload, luôn gửi GET request lấy SHA hiện tại của remote. Nếu remote đã có file mà SHA khác với SHA đã biết, hiển thị ngay màn hình so sánh xung đột trước khi mã hóa và gửi payload lớn. | ✓ |
| Bắt lỗi 409 Conflict từ PUT API | Gửi thẳng request PUT với SHA đang lưu trong memory. Nếu GitHub API trả về lỗi 409 Conflict thì mới bắt lỗi và hiển thị thông báo xung đột. | |

**User's choice:** Pre-flight GET kiểm tra trước
**Notes:** Tránh lãng phí tài nguyên CPU tính toán mã hóa AES-GCM và băng thông tải payload lớn khi file remote đã bị thay đổi từ trước.

### Question 4: Khi remote repository chưa có file `.task-management/backup.enc.json` (GET trả về 404), ứng dụng nên xử lý thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Tự động tạo mới file | Khi GET trả về 404, xác định là repo chưa có file backup. Hiển thị trạng thái 'Chưa có bản sao lưu trên GitHub' và gửi PUT không kèm trường sha để GitHub tự tạo file mới một cách mượt mà. | ✓ |
| Hỏi xác nhận khởi tạo file | Hiển thị thông báo hỏi người dùng 'File sao lưu chưa tồn tại trên repo, bạn có muốn khởi tạo file mới không?' trước khi gửi request tạo. | |

**User's choice:** Tự động tạo mới file
**Notes:** Trải nghiệm lần đầu tiên mượt mà, không gây bối rối bởi các pop-up không cần thiết.

---

## Encrypted Payload Format

### Question 1: Cấu trúc của file sao lưu mã hóa `.task-management/backup.enc.json` nên được đóng gói như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Semi-transparent Envelope | Envelope ngoài chứa metadata an toàn không nhạy cảm (app marker, schemaVersion, exportedAt, algorithm: 'AES-GCM', kdf: 'PBKDF2', salt, iv) và trường ciphertext chứa toàn bộ domain tables đã mã hóa. | ✓ |
| Fully Opaque (Mã hóa toàn diện) | Toàn bộ file chỉ gồm salt, iv và ciphertext thuần túy. Hoàn toàn không lộ ngày giờ hay loại app ra ngoài repo, nhưng phải nhập đúng passphrase mới biết được file có hợp lệ hay không. | |

**User's choice:** Semi-transparent Envelope
**Notes:** Cho phép ứng dụng kiểm tra tính tương thích phiên bản và hiển thị thời gian sao lưu trực tiếp từ remote trước khi cần nhập mật khẩu giải mã.

### Question 2: Bạn muốn áp dụng tham số PBKDF2 nào để phái sinh khóa AES-GCM 256-bit từ passphrase?
| Option | Description | Selected |
|--------|-------------|----------|
| OWASP 600k iterations SHA-256 | Chuẩn khuyến nghị OWASP hiện hành: 600.000 vòng lặp HMAC-SHA256, salt ngẫu nhiên 16 bytes (crypto.getRandomValues). Chống tấn công brute-force mạnh mẽ và thời gian tính toán trên trình duyệt rất nhanh (<200ms). | ✓ |
| Cổ điển 100k iterations | 100.000 vòng lặp PBKDF2 SHA-256. Tốc độ tính toán siêu nhanh nhưng độ bền mật mã thấp hơn chuẩn bảo mật hiện tại. | |

**User's choice:** OWASP 600k iterations SHA-256
**Notes:** Đạt chuẩn bảo mật hiện đại khắt khe nhất, bảo vệ an toàn cho dữ liệu cá nhân kể cả khi file mã hóa nằm trên public GitHub repo.

### Question 3: Dữ liệu nhị phân (salt, iv 96-bit, ciphertext) trong file JSON nên được mã hóa sang chuỗi bằng định dạng nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Base64 encoding | Base64 là định dạng chuẩn cho JSON và Web Crypto, tiết kiệm dung lượng hơn Hex 33%, tương thích hoàn hảo với GitHub Contents API (vốn sử dụng Base64 cho trường content). | ✓ |
| Hex string encoding | Mã hóa dạng chuỗi thập lục phân (hex string). Dễ đọc trực quan chuỗi byte nhưng làm kích thước file lớn hơn đáng kể. | |

**User's choice:** Base64 encoding
**Notes:** Tiết kiệm băng thông và tích hợp tự nhiên với Web Crypto BufferSource và GitHub Contents API.

### Question 4: Payload dữ liệu domain trước khi đưa vào hàm mã hóa AES-GCM nên được xử lý thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Tái sử dụng Phase 6 payload không nén | Sử dụng trực tiếp hàm exportBackupPayload và schema validation từ Phase 6, serialize sang JSON UTF-8 rồi mã hóa AES-GCM trực tiếp. Đơn giản, bền vững, dữ liệu cá nhân <1MB không cần nén phức tạp (tuân thủ nguyên tắc YAGNI). | ✓ |
| Nén Gzip qua CompressionStream | Dùng CompressionStream của trình duyệt để nén gzip JSON trước khi mã hóa nhằm giảm thêm ~70% dung lượng payload. | |

**User's choice:** Tái sử dụng Phase 6 payload không nén
**Notes:** Tuân thủ nguyên tắc YAGNI và ladder of abstraction, không thêm độ phức tạp nén khi dung lượng cơ sở dữ liệu cá nhân vẫn hoàn toàn dưới ngưỡng 1MB.

---

## Remote Restore Flow

### Question 1: Khi người dùng thực hiện thao tác tải bản sao lưu từ GitHub, ứng dụng nên xử lý bước nhập passphrase giải mã như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Tái sử dụng session passphrase nếu có | Nếu session memory đã có sẵn passphrase (ví dụ vừa upload xong), tự động dùng giải mã. Nếu chưa có hoặc giải mã lỗi (OperationError/sai passphrase), mở popup yêu cầu người dùng nhập passphrase để giải mã. | ✓ |
| Luôn yêu cầu nhập lại passphrase | Mỗi lần ấn 'Tải và giải mã từ GitHub', luôn luôn hiển thị modal bắt buộc nhập lại passphrase thủ công, không lấy từ session memory. | |

**User's choice:** Tái sử dụng session passphrase nếu có
**Notes:** Tạo sự thuận tiện tối đa cho người dùng trong phiên làm việc, nhưng fallback prompt linh hoạt khi passphrase chưa có hoặc sai.

### Question 2: Sau khi giải mã thành công dữ liệu từ GitHub, ứng dụng nên hiển thị xem trước và xác nhận khôi phục như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Tái sử dụng ImportPreviewModal Phase 6 | Đưa thẳng payload sau giải mã vào ImportPreviewModal (Phase 6): hiển thị bảng so sánh chênh lệch dữ liệu máy vs remote, tự động lưu snapshot an toàn trước khi phục hồi, yêu cầu gõ 'RESTORE' để xác nhận. | ✓ |
| Modal phục hồi riêng biệt | Xây dựng modal giao diện riêng biệt chuyên biệt cho GitHub Remote Restore. | |

**User's choice:** Tái sử dụng ImportPreviewModal Phase 6
**Notes:** Tối ưu hóa code reuse, đảm bảo cùng một tiêu chuẩn an toàn dữ liệu và cơ chế snapshot/rollback cho cả nguồn file local và nguồn GitHub.

### Question 3: Khi gặp lỗi giải mã hoặc dữ liệu remote không hợp lệ, ứng dụng nên phản hồi cho người dùng như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Thông báo rõ lỗi + Tải file thô | Phân loại rõ lỗi (sai passphrase/lỗi MAC AES-GCM vs cấu trúc dữ liệu không hợp lệ), tuyệt đối bảo toàn IndexedDB, kèm nút 'Tải file thô về máy' để người dùng tự kiểm tra khi cần cứu dữ liệu. | ✓ |
| Chỉ thông báo lỗi ngắn gọn | Hiển thị Alert lỗi ngắn gọn 'Giải mã dữ liệu từ GitHub thất bại' và đóng modal thao tác. | |

**User's choice:** Thông báo rõ lỗi + Tải file thô
**Notes:** Tránh gây mất dấu vết khi tệp trên remote bị lỗi ngoài ý muốn.

### Question 4: Trạng thái kết nối và lịch sử thao tác GitHub Backup nên được hiển thị và theo dõi như thế nào?
| Option | Description | Selected |
|--------|-------------|----------|
| Thẻ trạng thái + ghi backupMetadata | Hiển thị badge kết nối, SHA rút gọn của file trên remote, thời điểm đồng bộ gần nhất trên Card; đồng thời ghi nhận vào bảng backupMetadata để hiển thị trong lịch sử sao lưu của ứng dụng. | ✓ |
| Chỉ thông báo qua notification | Chỉ thông báo thành công qua toast notification sau mỗi lần thao tác, không lưu trạng thái hay lịch sử đồng bộ vào DB. | |

**User's choice:** Thẻ trạng thái + ghi backupMetadata
**Notes:** Đồng nhất lịch sử sao lưu cục bộ và sao lưu GitHub vào bảng audit log của hệ thống.

---

## Claude's Discretion
- Triển khai GitHub Contents API caller bằng native `fetch` (không cài thêm thư viện `@octokit/request` nếu `fetch` đã đáp ứng đầy đủ).
- Bố trí và tách component nhỏ gọn trong thư mục `src/components/settings/`.

## Deferred Ideas
None — discussion stayed strictly within the phase scope of manual encrypted GitHub backup and restore.
