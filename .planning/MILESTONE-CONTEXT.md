---
milestone: v1.4
name: Unified AI Office
status: draft-for-review
gathered: 2026-11-09
starts_at_phase: 35
previous_milestone: v1.3 SDLC Closed-Loop Engine & Repository Autonomy
source_session: 98174f4b-0b71-421d-baba-3fbdd438bdf7
---

# Milestone v1.4 — Unified AI Office

## Yêu cầu gốc của user (verbatim)

> hiện tại tính năng sdlc studio và tính năng Ai office đang chắp vá, lỗi rất nhiều. tôi tạo milestone này để thực sự chuẩn hóa 2 tính năng này thành 1 tính năng hợp nhất tên là AI office. milestone cần phân tách thật nhỏ các phase, discuss và research kỹ lưỡng, thực hiện phase 1 cách triệt để, không lỗi, kể cả lỗi lớn lẫn lỗi vặt. sẽ bỏ hoàn toàn sdlc studio, nghiên cứu 1 luồng hoàn toàn mới cho AI office để đáp ứng bài toán. về mặt trải nghiệm, tôi muốn tính năng AI office bắt đầu từ 1 trigger tại sidebar menu, tên là Ai office, khi mở ra sẽ có 2 phần ở explorer, phần trên là list các leader và agent, phần dưới là list các cuộc hội thoại, ấn vào cái nào ra chi tiết cái đó ở editor center working zone. các tính năng CRUD leader và agent vẫn vậy nhưng cần đảm bảo hoạt động chuẩn xác , ko lỗi. chúng ta đã bàn khá kỹ về tính năng này trong phase 34 nhưng thực thi nó vẫn thiếu hiệu quả, hoạt động không đúng chút nào, chúng ta sẽ bàn kỹ lại ở milestone này, từng chi tiết nhỏ. ý tưởng tổng quan của tôi là tôi sẽ tạo các agent với các kỹ năng chuyên biệt riêng: nghiên cứu database, sửa security issue, làm PL02, làm PL03, etc. cần có cả 1 cơ chế để training, làm giàu skill cho agent này over time. khi có 1 bài toán, tôi sẽ tạo CR với PL01 và PL02 trong notes, tạo 1 nhóm chat, liên kết CR với nhóm chat. sau đó tôi sẽ đưa yêu cầu cho leader, leader phân tích xem cần sử dụng những agent nào để thực hiện công việc thì sẽ phân công, chia việc. bây giờ sẽ ko giới hạn số lượng nhóm chat, hay số lượng agent trong mỗi nhóm. nhóm chat và các AI agent sẽ thực sự giống như 1 team thực hiện các công việc dưới sự giám sát của tôi. khi bắt đầu 1 nhóm chat, tôi sẽ cấp token cho nhóm, chia đều cho cả leader và các agent. có cảnh báo ngưỡng, khi gần đạt ngưỡng, cảnh báo và tôi sẽ cấp thêm cho từng agent, khi agent được cấp thêm, increase cả tổng token được cấp của cả nhóm. đo lường chính xác ,hiển thị chuẩn chỉ.

## Làm rõ mới nhất của user (verbatim)

> tức là luồng sẽ như này: user tạo nhóm chat AI, thêm leader và agent vào nhóm. sau đó user yêu cầu bất kỳ điều gì, không nhất thiết phải gán máy móc với CR hay PL01, Pl02, chỉ đơn giản là hệ thống có 1 list các agent có skill riêng biệt, khi cần thực hiện 1 công việc, trong số đó CR là 1 ví dụ, thì user sẽ tập hợp các AI vào nhóm và giao việc free style. hiểu ko

## Mục tiêu

v1.4 hợp nhất SDLC Studio và AI Office thành **một** workspace AI duy nhất tên AI Office. SDLC Studio bị xóa hoàn toàn khỏi sản phẩm; các artifact cũ (CR, PL01/PL02, tài liệu) chỉ còn là **context tùy chọn** mà một nhóm chat có thể đính kèm, không phải điều kiện để chạy. Mô hình làm việc là **chat-first, free-style**: user tạo nhóm chat trước, thêm đúng 1 leader và bao nhiêu agent tùy ý, rồi giao việc bất kỳ; leader phân tích và chia việc cho agent. Không giới hạn số nhóm chat, không giới hạn số agent mỗi nhóm, không có workflow bước/gate bắt buộc. Token budget là cứng, đo cả input+output, có cảnh báo ngưỡng và cấp thêm theo từng agent. Milestone ưu tiên phase nhỏ, discuss + research sâu từng phase, làm triệt để cả lỗi lớn lẫn lỗi vặt UX. Đánh số phase **tiếp nối từ Phase 35**, không renumber, không reset về 1.

