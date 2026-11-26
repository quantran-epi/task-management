---
phase: quick
plan: 261126-skl
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/documentImageResolver.ts
  - src/utils/__tests__/documentImageResolver.test.ts
  - src/utils/dynamicFileSandbox.ts
  - src/utils/__tests__/dynamicFileSandbox.test.ts
  - src/utils/pptxExport.ts
  - src/utils/__tests__/pptxExport.test.ts
  - src/utils/fileExport.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/__tests__/fileGenerationTool.test.ts
  - src/components/ai/AIChatDrawer.tsx
  - e2e/aiChatSettings.spec.ts
autonomous: true
requirements:
  - AI-DOCX-PPTX-EMBEDDED-IMAGES
user_setup: []
must_haves:
  truths:
    - "AI sinh DOCX/PPTX có ảnh thật trong word/media/ và ppt/media/, không phải alt text hay cú pháp markdown"
    - "Ảnh từ generate_image (data: URL), http(s) URL, attachment:/a: token + noteAttachments, và sơ đồ ```mermaid đều được nhúng"
    - "Mermaid được rasterize thành PNG bằng dependency có sẵn; không thêm dependency mới"
    - "Model tự gọi generate_image/generate_file/generate_pptx trong cùng một turn theo prompt tự nhiên"
    - "file:/javascript: và mọi scheme khác bị từ chối; fetch http(s) có timeout, kiểm tra content-type và giới hạn kích thước"
    - "markdown.ts giữ nguyên policy chặn data: trong HTML chat prose"
    - "Scoped Vitest, tsc --noEmit và Chrome UAT xanh; không chạy npm test full"
  artifacts:
    - path: src/utils/documentImageResolver.ts
      provides: "Parse + resolve + validate ảnh cho export DOCX/PPTX; rasterize Mermaid"
      exports: ["prepareDocumentImages", "resolveDocumentImage", "renderMermaidToPng", "ResolvedDocumentImage", "DOCUMENT_IMAGE_LIMITS"]
    - path: src/utils/dynamicFileSandbox.ts
      provides: "generateDocxBlobWithDocx nhúng ImageRun thay vì chỉ TextRun"
      contains: "docx.ImageRun"
    - path: src/utils/pptxExport.ts
      provides: "SlideData.images + parse markdown image + addImage trong buildPptxPresentation"
      contains: "images?: ResolvedDocumentImage[]"
    - path: src/utils/fileExport.ts
      provides: "exportContentAsFile truyền images map xuống DOCX generator"
      contains: "images?"
    - path: src/services/ai/aiTools.ts
      provides: "generate_file/generate_pptx gọi prepareDocumentImages trước khi export; cập nhật tool description"
      contains: "prepareDocumentImages"
    - path: src/components/ai/AIChatDrawer.tsx
      provides: "Hai system prompt hướng dẫn auto-orchestrate generate_image + generate_file/generate_pptx"
      contains: "generate_pptx"
    - path: e2e/aiChatSettings.spec.ts
      provides: "Chrome UAT: prompt tự nhiên, tool_calls stub, download DOCX/PPTX, kiểm tra word/media/ và ppt/media/"
      contains: "embedded images"
  key_links:
    - from: src/services/ai/aiTools.ts (generate_file / generate_pptx handlers)
      to: src/utils/documentImageResolver.ts (prepareDocumentImages)
      via: "content/markdownContent đi qua resolver với db trước khi export; markdown trả về đã thay mermaid block bằng data: URL"
    - from: src/utils/fileExport.ts (exportContentAsFile)
      to: src/utils/dynamicFileSandbox.ts (generateDocxBlobWithDocx)
      via: "tham số images map truyền thẳng; ImageRun nhận data Uint8Array + transformation"
    - from: src/utils/pptxExport.ts (parseMarkdownToSlides / buildPptxPresentation)
      to: pptxgenjs slide.addImage
      via: "SlideData.images → data URI image/png;base64,...; không đổi layout title/section"
---

