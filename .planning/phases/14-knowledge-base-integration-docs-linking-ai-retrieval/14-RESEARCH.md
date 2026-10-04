# Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval) - Research

**Researched:** 2026-10-04  
**Domain:** Personal Knowledge Management (PKM), Markdown Editing, Lexical Search (BM25), Bidirectional Linking, AI Tool-Calling & Context Grounding  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Unified Note Model:** Mở rộng interface `Note` hiện tại với các trường `type: 'quick_note' | 'document'`, `parentId?: string` (phân cấp thư mục), `tags?: string[]`, `slug?: string`, `deletedAt?: string` (soft delete). Tái sử dụng bảng Dexie `notes` và `noteAttachments`, giữ tương thích 100% với Note popout và các AI tool hiện có.
- **D-02: Folder Tree + Tag Taxonomy:** Quản lý tài liệu theo cây thư mục nhiều cấp (`parentId`) kết hợp hệ thống tag linh hoạt. Thư mục mặc định cho tài liệu mới dán là "Inbox / Chung", cho phép di chuyển kéo thả hoặc chọn folder.
- **D-03: Markdown Split View + Outline ToC:** Trình soạn thảo và đọc tài liệu hỗ trợ chế độ xem song song (Split Editor/Preview) hoặc chuyển tab, tự động sinh Mục lục (Table of Contents / ToC) từ các thẻ Heading (`#`, `##`, `###`), hỗ trợ Syntax Highlighting cho code blocks.
- **D-04: Unified 3-Column Docs View:** Nâng cấp trang "Ghi chú" (`NotesView`) thành layout 3 cột chuẩn Document App:
  - Cột 1 (Sidebar con ~220px): Cây thư mục + Tags + Bộ lọc nhanh (Đã ghim, Tài liệu, Ghi chú nhanh, Thùng rác).
  - Cột 2 (Doc List ~300px): Danh sách tài liệu trong thư mục đã chọn, có thanh tìm kiếm, sắp xếp theo thời gian cập nhật.
  - Cột 3 (Main Content): Trình soạn thảo Markdown / Trình xem tài liệu toàn diện kèm nút phóng to Fullscreen và nút mở cửa sổ riêng (Popout). Vẫn hỗ trợ nút chuyển đổi Grid View khi chỉ muốn xem Sticky Notes.
- **D-05: Wiki-link Inline Syntax:** Hỗ trợ cú pháp `[[doc:id|Title]]`, `[[task:id|Title]]`, `[[project:id|Title]]`. Gõ `[[` kích hoạt Autocomplete Dropdown tìm kiếm nhanh Doc, Task, Project. Khi đọc (Rendered Preview) hiển thị thành clickable Chip trực quan; click vào Doc mở tài liệu, click vào Task/Project mở TaskDrawer hoặc chuyển view.
- **D-06: 2-Tier Auto-Detect & 1-Click Link Application:** Luồng nhập liệu cốt lõi: Khi người dùng paste Markdown từ bên ngoài vào:
  - Tầng 1: Thuật toán quét tức thì các từ khóa, mã Jira (`PROJ-123`), tên Task, Project, Milestone có sẵn trong cơ sở dữ liệu.
  - Tầng 2: AI Semantic Match đọc lướt nội dung để phát hiện các Task/Project đang hoạt động có liên quan mật thiết.
  - Hiển thị banner "💡 Gợi ý liên kết liên quan" ở đầu bài viết với danh sách checkbox và nút **"Áp dụng tất cả (Apply All)"** (1 click duy nhất) để tạo liên kết hai chiều tự động.
