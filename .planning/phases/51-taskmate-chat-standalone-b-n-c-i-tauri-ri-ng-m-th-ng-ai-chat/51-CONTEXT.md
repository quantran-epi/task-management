# Phase 51: TaskMate Chat standalone - Context

**Gathered:** 2026-11-25
**Status:** Ready for planning
**Source:** Explore session + sketches 007/008 (owner selected winners). Discuss skipped by owner: "khỏi discuss, cứ tốt nhất mà làm".

<domain>
## Phase Boundary

Deliver a **separately installable Tauri application** from the same repo that opens directly into the full AI chat panel. No task-management UI, no workbench, no task/project context in prompts. All AI capabilities remain: NineRouter provider, knowledge server, MCP, Graphiti, Oracle SQLcl, SSH File System, AI tool catalog, chat tabs/threads/history, streaming. Full AI settings must be reachable inside the chat app via a gear button opening a settings drawer with 7 side-nav groups. App must run independently: first-run key/endpoint/model entry works without installing TaskMate.

Out of scope: PWA/GitHub Pages, task CRUD from chat, task/project/doc context grounding, changing existing TaskMate behavior, new AI provider beyond existing NineRouter stack.

</domain>

<decisions>
## Implementation Decisions

### Product & packaging
- **D-01:** Separate Tauri bundle, not a mode toggle inside TaskMate. New `productName` "TaskMate Chat", new identifier `com.personal.taskmate.chat`. Must coexist with TaskMate on one machine.
- **D-02:** Reuse the existing build output (`dist`) and Vite entry; no second HTML bundle unless required to avoid hash-route coupling. Prefer reusing `#ai-popout` route already present in `AppIntelliJ.tsx`.
- **D-03:** New Tauri config `src-tauri/tauri.conf.chat.json` with dedicated main window (large desktop size, e.g. 1280×800), build script `npm run tauri:build:chat` passing `--config`. Icon separate from TaskMate if available; do not fabricate a brand-new image asset — reuse existing icon source if no dedicated one exists.
- **D-04:** Main window starts directly in chat-only mode on launch. On reload/deep link it must still be chat-only — no flash of workbench, no route to task views.

### Chat surface (sketch 007 winner A)
- **D-05:** UI is chat full-bleed. A single gear button in the titlebar opens AI settings drawer. No persistent left rail, no top menu bar, no workbench, no tool buttons on the main surface.
- **D-06:** The drawer overlays/slides from the right; chat stays mounted and keeps its state while settings is open.
- **D-07:** Strip popout-only affordances that assume a parent TaskMate window: close/pin buttons that "return to main app" and draft injection via parent postMessage/Tauri events. Keep tab bar, scope display (global), composer, message history.
- **D-08:** Force global scope with no TaskMate context. Do not call `buildGlobalContextPrompt(db)` or any task/CR/system/document grounding in this build. Knowledge/MCP/Oracle/SSH grounding stays fully functional.

### Full AI settings (sketch 008 winner C)
- **D-09:** Settings drawer uses side nav with exactly 7 groups: **Provider, Knowledge Server, MCP, Graphiti, Oracle SQLcl, SSH File System, Tool Catalog**. Each group expands its own accordion/form; switching nav shows that group's content.
- **D-10:** Provider group covers all NineRouter fields actually present in `NineRouterConfigCard`: API endpoint, API key (keyring-backed), default model, context window, global conventions. First-run key entry must work in this app without TaskMate installed.
- **D-11:** Other groups reuse the real setting cards/config functions (`KnowledgeServerConfigCard`, `McpConfigCard`, `GraphitiSqlConfigCard`, `OracleAiToolConfigCard`/`OracleSqlclSettingsModal`, `SshFsAiToolConfigCard`, `AiToolCatalogCard`) rather than reimplementing storage.
- **D-12:** Settings writes go to the same `settings` Dexie store and OS keyring service/keys as TaskMate, so a user who has both apps shares config intentionally. Do not create a second schema/keyring namespace.

### Safety & compatibility
- **D-13:** Do not modify TaskMate's normal app behavior, default route, or chat popout behavior. The new app is additive.
- **D-14:** All existing Tauri capabilities needed by chat tools (window, webview, notifications, shell/plugin as already configured) must be present in the chat bundle; capabilities are currently window-wide (`windows: ["*"]`).
- **D-15:** No new npm dependencies. Reuse React 19, Ant Design 6, Dexie, existing AI services and Tauri commands.

