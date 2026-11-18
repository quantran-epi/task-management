# Phase 34: AI Office — AI Employees, Teams, and Skills - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 34-ai-office
**Areas discussed:** Điều phối ai nói tiếp, Transcript & quan sát, Quyền ghi & duyệt, Vòng đời & ngân sách, Bộ nhớ ngoài (transcript + search), Skill manager, Phân việc có xác nhận, Liên kết item

---

## Điều phối ai nói tiếp

| Option | Description | Selected |
|--------|-------------|----------|
| Lead agent điều phối | User chọn 1 lead, lead có tool `delegate_to_agent`, dừng khi không delegate nữa | ✓ |
| Round-robin theo thứ tự | Agent chạy lần lượt theo thứ tự user xếp, không ai làm lead | |
| User chỉ định từng lượt | User tự chọn agent nói tiếp sau mỗi lượt | |
| Lead + user chèn lượt | Lead điều phối mặc định, user chèn lượt bất kỳ lúc nào | |

**User's choice:** Lead agent điều phối
**Notes:** —

---

## Cơ chế "làm việc độc lập"

| Option | Description | Selected |
|--------|-------------|----------|
| Đồng bộ — chờ kết quả | Lead gọi 1 agent, chờ xong, gọi tiếp | |
| Bất đồng bộ — gửi rồi đi tiếp | Lead gửi việc rồi đi tiếp, kết quả đến sau | |
| Song song theo lô | Lead gửi nhiều delegation cùng lúc, chờ tất cả xong mới tổng hợp | ✓ |

**User's choice:** Song song theo lô
**Notes:** User hỏi lại "nếu lead phải chờ kết quả của 1 nhân viên thì các nhân viên không hoạt động độc lập được đúng không?" — đã giải thích khác biệt giữa tuần tự và lô song song; user chọn lô song song để có độc lập thật.

---

## Lead thấy gì về công việc của nhân viên

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ thấy kết quả tóm tắt | Lead thấy yêu cầu + roster + kết quả từng lô, không thấy transcript | ✓ |
| Thấy toàn bộ transcript | Lead thấy mọi thứ — context bùng nổ | |
| Thấy kết quả đầy đủ, không thấy tool | Trung dung | |

**User's choice:** Chỉ thấy kết quả tóm tắt
**Notes:** Sau đó điều chỉnh bằng cơ chế bộ nhớ ngoài (D-10) — lead có cửa sổ gần + search tool.

---

## Transcript

| Option | Description | Selected |
|--------|-------------|----------|
| Một transcript chung | Một thread, mỗi message gắn agentId, đọc như kênh Slack | ✓ |
| Thread riêng từng agent | Mỗi agent một thread, phải chuyển tab | |
| Chung + panel chi tiết | Mặc định chung, bấm avatar mở panel riêng | |

**User's choice:** Một transcript chung

---

## Cách user nói chuyện với nhóm

| Option | Description | Selected |
|--------|-------------|----------|
| Chat với lead | Mọi message vào lead, lead quyết định chia việc | |
| @mention agent bất kỳ | User chọn @agent để nói trực tiếp | ✓ |
| Cả hai | Mặc định vào lead, gõ @ thì vào agent | |

**User's choice:** @mention agent bất kỳ

---

## Hiển thị agent đang chạy

| Option | Description | Selected |
|--------|-------------|----------|
| Stream vào transcript | Agent đang chạy stream vào bubble của nó với badge trạng thái | ✓ |
| Chỉ hiện khi xong | Transcript chỉ ghi lượt xong, tiến độ ở thanh trạng thái | |
| Xong mới ghi + xem live riêng | Bấm vào agent để xem stream | |

**User's choice:** Stream vào transcript

---

## Quyền ghi

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ lead được ghi | Nhân viên read-only, chỉ lead mutate | ✓ |
| Ai cũng ghi được, duyệt từng cái | Mọi agent có mutation tool, nhiều thẻ duyệt | |
| Cấu hình theo từng agent | Mỗi agent có cờ `canMutate` | |

**User's choice:** Chỉ lead được ghi

---

## Duyệt mutation của lead

