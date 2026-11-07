# Phase 32: External Research via Claude Code Headless - Research

**Researched:** 2026-11-07
**Domain:** Headless Claude Code remote execution over native SSH, streaming stdout events in Tauri Rust, structured research JSON parsing with attribution tagging, versioned Dexie artifact persistence, and subordinate evidence prompt synthesis in SDLC Studio.
**Confidence:** HIGH

## Summary

Phase 32 enables SDLC Studio to conduct external and multi-repository research using Claude Code in headless mode (`claude -p "<prompt>" --output-format json --allowedTools WebSearch,WebFetch,Glob,Grep,Read`) executed directly over native SSH. Originally designed to run through `fs-gw`, the architecture has been decisively rescoped to leverage TaskMate's native Tauri SSH subsystem (`ssh_service.rs` / `sshService.ts`) and the Enterprise Systems Catalog (`db.systems` from Phase 31.1).

When internal evidence is insufficient during intake or solutioning, the AI proposes explicit research questions instead of hallucinating. After explicit user confirmation (or manual trigger from the Step 1/2 toolbar), TaskMate targets the remote repositories associated with the Change Request's `targetSystemIds`, invokes Claude Code headless sequentially via a new non-PTY streaming command `ssh_exec_stream`, streams raw stdout line-by-line to an in-chat card, captures remote process PIDs to support safe termination (`kill -TERM <pid>`), parses structured JSON findings, validates them with Zod, and persists them as versioned `RESEARCH` note artifacts.

The research findings then enter `sdlcPromptComposer` as a distinct, subordinate evidence class (`<external_research_evidence rank="subordinate_to_internal">`). External claims must cite their sources and can never override internal conventions or bank policies.

**Primary recommendation:** Build `ssh_exec_stream` and `ssh_kill_process` in `ssh_service.rs` using standard SSH2 non-PTY exec channels for clean, unescaped JSON/text streaming; coordinate multi-system headless execution through a new frontend `researchService.ts`; persist findings in `db.notes` as `RESEARCH vX` via `artifactRepo.ts`; and integrate dual-card inspection on Step 1 and Step 2 via `ResearchSummaryCard`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Cơ chế thực thi & Streaming qua SSH
- **D-01 (Tauri Exec Stream):** Implement `ssh_exec_stream` command in Tauri Rust (`ssh_service.rs` / `sshService.ts`) utilizing a clean non-PTY SSH exec channel. Rust reads remote stdout/stderr line-by-line and emits `ssh-stream:data:{sessionId}` events to frontend, returning clean 100% unescaped raw JSON/text without ANSI codes or terminal artifacts.
- **D-02 (Process Termination):** Remote execution captures process PID on launch. When user clicks "Hủy" / "Stop", Tauri Rust sends `kill -TERM <pid>` over SSH and closes the channel, preventing orphaned headless processes on the remote server.
- **D-03 (Timeout & Fallback):** Default execution timeout is 300s (5 minutes). On timeout or SSH connection drop, UI presents an informative warning banner with two distinct CTA buttons: "Thử lại" (Retry) or "Bỏ qua, tiếp tục bằng bằng chứng nội bộ" (Proceed with internal evidence alone).

#### Định dạng lệnh & Parser kết quả
- **D-04 (Headless CLI & JSON Schema):** Remote command executes `claude -p "<prompt>" --output-format json`. Prompt instructs Claude Code to output a strict JSON payload: `{ summary: string, findings: Array<{ claim: string, scope: 'web' | 'repo', source: string, confidence: number }> }`. Frontend validates payload with Zod and falls back gracefully to raw text if JSON parsing fails.
- **D-05 (Artifact Persistence):** Extend `SdlcArtifactMetadata` with `kind: 'RESEARCH'`. Research reports are stored in `db.notes` via `artifactRepo.ts` with `entityType: 'project'` (bound to the active CR thread). Inherits encrypted backup, thread association, and global searchability.
- **D-06 (Multi-version History):** Each research execution produces a versioned artifact (`RESEARCH v1`, `v2`, ...). The latest version is automatically used in prompt composition, but historical versions remain inspectable in SDLC Studio.
- **D-07 (Prompt Composer Integration):** Add a delimited segment `<external_research_evidence rank="subordinate_to_internal">` to `sdlcPromptComposer.ts` placed after internal grounding. Segment explicitly mandates that external evidence cannot override internal banking rules or conventions, and external claims must remain attributable to their cited source.

