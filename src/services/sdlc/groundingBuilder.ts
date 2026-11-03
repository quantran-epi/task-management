import type { WizardEvidence } from '../ai/wizardService';
import type {
  SdlcArtifactRef,
  SdlcStepId,
  SdlcWorkflowMetadata,
  SdlcWorkflowState,
} from '../wizard/workflowSchemas';

export type SdlcGroundingMarker =
  | 'CR_METADATA' | 'PL01' | 'PL02' | 'SOLUTION' | 'CHANGE_PACK'
  | 'ACCEPTANCE_CONTEXT' | 'IMPLEMENTATION_EVIDENCE' | 'TECH_DOCS' | 'PL03B' | 'PL07';

export const SDLC_STEP_GROUNDING_SOURCES: Record<SdlcStepId, readonly SdlcGroundingMarker[]> = {
  INTAKE: ['CR_METADATA', 'PL01', 'PL02'],
  SOLUTION: ['CR_METADATA', 'PL01', 'PL02', 'SOLUTION'],
  CODE_GUIDE: ['CR_METADATA', 'SOLUTION', 'PL02', 'ACCEPTANCE_CONTEXT'],
  CHANGE_PACK: ['CR_METADATA', 'SOLUTION', 'CHANGE_PACK', 'IMPLEMENTATION_EVIDENCE'],
  TECH_DOCS: ['CR_METADATA', 'SOLUTION', 'CHANGE_PACK', 'IMPLEMENTATION_EVIDENCE', 'TECH_DOCS', 'PL03B', 'PL07'],
  CAB: ['CR_METADATA', 'TECH_DOCS', 'IMPLEMENTATION_EVIDENCE', 'PL03B', 'PL07'],
};

export const GROUNDING_CHAR_BUDGET = 80_000;
export const SECTION_CHAR_BUDGET = 20_000;
export const EVIDENCE_ITEM_BUDGET = 20;
export const EVIDENCE_EXCERPT_BUDGET = 2_000;
export const MISSING_PREFIX = '[MISSING:';

/** Grounding text plus the set of markers a real workflow source backed. */
export interface SdlcGroundingResult {
  text: string;
  present: ReadonlySet<SdlcGroundingMarker>;
}

export interface SdlcGroundingInput {
  step: SdlcStepId;
  metadata?: SdlcWorkflowMetadata | undefined;
  crStatus?: 'active' | 'completed' | 'archived';
  artifacts: SdlcWorkflowState['artifacts'];
  activeVersions?: Record<string, number> | undefined;
  versions?: Record<string, SdlcArtifactRef[]> | undefined;
  evidence?: WizardEvidence | undefined;
  maxChars?: number;
}

type ArtifactKey = 'pl01' | 'pl02' | 'solution' | 'codeGuide' | 'changePack' | 'pl03b' | 'pl07';
const ARTIFACT_KEYS: Partial<Record<SdlcGroundingMarker, ArtifactKey>> = {
  PL01: 'pl01', PL02: 'pl02', SOLUTION: 'solution', CHANGE_PACK: 'changePack', PL03B: 'pl03b', PL07: 'pl07',
};

const trim = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function resolveArtifact(
  ref: SdlcArtifactRef | undefined,
  marker: SdlcGroundingMarker,
  activeVersions: Record<string, number> | undefined,
  versions: Record<string, SdlcArtifactRef[]> | undefined,
): { version: number; content: string } {
  const version = activeVersions?.[marker] ?? ref?.version ?? 1;
  const exact = versions?.[marker]?.find((candidate) => candidate.version === version);
  return { version, content: trim(exact?.content) || trim(ref?.content) };
}

function artifactBody(ref: SdlcArtifactRef | undefined, version: number, content: string): string {
  if (content) return content;
  if (!ref) return '';
  return `(chưa có nội dung trong bộ nhớ) · ${ref.title} · v${version} · hash ${ref.hash}`;
}

/**
 * One rendered grounding section plus whether a real source backed it. `present` is the only
 * trustworthy presence signal: `text` carries untrusted artifact/metadata bodies that may
 * themselves contain marker-shaped lines.
 */
interface GroundingSection {
  text: string;
  present: boolean;
}

function renderArtifact(
  marker: SdlcGroundingMarker,
  artifacts: SdlcWorkflowState['artifacts'],
  activeVersions: Record<string, number> | undefined,
  versions: Record<string, SdlcArtifactRef[]> | undefined,
): GroundingSection {
  const ref = ARTIFACT_KEYS[marker] ? artifacts[ARTIFACT_KEYS[marker]!] : undefined;
  const resolved = resolveArtifact(ref, marker, activeVersions, versions);
  const label = marker === 'SOLUTION' ? `[SOLUTION v${resolved.version}]` : `[${marker}]`;
  const body = ref
    ? artifactBody(ref, resolved.version, resolved.content)
    : `${MISSING_PREFIX} ${marker} — chưa có dữ liệu cho bước này]`;
  return {
    text: [label, ref ? `Nguồn: ${ref.title} · v${resolved.version} · hash ${ref.hash}` : '', neutralizeMarkers(body)]
      .filter(Boolean).join('\n'),
    present: Boolean(ref),
  };
}

