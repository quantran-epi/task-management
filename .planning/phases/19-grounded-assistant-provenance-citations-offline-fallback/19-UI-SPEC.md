---
phase: 19
slug: grounded-assistant-provenance-citations-offline-fallback
status: draft
shadcn_initialized: false
preset: none
created: 2026-10-11
---

# Phase 19 — UI Design Contract

> Visual and interaction contract for the Grounded Assistant, Provenance Citations, and Offline Fallback phase. Extends the existing AI Chat Drawer (`src/components/ai/AIChatDrawer.tsx`), message list (`ChatMessageList.tsx`), bubble (`ChatMessageBubble.tsx`), citation chip (`CitationChip.tsx`), and `QuickPreviewDrawer.tsx` without introducing new design systems.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn not initialized; project uses Ant Design 6) |
| Preset | not applicable |
| Component library | Ant Design 6.6.5 (`antd`) via `ConfigProvider` in `src/App.tsx` |
| Icon library | `@ant-design/icons` 6.3.4 — import icons individually |
| Font | `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` (inherited from App theme token) |

Theme tokens inherited (do not re-declare per component):

- `colorPrimary: #4f46e5`
- `borderRadius: 8`
- `controlHeight: 36`
- Dark/light switched by `useThemeMode()` and `theme.darkAlgorithm` / `theme.defaultAlgorithm`

New Phase 19 UI must respect both algorithms. Never hard-code background hex values that collide with `darkAlgorithm`; use Ant Design semantic tokens (`colorBgContainer`, `colorBorderSecondary`, `colorFillTertiary`, `colorTextSecondary`) through `theme.useToken()`.

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline citation chip gap, badge-to-label gap, hop arrow spacing |
| sm | 8px | Grouped-citation inner gap, chip padding-y, path-card vertical rhythm |
| md | 16px | Default spacing between answer sections (Answer, Paths, Sources, Diagnostics), banner inner padding |
| lg | 24px | Chat Drawer outer card padding at ≥480px width, Sources table row grouping |
| xl | 32px | Section break between grounded answer card and following assistant turn |
| 2xl | 48px | not used in Phase 19 (reserved) |
| 3xl | 64px | not used in Phase 19 (reserved) |

Exceptions:

- Chat Drawer min width 320px: section padding collapses to 12px horizontal (one-off, documented) because Ant Design `Drawer` default `bodyPadding` is 24px; override via inline style when drawer width < 384px. Vertical rhythm remains 8/16.
- Citation chip height: 20px (fixed, inline with 14px body text). This matches existing `CitationChip` and is a typography-driven exception, not a spacing-scale value.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body (answer prose, path hop text, source metadata) | 14px | 400 | 1.5 (21px) |
| Label (citation chip label, badges `INFERRED` / `Local` / `OBSERVED` / `BUSINESS_APPROVED`, banner title) | 12px | 600 | 1.4 (17px) |
| Heading (section titles: "Trả lời", "Đường dẫn suy luận", "Nguồn", "Chẩn đoán") | 14px | 600 | 1.4 (20px) |
| Display (grounded answer card title inside Chat Drawer when outcome is `NO_EVIDENCE` / `UNSUPPORTED` / `NEEDS_CLARIFICATION`) | 16px | 600 | 1.3 (21px) |

Rules:

- Two weights only: 400 regular, 600 semibold. Ant Design `Tag` and `Badge` default to weight 500; Phase 19 overrides this via `ConfigProvider` token (`components.Tag.fontWeightStrong: 600`, applied to badges rendered through `Tag`) so chips/badges in the grounded answer card share the 600 label weight. No third narrative weight.
- Source quotes rendered in `<code>` or `<pre>` keep their monospace family and 13px size. Translated explanation above the quote uses 14px/400 body. Quote itself must never be rewritten (D-06).
- Technical identifiers inside prose (e.g. `PRC_PROCESS:60000006`, `CYTP1002`) use inline `<code>` at 13px with `colorFillTertiary` background and `borderRadius: 4`.

---

## Color

