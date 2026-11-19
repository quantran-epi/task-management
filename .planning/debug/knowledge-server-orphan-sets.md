---
status: diagnosed
trigger: "Thực chất chỉ có 1 set thôi, các set thừa trên server chắc là tồn dư của các lần test trước đó, check xem xóa set local có xóa set trên server không, tại sao còn tồn dư rác."
created: 2026-11-19
updated: 2026-11-19
---

# Symptoms

- **Expected:** Khi xóa document set trong TaskMate, knowledge server cũng phải purge snapshot/graph của set đó; local và server đồng bộ.
- **Actual:** Local chỉ còn đúng 1 document set nhưng knowledge server vẫn enumerate 4 set. Retrieve trả TIMEOUT/STALE từ các set tồn dư.
- **Errors:** Không có lỗi hiển thị khi xóa set; UI báo xóa thành công.
- **Timeline:** Rác xuất hiện sau các lần test publish/republish trước đó.
- **Reproduction:** Local còn 1 set; gọi `/api/v1/retrieve` thấy coverage có 4 setId (`47619a34-...`, `917baf58-...`, `ae60b412-...`, `f0000000-...`).

## Current Focus

- bug_class: bohrbug (deterministic state accumulation)
- known_pattern_candidate: none (no knowledge-base.md; no MemPalace entry)
- STATUS: ROOT CAUSE CONFIRMED; user đã chọn A+B+C; C ĐÃ áp dụng & verify bởi user (ngoài session); A+B chuyển cho PLANNING (không sửa code trong session này — hard constraint).
- hypothesis: Rác tồn tại vì (1) client có đường "Chỉ xóa cục bộ (Giữ remote)" KHÔNG gọi purge server, và (2) server persist snapshot ra đĩa rồi reload + enumerate mọi set, KHÔNG có TTL/GC/reconcile với local → mọi set từng publish (đặc biệt test/publish residue) tồn tại vĩnh viễn và bị federated retrieve tìm đến.
- test: trace 3 tầng — client delete path, server DELETE endpoint, server snapshot persistence/enumeration — đã đọc toàn bộ source.
- expecting: xác nhận local-delete có gọi purge không (CÓ ở path full, KHÔNG ở path local-only) và tại sao set rác vẫn enumerate (persist + reload + no GC).
- next_action: HOÀN TẤT — ghi root_cause + fix design (A+B) vào Resolution để bàn giao planning; KHÔNG edit source (hard constraint). C ghi nhận là đã remediation xong.