## Quyết định user đã xác nhận

Chỉ các mục dưới đây được coi là chốt. Mọi thứ khác trong tài liệu này là câu hỏi mở.

- **C-01 Milestone identity**: v1.4 "Unified AI Office", bắt đầu từ Phase 35, tiếp nối roadmap v1.3.
- **C-02 Xóa hoàn toàn SDLC Studio**: user chọn "Xóa hoàn toàn" — xóa entry point, view, state machine và flow cũ; chỉ giữ domain dùng chung mà AI Office thực sự cần. Không ẩn sau flag, không đổi tên. Phần "dùng chung" phải qua audit trước khi xóa (xem mục SDLC removal), không mặc định giữ nguyên service cũ.
- **C-03 Chat-first**: user tạo **nhóm chat** trước, sau đó thêm leader và agent vào nhóm.
- **C-04 "Team" = nhóm chat**: không có thực thể container mới bọc nhiều chat. Một nhóm chat chính là một team làm việc.
- **C-05 Leader là entity riêng**: user chọn "Entity riêng" — leader tách khỏi agent, luôn điều phối nhóm; agent chỉ nhận việc từ leader; user vẫn có thể @mention agent.
- **C-06 Free-style, generic**: không nhất thiết gắn CR/PL01/PL02. Bất kỳ nhóm chat nào cũng có thể làm bất kỳ việc gì; CR chỉ là một ví dụ công việc.
- **C-07 CR/PL là context tùy chọn**: khi có và được đính kèm, leader/agent đọc được qua tool hiện có; khi không có, không chặn và không giảm chất lượng.
- **C-08 Không giới hạn số nhóm chat**.
- **C-09 Không giới hạn số agent mỗi nhóm** (thay đổi so với Phase 34).
- **C-10 Concurrency cấu hình được**: user chọn "Setting giới hạn runtime" — không giới hạn roster; user đặt số agent chạy đồng thời để bảo vệ CPU/API/token. Giá trị mặc định và ngữ nghĩa chính xác chưa chốt.
- **C-11 Token budget cứng, đo input+output**: theo dõi input + output token từng request; pause giữa tool rounds khi vượt ngưỡng.
- **C-12 Cảnh báo ngưỡng + cấp thêm per-agent**: có cảnh báo khi gần ngưỡng; user cấp thêm cho từng agent; cấp thêm cho agent **tăng cả tổng token của nhóm**.
- **C-13 Skill enrichment do user duyệt version**: agent đề xuất lesson/evidence; user chọn và duyệt bản Markdown skill mới. Không tự động cập nhật.
- **C-14 UI**: một trigger duy nhất ở sidebar tên "AI Office"; explorer có 2 phần — trên là danh sách leader + agent, dưới là danh sách cuộc hội thoại; click mở chi tiết ở editor center. CRUD leader/agent giữ nguyên hành vi nhưng phải hoạt động chính xác, không lỗi.
- **C-15 Phương pháp thực thi**: phase nhỏ, discuss + research kỹ từng phase, làm triệt để kể cả lỗi vặt; không tuyên bố "không còn lỗi" khi chưa verify thực tế.

## Điểm phải mở lại — KHÔNG tự động giữ

Các mục sau là lựa chọn lịch sử của Phase 34 hoặc chi tiết thiết kế chưa được user xác nhận trong milestone này. Đưa vào discuss/research, không mặc định kế thừa.