- **D-07: Dedicated Linked Knowledge Section & Quick View:** Trong `TaskDrawer` và `ProjectsView`, bổ sung khu vực "📚 Tài liệu & Tri thức liên kết (Linked Knowledge)" liệt kê các tài liệu đã gắn. Bấm vào tài liệu sẽ mở cửa sổ trượt đọc nhanh (Quick Preview Drawer) tại chỗ mà không làm mất ngữ cảnh công việc đang làm.
- **D-08: Backlinks Footer:** Dưới chân mỗi tài liệu trong Document Viewer có khu vực "🔗 Được liên kết từ (Backlinks)" hiển thị danh sách các Task, Project đang tham chiếu đến tài liệu này, bấm vào mở ngay TaskDrawer tương ứng.
- **D-09: Smart Auto-Metadata Extraction:** Khi paste nội dung Markdown: Tự động trích xuất dòng `# Heading 1` đầu tiên làm Tiêu đề; trích xuất các hashtag `#keyword` làm Tags; nếu phát hiện liên kết với Project thì gợi ý chuyển vào folder của Project đó; tự động lưu nháp sau 500ms debounce.
- **D-10: Tool-Calling + BM25 Lexical Retrieval:** Trang bị AI Tool `search_knowledge_base(query, tags, limit)` trong `aiTools.ts`. Khi người dùng đặt câu hỏi, AI tự phân tích ý định (Query Expansion) và gọi tool này. Thuật toán BM25 cải tiến chạy tức thì trong IndexedDB, chuẩn hóa tiếng Việt không dấu/có dấu, tính điểm trọng số (Title x3, Tags x2, Body x1). 100% offline, zero network latency, không tốn thêm token sinh embeddings.
- **D-11: Relevance Snippet Extraction with Dynamic Char Budget:** Khi đưa tài liệu vào prompt context, hệ thống không nhồi nguyên bài dài mà trích xuất Metadata (Tiêu đề, Tags) + Đoạn Heading và văn bản chứa từ khóa khớp cao nhất (kèm 2-3 dòng ngữ cảnh trước/sau) của top 2-3 tài liệu liên quan. Tôn trọng ngân sách ký tự context `planner:ai_context_char_limit` đã thiết lập ở Phase 13.2.
- **D-12: Dual Explicit Doc Reference:** Cho phép chỉ định tài liệu trực tiếp vào hội thoại AI qua 2 cách:
  - Gõ `@doc:` trong `ChatInputBar` (bật popup tìm kiếm và chọn doc, tương tự `@task` và `@file`).
  - Nút "💬 Hỏi AI về tài liệu này" trên Header của Document Viewer (tự động mở AI Chat Drawer và gắn sẵn context của doc đó).
- **D-13: Clickable Citation Chips & Attribution:** Trong câu trả lời của AI, các đoạn kiến thức trích từ Knowledge Base có gắn chip tham chiếu bấm được `[📄 Tên tài liệu §Mục]` và danh sách tài liệu tham khảo ở cuối câu trả lời. Bấm vào mở Quick Preview Drawer ngay lập tức để người dùng kiểm chứng thông tin.
- **D-14: IndexedDB Source of Truth:** Toàn bộ tài liệu lưu trữ trong IndexedDB (bảng `notes` mở rộng). Tự động đồng bộ vào file backup mã hóa Web Crypto (AES-GCM) lên GitHub Contents API và JSON export. Đảm bảo hoạt động 100% offline trên cả Web PWA và Desktop Tauri.
- **D-15: Desktop Tauri Import/Export & External Editor:** Trên Desktop Tauri, cung cấp các hành động tiện ích:
  - Nhập thư mục Markdown hoặc file `.md` từ máy tính vào Knowledge Base.
  - Xuất toàn bộ Knowledge Base thành gói `.zip` (bảo toàn cấu trúc thư mục + folder `attachments/`) hoặc file `.md` lẻ.
  - Nút "Mở trong VS Code / Obsidian" cho tài liệu cục bộ nếu có đường dẫn file liên kết.