| Option | Description | Selected |
|--------|-------------|----------|
| Duyệt từng mutation | Thẻ duyệt như chat thường; auto-approve vẫn thắng | ✓ |
| Duyệt 1 lần cho cả lượt chạy | User duyệt một lần đầu lượt | |
| Nhóm không bao giờ ghi | Luôn read-only | |

**User's choice:** Duyệt từng mutation

---

## Dừng giữa chừng

| Option | Description | Selected |
|--------|-------------|----------|
| Dừng cả lượt chạy | Một nút huỷ lead + mọi agent | (ban đầu) |
| Dừng từng agent | Mỗi agent có nút dừng riêng | |
| Cả hai | Nút dừng tổng + nút trên từng bubble | ✓ |

**User's choice:** Cả hai
**Notes:** Ban đầu chọn "Dừng cả lượt chạy"; sau khi user nêu yêu cầu "user có thể stop bất kỳ agent nào" đã xác nhận lại và chốt cả hai. Agent bị dừng phải trả summary đánh dấu "bị dừng giữa chừng".

---

## Ngân sách / giới hạn

| Option | Description | Selected |
|--------|-------------|----------|
| 3 lô × 3 agent × 10 vòng | Giới hạn cứng theo lô và vòng | |
| Giới hạn theo token | Dừng khi tổng token vượt ngưỡng | |
| Cả hai | Lô/agent + token | |
| (free-text) | 3 nhóm active, 1 lead + 3 nhân viên, không giới hạn vòng tool, hiển thị token từng agent, ngưỡng cảnh báo, stop từng agent | ✓ |

**User's choice:** Free-text — mô hình nhóm cố định 3 active, roster 1 lead + 3 nhân viên, không giới hạn vòng tool, minh bạch token, có ngưỡng cảnh báo và stop từng agent.

---

## Ngưỡng token

| Option | Description | Selected |
|--------|-------------|----------|
| Cảnh báo 80%, tự dừng 100% | Vượt 80% cảnh báo, vượt 100% tự dừng | |
| Chỉ hiện số, không tự dừng | Không tự dừng | |
| Cảnh báo nhưng không tự dừng | Chỉ user dừng được | |
| (free-text) | 80% → pause + notify, không tự dừng; user cấp thêm token thì chạy tiếp; đến 80% của ngưỡng mới lại báo | ✓ |

**User's choice:** Free-text — pause + notify tại 80%, không bao giờ tự dừng.

---

## Pause ở đâu

| Option | Description | Selected |
|--------|-------------|----------|
| Pause giữa các vòng tool | Tool call hiện tại xong, dừng trước vòng kế; giữ context | ✓ |
| Abort rồi chạy lại | Abort ngay, mất phần đã làm | |
| Pause sau khi stream xong | Cho stream xong câu hiện tại rồi pause | |

**User's choice:** Pause giữa các vòng tool

---

## Một agent pause thì agent khác thế nào

| Option | Description | Selected |
|--------|-------------|----------|
| Pause cả lô | Cả lô pause | |
| Chỉ pause agent đó | Agent khác chạy tiếp; lead chờ agent bị pause | ✓ |
| Agent pause, trả summary, lô tiếp | Agent bị pause trả summary, lô tiếp tục | |

**User's choice:** Chỉ pause agent đó

---

## Lead làm gì khi agent pause

| Option | Description | Selected |
|--------|-------------|----------|
| Lead nhận marker, lượt chạy chờ | Lô chờ các agent khác xong, lead nhận marker "đang pause chờ user cấp token" | ✓ |
| Lead chờ cứng | Không gì chạy tiếp, UI như treo | |
| Kết thúc lượt chạy | Lô kết thúc, user cấp token thì tạo lượt mới | |

**User's choice:** Lead nhận marker, lượt chạy chờ

---

## Chạy nền

| Option | Description | Selected |
|--------|-------------|----------|
| Chạy nền, rời tab vẫn chạy | `aiTurnManager` + `useChatTurn({background:true})` | ✓ |
| Rời tab thì dừng | Abort toàn bộ | |
| Chạy nền + cảnh báo đóng app | Thêm cảnh báo | |