#### Trigger & Giao diện UX
- **D-08 (Dual Trigger Mechanism):** Support both automatic proposal and manual execution:
  - *AI Propose:* When internal evidence is insufficient, AI emits a "Propose Research" card in Chat listing specific questions and target systems to research.
  - *Toolbar Button:* An explicit "Nghiên cứu (Claude Code)" button in Step 1/2 Toolbar enables user to initiate ad-hoc research anytime.
- **D-09 (In-Chat Streaming Card):** Real-time progress renders directly inside the chat thread as an active streaming card showing elapsed time, line count, and an expandable accordion of live stdout logs.
- **D-10 (ResearchSummaryCard):** Step 1 (Intake) and Step 2 (Solution) display a `ResearchSummaryCard` alongside `ConventionsSummaryCard` showing current research version badge, finding counts (Web vs Repo), and a "Xem chi tiết" button opening a full inspection modal.
- **D-11 (Post-Research Flow):** Completing research displays a completion card with an explicit CTA button "Tiếp tục sinh Solution với bằng chứng này". User clicks to dispatch the follow-up prompt to Chat; no automatic generation without consent.

#### Multi-System Targeting & Quyền Bảo Mật (Align Phase 31.1)
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

### Deferred Ideas (OUT OF SCOPE)
- **Live interactive terminal takeover:** Allowing user to jump into headful terminal if headless research gets stuck (already covered by Phase 29.1 bottom panel).
- **Scheduled background research:** Triggering research runs on a cron schedule (out of scope for single-user desktop app).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SDLC-RES-01** | AI proposes research when internal evidence is insufficient; waits for explicit user confirmation. | Add `propose_research` tool / card in chat and manual toolbar trigger; user modal/confirmation before dispatching SSH execution. |
| **SDLC-RES-02** | Confirmed run executes Claude Code headless over SSH across web & repo, streams progress, stoppable without orphans. | `ssh_exec_stream` and `ssh_kill_process` in Rust `ssh_service.rs` via non-PTY channel with PID tracking; `--allowedTools` read-only flags. |
| **SDLC-RES-03** | Stored as project/CR-scoped artifact with per-claim sources and scope markers (`[EXTERNAL:WEB]`, `[EXTERNAL:REPO:{code}]`). | Zod schema validation; `saveResearchArtifact` in `artifactRepo.ts` with `kind: 'RESEARCH'` in `db.notes`. |
| **SDLC-RES-04** | Findings enter prompt as subordinate evidence; cannot outrank internal evidence; claims stay attributable. | `<external_research_evidence rank="subordinate_to_internal">` segment in `sdlcPromptComposer.ts` with attribution policy. |
| **SDLC-RES-05** | When SSH/Claude Code unavailable, AI informs user and offers to continue on internal evidence alone. | D-03 timeout/disconnect banner with "Proceed with internal evidence alone" CTA; fallback prompt instruction. |
| **SDLC-RES-06** | Research artifacts persist with CR, appear in step produced, reusable in later steps without re-running. | `ResearchSummaryCard` in Step 1/2 reading latest `RESEARCH` note; `loadLatestResearchArtifact` helper across steps. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| **SSH Streaming & Process Lifecycle** | Tauri Rust (`src-tauri/src/ssh_service.rs`) | OS TCP / SSH2 Subsystem | Rust manages SSH sockets, thread-safe line reading, event emission, and PID signal handling without main-thread blocking. |
| **Multi-System Orchestration** | Client Frontend (`src/services/ai/researchService.ts`) | Dexie (`systemRepo.ts`, `changeRequestRepo.ts`) | Frontend sequences multi-repo executions, aggregates findings, and attaches system code metadata. |
| **Artifact Persistence & Versioning** | Client Database (`src/services/wizard/artifactRepo.ts`) | Dexie `db.notes` | Preserves ACID local storage, encrypted backup compatibility, and project/CR scoping. |
| **Prompt Composition & Ranking Policy** | Client Composer (`src/services/ai/sdlcPromptComposer.ts`) | AI Model Client | Enforces immutable ordering: Shared Policy → Step Contract → Tool Policy → Conventions → Grounding → Subordinate External Research. |
| **UI Progress & Inspection** | Client React (`StepChatPanel.tsx`, `ResearchSummaryCard.tsx`) | Ant Design / ExpUI Tokens | Displays in-chat live progress, error banners with CTAs, and detailed modal views. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ssh2` (Rust crate) | 0.9.6 | Native SSH2 protocol client | Already integrated in `src-tauri`; supports channel exec, non-blocking I/O, signals. |
| `zod` | 4.6.5 | Runtime JSON validation | Project standard for validating untrusted LLM outputs and schemas. |
| `dexie` / `dexie-react-hooks` | 4.4.6 / 4.4.0 | Local persistence & reactive hooks | Manages `db.notes`, `db.systems`, and reactive UI updates for research cards. |
| `antd` | 6.6.5 | UI components | Fixed UI framework for modals, cards, tags, accordions, and buttons. |
| `dayjs` | 1.11.23 | Timestamp display | Project standard for date/time formatting. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/api/core` | 2.x | IPC invoke & event listening | Used in `sshService.ts` for calling Rust commands and subscribing to stream events. |