<objective>
Cho phép AI chat sinh DOCX/PPTX có ảnh thật từ mọi nguồn ảnh có sẵn trong app: `generate_image` (`data:` URL), `http(s)` URL, `attachment:`/`a:` token trỏ `noteAttachments`, và sơ đồ Mermaid. AI tự điều phối tool trong cùng một user turn.

Purpose: hiện `generateDocxBlobWithDocx` chỉ tạo `TextRun`, `generatePptxBlob` chỉ text/table; ảnh do `generate_image` trả về bị rơi ra khỏi tài liệu. Giá trị cốt lõi là tài liệu sinh ra phải "chuẩn chỉnh, có ảnh", không phải markdown thô.

Output: một module resolver dùng chung, DOCX + PPTX generator nhúng ảnh, wiring tool/prompt, scoped tests và Chrome UAT có kiểm tra nhị phân. Không thêm dependency (`docx@9.9.0`, `pptxgenjs@4.0.1`, `mermaid@11.17.2`, `jszip@3.10.2` đã có); không đổi default endpoint/model của `generate_image`; không đụng `src/utils/markdown.ts`.

Ánh xạ nguồn (mọi item đều có task):

| Nguồn | Mục | Task |
|-------|-----|------|
| GOAL | DOCX/PPTX có ảnh từ mọi nguồn | 1, 2, 3 |
| LOCK diagram | Mermaid → PNG bằng `mermaid` có sẵn | 1, 2, 3 |
| LOCK sources | data:/http(s)/attachment:/a:/knowledge; `markdown.ts` không đổi | 1, 3 |
| LOCK flow | AI tự gọi generate_image → generate_file/generate_pptx trong 1 turn; description + prompt | 3 |
| LOCK scope | DOCX + PPTX only; không PDF; không dependency mới | 2, 3 |
| LOCK constraints | branch pre-v1.6-baseline, worktree=false, scoped vitest, tsc, Chrome UAT, bảo mật scheme/size/fetch | 1, 2, 3 |

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@./CLAUDE.md

Đã rà soát sẵn — KHÔNG dò lại rộng:

- `src/utils/dynamicFileSandbox.ts:245-440` — `generateDocxBlobWithDocx(content, _title?)`: vòng lặp line-by-line, đã xử lý code fence/blockquote/table/heading/bullet/inline bold-italic bằng `docx.TextRun`; trả `docx.Packer.toBlob(doc)`. Chèn nhánh ảnh TRƯỚC nhánh paragraph thường, sau table.
- `src/utils/pptxExport.ts` — `SlideData` `:5-12`; `parseMarkdownToSlides` `:44-202`; `buildPptxPresentation` `:207-420` (title/section/content, content có table `:339`, bullets `:376`); `generatePptxBlob` `:425`; `generatePptxFromMarkdown` `:437`; `exportPresentationAsFile` `:458`.
- `src/utils/fileExport.ts:760-806` — `exportContentAsFile(content, filename, format?, autoDownload?)` nhánh `docx` gọi `generateDocxBlobWithDocx(content)` tại `:773`; `case 'pptx'` nằm ở `aiTools.ts` chứ không ở switch này.
- `src/services/ai/aiTools.ts` — tool definitions `generate_file` `:1836-1870`, `generate_pptx` `:1871-1917`, `generate_image` `:1918-1949`; handlers `generate_file` `:4912-4970`, `generate_pptx` `:4972-5022`, `generate_image` `:5024-5090` (`markdownEmbed` tại `:5079` là `![alt](data:...)`). `executeAiTool(name, args, db, ...)` có `db` ở mọi nhánh.
- `src/components/ai/AIChatDrawer.tsx:1704-1717` (`standalonePrompt`) và `:1718-1729` (`ordinaryPrompt`) — cả hai đã có dòng DIAGRAMS & FLOWCHARTS; câu artifact generation của standalone ở `:1709`.
- `src/services/ai/aiOrchestratorLoop.ts:586-603` — image file card hiện đọc `parsedRes.imageUrl`; KHÔNG cần sửa cho quick task này (file card đã có).
- `src/services/diagramSaveBridge.ts:17-46` — `extractMermaidBlocks(text)` regex ```mermaid, fallback bare diagram; import sẵn trong `aiTools.ts:50`.
- `src/components/ai/MermaidViewer.tsx:21-37` — lazy `import('mermaid')`, `m.initialize({ startOnLoad:false, securityLevel:'loose', suppressErrorRendering:true })`. Cho export dùng cấu hình riêng `securityLevel:'strict'`, KHÔNG dùng lại cấu hình loose.
- `src/utils/mermaidExport.ts:13-46` — `prepareSvgForExport(svgEl, isDark)` trả `{svgString,width,height}`; mẫu rasterize SVG→canvas→PNG tại `:86-168`. Tái dùng ý tưởng, không import hàm có Tauri picker.
- `src/db/repositories/noteRepo.ts:358-368` — `getNoteWithAttachments(id, db)`; `noteAttachments` có `{id, noteId, fileName, mimeType, sizeBytes, data: Blob}` (`src/types/models.ts:211-221`). Resolver dùng `db.noteAttachments.get(uuid)` trực tiếp.
- Tests hiện có: `src/utils/__tests__/dynamicFileSandbox.test.ts`, `src/utils/__tests__/pptxExport.test.ts`, `src/services/ai/__tests__/fileGenerationTool.test.ts`, `src/services/ai/__tests__/imageGenerationTool.test.ts`; Vitest env `jsdom` (`vite.config.ts:19-26`).
- `jszip@3.10.2` + `@types/jszip` đã có trong `package.json` — dùng để mở blob ZIP trong test/e2e, không cài gì mới.
- E2E: `playwright.config.ts` channel `chrome`, baseURL `http://127.0.0.1:5173/task-management/`; harness `e2e/aiChatStandalone.html` + `e2e/aiChatSettings.spec.ts` stub SSE `**/v1/chat/completions`, helper `watchErrors`/`expectNoErrors`, `settingValue`; KHÔNG dùng provider thật.