function renderMetadata(metadata: SdlcWorkflowMetadata | undefined, status: SdlcGroundingInput['crStatus']): GroundingSection {
  const lines = ['[CR_METADATA]', 'Nguồn: CR metadata trong workflow'];
  if (!metadata) return { text: [...lines, 'Chưa có metadata CR trong bộ nhớ.'].join('\n'), present: false };
  const fields = [
    ['CR', metadata.cr],
    ['Tính năng', metadata.featureName],
    ['Đơn vị yêu cầu', metadata.requestingUnit],
    ['Tác giả', metadata.author],
    ['Ngày', metadata.date],
    ['Trạng thái CR', status],
  ];
  for (const [label, value] of fields) {
    if (trim(value)) lines.push(`${label}: ${neutralizeMarkers(trim(value))}`);
  }
  return { text: lines.join('\n'), present: Boolean(trim(metadata.cr)) };
}

function renderAcceptance(input: SdlcGroundingInput): GroundingSection {
  const ref = input.artifacts.pl02;
  if (!ref) return { text: `[ACCEPTANCE_CONTEXT]\n${MISSING_PREFIX} acceptance context — chưa có dữ liệu cho bước này]`, present: false };
  const resolved = resolveArtifact(ref, 'PL02', input.activeVersions, input.versions);
  return {
    text: ['[ACCEPTANCE_CONTEXT]', `Nguồn: PL02 · ${ref.title} · v${resolved.version}`, neutralizeMarkers(artifactBody(ref, resolved.version, resolved.content))].join('\n'),
    present: true,
  };
}

function renderTechDocs(input: SdlcGroundingInput): GroundingSection {
  const sources: Array<[string, ArtifactKey]> = [['CODE_GUIDE', 'codeGuide'], ['PL03B', 'pl03b'], ['PL07', 'pl07']];
  const entries = sources.flatMap(([marker, key]) => {
    const ref = input.artifacts[key];
    if (!ref) return [];
    const resolved = resolveArtifact(ref, marker as SdlcGroundingMarker, input.activeVersions, input.versions);
    return [`### ${ref.title} · v${resolved.version}`, neutralizeMarkers(artifactBody(ref, resolved.version, resolved.content))];
  });
  return entries.length
    ? { text: ['[TECH_DOCS]', 'Nguồn: code guide và tài liệu kỹ thuật đã có', ...entries].join('\n'), present: true }
    : { text: `[TECH_DOCS]\n${MISSING_PREFIX} prior technical documents — chưa có dữ liệu cho bước này]`, present: false };
}

function renderImplementationEvidence(input: SdlcGroundingInput): GroundingSection {
  const parts: string[] = [];
  const ref = input.artifacts.changePack;
  if (ref) {
    const resolved = resolveArtifact(ref, 'CHANGE_PACK', input.activeVersions, input.versions);
    parts.push(`### ${ref.title} · v${resolved.version}`, neutralizeMarkers(artifactBody(ref, resolved.version, resolved.content)));
  }
  if (input.artifacts.driftResult) parts.push('### Drift result', JSON.stringify(input.artifacts.driftResult));
  return parts.length
    ? { text: ['[IMPLEMENTATION_EVIDENCE]', 'Nguồn: change pack và kết quả đối soát trong workflow', ...parts].join('\n'), present: true }
    : { text: `[IMPLEMENTATION_EVIDENCE]\n${MISSING_PREFIX} implementation evidence — chưa có dữ liệu cho bước này]`, present: false };
}

function renderEvidence(evidence: WizardEvidence | undefined): { section?: string; limited: boolean } {
  if (!evidence?.items.length) return { limited: false };
  let limited = evidence.items.length > EVIDENCE_ITEM_BUDGET;
  const items = evidence.items.slice(0, EVIDENCE_ITEM_BUDGET).map((item) => {
    const excerpt = trim(item.excerpt);
    const clipped = excerpt.length > EVIDENCE_EXCERPT_BUDGET;
    limited ||= clipped;
    const body = clipped ? `${excerpt.slice(0, EVIDENCE_EXCERPT_BUDGET)}…[đã cắt bớt]` : excerpt;
    return `- [${trim(item.documentTitle) || item.documentId} · L${item.lineStart}-L${item.lineEnd}] ${neutralizeMarkers(body)}`;
  });
  return { section: ['[RETRIEVED_EVIDENCE]', 'Nguồn: WizardEvidence bounded retrieval', ...items].join('\n'), limited };
}

