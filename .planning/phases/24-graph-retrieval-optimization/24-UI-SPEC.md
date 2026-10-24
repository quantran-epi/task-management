---
phase: 24
slug: graph-retrieval-optimization
status: approved
reviewed_at: 2026-10-24T00:00:00Z
shadcn_initialized: false
preset: none
created: 2026-10-24
---

# Phase 24 — UI Design Contract

> Visual and interaction contract for Graph Retrieval Optimization. Extends the existing AI Chat Drawer grounding surface (`GroundedAnswerCard`, `GroundedBanner`, `DiagnosticsPanel`, `CitationChip`) with `SEED_ONLY` rendering, a seed entity card with an explicit "find related" action, per-stage graph counts, and stable reason codes with plain-language Vietnamese explanations. No new design system, no new dependencies.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn not initialized; project uses Ant Design 6) |
| Preset | not applicable |
| Component library | Ant Design 6.6.5 (`antd`) via `ConfigProvider` in `src/App.tsx` |
| Icon library | `@ant-design/icons` 6.3.4 — import icons individually |
| Font | `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` (App theme token) |

Theme tokens inherited (never re-declare per component):

- `colorPrimary: #4f46e5`, `borderRadius: 8`, `controlHeight: 36`
- Dark/light via `useThemeMode()` + `theme.darkAlgorithm` / `theme.defaultAlgorithm`
- All Phase 24 surfaces use Ant Design semantic tokens through `theme.useToken()`. No hard-coded hex that collides with `darkAlgorithm`.

Source: `src/App.tsx:29-36`, `src/components/ai/grounded/*` (Phase 19 contract), `24-RESEARCH.md` Standard Stack (no new packages).

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Count badge gaps, entity-kind tag to name gap |
| sm | 8px | Entity card row rhythm, partial-seed list item spacing |
| md | 16px | Card body padding (matches existing `GroundedAnswerCard` `styles={{ body: { padding: 16 } }}`), section gap |
| lg | 24px | Gap between seed-only answer block and entity card |
| xl | 32px | Not used in Phase 24 (reserved) |
| 2xl | 48px | Not used in Phase 24 (reserved) |
| 3xl | 64px | Not used in Phase 24 (reserved) |

Exceptions:

- Chat Drawer minimum width 320px (`MIN_AI_CHAT_WIDTH`): horizontal padding collapses to 12px at drawer width < 384px, inherited Phase 19 exception. Vertical rhythm stays 8/16.
- Citation chip inline height stays 20px (Phase 19 typography-driven exception). Seed entity URN uses `<code>` inline height, not a spacing token.

Source: `src/components/ai/AIChatDrawer.tsx:94-96`, `19-UI-SPEC.md` Spacing Scale.

---

## Typography

Exactly four sizes, two weights (400 regular, 600 semibold):

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body (seed-only limited answer prose, entity metadata, reason explanation) | 14px | 400 | 1.5 (21px) |
| Label (counts line, kind tag, reason-code chip, per-stage status) | 12px | 600 | 1.4 (17px) |
| Heading (card section title "Trả lời", entity card name, diagnostics stage names) | 14px | 600 | 1.4 (20px) |
| Display (seed-only card title "Đã tìm thấy thực thể") | 16px | 600 | 1.3 (21px) |

Rules:

- Two weights only: 400 and 600. Ant Design `Tag` defaults to 500; Phase 24 badges/status chips inside these cards force `fontWeight: 600` so they match Phase 19.
- Entity URN (`MAIN1.EVT_EVENT`, `PRC_PROCESS:60000006`) renders in inline `<code>` at 12px monospace on `colorFillTertiary` with `borderRadius: 4`. Never truncate the URN; wrap.
- Canonical entity name (`canonicalName`) renders as text, React-escaped, never HTML. Vietnamese diacritics preserved exactly (ENTITY-FIDELITY-01).
- Reason codes render uppercase verbatim in `Label` role; their plain-language explanation uses `Body` role. Never translate or reformat the code token.

