# Phase 9: Banking IT Domain Fields & Work Types - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 09-banking-it-domain-fields-work-types
**Areas discussed:** Tag input & suggestions, Inheritance & override behavior, Work type badges & defaults, Migration & v1 compatibility

---

## Tag Input & Suggestions

| Option | Description | Selected |
|--------|-------------|----------|
| Antd Select mode='tags' | Type freeform name and press Enter to create tags. Autocomplete dynamically suggests from existing DB tags. | ✓ |
| Predefined List in Settings | Predefine Ops Owner and BA lists in settings, strictly pick from predefined options. | |
| You decide | Claude decides optimal tag input mechanism. | |

**User's choice:** Antd Select mode='tags' (Recommended)
**Notes:** User emphasized preserving important technical keywords and brief explanations in Vietnamese.

| Option | Description | Selected |
|--------|-------------|----------|
| Trim + Case-insensitive dedupe | Trim whitespace, treat 'NamNV' and 'namnv' as identical tag. | ✓ |
| Trim only (Case-sensitive) | Trim only, preserve exact casing difference. | |
| You decide | Claude decides normalization rule. | |

**User's choice:** Trim + Case-insensitive dedupe (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Max 50 chars, max 10 tags | Limit to max 50 chars per tag, max 10 tags per field on a single record. | ✓ |
| No hard limit | Unlimited tags and character lengths. | |
| You decide | Claude decides tag limits. | |

**User's choice:** Max 50 chars, max 10 tags (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Compact max 2 + Tooltip | Show up to 2 tags, overflow badge '+N' with Tooltip/Popover on hover. | ✓ |
| Show all tags wrapped | Wrap all tags across multiple lines in table row. | |
| You decide | Claude decides compact display approach. | |

**User's choice:** Compact max 2 + Tooltip (Recommended)

---

## Inheritance & Override Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Nearest ancestor (Milestone -> Project) | Task checks Milestone first; if empty, checks Project; if standalone, empty. | ✓ |
| Project only | Only inherit directly from Project, ignoring Milestone. | |
| You decide | Claude decides resolution order. | |

**User's choice:** Nearest ancestor (Milestone -> Project) (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit replacement | Child tags completely replace parent tags; removing child tags restores inheritance. | ✓ |
| Additive (Merge child + parent) | Merge child tags with parent tags into a combined set. | |
| You decide | Claude decides override semantics. | |

**User's choice:** Explicit replacement (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Dashed/Ghost tag + origin tooltip | Inherited tags render with dashed border, ghost style, and origin tooltip. | ✓ |
| Identical look | Inherited and explicit tags look visually identical. | |
| You decide | Claude decides visual differentiation. | |

**User's choice:** Dashed/Ghost tag + origin tooltip (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Empty Select + Inherited Placeholder | Select remains empty with placeholder showing active inherited tags. Adding tags triggers override. | ✓ |
| Pre-populate values directly | Pre-fill inherited tags as actual field values in form. | |
| You decide | Claude decides form editing UX. | |

**User's choice:** Empty Select + Inherited Placeholder (Recommended)

---

## Work Type Badges & Defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Default to 'code' | New tasks automatically default to 'code'. | ✓ |
| Required selection (No default) | Force user to pick one of the types explicitly. | |
| Optional (Can be undefined) | workType is optional and can be left unset. | |

**User's choice:** Default to 'code' (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Semantics palette (5 types) | Colors: blue (code), green (doc), purple (meeting), orange (support_testing), red (investigate). | |
| Custom 7 types | User requested adding 2 more work types: 'configuration' and 'review_code'. | ✓ |

**User's choice:** add for me 2 more worktype: configuration and review code
**Notes:** Extended enum to 7 values: 'code', 'document', 'meeting', 'support_testing', 'investigate', 'configuration', 'review_code'.

| Option | Description | Selected |
|--------|-------------|----------|
| Accept 7 WorkTypes + Palette | Exact enum keys with 7 distinct color badges. | ✓ |
| Use shorter keys | Abbreviated enum keys ('config', 'review'). | |
| You decide | Claude decides enum names and palette. | |

**User's choice:** Accept 7 WorkTypes + Palette (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Icon + Text Tag | Render Ant Design Tag with both icon and text label. | ✓ |
| Text-only Tag | Text label only. | |
| You decide | Claude decides tag component style. | |

**User's choice:** Icon + Text Tag (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Compact Select in QuickAddBar | Dropdown in QuickAddBar defaulted to 'code' for quick classification. | ✓ |
| Default only, edit in Drawer | Keep QuickAddBar minimal, edit workType only in TaskDrawer. | |
| You decide | Claude decides QuickAddBar integration. | |

**User's choice:** Compact Select in QuickAddBar (Recommended)

---

## Migration & v1 Compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Empty arrays + workType='code' | Dexie upgrade backfills opsOwners: [], businessAnalysts: [], workType: 'code' on existing records. | ✓ |
| Leave undefined until edited | Leave new fields undefined on old records until user edits them. | |
| You decide | Claude decides migration backfill. | |

**User's choice:** Empty arrays + workType='code' (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-entry *tags + workType | Multi-entry indexes '*opsOwners, *businessAnalysts' across all 3 tables, 'workType' on tasks. | ✓ |
| Index workType only | Do not index tag arrays to save storage. | |
| You decide | Claude decides index configuration. | |

**User's choice:** Multi-entry *tags + workType (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-upgrade v1 to v2 on import | Accept schemaVersion 1, backfill default fields before inserting into Dexie. | ✓ |
| Reject v1 backups | Reject backups that are not schemaVersion 2. | |
| You decide | Claude decides backup compatibility flow. | |

**User's choice:** Auto-upgrade v1 to v2 on import (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Bump CURRENT_SCHEMA_VERSION to 2 | Increment schema version to 2 for all exported backups. | ✓ |
| Keep schemaVersion = 1 | Retain schemaVersion 1 in envelope. | |
| You decide | Claude decides export schema version. | |

**User's choice:** Bump CURRENT_SCHEMA_VERSION to 2 (Recommended)

---

## Claude's Discretion

- Visual styling details of dashed border for inherited tags (border style, opacity, icon badge).
- Sort order of tag suggestions in dropdown (alphabetical vs frequency-based).
- Ant Design icon selection for UI buttons and tag badges.

## Deferred Ideas

None — discussion stayed within phase scope.