Driven by Ant Design semantic tokens so dark mode works without a second palette. Hex values below reflect the light-mode resolution of the current theme (`colorPrimary: #4f46e5`).

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `colorBgContainer` (`#ffffff` light / `#141414` dark) | Drawer body, answer card background, source list background |
| Secondary (30%) | `colorFillTertiary` (`#f5f5f5` light / `#262626` dark) | Path-card surface, Sources collapsible panel, Diagnostics panel, local-fallback banner surface |
| Accent (10%) | `colorPrimary` (`#4f46e5`) | Citation chip border/text, graph-path hop connector line, primary refinement chip hover ring |
| Destructive | `colorError` (`#ff4d4f` light / `#dc4446` dark) | Conflict banner border, conflict-branch header icon, snapshot-mismatch warning in `QuickPreviewDrawer` |

Semantic (non-accent, non-destructive) status colors — permitted because they encode meaning the user must read without hovering:

- `colorWarning` (`#faad14`) — `DEGRADED` retrieval banner, local BM25 fallback banner.
- `colorInfo` (`#1677ff`) — `NEEDS_CLARIFICATION` candidate chips surface and `INFERRED` badge border.
- `colorSuccess` (`#52c41a`) — `OBSERVED` classification badge, `BUSINESS_APPROVED` badge uses `colorPrimary` border + `colorSuccess` dot to distinguish.

Accent reserved for (explicit list — no other elements):

1. Server citation chip `[1]`, `[2]` text and border (existing `CitationChip` extended with compact numbering).
2. Graph-path hop connector line and primary-path indicator.
3. Primary refinement/candidate chip focus ring (keyboard focus only).
4. Hover state of a cited source entry inside the Sources collapsible table.

Local citations (`[L1]`, `[L2]`) must NOT use accent — they use `colorFillSecondary` background with `colorBorder` outline and a visible `Local` tag at 12px/600 (D-21). This visually separates server-authored provenance from local-only provenance without relying on color alone.

Classification badges never rely on color alone (D-12, D-16):

- `OBSERVED` — green dot + text `OBSERVED`.
- `INFERRED` — blue dashed border + text `INFERRED` + info icon.
- `BUSINESS_APPROVED` — primary solid border + text `BUSINESS_APPROVED` + check icon.
- Mixed-classification claim — show the weakest supporting classification badge at claim level (D-16) with tooltip listing per-hop classifications.

---

## Copywriting Contract

Primary user-facing copy is Vietnamese (project convention). Response body itself follows the user's query language (D-06); source quotes and identifiers remain verbatim regardless of UI language.

| Element | Copy |
|---------|------|
| Primary CTA (resend after clarification chip selected) | `Hỏi lại với lựa chọn này` |
| Secondary CTA (open cited section) | `Mở đoạn trích` |
| Expand graph paths | `Xem đường dẫn suy luận (N bước)` |
| Expand sources | `Xem N nguồn` |
| Expand diagnostics | `Chi tiết chẩn đoán truy xuất` |
| Empty state heading (no retrieval yet in a knowledge-intent session) | `Chưa có câu hỏi tri thức` |
| Empty state body | `Đặt câu hỏi về tài liệu đã xuất bản. Trả lời sẽ kèm trích dẫn chính xác tới đoạn nguồn.` |
| Outcome: `NO_EVIDENCE` heading | `Không tìm thấy bằng chứng` |
| Outcome: `NO_EVIDENCE` body | `Chưa có tài liệu đã xuất bản nào hỗ trợ câu hỏi này. Thử gợi ý thu hẹp bên dưới.` |
| Outcome: `UNSUPPORTED` heading | `Câu hỏi vượt phạm vi tri thức hiện có` |
| Outcome: `UNSUPPORTED` body | `Nội dung đã lập chỉ mục chưa đủ để trả lời. Không suy đoán từ kiến thức mô hình.` |
| Outcome: `NEEDS_CLARIFICATION` heading | `Cần xác định rõ đối tượng` |
| Outcome: `NEEDS_CLARIFICATION` body | `Có nhiều thực thể cùng số hiệu. Chọn một để tiếp tục.` |
| Error state: knowledge server auth failure | `Token máy chủ tri thức không hợp lệ. Mở Cài đặt để cập nhật.` |
| Error state: invalid server response | `Máy chủ tri thức trả về dữ liệu không hợp lệ. Không hợp nhất với kết quả cục bộ.` |
| Local fallback banner title | `Đang dùng tìm kiếm cục bộ (BM25)` |
| Local fallback banner body | `Máy chủ tri thức không khả dụng. Chỉ tìm từ khoá trên Markdown đã lập chỉ mục cục bộ. Không có đồ thị hoặc tìm kiếm ngữ nghĩa.` |
| Degraded banner title | `Kết quả thiếu một phần phương thức` |
| Degraded banner body | `{modalities} tạm thời không khả dụng. Trả lời dựa trên bằng chứng còn lại; phạm vi có thể chưa đầy đủ.` |
| Conflict banner | `Các nguồn mâu thuẫn ({dimension}). Vui lòng tự xác minh trước khi dùng.` |
| Snapshot mismatch warning (in `QuickPreviewDrawer`) | `Nội dung cục bộ khác với bản chụp đã trích dẫn. Hiển thị tài liệu hiện tại; không khẳng định giống bản gốc.` |
| `INFERRED` claim prefix (inline, before claim) | `Suy luận:` |
| Routing clarification prompt | `Bạn muốn:` + two chips: `Tra cứu tài liệu` / `Thao tác PlannerMate` |
| Destructive confirmation (none in this phase) | not applicable |