Source: `19-UI-SPEC.md` Typography, `23` canonicalName decision (STATE.md Decisions), `src/components/ai/grounded/GroundedAnswerCard.tsx:135-139`.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `colorBgContainer` (`#ffffff` light / `#141414` dark) | Seed-only card, entity card inner surface, diagnostics expandable body |
| Secondary (30%) | `colorFillTertiary` (`#f5f5f5` light / `#262626` dark) | Entity card surface when nested, URN code chip, diagnostics summary row, partial-seed notice surface |
| Accent (10%) | `colorPrimary` (`#4f46e5`) | `Tìm liên quan` primary button, entity kind tag border/text, inherited citation chips + hop connector |
| Destructive | `colorError` (`#ff4d4f` light / `#dc4446` dark) | `INVALID_GROUNDED_OUTPUT` / auth / config banners (inherited); `HOP_LIMIT_EXCEEDED` rejection reason chip only when a seed plan was rejected AND no fallback evidence exists |

Semantic status colors (meaning-carrying, not accent):

- `colorInfo` (`#1677ff`) — `SEED_ONLY` card border and `SEED_ONLY` status chip. Indicates "entity found, no relationship evidence" — explicitly not an error.
- `colorWarning` (`#faad14`) — fallback-active reason chip (`FALLBACK_ONE_HOP`), truncation chip (`RESULT_LIMIT_REACHED`), degraded banner (inherited).
- `colorSuccess` (`#52c41a`) — `OBSERVED` classification badge and successful per-stage `OK` chip (inherited).

Accent reserved for (explicit list — nothing else):

1. `Tìm liên quan` primary button (the only filled accent CTA on the seed-only card).
2. Entity kind tag (`DatabaseObject`, `SoftwareComponent`, …) border and text.
3. Server citation chips `[1]`, `[2]` and graph hop connector (inherited Phase 19; unchanged).
4. Keyboard focus ring on the entity card when it is focusable as a click target.

Not accent: count badges, reason-code chips, diagnostics status chips, entity card background, partial-seed notice. Those use semantic/secondary tokens so a user never reads "accent" as "recommended action."

`SEED_ONLY` must never use `colorError` or `colorWarning` — entity existence is a positive, non-degraded result (D-02, D-03).

Source: `19-UI-SPEC.md` Color, `src/components/ai/grounded/GroundedBanner.tsx`, `24-CONTEXT.md` D-02/D-03/D-14.

---

## Copywriting Contract

All UI copy is Vietnamese (project convention). Response body follows the user's query language; codes, URNs, identifiers stay verbatim.

