import { z } from 'zod';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSystem } from '../../db/repositories/systemRepo';
import { getSshConfigById, testSshConnection } from '../sshService';

// -------------------------------------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------------------------------------

export const ResearchFindingSchema = z.object({
  claim: z.string().min(1),
  scope: z.enum(['web', 'repo']),
  systemCode: z.string().optional(),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1).default(1),
});

export const SkippedSystemSchema = z.object({
  systemId: z.string().min(1),
  code: z.string().min(1),
  reason: z.string().min(1),
});

export const ResearchPayloadSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(ResearchFindingSchema),
  skippedSystems: z.array(SkippedSystemSchema).optional(),
  rawOutput: z.string().optional(),
});

export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;
export type SkippedSystem = z.infer<typeof SkippedSystemSchema>;
export type ResearchPayload = z.infer<typeof ResearchPayloadSchema>;

// -------------------------------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------------------------------

export type ResearchErrorCode =
  | 'RESEARCH_UNAVAILABLE'
  | 'RESEARCH_TIMEOUT'
  | 'RESEARCH_CANCELLED'
  | 'RESEARCH_SSH_ERROR';

export class ResearchRunError extends Error {
  readonly code: ResearchErrorCode;

  constructor(code: ResearchErrorCode, message: string) {
    super(message);
    this.name = 'ResearchRunError';
    this.code = code;
  }
}

// -------------------------------------------------------------------------------------------------
// Shell escaping (T-32-03)
// -------------------------------------------------------------------------------------------------

/**
 * Wrap `arg` in single quotes and escape embedded quotes as `'\''`, so shell
 * metacharacters stay literal. Used for both prompt text and remote repo paths.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// -------------------------------------------------------------------------------------------------
// Output parsing (T-32-05)
// -------------------------------------------------------------------------------------------------

/** Return the first balanced `{ ... }` substring, ignoring braces inside JSON strings. */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Recover a research payload from model output. Tries a fenced ```json block,
 * then the first balanced object, then the raw text. Never throws: unparseable
 * output degrades to inert `rawOutput` text rather than fabricated claims.
 */
export function parseResearchOutput(raw: string): ResearchPayload {
  const candidates: string[] = [];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const balanced = extractBalancedObject(raw);
  if (balanced) candidates.push(balanced);

  candidates.push(raw.trim());

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = ResearchPayloadSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // Not JSON — fall through to the next candidate.
    }
  }

  return { summary: raw.slice(0, 2000), findings: [], rawOutput: raw };
}

// -------------------------------------------------------------------------------------------------
// Availability pre-flight (SDLC-RES-05)
// -------------------------------------------------------------------------------------------------

export interface ResearchAvailability {
  systemId: string;
  code: string;
  available: boolean;
  reason?: 'NO_SSH_CONFIG' | 'UNREACHABLE';
}

/**
 * Report per-system research availability. Never throws for a single bad
 * target: a missing system, a missing SSH config, or an unreachable host is
 * recorded with an explicit reason instead of being silently dropped.
 */
export async function checkResearchAvailability(
  targetSystemIds: string[],
  db: TaskPlannerDatabase = defaultDb,
): Promise<ResearchAvailability[]> {
  const results: ResearchAvailability[] = [];

  for (const systemId of targetSystemIds) {
    let code = systemId;

    try {
      const system = await getSystem(systemId, db);
      if (!system) {
        results.push({ systemId, code, available: false, reason: 'NO_SSH_CONFIG' });
        continue;
      }

      code = system.code;

      if (!system.sshConfigId) {
        results.push({ systemId, code, available: false, reason: 'NO_SSH_CONFIG' });
        continue;
      }

      const config = await getSshConfigById(system.sshConfigId, db);
      if (!config) {
        results.push({ systemId, code, available: false, reason: 'NO_SSH_CONFIG' });
        continue;
      }

      await testSshConnection(config);
      results.push({ systemId, code, available: true });
    } catch {
      results.push({ systemId, code, available: false, reason: 'UNREACHABLE' });
    }
  }

  return results;
}