reasoning_checkpoint:
  hypothesis: "Garbage tồn tại vì local delete mặc định/không phải lúc nào cũng purge server (path local-only bỏ qua purge), cộng với server lưu snapshot xuống SNAPSHOT_STORAGE_DIR/snapshots/*.json và reload lại vào #activeBySet khi khởi động, rồi listActiveSnapshots() enumerate tất cả cho federated retrieve — không có TTL/GC/reconcile. Hai điều kiện phải CÙNG xảy ra: set được publish lên server (từ user hoặc test) rồi local bị xóa/reset mà không purge server, và server không bao giờ tự dọn snapshot đó."
  confirming_evidence:
    - "DocumentSetDrawer.tsx executeDeleteLocalOnly() chỉ gọi deleteDocumentSet(); executeDeleteFull() mới gọi client.purgeDocumentSet() rồi deleteDocumentSet()."
    - "Modal chính thức có nút 'Chỉ xóa cục bộ (Giữ remote)' kèm Alert cảnh báo rõ: snapshot/graph trên server 'sẽ không được dọn dẹp và có thể trở thành dữ liệu mồ côi'."
    - "snapshotStore.promoteCandidate()/registerActiveSnapshot() ghi ${storageDir}/snapshots/${setId}.json; #loadPersistedState() đọc mọi *.json vào #activeBySet lúc khởi động; listActiveSnapshots() enumerate #activeBySet."
    - "main.ts: queryOnlyDeps.listPublishedSets = () => snapshotStore.listActiveSnapshots(); publishedSetDiscovery.resolveQueryOnlyScope() gán REQUIRED/baseline cho MỌI published set."
    - "Không có TTL/GC/reconcile cho published snapshot (cleanupSupersededSnapshots/cleanupExpiredSnapshots chỉ dọn graph rollback generation, không dọn document-set snapshot)."
  falsification_test: "Nếu server KHÔNG persist snapshot ra đĩa (hoặc có GC/reconcile theo local set list), thì sau restart các set rác sẽ biến mất khỏi enumerate → giả thuyết sai. Nếu executeDeleteLocalOnly() thực sự gọi purgeDocumentSet(), thì xóa local-only vẫn dọn server → giả thuyết sai. Cả hai đều bị code bác bỏ."
  fix_rationale: "Chưa chọn fix — cần quyết định sản phẩm. Fix đúng phải giải quyết CẢ hai điều kiện AND-gate: ngăn tạo orphan mới (client) VÀ dọn/ngăn enumerate orphan cũ (server hoặc retrieval scope). Chỉ dọn 4 set hiện tại là chữa triệu chứng."
  blind_spots: "Không chạy được server (docker không có trong WSL distro này) → không xác nhận trực tiếp 4 setId đang enumerate hay kiểm tra được instance/volume nào. Không có full setId (chỉ có prefix 47619a34/917baf58/ae60b412/f0000000) → chưa dọn thủ công được. Chưa xác định user đã bấm nút nào (full hay local-only); ae60b412 là set K8s production theo HANDOFF → nghi ngờ rác trải跨 nhiều instance/volume."
  candidate_causes:
    - "code: executeDeleteLocalOnly() bỏ qua purgeDocumentSet(); test harness (liveGraphRetrieval f0000000, canaryService, acceptance tests) publish snapshot mà cleanup không đảm bảo."
    - "config: SNAPSHOT_STORAGE_DIR persistence reload mọi snapshot lúc startup; không có bước reconcile giữa local documentSets và published sets."
    - "environment: nhiều instance/backend lưu trữ (local docker volume /var/lib/knowledge-server/snapshots vs K8s PVC 10.4.97.70:30080) cùng namespace setId → purge instance này không ảnh hưởng instance kia; docker unavailable để verify."
    - "data: snapshot files tồn dư từ các lần test/publish trước (fixed test SET_ID f0000000-...a1), tích lũy trên volume dùng chung."
  and_gate: "YES — garbage vĩnh viễn + bị enumerate chỉ xảy ra khi (một) set được publish rồi local xóa/reset mà KHÔNG purge server, VÀ (hai) server persist+reload+enumerate không có GC/reconcile. Thiếu một trong hai thì không có rác enumerate được."

## Evidence

- timestamp: 2026-11-19
  checked: Phase 0 knowledge base / MemPalace
  found: No `.planning/debug/knowledge-base.md` exists; no prior similar-resolution match available
  implication: proceed with open-ended hypothesis formation + common bug patterns
- timestamp: 2026-11-19
  checked: knowledge-server/src/routes/snapshots.ts (full)
  found: `DELETE /api/v1/sets/:setId` gọi `attemptService.purgeSet(setId)` + `graphBuildService.purgeSet(setId)`; trả 404 SET_NOT_FOUND nếu cả hai false, 200 {status:'purged'} nếu có purge. Endpoint xóa có sẵn và đầy đủ.
  implication: BUG KHÔNG nằm ở DELETE endpoint — nó purge sạch.
- timestamp: 2026-11-19
  checked: attemptService.purgeSet + graphBuildService.purgeSet + graphRepository/neo4jRepository.purgeSet
  found: attemptService xóa attempts/snapshots/approvals/candidates; graphBuildService xóa in-memory state + globalChunkStore + repository.purgeSet → Neo4j DROP INDEX + xóa GraphSnapshot/GraphSet nodes. store.purgeSet cũng fs.unlinkSync file `${setId}.json`.
  implication: Một lần purge thành công là xóa sạch cả memory lẫn đĩa lẫn Neo4j.
- timestamp: 2026-11-19
  checked: src/services/knowledge/knowledgeClient.ts purgeDocumentSet (968-985)
  found: gọi DELETE `/sets/:setId`; 404 được coi là success (already absent). Có phương thức purge đúng.
  implication: client có khả năng purge server.
