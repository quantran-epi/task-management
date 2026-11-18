---
phase: 32-external-research-via-claude-code-headless
plan: "02"
subsystem: ai-tools, wizard-artifacts
tags: [research, artifacts, ai-tools, dexie, zod]
dependency_graph:
  requires:
    - 32-01 (execRemoteCommandStream + SSH stream event types)
  provides:
    - RESEARCH artifact kind in SdlcArtifactMetadataSchema
    - saveResearchArtifact / loadLatestResearchArtifact / loadAllResearchArtifacts
    - propose_research AI tool + proposeResearch resolver
  affects:
    - 32-05 (prompt composer allowlist + policy line)
    - 32-06 (proposal card consumes ResearchProposalResult)
tech_stack:
  added: []
  patterns:
    - Zod discriminated union extension for artifact kinds
    - CR-scoped artifact lookup without thread id (SDLC-RES-06)
    - Untrusted model output re-resolved against db.systems AND cr.targets
key_files:
  created:
    - src/services/wizard/__tests__/artifactRepo.test.ts
    - tests/services/ai/researchProposal.test.ts
  modified:
    - src/services/ai/wizardSchemas.ts
    - src/services/wizard/artifactRepo.ts
    - src/services/ai/aiTools.ts
    - src/services/ai/sdlcArtifactTools.ts
    - src/services/ai/chatTurnTools.ts
    - tests/ai/aiTools.test.ts
    - tests/ai/sdlcPromptIsolation.test.ts
decisions:
  - Research payload rides in exportPayload; artifactBody already serializes { markdown, exportPayload }
  - Research lookups are CR-scoped only (no thread id) so every SDLC step of the same CR reuses them
  - propose_research drops questions with unknown or out-of-scope systemId entirely rather than stripping the id
metrics:
  duration: ~20m
  completed: 2026-11-08
---

# Phase 32 Plan 02: RESEARCH Artifact Kind and propose_research Tool Summary

Versioned `RESEARCH` artifacts in `db.notes` plus a `propose_research` AI tool that is reachable through `executeAiTool` and resolves every model-supplied system id against both the System Catalog and the CR's targets.

## What Was Built

**Task 1 — RESEARCH artifact kind and persistence helpers** (`cc1b6b8a`)

- `wizardSchemas.ts`: `RESEARCH` added to `artifactBase.kind` enum and to `SdlcArtifactMetadataSchema` as `z.strictObject({ ...artifactBase, kind: z.literal('RESEARCH') })`.
- `artifactRepo.ts`: `ArtifactCommitInput` exported, `commitArtifact` kind parameter widened to `SdlcArtifactMetadata['kind']`, plus `SaveResearchArtifactInput`, `ResearchArtifactVersion`, `saveResearchArtifact`, `loadLatestResearchArtifact`, `loadAllResearchArtifacts`.
- Lookups filter on `note.entityType === 'cr'` and `sdlcArtifact.changeRequestId` only — no thread id, because step views hold the CR id alone (SDLC-RES-06).
- `src/services/wizard/__tests__/artifactRepo.test.ts`: 4 tests — v1 commit, version increment + latest payload, ascending version list, null for a CR with no research.

**Task 2 — propose_research tool, dispatch, and scope resolution** (`b531e576`, `e2a2ce6e`)

- `aiTools.ts`: `propose_research` tool definition (`questions[]` with optional `systemId`, plus `rationale`; `required: ['questions']`) and `case 'propose_research':` added to the `get_artifact` / `patch_artifact_section` / `propose_subsystems` dispatch group.
- `sdlcArtifactTools.ts`: `ResearchProposalQuestion`, `ResearchProposalResult`, added to `ArtifactToolResult` union, `proposeResearch` resolver branching next to `propose_subsystems`.
- `proposeResearch` loads `db.changeRequests.get(context.crId)`, builds the allowed set from `cr.targets`, drops any question whose `systemId` is unknown or outside that set, takes `systemCode` from the catalog, and reports targets without `sshConfigId` in `unavailableSystemIds`.
- `chatTurnTools.ts`: `propose_research` added to the host-gated name array.
- Regression suites updated: `tests/ai/aiTools.test.ts` count 74 → 75; `tests/ai/sdlcPromptIsolation.test.ts` excluded-name array.
- `tests/services/ai/researchProposal.test.ts`: registration, host gating, dispatch through `executeAiTool`, no-mutation, spoofed-code/unknown/out-of-scope dropping, unavailable systems, and `ARTIFACT_SCOPE_REQUIRED` refusal.

