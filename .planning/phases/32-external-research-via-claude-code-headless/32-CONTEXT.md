# Phase 32: External Research via Claude Code Headless - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Rescoped phase: Replaces fs-gw with direct SSH remote execution of Claude Code headless. When SDLC Studio lacks sufficient internal evidence to resolve architectural, library, or implementation questions, the AI proposes explicit research questions instead of guessing. Upon user confirmation, TaskMate executes Claude Code in headless mode (`claude -p "<prompt>" --output-format json`) over native SSH on the target System(s) of the Change Request (CR), streams progress in real time via a new non-PTY streaming command, parses a structured schema of findings with attribution (`[EXTERNAL:WEB]` and `[EXTERNAL:REPO:{systemCode}]`), persists the result as a versioned `RESEARCH` note artifact in IndexedDB, and injects findings into `sdlcPromptComposer` as an explicitly ranked evidence class subordinate to internal evidence.

</domain>

<decisions>
## Implementation Decisions

### Cơ chế thực thi & Streaming qua SSH
- **D-01 (Tauri Exec Stream):** Implement `ssh_exec_stream` command in Tauri Rust (`ssh_service.rs` / `sshService.ts`) utilizing a clean non-PTY SSH exec channel. Rust reads remote stdout/stderr line-by-line and emits `ssh-stream:data:{sessionId}` events to frontend, returning clean 100% unescaped raw JSON/text without ANSI codes or terminal artifacts.
- **D-02 (Process Termination):** Remote execution captures process PID on launch. When user clicks "Hủy" / "Stop", Tauri Rust sends `kill -TERM <pid>` over SSH and closes the channel, preventing orphaned headless processes on the remote server.
- **D-03 (Timeout & Fallback):** Default execution timeout is 300s (5 minutes). On timeout or SSH connection drop, UI presents an informative warning banner with two distinct CTA buttons: "Thử lại" (Retry) or "Bỏ qua, tiếp tục bằng bằng chứng nội bộ" (Proceed with internal evidence alone).

### Định dạng lệnh & Parser kết quả
- **D-04 (Headless CLI & JSON Schema):** Remote command executes `claude -p "<prompt>" --output-format json`. Prompt instructs Claude Code to output a strict JSON payload: `{ summary: string, findings: Array<{ claim: string, scope: 'web' | 'repo', source: string, confidence: number }> }`. Frontend validates payload with Zod and falls back gracefully to raw text if JSON parsing fails.
- **D-05 (Artifact Persistence):** Extend `SdlcArtifactMetadata` with `kind: 'RESEARCH'`. Research reports are stored in `db.notes` via `artifactRepo.ts` with `entityType: 'cr'` and `entityId = changeRequestId` (bound to the active CR thread; `NoteEntityType` is `'task' | 'cr' | 'system'`). Inherits encrypted backup, thread association, and global searchability.
- **D-06 (Multi-version History):** Each research execution produces a versioned artifact (`RESEARCH v1`, `v2`, ...). The latest version is automatically used in prompt composition, but historical versions remain inspectable in SDLC Studio.
- **D-07 (Prompt Composer Integration):** Add a delimited segment `<external_research_evidence rank="subordinate_to_internal">` to `sdlcPromptComposer.ts` placed after internal grounding. Segment explicitly mandates that external evidence cannot override internal banking rules or conventions, and external claims must remain attributable to their cited source.

### Trigger & Giao diện UX
- **D-08 (Dual Trigger Mechanism):** Support both automatic proposal and manual execution:
  - *AI Propose:* When internal evidence is insufficient, AI emits a "Propose Research" card in Chat listing specific questions and target systems to research.
  - *Toolbar Button:* An explicit "Nghiên cứu (Claude Code)" button in Step 1/2 Toolbar enables user to initiate ad-hoc research anytime.
- **D-09 (In-Chat Streaming Card):** Real-time progress renders directly inside the chat thread as an active streaming card showing elapsed time, line count, and an expandable accordion of live stdout logs.
- **D-10 (ResearchSummaryCard):** Step 1 (Intake) and Step 2 (Solution) display a `ResearchSummaryCard` alongside `ConventionsSummaryCard` showing current research version badge, finding counts (Web vs Repo), and a "Xem chi tiết" button opening a full inspection modal.
- **D-11 (Post-Research Flow):** Completing research displays a completion card with an explicit CTA button "Tiếp tục sinh Solution với bằng chứng này". User clicks to dispatch the follow-up prompt to Chat; no automatic generation without consent.

### Multi-System Targeting & Quyền Bảo Mật (Align Phase 31.1)
- **D-12 (Target System Resolution):** Align with Phase 31.1 Enterprise Systems Catalog & CR Transformation:
  - SSH credentials (`sshConfigId`) and repo path (`remoteRepoPath`) are resolved from the CR's `targetSystemIds` (via `db.systems`).
  - AI proposal indicates which questions belong to which target system.
  - User can confirm AI's recommendation, choose a single system, or multi-select multiple systems (or "Tất cả").
  - Multi-system runs execute sequentially across target repos, producing tagged claims: `[EXTERNAL:REPO:{systemCode}]` and `[EXTERNAL:WEB]`.
