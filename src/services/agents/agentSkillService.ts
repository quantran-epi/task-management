import { isTauriApp } from '../../utils/timerPopout';

export interface SkillItem {
  name: string;
  description: string;
  argumentHint?: string | null;
  source: 'builtin' | 'project' | 'user';
}

export const BUILTIN_SKILLS: SkillItem[] = [
  {
    name: 'help',
    description: 'Show available commands and usage guide',
    source: 'builtin',
  },
  {
    name: 'clear',
    description: 'Clear terminal log stream',
    source: 'builtin',
  },
  {
    name: 'compact',
    description: 'Compact session conversation context',
    source: 'builtin',
  },
  {
    name: 'cost',
    description: 'Display session token usage and estimated cost',
    source: 'builtin',
  },
  {
    name: 'review',
    description: 'Review current git diff and changes',
    argumentHint: '[--fix | --comment]',
    source: 'builtin',
  },
  {
    name: 'init',
    description: 'Initialize CLAUDE.md documentation for this repo',
    source: 'builtin',
  },
  {
    name: 'gsd-quick',
    description: 'Execute small, ad-hoc tasks with atomic commits',
    argumentHint: '<task description>',
    source: 'builtin',
  },
  {
    name: 'gsd-debug',
    description: 'Systematic debugging with persistent checkpoints',
    argumentHint: '<bug description>',
    source: 'builtin',
  },
  {
    name: 'gsd-execute-phase',
    description: 'Execute all plans in a phase with parallelization',
    argumentHint: '<phase number>',
    source: 'builtin',
  },
  {
    name: 'gsd-plan-phase',
    description: 'Create detailed phase plan with verification loop',
    argumentHint: '<phase number>',
    source: 'builtin',
  },
  {
    name: 'gsd-progress',
    description: 'Check progress, advance workflow, or dispatch intent',
    source: 'builtin',
  },
  {
    name: 'gsd-help',
    description: 'Show available GSD commands and usage guide',
    source: 'builtin',
  },
];

let cachedSkills: SkillItem[] | null = null;
let inflightPromise: Promise<SkillItem[]> | null = null;

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export async function loadAvailableSkills(repoPath?: string | null): Promise<SkillItem[]> {
  if (cachedSkills && cachedSkills.length > 0) {
    return cachedSkills;
  }

  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    if (!isTauriApp()) {
      cachedSkills = BUILTIN_SKILLS;
      return BUILTIN_SKILLS;
    }

    try {
      const skills = await tauriInvoke<SkillItem[]>('list_available_skills', {
        repoPath: repoPath || null,
      });
      if (Array.isArray(skills) && skills.length > 0) {
        cachedSkills = skills;
        return skills;
      }
    } catch (err) {
      console.warn('[SkillService] Failed to load skills via Tauri, fallback to built-in:', err);
    }

    cachedSkills = BUILTIN_SKILLS;
    return BUILTIN_SKILLS;
  })().finally(() => {
    inflightPromise = null;
  });

  return inflightPromise;
}

export function getCachedSkillsSync(): SkillItem[] {
  return cachedSkills || BUILTIN_SKILLS;
}

export function clearSkillsCache(): void {
  cachedSkills = null;
}
