# Phase 47: API Coverage Declaration

**Scope:** SSH Remote Explorer search & AI code understanding (Tauri renderer + internal Tauri SSH/git service layer).

**Declaration:** No external API integration: internal Tauri SSH/git services only; no third-party API surface is added.

| capability | decision | reason |
|---|---|---|
| Tauri SSH/git service calls (internal IPC) | INTEGRATE | Reuse existing getRemoteTree/grepRemoteRef/sshService seams; not a third-party API |
| LLM model client via existing streamChatEvents | INTEGRATE | Existing internal client reused by inline Explain/Ask; no new provider surface |
| GitHub Contents API / encrypted backup sync | OPT-OUT | Unrelated to this phase; backup schema widened locally only, no API call added |
| Knowledge daemon HTTP API | OPT-OUT | No daemon work in this phase; local-first behavior unchanged |
| Third-party SDK / webhook / OAuth surface | OPT-OUT | Zero new packages and no external account, token or endpoint introduced |

## Reasoning

The detector fires on the terms "SSH" and "API" because the phase title and CONTEXT.md describe SSH remote exploration. Those terms here name **internal, already-existing seams**, not a new third-party integration:

- `src/services/sshService.ts`, `src/services/gitRemoteService.ts`, `src/services/gitRemoteTreeService.ts` are existing local services that invoke the Tauri backend over IPC. Phase 47 only reuses `getRemoteTree`, `grepRemoteRef`, `confineRepoPath` and `escapeShellArg` through their current call shape.
- `git_read` and the three SSH FS tools (`ssh_list_dir`, `ssh_read_file_page`, `ssh_grep_files`) are existing internal AI tools. D-13 adds an explicit target to their dispatch options; it does not add a new tool family, provider SDK, endpoint, or credential.
- No GitHub Contents API, knowledge daemon HTTP API, LLM provider HTTP client, or any other external surface is introduced, configured, or called by this phase. No npm package is added (RESEARCH.md "Package Legitimacy Audit" is not applicable).
- No `user_setup` entry is needed: the SSH profile is an existing user-owned configuration consumed by the current explorer; this phase does not ask the user for a new external account, token, or endpoint.

## Consequence for planning

No `user_setup` frontmatter, no external-service threat boundary beyond the existing client→Tauri→SSH hop, and no API-contract plan task. The STRIDE register in each PLAN.md covers the client→remote trust boundary with the established confinement/escaping/bounded-result controls instead.
