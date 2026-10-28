# Phase 25: Interactive SDLC Document Wizards & Bank Template Generator - Research

**Researched:** 2026-10-28
**Domain:** Wizard SDLC tương tác, trạng thái bền vững trên IndexedDB, đối soát change-pack, sinh DOCX client-side
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Scope biểu mẫu
- **D-01:** Triển khai trọn vẹn cả 4 mẫu biểu trong phase này:
  1. `PL02`: Tài liệu Phân tích Nghiệp vụ (dành cho BA).
  2. `PL03`: Tài liệu Thiết kế Kỹ thuật & Phương án triển khai (dành cho Dev).
  3. `PL07`: Phiếu Review Code & Checklist kiểm tra chất lượng phần mềm (dành cho Dev/Lead).
  4. `CAB`: Tờ trình tóm tắt thay đổi phục vụ báo cáo Hội đồng Phê duyệt Thay đổi.

### Luồng phỏng vấn AI (Guided Interview)
- **D-02:** Áp dụng cơ chế **Hỏi bù lỗ hổng (Grounded Gap Detection)**:
  - User nạp đầu vào (text PL01, tag Note, Git commit/diff).
  - AI tự động đối chiếu các mục bắt buộc trong cấu trúc biểu mẫu ngân hàng và phát hiện những điểm thiếu sót, mâu thuẫn hoặc chưa rõ ràng.
  - AI chỉ đặt câu hỏi phỏng vấn tập trung vào các "khoảng trống" nghiệp vụ/kỹ thuật cần làm rõ, thay vì bắt user điền tuần tự máy móc.

### Cơ chế nạp và kết xuất file `.docx`
- **D-03:** Sử dụng **Client-side docx.js layout builder**:
  - Toàn bộ layout, font chữ (Times New Roman), căn lề chuẩn quy định, tiêu đề, bảng biểu, khung ký duyệt được code trực tiếp bằng thư viện `docx` trong TypeScript.
  - Đảm bảo tính độc lập, deterministic, không phụ thuộc vào server bên ngoài hay nguy cơ lỗi parse file template phức tạp.
- **D-18:** Mẫu biểu thật nằm tại `docs/pl-templates/` (PL02, PL03B, PL07). Cấu trúc từng mục, bảng biểu, numbering và khối chữ ký đã được trích xuất vào `25-TEMPLATES.md` — planner và builder MUST đọc file này thay vì tự suy đoán layout.
- **D-19:** PL07 gồm 2 phần tách biệt: baseline bảo mật tĩnh (mục I–V, ~27 hạng mục tiếng Việt nguyên văn, đóng gói thành fixture) và mục VI "Review code" do AI sinh theo từng patch. Không cho AI tự bịa hoặc rút gọn baseline.
- **D-20:** Ba builder riêng biệt (PL02, PL03B, PL07), không dùng một renderer tổng quát — cây mục của mỗi mẫu khác nhau về bản chất. Các dạng bảng lặp lại (risk register, glossary, file layout spec, input rules, API contract, DB columns, checklist 5 cột) được đóng gói thành row-builder tái sử dụng.
- **D-21:** CAB không cần mẫu biểu chuẩn. Nội dung CAB chỉ là bản tóm tắt ngắn gọn các thay đổi kỹ thuật và nghiệp vụ, dựa trên PL02 + PL03B + PL07 đã sinh trong cùng thread dự án. Sinh dạng Markdown ngắn (1–2 trang) + xuất `.docx` layout tối giản (tiêu đề, các mục tóm tắt, khối ký 2 ô). Không áp khuôn mục/bảng phức tạp như 3 mẫu PL còn lại.

### Tích hợp Ngữ cảnh & Tra cứu Kiến thức
- **D-04:** **Tự động quét toàn diện dữ liệu nền**:
  - Khi kích hoạt wizard, hệ thống tự động kích hoạt pipeline tra cứu kiến thức nền (Knowledge Docs IndexedDB, Knowledge Graph Neo4j/Graphiti, và các MCP tools liên quan như Oracle DB nếu được bật) để cung cấp sẵn kiến trúc hiện tại, API và bảng dữ liệu ảnh hưởng cho buổi phỏng vấn.

### Trải nghiệm Giao diện AI Chat Drawer
- **D-05:** **Thanh Chip chọn nhanh (Skill Quick Bar)**:
  - Bố trí thanh chip chọn nhanh ngay phía trên `ChatInputBar`: `[📋 Soạn PL02]` `[⚙️ Soạn PL03]` `[🔍 Checklist PL07]` `[📢 Tờ trình CAB]`.
- **D-06:** **Form Modal nhập Metadata ban đầu**:
  - Khi user nhấn vào chip wizard, hiển thị popup nhanh để nhập các thông tin định danh: Mã Dự án/CR, Tên tính năng, Đơn vị yêu cầu, Người lập, Ngày lập.
  - Các thông tin này tự động truyền vào Header/Footer, trang bìa và bảng ký duyệt của file Word.
- **D-07:** **Xem trước & Nút Duyệt xuất file**:
  - Trước khi xuất file `.docx`, AI hiển thị bản thảo Markdown đầy đủ trong chat kèm thẻ tóm tắt.
  - Cung cấp nút hành động rõ ràng: `[📥 Duyệt & Tải .docx]` và `[✏️ Yêu cầu chỉnh sửa thêm]`.
- **D-08:** **Lưu vết và Quản lý phiên làm việc**:
  - Khi xuất file `.docx`, hệ thống đồng thời lưu toàn bộ nội dung thành một Note mới trong TaskMate để làm tài liệu tra cứu nội bộ lâu dài.
  - Wizard có trạng thái lưu dở dang và nút `[❌ Hủy Wizard]` để user có thể thoát quay lại chat thông thường bất cứ lúc nào.

### Xử lý Sơ đồ Luồng (Diagrams)
- **D-09:** Sơ đồ quy trình (Flowchart, Sequence) được render trực quan bằng Mermaid trong chat preview. Khi xuất sang file `.docx`, hệ thống chuyển đổi sơ đồ thành bảng text mô tả từng bước (Step-by-step Execution Matrix) chuẩn mực, tránh lỗi lệch hình ảnh trong file Word.

### Mô hình khép kín xuyên suốt vòng đời phát triển (Closed Development Loop)
- **D-10:** Luồng chuẩn tương tác cho Dev, áp dụng thống nhất cho cả feature mới và chỉnh sửa feature đã có:
  1. Dev nạp đầu vào: PL02 (yêu cầu đã duyệt) + yêu cầu verbal ngoài lề (nếu có) + tài liệu kiến trúc/codebase (nếu có, dev tự chạy `gsd-map-codebase` bên ngoài TaskMate).
  2. AI cùng Dev phân tích tương tác → ra `SOLUTION.md`.
  3. `SOLUTION.md` được lưu thành Note gắn với Project tương ứng.
  4. Dev dùng `SOLUTION.md` làm đầu vào cho `gsd-phase` / milestone flow trên Claude Code (ngoài TaskMate).
  5. Trong quá trình code, nếu phát sinh drift so với solution ban đầu, Dev quay lại **đúng chat thread của dự án** trao đổi với AI; AI cập nhật `SOLUTION.md`, preview cho Dev confirm, rồi lưu version mới.
  6. Khi code xong, Dev tổng hợp `change-pack.zip` và nạp vào chat thread của dự án; AI phân tích và sinh PL03 (kèm PL07).