- timestamp: 2026-11-19
  checked: src/components/knowledge/DocumentSetDrawer.tsx (372-409, 777-840)
  found: HAI path xóa. `executeDeleteFull()` → purgeDocumentSet() rồi deleteDocumentSet() → message "Đã xóa hoàn toàn... (cục bộ & remote)". `executeDeleteLocalOnly()` → CHỈ deleteDocumentSet(), KHÔNG purge. Modal cho set đã publish hiện 3 nút: "Xóa toàn bộ (Cục bộ & Remote)", "Chỉ xóa cục bộ (Giữ remote)", "Hủy", kèm Alert: local-only → snapshot/graph trên server "sẽ không được dọn dẹp... trở thành dữ liệu mồ côi".
  implication: Orphan creation là hành vi CỐ Ý, do người dùng chọn — giải thích "UI báo xóa thành công nhưng server vẫn rác".
- timestamp: 2026-11-19
  checked: src/db/repositories/documentSetRepo.ts deleteDocumentSet (212-232)
  found: chỉ xóa các bảng IndexedDB (documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks) trong transaction; KHÔNG có network call.
  implication: xóa local tự thân nó không bao giờ chạm server.
- timestamp: 2026-11-19
  checked: knowledge-server/src/indexing/snapshotStore.ts (full)
  found: promoteCandidate()/registerActiveSnapshot() ghi `${storageDir}/snapshots/${setId}.json` (atomicWriteJson). Constructor gọi #loadPersistedState() đọc mọi file *.json trong snapshots/ vào #activeBySet. listActiveSnapshots() = sort #activeBySet. purgeSet() xóa memory + unlink file. KHÔNG có TTL/expiry/GC tự động.
  implication: snapshot sống qua restart; chỉ explicit DELETE mới xóa được.
- timestamp: 2026-11-19
  checked: knowledge-server/src/main.ts (400-403, 505-515) + publishedSetDiscovery.ts + routes/retrieval.ts
  found: queryOnlyDeps.listPublishedSets = () => snapshotStore.listActiveSnapshots(); resolveQueryOnlyScope() với không truyền setIds enumerate MỌI published set (sort asc, cắt maxSets) gán REQUIRED/baseline, build publishedSnapshotIdBySet cho từng set.
  implication: mọi orphan set đều được federated retrieve đưa vào coverage + tìm kiếm → TIMEOUT/STALE coverage warning (khớp debug ai-chat-federated-timeout).
- timestamp: 2026-11-19
  checked: docker-compose.yml + k8s/knowledge-server.yaml + k8s/README.md + docker availability
  found: SNAPSHOT_STORAGE_DIR=/var/lib/knowledge-server/snapshots (volume dùng chung, kể cả K8s PVC). `docker` không tồn tại trong WSL distro này; không gọi được server 127.0.0.1:3001. HANDOFF.json ghi set ae60b412-... trên K8s 10.4.97.70:30080.
  implication: rác có thể trải跨 nhiều instance/volume; không live-verify được; ae60b412 là production set, f0000000 là test SET_ID của liveGraphRetrieval.test.ts → bằng chứng rác là test/publish residue.
- timestamp: 2026-11-19
  checked: knowledge-server/tests/liveGraphRetrieval.test.ts + canaryService.ts
  found: test dùng fixed SET_ID f0000000-0000-4000-8000-0000000000a1, chỉ purge ở test CUỐI ('cleans up the verification set'); canaryService.registerActiveSnapshot() tạo canary set không tự purge. registerActiveSnapshot ghi ra storageDir nếu cấu hình.
  implication: nếu test chạy vào volume dùng chung và bỏ qua/ fail cleanup → residue vĩnh viễn, khớp prefix f0000000 trong symptom.