| Element | Copy |
|---------|------|
| Primary CTA (seed-only entity card) | `Tìm liên quan` |
| Seed-only card title (Display) | `Đã tìm thấy thực thể` |
| Seed-only limited answer body | `Đã tìm thấy {canonicalName}, nhưng chưa tìm thấy bằng chứng về mối quan hệ của đối tượng này. Không suy đoán quan hệ khi chưa có bằng chứng.` |
| Counts line (always visible on seed-only card) | `Thực thể: {entityCount} · Cạnh: {edgeCount} · Đường dẫn: {pathCount}` |
| Entity card: kind label | `Loại: {kindLabel}` (`DatabaseObject` → `Đối tượng dữ liệu`, `SoftwareComponent` → `Thành phần phần mềm`, `ScheduledProcess` → `Tiến trình định kỳ`, `ContainerStep` → `Bước xử lý`, `CycleType` → `Kiểu chu kỳ`, `Status` → `Trạng thái`, `Document` → `Tài liệu`, unknown → the raw kind verbatim) |
| Entity card: URN label | `Định danh: {urn}` (monospace, wrapped) |
| Partial seed failure notice | `Không phân giải được {n} thực thể: {urn1}, {urn2}. Kết quả bên dưới chỉ từ các thực thể hợp lệ.` |
| Partial seed failure link | `Xem chi tiết chẩn đoán` (expands Diagnostics) |
| Diagnostics summary line (default collapsed) | `Đồ thị: {status} · {entityCount} thực thể · {edgeCount} cạnh · {pathCount} đường dẫn · {latencyMs}ms` |
| Diagnostics expanded stage rows | one row per stage: `Phân giải thực thể`, `Lập kế hoạch`, `Kiểm tra kế hoạch`, `Truy vấn Neo4j`, `Hợp nhất kết quả`, plus `Hiển thị` |
| Empty state heading (new knowledge-intent chat) | `Chưa có câu hỏi tri thức` |
| Empty state body | `Đặt câu hỏi về tài liệu đã xuất bản. Trả lời sẽ kèm nguồn trích dẫn và đường dẫn đồ thị khi có.` |
| Error state (graph stage unreachable, no fallback) | `Không kết nối được đồ thị tri thức. Hệ thống chỉ hiển thị bằng chứng văn bản cục bộ.` |
| Error state (invalid planner output after repair and fallback) | `Không tạo được kế hoạch truy vấn đồ thị hợp lệ. Đã dùng phạm vi liên hệ an toàn một bước.` |
| Destructive confirmation | not applicable — Phase 24 adds no destructive action |

### Reason code → plain-language explanation map (D-14)

Technical code shown first (Label, uppercase, monospace-ish tag), explanation shown second (Body). Both visible in the expanded diagnostics row. Never show a code without its explanation in the main card; diagnostics may show the code alone.

| Code | Vietnamese explanation |
|------|------------------------|
| `SEED_FOUND_NO_RELATION` | `Đã tìm thấy thực thể nhưng không có quan hệ nào khớp với câu hỏi.` |
| `INVALID_RELATION` | `Quan hệ được đề xuất không nằm trong bộ quan hệ cho phép.` |
| `INVALID_DIRECTION` | `Chiều quan hệ không hợp lệ với loại thực thể này.` |
| `INVALID_ENDPOINT_KIND` | `Loại thực thể đầu cuối không khớp với quan hệ.` |
| `HOP_LIMIT_EXCEEDED` | `Độ sâu truy vấn vượt giới hạn 3 bước. Đã dùng phạm vi an toàn.` |
| `SEED_NOT_FOUND` | `Không tìm thấy thực thể được nhắc đến trong bản chụp đã xuất bản.` |
| `PLAN_REJECTED` | `Kế hoạch truy vấn không hợp lệ và không sửa được. Đã dùng phạm vi an toàn một bước.` |
| `FALLBACK_ONE_HOP` | `Đang dùng phạm vi liên hệ an toàn một bước.` |
| `NO_GRAPH_SEED` | `Không xác định được thực thể nào từ câu hỏi để truy vấn đồ thị.` |
| `RESULT_LIMIT_REACHED` | `Kết quả đồ thị đã bị giới hạn theo số lượng tối đa.` |
| `PLANNER_SCHEMA_FAILURE` | `Bộ lập kế hoạch trả về định dạng không hợp lệ.` |
| `PINNED_SNAPSHOT_UNAVAILABLE` | `Không có bản chụp tri thức đang hoạt động.` |
| `TIMEOUT` | `Bước truy xuất vượt thời gian cho phép.` |
| `UNCONFIGURED` | `Máy chủ tri thức chưa được cấu hình.` |
| `PROVIDER_ERROR` | `Nhà cung cấp mô hình trả về lỗi.` |
| `MODEL_INDEX_MISMATCH` | `Chỉ mục tri thức không khớp với mô hình đang dùng.` |

Unknown or future code: render the raw code plus `Không có mô tả cho mã này.` Never echo free-text server strings into the UI; only enum codes render (D-20).

Source: `24-CONTEXT.md` D-03/D-04/D-13/D-14/D-19/D-20, `24-RESEARCH.md` Pattern 2 required codes, `19-UI-SPEC.md` copy.