- **R-01 Leader "bảng riêng"**: C-05 chốt leader là entity riêng về mặt domain; việc có bảng DB riêng hay không là quyết định implementation chưa chốt.
- **R-02 Backup envelope v11 / bất kỳ version cụ thể**: chưa chốt; phụ thuộc schema cuối cùng.
- **R-03 Ngưỡng 80%**: Phase 34 dùng 80%; milestone này chỉ chốt "có cảnh báo ngưỡng". Giá trị và số ngưỡng cần chốt lại.
- **R-04 Ngưỡng cấu hình được**: chưa chốt; hiện chỉ có "có cảnh báo".
- **R-05 Giá trị concurrency mặc định**: chưa chốt ("conservative default 3" là Phase 34).
- **R-06 Hành vi pause/resume/batch semantics** khi chạm ngưỡng: chưa chốt.
- **R-07 Lead-only writes, employee read-only**: lựa chọn Phase 34, chưa xác nhận lại.
- **R-08 Per-mutation approval / auto-approve toggle**: chưa xác nhận.
- **R-09 Shared transcript + attribution model**: chưa xác nhận.
- **R-10 Cấm peer-to-peer agent chat**: chưa xác nhận lại.
- **R-11 Một skill per agent**: Phase 34 chốt scalar; chưa xác nhận cho mô hình mới.
- **R-12 Skill version restore**: mới chỉ duyệt "user duyệt version" (C-13); khả năng khôi phục version cũ chưa được duyệt.
- **R-13 Exact deletion inventory của SDLC services**: danh sách đường dẫn bên dưới là **ứng viên cần audit**, không phải danh sách xóa đã chốt. Service dùng chung phải được tách/reuse có kiểm chứng.
- **R-14 Migration nhiều chat/team**: không có quyết định migration từ team-scoped transcript sang nhiều nhóm chat; cần research và chốt.
- **R-15 Token accounting chi tiết**: cache tokens, retries, response thiếu usage, phần dư khi chia đều, ngữ nghĩa khi thêm member giữa chừng — tất cả chưa chốt.
- **R-16 Giữ schema/state chuyên biệt của PL/CAB/change pack**: user chưa chốt; câu trả lời trước là câu hỏi ngược ("nghĩa là sao, tận dụng được gì"), nên coi là mở.
- **R-17 Danh sách tool mà agent được phép dùng** trong mô hình free-style: chưa chốt.
- **R-18 Background execution, stop/abort UX**: chưa xác nhận.
- **R-19 Hình thức hiển thị "đo lường chính xác, hiển thị chuẩn chỉ"**: chưa chốt (đơn vị, vị trí, realtime hay theo lượt).
- **R-20 Knowledge retrieval, remote git/SSH, AI chat surfaces**: hành vi sau khi xóa SDLC chưa được audit.
- **R-21 Tên hiển thị và vị trí chính xác của trigger "AI Office"** trong stripe (thứ tự so với các tool window khác): chưa chốt.

## Phạm vi

### Trong phạm vi

- Hợp nhất thành một feature AI Office; xóa SDLC Studio.
- Chat-first UX, explorer 2 phần, editor center.
- CRUD leader/agent/skill/nhóm chat hoạt động chính xác.
- Leader điều phối, free-style assignment.
- Concurrency setting.
- Token budget cứng input+output, cảnh báo ngưỡng, top-up per-agent tăng tổng nhóm.
- Skill enrichment có duyệt version.
- Context tùy chọn từ CR/PL/tài liệu.
- Sửa lỗi lớn và lỗi vặt UX của AI Office hiện có.
- Audit và xử lý shared services sau khi xóa SDLC.

### Ngoài phạm vi

- PWA / GitHub Pages.
- Multi-user collaboration.
- Semantic/embedding search cho transcript.
- Peer-to-peer agent chat độc lập (trừ khi research mở lại R-10).
- Khôi phục SDLC step gating dưới bất kỳ hình thức nào.
- Chọn runtime/schema/package/provider mới ở bước context này.

## Việc phải làm — SDLC Studio removal

Ứng viên xóa (audit trước, xem R-13):

| Khu vực | Đường dẫn ứng viên | Phải audit trước khi xóa |
|---------|--------------------|---------------------------|
| UI SDLC | `src/components/sdlc/**`, `src/views/ChangeRequestSdlcView.tsx`, `src/components/ai/wizard/SdlcWorkflowHub.tsx` | component nào đang được AI Office hoặc chat dùng lại |
| Prompt/grounding | `src/services/ai/sdlcPromptComposer.ts`, `src/services/sdlc/groundingBuilder.ts` | `AIChatDrawer` đang import `buildConventionsSegment`; `aiOrchestratorLoop`/`aiTools` cũng tham chiếu |
| Artifact/tools | `src/services/ai/sdlcArtifactTools.ts`, `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` | tool registry dùng chung với AI Chat |
| Wizard/CR | `src/services/wizard/sdlcWizardRuntime.ts`, `src/services/wizard/sdlcCrManager.ts`, `src/services/wizard/artifactRepo.ts` | phần không đặc thù SDLC (CR data, restore) |
| Workbench | `'sdlc'` trong `EditorViewType` và route ở `EditorArea` | tab đang mở có thể đang persist |
| Data/backup | trường SDLC trong backup schema, chat tab type SDLC | version envelope, dữ liệu người dùng |
| Tests | test chỉ phục vụ SDLC | test dùng chung |