Quy ước: tiếng Việt khi giải thích; identifier/đường dẫn/lệnh giữ nguyên. Không chạy `npm test` full. Mọi file được đọc 1 lần rồi action ngay — không re-read loop.

</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Resolver ảnh dùng chung + bảo mật + Mermaid raster (LOCK sources, LOCK diagram, security)</name>
  <files>src/utils/documentImageResolver.ts, src/utils/__tests__/documentImageResolver.test.ts</files>
  <behavior>
    - `prepareDocumentImages(markdown, db)` trả `{ markdown, images: Map<string, ResolvedDocumentImage> }`: key là đúng chuỗi `src` trong markdown; mọi ảnh hợp lệ có entry; mermaid block được thay bằng `![Sơ đồ](data:image/png;base64,...)` và data URL đó cũng có entry.
    - Scheme cho phép: `data:image/(png|jpeg|gif|webp);base64,...`, `http:`, `https:`, `attachment:<uuid>`, `a:<uuid>`. `file:`, `javascript:`, `vbscript:`, `data:text/...`, scheme lạ → bỏ ảnh, giữ alt text; KHÔNG fetch, KHÔNG throw.
    - `attachment:`/`a:` (kể cả token trong body note knowledge) → `db.noteAttachments.get(uuid)`; blob → `Uint8Array`; mime lấy từ `attachment.mimeType` nằm trong whitelist, nếu không phải ảnh thì bỏ.
    - `data:` → validate regex chặt (chỉ base64, chỉ image mime), decode `atob`, vượt `MAX_IMAGE_BYTES` (10 MB) thì bỏ.
    - `http(s)` → `fetch` với `AbortSignal.timeout(10000)`, `credentials:'omit'`, `referrerPolicy:'no-referrer'`; chỉ giữ response có `content-type` bắt đầu `image/`; giới hạn `content-length` và bytes thực đọc; redirect tới scheme khác bị chặn bằng cách validate URL cuối (`response.url`) sau fetch; lỗi fetch → bỏ ảnh, không làm hỏng tài liệu.
    - `renderMermaidToPng(code)` → `import('mermaid')` lazy, `initialize({ startOnLoad:false, securityLevel:'strict', suppressErrorRendering:true, theme:'default' })`, `render(uniqueId, code)` lấy `svg`, serialize + rasterize qua canvas như `mermaidExport.ts:97-145`, trả PNG `Uint8Array` + width/height lấy từ viewBox. Không gọi `bindFunctions`, không inject SVG thô vào DOCX/PPTX.
    - Tổng limiter: tối đa `MAX_IMAGES_PER_DOCUMENT` (20) ảnh và `MAX_TOTAL_IMAGE_BYTES` (20 MB) mỗi tài liệu; vượt thì bỏ ảnh thừa, vẫn trả tài liệu.
  </behavior>
  <action>
    Viết test đỏ trước rồi production. Tạo `src/utils/documentImageResolver.ts` với type `ResolvedDocumentImage = { data: Uint8Array; extension: 'png' | 'jpeg' | 'gif' | 'webp'; alt?: string; width: number; height: number }` và const `DOCUMENT_IMAGE_LIMITS = { maxImageBytes: 10*1024*1024, maxTotalBytes: 20*1024*1024, maxImages: 20, fetchTimeoutMs: 10000 }`. Export `extractImageSources`, `resolveDocumentImage(src, alt, db)`, `renderMermaidToPng(code, deps?)`, `prepareDocumentImages(markdown, db)`. `deps` injection cho renderer (nhận `{ render: (id, code) => Promise<{svg:string}> }`) để test không cần canvas thật — mặc định dùng lazy `import('mermaid')`. Parse ảnh bằng regex `!\[([^\]]*)\]\(([^)\s]+)\)`, giữ nguyên các dòng không phải ảnh. Với mermaid: tái dùng `extractMermaidBlocks` từ `src/services/diagramSaveBridge.ts`, render từng block, thay block bằng data URL PNG trong markdown trả về. Với `data:` dùng whitelist regex, KHÔNG dùng `fetch(data:)`. Với http(s): kiểm tra `new URL(src).protocol` trước và `new URL(response.url).protocol` sau; dùng `response.arrayBuffer()` và kiểm tra byte length (content-length chỉ là hint). Với `attachment:`/`a:`: lấy uuid, `db?.noteAttachments?.get?.(uuid)`; thiếu db trả null. Mọi nhánh lỗi trả `null`/bỏ ảnh và `console.warn` ngắn gọn; KHÔNG throw ra ngoài `prepareDocumentImages`. Không import `docx`/`pptxgen` ở module này; không sửa `src/utils/markdown.ts` (policy chat prose giữ nguyên). Test dùng 1x1 PNG base64 cố định, fakeDb `{ noteAttachments: { get: async () => ({...}) } } as any`, spy `global.fetch`, injection renderer giả có viewBox `0 0 800 600`; assert scheme bị chặn, size cap, attachment lookup, mermaid thay thế, tổng limiter, và lỗi fetch không làm hỏng markdown.
  </action>
  <verify>
    <automated>npx vitest run src/utils/__tests__/documentImageResolver.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>
    Mọi scheme được phép resolve thành `ResolvedDocumentImage`; scheme nguy hiểm và ảnh hỏng đều bị bỏ an toàn; mermaid → PNG data URL; không throw, không dependency mới, `markdown.ts` byte-identical.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Nhúng ảnh vào DOCX và PPTX generator (LOCK diagram, LOCK scope)</name>
  <files>src/utils/dynamicFileSandbox.ts, src/utils/__tests__/dynamicFileSandbox.test.ts, src/utils/pptxExport.ts, src/utils/__tests__/pptxExport.test.ts, src/utils/fileExport.ts</files>
  <behavior>
    - `generateDocxBlobWithDocx(content, title?, images?: Map<string, ResolvedDocumentImage>)`: dòng `![alt](src)` đứng riêng → `docx.Paragraph` chứa `docx.ImageRun({ data, type: extension, transformation: { width, height } })` + caption italic bên dưới; src không có trong map → chỉ ghi alt text. Ảnh to hơn 600px width bị scale giữ tỉ lệ. Không đưa cú pháp `![](...)` vào TextRun.
    - Các nhánh cũ (code fence, blockquote, table, H1/H2/H3, bullet, inline bold/italic) giữ nguyên hành vi và output khi không có ảnh.
    - `SlideData` có thêm `images?: ResolvedDocumentImage[]`. `parseMarkdownToSlides` nhận dòng ảnh riêng, đính vào slide hiện tại (tạo slide nếu chưa có), không đưa vào `bullets`; ảnh sau `---` thuộc slide mới.
    - `buildPptxPresentation`: với content slide, `slide.addImage({ data: 'image/<ext>;base64,<base64>', x, y, w, h })` cho từng ảnh, xếp tối đa 2 ảnh/hàng trong khung `x:1.1, y:1.8, w:11.0, h:4.6`, scale giữ tỉ lệ, không chồng lên title/footer; title/section slide vẫn giữ nguyên (không tự thêm ảnh vào cover).
    - `exportContentAsFile(content, filename, format?, autoDownload?, images?)` truyền `images` vào `generateDocxBlobWithDocx`; chữ ký cũ (4 args) vẫn gọi được. `generatePptxBlob` / `generatePptxFromMarkdown` / `exportPresentationAsFile` không đổi chữ ký công khai — ảnh đi qua `SlideData.images` hoặc markdown đã resolve.
  </behavior>
  <action>
    Viết test đỏ trước: trong `dynamicFileSandbox.test.ts` thêm case gọi generator với map chứa 1 PNG 1x1, mở blob bằng `JSZip.loadAsync(await blob.arrayBuffer())`, assert có entry bắt đầu `word/media/` và `word/document.xml` chứa `<w:drawing`; case src lạ assert text alt xuất hiện và KHÔNG có `word/media/`. Trong `pptxExport.test.ts` thêm case parse markdown có `![x](data:image/png;base64,...)` giữa hai slide, assert `slides[1].images.length === 1`, generate blob, mở bằng JSZip, assert `ppt/media/` có entry; case bullets vẫn giữ nguyên count. Sau đó production: `dynamicFileSandbox.ts` import type từ `documentImageResolver.ts`, thêm param thứ 3, chèn nhánh ảnh trước nhánh paragraph thường (sau table), dùng helper nội bộ `fitWithin(width, height, maxW, maxH)` — KHÔNG thêm dependency. `pptxExport.ts` import type, mở rộng `SlideData`, thêm nhánh ảnh trong vòng lặp parse (trước bullet match), thêm vòng `addImage` trong content branch sau table và trước bullets (dời bullets xuống dưới ảnh bằng offset y khi có ảnh). Chuyển Uint8Array sang base64 bằng vòng lặp `String.fromCharCode(...chunk)` theo chunk 8192 rồi `btoa` — KHÔNG dùng FileReader (jsdom không có canvas/FileReader ổn định). `fileExport.ts` thêm param optional thứ 5 và truyền vào `generateDocxBlobWithDocx`; mọi caller cũ không truyền vẫn chạy. Giữ `autoDownload` semantics hiện tại.
  </action>
  <verify>
    <automated>npx vitest run src/utils/__tests__/dynamicFileSandbox.test.ts src/utils/__tests__/pptxExport.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>
    DOCX có `word/media/` thật, PPTX có `ppt/media/` thật khi có ảnh; ảnh hỏng chỉ thành alt text; layout text/table/bullet cũ không regress; tsc sạch.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire AI tool + prompt tự điều phối + Chrome UAT (LOCK flow, LOCK scope, security)</name>
  <files>src/services/ai/aiTools.ts, src/services/ai/__tests__/fileGenerationTool.test.ts, src/components/ai/AIChatDrawer.tsx, e2e/aiChatSettings.spec.ts</files>
  <behavior>
    - `generate_file` với `format` docx hoặc pptx và có `content`: gọi `prepareDocumentImages(String(args.content), db)` trước export; dùng `prepared.markdown` làm nội dung export và truyền `prepared.images` cho `exportContentAsFile`/`exportPresentationAsFile`. Các format md/txt/xlsx/csv giữ nguyên path cũ, không resolve ảnh.
    - `generate_pptx`: resolve `markdownContent` / `content` tương tự; nhánh `slides` array giữ nguyên (model có thể tự đưa `images` qua SlideData nhưng không bắt buộc).
    - Tool description: `generate_file` nói rõ có thể nhúng ảnh markdown (`data:`, http(s), `attachment:`/`a:`) và mermaid vào DOCX/PPTX; `generate_pptx` nói rõ markdown image và mermaid block được nhúng; `generate_image` nói rõ truyền `markdown` trả về vào `content` của `generate_file`/`markdownContent` của `generate_pptx` trong cùng turn. Không đổi params schema của `generate_image` (default endpoint/model giữ nguyên).
    - Cả `standalonePrompt` và `ordinaryPrompt`: thêm 1 instruction ngắn — khi user yêu cầu tài liệu có ảnh/sơ đồ, tự gọi `generate_image` (và/hoặc viết mermaid block) rồi `generate_file`/`generate_pptx` trong CÙNG turn, dùng cú pháp `![alt](src)` trong content; không hỏi lại user, không chỉ trả văn bản.
    - UAT Chrome: prompt tự nhiên tiếng Việt; provider stub trả tool_calls theo thứ tự `generate_image` → `generate_file` (docx) → `generate_pptx`; endpoint image stub trả cùng 1x1 PNG base64 với data URL nhúng trong content; tải 2 file, mở bằng JSZip trong Node, assert `word/media/` và `ppt/media/`; console/page error sạch.
  </behavior>
  <action>
    Thêm test đỏ trong `fileGenerationTool.test.ts`: spy `exportContentAsFile` assert arg thứ 5 là Map có entry khi content có data URL PNG; spy `exportPresentationAsFile` assert markdownContent đã resolve; assert tool description chứa cụm 'mermaid' và 'generate_image'; assert format xlsx KHÔNG gọi resolver (dùng spy qua `vi.spyOn` module resolver). Production: import `prepareDocumentImages` từ `src/utils/documentImageResolver.ts`, chèn resolution ngay trước các nhánh export trong case `generate_file` (chỉ khi format docx/pptx) và case `generate_pptx` (nhánh string). Cập nhật 3 description string trong `AI_DATABASE_TOOLS` (`aiTools.ts:1840`, `:1875-1876`, `:1922-1923`) — sửa text description, KHÔNG đổi enum/params/required của tool nào. Trong `AIChatDrawer.tsx` chèn instruction mới ngay sau dòng artifact/ DIAGRAMS hiện tại của CẢ HAI prompt, giữ nguyên phần còn lại (đặc biệt không đụng compaction hay standalone capability gating). E2E: thêm test trong `e2e/aiChatSettings.spec.ts` dùng `e2e/aiChatStandalone.html`, `page.route('**/v1/chat/completions')` SSE 3 bước, `page.route` endpoint ảnh trả `{"data":[{"b64_json":"<1x1 png>"}]}`, `Promise.all([page.waitForEvent('download'), click Send])` cho từng file; `download.path()` → `fs.readFile` → `JSZip.loadAsync` → assert entry regex. Dùng `watchErrors`/`expectNoErrors` có sẵn. Sau UAT review toàn diff quick task; sửa mọi critical/warning trong phạm vi; ghi kết quả vào SUMMARY khi execute.
  </action>
  <verify>
    <automated>npx vitest run src/services/ai/__tests__/fileGenerationTool.test.ts src/services/ai/__tests__/imageGenerationTool.test.ts --bail=1 && npx tsc --noEmit && npx playwright test e2e/aiChatSettings.spec.ts --grep "embedded images" --workers=1</automated>
  </verify>
  <done>
    Model thấy tool description và prompt hướng dẫn tự sinh ảnh rồi tài liệu trong 1 turn; DOCX/PPTX tải về có media thật trong Chrome; generate_image default endpoint/model không đổi; diff review sạch.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Model tool args / markdown content → document resolver | Model-generated image URLs, Mermaid code và attachment token là untrusted |
