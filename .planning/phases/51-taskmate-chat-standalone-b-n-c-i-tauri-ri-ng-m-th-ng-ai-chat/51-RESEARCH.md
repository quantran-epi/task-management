# Phase 51: TaskMate Chat standalone - Research

**Researched:** 2026-11-25
**Domain:** Tauri v2 dual-bundle packaging + React/AntD chat-only shell + zero-context AI grounding boundary
**Confidence:** MEDIUM (codebase HIGH; Tauri config merge MEDIUM via official docs; Tauri hash-URL parsing LOW-MEDIUM via official source read)

## Summary

Phase 51 is mostly wiring, not new engineering. Everything the app needs already exists: a chat-only view (`AIPopoutView`), a full chat panel (`AIChatDrawer`), all seven AI setting cards, one Dexie settings store, one OS keyring service, one Rust command surface, and a single Vite `dist`. The task is to launch a second Tauri bundle that starts at the chat-only route, strip the parent-window assumptions from that route, expose a gear-driven settings drawer, and suppress TaskMate data grounding while leaving knowledge/MCP/Graphiti/Oracle/SSH tools intact.

**Primary recommendation:** Reuse `dist`, `AppIntelliJ`, and `#ai-popout`. Add `src-tauri/tauri.conf.chat.json` that sets `productName: "TaskMate Chat"`, `identifier: "com.personal.taskmate.chat"`, and a single main window whose `url` is `index.html#ai-popout`. Build with `tauri build -c src-tauri/tauri.conf.chat.json`. Add a `standaloneChat`/`isChatOnlyApp` prop chain through `AppIntelliJ -> AIPopoutView -> AIChatDrawer`; when true, force global scope, suppress `buildGlobalContextPrompt` and global conventions, hide pin/close/popout, and mount the 7-group settings drawer via the existing `onOpenSettings` callback.

Critical constraint discovered: Tauri config merge uses JSON Merge Patch where **arrays are replaced wholesale**. `app.windows` in the chat config must repeat every field the main window needs, not just `url`. Capabilities are label-based (`window: ["*"]` already matches all), shared from `src-tauri/capabilities/default.json` by both bundles with no change required.

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Separate Tauri bundle, not a mode toggle inside TaskMate. New `productName` "TaskMate Chat", new identifier `com.personal.taskmate.chat`. Must coexist with TaskMate on one machine.
- **D-02:** Reuse the existing build output (`dist`) and Vite entry; no second HTML bundle unless required to avoid hash-route coupling. Prefer reusing `#ai-popout` route already present in `AppIntelliJ.tsx`.
- **D-03:** New Tauri config `src-tauri/tauri.conf.chat.json` with dedicated main window (large desktop size, e.g. 1280×800), build script `npm run tauri:build:chat` passing `--config`. Icon separate from TaskMate if available; do not fabricate a brand-new image asset — reuse existing icon source if no dedicated one exists.
- **D-04:** Main window starts directly in chat-only mode on launch. On reload/deep link it must still be chat-only — no flash of workbench, no route to task views.
- **D-05:** UI is chat full-bleed. A single gear button in the titlebar opens AI settings drawer. No persistent left rail, no top menu bar, no workbench, no tool buttons on the main surface.
- **D-06:** The drawer overlays/slides from the right; chat stays mounted and keeps its state while settings is open.
- **D-07:** Strip popout-only affordances that assume a parent TaskMate window: close/pin buttons that "return to main app" and draft injection via parent postMessage/Tauri events. Keep tab bar, scope display (global), composer, message history.
- **D-08:** Force global scope with no TaskMate context. Do not call `buildGlobalContextPrompt(db)` or any task/CR/system/document grounding in this build. Knowledge/MCP/Oracle/SSH grounding stays fully functional.
- **D-09:** Settings drawer uses side nav with exactly 7 groups: **Provider, Knowledge Server, MCP, Graphiti, Oracle SQLcl, SSH File System, Tool Catalog**. Each group expands its own accordion/form; switching nav shows that group's content.
- **D-10:** Provider group covers all NineRouter fields actually present in `NineRouterConfigCard`: API endpoint, API key (keyring-backed), default model, context window, global conventions. First-run key entry must work in this app without TaskMate installed.
- **D-11:** Other groups reuse the real setting cards/config functions (`KnowledgeServerConfigCard`, `McpConfigCard`, `GraphitiSqlConfigCard`, `OracleAiToolConfigCard`/`OracleSqlclSettingsModal`, `SshFsAiToolConfigCard`, `AiToolCatalogCard`) rather than reimplementing storage.
- **D-12:** Settings writes go to the same `settings` Dexie store and OS keyring service/keys as TaskMate, so a user who has both apps shares config intentionally. Do not create a second schema/keyring namespace.
- **D-13:** Do not modify TaskMate's normal app behavior, default route, or chat popout behavior. The new app is additive.
- **D-14:** All existing Tauri capabilities needed by chat tools (window, webview, notifications, shell/plugin as already configured) must be present in the chat bundle; capabilities are currently window-wide (`windows: ["*"]`).
- **D-15:** No new npm dependencies. Reuse React 19, Ant Design 6, Dexie, existing AI services and Tauri commands.