## Architecture Patterns

### System Architecture Diagram

```
[SDLC Chat / Toolbar]
       │
       ▼ (User Confirms / Clicks "Nghiên cứu")
[researchService.ts]
       │
       ├─► 1. Resolve CR targetSystemIds -> Systems -> SSH Configs
       │
       ├─► 2. For each Target System (Sequential):
       │       │
       │       ▼
       │   [invoke('ssh_exec_stream')] (Tauri Rust: ssh_service.rs)
       │       │
       │       ├─► Open Non-PTY SSH Channel (Exec: `claude -p "..." --output-format json`)
       │       │
       │       ├─► Remote Process Launch & PID Capture
       │       │
       │       ├─► Background Thread: Read line-by-line
       │       │       │
       │       │       └─► app.emit('ssh-stream:data:{sessionId}', line)
       │       │
       │       ▼ (UI: In-Chat StreamingCard updates live stdout & line count)
       │
       ├─► 3. Parse JSON / Regex Fallback & Tag Scope:
       │       [EXTERNAL:REPO:{systemCode}] & [EXTERNAL:WEB]
       │
       ├─► 4. Commit Note Artifact (db.notes) -> `RESEARCH v{N}`
       │
       ▼
[sdlcPromptComposer.ts]
       │
       └─► Injects <external_research_evidence rank="subordinate_to_internal">
               │
               ▼
       [AI Chat Turn: "Tiếp tục sinh Solution với bằng chứng này"]
```

### Pattern 1: Non-PTY Line-Buffered SSH Exec Streaming in Rust

**What:** PTY channels merge stderr, add ANSI escape color sequences, and mangle line endings (`\r\n`). For automated JSON consumers, a non-PTY channel (`channel.exec(...)`) is clean, predictable, and gives raw stdout without terminal codes.
**When to use:** Remote CLI automation where output format is structured JSON or raw text.
**Example:**
```rust
// In src-tauri/src/ssh_service.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStreamEvent {
    pub session_id: String,
    pub stream: String, // "stdout" | "stderr"
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStreamExitEvent {
    pub session_id: String,
    pub exit_status: i32,
    pub error: Option<String>,
}
```