- **D-11:** Với feature chỉnh sửa feature đã có, `SOLUTION.md` bắt buộc có mục "Hiện trạng hệ thống" và "Danh sách màn hình/API/bảng bị ảnh hưởng" trước khi đề xuất giải pháp; PL03 bổ sung ma trận regression test.
- **D-12:** `SOLUTION.md` là Note versioned (v1, v2, v3…) gắn với Project; thread chat của Project được giữ nguyên xuyên suốt để AI không mất ngữ cảnh giữa các lần cập nhật.

### Change Pack (đầu vào PL03/PL07)
- **D-13:** `change-pack.zip` do script `scripts/change-pack.mjs` sinh ra **trong repo hệ thống của Dev** (không phải TaskMate), chạy bằng lệnh `node scripts/change-pack.mjs --base origin/develop --cr <CR-ID>`.
- **D-14:** Nội dung pack cố định: `diff.patch` (`git diff --binary <base>...HEAD`), `new-files/` (file thêm mới full content), `sql/` (`.sql`, `.plb`, `.pck`, `.pkb`), `meta.json` (cr, base, head, branch, author, generatedAt, commits, danh sách file).
- **D-15:** Dev nạp pack vào AI Chat thread của dự án bằng kéo-thả zip. TaskMate dùng `jszip` (đã có sẵn) để giải nén, đọc `meta.json` hiển thị CR/branch/commit count cho Dev confirm đúng pack, rồi lưu từng entry thành Note gắn vào DocumentSet của Project.
- **D-16:** PL03 sinh từ việc so sánh `SOLUTION.md` baseline với `change-pack` thực tế, gồm 4 mục: Thiết kế như đã duyệt, Thực tế triển khai, Bảng drift (ngoài solution / chưa làm / làm khác), Bảng thay đổi DB + Rollback.
- **D-17:** Chặn pack quá lớn/không hợp lệ trước khi nạp: cảnh báo và từ chối nếu zip > 5MB, hoặc chứa `node_modules/`, `*.min.js`, `package-lock.json`.

### Claude's Discretion

Không có mục `## Claude's Discretion` trong CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)

Không có mục `## Deferred Ideas` trong CONTEXT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

> Sáu ID chỉ được định nghĩa ở mức success criteria trong ROADMAP; REQUIREMENTS.md hiện chưa có định nghĩa WIZ-* riêng. Không tự mở rộng nghĩa ngoài bảng này. [VERIFIED: `.planning/ROADMAP.md:156-169`, `.planning/REQUIREMENTS.md`]

| ID | Description | Research Support |
|----|-------------|------------------|
| WIZ-UI-01 | Quick bar PL02/PL03/PL07/CAB và UI wizard trong AI Chat Drawer | Component seams, state model, accessibility, test map |
| WIZ-INTERACTIVE-01 | Thu thập đầu vào, retrieval có căn cứ, hỏi bù gap, preview Markdown trước khi duyệt | Stage schemas, revision guard, bounded AI calls, degraded path |
| WIZ-DOCX-01 | Sinh DOCX client-side đúng mẫu và lưu Project-linked Note | Builder split, OOXML golden strategy, export/persistence boundary |
| WIZ-FLOW-01 | Luồng PL02 → SOLUTION → implementation → PL03/PL07 → CAB | Lifecycle state machine và artifact identity chain |
| WIZ-LOOP-01 | SOLUTION versioned, mở lại đúng project thread, cập nhật khi drift | Structured artifact metadata, idempotent atomic saves, restore rules |
| WIZ-PACK-01 | Nạp/validate/confirm/change-pack và đối soát actual-vs-approved | ZIP threat model, two-phase validation, atomic persistence, drift ledger |
</phase_requirements>

## Summary

Phase này không cần framework AI mới hay package mới. Nền tảng hiện có đã có React/Ant Design, Dexie, project-scoped chat persistence, grounded retrieval, local BM25 fallback, MCP federation, Mermaid, JSZip, `docx`, Zod và file download helpers. Phần thiếu là orchestration theo state machine, schema stage-specific, metadata artifact/version bền vững, ingest ZIP all-or-nothing, builder DOCX chuyên biệt và UI card theo hợp đồng Phase 25. [VERIFIED: `package.json`, `src/components/ai/AIChatDrawer.tsx`, `src/services/ai/groundedTurnDeps.ts`, `src/services/search/localGroundedRetrieval.ts`, `25-AI-SPEC.md`]

Rủi ro lớn nhất không nằm ở render UI mà ở danh tính artifact: đúng Project/thread, đúng SOLUTION Note/version/hash, đúng pack base/head/CR, đúng draft revision và đúng preview đã duyệt. Mọi kết quả async phải kiểm tra revision sau `await`; mọi save phải idempotent và transaction-local; AI chỉ tạo proposal có schema, còn app sở hữu transition, approval, version và persistence. [VERIFIED: `25-AI-SPEC.md` §4, §6]

Hai precondition đang thiếu: source `.docx` thật dưới `docs/pl-templates/` không tồn tại trong worktree hoặc checkout chính được khảo sát, và fixture PL07 I–V nguyên văn chưa được trích xuất/review. `25-TEMPLATES.md` chỉ mô tả cấu trúc, không đủ để chứng minh wording/layout fidelity. Plan phải đặt Wave 0 khôi phục/pin template và fixture trước builder. [VERIFIED: Glob + `git ls-files "docs/pl-templates/*.docx"`; `25-TEMPLATES.md:128-139`; `25-AI-SPEC.md:405-410`]