| http(s) URL → fetch | URL do model chọn có thể trỏ tới host nội bộ hoặc trả payload không phải ảnh |
| Attachment token → Dexie `noteAttachments` | Token do model chọn cần tra cứu có kiểm soát, không lộ dữ liệu settings/secret |
| Mermaid code → SVG → canvas | SVG từ code untrusted phải được render strict, không bind script |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-SKL-01 | Tampering | `resolveDocumentImage` scheme handling | mitigate | Whitelist `data:image/*;base64`, http(s), attachment:/a:; từ chối `file:`, `javascript:`, `vbscript:` và mọi scheme khác trước khi fetch; test scheme nằm ở Task 1 |
| T-SKL-02 | Information disclosure / SSRF-like fetch | http(s) branch | mitigate | `credentials:'omit'`, `referrerPolicy:'no-referrer'`, timeout 10s, kiểm tra `response.url` protocol sau redirect, content-type phải `image/*`; accept rủi ro host nội bộ vì app single-user offline-first và chỉ model-local chọn URL |
| T-SKL-03 | DoS | image decode / total document size | mitigate | `maxImageBytes` 10 MB, `maxTotalBytes` 20 MB, `maxImages` 20, fetch timeout; vượt giới hạn → bỏ ảnh, không throw, tài liệu vẫn sinh ra |
| T-SKL-04 | Injection | Mermaid render | mitigate | `mermaid.initialize({ securityLevel:'strict', suppressErrorRendering:true })` riêng cho export; KHÔNG gọi `bindFunctions`; chỉ rasterize SVG qua canvas, không nhúng SVG thô |
| T-SKL-05 | Information disclosure | attachment:/a: token | accept | Chỉ đọc blob ảnh từ `noteAttachments` của chính user (single-user local DB); không đọc settings/secret, không đưa filePath vào tài liệu |
| T-SKL-06 | Tampering | chat prose renderer | accept | `src/utils/markdown.ts` không đổi — `data:` vẫn bị chặn trong HTML chat; chỉ document exporter có policy riêng |
| T-SKL-SC | Tampering | npm/install step | mitigate | Không cài package mới; `docx`, `pptxgenjs`, `mermaid`, `jszip` đã có trong `package.json`; không có bước install trong plan này |