PID capture pattern: To reliably kill the headless process if the user cancels:
```bash
# Wrap command on remote host:
sh -c 'echo "$$" && exec claude -p "$PROMPT" --output-format json --allowedTools WebSearch,WebFetch,Glob,Grep,Read'
```
The first line emitted on stdout is the remote PID. Rust parses this PID, saves it in a session map, and emits only subsequent lines to the frontend.

### Pattern 2: Multi-System Attributed Claims Schema

```typescript
import { z } from 'zod';

export const ResearchFindingSchema = z.object({
  claim: z.string().min(1),
  scope: z.enum(['web', 'repo']),
  systemCode: z.string().optional(),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1).default(1.0),
});

export const ResearchPayloadSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(ResearchFindingSchema),
  rawOutput: z.string().optional(),
});

export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;
export type ResearchPayload = z.infer<typeof ResearchPayloadSchema>;
```

### Pattern 3: Subordinate Prompt Delimiter Injection

```typescript
// In sdlcPromptComposer.ts
export function buildExternalResearchSegment(researchArtifacts: ResearchPayload[]): string {
  if (!researchArtifacts.length) return '';
  
  const formattedFindings = researchArtifacts.flatMap((art) => 
    art.findings.map((f) => {
      const tag = f.scope === 'repo' 
        ? `[EXTERNAL:REPO:${f.systemCode ?? 'UNKNOWN'}]` 
        : '[EXTERNAL:WEB]';
      return `- ${tag} ${f.claim} (Nguồn: ${f.source}, Độ tin cậy: ${Math.round(f.confidence * 100)}%)`;
    })
  ).join('\n');

  return [
    '<external_research_evidence rank="subordinate_to_internal">',
    'BẰNG CHỨNG NGHIÊN CỨU TỪ BÊN NGOÀI (CLAUDE CODE HEADLESS):',
    '1. Bằng chứng này xếp sau quy ước tổ chức (CONVENTIONS) và bằng chứng nội bộ (PL01/PL02/ChangePack).',
    '2. KHÔNG ĐƯỢC sử dụng các kết luận bên ngoài để ghi đè các quy định bảo mật hoặc nghiệp vụ ngân hàng nội bộ.',
    '3. Mọi dữ kiện bên ngoài khi đưa vào giải pháp PHẢI giữ nguyên trích dẫn nguồn.',
    '',
    formattedFindings,
    '</external_research_evidence>'
  ].join('\n');
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal stream parsing | Custom ANSI escape code stripper | Non-PTY `channel.exec` | PTY emulation injects cursor movement, color codes, line wrapping. Non-PTY streams pure raw bytes directly from stdout/stderr. |
| Remote Process Termination | SSH disconnect alone | Explicit `kill -TERM <pid>` over SSH | Disconnecting an SSH session without sending a signal may leave background daemonized or lingering Node processes active on the server. |
| JSON Output Repair | Hand-rolled brace matching | Zod parsing with strict regex fallback | LLMs sometimes wrap JSON in markdown fences ````json ... ````. Use a robust JSON extractor with fallback to raw markdown report. |
| Artifact Storage | Separate IndexedDB table | `db.notes` with `kind: 'RESEARCH'` in `sdlcArtifact` | Reuses existing ACID transactions, backup encryption, thread association, and global searchability. |

## Common Pitfalls

### Pitfall 1: Shell Quoting & Argument Escaping Over SSH
**What goes wrong:** Prompts containing double quotes, backticks, `$VARIABLE`, or newlines break remote shell execution or cause arbitrary shell execution.
**Why it happens:** Passing prompts directly inside `claude -p "..."` without strict escaping allows the remote shell (`sh` / `bash`) to expand variables or terminate quotes early.
**How to avoid:** Use single-quote escaping (`'\''`) or base64 encode the prompt and pipe it:
`echo "<base64_encoded_prompt>" | base64 -d | claude -p - --output-format json` (or write to a temporary file on the remote server `/tmp/pm_research_{id}.txt`).
*Best practice:* Standard single-quote escaping:
`'${prompt.replace(/'/g, "'\\''")}'` ensures literal shell safety.

