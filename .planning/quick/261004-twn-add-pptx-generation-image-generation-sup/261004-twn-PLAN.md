---
phase: quick
plan: 261004-twn
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/utils/pptxExport.ts
  - src/utils/fileExport.ts
  - src/utils/__tests__/pptxExport.test.ts
  - src/services/ai/types.ts
  - src/services/ai/nineRouterTokenService.ts
  - src/services/ai/imageGenerationClient.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/__tests__/imageGenerationTool.test.ts
  - src/components/settings/NineRouterConfigCard.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/notes/DocEditorPane.tsx
autonomous: true
requirements:
  - PPTX-GENERATION
  - IMAGE-GENERATION
  - AI-DRAWER-HEADER-UI
must_haves:
  truths:
    - "AI assistant and user can generate and download PowerPoint (.pptx) presentations client-side using pptxgenjs"
    - "ChatMessageBubble and DocEditorPane provide intuitive entry points to export content as PPTX"
    - "AI assistant can call generate_image tool to produce images via OpenAI-compatible endpoints with configurable settings"
    - "AI drawer header features a distinctive accent icon, subtle gradient background tint, and refined badge styling"
    - "Only focused tests for new features are run, leaving unrelated test suites untouched"
  artifacts:
    - path: "src/utils/pptxExport.ts"
      provides: "Client-side PowerPoint (.pptx) generation utility using pptxgenjs"
      exports: ["generatePptxBlob", "generatePptxFromMarkdown", "exportPresentationAsFile"]
    - path: "src/services/ai/imageGenerationClient.ts"
      provides: "OpenAI-compatible image generation REST client"
      exports: ["generateImage", "testImageGenerationConnection"]
    - path: "src/services/ai/aiTools.ts"
      provides: "generate_pptx and generate_image AI tool definitions and execution handlers"
      contains: "generate_pptx"
    - path: "src/components/ai/ChatHeader.tsx"
      provides: "Enhanced AI drawer header with accent avatar, gradient styling, and status badge"
      contains: "linear-gradient"
    - path: "src/components/settings/NineRouterConfigCard.tsx"
      provides: "Image generation endpoint, model, and API key configuration"
  key_links:
    - from: "src/services/ai/aiTools.ts"
      to: "src/utils/pptxExport.ts"
      via: "PPTX presentation generation upon AI tool call"
    - from: "src/services/ai/aiTools.ts"
      to: "src/services/ai/imageGenerationClient.ts"
      via: "Image generation tool execution upon AI tool call"
    - from: "src/components/ai/ChatMessageBubble.tsx"
      to: "src/utils/fileExport.ts"
      via: "PowerPoint .pptx export action in dropdown menu"
    - from: "src/components/notes/DocEditorPane.tsx"
      to: "src/utils/pptxExport.ts"
      via: "Export document as PPTX action in editor toolbar"
---

<objective>
Deliver PPTX presentation generation via `pptxgenjs`, OpenAI-compatible image generation support with configurable settings and AI tool invocation, and an enhanced AI drawer header UI with distinctive accent icon, subtle gradient background, and refined badge styling. Run only focused test suites.

Purpose: Empower users and the AI assistant to produce presentation slides (.pptx) and images directly in the browser, while giving the AI assistant drawer a distinct, polished visual identity.
Output: Working PPTX exporter, image generation client and tool, configuration UI, enhanced AI header, and focused unit tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/utils/fileExport.ts
@src/services/ai/aiTools.ts
@src/services/ai/nineRouterTokenService.ts
@src/components/ai/ChatHeader.tsx
@src/components/ai/ChatMessageBubble.tsx
@src/components/notes/DocEditorPane.tsx
@src/components/settings/NineRouterConfigCard.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: PPTX Presentation Generation and UI Export Entry Points</name>
  <files>package.json, src/utils/pptxExport.ts, src/utils/fileExport.ts, src/utils/__tests__/pptxExport.test.ts, src/services/ai/aiTools.ts, src/components/ai/ChatMessageBubble.tsx, src/components/notes/DocEditorPane.tsx</files>
  <action>