// Composer alone owns prompt delimiters, including when source text contains them.
function cleanSource(text: string): string {
  return text.replace(/\[(?:HẾT )?DỮ LIỆU NGỮ CẢNH[^\]\n]*(?:\]|$)/g, '(dấu phân cách ngữ cảnh đã loại bỏ)');
}

/**
 * Untrusted bodies (artifact content, metadata values, evidence excerpts) must never carry a
 * line that reads as a top-level source marker. The gate no longer trusts rendered text, but
 * neutralizing the line keeps a downstream reader from mistaking forged text for a source too.
 */
function neutralizeMarkers(text: string): string {
  return text.replace(/^(\s*)\[([A-Z][A-Z0-9_]*(?: v\d+)?)\]\s*$/gm, '$1(marker nguồn đã loại bỏ) [$2]');
}

function clampSection(section: string, budget = SECTION_CHAR_BUDGET): { value: string; limited: boolean } {
  if (section.length <= budget) return { value: section, limited: false };
  const markerEnd = section.indexOf('\n');
  const marker = section.slice(0, markerEnd);
  const suffix = '…[đã cắt bớt]';
  const room = Math.max(0, budget - marker.length - suffix.length - 2);
  return { value: `${marker}\n${section.slice(markerEnd + 1, markerEnd + 1 + room)}\n${suffix}`, limited: true };
}

function renderStatus(evidence: WizardEvidence | undefined, limited: boolean): string {
  let body = 'Chưa có bằng chứng truy xuất bổ sung cho bước này.';
  if (evidence?.coverage === 'EMPTY_SCOPE') body = 'Không có bộ tài liệu đã publish cho dự án này.';
  else if (evidence?.coverage === 'PARTIAL' || evidence?.degraded.length) {
    body = `Bằng chứng chưa đầy đủ (nguồn không khả dụng: ${evidence.degraded.join(', ') || 'không xác định'}).`;
  } else if (evidence?.items.length) body = 'Đã truy xuất bằng chứng bổ sung trong phạm vi cho phép.';
  if (limited) body += ' Đã giới hạn bằng chứng theo ngân sách; hãy truy vấn hẹp hơn.';
  return `[EVIDENCE_STATUS]\n${body}`;
}

function fitTotal(sections: string[], status: string, maxChars: number): string {
  const full = [...sections, status].join('\n\n');
  if (full.length <= maxChars) return full;
  const room = Math.max(0, maxChars - status.length - sections.length * 2);
  const share = Math.floor(room / sections.length);
  return [...sections.map((section) => clampSection(section, share).value), status].join('\n\n');
}

export function buildSdlcStepGroundingResult(input: SdlcGroundingInput): SdlcGroundingResult {
  const sections: string[] = [];
  const present = new Set<SdlcGroundingMarker>();
  let limited = false;
  for (const marker of SDLC_STEP_GROUNDING_SOURCES[input.step]) {
    const raw = marker === 'CR_METADATA' ? renderMetadata(input.metadata, input.crStatus)
      : marker === 'ACCEPTANCE_CONTEXT' ? renderAcceptance(input)
        : marker === 'TECH_DOCS' ? renderTechDocs(input)
          : marker === 'IMPLEMENTATION_EVIDENCE' ? renderImplementationEvidence(input)
            : renderArtifact(marker, input.artifacts, input.activeVersions, input.versions);
    if (raw.present) present.add(marker);
    const clamped = clampSection(cleanSource(raw.text));
    sections.push(clamped.value);
    limited ||= clamped.limited;
  }
  const evidence = renderEvidence(input.evidence);
  if (evidence.section) {
    const clamped = clampSection(cleanSource(evidence.section));
    sections.push(clamped.value);
    limited ||= evidence.limited || clamped.limited;
  }
  // Keep enough room for all source markers and the terminal status even for tiny caller budgets.
  const budget = Math.min(GROUNDING_CHAR_BUDGET, Math.max(2_048, Number.isFinite(input.maxChars) ? input.maxChars! : GROUNDING_CHAR_BUDGET));
  limited ||= [...sections, renderStatus(input.evidence, limited)].join('\n\n').length > budget;
  return { text: fitTotal(sections, renderStatus(input.evidence, limited), budget), present };
}

export function buildSdlcStepGrounding(input: SdlcGroundingInput): string {
  return buildSdlcStepGroundingResult(input).text;
}

/**
 * Membership in the builder's real marker set. Rendered text is never the source of truth: it
 * carries untrusted artifact and metadata bodies that can forge a `[MARKER]` line.
 */
export function hasGroundingSource(grounding: SdlcGroundingResult, marker: SdlcGroundingMarker): boolean {
  return grounding.present.has(marker);
}