</threat_model>

<verification>
Chạy 3 lệnh `<automated>` theo thứ tự task. Không chạy `npm test` full (quy tắc dự án: > 1 giờ). Kiểm tra `git diff --stat` chỉ nằm trong files_modified; review diff toàn quick task, fix mọi critical/warning. Chrome UAT dùng system Chrome qua Playwright config có sẵn, không provider thật. Không đổi branch (đang ở `pre-v1.6-baseline`), không tạo worktree mới.
</verification>

<success_criteria>
- DOCX tải về có `word/media/`, PPTX có `ppt/media/` với ảnh hợp lệ từ data URL/attachment/Mermaid.
- Mermaid render bằng `mermaid` có sẵn, `securityLevel:'strict'`; không dependency mới, không PDF, không đổi generate_image endpoint/model.
- Scheme nguy hiểm bị chặn, fetch có timeout/content-type/size cap; `markdown.ts` byte-identical.
- Cả hai system prompt và 3 tool description hướng dẫn auto-orchestrate trong cùng turn.
- Scoped Vitest + `tsc --noEmit` + Playwright Chrome xanh; diff review không critical/warning.
</success_criteria>

<output>
Khi xong tạo `.planning/quick/261126-skl-ai-docx-and-pptx-with-embedded-images-ma/261126-skl-SUMMARY.md` với kết quả scoped tests, tsc, Chrome UAT (kèm kết quả kiểm tra `word/media/` và `ppt/media/`), và ghi nhận không đổi `markdown.ts` / default image endpoint-model.
</output>