1. Install `pptxgenjs` dependency via npm: `npm install pptxgenjs`.
2. Create `src/utils/pptxExport.ts`:
   - Implement slide generation supporting both structured slide input ({ title, subtitle, bullets, notes, layout }) and markdown parsing (converting `#`, `##`, `---`, bullet points, and tables into slides).
   - Apply clean, modern styling (PlannerMate indigo theme `#4f46e5`, dark slate text `#1e293b`, 16:9 widescreen layout, title slide, content slides with clear typography, and subtle footer).
   - Export `generatePptxBlob`, `generatePptxFromMarkdown`, and `exportPresentationAsFile`.
3. Update `src/utils/fileExport.ts`:
   - Add `'pptx'` to `ExportFormat` union type (`'md' | 'txt' | 'docx' | 'xlsx' | 'csv' | 'pptx'`).
   - Update `inferFormatFromFilename` to recognize `.pptx`.
   - Wire `'pptx'` in `exportContentAsFile` to invoke `exportPresentationAsFile`.
4. Update `src/services/ai/aiTools.ts`:
   - Add `'pptx'` to format enum in `generate_file` tool definition.
   - Register a dedicated `generate_pptx` tool in `AI_DATABASE_TOOLS` accepting `filename`, `presentationTitle`, `slides` array (title, bullets, speakerNotes), or raw `markdownContent`.
   - In `executeAiTool`, handle `generate_pptx` by calling `exportPresentationAsFile` and returning JSON with status, filename, slide count, and sizeBytes.
5. Add UI entry points:
   - In `src/components/ai/ChatMessageBubble.tsx`: add PowerPoint (.pptx) option with icon (`FilePptOutlined` or presentation icon) to the export dropdown menu.
   - In `src/components/notes/DocEditorPane.tsx`: add an export dropdown or PPTX export button in the editor toolbar to allow direct export of the active note/document as PowerPoint slides.
6. Create focused unit tests in `src/utils/__tests__/pptxExport.test.ts` verifying markdown-to-slides parsing, slide layout generation, and blob output creation.
  </action>
  <verify>
    <automated>npx vitest run src/utils/__tests__/pptxExport.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts</automated>
  </verify>
  <done>pptxgenjs installed, pptxExport utility parses markdown/slides to PPTX blob, generate_pptx AI tool registered and functional, export menus in ChatMessageBubble and DocEditorPane include PPTX, and focused tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Image Generation Client, AI Tool, and Settings Support</name>
  <files>src/services/ai/types.ts, src/services/ai/nineRouterTokenService.ts, src/services/ai/imageGenerationClient.ts, src/services/ai/aiTools.ts, src/services/ai/__tests__/imageGenerationTool.test.ts, src/components/settings/NineRouterConfigCard.tsx</files>
  <action>
1. Update `src/services/ai/types.ts`:
   - Add image generation options and result types: `ImageGenerationOptions`, `ImageGenerationResult`, `ImageConfig` (endpoint, model, apiKey).
2. Update `src/services/ai/nineRouterTokenService.ts`:
   - Add settings persistence functions for image generation config: `getImageConfig`, `setImageConfig`, `getImageApiKey`, `setImageApiKey` (storing `image_endpoint`, `image_model`, `image_api_key` in Dexie settings / keyring with sensible defaults fallback to NineRouter endpoint and `dall-e-3` / `flux`).
3. Create `src/services/ai/imageGenerationClient.ts`:
   - Implement `generateImage(options)` calling standard OpenAI-compatible `/v1/images/generations` via POST with payload `{ prompt, n: 1, size, model, response_format: 'b64_json' }`.
   - Support both base64 JSON (`b64_json`) and URL response formats; if base64 is returned, convert to data URL or Blob for immediate client rendering and persistence.
   - Include timeouts, abort signal handling, API key redaction in error messages, and connection test helper `testImageGenerationConnection`.
4. Update `src/services/ai/aiTools.ts`:
   - Register `generate_image` in `AI_DATABASE_TOOLS` with parameters: `prompt` (required), `size` (optional: '1024x1024', '512x512', etc.), `style` (optional), and `saveToDocId` (optional target document to attach image).
   - In `executeAiTool`, handle `generate_image`:
     - Load active image configuration.
     - Call `generateImage`.
     - If `saveToDocId` provided, persist image as a `noteAttachment` in Dexie and link it.
     - Return markdown image embed `![prompt](url)` or data URL with success confirmation so AI can render the image directly in the chat bubble.
