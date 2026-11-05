# Phase 28: Query-Only Knowledge Retrieval - Discussion Log

> **Audit trail only.** Not input to research, planning or execution agents. Final decisions live in CONTEXT.md.

**Date:** 2026-11-05
**Phase:** 28-Query-Only Knowledge Retrieval
**Areas discussed:** Set discovery & chọn set; Hình dạng request protocol; Attribution set/snapshot; Empty-set outcome & 3 surfaces.

## Area selection

All four offered areas selected. Discovery covers published-set eligibility and budgets; request discussion covers default versus explicit scope; attribution covers returned sources and source inspection; empty-set covers common messaging and fallback.

## Set discovery & chọn set

| Question | Options presented | User selection |
|---|---|---|
| Published set, graph not ready? | Search available fulltext/vector and disclose missing graph (recommended); only use graph-ready sets | Search available modalities |
| Published sets exceed budget? | Bounded partial evidence with incomplete-coverage warning (recommended); require narrower scope before returning evidence | Return partial evidence |
| One set times out, others return evidence? | Continue with disclosure and no absence inference (recommended); stop entire turn | Continue with disclosure |
| Fresh device has no local documents? | Search server immediately across all surfaces (recommended); ask for topic clarification first | Search server immediately |

**Notes:** All published sets remain the default search population under finite budgets; server storage/index discovery is for research, not a user-selected storage architecture. User chose “Chuyển tiếp” after four questions.

## Hình dạng request protocol

| Question | Options presented | User selection |
|---|---|---|
| Explicit requested set absent/unpublished? | Preserve restriction, never broaden (recommended); ask permission before broadening | Never broaden |
| SDLC project/CR has linked sets? | Still search all, links are context (recommended); use linked sets as default restriction | Still search all |
| Support old clients during upgrade? | Keep compatibility (recommended); upgrade together | Initially keep compatibility; superseded by correction below |
| New app meets old server? | Report upgrade required, preserve labeled local fallback (recommended); retry old protocol using local set IDs | Free text: “khong có client cũ, app cá nhân mà” |

**Final choice:** Personal app, no old clients. Upgrade together; no backward-compatibility branches, version negotiation or old-protocol fallback. Explicit set restriction remains a functional requirement. This correction supersedes the preceding compatibility selection.

**Recommendation presented, not a locked syntax decision:** Prefer extending `/api/v1/retrieve` with omitted restriction meaning all; exact schema/field representation left to researcher/planner. No need to add an endpoint if existing path suffices. User chose “Sang attribution”.

## Attribution set/snapshot

| Question | Options presented | User selection |
|---|---|---|
| Where to show attribution? | Tool result plus expandable source/tool details (recommended); inline summary each answer; tool result only | Expandable source details |
| Distinguish coverage states? | Evidence contributors, searched-empty, failures/timeouts, budget-skipped separately (recommended); list only contributors with generic warnings | Distinguish clearly |
| Citation without local document? | Show returned excerpt/section/set/snapshot, disclose absence, no import (recommended); only report local absence and leave evidence in other details | Show returned evidence |
| Conflicting evidence across sets? | Present both separately cited sources and unresolved conflict (recommended); list evidence without synthesis | Present both sources |

**Notes:** No always-visible snapshot badge. No automatic remote-document download/import. Existing policy already prohibits silent conflict resolution. User chose “Sang empty-set”.

## Empty-set outcome & 3 surfaces

| Question | Options presented | User selection |
|---|---|---|
| Canonical message? | Guide publish from a device with documents (recommended); guide checking server URL before publishing | Guide publish |
| Let model rewrite notice? | Application displays verbatim and tool receives structured status (recommended); allow model paraphrase | Display verbatim |
| Empty server, local documents exist? | Keep notice, use existing labeled local fallback (recommended); stop at notice | Use labeled local fallback |
| Empty server versus no matches versus unreachable? | Distinguish publish/query-refinement/unavailable remedies (recommended); one generic notice with detail elsewhere | Distinguish states |

**Canonical copy selected:**

> Knowledge Server chưa có bộ tài liệu nào được publish. Hãy publish ít nhất một bộ tài liệu từ thiết bị có tài liệu, rồi thử lại.

**Notes:** Identical notice on AI Chat, SDLC step chat and Telegram, without requiring querying device to own documents. User chose “Kết thúc nhóm”.

## Completion gate

Summary of all four groups presented. Options: “Ghi CONTEXT.md” (save decisions/log/session only, no app implementation) or “Bàn thêm vùng xám”. User selected “Ghi CONTEXT.md”.

## Implementation Discretion

No explicit “you decide” answer. Unlocked technical details remain researcher/planner responsibility: server discovery source, schema/default resolution, bounded response representation, exact budgets and existing-component integration. Prefer smallest sufficient change; no compatibility subsystem.

## Deferred Ideas

None. No new capability requested beyond Phase 28.
