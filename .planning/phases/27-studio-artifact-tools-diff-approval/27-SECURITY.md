---
phase: "27"
slug: "studio-artifact-tools-diff-approval"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-05"
---

# Phase 27 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Model → artifact tools | LLM-selected tool arguments enter `get_artifact` / `patch_artifact_section` | Client-supplied scope IDs, section IDs, headings, base hashes, proposed content |
| Tool result → transcript | Prepared patch proposals and refusal payloads return to the chat runtime | Draft Markdown diffs, refusal codes |
| Chat card → editor draft | Explicit user approval writes a proposal into the local SDLC draft | Patched Markdown, decision rows |
| Lookup query → error text | Tool arguments are interpolated into service lookup errors on refusal paths | Caller-provided identifiers only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-27-01 | Spoofing | ArtifactToolContext / dispatch | high | mitigate | Request-local trusted identity; reject missing/expired scope and model-selected CR; two-scope tests. Verified: `sdlcArtifactTools.ts:206` rejects missing scope, `:209` readOnly, `:215` inactive CR. | closed |
| T-27-02 | Tampering | prepareArtifactPatch | high | mitigate | Exact base hash and heading match before section resolution; immutable cached proposal; no tool writes. Verified: `:401` baseHash equality, `:414` heading equality, base re-read after await. | closed |
| T-27-03 | Denial of service | createUnifiedLineDiff | medium | mitigate | 120-line input/change cap, common-range trimming, preallocation cell budget, structured split guidance. Verified: `PATCH_LINE_CAP = 120`, `MAX_DIFF_CELLS = 1_000_000`, `DIFF_BUDGET_EXCEEDED` refusal. | closed |
| T-27-04 | Elevation of privilege | Runtime patch approval | high | mitigate | Analysis guard first; explicit patch approval before ordinary auto-approve branch; no resolver bypass. Verified: `chatTurnRuntime` analysis branch precedes patch handling (`:352-353`), refusal message at `:140`. | closed |
| T-27-05 | Tampering | ArtifactDiffApprovalCard | high | mitigate | React text-node diff rendering (no `dangerouslySetInnerHTML`); HTML-like-content test. | closed |
| T-27-06 | Repudiation | StepChatPanel decisions | medium | mitigate | Stable decision IDs (`crypto.randomUUID()` at `:261`), system transcript rows, dedupe on remount (`:260`). | closed |
| T-27-07 | Tampering | handleResolveArtifactApproval | high | mitigate | Scoped base-hash check, serialized clicks, transactional host adapter. Verified: `ProjectSdlcView.tsx:536-538` scope/epoch/role/project/CR identity gates before write. | closed |
| T-27-08 | Denial of service | Widget tool/card surfaces | medium | mitigate | Artifact detail cap, 240px diff scroll container with `overflowX/Y: auto` (`ArtifactDiffApprovalCard.tsx:51`), 160px activity bound. | closed |
| T-27-09 | Tampering | handleApplyArtifactPatch | high | mitigate | Live scope/access/base/version validation before and after await; manual edit epoch; exact cached Markdown only. Verified: `:536` epoch + live-ref check, `readArtifactSnapshot` before transaction. | closed |
| T-27-10 | Repudiation | Draft/decision transaction | high | mitigate | Atomic SOLUTION settings plus decision write in one Dexie transaction (`ProjectSdlcView.tsx:550`), no approved record on abort. | closed |
| T-27-11 | Tampering | Draft stale reporting | medium | mitigate | Pure `detectDraftHashDivergence` (read-only) and render-only union; committed reason wins in banner. | closed |
| T-27-12 | Tampering | StepChatPanel final extraction | high | mitigate | Extraction only for explicit full-generation artifact intent; patch/Q&A final text cannot write editor (`:247-260` handles only `patch_artifact_section` results). | closed |
| T-27-13 | Elevation of privilege | Composer/toolbox payload parity | high | mitigate | Host `availableToolNames` filter (`sdlcPromptComposer.ts:97-101`), explicit step/kind filter, hardcoded Analysis Mode patch omission (`chatTurnRuntime:352`). | closed |
| T-27-14 | Spoofing | Section targeting after prior patch | medium | mitigate | baseHash plus expected heading; stale-base and heading-drift refusals (`:401`, `:414`). | closed |
| T-27-15 | Elevation of privilege | validateArtifactToolAccess | high | mitigate | Both tool entry points re-check live readOnly/CR/scope before and after await; no model override path. | closed |
| T-27-16 | Spoofing | Prerequisite artifact presence | high | mitigate | Validated workflow references and non-empty content per step guard table (`:165-178`); 8 guard cases covered in `tests/services/ai/sdlcArtifactGuards.test.ts`. | closed |
| T-27-17 | Information disclosure | Refusal serialization | medium | mitigate | Stable actionable codes only (`refuse()` at `:125`); no stack, credentials, or other-CR Markdown in payloads. | closed |
| T-27-18 | Tampering | Normalized tool aliases | medium | mitigate | `normalizeDynamicToolNames` charset-validates (`sdlcPromptComposer.ts:77`); dispatch routes normalized names through the validated service; alias matrix test. | closed |
| T-27-SC | Tampering | npm/pip/cargo installs | high | mitigate | No installs in phase; `package.json` and `package-lock.json` unchanged since baseline `0cd17c90` (0 diff lines). | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 19 | 19 | 0 | orchestrator (ASVS L1 grep-depth, plan-authored register) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05