5. Update `src/components/settings/NineRouterConfigCard.tsx`:
   - Add an "Image Generation (DALL-E / Flux / OpenAI-compatible)" configuration section:
     - Endpoint input (with placeholder defaulting to NineRouter or OpenAI endpoint).
     - Model selection / input (e.g. `dall-e-3`, `dall-e-2`, `flux`, `stable-diffusion`).
     - Optional custom API key with secure storage pattern matching existing NineRouter key management.
     - "Kiểm tra kết nối tạo ảnh" (Test connection) button with feedback alert.
6. Create focused unit tests in `src/services/ai/__tests__/imageGenerationTool.test.ts` verifying tool schema, client call mocking, error handling, and output markdown generation.
  </action>
  <verify>
    <automated>npx vitest run src/services/ai/__tests__/imageGenerationTool.test.ts</automated>
  </verify>
  <done>Image generation client implements /v1/images/generations with base64/URL support, generate_image tool registered in AI tools, config persisted and editable in settings UI, and focused tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: AI Drawer Header UI Enhancement and Focused System Verification</name>
  <files>src/components/ai/ChatHeader.tsx, src/components/ai/AIChatDrawer.tsx</files>
  <action>
1. Enhance `src/components/ai/ChatHeader.tsx`:
   - Distinctive AI icon avatar: replace plain inline icon with a styled rounded avatar badge featuring a subtle gradient background (e.g. `linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)`), soft shadow (`0 2px 8px rgba(79, 70, 229, 0.25)`), white robot/sparkle icon, and an active pulse/glow indicator dot.
   - Header container styling: apply a distinct subtle gradient background tint (e.g. `linear-gradient(to right, rgba(79, 70, 229, 0.06), rgba(124, 58, 237, 0.03))` in light mode or token-derived tinted background), distinguished from standard neutral panels.
   - Subtle badge: add a sleek pill tag/badge next to the title (e.g. "AI ASSISTANT" or model tag badge) with crisp typography and subtle border.
   - Refined divider: subtle bottom border with brand accent tint to provide clear visual separation between the header and chat body.
2. Ensure clean responsiveness in `AIChatDrawer.tsx` across desktop drawer, mobile full-width, and popout window views.
3. Run only focused test suites:
   - `npx vitest run src/utils/__tests__/pptxExport.test.ts src/services/ai/__tests__/imageGenerationTool.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts`
   - Run `npm run build` to verify full TypeScript compilation and Vite build without errors.
  </action>
  <verify>
    <automated>npm run build && npx vitest run src/utils/__tests__/pptxExport.test.ts src/services/ai/__tests__/imageGenerationTool.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts</automated>
  </verify>
  <done>ChatHeader has distinctive accent icon, subtle gradient header background, and refined badge; full build passes with zero errors; all focused tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client -> Image Generation API | External HTTP REST call sending user prompts and receiving image payloads |
| AI Tool -> Browser Download | File export triggering browser blob download from user/AI generated content |
| Settings -> Keyring/IndexedDB | Sensitive API keys stored locally in Dexie or Tauri keyring |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | imageGenerationClient.ts | mitigate | Redact API keys from all error logs and user-facing notifications |
| T-quick-02 | Tampering / File Injection | pptxExport.ts | mitigate | Sanitize filenames, reject directory traversal chars, strip illegal XML chars |
| T-quick-03 | Denial of Service | imageGenerationClient.ts | mitigate | Enforce fetch timeout with AbortSignal and cap payload size |
| T-quick-04 | Elevation of Privilege | nineRouterTokenService.ts | mitigate | Store credentials in local secure keyring (Tauri) or origin-scoped Dexie without remote transmission |
</threat_model>

<verification>
Automated verification commands:
- Unit tests: `npx vitest run src/utils/__tests__/pptxExport.test.ts src/services/ai/__tests__/imageGenerationTool.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts`
- Build check: `npm run build`
</verification>

<success_criteria>
1. `pptxgenjs` is installed and PPTX export works seamlessly from markdown and structured slide objects.
2. AI assistant has access to `generate_pptx` and `generate_image` tools.
3. ChatMessageBubble and DocEditorPane provide intuitive PPTX export buttons.
4. Settings UI allows configuring image generation endpoint, model, and API key with test connection capability.
5. AI Drawer Header features a distinctive icon avatar with gradient, subtle background tint, and refined badge.
6. Only focused tests are run and the full build passes.
</success_criteria>

<output>
Create `.planning/quick/261004-twn-add-pptx-generation-image-generation-sup/261004-twn-SUMMARY.md` when done
</output>