**User's choice:** Chạy nền, rời tab vẫn chạy

---

## Active lại nhóm

| Option | Description | Selected |
|--------|-------------|----------|
| Transcript tích lũy | Tiếp tục đúng transcript cũ, agent nhớ việc cũ | ✓ |
| Mỗi lần active = phiên mới | Transcript mới, cũ lưu trữ | |
| Tích lũy + nút chủ đề mới | Tích lũy nhưng cắt context được | |

**User's choice:** Transcript tích lũy

---

## Nhân viên dùng chung giữa các nhóm

| Option | Description | Selected |
|--------|-------------|----------|
| Toàn cục, nhiều nhóm | Tạo một lần, dùng nhiều nhóm | ✓ |
| Thuộc một nhóm | Phải tạo bản sao | |
| Toàn cục + override theo nhóm | Override persona/vai trò theo nhóm | |

**User's choice:** Toàn cục, nhiều nhóm

---

## Cấu hình nhân viên

| Option | Description | Selected |
|--------|-------------|----------|
| Tên + vai trò + prompt + model | Không có tool riêng | |
| Thêm allowlist tool riêng | Mỗi agent có allowlist tool | ✓ |
| Thêm ngưỡng token riêng | Mỗi agent có ngưỡng riêng | |

**User's choice:** Thêm allowlist tool riêng
**Notes:** Sau đó thu hẹp: nhân viên đồng loạt read-only, lead giữ toàn bộ tool read-only. Allowlist chi tiết từng agent chuyển sang deferred.

---

## Bố trí UI

| Option | Description | Selected |
|--------|-------------|----------|
| Tab nhân viên + page nhóm riêng | `EditorViewType 'agents'` + `'teams'` | ✓ |
| Một tab gộp cả hai | Sidebar nhân viên + vùng nhóm | |
| Nhân viên trong Settings + page nhóm | Tách cấu hình và sử dụng | |

**User's choice:** Tab nhân viên + page nhóm riêng

---

## Lead là gì

| Option | Description | Selected |
|--------|-------------|----------|
| Lead là nhân viên được gán | Cùng persona/model, thêm tool delegate | |
| Lead là thực thể riêng | Persona riêng, model riêng, bảng riêng | ✓ |
| Lead mặc định hệ thống | Không sửa được persona | |

**User's choice:** Lead là thực thể riêng

---

## Quản lý và hiển thị lead

| Option | Description | Selected |
|--------|-------------|----------|
| Bảng riêng, chọn theo nhóm | Bảng `aiLeads`, mục riêng, chọn 1 lead/nhóm | ✓ |
| Bảng riêng, chung tab với badge | Một danh sách với badge "Lead" | |
| Lead gắn cứng lúc tạo nhóm | Không đổi được sau đó | |

**User's choice:** Bảng riêng, chọn theo nhóm

---

## Bộ nhớ ngoài (transcript + search)

| Option | Description | Selected |
|--------|-------------|----------|
| Cửa sổ gần + search phần xa | Thấy yêu cầu + instruction + kết quả cùng lô + N lượt gần; xa hơn thì search | ✓ |
| Tối thiểu, search tất cả | Chỉ yêu cầu + instruction + kết quả cùng lô | |
| Cửa sổ lớn + search | 50 lượt gần + search | |

**User's choice:** Cửa sổ gần + search phần xa
**Notes:** User nhấn mạnh agent phải thấy **toàn bộ instruction lead đã giao cho nó từ trước đến nay**.

---

## Cơ chế search

| Option | Description | Selected |
|--------|-------------|----------|
| BM25 trên transcript | Một tool, dùng `src/utils/bm25.ts` | |
| Search + đọc toàn văn | `search_team_history` trả trích đoạn + `read_team_turn` đọc toàn văn | ✓ |
| Search ngữ nghĩa qua Knowledge Server | Embedding, phụ thuộc Docker | |

**User's choice:** Search + đọc toàn văn
**Notes:** User yêu cầu giải thích kỹ 3 option trước khi chọn. Option ngữ nghĩa bị loại vì vi phạm offline-first.

---