- timestamp: 2026-11-19
  checked: user checkpoint response (option C remediation)
  found: User ĐÃ tự áp dụng C ngoài session: `DELETE /api/v1/sets/:setId` cho 3 orphan setIds (các prefix rác) đều trả 200 purged; `/api/v1/retrieve` giờ trả READY với đúng 1 set `917baf58-...` và KHÔNG còn coverage warning. Không re-attempt C, không re-purge, không đụng live server state.
  implication: Triệu chứng đã hết trên instance đúng; C là chữa triệu chứng (đã xác nhận purge endpoint hoạt động). A+B vẫn cần để ngăn tái phát. Hard constraint từ user: KHÔNG edit code, chỉ tạo root_cause + fix design cho planning.

## Eliminated

- hypothesis: DELETE endpoint của knowledge-server hỏng / không purge được set.
  evidence: snapshots.ts DELETE gọi cả attemptService.purgeSet lẫn graphBuildService.purgeSet; store.purgeSet unlink file; neo4j purgeSet DROP INDEX + xóa nodes. Purge là thorough.
  timestamp: 2026-11-19
- hypothesis: Xóa local tự động purge remote (nên không thể có rác).
  evidence: deleteDocumentSet() là thuần IndexedDB; chỉ executeDeleteFull() gọi purgeDocumentSet(); executeDeleteLocalOnly() bỏ qua.
  timestamp: 2026-11-19
- hypothesis: CORS / network lỗi khiến purge không tới server (đã loại ở session federated-timeout trước).
  evidence: prior debug ai-chat-federated-timeout ghi rõ DevTools không có CORS error; không liên quan đến enumeration của orphan.
  timestamp: 2026-11-19
- hypothesis: Server tự dọn snapshot rác sau một thời gian (TTL/GC).
  evidence: grep không tìm thấy TTL/expiry/GC cho published document-set snapshot; cleanupExpiredSnapshots/cleanupSupersededGenerations chỉ dọn graph rollback generations.
  timestamp: 2026-11-19

## Fix Options (user đã chọn A+B+C; D loại)

- **A — Ngăn orphan mới (client, thay đổi hành vi/sản phẩm):** Với set đã publish, bỏ hoặc yêu cầu xác nhận kiểu gõ tên cho nút "Chỉ xóa cục bộ (Giữ remote)"; mặc định full-delete. Giải quyết nguyên nhân code, nhưng là quyết định UX.
- **B — Vệ sinh server (design):** Thêm endpoint liệt kê published sets (hiện chỉ có DELETE, không có GET /sets) + action "dọn set rác" trên UI; và/hoặc prune published snapshot không còn backend retrieval hợp lệ. Giải quyết tồn dư + tương lai, cần cân nhắc nguyên tắc server-authoritative (Phase 28 D-01).
- **C — Dọn dẹp ngay (thủ công, cần server thật): ✅ ĐÃ ÁP DỤNG & VERIFY BỞI USER (ngoài session).** 3 DELETE `/api/v1/sets/:setId` → 200 purged; retrieve giờ READY, đúng 1 set `917baf58-...`, hết warning. Chữa triệu chứng, KHÔNG re-attempt trong session này.
- **D — Chặn triệu chứng retrieve (retrieval scope):** Lọc setTierAssignments chỉ giữ set có trong local documentSets để orphan không gây TIMEOUT/STALE. Nhưng đi ngược thiết kế server-authoritative và hỏng fresh-client.

## Resolution