---

## Component Inventory (Phase 24)

New under `src/components/ai/grounded/`:

- `SeedEntityCard.tsx` — renders one resolved seed entity for `SEED_ONLY`: canonical name (Heading), kind tag (accent border), URN code chip, classification/authority tag if server-sourced, counts line, and the `Tìm liên quan` primary button. Read-only otherwise. Multiple seeds render a vertical stack (gap 8px), max 5 cards (matches server seed bound).
- `PartialSeedNotice.tsx` — compact `colorFillTertiary` box listing unresolved/omitted seed URNs and their reason codes with the partial-failure copy; only rendered when D-13 applies.
- `StageDiagnosticsList.tsx` — expandable per-stage rows (entity resolution, planning, validation, Neo4j traversal, fusion, rendering) each showing status chip, latency, counts, accepted/rejected counts, reason codes, truncation and fallback flags. Content-free by construction (no query text, excerpts, URLs, tokens, Cypher).
- `ReasonCodeChip.tsx` — renders a stable enum code as a `Tag` with fixed enum→copy mapping and a `Tooltip` carrying the Vietnamese explanation. Unknown code falls back to raw code + generic explanation.

Extensions to existing components:

- `GroundedAnswerCard.tsx` — add a `case 'SEED_ONLY'` branch before the default branch: `colorInfo`-bordered card, Display title, limited-answer body, `PartialSeedNotice` when any seed failed, `SeedEntityCard` stack in `entitiesSlot`, `Path`/`Sources`/`Diagnostics` collapse entries reused unchanged. No conflict banner, no confidence tag (seed-only has no synthesized confidence).
- `DiagnosticsPanel.tsx` — add per-stage rows and separate `entity / edge / path` counts to the existing graph row; render `ReasonCodeChip` instead of raw reason strings. Keep the existing `Descriptions` layout and collapse behavior.
- `ChatMessageBubble.tsx` — pass the new `entitiesSlot` through to `GroundedAnswerCard`; `SEED_ONLY` must not be treated as abstention and must not strip entities.
- `src/services/ai/groundedAnswerSchemas.ts` — add `SEED_ONLY` to `GroundingOutcomeSchema` and optional backward-compatible `entities[]`, `graphCounts{entity,edge,path}`, `stageDiagnostics[]`, `failedSeeds[]`. Keep `schemaVersion: 1`; all new fields optional so historical messages still parse.
- `src/services/knowledge/retrievalProtocol.ts` — mirror the new outcome, counts, and reason codes in lockstep with `knowledge-server/src/types/retrievalProtocol.ts`.

Not built: graph canvas, manual graph editor, new charts, new modal, any third-party component.

Source: `24-CONTEXT.md` D-03/D-04/D-13/D-19, `24-RESEARCH.md` Code Examples + Open Questions 2/4, existing `src/components/ai/grounded/` inventory.

---

## Interaction Contracts