### Claude's Discretion
- Exact implementation route: dedicated Vite entry vs reusing `#ai-popout` — pick whichever is smaller and leaves TaskMate untouched.
- Exact window size/title/icon details not specified above.
- Whether the settings drawer is a new component or a refactored extraction of existing cards — choose minimal shared code without duplicating storage logic.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI decisions (owner-selected winners)
- `.planning/sketches/007-chat-only-shell/index.html` — winner A: chat full-bleed + gear drawer
- `.planning/sketches/007-chat-only-shell/README.md` — why B/C were rejected
- `.planning/sketches/008-chat-ai-settings/index.html` — winner C: side nav 7 groups + accordion
- `.planning/sketches/008-chat-ai-settings/README.md` — group list and field names

### Chat implementation
- `src/components/ai/AIChatDrawer.tsx` — main chat panel, popout/window modes, scope handling
- `src/views/AIPopoutView.tsx` — existing chat-only view; base for standalone app
- `src/hooks/useHashRoute.ts` — existing `#ai-popout` route
- `src/AppIntelliJ.tsx` — route mapping and shell
- `src/context/AIChatContext.tsx` — chat open state and scope
- `src/utils/aiPopout.ts` — popout launcher; parent-window assumptions to strip

### Settings implementation
- `src/components/settings/NineRouterConfigCard.tsx` — provider fields (endpoint, key, model, context window, conventions)
- `src/components/settings/KnowledgeServerConfigCard.tsx` — knowledge server config
- `src/components/settings/McpConfigCard.tsx` — MCP servers
- `src/components/settings/GraphitiSqlConfigCard.tsx` — Graphiti URLs
- `src/components/settings/OracleAiToolConfigCard.tsx` + `src/components/ai/OracleSqlclSettingsModal.tsx` — Oracle SQLcl
- `src/components/settings/SshFsAiToolConfigCard.tsx` — SSH FS tool config
- `src/components/settings/AiToolCatalogCard.tsx` — tool catalog
- `src/views/SettingsView.tsx` — current settings assembly (source of card composition)

### Persistence / AI services
- `src/db/index.ts`, `src/db/schema.ts`, `src/db/repositories/chatRepo.ts`, `src/db/repositories/chatTabRepo.ts` — chat/settings persistence
- `src/services/keyringService.ts`, `src/services/ai/nineRouterTokenService.ts` — credentials
- `src/services/knowledge/knowledgeConfig.tsx`, `src/services/ai/mcpClient.ts`, `graphitiMcpClient.ts`, `oracleSqlclService.ts`, `sshFsToolService.ts`, `claudeCliService.ts` — AI capabilities to keep

### Tauri build
- `src-tauri/tauri.conf.json` — base config to duplicate
- `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIPopoutView` + `AIChatDrawer` already render a full-window chat-only surface — no new chat component needed.
- All 7 AI setting cards exist and own their own Dexie writes; wrap rather than reimplement.
- Existing `#ai-popout` hash route can launch the standalone window with zero router changes.
- Tauri capabilities are window-wide, so the chat bundle inherits required permissions.

### Established Patterns
- Hash routing, Ant Design 6, `useLiveQuery` over Dexie, services invoked through Tauri `invoke`.
- Keyring service `task-planner`, key `ninerouter_api_key`; browser fallback in `settings`.

### Integration Points
- `AppIntelliJ.tsx` route dispatch for chat-only mode.
- `src-tauri/tauri.conf.chat.json` + npm script + Cargo bin/config selection for second bundle.
- Settings gear inside the chat shell, mounted only for standalone chat build.

</code_context>

<specifics>
## Specific Ideas

- Owner: "chat thuần, full tính năng chỉ trừ ngữ cảnh taskmate; user này chỉ cần knowledge server, mcp, oracle, ssh, etc."
- Owner: "nhớ là phải đủ các setting AI nhé" — every AI setting group must be present.
- Owner selected sketch winners 007 A + 008 C; then "khỏi discuss, cứ tốt nhất mà làm".
- Owner goal: finish fully, fix all critical/warning, run recommended checks, then push.

</specifics>

<deferred>
## Deferred Ideas

- Task-creating AI tools in the chat-only build — out of scope (task CRUD excluded).
- PWA/GitHub Pages variant — explicitly out of scope for current work.
- Any second AI provider — not requested.

</deferred>

---

*Phase: 51-TaskMate Chat standalone*
*Context gathered: 2026-11-25*