- root_cause: "AND-gate — cần CẢ HAI điều kiện: (1) [code/client] Đường 'Chỉ xóa cục bộ (Giữ remote)' trong `src/components/knowledge/DocumentSetDrawer.tsx::executeDeleteLocalOnly()` (dòng 377-392) gọi MỖI `deleteDocumentSet()` (thuần IndexedDB) và BỎ QUA `client.purgeDocumentSet()`. Chỉ `executeDeleteFull()` (394-411) gọi purge trước khi xóa local. Modal (777-843) chủ động cảnh báo action này tạo 'dữ liệu mồ côi' — tức orphan là hệ quả có ý thức của UX, không phải lỗi purge. Thêm vào đó các flow test/acceptance (liveGraphRetrieval f0000000, canaryService) publish snapshot vào cùng storageDir mà cleanup không đảm bảo. (2) [config/data/server] `knowledge-server/src/indexing/snapshotStore.ts`: `promoteCandidate()`/`registerActiveSnapshot()` ghi `${storageDir}/snapshots/${setId}.json`; constructor gọi `#loadPersistedState()` (58-103) nạp MỌI file `*.json` vào `#activeBySet` lúc startup; `listActiveSnapshots()` (151-155) enumerate toàn bộ; `main.ts:510` nối enumeration đó vào `queryOnlyDeps.listPublishedSets` → `publishedSetDiscovery.resolveQueryOnlyScope()` (81-145) gán REQUIRED/baseline cho MỌI published set. KHÔNG có TTL/GC/reconcile với local set list (cleanupExpiredSnapshots/cleanupSupersededSnapshots chỉ dọn graph rollback generation). Hệ quả: set từng publish rồi local xóa/reset mà không purge (hoặc test residue) sống qua restart, vẫn được enumerate/fan-out → TIMEOUT/STALE coverage. `DELETE /api/v1/sets/:setId` (`snapshots.ts:85-103`) và `knowledgeClient.purgeDocumentSet()` (968-985) TỰ THÂN chạy đúng (đã được C chứng minh: 200 purged) — bug KHÔNG nằm ở cơ chế purge, mà nằm ở (a) path local-only bỏ qua purge và (b) server persist+reload+enumerate không có baseline quản trị/đối soát."