## Lead thấy gì (cơ chế bộ nhớ)

| Option | Description | Selected |
|--------|-------------|----------|
| Cửa sổ gần + search | Lead thấy yêu cầu + N lượt gần + search tool | ✓ |
| Toàn bộ instruction của mình + search | Đầy đủ hơn nhưng phình context | |
| Toàn bộ transcript | Không giới hạn | |

**User's choice:** Cửa sổ gần + search

---

## Agent thấy assignment của mình thế nào

| Option | Description | Selected |
|--------|-------------|----------|
| Toàn bộ assignment của mình | Mọi instruction lead đã giao + kết quả các lần báo cáo + cửa sổ gần + search | ✓ |
| Chỉ assignment hiện tại | Nhẹ hơn nhưng quên việc cũ | |
| Assignment + tóm tắt báo cáo cũ | Trung dung | |

**User's choice:** Toàn bộ assignment của mình

---

## Agent có nói chuyện trực tiếp với nhau không

| Option | Description | Selected |
|--------|-------------|----------|
| Qua lead, không trực tiếp | Agent nêu thắc mắc trong báo cáo, lead giao lô mới | ✓ |
| ask_colleague, giới hạn 1 tầng | Hỏi thẳng đồng nghiệp, sub-turn đồng bộ | |
| ask_colleague tự do | Không giới hạn độ sâu | |

**User's choice:** Qua lead, không trực tiếp
**Notes:** User hỏi lại để làm rõ cơ chế "qua lead" trước khi chốt. `ask_colleague` bị loại vì phá mô hình lô và khó kiểm soát đệ quy.

---

## Budget tổng và budget từng agent

| Option | Description | Selected |
|--------|-------------|----------|
| Cả hai, mỗi ngưỡng pause riêng | Budget nhóm + budget agent, chạm 80% của bất kỳ ngưỡng nào thì pause | ✓ |
| Chỉ budget tổng | Agent chỉ hiển thị số | |
| Chỉ budget từng agent | Budget tổng chỉ hiển thị | |

**User's choice:** Cả hai, mỗi ngưỡng pause riêng

---

## Budget reset khi nào

| Option | Description | Selected |
|--------|-------------|----------|
| Tổng theo lượt chạy, agent tích lũy | Reset tổng mỗi lượt, giữ budget agent | |
| Cả hai tích lũy | Chỉ reset thủ công | |
| Cả hai reset mỗi lượt | Không kiểm soát tổng chi phí | |
| (free-text) | Budget theo nhóm, tích lũy, hết thì user cấp thêm bất cứ lúc nào | ✓ |

**User's choice:** Free-text — budget theo nhóm, tích lũy, cấp thêm bất cứ lúc nào.

---

## Giá trị mặc định budget

| Option | Description | Selected |
|--------|-------------|----------|
| 500k nhóm / 100k agent | Mặc định cân bằng | |
| 200k nhóm / 50k agent | Tiết kiệm | |
| 1M nhóm / 200k agent | Thoải mái | |
| (free-text) | User cài budget cho nhóm, app gợi ý chia cho từng agent kể cả lead, không cần mặc định | ✓ |

**User's choice:** Free-text — user đặt budget nhóm trong team settings, app gợi ý chia đều.

---

## App gợi ý chia budget thế nào

| Option | Description | Selected |
|--------|-------------|----------|
| Chia đều, sửa được | User nhập tổng, app chia đều cho lead + agent, sửa được từng ô | ✓ |
| Chỉ budget nhóm, không chia | Chỉ ngưỡng cảnh báo theo % tổng | |
| Chia theo vai trò | Lead 40%, nhân viên chia phần còn lại | |

**User's choice:** Chia đều, sửa được

---

## Skill bản chất là gì

| Option | Description | Selected |
|--------|-------------|----------|
| Skill = prompt template | Prompt + mô tả + hướng dẫn, nối vào system prompt | ✓ |
| Skill = workflow tool | Chuỗi tool call cố định | |
| Skill = prompt + tool allowlist | Prompt + allowlist + output schema | |

**User's choice:** Skill = prompt template
**Notes:** User nói rõ "giống claude code custom skill".

