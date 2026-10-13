# AI Chat — Tình trạng lỗi hiện tại

**Branch:** `phase-19.1-production-neo4j`
**Ngày ghi nhận:** 2026-10-13
**Phạm vi:** Milestone v1.2 — Hybrid GraphRAG Knowledge Assistant MVP (Phase 19.1)
**Trạng thái:** Chưa fix. Chỉ ghi nhận triệu chứng + nguyên nhân đã truy vết.

---

## 1. Knowledge query chỉ hiện banner cảnh báo, không có nội dung

### Triệu chứng

Query mẫu:
```
Chu kỳ tính lãi/phí container 60000006
```

Response hiển thị **chỉ** banner cảnh báo, không có nội dung grounded answer:

> Kết quả thiếu một phần phương thức / Một số phương thức tạm thời không khả dụng. Trả lời dựa trên bằng chứng còn lại; phạm vi có thể chưa đầy đủ.

Dưới banner trống rỗng. Không có evidence card, không có câu trả lời, không có citation.

### Truy vết

**Chuỗi fail:**

1. `knowledge-server/src/main.ts:344` — unsafe cast `const indexGateway = graphRepository as unknown as RetrievalIndexGateway;` che lỗi lúc compile.
2. `knowledge-server/src/services/retrievalService.ts:513` — gọi `this.deps.indexGateway.validateVectorIndexMetadata(snapshotId, providerMeta)`.
3. `Neo4jRepository` **không implement** method này. Kiểm chứng qua grep:
   - Interface declaration: `knowledge-server/src/retrieval/contracts.ts:132`.
   - Implementation thực: **chỉ có trong test stub** (`knowledge-server/tests/fixtures/retrievalStubs.ts:200`, `knowledge-server/tests/retrievalAcceptance.test.ts:104`).
   - File `knowledge-server/src/graph/neo4jRepository.ts` → 0 match.
4. Runtime: `TypeError: ...validateVectorIndexMetadata is not a function` ném trong `runVectorModality`.
5. `retrievalService.ts:514-519` — bắt trả về `{ status: 'unavailable', reason: 'MODEL_INDEX_MISMATCH' }` (nhưng thực tế là crash chứ không phải mismatch).
6. `retrievalService.ts:361-394` — vector không `ok` → `degradedReasons.push(...)` → `outcome = 'DEGRADED'`.
7. Synthesis không nhận đủ evidence → sinh câu trả lời rỗng.
8. `src/components/ai/grounded/GroundedAnswerCard.tsx:299-305` — render banner on top (`<GroundedBanner variant="degraded" ... />`).
9. `GroundedAnswerCard.tsx:322-324` — `{grounding.answer ? (...) : (...)}` — nhánh else render rỗng.

**Kết quả hiển thị:** chỉ banner, không có nội dung bên dưới.

### Trạng thái chẩn đoán trước đây (SAI)

Phiên trước đoán `embeddingProvider = undefined` → `UNCONFIGURED`. **Sai.** Thực tế:
- `knowledge-server/src/main.ts:315` → `createEmbeddingProvider(env)` luôn trả về provider.
- Default: `LocalOnnxEmbeddingProvider` (model `Xenova/multilingual-e5-small`, 384 chiều, `knowledge-server/src/embedding/embeddingProviders.ts:5-11`).
- `main.ts:350` → inject vào `RetrievalService.deps.embeddingProvider`.
- Guard `if (!this.deps.embeddingProvider)` ở `retrievalService.ts:504` không fire.

Lỗi thật là **method missing**, không phải provider missing.

### Files liên quan

- `knowledge-server/src/main.ts:315, 344, 350`
- `knowledge-server/src/services/retrievalService.ts:504-519, 361-394`
- `knowledge-server/src/retrieval/contracts.ts:132`
- `knowledge-server/src/graph/neo4jRepository.ts` (toàn file — thiếu method)
- `src/components/ai/grounded/GroundedAnswerCard.tsx:299-324`

---

## 2. TaskMate query lặp "TaskMate data search fail"

### Triệu chứng

Query mẫu:
```
tình hình click to pay như nào rồi
```

Response bị lặp chuỗi degraded:

> Click to Pay tình hình? TaskMate kiểm tra. TaskMate data search fail. Click to Pay task chưa thấy. Need thêm data.

Chuỗi này repeat liên tục qua các tool-loop turn.

### Truy vết

**Hai nguyên nhân độc lập chồng nhau:**

**A. Intent router miss câu đọc/trạng thái**

- `src/services/ai/intentRouter.ts:68-120` chỉ match verb mutation tiếng Việt: `tạo`, `cập nhật`, `xoá`, `thêm`, `sửa`, `xóa`.
- Câu "tình hình click to pay như nào rồi" không match verb nào → router trả về `{ route: 'clarify', confidence: 0 }`.
- Clarify path không gọi TaskMate repository → không có data search thật → tool loop bị redirect lung tung.

**B. Buffer `fullResponse` không reset giữa các tool turn**

- `src/components/ai/AIChatDrawer.tsx:1010-1264` — biến `fullResponse` accumulate stream delta xuyên suốt các turn.
- Line 1064-1082: khi stream error, silent fallback — không log, không surface, swap sang paraphrase.
- Line 1238: post-tool synthesis pass **thừa**, concat query paraphrase + fail message + synthesis attempt.
- Mỗi turn mới không clear `fullResponse` → nội dung turn cũ còn trong buffer khi turn mới bắt đầu → câu trả lời bị concat chồng → sinh ra chuỗi degraded lặp.