**Primary recommendation:** Dùng repo-owned staged wizard + event/snapshot có revision trong `ChatMessage`, metadata artifact có cấu trúc trong `Note`, ingest pack hai pha, bốn builder deterministic; không dùng tool loop 30 vòng hay `executeDynamicFileScript` cho export wizard. [VERIFIED: `25-AI-SPEC.md:74-100,216-232`; `src/components/ai/AIChatDrawer.tsx:1209`; `src/utils/dynamicFileSandbox.ts`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Quick bar, metadata, question/preview/dropzone cards | Browser / Client | — | UI Ant Design trong Drawer; không cần server. [VERIFIED: `25-UI-SPEC.md` Component Inventory] |
| Wizard lifecycle, revision guards, approval | Browser / Client service | IndexedDB | App sở hữu transition; trạng thái phải sống qua reload. [VERIFIED: `25-AI-SPEC.md:224-227`] |
| Grounded retrieval | Browser orchestration | Optional knowledge daemon/MCP | Daemon/MCP tăng evidence nhưng local BM25 và Docs vẫn hoạt động khi vắng. [VERIFIED: CLAUDE.md Runtime; `groundedTurnDeps.ts`] |
| Chat/draft/artifact/version persistence | Database / Storage (IndexedDB) | Browser service | Dexie là canonical local store; chat chỉ continuity, Note là canonical artifact. [VERIFIED: CLAUDE.md Persistence; `25-AI-SPEC.md:224-228`] |
| ZIP validation/reconciliation | Browser / Client service | IndexedDB | Giải nén, validate và commit chạy client-side; không gửi archive cho server mặc định. [VERIFIED: D-15; `25-AI-SPEC.md:230`] |
| DOCX generation/download | Browser / Client service | IndexedDB Note | `docx` chạy browser; approved Markdown/structured payload được lưu local. [CITED: https://github.com/dolanmiu/docx] |
| External code execution | External developer repo / Claude Code | — | TaskMate chỉ xuất SOLUTION và nhận change-pack; không chạy code thay Dev. [VERIFIED: D-10, D-13] |
| GitHub Pages/PWA delivery | CDN / Static | Browser cache | Không có backend bắt buộc; base path `/task-management/`. [VERIFIED: `vite.config.ts:8-60`, CLAUDE.md] |

## Project Constraints (from CLAUDE.md)

- Một personal user; không tạo roles/collaboration model. [VERIFIED: CLAUDE.md]
- PlannerMate phải 100% local/offline; knowledge daemon chỉ optional, không trở thành canonical store hay startup dependency. [VERIFIED: CLAUDE.md]
- IndexedDB/Dexie là working store; GitHub chỉ giữ encrypted backup artifact. [VERIFIED: CLAUDE.md]
- GitHub Pages dùng repository subpath/static routing; PWA update không gây mất dữ liệu. [VERIFIED: CLAUDE.md]
- Ant Design; UI đơn giản, nhanh, responsive, accessible; theme token thay raw color. [VERIFIED: CLAUDE.md; `25-UI-SPEC.md`]
- Stable UUID bằng `crypto.randomUUID()`/project helper; hierarchy/version change không đổi ID. [VERIFIED: CLAUDE.md; `src/utils/uuid.ts`]
- TypeScript strict; giữ `noUncheckedIndexedAccess` và `exactOptionalPropertyTypes` tương thích. [VERIFIED: CLAUDE.md]
- Multi-table writes dùng Dexie transaction; tests persistence dùng `fake-indexeddb`. [VERIFIED: CLAUDE.md]
- Không dùng raw service worker, auto `skipWaiting`, `localStorage` làm domain database, server-state library cho local DB, hay backend bắt buộc. [VERIFIED: CLAUDE.md]
- Không thêm package nếu native/stdlib/dependency hiện có đủ; Phase 25 đã có `docx`, `jszip`, `mermaid`, Zod, Dexie. [VERIFIED: `package.json`]
- Chỉ chạy targeted tests nhỏ nhất liên quan; không chạy full suite không liên quan. [VERIFIED: project memory `targeted-tests-only.md`]
- GSD workflow đã được khởi tạo bằng `init.phase-op`; file research được ghi theo yêu cầu `/gsd-plan-phase`. [VERIFIED: init output]
- Không có project skill dưới các thư mục skill được kiểm tra. [VERIFIED: Glob `.claude/.agents/.cursor/.github/.codex/skills/**/SKILL.md`]
- Phase 25 clarification: không thêm DLP scan/egress prompt mới; không gỡ publication safeguards, credential/tool permission hoặc archive validation hiện hữu. [VERIFIED: `25-AI-SPEC.md:22-27`]

## Standard Stack

### Core

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| React + Ant Design | lockfile `19.3.0` + `6.6.5` | Wizard UI/cards/modal/accessibility | Stack cố định của project. [VERIFIED: `package-lock.json`, `src/App.tsx`, `25-UI-SPEC.md`] |
| Dexie + IndexedDB | lockfile `4.4.6` + Browser API | Thread, draft, Notes, DocumentSet, atomic writes | Existing local canonical store. [VERIFIED: `package-lock.json`, `src/db/index.ts`] |
| Zod | lockfile `4.6.5` | Strict stage/meta/artifact validation | `strictObject`, parse/safeParse, refine và discriminated union phù hợp state payload. [CITED: https://zod.dev/api] |
| `docx` | lockfile `9.9.0` | PL02/PL03B/PL07/CAB builders | Đã khóa bởi D-03; chạy browser và hỗ trợ sections/headers/tables. [CITED: https://github.com/dolanmiu/docx] |
| JSZip | lockfile `3.10.2` | Đọc change-pack và đọc OOXML trong tests | Đã có; `loadAsync` từ 3.8 sanitize `..`, nhưng vẫn cần policy riêng. [CITED: https://stuk.github.io/jszip/documentation/api_jszip/load_async.html] |
| Mermaid | lockfile `11.17.2` | Preview flow trong chat | Existing `MermaidViewer`; Word dùng execution matrix, không nhúng SVG. [VERIFIED: `ChatMessageBubble.tsx:210-280`, D-09] |
| Native Blob/File/AbortController/Web Crypto | Browser API | ZIP input, download, cancel, artifact hash | Không cần package mới. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal] |

### Supporting

| Existing module | Purpose | When to Reuse |
|-----------------|---------|-------------|
| `groundedTurnDeps.ts` | Federated retrieval + local fallback + MCP | Stage thu thập evidence; không dùng nó làm lifecycle authority. [VERIFIED: codebase] |
| `localGroundedRetrieval.ts` | BM25 scoped theo resolved DocumentSet | Daemon unavailable; empty scope phải trả empty, không global scan. [VERIFIED: `localGroundedRetrieval.ts:176-304`] |
| `chatRepo.ts` | Thread unique theo `scopeKey`, message transaction | Mọi wizard chỉ trong `project:<id>` thread. [VERIFIED: `chatRepo.ts:32-112`] |
| `noteRepo.ts` / `documentSetRepo.ts` | Notes và set membership | Mở rộng bằng transaction service cho artifact/pack; không chain nhiều repo call rời. [VERIFIED: codebase] |
| `fileExport.ts` | `downloadBlob`, save picker | Download Blob đã build; không dùng generic Markdown-to-DOCX cho bank templates. [VERIFIED: `fileExport.ts`, `ChatMessageBubble.tsx:877-992`] |
| `MarkdownContentRenderer` / `MermaidViewer` | Safe Markdown + diagram preview | Preview approved draft trong card. [VERIFIED: `ChatMessageBubble.tsx:241-280`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Repo-owned staged service | Existing 30-loop AI orchestrator | Tool loop hữu ích cho chat tự do nhưng quá rộng, có mutation/file-script tools và thiếu per-call output cap; chỉ dùng retrieval read-only tối đa 3 loops nếu direct grounded call không đủ. [VERIFIED: `25-AI-SPEC.md:216-223`; `AIChatDrawer.tsx:1209-1331`] |
| Dedicated builders | Generic renderer / dynamic generated script | Generic renderer không giữ cây template khác nhau; script model-generated vi phạm guardrail. [VERIFIED: D-20; `25-AI-SPEC.md:230-232`] |
| Structured Note metadata | Parse version từ title/tag | Title/tag dễ rename/collision; metadata giữ artifact kind/version/baseline hash rõ và vẫn không cần index/schema bump. [ASSUMED] |
| Event/snapshot trong chat message | Dedicated `wizardSessions` table | Table mới tăng migration/backup/cascade; optional structured payload trên message đủ nếu transition append-only và latest session được chọn theo `sessionId/revision`. [ASSUMED] |

**Installation:** Không cài package mới. Dùng lockfile hiện tại. [VERIFIED: `package.json`, D-03, D-15]

**Version note:** Registry ngày 2026-10-28 có bản mới hơn cho `docx`, Mermaid, Zod và Dexie; phase không upgrade vì không có nhu cầu và lockfile/current contracts đã xác minh ở version hiện tại. [VERIFIED: `npm view` session]

## Package Legitimacy Audit

Không có external package install trong phase. `slopcheck` không cài/chạy được trong môi trường research; vì vậy không được dùng kết quả registry để gắn nhãn package mới `[VERIFIED]`. Tất cả tên package trong stack đến từ dependency hiện hữu và official docs, không phải đề xuất install. [VERIFIED: slopcheck probe; `package-lock.json`]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none; audit không chạy, không có package install để gate.

## Architecture Patterns

### System Architecture Diagram

```text
Project-scoped AI Chat Drawer
  -> chọn PL02 / PL03 / PL07 / CAB
  -> Metadata schema + project/thread identity
  -> load canonical local artifacts (Notes + current SOLUTION version)
  -> retrieval planner
       -> scoped IndexedDB Docs/BM25 (always local)
       -> optional knowledge daemon/Neo4j (fail-soft by existing taxonomy)
       -> optional enabled MCP read tools (scoped allowlist)
  -> frozen EvidencePack + inputRevision
  -> stage-specific AI proposal (strict Zod)
       -> invalid/refused/stale: preserve prior draft, retry/manual path
       -> gaps: question cards -> answers/skips -> new revision
       -> complete proposal: immutable preview message
  -> explicit user approval
       -> SOLUTION: atomic versioned Note + artifact event
       -> PL/CAB: deterministic builder -> Blob
            -> atomic Note/artifact save
            -> browser download/save picker (separate outcome)

change-pack.zip
  -> compressed-size gate
  -> JSZip parse into memory
  -> canonical path + meta + allowed-entry + expanded-budget validation
  -> user confirms CR/base/head/branch
  -> one Dexie transaction: Notes + Project DocumentSet membership + artifact event
  -> pin pack hash + SOLUTION id/version/hash
  -> bounded reconciliation + coverage ledger
  -> PL03 four sections -> PL07 -> CAB using exact pinned revisions
```

Mọi network/AI call nằm ngoài Dexie transaction; transaction chỉ re-check expected revision và commit local records. [CITED: https://dexie.org/docs/Dexie/Dexie.transaction()]

### Recommended Project Structure

```text
src/
├── components/ai/wizard/
│   ├── WizardSkillBar.tsx
│   ├── WizardMetadataModal.tsx
│   ├── GapFillQuestionCard.tsx
│   ├── DocumentPreviewCard.tsx
│   ├── SolutionReviewCard.tsx
│   ├── ChangePackDropzone.tsx
│   ├── DriftMatrixView.tsx
│   └── WizardLifecycleBar.tsx
├── services/ai/
│   ├── wizardSchemas.ts          # strict stage/input/output/event schemas
│   └── wizardService.ts          # bounded stages, evidence freeze, revision guards
├── services/wizard/
│   ├── artifactRepo.ts           # atomic Note/message/set/version writes
│   ├── changePack.ts             # validate/extract/confirm manifest
│   └── reconciliation.ts         # coverage ledger + normalized drift tuples
├── services/export/
│   ├── wizardDocx.ts             # buildWizardDocx dispatcher only
│   ├── pl02Docx.ts
│   ├── pl03bDocx.ts
│   ├── pl07Docx.ts
│   ├── cabDocx.ts
│   ├── docxShared.ts             # row builders/styles only
│   └── pl07Baseline.ts           # source-derived immutable fixture
└── types/models.ts               # optional wizard/artifact metadata
```

UI file split follows approved `25-UI-SPEC.md`; service files remain few and domain-focused. [VERIFIED: `25-UI-SPEC.md:159-185`]

### Pattern 1: Append-only wizard transition + revision guard

**What:** Mỗi stage/preview/approval ghi structured `wizard` snapshot/event với `sessionId`, `projectId`, `threadId`, `inputRevision`, `draftRevision`, `status`, pinned evidence/baseline/pack IDs. Kết quả async chỉ commit nếu snapshot hiện tại vẫn đúng. [VERIFIED: `25-AI-SPEC.md:224-228,258-260`]

**When to use:** Mọi model/retrieval/ZIP/export action có `await`.

```ts
// Source: 25-AI-SPEC.md §4/§4b
const expected = await loadWizardRevision(sessionId);
const proposal = WizardProposalSchema.parse(await runStage(frozenInput, signal));
signal.throwIfAborted();

await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
  const current = await loadWizardRevisionInTransaction(sessionId);
  if (current !== expected) throw new Error('STALE_WIZARD_TURN');
  await appendWizardSnapshot(proposal, expected + 1);
});
```

### Pattern 2: Two-phase pack ingestion

**What:** Phase A đọc/validate toàn bộ archive vào immutable manifest, không write. Phase B hiển thị identity cho user confirm. Phase C revalidate manifest hash và commit tất cả Notes/membership/link/event trong một transaction. [VERIFIED: D-15–D-17; `25-AI-SPEC.md:230,364-365`]

**When to use:** Mọi `change-pack.zip`.

```ts
// Source: JSZip loadAsync docs + 25-AI-SPEC F10
const zip = await JSZip.loadAsync(file, { checkCRC32: true });
for (const entry of Object.values(zip.files)) {
  const original = entry.unsafeOriginalName ?? entry.name;
  const path = canonicalizePackPath(original); // reject absolute, '..', NUL, duplicate
  validateAllowedPackPath(path);
}
// Only after full extraction, schema validation, budget checks and user confirmation:
await persistConfirmedPackAtomically(manifest, expectedWizardRevision);
```

`checkCRC32` có cost đáng kể với file lớn, nhưng pack compressed đã có ceiling; giữ bật cho ingest integrity. [CITED: https://stuk.github.io/jszip/documentation/api_jszip/load_async.html]

### Pattern 3: Approved structured payload → dedicated DOCX builder

**What:** UI không build document. Builder nhận payload đã Zod-validate, tạo `Document`, rồi `Packer.toBlob`. PL07 baseline không xuất phát từ model. [VERIFIED: D-03, D-19, D-20; `25-AI-SPEC.md:230-232`]

```ts
// Source: https://github.com/dolanmiu/docx
export async function buildWizardDocx(
  kind: 'PL02' | 'PL03B' | 'PL07' | 'CAB',
  raw: unknown,
): Promise<Blob> {
  const payload = WizardExportPayloadSchema.parse(raw);
  const document = kind === 'PL02'
    ? buildPl02(payload)
    : kind === 'PL03B'
      ? buildPl03b(payload)
      : kind === 'PL07'
        ? buildPl07(payload, PL07_BASELINE)
        : buildCab(payload);
  return Packer.toBlob(document);
}
```

### Pattern 4: Structured artifact identity, not filename inference

**What:** `Note` cần optional metadata như `sdlcArtifact: { kind, version, projectId, threadId, sessionId, inputHash, sourceArtifactIds, approvedAt }`; `ChatMessage.wizard` giữ render/lifecycle snapshot. Backup schemas phải giữ và validate các field này. Dexie không cần version bump nếu không thêm index/table. [VERIFIED: IndexedDB object storage behavior in current schema; current backup schemas strip unknown keys by default; `backupSchemas.ts:256-349`] [ASSUMED: exact field names]

**When to use:** SOLUTION versioning, PL02/PL03B/PL07/CAB history, pack baseline pinning.

### Pattern 5: Coverage ledger before “không drift”

**What:** Reconciliation lưu từng requirement/file/hunk trạng thái `included | deferred | unreadable | binary`; chỉ kết luận “không drift” nếu ledger đầy đủ. [VERIFIED: `25-AI-SPEC.md` E3/F07]

**When to use:** PL03/PL07 từ pack, nhất là diff lớn/binary/truncated.

### Component Responsibilities

| File/service | Change |
|--------------|--------|
| `AIChatDrawer.tsx` | Tích hợp wizard coordinator, project-only gate, one active session, abort/revision invalidation; không nhét prompt/build/ZIP logic vào component. [VERIFIED: existing component already owns scope/thread/abort] |
| `ChatInputBar.tsx` | Thêm `leadingContent?: ReactNode`; browser file picker cho pack phải truyền `File`, không chỉ filename/path string. [VERIFIED: current `onAttachFile` only receives string at lines 181-213] |
| `ChatMessageBubble.tsx` | Branch `msg.wizard` trước `msg.grounding`; delegate cards; wizard download gọi dedicated builder, không `executeDynamicFileScript`. [VERIFIED: current grounding branch line 332; dynamic script line 927-977] |
| `ChatMessageList.tsx` | Truyền wizard callbacks; giữ historical preview immutable. [VERIFIED: current map/bubble seam lines 132-179] |
| `models.ts` + `chatRepo.ts` | Typed wizard snapshot/event và save validation. [VERIFIED: current message has no wizard field; `SaveMessageInput` has no wizard] |
| `backupSchemas.ts` | Bảo toàn/validate wizard + artifact metadata; nếu không, backup round-trip làm mất field mới. [VERIFIED: current Zod object lists no wizard/artifact fields] |
| `artifactRepo.ts` | Một transaction cho version allocation/idempotency/Note + message + set/link. [CITED: https://dexie.org/docs/Dexie/Dexie.transaction()] |
| `changePack.ts` | Pure parse/validate trước persistence; stable reason codes, không raw archive error lên UI. [VERIFIED: UI copy contract; AI guardrails] |
| `services/export/*` | Four deterministic builders; shared style/row helpers only. [VERIFIED: D-20/D-21] |

### Anti-Patterns to Avoid

- **Local React state là nguồn thật:** reload mất draft; derive active session từ persisted snapshots. [VERIFIED: D-08, E6]
- **Gọi `createNote()` rồi `updateDocumentSet()` rời nhau:** failure giữa hai call tạo orphan/partial pack; dùng một transaction. [VERIFIED: current repositories are separate; Dexie docs]
- **Network/model call trong transaction:** IndexedDB auto-commit khi idle; gây `TransactionInactiveError`. [CITED: https://dexie.org/docs/Dexie/Dexie.transaction()]
- **Dùng `executeDynamicFileScript`:** model-generated JS execution không được phép cho wizard. [VERIFIED: `25-AI-SPEC.md` critical failure 4/E7]
- **Tin filename đã sanitize của JSZip là đủ:** phải kiểm tra `unsafeOriginalName`, canonical duplicates và policy allowed entries. [CITED: https://stuk.github.io/jszip/documentation/api_jszip/load_async.html]
- **Persist Blob DOCX vào chat/Note:** backup phình to và hiện model không hỗ trợ binary document attachment; regenerate deterministically từ approved payload. [VERIFIED: Note attachment schema chỉ image; `models.ts:190-199`, `backupSchemas.ts:187-202`]
- **Parse version từ title:** rename/collision làm chọn sai baseline. [ASSUMED]
- **Coi graph entity tồn tại là dependency:** relation/implementation claim cần evidence path/range. [VERIFIED: `25-AI-SPEC.md:228`]
- **Coi ZIP parse thành công là pack complete:** binary/truncated/deferred content phải làm coverage partial. [VERIFIED: E3/F07]
- **Tự suy ra layout từ `25-TEMPLATES.md`:** source DOCX/OOXML mới là authority. [VERIFIED: D-18; AI-SPEC planning preconditions]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Word OOXML ZIP | XML/ZIP writer riêng | Existing `docx` builders | Headers, tables, numbering, relationships và fields phức tạp. [CITED: https://github.com/dolanmiu/docx] |
| ZIP decompressor | Parser deflate riêng | Existing JSZip | Existing dependency; hỗ trợ browser và path sanitization baseline. [CITED: https://stuk.github.io/jszip/documentation/api_jszip/load_async.html] |
| Runtime validation | Type casts / ad-hoc `typeof` tree | Existing Zod strict schemas | AI/archive/backup là trust boundaries. [CITED: https://zod.dev/api] |
| Local transaction protocol | Manual rollback arrays | Dexie transaction | Atomic rollback across listed tables. [CITED: https://dexie.org/docs/Dexie/Dexie.transaction()] |
| IDs/hashes | UUID/hash package | `crypto.randomUUID`, existing `computeSha256` | Native/existing code đủ. [VERIFIED: CLAUDE.md; `documentSetRepo.ts:61-83`] |
| Markdown/Mermaid renderer | New parser | Existing safe renderer + MermaidViewer | Đã xử lý preview và fullscreen. [VERIFIED: `ChatMessageBubble.tsx`, `MermaidViewer.tsx`] |
| AI agent framework | LangGraph/LlamaIndex | Existing 9router + grounded pipeline | Không cần server/runtime/dependency mới. [VERIFIED: `25-AI-SPEC.md:74-100`] |

**Key insight:** Custom code chỉ nên sở hữu bank-specific schema, lifecycle và layout. Compression, OOXML primitives, validation, transactions, hashing, rendering và retrieval đã có giải pháp trong stack. [VERIFIED: codebase + official docs]

## Common Pitfalls

### Pitfall 1: Wizard field tồn tại runtime nhưng mất khi backup/restore
**What goes wrong:** Dexie lưu optional property, nhưng `BackupChatMessageRecordSchema`/`BackupNoteRecordSchema` không khai báo nên Zod object mặc định strip field khi validate. [VERIFIED: `backupSchemas.ts`; Zod default object behavior]
**How to avoid:** Mở rộng model, input schema, backup schema, backup round-trip tests cùng wave persistence.
**Warning signs:** Reload cùng DB pass nhưng import backup mất version/card/session.

### Pitfall 2: Duplicate SOLUTION version do double-click/race
**What goes wrong:** Hai action cùng đọc max version rồi cùng tạo v(n+1). [ASSUMED]
**How to avoid:** Idempotency key `(sessionId,draftRevision,artifactKind)`; transaction re-query existing key trước add; disable pending button chỉ là UX, không phải correctness.
**Warning signs:** Hai Note cùng version hoặc hai generated-file rows.

### Pitfall 3: Stale AI result ghi đè draft mới
**What goes wrong:** scope switch/cancel/edit không hủy được Tauri/native late response. [VERIFIED: `25-AI-SPEC.md:129-135,258-260`]
**How to avoid:** Abort + `isCurrent()` + revision/hash check after every await và trong transaction.
**Warning signs:** Preview xuất hiện sau cancel hoặc chứa câu trả lời cũ.

### Pitfall 4: ZIP bomb/path collision dù compressed file dưới 5MB
**What goes wrong:** `generateAsync`/`async` giữ full result trong memory; string UTF-16 có thể gấp đôi; sanitized names có thể collision. [CITED: https://stuk.github.io/jszip/documentation/limitations.html]
**How to avoid:** Freeze entry-count/expanded-byte/per-entry limits trước implementation; count bytes khi extract; reject duplicate canonical names và unsafe original paths trước write.
**Warning signs:** memory spike, UI freeze, entries overwrite nhau, Notes thiếu nhưng UI báo success.

### Pitfall 5: Partial pack persistence
**What goes wrong:** Current ZIP import pattern tạo folders tuần tự rồi batch docs; failure có thể để lại partial folders. Pattern đó không phù hợp change-pack trust boundary. [VERIFIED: `ZipImportPreviewModal.tsx:281-365`]
**How to avoid:** Không reuse persistence flow; chỉ reuse JSZip familiarity. Validate all first, transaction all tables once.
**Warning signs:** pack invalid nhưng Notes/folder đã xuất hiện.

### Pitfall 6: Project DocumentSet mapping mơ hồ
**What goes wrong:** Existing `DocumentSet` không có `projectId`; Project có thể có nhiều set. [VERIFIED: `models.ts:275-291`]
**How to avoid:** Lock one durable association strategy before code: recommended optional `projectId` + `purpose:'sdlc'` metadata, hoặc existing `KnowledgeLink` per member. [ASSUMED]
**Warning signs:** pack lưu vào set theo tên hoặc “set đầu tiên”.

### Pitfall 7: Generated file row đi qua dynamic sandbox/generic DOCX
**What goes wrong:** Existing `handleDownloadGeneratedFile` chọn sandbox khi content chứa code, còn generic DOCX khi không chứa. Cả hai đều không phải bank builder. [VERIFIED: `ChatMessageBubble.tsx:927-977`]
**How to avoid:** Wizard card callback gọi `buildWizardDocx` trực tiếp từ persisted approved payload; branch trước generic generated-file path.
**Warning signs:** template sai hoặc model script được execute.

### Pitfall 8: PL07 baseline “gần đúng”
**What goes wrong:** `25-TEMPLATES.md` chỉ có section/count, không có ~27 câu nguyên văn. [VERIFIED: `25-TEMPLATES.md:128-139`]
**How to avoid:** Extract source OOXML, review human, pin fixture hash, test exact Unicode/punctuation/order; AI chỉ điền mark/note và mục VI.
**Warning signs:** fixture do model viết hoặc test chỉ đếm 27 rows.

### Pitfall 9: “No drift” trên evidence partial
**What goes wrong:** Diff binary/truncated/deferred bị bỏ qua nhưng synthesis kết luận sạch. [VERIFIED: F07]
**How to avoid:** Complete coverage ledger là precondition của no-drift; partial status hiển thị trong PL03/CAB.
**Warning signs:** included count < manifest count nhưng drift empty.

### Pitfall 10: Download success bị báo quá mức
**What goes wrong:** Synthetic anchor chỉ khởi tạo download, không chứng minh file tới disk; Note save và download có thể thành công riêng. [VERIFIED: `fileExport.ts`; `25-AI-SPEC.md:396`]
**How to avoid:** Track `blobBuilt`, `noteSaved`, `downloadInitiated/savePickerSaved` riêng; retry không duplicate Note.
**Warning signs:** toast “đã tải và lưu” sau khi user cancel picker hoặc browser block download.

### Pitfall 11: Context compaction rewrite approved artifacts
**What goes wrong:** Chat context hiện có auto-compaction/boundary; nếu SOLUTION chỉ tồn tại trong prose history, baseline có thể mất/biến đổi. [VERIFIED: `AIChatDrawer.tsx:655-693`; `25-AI-SPEC.md:268`]
**How to avoid:** Load canonical Note/version/hash mỗi stage; history chỉ continuity.
**Warning signs:** reconciliation dùng summary thay Note body.

### Pitfall 12: Phase 24 dependency chưa đóng
**What goes wrong:** Roadmap còn `24-08-PLAN.md` unchecked; live/offline proof chưa hoàn tất. [VERIFIED: `ROADMAP.md:152-154`]
**How to avoid:** Planner thêm dependency gate; có thể làm deterministic Phase 25 waves, nhưng không tuyên bố phase complete trước Phase 24 gate.

## Code Examples

### Strict discriminated stage payload

```ts
// Source: https://zod.dev/api
const WizardSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('gap_fill'),
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    inputRevision: z.number().int().nonnegative(),
    questions: z.array(GapQuestionSchema).max(20),
  }),
  z.strictObject({
    status: z.literal('review'),
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    inputRevision: z.number().int().nonnegative(),
    draftRevision: z.number().int().positive(),
    payload: ApprovedDraftSchema,
  }),
]);
```

### Atomic artifact save, no network inside transaction

```ts
// Source: https://dexie.org/docs/Dexie/Dexie.transaction()
await db.transaction(
  'rw',
  [db.notes, db.chatMessages, db.chatThreads, db.documentSets],
  async () => {
    const existing = await findArtifactByIdempotencyKey(key);
    if (existing) return existing;
    await assertCurrentWizardRevision(sessionId, expectedRevision);
    await db.notes.add(note);
    await db.documentSets.update(setId, { documentIds: [...ids, note.id] });
    await db.chatMessages.add(savedEvent);
    await db.chatThreads.update(threadId, { updatedAt: now });
  },
);
```

### Canonical archive-path gate

```ts
// Source: https://stuk.github.io/jszip/documentation/api_jszip/load_async.html
export function canonicalizePackPath(raw: string): string {
  if (raw.includes('\0')) throw new Error('PACK_PATH_NUL');
  const normalized = raw.replace(/\\/g, '/');
  if (/^(?:[A-Za-z]:|\/)/.test(normalized)) throw new Error('PACK_PATH_ABSOLUTE');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('PACK_PATH_TRAVERSAL');
  }
  return parts.join('/');
}
```

### DOCX semantic golden inspection

```ts
// Source: DOCX is OOXML ZIP; test uses existing JSZip
const zip = await JSZip.loadAsync(await blob.arrayBuffer());
const documentXml = await zip.file('word/document.xml')!.async('string');
expect(documentXml).toContain('BIÊN BẢN CODE REVIEW');
expect(documentXml).toContain('Kiểm soát đầu vào dữ liệu');
expect(documentXml).not.toContain('undefined');
```

XML golden phải kiểm tra structure/merge/heading/numbering và được bổ sung manual render comparison; substring test đơn lẻ không đủ. [VERIFIED: `25-AI-SPEC.md:284,345-351`]

## State of the Art

| Old/current approach | Phase 25 approach | Impact |
|----------------------|-------------------|--------|
| Free chat + optional generated files | App-controlled staged wizard | Approval/lifecycle deterministic; proposal AI không tự mutate state. [VERIFIED: AI-SPEC] |
| Generic export or model-generated script | Dedicated validated builders | Không execute script; giữ template fidelity. [VERIFIED: current code + D-20] |
| ZIP Markdown preview imports selected docs | Trust-boundary change-pack ingest | Canonical path/meta/budget validation và atomic write bắt buộc. [VERIFIED: current ZipImport vs AI-SPEC] |
| Thread prose là context chính | Canonical Note/artifact revisions + thread continuity | Compaction/reload không đổi baseline. [VERIFIED: AI-SPEC] |
| Mermaid embedded preview | Flow steps structured once; Mermaid preview + Word matrix | Hai output derive cùng validated flow data. [VERIFIED: D-09] |

**Deprecated/outdated for this phase:**
- `executeDynamicFileScript` cho Word wizard: cấm dùng. [VERIFIED: AI-SPEC E7]
- Generic `exportContentAsFile(..., 'docx')` cho PL templates: không đủ fidelity. [VERIFIED: D-18–D-20]
- Sequential folder import flow cho change-pack: không atomic và không có archive threat gates. [VERIFIED: `ZipImportPreviewModal.tsx`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact wizard metadata field names đề xuất (`sdlcArtifact`, `wizard`, `projectId`, `purpose`) | Architecture Pattern 4 | Planner có thể chọn shape khác; phải giữ invariants và backup parity |
| A2 | Optional unindexed fields đủ, không cần Dexie schema v14 | Architecture Pattern 4 | Nếu query scale/index requirement đổi, cần migration/index |
| A3 | Append-only snapshot/event trên ChatMessage đủ thay dedicated wizard table | Alternatives | Restore/query có thể khó nếu payload lớn; cần spike size/backup |
| A4 | Structured Note metadata tốt hơn title/tag parsing | Alternatives | Tăng schema touchpoints nhưng giảm collision |
| A5 | Durable Project↔DocumentSet mapping nên thêm metadata thay name convention | Pitfall 6 | Chọn sai làm pack gắn nhầm set |

## Open Questions (RESOLVED)

1. **Source templates thật ở đâu? — RESOLVED BY EXECUTION GATE**
   - Plan 25-01 là blocking human precondition: khôi phục đúng ba source DOCX dưới `docs/pl-templates/`, xác nhận origin và ZIP signature trước mọi extraction/builder.

2. **PL07 baseline nguyên văn và layout ambiguities — RESOLVED BY SOURCE EXTRACTION**
   - Plans 25-01 và 25-02 khôi phục source, pin SHA-256, extract OOXML, tạo fixture PL07 I–V nguyên văn và yêu cầu human review. Model không được quyết định wording/layout.

3. **5MB và expanded archive ceilings — RESOLVED BY P25-R01**
   - `maxCompressedBytes=5_242_880`, `maxExpandedBytes=26_214_400`, `maxEntryBytes=2_097_152`, `maxEntries=256`.

4. **Project DocumentSet association — RESOLVED BY P25-R03**
   - Dùng optional `DocumentSet.sdlc={projectId,purpose:'sdlc'}` và optional `Note.sdlcArtifact`; tạo/reuse atomically, không suy luận theo tên.

5. **Download success copy conflict — RESOLVED BY P25-R05**
   - Direct anchor dùng `Đã bắt đầu tải`; chỉ dùng `Đã tải` khi save picker xác nhận saved và Note save thành công.

6. **WIZ requirement definitions — RESOLVED BY P25-R06**
   - Dùng canonical descriptions và success criteria trong ROADMAP cho `WIZ-UI-01`, `WIZ-INTERACTIVE-01`, `WIZ-DOCX-01`, `WIZ-FLOW-01`, `WIZ-LOOP-01`, `WIZ-PACK-01`; không tự mở rộng nghĩa.

7. **Artifact payload size trong chat backup — RESOLVED BY P25-R04**
   - Canonical Markdown + validated export payload nằm trong Project-linked Note; `ChatMessage` chỉ giữ pointer + bounded render snapshot. Structured payload cap `524_288` UTF-8 bytes; không thêm table/index/migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Build/Vitest | ✓ nhưng sai project standard | `v20.19.5` | Upgrade/use Node 24 LTS trước phase validation. [VERIFIED: probe; CLAUDE.md] |
| npm | Dependency restore/scripts | ✓ nhưng cũ hơn standard | `10.8.2` | Node 24 bundled/npm 12 per project setup. [VERIFIED: probe; CLAUDE.md] |
| Git | External change-pack producer/dev workflow | ✓ | `2.52.0.windows.1` | Pack fixtures mocked trong CI. [VERIFIED: probe] |
| Docker client | Optional live knowledge daemon | ✓ | `28.3.2` | Mock grounded deps + local BM25; daemon không được block core. [VERIFIED: probe; CLAUDE.md] |
| Docker daemon | Optional live knowledge daemon | Không xác nhận | — | Không cần cho deterministic Phase 25 tests. [VERIFIED: empty `docker info` probe] |
| LibreOffice | Visual DOCX smoke automation | ✗ | — | Manual Word/LibreOffice review checkpoint; OOXML tests automated. [VERIFIED: probe] |
| `unzip` | Manual OOXML diagnostics | ✓ | Info-ZIP 6.00 | JSZip trong tests/build. [VERIFIED: probe] |
| Source bank DOCX files | Template extraction/goldens | ✗ | — | Không có fallback hợp lệ; blocker cho fidelity acceptance. [VERIFIED: Glob/git] |
| 9router/knowledge daemon/MCP | Live semantic review | Optional/unprobed | — | Mocked transport + local BM25/manual edit/export. [VERIFIED: AI-SPEC degraded path] |

**Missing dependencies with no fallback:** Ba source bank DOCX cho fidelity gate.

**Missing dependencies with fallback:** LibreOffice CLI, optional daemon/MCP/live model.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `5.0.2` + jsdom + fake-indexeddb; Playwright `1.63.0` Chromium [VERIFIED: lockfile/config] |
| Config file | `vite.config.ts` test block; `playwright.config.ts` |
| Quick run command | `npm test -- tests/ai/wizardState.test.ts tests/ai/changePack.test.ts tests/export/wizardDocx.test.ts` |
| Component run command | `npm test -- src/components/ai/wizard/__tests__/documentWizard.test.tsx` |
| Phase suite command | `npm test -- tests/ai/wizardState.test.ts tests/ai/wizardService.test.ts tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts tests/export/wizardDocx.test.ts src/components/ai/wizard/__tests__/documentWizard.test.tsx tests/backup/wizardBackup.test.ts` |
| E2E command | `npm run test:e2e -- e2e/documentWizards.spec.ts --project=chromium` |

Current Playwright config không có `webServer`; current `e2e/aiChat.spec.ts` dùng `page.setContent`, nên không chứng minh app thật/IndexedDB/download lifecycle. Phase E2E phải chạy Vite app thật, tốt nhất thêm `webServer` config hoặc CI start server rõ ràng. [VERIFIED: `playwright.config.ts`; `e2e/aiChat.spec.ts`]

### Test Layers

1. **Pure schema/state tests (<5s):** transition legality, skip=unknown, approval invalidation, revision guards, idempotency keys, stage budgets. [VERIFIED: AI-SPEC E6/E8/E10]
2. **Archive tests (<10s):** exact boundary, corrupt meta, prohibited paths, traversal, normalized collision, CRC, entry/expanded limits, no-write assertions. [VERIFIED: F10]
3. **Repository tests (<10s):** fake-indexeddb atomic Note/message/set/link writes, concurrent SOLUTION save, cross-project rejection, backup round-trip. [VERIFIED: E6/E7]
4. **Builder tests (<15s):** build all four, unzip OOXML, assert headings/order/merges/styles/numbering/font/header/footer/sign-off, deterministic semantic XML. [VERIFIED: E1/E4/F15]
5. **Component tests (<15s):** project gate, keyboard chip/dropzone, metadata validation, gap cards, immutable previews, retry/cancel/focus/status. [VERIFIED: UI-SPEC Accessibility]
6. **Actual-app Playwright:** full project-thread lifecycle, reload restore, offline/daemon down, download + Note save outcomes. [VERIFIED: F16]
7. **Manual gates:** side-by-side Word/LibreOffice render; practitioner semantic review; opt-in live model cases F01/F02/F06/F08/F09/F11. [VERIFIED: AI-SPEC §5]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIZ-UI-01 | Project-scoped chips, modal, question/preview/dropzone/lifecycle accessibility | component + E2E | `npm test -- src/components/ai/wizard/__tests__/documentWizard.test.tsx` | ❌ Wave 0 |
| WIZ-INTERACTIVE-01 | Grounded gap-only questions, strict outputs, stale/cancel handling, degraded local path | unit/integration | `npm test -- tests/ai/wizardService.test.ts tests/ai/wizardState.test.ts` | ❌ Wave 0 |
| WIZ-DOCX-01 | Four client builders, template fidelity, no dynamic script, Note persistence | XML golden + repository + manual | `npm test -- tests/export/wizardDocx.test.ts` | ❌ Wave 0 |
| WIZ-FLOW-01 | PL02→SOLUTION→pack→PL03/PL07→CAB exact revision chain | integration + E2E | `npm test -- tests/ai/wizardState.test.ts tests/ai/reconciliation.test.ts` | ❌ Wave 0 |
| WIZ-LOOP-01 | Version/reopen/update/idempotency/cross-project safety | fake-indexeddb + E2E | `npm test -- tests/ai/wizardState.test.ts tests/backup/wizardBackup.test.ts` | ❌ Wave 0 |
| WIZ-PACK-01 | ZIP gates, confirm, atomic ingest, drift coverage | unit + fake-indexeddb | `npm test -- tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts` | ❌ Wave 0 |

### Reference Fixtures

Tạo trước implementation: [VERIFIED: `25-AI-SPEC.md:318-343`]

- `tests/fixtures/ai/wizard-reference.json` — 16 scenarios F01–F16, synthetic only.
- `tests/fixtures/ai/pl07-baseline.json` — trích từ source PL07, hash-pinned, human-reviewed.
- `tests/fixtures/ai/change-packs/` — valid, wrong CR, corrupt, traversal, duplicate-normalized, prohibited, binary, partial coverage.
- `tests/fixtures/docx/` — semantic expected headings/table/merge/numbering fixtures; không pin raw ZIP bytes/timestamps.

### Sampling Rate

- **Per task commit:** smallest one target, ví dụ `npm test -- tests/ai/changePack.test.ts`.
- **Per wave merge:** phase suite command ở trên.
- **Builder/layout change:** builder XML suite + manual render for affected template.
- **Phase gate:** Phase suite green, actual-app Playwright green, source-template visual sign-off, six live-model synthetic cases opt-in reviewed; Phase 24 dependency gate closed.

### Wave 0 Gaps

- [ ] Đồng bộ `25-CONTEXT.md`, `25-AI-SPEC.md`, `25-TEMPLATES.md` vào active worktree; hiện chỉ `25-UI-SPEC.md` có ở worktree. [VERIFIED: phase Glob]
- [ ] Khôi phục/pin ba source `.docx`; extract/review PL07 baseline.
- [ ] Chốt 5MB byte convention và expanded/entry/per-entry limits.
- [ ] Chốt Project↔DocumentSet mapping và artifact metadata shape.
- [ ] Tạo schemas/fixtures F01–F16 trước behavior implementation.
- [ ] Tạo test files trong requirement map.
- [ ] Thêm actual-app Playwright startup (`webServer` hoặc explicit Vite process).
- [ ] Nâng local Node lên project-standard 24 trước running Vitest 5 acceptance.

### Nyquist Verification Rules

- Mỗi task implementation phải có command <30s kiểm tra behavior vừa đổi; không dùng build/full suite thay targeted test. [VERIFIED: project memory]
- Mỗi boundary có negative test: AI unknown key, stale revision, wrong project, malformed archive, duplicate save, builder failure, Note-save failure, download cancellation. [VERIFIED: AI-SPEC E6–E10]
- Manual-only checks phải ghi evidence cụ thể: template filename/hash, Word/LibreOffice version, pages/sections compared, reviewer verdict; “looks good” không đủ. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no new auth | Reuse existing configured 9router/daemon credentials; không persist secret trong wizard payload/log. [VERIFIED: CLAUDE.md; AI-SPEC] |
| V3 Session Management | no web auth session | Wizard session là local lifecycle, protected bằng project/thread/revision identity; không gọi là auth session. [VERIFIED: AI-SPEC] |
| V4 Access Control | yes, local scope/tool capability | Project scope gate, exact set IDs, read-only MCP allowlist, deny unknown/mutation/publication tools. [VERIFIED: AI-SPEC §4/§6] |
| V5 Input Validation | yes | Zod strict schemas; archive canonical path/meta/type/size/count/expanded checks; stable error codes. [CITED: https://zod.dev/api] |
| V6 Cryptography | hash only | Existing SHA-256 for baseline/input/pack identities; không tự viết crypto. [VERIFIED: `documentSetRepo.ts`] |
| V8 Data Protection | yes | Local IndexedDB; content-free diagnostics; no raw docs/diffs/prompts/secrets in logs. Không thêm DLP per user clarification. [VERIFIED: AI-SPEC §7] |
| V10 Malicious Code | yes | Source/diff/MCP output treated as untrusted data; no generated script execution; builders deterministic. [VERIFIED: AI-SPEC E7/F11] |
| V12 File/Resource | yes | ZIP compressed + expanded limits, traversal/duplicate/type checks, all-or-nothing persistence. [CITED: https://stuk.github.io/jszip/documentation/api_jszip/load_async.html] |
| V13 API/Web Service | optional | Existing daemon error taxonomy; auth/config/parse không silent fallback, transport errors may local fallback. [VERIFIED: STATE decisions; grounded pipeline] |

### Known Threat Patterns for Browser Wizard Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection trong PL01/diff/MCP | Tampering/Elevation | Delimit as data, direct stage schemas, no tools by default, read-only scoped dispatcher. [VERIFIED: AI-SPEC §6] |
| ZIP traversal/absolute/canonical collision | Tampering | Inspect original path, normalize once, reject unsafe/duplicate, no filesystem extraction. [CITED: JSZip loadAsync docs] |
| ZIP bomb/memory exhaustion | Denial of Service | Compressed and expanded byte/entry ceilings, incremental counters, reject before persistence. [CITED: JSZip limitations] |
| Cross-project stale commit | Tampering/Information Disclosure | Bind project/thread/session/revision/hash; transaction re-check. [VERIFIED: E6/E7] |
| Unsupported approval/test/rollback claim | Spoofing | Explicit `unknown/not_applicable/pass/fail`, evidence IDs/ranges, user review, no AI approval field. [VERIFIED: E2/E4/E5] |
| Sensitive diagnostics | Information Disclosure | Allowlisted flat metrics only; no content/path/title/query/URL/error stack. [VERIFIED: AI-SPEC §7] |
| Model-generated executable export | Elevation/Tampering | Dedicated builder import only; test spy asserts zero `executeDynamicFileScript`. [VERIFIED: E7] |
| Duplicate action/replay | Tampering | Idempotency key + unique logical lookup inside transaction. [VERIFIED: E6/F13] |

## Sources

### Primary (HIGH confidence)

- `D:\personal\task-management\.planning\phases\25-interactive-sdlc-document-wizards\25-CONTEXT.md` — locked D-01…D-21.
- `D:\personal\task-management\.planning\phases\25-interactive-sdlc-document-wizards\25-AI-SPEC.md` — staged AI contract, guardrails, 16 evaluation fixtures.
- `D:\personal\task-management\.planning\phases\25-interactive-sdlc-document-wizards\25-TEMPLATES.md` — extracted template section/table structure; not verbatim PL07 authority.
- `D:\personal\task-management\.claude\worktrees\agent-aba75a4bac693ace4\.planning\phases\25-interactive-sdlc-document-wizards\25-UI-SPEC.md` — approved UI/accessibility contract.
- Codebase files cited inline: `AIChatDrawer.tsx`, `ChatInputBar.tsx`, `ChatMessageBubble.tsx`, `ChatMessageList.tsx`, `models.ts`, `chatRepo.ts`, `noteRepo.ts`, `documentSetRepo.ts`, `backupSchemas.ts`, `groundedTurnDeps.ts`, `localGroundedRetrieval.ts`, `ZipImportPreviewModal.tsx`, `vite.config.ts`, `playwright.config.ts`.
- [Zod API](https://zod.dev/api) — strict object, parse/safeParse, refinements, discriminated unions.
- [Dexie transaction](https://dexie.org/docs/Dexie/Dexie.transaction()) — transaction scope/rollback/async caveats.
- [docx official repository/docs](https://github.com/dolanmiu/docx) — browser support and Document sections.
- [JSZip loadAsync](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html) — path sanitization, `unsafeOriginalName`, CRC.
- [JSZip limitations](https://stuk.github.io/jszip/documentation/limitations.html) — full-result memory and UTF-16 cost.
- [MDN AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) — cancellation semantics.

### Secondary (MEDIUM confidence)

- npm registry probes on 2026-10-28 — latest versions/publish dates only; not used to recommend upgrades.
- `25-TEMPLATES.md` structural extraction — medium until original DOCX files and fixture hashes are available.

### Tertiary (LOW confidence)

- Assumed metadata field names and no-new-table persistence choice; see Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dependencies and source seams verified; no install needed.
- Architecture: MEDIUM — lifecycle invariants are locked/verified, exact persistence field shape remains planner decision.
- DOCX fidelity: LOW until original templates and verbatim PL07 fixture are restored.
- ZIP safety: MEDIUM — patterns verified, numerical expansion limits unresolved by user decision.
- Validation: HIGH for test design, LOW for execution because Wave 0 assets/tests do not exist.

**Research date:** 2026-10-28
**Valid until:** 2026-11-27 for codebase architecture; re-research after template restoration, dependency upgrade, or wizard contract change.
