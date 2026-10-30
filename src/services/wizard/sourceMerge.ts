import { z } from 'zod';
import { hashSchema, uuidSchema } from './workflowSchemas';

export const SdlcSourceRefSchema = z.strictObject({
  id: uuidSchema,
  title: z.string().min(1).max(200),
  body: z.string().optional(),
  version: z.number().int().positive().default(1),
  hash: hashSchema,
  updatedAt: z.string(),
});
export type SdlcSourceRef = z.infer<typeof SdlcSourceRefSchema>;

export const SdlcCitationSchema = z.strictObject({
  id: z.string().min(1),
  sourceId: uuidSchema,
  section: z.string().min(1),
});
export type SdlcCitation = z.infer<typeof SdlcCitationSchema>;

export const SdlcSourceConflictSchema = z.strictObject({
  topic: z.string().min(1),
  sources: z.array(
    z.strictObject({
      sourceId: z.string(),
      title: z.string(),
      value: z.string(),
    })
  ),
  warning: z.string().min(1),
});
export type SdlcSourceConflict = z.infer<typeof SdlcSourceConflictSchema>;

export const MergedSdlcInputSchema = z.strictObject({
  pl01Text: z.string(),
  pl01Sources: z.array(SdlcSourceRefSchema),
  pl02Text: z.string(),
  pl02Sources: z.array(SdlcSourceRefSchema),
  mergedContent: z.string(),
  citations: z.array(SdlcCitationSchema),
  conflicts: z.array(SdlcSourceConflictSchema),
  evidenceIds: z.array(z.string()).default([]),
});
export type MergedSdlcInput = z.infer<typeof MergedSdlcInputSchema>;

export interface BuildMergedSdlcInputOptions {
  pl01Text: string;
  pl02Text: string;
  pl01Sources: SdlcSourceRef[];
  pl02Sources: SdlcSourceRef[];
}

export function parseMergedSdlcInput(input: unknown): MergedSdlcInput {
  return MergedSdlcInputSchema.parse(input);
}

export async function buildMergedSdlcInput(
  options: BuildMergedSdlcInputOptions
): Promise<MergedSdlcInput> {
  const pl01Sources = options.pl01Sources.map((s) => SdlcSourceRefSchema.parse(s));
  const pl02Sources = options.pl02Sources.map((s) => SdlcSourceRefSchema.parse(s));
  const allSources = [...pl01Sources, ...pl02Sources];

  const allowedSourceIds = new Set(allSources.map((s) => s.id));

  // Build section-level citations that close ONLY over supplied source IDs
  const citations: SdlcCitation[] = [];

  pl01Sources.forEach((source, idx) => {
    citations.push({
      id: `cit-pl01-${source.id.slice(0, 8)}-${idx + 1}`,
      sourceId: source.id,
      section: `PL01:${source.title}`,
    });
  });

  pl02Sources.forEach((source, idx) => {
    citations.push({
      id: `cit-pl02-${source.id.slice(0, 8)}-${idx + 1}`,
      sourceId: source.id,
      section: `PL02:${source.title}`,
    });
  });

  // Verify citation closure: reject any unknown source ID
  for (const citation of citations) {
    if (!allowedSourceIds.has(citation.sourceId)) {
      throw new Error(`UNKNOWN_CITATION_SOURCE_ID: ${citation.sourceId}`);
    }
  }

  // Conflict detection across sources:
  // Extract key-value patterns (e.g. "Hạn mức chuyển tiền: 500 triệu.")
  const extractedFacts = new Map<string, Array<{ sourceId: string; title: string; rawKey: string; value: string }>>();

  for (const source of allSources) {
    const text = source.body ?? '';
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([^\n:：#*-]+?)[:：]\s*(.+)$/);
      if (match && match[1] && match[2]) {
        const rawKey = match[1].trim();
        const normKey = rawKey.toLowerCase();
        const value = match[2].trim();
        if (normKey.length >= 3 && value.length > 0) {
          const list = extractedFacts.get(normKey) ?? [];
          list.push({ sourceId: source.id, title: source.title, rawKey, value });
          extractedFacts.set(normKey, list);
        }
      }
    }
  }

  const conflicts: SdlcSourceConflict[] = [];

  for (const [, entries] of extractedFacts.entries()) {
    if (entries.length > 1) {
      const distinctValues = new Set(entries.map((e) => e.value.toLowerCase().replace(/\s+/g, ' ')));
      if (distinctValues.size > 1) {
        const primary = entries[0]!;
        conflicts.push({
          topic: primary.rawKey,
          sources: entries.map((e) => ({
            sourceId: e.sourceId,
            title: e.title,
            value: e.value,
          })),
          warning: `Phát hiện mâu thuẫn giữa các tài liệu nguồn cho: ${primary.rawKey}`,
        });
      }
    }
  }

  // Construct mergedContent
  const sections: string[] = [];
  if (options.pl01Text.trim()) {
    sections.push(`## PL01 — Yêu cầu nghiệp vụ (Ghi chú tự do)\n\n${options.pl01Text.trim()}`);
  }
  pl01Sources.forEach((s) => {
    sections.push(`## PL01 Nguồn — ${s.title} (v${s.version})\n\n${s.body ?? ''}`);
  });
  if (options.pl02Text.trim()) {
    sections.push(`## PL02 — Đặc tả chức năng (Ghi chú tự do)\n\n${options.pl02Text.trim()}`);
  }
  pl02Sources.forEach((s) => {
    sections.push(`## PL02 Nguồn — ${s.title} (v${s.version})\n\n${s.body ?? ''}`);
  });

  const mergedContent = sections.join('\n\n---\n\n');
  const evidenceIds = citations.map((c) => c.id);

  return MergedSdlcInputSchema.parse({
    pl01Text: options.pl01Text,
    pl01Sources,
    pl02Text: options.pl02Text,
    pl02Sources,
    mergedContent,
    citations,
    conflicts,
    evidenceIds,
  });
}