### Files liên quan

- `src/services/ai/intentRouter.ts:68-120`
- `src/components/ai/AIChatDrawer.tsx:1010-1264` (đặc biệt 1064-1082, 1238)

---

## 3. Graph publish — chỉ 1 document (SHB credit) có đầy đủ entity + event + relation + evidence; mọi doc khác chỉ có entity

### Triệu chứng

Chạy publish/rebuild graph trên nhiều document trong bộ sample markdown. Kết quả:

- Document `60000006-SHB-Credit-calculations` → có `entities`, `events`, `relations`, `evidence`.
- Mọi document khác → **chỉ có `entities`** (từ name recognition). `relations = 0`, `evidence = 0`.

### Truy vết

**Hai nguyên nhân độc lập:**

**A. Table parser hardcode theo document SHB credit**

- `knowledge-server/src/retrieval/extraction.ts:667-779` — match substring tên cột cứng của SHB credit (ví dụ `Chu kỳ tính lãi`, `Hạch toán`, cột cụ thể).
- Document khác dù có bảng cũng không khớp pattern → không extract được relation từ bảng.
- Vi phạm nguyên tắc: không được hardcode theo document cụ thể.

**B. Prose extractor khai báo nhưng không ai gọi**

- `knowledge-server/src/services/graphBuildService.ts:145-147` — khai báo 2 function:
  - `collectUncoveredProse`
  - `extractProseCandidatesOnce`
- Grep tìm call site: **không có nơi nào gọi** 2 function này trong pipeline `rebuildCandidate`.
- Prose = đoạn văn thường trong markdown (không phải bảng, không phải code, không phải bullet). Table parser không đọc được prose vì không có pipe `|`.
- Document không có bảng (hoặc bảng không match SHB pattern) → chỉ còn name recognition sinh entity → 0 relation.

### Files liên quan

- `knowledge-server/src/retrieval/extraction.ts:667-779`
- `knowledge-server/src/services/graphBuildService.ts:145-147` (và toàn pipeline `rebuildCandidate`)

---

## 4. Composite ID collision — `60000006` route sai entity type

### Triệu chứng

Query `Chu kỳ tính lãi/phí container 60000006` với ID `60000006` tồn tại ở nhiều composite namespace:
- `PRC_CONTAINER:60000006` (container đúng ngữ cảnh query)
- `PRC_PROCESS:60000006` (process cùng ID số)

Hệ thống route sai sang `ProcessStep:60000006` thay vì `ScheduledProcess:60000006` / `PRC_CONTAINER:60000006`.

### Truy vết

- `knowledge-server/src/retrieval/queryPlanning.ts:272-287` — hardcode `'container'` làm step keyword.
- Logic này ép mapping keyword → entity type cứng, không trace graph thật.
- Vi phạm nguyên tắc: resolve node phải trace graph động, không hardcode mapping.

### Files liên quan

- `knowledge-server/src/retrieval/queryPlanning.ts:272-287`

---

## 5. Thiếu structured logging — không truy vết được khi có lỗi

### Triệu chứng

Khi lỗi 1-4 xảy ra, log không đủ context để truy vết nhanh:
- Không biết router quyết định route nào, confidence bao nhiêu.
- Không biết modality nào fail, latency bao nhiêu, reason gì.
- Không biết tool loop ở turn thứ mấy, buffer dài bao nhiêu.
- Không biết synthesis fail ở phase nào (plan / validate / repair).
- Không biết publish fail ở doc nào, phase nào.

### Truy vết

Hiện trạng:
- Không có module logging structured chuẩn ở `knowledge-server/`.
- Không có logger client-side ở `src/services/ai/`.
- Log hiện tại rải rác `console.log`/`console.error`, không có tag chuẩn, không có correlation ID.

### Files liên quan

- Thiếu: `knowledge-server/src/logging/structured.ts`
- Thiếu: `src/services/ai/log.ts`
- Chokepoint cần tag mà hiện chưa có: `[ROUTE]`, `[RETRIEVE]`, `[TOOL]`, `[SYNTHESIS]`, `[PUBLISH]`

---

## Tổng kết

| # | Lỗi | Flow | Severity | Trạng thái |
|---|---|---|---|---|
| 1 | Vector modality crash → DEGRADED banner trống | Knowledge query | Blocker | Chưa fix |
| 2 | TaskMate query lặp degraded chain | TaskMate read | Blocker | Chưa fix |
| 3 | Graph publish chỉ 1 doc có relation | Graph build | Blocker | Chưa fix |
| 4 | Composite ID route sai | Knowledge query | High | Chưa fix |
| 5 | Thiếu structured logging | All flows | High (observability) | Chưa fix |

**Lỗi 1 và 2 chặn luồng dùng chính** (hỏi knowledge + hỏi task). **Lỗi 3 chặn luồng ingest kiến thức mới**. **Lỗi 4 làm sai kết quả ngay cả khi 1-2-3 fix**. **Lỗi 5 làm mọi lần fix sau này tốn thời gian truy vết.**

Working-tree hiện có 6 file modified chưa commit (từ `git status`):
- `src/components/ai/ChatMessageBubble.tsx`
- `src/components/ai/grounded/GroundedAnswerCard.tsx`
- `src/services/ai/evidencePack.ts`
- `src/services/ai/groundedSynthesis.ts`
- `tests/ai/evidencePack.test.ts`
- `tests/ai/groundedSynthesis.test.ts`

Chưa rõ các modification này giải quyết lỗi nào trong danh sách trên — cần review riêng trước khi commit hoặc revert.