Yêu cầu: với mỗi nhóm, xác định (a) xóa được ngay, (b) phải tách shared phần ra trước, (c) không xóa vì AI Office cần. Không xóa theo danh sách mù.

## Việc phải làm — AI Office

- Explorer 2 phần + một trigger sidebar; điều hướng mở tab center ổn định, không mất state khi chuyển tool window.
- Chat-first creation: tạo nhóm chat → thêm leader/agent → giao việc.
- CRUD leader, agent, skill, nhóm chat: validation, empty state, lỗi mạng/AI, không crash.
- Leader orchestration free-style: phân tích yêu cầu, chọn agent theo skill, chia việc, tổng hợp.
- Concurrency setting có hiệu lực thực tế.
- Token accounting input+output trên mọi request; hiển thị đúng; top-up per-agent tăng tổng nhóm.
- Cảnh báo ngưỡng và luồng cấp thêm.
- Skill enrichment: đề xuất, user duyệt, lưu version mới.
- Đính kèm context CR/PL/tài liệu tùy chọn.
- Rà soát lỗi vặt UX hiện có của AI Office (đã biết feature hoạt động "không đúng chút nào").

## Bài học Phase 34

Phase 34 được đánh dấu complete nhưng trải nghiệm thực tế của user không đạt: luồng thiếu hiệu quả, hành vi sai. Vì vậy:

- Không dùng trạng thái "Phase 34 complete" làm bằng chứng chất lượng.
- Không tuyên bố "không còn lỗi" nếu chưa verify bằng walkthrough thực tế.
- Coi các D-quyết định Phase 34 là **giả thuyết cần kiểm chứng**, không phải nền tảng đã đúng.
- Mỗi phase phải có tiêu chí verify quan sát được từ phía user.

## Câu hỏi mở cho research

Không giới hạn số lượng; gom theo chủ đề.

**Mô hình nhóm chat**
- "Team" hiện tại (`aiTeams`, `aiTeamMembers`, `aiTeamLinks`) nên đổi tên/ánh xạ thế nào sang "nhóm chat" với migration additive?
- Quan hệ leader ↔ nhóm chat: 1 leader dùng lại nhiều nhóm, hay mỗi nhóm một leader instance?
- Hiển thị phần trên explorer khi số leader/agent lớn: search, group, virtualize?

**Assignment & execution**
- Leader chọn agent dựa trên dữ liệu nào (skill, capability, lịch sử)?
- Có cần card xác nhận phân công không, hay dispatch ngay?
- Concurrency setting áp ở đâu: batch, toàn cục, hay theo nhóm?
- Ngữ nghĩa pause/resume khi chạm ngưỡng và khi user top-up.

**Token**
- Ánh xạ input+output token lên các field usage hiện có; xử lý response thiếu usage.
- Cache token và retry có tính vào budget không?
- Chia đều khi tạo nhóm: xử lý phần dư/không chia hết.
- Thêm agent sau khi đã cấp token: cấp thêm hay chia lại?
- Top-up per-agent tăng tổng nhóm: có cần audit trail?
- Hiển thị "chính xác, chuẩn chỉ" gồm những gì (đã dùng/còn lại/đã cấp)?

**Skill**
- Lưu version thế nào; backup ảnh hưởng ra sao; có cần restore?
- Đề xuất enrichment sinh ra ở đâu, ai duyệt, lưu evidence gì?
- Một hay nhiều skill per agent trong mô hình mới?

**SDLC removal**
- Danh sách chính xác service dùng chung và cách tách.
- Xử lý dữ liệu SDLC đã persist trong Dexie và backup.
- Tab `sdlc` đang persist trong layout store.

**UX/lỗi hiện có**
- Liệt kê toàn bộ lỗi đã biết của AI Office/Staff/Team (từ walkthrough user).
- Hành vi tab center khi mở/đóng/relaunch.

## Tài liệu tham chiếu

- `.planning/phases/34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul/34-CONTEXT.md`
- `.planning/phases/34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul/34-RESEARCH.md`
- `src/types/aiOffice.ts`
- `src/views/AiOfficeView.tsx`, `src/views/TeamWorkspaceView.tsx`, `src/views/StaffDetailView.tsx`
- `src/services/ai/office/teamRunCoordinator.ts`, `src/services/ai/office/budgetGate.ts`
- `src/db/schema.ts`, `src/workbench/store/layoutStore.ts`
- `.planning/PROJECT.md`, `.planning/STATE.md`