- **D-13 (Read-Only Tool Enforcement):** Remote Claude Code invocation strictly enforces read-only tooling (`--allowedTools WebSearch,WebFetch,Glob,Grep,Read` or `--read-only`). Cấm hoàn toàn Write/Edit/Git push trên remote repository để bảo vệ code an toàn tuyệt đối.
- **D-14 (Authentication):** Relies on existing authentication already configured on the remote server (API key / OAuth session of the remote user environment). No tokens transmitted from TaskMate.

### Claude's Discretion
- UI design tokens, exact spinner animation, and accordion styling conform to existing IntelliJ ExpUI Islands Light standards.
- Fallback text parser regex patterns for imperfect JSON responses.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Roadmap
- `.planning/ROADMAP.md` §Phase 32 — Original goals and success criteria for External Research
- `.planning/REQUIREMENTS.md` §SDLC-RES-01 to SDLC-RES-06 — Formal requirement definitions
- `.planning/phases/31.1-enterprise-systems-catalog-cr-transformation-inserted/31.1-01-PLAN.md` — System & CR entity model (SCHEMA_V15, targetSystemIds)
- `.planning/phases/31.1-enterprise-systems-catalog-cr-transformation-inserted/31.1-04-PLAN.md` — Multi-system SSH and convention resolution pattern

### SSH & Backend
- `src-tauri/src/ssh_service.rs` — Tauri SSH execution and SFTP subsystem commands
- `src-tauri/src/ssh_pty_service.rs` — PTY session reference for event emitting
- `src/services/sshService.ts` — TypeScript frontend SSH wrapper functions

### Artifacts & Composer
- `src/services/wizard/artifactRepo.ts` — Canonical SDLC artifact commit and versioning pipeline
- `src/services/ai/sdlcPromptComposer.ts` — Prompt layers, grounding, and untrusted delimiter policies
- `src/components/sdlc/common/ConventionsSummaryCard.tsx` — Reference visual layout for summary cards on Step 1/2

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/sshService.ts`: `execRemoteCommand`, `readRemoteFile`, `testSshConnection` for basic SSH commands.
- `src/services/wizard/artifactRepo.ts`: `commitArtifact`, `loadCanonicalArtifactChain` handles transactional note creation with idempotency and thread linking.
- `src/components/sdlc/common/ConventionsSummaryCard.tsx`: Exemplar compact card with badge, status tag, and detail modal.
- `src/db/repositories/systemRepo.ts`: System lookup by ID for resolving `sshConfigId` and `remoteRepoPath`.

### Established Patterns
- **Untrusted External Data:** Delimited prompt framing (`<external_research_evidence>...</external_research_evidence>`) preventing prompt injection.
- **Subordinate Rank Rule:** External evidence explicitly cannot override global/repo conventions or internal evidence.
- **Transactional Notes:** Artifacts stored as `Note` entities with `sdlcArtifact` metadata in Dexie.

### Integration Points
- `src-tauri/src/ssh_service.rs`: Add `ssh_exec_stream` and `ssh_kill_process` Tauri commands.
- `src/services/sshService.ts`: Expose `execRemoteCommandStream` with listener callback.
- `src/services/ai/researchService.ts` (new): Coordinates headless research, prompt synthesis, and multi-system execution.
- `src/services/ai/sdlcPromptComposer.ts`: Add `externalResearch` input and segment builder.
- `src/components/sdlc/steps/Step1IntakeView.tsx` & `Step2SolutionView.tsx`: Integrate `ResearchSummaryCard` and proposal gate.
- `src/components/ai/AIChatDrawer.tsx`: In-chat streaming card and proposal card rendering.

</code_context>

<specifics>
## Specific Ideas

- Claude Code headless CLI command:
  ```bash
  claude -p "<research_prompt>" --output-format json --allowedTools WebSearch,WebFetch,Glob,Grep,Read
  ```
- Findings JSON Schema:
  ```json
  {
    "summary": "Tóm tắt kết quả nghiên cứu...",
    "findings": [
      {
        "claim": "Spring Cloud Gateway MVC hỗ trợ native virtual threads từ Spring Boot 3.2",
        "scope": "web",
        "source": "https://docs.spring.io/spring-cloud-gateway/...",
        "confidence": 0.95
      },
      {
        "claim": "SC-API hiện đang cấu hình timeout 30s tại application.yml",
        "scope": "repo",
        "source": "src/main/resources/application.yml:42",
        "confidence": 1.0
      }
    ]
  }
  ```
- User can select multiple systems or "All Systems" from the CR's `targetSystemIds` during proposal confirmation.

</specifics>

<deferred>
## Deferred Ideas

- **Live interactive terminal takeover:** Allowing user to jump into headful terminal if headless research gets stuck (already covered by Phase 29.1 bottom panel).
- **Scheduled background research:** Triggering research runs on a cron schedule (out of scope for single-user desktop app).

</deferred>

---

*Phase: 32-External Research via Claude Code Headless*
*Context gathered: 2026-11-07*