### Claude's Discretion
- Exact implementation route: dedicated Vite entry vs reusing `#ai-popout` — pick whichever is smaller and leaves TaskMate untouched.
- Exact window size/title/icon details not specified above.
- Whether the settings drawer is a new component or a refactored extraction of existing cards — choose minimal shared code without duplicating storage logic.

### Deferred Ideas (OUT OF SCOPE)
- Task-creating AI tools in the chat-only build — out of scope (task CRUD excluded).
- PWA/GitHub Pages variant — explicitly out of scope for current work.
- Any second AI provider — not requested.

</user_constraints>

## Project Constraints (from CLAUDE.md)

All actionable directives extracted; planner must verify compliance.

- **Language:** Mọi thảo luận và trao đổi về dự án này đều bằng tiếng Việt. Khi cần gọi người dùng, xưng "sếp"; không dùng mày/tao. Mã nguồn, tên định danh, đường dẫn tệp, lệnh, thuật ngữ kỹ thuật và trích đoạn code giữ nguyên hình thức gốc, không dịch.
- **Runtime:** Tauri is primary and only supported app runtime for current work. Prefer Tauri APIs, native filesystem/keyring, desktop lifecycle, local SQLite paths. Do not add, debug, or validate PWA/GitHub Pages behavior unless explicitly requested.
- **No application server** for PlannerMate behavior. Optional independently deployed knowledge daemon may receive manually selected Markdown only after client-side preview/DLP approval; must not be required for local Docs/autosave/IndexedDB/BM25/PWA behavior.
- **Persistence:** IndexedDB working store; offline must keep working. **Sync:** GitHub Contents API stores only encrypted backup artifact; secrets client-side.
- **UI:** Ant Design; interactions simple, fast, responsive, accessible. **Hosting** (out of scope this phase): GitHub Pages subpath support.
- **Data safety:** Backup import must validate format and avoid replacing good local data without explicit confirmation. **Identifiers:** stable client-generated UUIDs; hierarchy changes must not alter IDs.
- **Audience:** one personal user — no collaboration model or role system.
- **No new npm dependencies** (CLAUDE.md "What NOT to Use" + D-15). No `@types/antd`, no `uuid` package, no Moment, no raw service worker.
- **Anti-Loop / Tool Usage:** No repeated small-chunk Read of same file/range; read once wide before edit. GSD workflow enforcement: file edits only through GSD commands.
- **Sketch skill:** `sketch-findings-task-management` applies to TaskMate doc-set/profile UI; its directions are for other screens and do not alter this phase's chat-only shell decision.

## Phase Requirements

No requirement IDs mapped (TBD in ROADMAP/REQUIREMENTS). Phase goal and D-01..D-15 from CONTEXT.md are the acceptance source.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dual Tauri bundle packaging | Native desktop (Tauri config/Cargo) | Build scripts (npm) | Product identity, window geometry, bundle icons are native app concerns; frontend `dist` unchanged |
| Chat-only route dispatch | Browser/Client (React hash route) | — | Route is client-side; Tauri window `url` only seeds initial hash, then hash routing owns it |
| Chat surface / tabs / streaming | Browser/Client | API/services layer (AI services) | `AIChatDrawer` + `AiChatWidget` own UI; services invoke Tauri commands for tools |
| Zero TaskMate context grounding | Browser/Client (chat turn assembly) | — | Grounding is assembled in `AIChatDrawer.handleSendTurn`; suppress at that boundary, not in services |
| AI tools (knowledge/MCP/Graphiti/Oracle/SSH) | API/services layer | Native desktop (Tauri commands) | Services call HTTP + Tauri `invoke`; must remain fully enabled |
| 7-group settings drawer | Browser/Client | Database/Storage (same Dexie + keyring) | Cards own their writes; drawer is composition only, no storage duplication |
| Credentials (API key, tokens) | Native desktop (OS keyring) | Database/Storage (Dexie fallback) | `keyringService` uses `service: 'task-planner'`; both apps must share exact service/key names |
| Chat/tab/thread history | Database/Storage (IndexedDB via Dexie) | Browser/Client | Same `settings`, `chatThreads`, `chatMessages`, `chatTabs` tables; no new schema |