- **D-16: Binary Blob Attachments (`attachment:uuid`):** Paste/kéo thả ảnh vào Editor được lưu dưới dạng Blob trong bảng `noteAttachments`, văn bản Markdown chỉ chứa cú pháp `![caption](attachment:uuid)`. Giữ text Markdown cực nhẹ, tối ưu cho tìm kiếm và AI context. Tự động nén ảnh chụp màn hình dung lượng lớn (>2MB).
- **D-17: Soft Delete (Trash Bin) & Backlinks Warning:** Xóa tài liệu sẽ đưa vào "Thùng rác" (`deletedAt`), cho phép Khôi phục (Restore) hoặc Xóa vĩnh viễn (Permanent Delete). Khi bấm xóa tài liệu đang được Task hoặc Project liên kết, hệ thống hiển thị cảnh báo danh sách các liên kết bị ảnh hưởng trước khi xác nhận.

### Claude's Discretion
- Thuật toán phân tách token tiếng Việt (Vietnamese Tokenizer) không dấu và có dấu trong hàm chấm điểm BM25.
- Cơ chế debounce và virtual list khi hiển thị danh sách tài liệu lớn ở cột giữa của `NotesView`.
- Cấu hình phím tắt mở nhanh tìm kiếm tài liệu toàn cục `Cmd+Shift+K` (macOS) / `Ctrl+Shift+K` (Windows).

### Deferred Ideas (OUT OF SCOPE)
- Bi-directional Live Sync with Obsidian Vault Folder (file watcher) — để dành cho v1.2.
- Knowledge Graph Visualization (mạng lưới đồ thị 2D/3D kiểu Obsidian).
- Collaborative Real-time Editing (ứng dụng dành riêng cho 1 người, không dùng server hay CRDT).
</user_constraints>

## Project Constraints (from CLAUDE.md)
- **Local persistence:** 100% local IndexedDB (Dexie 4.4.6) as primary store, zero server runtime.
- **UI Stack:** Ant Design 6.6.5 + `@ant-design/icons` 6.3.4.
- **Dates & IDs:** Calendar dates strictly `YYYY-MM-DD`, UUIDs via native `crypto.randomUUID()`.
- **Validation:** Zod schemas required at trust boundaries (schema upgrades, mutations, imports).
- **No external heavy WYSIWYG or heavy search libraries:** Implement algorithms natively using existing dependencies (`dexie`, `zod`, `dayjs`, stdlib Web APIs).

## Summary

Phase 14 transforms PlannerMate into an offline-first Personal Knowledge Management (PKM) engine deeply interconnected with tasks, projects, milestones, and AI assistance. By extending the existing `notes` schema into `SCHEMA_V9` with folders (`parentId`), tags, document typing, and soft deletion (`deletedAt`), zero database fragmentation occurs while preserving 100% backward compatibility with existing sticky notes and timer popouts.

The search and retrieval architecture uses an in-memory/IndexedDB lexical BM25 ranking algorithm with field boosts (Title x3, Tags x2, Body x1) and bilingual Vietnamese normalization (handling diacritics and non-diacritics without heavy external NLP bundles). Smart Ingestion automates link suggestions (Tier 1 regex Jira/keywords + Tier 2 lightweight AI semantic match) with a 1-click "Apply All" banner. Markdown preview seamlessly renders interactive Wiki-link chips (`[[doc:...]]`, `[[task:...]]`, `[[project:...]]`), binary attachments (`attachment:uuid`), outline Table of Contents, and Backlinks footer.