### Pitfall 2: Claude Code Headless Write Operations
**What goes wrong:** Headless Claude Code attempts to run `git commit`, `npm test`, or edit repository files during a research run, dirtying the remote branch.
**Why it happens:** Default Claude Code permissions allow tool usage including file writing and bash execution.
**How to avoid:** Enforce `--allowedTools WebSearch,WebFetch,Glob,Grep,Read` (or `--dangerously-skip-permissions` combined with strict read-only tool whitelisting). Never include `Edit`, `Write`, or `Bash` tools in the research CLI invocation.

### Pitfall 3: Subordinate Evidence Overriding Internal Conventions
**What goes wrong:** Web research suggests modern library versions or patterns (e.g. Java 21 Virtual Threads) that violate internal bank standards (e.g. mandated WebLogic or Java 17).
**Why it happens:** The LLM solution generator treats web research as the "latest and greatest" and silently discards older internal conventions.
**How to avoid:** Explicit delimiter framing `<external_research_evidence rank="subordinate_to_internal">` placed AFTER internal conventions and grounding, coupled with a strict rule in Layer 1 policy forbidding external evidence from overriding internal rules.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run src/services/ai/__tests__/researchService.test.ts` |
| Full suite command | Scoped vitest command only (per project instructions, full suite takes >1h) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDLC-RES-01 | Propose research triggers card, requires confirmation | Unit / Component | `npx vitest run src/components/sdlc/chat/__tests__/StepChatPanel.test.tsx` | ❌ Wave 0 |
| SDLC-RES-02 | SSH streaming execution & stop command | Unit / Integration | `npx vitest run src/services/__tests__/sshStreamService.test.ts` | ❌ Wave 0 |
| SDLC-RES-03 | Research artifact parsing, scope tagging & note commit | Unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ Wave 0 |
| SDLC-RES-04 | Subordinate prompt composition & rank policy | Unit | `npx vitest run src/services/ai/__tests__/sdlcPromptComposer.test.ts` | ✅ (extend existing) |
| SDLC-RES-05 | Fallback behavior when SSH/Claude Code unavailable | Unit | `npx vitest run src/services/ai/__tests__/researchService.test.ts` | ❌ Wave 0 |
| SDLC-RES-06 | Multi-step reuse of latest research artifact | Integration | `npx vitest run src/services/wizard/__tests__/artifactRepo.test.ts` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed_test_file>`
- **Per plan complete:** Run targeted test suite for all Phase 32 specs.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Validate research JSON payloads with Zod; escape shell prompts before SSH execution. |
| V6 Cryptography | Yes | Reuses existing AES-GCM encrypted backup; SSH private keys and passwords stay in OS Keyring. |
| V14 Configuration | Yes | Strict read-only tool whitelisting (`--allowedTools`) prevents accidental or malicious remote repo modifications. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Remote Command Injection via Prompt | Tampering / Elevation | Single-quote escape prompt or pass prompt via stdin / base64; strictly whitelist allowed CLI flags. |
| Remote Repository Modification | Tampering | Strictly restrict Claude Code tools to read-only (`WebSearch`, `WebFetch`, `Glob`, `Grep`, `Read`). |
| Prompt Injection from Untrusted Web Results | Tampering | Enclose research findings in `<external_research_evidence>` untrusted delimiters; policy enforces subordinate rank. |

## Metadata

**Research date:** 2026-11-07
**Valid until:** 2026-12-07