## Standard Stack

No new packages. Versions verified against installed `package.json` (2026-11-25). No `npm view` executed this session — versions are from the checked-in lockfile/package.json, not registry-verified live.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tauri CLI / API | `@tauri-apps/cli ^2.2.0`, `@tauri-apps/api ^2.2.0` | Second bundle, window config, IPC | Already installed; `-c/--config` supports alternate config file `[CITED: https://v2.tauri.app/reference/cli/]` |
| React | 19.3.0 | UI | Fixed in CLAUDE.md; existing app |
| Ant Design | 6.6.5 (installed) | Drawer, side nav, Collapse, cards | Fixed project UI; wrappers in `src/components/ui` |
| Dexie / dexie-react-hooks | 4.4.6 / 4.4.0 | settings + chat persistence, live queries | Existing canonical store |
| TypeScript | 7.0.2 | strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | tsconfig.json verified |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/api/mocks` | part of `@tauri-apps/api ^2.2.0` | mockIPC/mockWindows for tests | Official Tauri test pattern `[CITED: https://v2.tauri.app/develop/tests/mocking/]` |
| Vitest | 5.0.2 | scoped unit/component tests | Existing; `--bail=1`, scoped paths only |
| fake-indexeddb | 6.2.5 | Dexie tests in jsdom | Existing `tests/setup.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `#ai-popout` + `dist` | Dedicated Vite entry + second `index.html` | Second entry doubles build config, needs own `dist` path per bundle, and must duplicate all providers. Rejected: D-02 prefers reuse; no behavior difference for user. |
| Tauri window `url: "index.html#ai-popout"` | Runtime `navigate('ai-popout')` after boot | Runtime navigation flashes workbench on launch/reload (violates D-04). Config-level hash seeds correct route from first paint. |

**Installation:** none. No npm install required.

**Version verification:** `package.json` in repo (read 2026-11-25) lists exact versions above. Registry re-verification skipped because D-15 forbids new deps; existing install is source of truth.

## Package Legitimacy Audit

No external packages installed or recommended in this phase. Gate not applicable. All referenced packages are already in `package.json`/`node_modules`. No `[ASSUMED]` package names introduced.

## Architecture Patterns

### System Architecture Diagram

```
[TaskMate Chat.app] Tauri main window
  url: index.html#ai-popout  ──>  [Vite dist/index.html]
                                   |
                                   v
                          [main.tsx -> AppIntelliJ]
                                   |
                       parseHash -> 'ai-popout' branch
                                   |
                    [AIPopoutView  (standaloneChat=true)]
                       |        |            |
                       |        |            +--> [gear] -> [AISettingsDrawer]
                       |        |                         7 side-nav groups
                       |        |                         -> existing 7 cards
                       |        |                         -> Dexie settings + OS keyring
                       |        +--> [Tauri listeners] DISABLED
                       |             (no parent scope/draft events)
                       +--> [AIChatDrawer  isPopoutWindow=true]
                            isStandaloneChat=true
                            - scope forced global
                            - no buildGlobalContextPrompt
                            - no global conventions
                            - no pin/close/popout
                            - tab bar + composer + history intact
                                   |
                                   v
                    [AI services: NineRouter, MCP, Graphiti,
                     Knowledge Server, Oracle SQLcl, SSH FS]
                                   |
                                   v
                    [Tauri commands: keyring, sqlite, ssh,
                     notifications, ai_proxy, ...]
```

### Recommended Project Structure

```
src-tauri/
├── tauri.conf.json              # unchanged — TaskMate bundle
├── tauri.conf.chat.json         # NEW — chat bundle overlay
├── capabilities/default.json    # unchanged — windows: ["*"] matches both
├── icons/                       # unchanged — reuse existing icon source
src/
├── AppIntelliJ.tsx              # add standaloneChat branch (or gate via config flag)
├── views/AIPopoutView.tsx       # add standaloneChat prop; neutralize parent coupling
├── components/ai/AIChatDrawer.tsx  # add isStandaloneChat; suppress grounding + affordances
├── components/ai/AISettingsDrawer.tsx  # NEW — 7-group side nav + Collapse, wraps existing cards
├── utils/aiPopout.ts            # unchanged (do not alter TaskMate popout)
package.json                     # add tauri:build:chat / tauri:dev:chat scripts
```

### Pattern 1: Config-level initial route

**What:** Set `app.windows[0].url` to `index.html#ai-popout` in the chat config. Config merge replaces arrays wholesale, so repeat all window fields. `[VERIFIED: official source]` — Tauri `WebviewUrl` deserializer parses non-http(s) strings as `WebviewUrl::App(PathBuf)` and does not strip the hash; default is `index.html`. `[CITED: https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-utils/src/config.rs]`

**When to use:** D-04 requires no workbench flash. Initial hash must be present at first paint.

**Example:**
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "TaskMate Chat",
  "identifier": "com.personal.taskmate.chat",
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "TaskMate Chat",
        "url": "index.html#ai-popout",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```
Build: `tauri build -c src-tauri/tauri.conf.chat.json`. `-c/--config` accepts a path and merges over `tauri.conf.json`; arrays replaced. `[CITED: https://v2.tauri.app/reference/cli/]`

**Anti-Patterns to Avoid**
- **Partial `app.windows` override:** merge replaces the array; a chat config with only `url` loses width/height/resizable. Repeat everything.
- **Runtime navigation to chat after boot:** flashes workbench; violates D-04.
- **Second Vite entry:** duplicates providers, assets, config; no benefit for this phase.
- **Changing `src-tauri/Cargo.toml` package name:** both bundles share one Rust crate and one `lib.rs`; no Cargo change needed. Only config `productName`/`identifier` change the installed app identity.

### Pattern 2: Standalone flag chain, not environment globals

**What:** Add explicit props `standaloneChat?: boolean` to `AppIntelliJ`, `AIPopoutView`, `AIChatDrawer`. Use `useHashRoute` unchanged. TaskMate's `#ai-popout` path stays byte-identical when flag is false.

**When to use:** D-13 requires additive change only.

**Example:**
```tsx
// AppIntelliJ.tsx — route branch, additive
if (route === 'ai-popout') {
  return (
    <AntdThemeAdapter>
      <ThemeAppHolder>
        <AIChatProvider>
          <AIPopoutView standaloneChat={standaloneChat} />
        </AIChatProvider>
      </ThemeAppHolder>
    </AntdThemeAdapter>
  );
}
```
Set `standaloneChat` from a build-time constant (e.g. `import.meta.env.VITE_CHAT_STANDALONE === '1'` set via chat build script) or from a Tauri config `initialWindow` title check — prefer the env constant; it is deterministic and leaves browser/TaskMate path untouched. No new dependency.

### Pattern 3: Grounding suppression at turn assembly

**What:** In `AIChatDrawer`, all context is assembled inside `handleSendTurn`. Two TaskMate-grounding call sites must be gated by `isStandaloneChat`:
1. `buildGlobalContextPrompt(db)` at line 1883 — `global_context` block with CR/task counts and names. Suppress entirely.
2. `getGlobalConventions(db)` + `buildConventionsSegment({ global })` at lines 1542-1543 — global standing instructions. Suppress the global argument.

Also suppress entity grounding for mentions (task/cr/system/document) at lines 1896-1945, and the task-only actions (`handleAddToChecklist`, `handleSaveStickyNote`, `handleRunClaudeCode`) reachable via message action callbacks. Knowledge/MCP/Graphiti/Oracle/SSH paths are separate and stay.

**When to use:** D-08 literal. Verified by grep of `src/components/ai/AIChatDrawer.tsx` and `src/services/ai/contextGrounding.ts:400`.

### Pattern 4: Settings drawer composition, no storage duplication

**What:** New `AISettingsDrawer` mounts seven existing cards. All take `db?: TaskPlannerDatabase`; `KnowledgeServerConfigCard` needs `KnowledgeConfigProvider` ancestor and takes `fetcher?: typeof fetch`. Provider card handles endpoint/key/model/context window/keyring itself.

**Exact signatures (from source):**
| Card | Props |
|------|-------|
| `NineRouterConfigCard` | `{ db?: TaskPlannerDatabase }` |
| `KnowledgeServerConfigCard` | `{ fetcher?: typeof fetch }` — needs `useKnowledgeConfig()` provider |
| `McpConfigCard` | `{ db?, onConfigChange? }` |
| `GraphitiSqlConfigCard` | `{ db?, onConfigChange? }` |
| `OracleAiToolConfigCard` | `{ db?, onConfigChange? }` — wraps `OracleProfileManager`, already a card (no modal required) |
| `SshFsAiToolConfigCard` | `{ db?, onConfigChange? }` |
| `AiToolCatalogCard` | `{ db? }` |

`AIChatDrawer` already has `onOpenSettings?: () => void` threaded to `ChatMessageList -> InlineApiErrorCard` (the "Mở Cài đặt AI" button) and to auth/config repair callbacks. Reuse this callback for the gear; do not build a second settings trigger path. `ChatHeader` has no gear today — add one behind the standalone flag (use wrapped `SettingOutlined` from `src/components/ui/icon`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat panel, tabs, threads, streaming | New chat component | `AIChatDrawer` + `AIPopoutView` | Already complete; D-02/D-13 |
| Settings storage | New settings repository or schema | Existing cards + `nineRouterTokenService` + `keyringService` | Cards already own Dexie writes and keyring calls |
| Credential storage | New keyring namespace/service | `keyringService` `service: 'task-planner'`, keys unchanged | D-12; OS keyring Entry(service,key) is stable `[VERIFIED: src-tauri/src/keyring_store.rs]` |
| AI tool config | Reimplement Oracle/MCP/SSH/Graphiti config | Existing cards, `OracleProfileManager`, `McpSettingsModal`, `SshFsSettingsModal` | Already wired to services |
| Tauri IPC / window events | New event names or channels | Existing `AI_SCOPE_EVENT`/`AI_DRAFT_EVENT` — but **disable listeners** in standalone | D-07; no parent exists |
| Build pipeline | Second Vite config | Single `dist` + two Tauri configs | D-02 |
| Window resize geometry | New persistence | None in standalone — set fixed 1280×800 in config; omit `AIPopoutView` geometry restore when standalone | Parent-popout geometry is wrong for a main window |

**Key insight:** nearly every requirement is satisfied by suppressing existing behavior, not adding new code. The risky part is accidental TaskMate coupling (grounding, parent events, geometry). Guard those explicitly.

## Common Pitfalls

### Pitfall 1: Tauri array replacement loses window fields
**What goes wrong:** Chat config replaces `app.windows` with a single object containing only `url`; width/height/minWidth/resizable disappear.
**Why it happens:** JSON Merge Patch replaces arrays whole, including arrays of objects. `[CITED: https://v2.tauri.app/develop/configuration-files/]`
**How to avoid:** Repeat full window object in `tauri.conf.chat.json`.
**Warning signs:** chat app opens tiny/default-sized; resizable off.

### Pitfall 2: Hash URL not applied on reload
**What goes wrong:** App shows workbench, then chat; or reload loses chat-only.
**Why it happens:** navigation done in JS after mount, or Tauri `url` given as full path without hash.
**How to avoid:** `url: "index.html#ai-popout"` in config, verified deserializer keeps hash. Never rely on `navigate()` after first paint.

### Pitfall 3: Parent-window listeners still active
**What goes wrong:** Standalone app reacts to `ai-set-scope`/`ai-set-draft` events; in browser fallback registers `postMessage` listener; geometry clamp to 360-560×480-800 shrinks main window; always-on-top toggled from stale localStorage.
**Why it happens:** `AIPopoutView` effect is unconditional for `isTauri`.
**How to avoid:** In standalone mode skip the entire listener/geometry effect and pass `isPinned={false}`, `onTogglePin={undefined}`, `onClose={undefined}`.

### Pitfall 4: TaskMate context leaks into global scope
**What goes wrong:** Chat app still sends `<global_context>` with CR/task counts, global conventions, or mention-based task/CR grounding.
**Why it happens:** Grounding is in shared `AIChatDrawer`; `buildGlobalContextPrompt` runs for every global turn.
**How to avoid:** Gate all TaskMate reads on `isStandaloneChat`; add focused test asserting no call. Note global conventions read at line 1542 runs before the grounded branch — gate that exact line too.

### Pitfall 5: Global scope overridden by AIChatContext / layout store
**What goes wrong:** `customScope` from localStorage or registered remote target turns scope non-global.
**Why it happens:** `AIChatProvider` reads `planner:ai_chat_scope`; `AIChatDrawer` registers active remote target from `useLayoutStore`.
**How to avoid:** In standalone, ignore persisted scope, force `activeScope={{ type: 'global' }}`, and skip the remote-target registration effect (lines 485-494).

### Pitfall 6: Missing provider means KnowledgeServerConfigCard throws
**What goes wrong:** `useKnowledgeConfig()` throws "requires KnowledgeConfigProvider".
**Why it happens:** `AIPopoutView` route branch in `AppIntelliJ` omits `KnowledgeConfigProvider` (unlike workbench branch).
**How to avoid:** Wrap standalone chat route in `KnowledgeConfigProvider`, or pass config explicitly. Needed for knowledge tools anyway.

### Pitfall 7: Keyring shared intentionally — don't rename
**What goes wrong:** Second app cannot read API key; first-run entry broken.
**Why it happens:** changing service name to `taskmate-chat` would create a different OS keyring entry.
**How to avoid:** Keep `KEYRING_SERVICE = 'task-planner'` and key `ninerouter_api_key`. Both apps share config by design (D-12).

### Pitfall 8: Shared IndexedDB origin across two Tauri apps
**What goes wrong:** Assumption that separate bundles get separate IndexedDB. In Tauri v2 with `index.html` app URL, origin is the app's custom protocol; data location is tied to bundle identifier on desktop. This is a local assumption — **not verified this session** against official docs.
**Why it happens:** different identifiers may or may not isolate WebView storage; browser-profile sharing possible.
**How to avoid:** Do not rely on isolation or non-isolation. D-12 already says shared config is intentional; test both apps on one machine before release. `[ASSUMED]`

### Pitfall 9: `onOpenSettings` already has a semantic
**What goes wrong:** Gear opens drawer but auth-repair button still calls same callback — fine, but if drawer is mounted inside `AIChatDrawer`, `onOpenSettings` recursion possible.
**Why it happens:** callback threaded from parent into widget.
**How to avoid:** Mount drawer in `AIPopoutView` (parent of `AIChatDrawer`), pass `onOpenSettings={() => setSettingsOpen(true)}` down. Drawer state lives above chat, chat stays mounted (D-06).

## Runtime State Inventory

Not applicable — greenfield additive build, no rename/refactor/migration of existing strings.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build tooling | ✓ | 24.16.0 | — |
| npm | scripts | ✓ | 11.13.0 | — |
| @tauri-apps/cli | dual bundle | ✓ | package `^2.2.0` | — |
| TypeScript (`npx tsc`) | typecheck | ✓ via npx | 7.0.2 (package.json) | — |
| Vitest | scoped tests | ✓ via npx | 5.0.2 | — |
| macOS Tauri build toolchain | real app smoke | unknown — not probed (Xcode command-line tools / code signing) | — | Run `npm run tauri:build:chat`; if toolchain missing, gate behind human-verify checkpoint |
| `gsd-tools` on PATH | GSD seams | ✗ | — | Use `node /Users/tranducquan/.claude/gsd-core/bin/gsd-tools.cjs` |
| Docker knowledge stack | optional tool smoke | not probed | — | Skip; not required for local chat |

**Missing dependencies with no fallback:** none confirmed. macOS signing/notarization not investigated — reuse TaskMate's existing release process.

**Missing dependencies with fallback:** `gsd-tools` PATH — use node shim as above.

## Validation Architecture

`workflow.nyquist_validation: true` in `.planning/config.json` — section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + @testing-library/react 16.3.3 + fake-indexeddb 6.2.5 |
| Config file | `vite.config.ts` (`environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| Quick run command | `npx vitest run <scoped paths> --bail=1` |
| Full suite command | `npx vitest run` — **NEVER run** (project rule: >1 hour) |
| Typecheck | `npx tsc --noEmit` |

### Phase Requirements → Test Map
No REQ IDs mapped. Checks keyed to D-numbers.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-03 | Chat config has correct identity, full window array, hash URL | unit (JSON contract) | `npx vitest run tests/phase51/chatConfig.test.ts --bail=1` | ❌ Wave 0 |
| D-04 | `#ai-popout` route resolves without workbench flash | unit (route) | `npx vitest run tests/phase51/standaloneRoute.test.tsx --bail=1` | ❌ Wave 0 |
| D-07 | Standalone view disables pin/close/scope/draft listeners | component | `npx vitest run tests/phase51/AIPopoutView.standalone.test.tsx --bail=1` | ❌ Wave 0 |
| D-08 | No `buildGlobalContextPrompt`/global conventions/entity grounding when standalone | unit/chat | `npx vitest run tests/phase51/groundingSuppression.test.tsx --bail=1` | ❌ Wave 0 |
| D-09/D-10 | Drawer shows exactly 7 groups with expected field labels; keyring first-run path | component | `npx vitest run tests/phase51/AISettingsDrawer.test.tsx --bail=1` | ❌ Wave 0 |
| D-13 | Existing `#ai-popout` behavior unchanged when flag false | component | `npx vitest run tests/phase51/AIPopoutView.legacy.test.tsx --bail=1` | ❌ Wave 0 |
| D-14 | Capabilities present in chat bundle | config contract | covered by chatConfig.test.ts (assert capability file unchanged / referenced) | ❌ Wave 0 |
| D-01 | Two bundles coexist | real app smoke | `npm run tauri:build:chat` then install alongside TaskMate; manual checklist | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/phase51/<touched-file>.test.ts(x) --bail=1 && npx tsc --noEmit`
- **Per wave merge:** all Wave 0 phase-51 files in one scoped command: `npx vitest run tests/phase51 --bail=1 && npx tsc --noEmit`
- **Phase gate:** scoped suite green + real-app smoke + human-verify before `/gsd-verify-work`. Full suite never run.

### Wave 0 Gaps
- [ ] `tests/phase51/chatConfig.test.ts` — parse `tauri.conf.chat.json`; assert identifier, productName, full window shape, hash URL, capability inheritance
- [ ] `tests/phase51/standaloneRoute.test.tsx` — render `AppIntelliJ` at `#ai-popout` with standalone flag; assert no workbench
- [ ] `tests/phase51/AIPopoutView.standalone.test.tsx` — mock Tauri via `@tauri-apps/api/mocks`/`__TAURI_INTERNALS__`; assert no listeners, no geometry writes, no pin/close
- [ ] `tests/phase51/groundingSuppression.test.tsx` — mock `contextGrounding` + `conventionService`; assert zero calls in standalone, normal calls in legacy
- [ ] `tests/phase51/AISettingsDrawer.test.tsx` — seven nav labels, cards rendered, chat stays mounted
- [ ] `tests/phase51/AIPopoutView.legacy.test.tsx` — regression for existing popout behavior
- [ ] npm scripts `tauri:build:chat` / `tauri:dev:chat` — add in `package.json`

*(Existing settings card tests in `tests/components/settings/` remain valid and need no change.)*

## Security Domain

`workflow.security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | no login; one personal user |
| V3 Session Management | no | no server session |
| V4 Access Control | no | single-user desktop app; no role system |
| V5 Input Validation | yes | existing Zod schemas at backup/config boundaries; must not bypass them in settings drawer |
| V6 Cryptography | yes | Web Crypto native; do not hand-roll; keyring via OS, no new crypto package |

### Known Threat Patterns for Tauri + chat stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leak via bundle | Information disclosure | Never `VITE_*` secret; keyring `task-planner`/`ninerouter_api_key`; browser fallback only in non-Tauri. Existing `nineRouterTokenService` already correct. |
| Cross-app credential confusion | Tampering/Info disclosure | Shared keyring service is intentional (D-12); document in UI; no second namespace. |
| Prompt injection via tool output | Tampering | Existing AI tool allowlist, wrapField, mutation gates remain; standalone build removes context grounding but keeps tool guards. |
| Unvalidated backup/settings import | Tampering | Reuse existing Zod validation; drawer does not add import path. |
| IPC over-privilege | Elevation of privilege | Capabilities unchanged, `windows: ["*"]`; do not add broad permissions for chat bundle. |
| Stale parent-window events driving chat | Tampering | Disable scope/draft listeners in standalone (D-07); never accept postMessage from unknown origin. |

## Sources

### Primary (HIGH confidence)
- Codebase reads (2026-11-25): `src/AppIntelliJ.tsx`, `src/views/AIPopoutView.tsx`, `src/components/ai/AIChatDrawer.tsx`, `src/components/ai/ChatHeader.tsx`, `src/components/ai/AiChatWidget.tsx`, `src/context/AIChatContext.tsx`, `src/hooks/useHashRoute.ts`, `src/utils/aiPopout.ts`, `src/services/ai/contextGrounding.ts`, `src/services/ai/nineRouterTokenService.ts`, `src/services/keyringService.ts`, `src/views/SettingsView.tsx`, all seven setting cards, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src-tauri/src/keyring_store.rs`, `package.json`, `vite.config.ts`, `tests/setup.ts`
- Official Tauri config source: `https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-utils/src/config.rs` — `WebviewUrl` deserialization keeps hash in `App(PathBuf)`

### Secondary (MEDIUM confidence)
- `https://v2.tauri.app/reference/cli/` — `-c, --config` path + merge semantics
- `https://v2.tauri.app/develop/configuration-files/` — JSON Merge Patch, arrays replaced
- `https://v2.tauri.app/security/capabilities/` — label-based `windows` matching, wildcard, auto-enable
- `https://v2.tauri.app/develop/tests/mocking/` — mockIPC/mockWindows
- `node .../gsd-tools.cjs query init.phase-op 51` — phase dir, context path

### Tertiary (LOW confidence)
- WebSearch on Tauri dual-bundle macOS coexistence returned no usable results; CFBundleIdentifier uniqueness is platform-level `[ASSUMED]`
- macOS signing/notarization process for second bundle `[ASSUMED]`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Both bundles share IndexedDB origin/data by design | Pitfall 8, D-12 | If isolated, first-run settings must be re-entered in chat app — UX surprise but no data loss |
| A2 | macOS CFBundleIdentifier must be unique per installed app | Common Pitfalls, Architecture | If not enforced, install could overwrite TaskMate — verify during real-app smoke |
| A3 | macOS signing/notarization reuses existing TaskMate process | Environment Availability | Build may fail at codesign; gate with human-verify |
| A4 | Build-time env flag is the cleanest standalone marker | Pattern 2 | If Vite env injection interferes with existing build, fallback to separate Tauri `identifier` check at runtime |

## Open Questions (RESOLVED)

1. **Standalone marker mechanism — RESOLVED**
   - Decision: build-time `VITE_CHAT_STANDALONE` via `vite.chat.config.ts` `define` (`import.meta.env.VITE_CHAT_STANDALONE = "1"`), wired through the `tauri:build:chat`/`tauri:dev:chat` scripts exactly as specified in `51-01-PLAN.md` Task 2. Not an env file (gitignored), not runtime identifier detection, not hash-only detection.
   - Rationale: deterministic committed source, defaults false in TaskMate's normal build, zero TaskMate behavior change. Rejected hash-only because it cannot distinguish TaskMate's own `#ai-popout`.

2. **Real dual-app install on macOS — RESOLVED**
   - Decision: converted to a `checkpoint:human-verify` task in `51-04-PLAN.md` (Task 3). Automated gate stays the scoped Vitest suite + typecheck; real `npm run tauri:build:chat` + install alongside TaskMate is a blocking human checkpoint with explicit fallback.
   - Fallback: if Xcode command-line tools / codesign env are unavailable, record the exact error and have the checkpoint confirm the documented blocker instead of blocking the automated gate; re-run the checkpoint when toolchain is available.

3. **Global conventions in standalone — RESOLVED**
   - Decision: resolved by `51-UI-SPEC.md` §Interaction Contract item 8 — the global conventions field stays visible and editable in Provider (D-10) but is NOT injected into standalone prompts (D-08 wins). Suppress `getGlobalConventions`/`buildConventionsSegment({ global })` only at turn assembly; keep the field in `NineRouterConfigCard` and share the stored value via Dexie/keyring.
   - Rationale: D-08 "no TaskMate context" governs prompt assembly; D-10 governs the settings surface. Both hold without conflict.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from checked-in `package.json`; no new deps
- Architecture: HIGH for codebase wiring, MEDIUM for Tauri config merge/hash URL (official docs + source read), LOW for OS-level coexistence
- Pitfalls: MEDIUM-HIGH — grounded in code paths read this session; IndexedDB isolation and codesign flagged `[ASSUMED]`

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 (stable stack; Tauri CLI behavior unlikely to change in 30 days)