Numeric placeholders (`N`, `{modalities}`, `{dimension}`) are templated at render time. `{dimension}` resolves to one of `Version`, `Environment`, `Behavior`, `Unknown` exactly as returned by the retrieval contract (D-15). Never translate the classification token.

Refinement chip wording (max three per answer, D-07):

1. `Thu hẹp theo tiến trình 60000006`
2. `Thu hẹp theo kiểu chu kỳ (CYTP)`
3. `Thu hẹp theo môi trường`

Server-supplied refinement labels override these defaults when present; local-rule fallback uses the deterministic three above.

---

## Component Inventory (Phase 19)

New components to add under `src/components/ai/grounded/`:

- `GroundedAnswerCard.tsx` — top-level container; renders answer-first layout per D-05.
- `GroundedBanner.tsx` — one component rendering `local`, `degraded`, `conflict`, `snapshot-mismatch`, `auth-error`, `invalid-response` variants via a `variant` prop. Variants map to the semantic colors above.
- `ClaimBlock.tsx` — renders one claim with inline numbered citation chips, optional `INFERRED` badge, optional conflict grouping.
- `CitationGroup.tsx` — renders deduplicated `[1][2]` chip group inline; wraps the existing `CitationChip` with a numeric index and local/server variant.
- `GraphPathCard.tsx` — vertical step card list; one `HopRow` per hop with source → relation → target, classification badge, hop citation.
- `SourcesPanel.tsx` — collapsible Ant `Collapse` panel with a compact table: index, document, section, line range, classification, snapshot id (truncated with tooltip).
- `CandidateChipList.tsx` — renders `NEEDS_CLARIFICATION` candidate chips (name + kind tag, URN in tooltip) and refinement chips for `NO_EVIDENCE`/`UNSUPPORTED`.
- `IntentRoutingPrompt.tsx` — low-confidence routing prompt chips (D-09).
- `DiagnosticsPanel.tsx` — collapsible modality status, timings, truncation flags (D-17).

Extensions to existing components:

- `CitationChip.tsx` — add props `index: number`, `source: 'server' | 'local'`, `evidenceClass: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | 'LOCAL'`, `range: { startLine: number; endLine: number }`, `snapshotId?: string`. Keep existing keyboard activation. Server variant renders `[N]`; local variant renders `[LN]` with `Local` tag.
- `QuickPreviewDrawer.tsx` — accept new props `sectionAnchor?: string`, `lineRange?: { start: number; end: number }`, `citedSnapshotId?: string`. Scroll to range, highlight with `colorPrimaryBg` background 1600ms fade, show snapshot-mismatch `GroundedBanner` when current doc hash differs.
- `ChatMessageBubble.tsx` — detect assistant messages with structured grounded metadata and render `GroundedAnswerCard` instead of markdown prose. Fall back to existing markdown rendering for operational-intent responses.
- `ChatMessageList.tsx` — persist and rehydrate grounded metadata (claims, citations, paths, outcome, degraded modalities, local-fallback flag) alongside message text so reload preserves interactive provenance.

---

## Interaction Contracts

