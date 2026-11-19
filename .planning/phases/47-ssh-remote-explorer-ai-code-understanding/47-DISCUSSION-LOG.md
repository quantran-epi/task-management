# Phase 47: SSH Remote Explorer Search & AI Code Understanding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-19
**Phase:** 47-SSH Remote Explorer Search & AI Code Understanding
**Areas discussed:** Phase numbering and isolation, Search scope, Chat panel placement, AI tools, Context entry, Inline UX

---

## Phase numbering and isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 47 | Create a separate phase directory in this worktree; do not edit shared ROADMAP.md/STATE.md | ✓ |
| Phase 46.1 | Insert after phase 46 but risk confusion with active session | |
| Quick task | No phase artifacts; small fast execution | |

**User's choice:** Phase 47
**Notes:** User warned that two other sessions are running phase 45 and 46 in parallel.

---

## Search scope

| Option | Description | Selected |
|--------|-------------|----------|
| Current repo/branch | Search in active SSH config + repoPath + branch | ✓ |
| Whole remote path | Search from remote root outside current repo | |
| Ask each time | Show scope selector per search | |

**User's choice:** Current repo/branch
**Notes:** User earlier confirmed both file/folder name search and content search (ripgrep-style) are required.

---

## Chat panel placement

| Option | Description | Selected |
|--------|-------------|----------|
| Side panel by file tab | Open a new per-file docked AI panel | |
| Shared tool window | One remote AI tool window follows active target | |
| Existing AIChatDrawer | Add a new context type to existing drawer with context switch | ✓ |

**User's choice:** Existing AIChatDrawer with new remote context type
**Notes:** User said the existing drawer already has context switch and wants folder/repo-scoped context with cross-file linkage, not a single-file-only panel. Documentation inline AI should follow the same principle.

---

## AI tools

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse git_read / SSH FS tools | Extend existing read-only tools with explicit remote target | ✓ |
| Headless explore_repo | Use remote claude -p --restricted for broad exploration | |
| Both with picker | Allow user/model to choose between both approaches | |

**User's choice:** Reuse git_read / SSH FS tools
**Notes:** Keep path confinement, read-only behavior and bounded results.

---

## Context entry

| Option | Description | Selected |
|--------|-------------|----------|
| Scope by current target | Automatic context entry for active SSH config/repo/branch | ✓ |
| One entry per file | Separate context for each remote file | |
| Manual context creation | User adds remote context manually | |

**User's choice:** Scope by current target
**Notes:** Selecting a remote file or text makes that target scope active; users can switch to other contexts.

---

## Inline UX

| Option | Description | Selected |
|--------|-------------|----------|
| Popover near selection | Explain/Ask answer appears next to selected text with Open in Chat | ✓ |
| Always open drawer | Selection opens drawer immediately | |
| Popover with auto tools | Popover itself uses read-only tools automatically | |

**User's choice:** Popover near selection
**Notes:** Open in Chat continues with tools and keeps selection mention inside remote context.

---

## Claude's Discretion

- Exact scope type string and scope key encoding.
- Tool argument names and precise prompt wording.
- Search debounce/regex semantics and result caps.
- Popover sizing and keyboard shortcuts.
- Whether the inline popover performs one bounded read-only tool call.

## Deferred Ideas

- Headless `explore_repo` as optional remote AI tool for broad architecture questions.
- Persistent remote AI workspace context that survives switching away from active target.
- Full remote-path search outside current repo/branch as explicit scope option.
