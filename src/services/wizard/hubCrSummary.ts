import { z } from 'zod';
import {
  SdlcArtifactKindSchema,
  hashSchema,
  type SdlcWorkflowState,
} from './workflowSchemas';

/**
 * D-15: the structured CR summary is a TaskMate-internal view of the change. It is *not* the
 * GoLive-facing CAB text and must never be merged into it, so nothing here mentions an addressee,
 * a GoLive date, or an approval request.
 *
 * Derived state only: recomputed from workflow state on render. No Dexie table, no Note kind, no
 * new member of `SdlcArtifactKindSchema` — a persisted copy would duplicate evidence and drift out
 * of sync with the artifacts it summarises.
 */
export const HubCrSummarySchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('CR_SUMMARY'),
  scope: z.string().trim().min(1).max(4000),
  actualChanges: z.array(z.string().trim().min(1).max(2000)).max(200),
  keyDecisions: z.array(z.string().trim().min(1).max(2000)).max(200),
  risksRollback: z.strictObject({
    risks: z.array(z.string().trim().min(1).max(2000)).max(100),
    rollbackSummary: z.string().max(4000),
    rollbackVerified: z.boolean(),
  }),
  openGaps: z.array(z.string().trim().min(1).max(2000)).max(200),
  evidenceLinks: z.array(z.strictObject({
    kind: SdlcArtifactKindSchema,
    version: z.number().int().positive(),
    hash: hashSchema,
  })).max(20),
});
export type HubCrSummary = z.infer<typeof HubCrSummarySchema>;

const ARTIFACT_SLOT = [
  ['PL01', 'pl01'],
  ['PL02', 'pl02'],
  ['SOLUTION', 'solution'],
  ['CODE_GUIDE', 'codeGuide'],
  ['CHANGE_PACK', 'changePack'],
  ['PL03B', 'pl03b'],
  ['PL07', 'pl07'],
  ['CAB', 'cab'],
] as const;

/** Bullets under the first heading matching `headingMatch`. Anything else is not a claim we make. */
function sectionBullets(markdown: string | undefined, headingMatch: RegExp): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  let inSection = false;
  for (const line of markdown.split('\n')) {
    if (/^#{1,6}\s/.test(line)) {
      inSection = headingMatch.test(line);
      continue;
    }
    if (!inSection) continue;
    const match = /^\s*[-*]\s+(.+)$/.exec(line);
    const text = match?.[1]?.trim();
    if (text) out.push(text);
  }
  return out;
}

export function buildHubCrSummary(input: { state: SdlcWorkflowState }): HubCrSummary {
  const { state } = input;
  const { artifacts, metadata } = state;
  const driftResult = artifacts.driftResult;

  const solutionScope = sectionBullets(artifacts.solution?.content, /phạm vi|mục tiêu|scope/i).join(' ');
  const scope = [ `${metadata.cr} — ${metadata.featureName}`, `Đơn vị yêu cầu: ${metadata.requestingUnit}`, solutionScope ]
    .filter((line) => line.trim().length > 0)
    .join('\n');

  // D-15: implementation evidence only. SOLUTION content is a plan, never proof of what shipped.
  const actualChanges = sectionBullets(artifacts.pl03b?.content, /thực tế triển khai|implementation|thay đổi/i);
  const keyDecisions = sectionBullets(artifacts.solution?.content, /quyết định|decision/i)
    .map((text) => `Quyết định thiết kế: ${text}`);

  const rollback = driftResult?.dbChangesRollback.rollback;
  const rollbackVerified = rollback?.status === 'verified' && rollback.evidenceIds.length > 0;
  const risks = (driftResult?.drift ?? []).map(
    (tuple) => `Drift chưa xử lý: ${tuple.requirementId} (${tuple.category})`,
  );

  const openGaps: string[] = [];
  if (!artifacts.cab) openGaps.push('Thiếu bằng chứng: chưa có Tờ trình CAB đã duyệt');
  if (!artifacts.changePack) openGaps.push('Thiếu bằng chứng: chưa có Change Pack đã xác thực');
  if (!driftResult) openGaps.push('Thiếu bằng chứng: chưa có kết quả đối chiếu Change Pack');
  if (!artifacts.pl03b) openGaps.push('Thiếu bằng chứng: chưa có PL03B đã duyệt');
  if (!rollbackVerified) openGaps.push('Thiếu bằng chứng: rollback chưa được kiểm chứng');
  openGaps.push(...risks);

  const evidenceLinks = ARTIFACT_SLOT.flatMap(([kind, slot]) => {
    const ref = artifacts[slot];
    return ref ? [{ kind, version: ref.version, hash: ref.hash }] : [];
  });

  return HubCrSummarySchema.parse({
    schemaVersion: 1,
    kind: 'CR_SUMMARY',
    scope,
    actualChanges,
    keyDecisions,
    risksRollback: {
      risks,
      rollbackSummary: rollbackVerified
        ? `Rollback đã được kiểm chứng với ${rollback.evidenceIds.length} bằng chứng.`
        : 'Chưa kiểm chứng: chưa có bằng chứng rollback được xác thực.',
      rollbackVerified,
    },
    openGaps,
    evidenceLinks,
  });
}

/** In-app panel body. Deliberately TaskMate-internal: no addressee, no GoLive, no approval ask. */
export function renderHubCrSummaryMarkdown(summary: HubCrSummary): string {
  const list = (items: readonly string[], empty: string) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${empty}`;
  return [
    '# Tóm tắt CR nội bộ',
    '',
    '## Phạm vi & mục tiêu',
    summary.scope,
    '',
    '## Thay đổi thực tế',
    list(summary.actualChanges, 'Chưa có bằng chứng triển khai.'),
    '',
    '## Quyết định chính',
    list(summary.keyDecisions, 'Chưa ghi nhận quyết định thiết kế.'),
    '',
    '## Rủi ro & rollback',
    summary.risksRollback.rollbackVerified
      ? `Rollback: ${summary.risksRollback.rollbackSummary}`
      : `Rollback: Chưa kiểm chứng. ${summary.risksRollback.rollbackSummary}`,
    list(summary.risksRollback.risks, 'Không có drift chưa xử lý được ghi nhận.'),
    '',
    '## Khoảng trống bằng chứng',
    list(summary.openGaps, 'Không có khoảng trống được ghi nhận.'),
    '',
    '## Liên kết bằng chứng',
    list(summary.evidenceLinks.map((link) => `${link.kind} v${link.version} — ${link.hash}`), 'Chưa có artifact nào.'),
    '',
  ].join('\n');
}