## Verification

| Command | Result |
|---------|--------|
| `npx vitest run src/services/wizard/__tests__/artifactRepo.test.ts` | 4 passed |
| `npx vitest run tests/services/ai/researchProposal.test.ts tests/ai/aiTools.test.ts tests/ai/sdlcPromptIsolation.test.ts` | 74 passed (3 files) |
| `npx tsc --noEmit` | exit 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dispatch test did not satisfy the plan's acceptance grep**
- **Found during:** Task 2 acceptance check
- **Issue:** `tests/services/ai/researchProposal.test.ts` asserted dispatch correctly but the multi-line `executeAiTool(\n 'propose_research',` form did not match the required `executeAiTool('propose_research'` substring.
- **Fix:** Inlined the first arguments onto the call line.
- **Files modified:** `tests/services/ai/researchProposal.test.ts`
- **Commit:** `e2a2ce6e`

**2. [Rule 1 - Bug] `saveResearchArtifact` was not declared `async`**
- **Found during:** Task 2 acceptance check
- **Issue:** Plan requires the literal `export async function saveResearchArtifact`; it was written as a non-async function returning a promise.
- **Fix:** Made it `async` (behaviour unchanged, still returns `ArtifactCommitResult`).
- **Files modified:** `src/services/wizard/artifactRepo.ts`
- **Commit:** `e2a2ce6e`

No architectural changes, no auth gates, no package installs.

## Threat Mitigations Applied

| Threat | Mitigation as implemented |
|--------|---------------------------|
| T-32-10 (spoofing / scope creep) | `proposeResearch` re-resolves each `systemId` against `db.systems` and intersects with `cr.targets`; unknown or out-of-scope questions are dropped and never echoed back; `systemCode` comes only from the catalog. |
| T-32-13 (tampering) | `saveResearchArtifact` goes through `commitArtifact`, which validates with `SdlcArtifactMetadataSchema.parse` and `assertProjectThread` (non-CR thread → `WIZARD_THREAD_MISMATCH`). |
| T-32-SC (supply chain) | No new npm dependencies. |

## Known Stubs

None.

## Notes for Downstream Plans

- `propose_research` is not yet in `SDLC_STEP_ALLOWED_TOOLS` nor in the tool-policy text — plan 32-05 owns that wiring.
- `ResearchProposalResult` is the payload shape plan 32-06's proposal card should parse.
- `loadLatestResearchArtifact` / `loadAllResearchArtifacts` are CR-scoped by design; do not add a thread-id parameter.

## Self-Check: PASSED

- `src/services/ai/wizardSchemas.ts` — contains `kind: z.literal('RESEARCH')`
- `src/services/wizard/artifactRepo.ts` — exports `ArtifactCommitInput`, `ResearchArtifactVersion`, `saveResearchArtifact`, `loadLatestResearchArtifact`, `loadAllResearchArtifacts`; contains `note.entityType === 'cr'`
- `src/services/wizard/__tests__/artifactRepo.test.ts` — exists, exits 0
- `src/services/ai/aiTools.ts` — contains `name: 'propose_research'` and `case 'propose_research':`
- `src/services/ai/sdlcArtifactTools.ts` — exports `ResearchProposalResult`, contains `if (toolName === 'propose_research')` and `changeRequests.get(context.crId)`
- `src/services/ai/chatTurnTools.ts` — contains `'propose_research'`
- `tests/ai/aiTools.test.ts` — contains `toBe(75)`
- `tests/ai/sdlcPromptIsolation.test.ts` — contains `'propose_research'`
- `tests/services/ai/researchProposal.test.ts` — exists, contains `executeAiTool('propose_research'`
- Commits `cc1b6b8a`, `b531e576`, `e2a2ce6e` present in `git log`