- fix: >
  PLANNING HANDOFF — user đã chọn A+B+C. C ĐÃ xong (xem Evidence, không re-attempt). A+B dưới đây là THIẾT KẾ ĐỀ XUẤT, CHƯA implement (hard constraint: không edit source trong session debug này).

  **A — Ngăn orphan mới ở client (thay đổi UX/hành vi sản phẩm).**
  Mục tiêu: xóa một set đã publish mặc định là full-delete; local-only delete chỉ là ngoại lệ có chủ đích, phải xác nhận mạnh. Định vị: `src/components/knowledge/DocumentSetDrawer.tsx` — `executeDeleteLocalOnly()` (377), `executeDeleteFull()` (394), modal (777-843). Thiết kế đề xuất:
    - Giữ 3 nút nhưng ĐỔI mặc định/rủi ro: làm "Xóa toàn bộ (Cục bộ & Remote)" nút `type="primary" danger` (đã có), và với "Chỉ xóa cục bộ (Giữ remote)" thêm type-to-confirm: bắt người dùng gõ đúng tên set (`deletingSet.name`) vào một `Input` trong modal trước khi nút được enable; kèm `Alert` existing đã cảnh báo orphan.
    - Cân nhắc thêm explicit checkbox "Tôi hiểu snapshot/graph trên server sẽ bị bỏ lại" thay cho/kèm type-to-confirm — nhưng type-to-confirm mạnh hơn và phù hợp "personal app, ít UX dài".
    - Giữ nguyên `executeDeleteFull()` (purge trước, xóa local sau; đã đúng). Không thay `knowledgeClient.purgeDocumentSet()` (404=success đã đúng).
    - Cập nhật text nút/message nếu cần để phản ánh mặc định mới. Test: component test trong `src/components/knowledge/__tests__/` kiểm tra (a) set chưa publish → 1 nút local xóa thẳng; (b) set đã publish → nút local-only DISABLED cho tới khi gõ đúng tên; (c) bấm full-delete → gọi `purgeDocumentSet` rồi `deleteDocumentSet`; (d) bấm local-only sau confirm → CHỈ gọi `deleteDocumentSet`, KHÔNG gọi purge.

  **B — Vệ sinh/quản trị server (thiết kế, server-authoritative — Phase 28 D-01).**
  Mục tiêu: server có khả năng HIỂN THỊ và DỌN published sets, để người dùng tự dọn orphan mà không cần curl/delete file thủ công — mà KHÔNG phá nguyên tắc "default retrieval = mọi published server set" (D-01) hay "explicit setIds exact-match, không broaden" (D-05). Định vị & thiết kế đề xuất:
    - Thêm endpoint LIỆT KÊ published sets trên server: `GET /api/v1/sets` trong `knowledge-server/src/routes/snapshots.ts`, trả mảng `{setId, snapshotId}` từ `snapshotStore.listActiveSnapshots()` (đã có method, chỉ chưa expose qua HTTP). Có thể bổ sung metadata hữu ích (state từ graphBuildService nếu có) nhưng GIỮ tối thiểu. Dùng chung auth/allowedOrigins với các route hiện tại (`buildKnowledgeServer`).
    - Client: thêm `listPublishedSets()` vào `src/services/knowledge/knowledgeClient.ts` (cạnh `purgeDocumentSet()` dòng 968, parse schema giống pattern `request(...)` hiện tại, 401/403/CORS propagate qua `KnowledgeClientError`).
    - UI: thêm section "Quản lý set trên Knowledge Server" vào `src/components/settings/KnowledgeServerConfigCard.tsx` (nơi hợp lý nhất — card cấu hình server) HIỆN TẠI CHỈ có enable/URL/token/test/save (đã đọc full file). Dùng Ant Design `Table`/`List`: gọi `listPublishedSets()`, hiện setId/snapshotId, mỗi dòng có nút "Dọn set này" gọi `purgeDocumentSet(setId)` (endpoint DELETE đã có & verify) kèm `Popconfirm` xác nhận, refresh list sau purge. Hiển thị diagnostic nếu server không cấu hình/kết nối được — phải hoạt động graceful khi daemon tắt (constraint offline-first). Optionally highlight set không có trong local catalog (so với documentSetRepo) để người dùng biết set nào là orphan — NHƯNG chỉ để đánh dấu/gợi ý, KHÔNG tự purge và KHÔNG lọc khỏi retrieval (tránh vi phạm D-01; fresh-client có local catalog rỗng).
    - KHÔNG đổi `publishedSetDiscovery.resolveQueryOnlyScope()` — enumeration vẫn là nguồn chân lý, mọi published set vẫn được search (D-01). D là bài học: đừng lọc retrieval scope theo local catalog. Cleanup là hành động QUẢN TRỊ TƯỜNG MINH, không phải tự động reconcile âm thầm.
    - Cân nhắc (optional, để planning quyết): có nên thêm GC/TTL tự động cho snapshot cũ không — CHỐNG lại automation mặc định vì có thể xóa set production hợp lệ; nếu làm, phải opt-in + phân biệt hẳn orphan vs set active. Mặc định đề xuất: KHÔNG tự GC, để UI quản trị (B) + default full-delete (A) đảm nhận.
    - Test: server route test cho `GET /api/v1/sets` (listActiveSnapshots shape, auth); client test cho `listPublishedSets()` parsing + error; component test cho section quản trị (list render, purge confirm, refresh, graceful-when-offline).

  **Điều kiện dừng cho planning:** A ngăn tạo orphan mới; B cho phép dọn orphan hiện tại/tương lai qua UI; C đã dọn sạch instance hiện tại. Cả 3 cùng phủ AND-gate ở root_cause.

- verification: >
  Session này KHÔNG apply fix (hard constraint) nên KHÔNG có code-verification. Trạng thái verify hiện có: (a) Root cause confirmed bằng code tracing toàn bộ 3 tầng (client delete path / server DELETE endpoint / snapshot persistence+enumeration), mọi hypothesis đối lập đều bị eliminate. (b) C verified bởi USER: 3 purge → 200, retrieve READY, đúng 1 set `917baf58-...`, hết warning — chứng minh purge mechanism đúng và triệu chứng đã hết. (c) Không live-verify được enumeration trực tiếp do docker unavailable trong WSL distro này (blind spot đã ghi). Việc verify A+B thuộc trách nhiệm phase planning/implementation (test cases nêu trong fix design).

- files_changed: []
  (Không file nào bị sửa trong session debug này — planning-only. Files dự kiến bị ĐỔI khi implement: src/components/knowledge/DocumentSetDrawer.tsx [A]; knowledge-server/src/routes/snapshots.ts, src/services/knowledge/knowledgeClient.ts, src/components/settings/KnowledgeServerConfigCard.tsx [B] + test files tương ứng.)