| Interaction | Trigger | Response |
|-------------|---------|----------|
| Activate `Tìm liên quan` | Click, Enter, or Space on the primary button | Append a NEW user turn with an explicit broader query built from the entity (`Tìm mọi quan hệ liên quan đến {canonicalName}`) and run a fresh grounded turn. The original message and its grounding stay immutable (D-04). Never silently broaden the original query. |
| `Tìm liên quan` while a turn is streaming | Click | Button disabled with `loading` state; no second request. One AbortController per turn (Phase 19 contract). |
| Expand diagnostics from partial-seed notice | Click `Xem chi tiết chẩn đoán` | Opens the existing Diagnostics collapse on the same message; no navigation, no new drawer. |
| Expand a diagnostics stage | Click stage row | Reveals status, latency, counts, accepted/rejected, reason chips, truncation/fallback flags. Collapsed by default (D-19). |
| Keyboard traversal of entity cards | Tab / Shift+Tab | Each `SeedEntityCard` is a single focus stop; the `Tìm liên quan` button is a nested focus stop. URN and kind tag are not separately focusable. |
| Citation chip inside a seed-only turn | Click / Enter / Space | Unchanged Phase 19 behavior — opens `QuickPreviewDrawer` at the cited range. Seed-only turns may have zero citations; the Sources entry then shows `Không có nguồn trích dẫn cho thực thể này.` |
| Partial seed result | Any seed unresolved or plan rejected | Valid seeds still render normally; `PartialSeedNotice` appears above the entity stack. Never blank the whole answer, never hide the failure (D-13). |
| `SEED_ONLY` outcome | Server returns outcome `SEED_ONLY` | Render limited answer + entity card. Do NOT trigger local BM25 fallback, do NOT ask for refinement, do NOT show "no evidence" copy (D-01/D-02, `groundedTurn` branch before `isGraphNonProductive`). |
| Diagnostics content boundary | Any expansion | Only enums, timings, counts, booleans, and bounded URNs. No raw query, no excerpts, no source text, no credentials, no URLs, no stack traces, no Cypher (D-20). |

---

## State Matrix (Phase 24 additions)

| Outcome | Card surface | Required elements |
|---------|--------------|-------------------|
| `SEED_ONLY` | `colorInfo` border, `colorBgContainer` | Display title, limited answer, counts line, 1–5 `SeedEntityCard`s, `Tìm liên quan` CTA, Sources + Diagnostics collapses |
| `SEED_ONLY` + partial seeds | same + `PartialSeedNotice` | Notice above entity stack, failed URNs + reason chips, link to diagnostics |
| `READY` / `DEGRADED` with graph evidence | inherited Phase 19 | Existing behavior; graph counts now add `entity/edge/path` breakdown in diagnostics |
| `READY` with all graph plans rejected and safe fallback used | inherited | Fallback reason chip `FALLBACK_ONE_HOP` visible in diagnostics; no error banner |
| Graph stage failed, no local fallback available | inherited error surfaces | Existing banner copy; reason code shown in diagnostics only |
| Historical message (pre-Phase-24 grounding) | inherited | Renders exactly as today; missing `entities`/`graphCounts`/`stageDiagnostics` means those sections are omitted, never an error |

`SEED_ONLY` is not a degraded state and must not inherit the degraded warning banner.

---

## Accessibility

- Every chip, badge, and status indicator carries visible text; color is never the only signal. `SEED_ONLY` info color is supplemented by the literal text `Đã tìm thấy thực thể` and the counts line.
- `Tìm liên quan` is a real `<button>` (Ant Design `Button`) with an accessible name; minimum touch target 32px (padding, not font size).
- `SeedEntityCard` exposes `aria-label` combining kind + canonical name + URN, e.g. `Đối tượng dữ liệu MAIN1.EVT_EVENT, định danh DatabaseObject:MAIN1.EVT_EVENT`.
- Reason-code chips use `aria-label="{CODE}: {explanation}"` so screen readers get the meaning, not just the token.
- `PartialSeedNotice` uses `role="status"` (non-blocking informational), not `role="alert"`; conflict/snapshot banners keep `role="alert"` from Phase 19.
- Counts line is read as one sentence, not five separate nodes: wrap in a single element with `aria-label`.
- Diagnostics expansion is keyboard-operable through Ant Design `Collapse`; focus returns to the stage header on collapse.
- Respect `prefers-reduced-motion`: no animation added in Phase 24; inherited highlight behavior unchanged.
- Contrast: semantic tokens from the active algorithm meet WCAG AA for body text; never place 12px `Label` text on `colorFillTertiary` without the token's text color.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required (shadcn not initialized) |
| third-party | none | not applicable |

No third-party registries or blocks. All UI uses Ant Design 6 components already in `package.json` plus new local components under `src/components/ai/grounded/`. No `npm install` for this phase (24-RESEARCH.md Package Legitimacy Audit).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