**Primary recommendation:** Build upon existing Dexie repositories and `renderSafeMarkdown` rather than introducing third-party rich-text or search dependencies. Leverage Ant Design 6 components (`Tree`, `Card`, `Drawer`, `Mentions`) and Web Crypto/Tauri IPC for export/import.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Document Storage & Schema V9 | Database / Persistence (Dexie) | Local Storage | Dexie owns durable document persistence, schema upgrades, transactions, and multi-tab reactive queries (`useLiveQuery`). |
| Lexical BM25 Search & Tokenizer | Client Engine (Web Worker / Utility) | AI Tools (`aiTools.ts`) | Offline text tokenization and BM25 scoring run completely on-device without network calls or external embedding models. |
| 3-Column Docs & Split View | Frontend UI (`NotesView.tsx`) | Ant Design Components | Pure responsive layout: Tree navigation (~220px), Doc list (~300px), Markdown Split Editor/Reader pane with ToC. |
| Wiki-link Parsing & Chip Rendering | Client Markdown Engine (`markdown.ts`) | UI Interactive Chips | AST/regex transformations turn `[[...]]` into safe interactive HTML/React elements with click handlers. |
| Smart Ingestion & Entity Detection | Client Utility + AI Service | Ingestion Banner UI | Scans pasted text for Jira keys and known entities; suggests 1-click bidirectional relations. |
| AI Tool Calling (`search_knowledge_base`) | AI Service Tier (`aiTools.ts`) | AIChatDrawer / Grounding | Grounding prompts extract relevant document snippets within character budget limits. |
| Quick Preview & Backlinks Navigation | Frontend UI (`QuickPreviewDrawer.tsx`) | TaskDrawer / ProjectsView | Slide-out drawer reads documents on-demand from tasks and chat citations without context loss. |
| Tauri Zip & File Export | Desktop Tier (Tauri IPC / Native JS) | Browser Blob Fallback | Desktop opens native file dialogs and exports zip archives; Web falls back to standard Blob downloads. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dexie` | 4.4.6 [VERIFIED: npm registry] | IndexedDB persistence & `SCHEMA_V9` | Project standard; handles multi-table transactions, reactive live queries, and schema migration without data loss. |
| `dexie-react-hooks` | 4.4.0 [VERIFIED: npm registry] | `useLiveQuery` hook | Updates React tree automatically when docs, attachments, or links change. |
| `antd` | 6.6.5 [VERIFIED: npm registry] | UI Component framework | Standard project library (`Tree`, `Drawer`, `Alert`, `Mentions`, `Splitter`/Layout). |
| `@ant-design/icons` | 6.3.4 [VERIFIED: npm registry] | UI Icons | Standard icon suite (`FileTextOutlined`, `FolderOutlined`, `LinkOutlined`, etc.). |
| `zod` | 4.6.5 [VERIFIED: npm registry] | Schema & input validation | Enforces runtime boundaries for document inputs, wiki-link payloads, and export archives. |
| `dayjs` | 1.11.23 [VERIFIED: npm registry] | Date formatting | Manages relative update dates and ISO timestamp metadata. |

### Supporting (Native Browser / Platform APIs)
| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| Web Crypto API | Browser Native | AES-GCM & PBKDF2 encryption | Existing project encrypted backup mechanism. |
| Canvas / `createImageBitmap` | Browser Native | Screenshot compression (>2MB) | Compresses large pasted images before saving as Blob in `noteAttachments`. |
| `@tauri-apps/api` | 2.2.0 [VERIFIED: npm registry] | Desktop file integration | File opening in VS Code / Obsidian, folder pickers, and zip export on desktop. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom BM25 search utility | `minisearch` or `flexsearch` | External search libraries add 25-50KB bundle weight and require custom Vietnamese stemmers; custom BM25 utility in `src/utils/bm25.ts` is ~120 lines, fully tailored to Dexie and Vietnamese diacritics. |
| Regex Wiki-link parser | `markdown-it-wikilinks` | External parser introduces markdown parser divergence from project's `renderSafeMarkdown`. Enhancing `src/utils/markdown.ts` maintains unified security model. |
| Monaco / CodeMirror Editor | Basic Ant Design `Input.TextArea` + Split Preview | Full code editor adds >1MB bundle size. Lightweight textarea with split preview and syntax highlighting in preview meets all requirements with zero lag. |

## Package Legitimacy Audit

| Package | Registry | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------|-------------|---------|-------------|
| `antd` | npm | 4,359,429 | github.com/ant-design/ant-design | [OK]* | Approved (Existing core dependency) |
| `@ant-design/icons` | npm | 5,019,559 | github.com/ant-design/ant-design-icons | [OK] | Approved (Existing core dependency) |
| `dexie` | npm | 2,875,977 | github.com/dexie/Dexie.js | [OK]* | Approved (Existing core dependency) |
| `dexie-react-hooks` | npm | 603,213 | github.com/dexie/Dexie.js | [OK] | Approved (Existing core dependency) |
| `zod` | npm | 373,908,324 | github.com/colinhacks/zod | [OK]* | Approved (Existing core dependency) |
| `dayjs` | npm | 87,132,491 | github.com/iamkun/dayjs | [OK] | Approved (Existing core dependency) |

*\*Note: packages marked with recent publish timestamps by seam are verified existing foundational libraries in `package.json`.*  
No new npm dependencies required for Phase 14.

## Architecture Patterns

### System Architecture Diagram

```
                 [ User Ingestion / Editor Pane ]
                                │
          ┌─────────────────────┴─────────────────────┐
          │                                           │
  [ Smart Paste Handler ]                     [ Wiki-link Parser ]
  • Title Extraction (# Heading)              • [[doc:id|Title]]
  • Hashtag Extraction (#tag)                 • [[task:id|Title]]
  • Entity Match (Jira, Task/Proj)            • [[project:id|Title]]
          │                                           │
  [ 💡 Ingestion Banner ]                             ▼
  • 1-Click "Apply All"                     [ Interactive Chips ]
          │                                           │
          ▼                                           │
┌─────────────────────────────────────────────────────▼──────────────────────┐
│                    Persistence Layer (Dexie DB)                            │
│  - notes (type: 'document'|'quick_note', parentId, tags, deletedAt, body)  │
│  - noteAttachments (attachment:uuid -> binary image blob)                  │
└──────────────────────────┬─────────────────────────────────────────────────┘
                           │
          ┌────────────────┴──────────────────────────┐
          │                                           │
[ Lexical BM25 Search Engine ]               [ UI Presentation Layer ]
• Vietnamese Diacritic Normalization         • 3-Column NotesView (Tree + List + Editor)
• Field Boost: Title x3, Tag x2, Body x1     • TaskDrawer Linked Knowledge Section
• Relevance Snippet Extractor                • QuickPreviewDrawer (Context preservation)
          │                                  • Backlinks Footer
          ▼                                           │
[ AI Tool: search_knowledge_base ] ◄──────────────────┘
• Context Grounding with Char Budget
• Clickable Citation Chips [📄 Doc §Sec]
```

### Recommended File Structure
```
src/
├── types/
│   └── models.ts                     # Extend Note with type, parentId, tags, slug, deletedAt
├── db/
│   ├── schema.ts                     # Add SCHEMA_V9 with indexed fields
│   ├── index.ts                      # Upgrade v9 migration handler
│   └── repositories/
│       ├── noteRepo.ts               # Enhanced CRUD (folders, tags, soft-delete, backlinks)
│       └── documentLinkRepo.ts       # 2-way relationship queries (Task <-> Doc, Project <-> Doc)
├── utils/
│   ├── bm25.ts                       # BM25 ranking algorithm & Vietnamese tokenization
│   ├── markdown.ts                   # Enhanced with [[wiki-link]] and attachment:uuid rendering
│   ├── smartIngestion.ts             # Auto-detect headings, tags, Jira keys, task/project matches
│   └── documentExport.ts             # Markdown and zip archive export (Web Blob & Tauri IPC)
├── services/ai/
│   ├── aiTools.ts                    # Add search_knowledge_base and get_document_details tools
│   └── contextGrounding.ts           # Grounding snippet extractor with character budgeting
├── components/
│   ├── notes/
│   │   ├── DocFolderTree.tsx         # Cây thư mục (Column 1)
│   │   ├── DocListPane.tsx           # Danh sách tài liệu (Column 2)
│   │   ├── DocEditorPane.tsx         # Trình soạn thảo/Split preview (Column 3)
│   │   ├── DocOutlineToC.tsx         # Mục lục ToC tự động sinh từ Heading
│   │   ├── SmartIngestionBanner.tsx  # Banner gợi ý 1-click liên kết
│   │   ├── QuickPreviewDrawer.tsx    # Slide-out xem nhanh tài liệu
│   │   └── BacklinksSection.tsx      # Chân trang danh sách thực thể liên kết
│   ├── tasks/
│   │   └── LinkedKnowledgeSection.tsx# Section tri thức liên kết trong TaskDrawer
│   └── ai/
│       ├── ChatInputBar.tsx          # Bổ sung trigger @doc:
│       └── CitationChip.tsx          # Chip trích dẫn tài liệu bấm được trong AI chat
└── views/
    └── NotesView.tsx                 # Tái cấu trúc thành 3-Column Docs View
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tree drag-and-drop navigation | Custom HTML5 drag/drop tree | Ant Design `Tree` (`draggable`, `directoryTree`) | Handles node re-parenting, drop positions, nesting depth, and keyboard navigation cleanly. |
| Search indexing service | Heavy embedded WASM vector DB (Transformers.js / SQLite vector) | Pure TypeScript BM25 search in Dexie | Zero bundle bloat, 100% offline, zero cold-start delay, no memory leaks in browser. |
| Split pane layout | Manual resize drag listeners | Ant Design Layout / Flexbox + CSS grid or CSS Splitter | Cross-browser compatibility without brittle mouseup/mousemove edge cases. |
| Image attachment storage | Storing Base64 data URLs directly in Markdown text | `noteAttachments` table + `attachment:uuid` syntax | Base64 in Markdown balloons text size by 33%, makes BM25 search sluggish, and clogs AI context limits. |

## Runtime State Inventory

> Refactor / Schema upgrade phase:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing records in Dexie `notes` table without `type`, `parentId`, `tags`, `deletedAt` | Dexie migration `SCHEMA_V9` sets defaults: `type: 'quick_note'`, `tags: []`, `parentId: undefined`, `deletedAt: undefined`. Existing sticky notes remain 100% functional. |
| Live service config | None | Verified: Entire app is local client-side / static GitHub Pages. |
| OS-registered state | None | No OS hooks or background daemon registrations affected. |
| Secrets/env vars | None | Encryption uses existing user passphrase & Web Crypto keys. |
| Build artifacts | `src/types/models.ts` and `src/db/schema.ts` | Update TypeScript definitions and schema version to V9. |

## Common Pitfalls

### Pitfall 1: Breaking Existing Sticky Notes and Popouts
**What goes wrong:** Nâng cấp `NotesView` thành 3 cột khiến tính năng ghi chú nhanh (Sticky Notes) và cửa sổ Popout (`NotesPopoutView.tsx`) bị lỗi hiển thị hoặc mất liên kết với Task.  
**Why it happens:** Giả định toàn bộ `Note` đều là `document`.  
**How to avoid:** Phân biệt rõ `type: 'document'` và `type: 'quick_note'`. Giữ nguyên `entityType` và `entityId` cho quick notes gắn với Task/Project. Hỗ trợ nút chuyển đổi "Grid View (Ghi chú nhanh)" trên toolbar của `NotesView`.

### Pitfall 2: Vietnamese Diacritic Mismatches in Lexical Search
**What goes wrong:** Người dùng gõ "bao cao" không tìm thấy tài liệu có tiêu đề "Báo cáo tiến độ", hoặc ngược lại.  
**Why it happens:** Chuỗi tiếng Việt có dấu và không dấu khác mã Unicode; hàm `.includes()` thông thường phân biệt chặt chẽ.  
**How to avoid:** Tạo hàm chuẩn hóa `normalizeVietnameseText()` sử dụng NFD decomposition: `str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()`. Trong BM25 indexer, index cả dạng có dấu gốc và dạng không dấu.

### Pitfall 3: AI Context Budget Exhaustion by Long Markdown Docs
**What goes wrong:** Tài liệu dài 10,000 từ khi đưa vào prompt của AI chat làm vượt ngưỡng ký tự `MAX_CONTEXT_CHAR_LIMIT` (12,000 ký tự) hoặc gây tốn phí token lớn.  
**Why it happens:** Nhồi toàn bộ `doc.body` vào prompt grounding.  
**How to avoid:** D-11 Relevance Snippet Extraction: Trích xuất tiêu đề, nhãn, và chỉ lấy section heading chứa từ khóa khớp cao nhất kèm 2-3 dòng trước/sau (tối đa 1,500 ký tự mỗi doc).

### Pitfall 4: Broken Backlinks on Document Hard Deletion
**What goes wrong:** Người dùng xóa một tài liệu mà Task hoặc Project khác đang tham chiếu bằng `[[doc:id|...]]`, dẫn đến liên kết gãy hoặc lỗi không tìm thấy tài liệu.  
**Why it happens:** Hard delete trực tiếp mà không kiểm tra liên kết ngược.  
**How to avoid:** Áp dụng Soft Delete (`deletedAt`). Trước khi xóa vĩnh viễn, kiểm tra tất cả Task, Project, Doc có chứa ID tài liệu và hiển thị hộp thoại cảnh báo liệt kê các thực thể bị ảnh hưởng.

## Code Examples

### 1. BM25 Lexical Scoring with Vietnamese Normalization
```typescript
// Source: Information Retrieval Standard (BM25) adapted for Dexie/TypeScript
export function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function tokenize(text: string): string[] {
  const norm = normalizeVietnamese(text);
  return norm.split(/[^a-z0-9_]+/i).filter((t) => t.length > 1);
}

export interface BM25Document {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export function rankBM25(query: string, docs: BM25Document[], k1 = 1.2, b = 0.75): { doc: BM25Document; score: number }[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || docs.length === 0) return [];

  // Calculate doc lengths with field weighting (Title x3, Tags x2, Body x1)
  const docTokensMap = new Map<string, string[]>();
  let totalLength = 0;

  for (const doc of docs) {
    const titleTokens = tokenize(doc.title);
    const tagTokens = doc.tags.flatMap(tokenize);
    const bodyTokens = tokenize(doc.body);
    // Apply field weighting replication
    const weightedTokens = [
      ...titleTokens, ...titleTokens, ...titleTokens,
      ...tagTokens, ...tagTokens,
      ...bodyTokens,
    ];
    docTokensMap.set(doc.id, weightedTokens);
    totalLength += weightedTokens.length;
  }

  const avgdl = totalLength / docs.length;
  const N = docs.length;

  return docs
    .map((doc) => {
      const tokens = docTokensMap.get(doc.id) || [];
      const docLen = tokens.length;
      let score = 0;

      for (const qTerm of queryTokens) {
        // Document frequency
        const df = docs.filter((d) => (docTokensMap.get(d.id) || []).includes(qTerm)).length;
        if (df === 0) continue;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        // Term frequency in current doc
        const tf = tokens.filter((t) => t === qTerm).length;
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * docLen) / avgdl);
        score += idf * (numerator / denominator);
      }

      return { doc, score };
    })
    .filter((res) => res.score > 0)
    .sort((a, b) => b.score - a.score);
}
```

### 2. Wiki-Link Safe Rendering & Chip Generation
```typescript
// Source: Custom plugin integrated into src/utils/markdown.ts
export function renderWikiLinks(html: string): string {
  // Pattern: [[type:id|Title]] or [[doc:id]] or [[task:id]]
  const wikiLinkRegex = /\[\[(doc|task|project):([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\]/g;

  return html.replace(wikiLinkRegex, (_match, type, id, label) => {
    const displayLabel = label?.trim() || id;
    let icon = '📄';
    if (type === 'task') icon = '✅';
    if (type === 'project') icon = '📁';

    return `<span class="wiki-link-chip" data-entity-type="${type}" data-entity-id="${id}" role="button" tabindex="0">${icon} ${displayLabel}</span>`;
  });
}
```

### 3. Dexie SCHEMA_V9 Definition
```typescript
// Source: src/db/schema.ts
export const SCHEMA_V9 = {
  ...SCHEMA_V8,
  notes: 'id, type, parentId, entityType, entityId, isPinned, deletedAt, *tags, createdAt, updatedAt',
} as const;
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & Dev Server | ✓ | v24.16.0 | — |
| npm | Package management | ✓ | 11.13.0 | — |
| IndexedDB | Storage Layer | ✓ | Browser Native | — |
| Web Crypto API | Encryption & UUID | ✓ | Browser Native | — |
| Tauri CLI / Runtimes | Desktop Features | ✓ (bundled in repo) | v2.2.0 | Standard Web PWA downloads / dialogs |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/utils/bm25.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-14.1 | Schema V9 upgrade & note repo operations | unit | `npx vitest run src/db/repositories/noteRepo.test.ts` | ❌ Wave 0 |
| REQ-14.2 | BM25 ranking & Vietnamese normalization | unit | `npx vitest run src/utils/bm25.test.ts` | ❌ Wave 0 |
| REQ-14.3 | Wiki-link parsing & markdown chip rendering | unit | `npx vitest run src/utils/markdown.test.ts` | ✅ (needs extension) |
| REQ-14.4 | Smart Ingestion (entity scanning & 1-click banner) | unit | `npx vitest run src/utils/smartIngestion.test.ts` | ❌ Wave 0 |
| REQ-14.5 | AI Tool `search_knowledge_base` execution | integration | `npx vitest run src/services/ai/aiTools.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed_file>.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/utils/bm25.test.ts` — Tests BM25 ranking, weights (Title x3, Tags x2, Body x1), and Vietnamese diacritic tolerance.
- [ ] `src/utils/smartIngestion.test.ts` — Tests title extraction from `# H1`, hashtag parsing, and Jira/task regex matching.
- [ ] `src/db/repositories/noteRepo.test.ts` — Tests folder hierarchy (`parentId`), tag querying, and soft deletion (`deletedAt`).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod schema validation on Note creation, tag names, folder paths, and Wiki-link attributes. |
| V5 XSS Prevention | yes | Strict HTML escaping in `renderSafeMarkdown` prior to rendering Wiki-links or ToC. Markdown code blocks and attributes are sanitized. |
| V6 Cryptography | yes | Web Crypto AES-GCM (256-bit) with random 96-bit IV and PBKDF2 for backup file sync. Secrets remain strictly client-side. |

### Known Threat Patterns for Phase 14

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via Malicious Markdown / Wiki-links | Tampering | Sanitize all URI targets; reject `javascript:`, `vbscript:`, and `data:` schemes in custom wiki-link parser. |
| Prompt Injection via Pasted Notes | Tampering | Enclose ingested note content inside structured XML tags (`<item_context type="document">`) and treat as untrusted user data. |
| Path Traversal in Desktop Tauri Export | Elevation of Privilege | Sanitize export filenames and paths to ensure all files write strictly inside the user-selected export directory. |

## Sources

### Primary (HIGH confidence)
- Existing codebase (`src/types/models.ts`, `src/db/schema.ts`, `src/views/NotesView.tsx`, `src/utils/markdown.ts`, `src/services/ai/aiTools.ts`)
- CLAUDE.md architectural standards and constraints
- Project UI Spec (`.planning/phases/14-knowledge-base-integration-docs-linking-ai-retrieval/14-UI-SPEC.md`)

### Secondary (MEDIUM confidence)
- BM25 Okapi Algorithm specification and information retrieval field weighting formulations
- Vietnamese Unicode Normalization Form C/D standards

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified zero new dependencies needed.
- Architecture: HIGH - Seamless extension of Dexie `notes` and Ant Design layout.
- Pitfalls: HIGH - Addressed Vietnamese diacritics, Popout backwards compatibility, and AI character limits.

**Research date:** 2026-10-04  
**Valid until:** 2026-11-04  