| Interaction | Trigger | Response |
|-------------|---------|----------|
| Click/Enter/Space on `[N]` server chip | Keyboard or pointer | Open `QuickPreviewDrawer` with doc UUID + section anchor + line range + cited snapshot id. Scroll + highlight target range for 1600ms. |
| Click/Enter/Space on `[LN]` local chip | Keyboard or pointer | Open `QuickPreviewDrawer` with doc UUID + current local range. No snapshot mismatch comparison (local is authoritative to itself). |
| Click candidate chip (`NEEDS_CLARIFICATION`) | Keyboard or pointer | Replace drawer input with resolved URN and auto-resend. Previous assistant turn remains visible as history. |
| Click refinement chip (`NO_EVIDENCE`/`UNSUPPORTED`) | Keyboard or pointer | Replace drawer input with suggested refinement text; do NOT auto-send. User presses Enter to send. |
| Expand graph paths | Click section header | `Collapse` opens primary path; alternative paths render collapsed with "Xem N đường thay thế" affordance. Conflicted paths have no primary (D-13). |
| Expand sources | Click section header | Deduplicated numbered list ordered by first in-text appearance. |
| Hover/focus citation chip | Keyboard focus or mouse hover | Tooltip shows document, section, line range, classification, snapshot id (truncated 7 chars). |
| Local fallback activation | Server disabled/absent/unreachable/timeout | Automatic — no user resend required (D-18). Banner persists at answer level. |
| Local fallback inhibited | Auth error, config error, invalid response | Show error banner with repair CTA pointing to Settings; do NOT silently fall back (D-20). |
| Snapshot mismatch in preview | Current doc hash ≠ cited snapshot hash | Red destructive banner at top of `QuickPreviewDrawer`. Document still renders at current state; copy makes mismatch explicit. |

---

## State Matrix

Grounded answer card must render one of these outcome states:

- `READY` — answer prose with inline citations, optional paths, optional conflict banner, Sources, Diagnostics.
- `READY_DEGRADED` — `READY` plus warning banner naming unavailable modalities.
- `READY_WITH_CONFLICT` — `READY` prose for non-conflicting portion, destructive conflict banner for conflicted portion, per-branch presentation under conflict (no primary conclusion).
- `NEEDS_CLARIFICATION` — info-colored card, candidate chips, no answer prose.
- `NO_EVIDENCE` — neutral card, outcome copy, up to 3 refinement chips.
- `UNSUPPORTED` — neutral card, outcome copy, up to 3 refinement chips.
- `LOCAL_FALLBACK_SYNTHESIS` — warning banner, prose synthesized from bounded BM25 snippets, `[LN]` citations only, no paths, no conflict resolution (D-19).
- `LOCAL_FALLBACK_RESULTS` — warning banner, ranked local search result list instead of prose (triggered when snippet evidence is weak).
- `ERROR_AUTH` / `ERROR_CONFIG` / `ERROR_INVALID_RESPONSE` — destructive-colored banner with repair action, no synthesis.

Empty state (no messages yet in a knowledge-intent conversation) uses existing drawer empty slot; add a small `InfoCircleOutlined` + the Phase 19 empty state heading/body copy.

---

## Accessibility

- All chips, badges, banners carry a visible text label — never color-only (D-12). Icons supplement, not replace.
- All interactive citation/candidate/refinement chips expose `role="button"`, `tabIndex={0}`, Enter/Space activation (pattern from existing `CitationChip`).
- Classification badges carry `aria-label` with the full classification name even when visual label uses the short form.
- Snapshot-mismatch banner uses `role="alert"` so screen readers announce it when preview opens.
- Conflict banner uses `role="alert"` and is read before conflict branches.
- `QuickPreviewDrawer` scroll-to-range action also sets focus to the highlighted section via `tabIndex={-1}` + `.focus({ preventScroll: true })` so keyboard users land at the cited location.
- Minimum touch target 32px for chip tap zones (padding, not font size); keep inline height 20px for text flow but inflate hit area via `::before` pseudo-element where needed.
- Respect `prefers-reduced-motion` — disable the 1600ms highlight fade; show static highlight for 2000ms then clear.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required (shadcn not initialized) |
| third-party | none | not applicable |

No third-party component registries declared for Phase 19. All UI uses Ant Design 6 components already in `package.json` plus new local components under `src/components/ai/grounded/`.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