---

## Skill nạp vào agent thế nào

| Option | Description | Selected |
|--------|-------------|----------|
| SKILL.md + progressive disclosure | Agent nhận description; body đọc qua `read_skill` | ✓ |
| Nối thẳng toàn bộ vào prompt | Đơn giản nhưng phình context | |
| Chỉ nối khi agent gọi tool | Không tự động nối gì | |

**User's choice:** SKILL.md + progressive disclosure

---

## Skill quản lý và gán thế nào

| Option | Description | Selected |
|--------|-------------|----------|
| Skill toàn cục, gán ở agent | Tạo/sửa ở tab riêng, gán 1 skill/agent | ✓ |
| Skill thuộc agent | Không dùng lại được | |
| Skill toàn cục, nhiều skill/agent | Phá giới hạn 1 skill/agent | |

**User's choice:** Skill toàn cục, gán ở agent

---

## Lead xác nhận phân việc

| Option | Description | Selected |
|--------|-------------|----------|
| Thẻ xác nhận kế hoạch | Lead trả kế hoạch phân việc dạng thẻ, user duyệt thì lô chạy | ✓ |
| Duyệt từng việc | Hỏi từng việc một | |
| Không hỏi, tự chia | Chỉ có bypass mode | |

**User's choice:** Thẻ xác nhận kế hoạch

---

## Bypass phân việc đặt ở đâu

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle theo nhóm | Cài đặt nhóm "Tự động chia việc", giống auto-approve | ✓ |
| Toggle theo lượt gửi | Bật/tắt trên ô chat | |
| Toggle theo lead | Lead nào tin thì bật sẵn | |

**User's choice:** Toggle theo nhóm

---

## Nhóm link được với loại item nào

| Option | Description | Selected |
|--------|-------------|----------|
| CR + task + system + note + document | Năm loại item | ✓ |
| Chỉ CR + system | Đúng trọng tâm SDLC | |
| Mọi thực thể | Kể cả project/milestone | |

**User's choice:** CR + task + system + note + document

---

## Tool truy xuất linked item

| Option | Description | Selected |
|--------|-------------|----------|
| Một tool trả toàn bộ | `get_linked_context()` không tham số | |
| Tool theo từng item | `get_linked_context({ itemType, itemId })` | |
| List + lấy chi tiết | `list_linked_items()` + `get_linked_context({ itemId })` | ✓ |

**User's choice:** List + lấy chi tiết

---

## Lead có tool gì để truy xuất linked item

| Option | Description | Selected |
|--------|-------------|----------|
| Toàn bộ tool read-only hiện có | Toàn bộ tool read-only + `list_linked_items` + `get_linked_context` | ✓ |
| Chỉ tool linked-item chuyên dụng | Không đụng tool chung | |
| Cả hai | Tool chung + tool chuyên dụng | |

**User's choice:** Toàn bộ tool read-only hiện có
**Notes:** User nhấn mạnh lead phải có **đủ** tool truy xuất thông tin của mọi linked item, không chỉ metadata tóm tắt.

---

## Claude's Discretion

- Layout thẻ kế hoạch phân việc, dialog cấp thêm token, banner agent bị pause — theo chuẩn IntelliJ ExpUI Islands Light hiện có.
- Avatar/icon từng nhân viên.
- Tokenization BM25 và độ dài trích đoạn cho `search_team_history`.
- Tab nhân viên và quản lý lead là hai sub-tab hay một danh sách có filter theo loại.

## Deferred Ideas

- `ask_colleague` — agent nói chuyện trực tiếp với nhau. Loại vì phá mô hình lô, đệ quy khó kiểm soát.
- Search ngữ nghĩa qua Knowledge Server — loại vì vi phạm offline-first.
- Allowlist tool chi tiết theo từng agent — thu hẹp thành "nhân viên read-only, lead giữ toàn bộ tool read-only".
- Nhiều skill cho một agent — giới hạn 1 skill/agent trong phase này.
- Nâng giới hạn 3 nhóm active / 3 nhân viên — để sau.
- Hỗ trợ soạn skill bằng AI, versioning skill — capability riêng.
