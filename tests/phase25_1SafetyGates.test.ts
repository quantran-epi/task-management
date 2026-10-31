import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSafeBackupSetting } from '../src/services/backup/exportBackup';
import { buildMergedSdlcInput, type SdlcSourceRef } from '../src/services/wizard/sourceMerge';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), 'utf8');

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const CLOSERS: Record<string, string> = { '(': ')', '{': '}', '[': ']' };

/** Balanced-delimiter scan that ignores delimiters inside string and template literals. */
function matchBalanced(source: string, start: number): number {
  const opener = source[start];
  const closer = opener ? CLOSERS[opener] : undefined;
  if (!closer) return -1;

  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const USE_EFFECT_MARKER = 'useEffect(() => {';

/**
 * Returns each `useEffect(() => { ... }, [deps])` call source (body plus dependency array),
 * located by brace matching so nested `if` blocks cannot truncate the match.
 */
export function extractUseEffectBodies(source: string): string[] {
  const effects: string[] = [];
  let index = source.indexOf(USE_EFFECT_MARKER);
  while (index !== -1) {
    const bodyStart = index + USE_EFFECT_MARKER.length - 1;
    const bodyEnd = matchBalanced(source, bodyStart);
    if (bodyEnd === -1) break;
    const callEnd = matchBalanced(source, index + 'useEffect'.length);
    if (callEnd === -1) break;
    effects.push(source.slice(index, callEnd + 1));
    index = source.indexOf(USE_EFFECT_MARKER, callEnd + 1);
  }
  return effects;
}

/** Sole D-09 gate: an `[open]`-dependent effect must never abort a request. */
export function findOpenEffectAborts(source: string): string[] {
  return extractUseEffectBodies(source).filter((effect) => {
    const deps = effect.match(/,\s*(\[[^\]]*\])\s*\)\s*$/)?.[1] ?? '';
    if (!/\bopen\b/.test(deps)) return false;
    if (!/!\s*open/.test(effect)) return false;
    return effect.includes('.abort(');
  });
}

/** Superseded regex, imported only as a subject under test — never as a pass/fail gate. */
const OLD_D09_REGEX = /if\s*\(\s*!open\s*\)\s*\{[^}]*abortControllerRef\.current\?\.abort\s*\(/;

/** Production shape that shipped before this plan: abort after the inner `if` closes. */
const REMOVED_SHAPE_FIXTURE = `
useEffect(() => {
  if (!open) {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current.resolve(false);
      pendingConfirmationRef.current = null;
      setPendingConfirmation(null);
    }
    abortControllerRef.current?.abort();
    currentTurnAbortRef.current?.abort();
  }
}, [open]);
`;

/** Abort nested inside the inner `if`, before the block closes. */
const NESTED_ABORT_FIXTURE = `
useEffect(() => {
  if (!open) {
    if (pendingConfirmationRef.current) {
      abortControllerRef.current?.abort();
    }
  }
}, [open]);
`;

function extractConsoleCallArgs(source: string): string[] {
  const argLists: string[] = [];
  const callPattern = /console\.(?:error|warn)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(source)) !== null) {
    const open = match.index + match[0].length - 1;
    const close = matchBalanced(source, open);
    if (close === -1) break;
    argLists.push(source.slice(open + 1, close));
    callPattern.lastIndex = close + 1;
  }
  return argLists;
}

function rawErrorConsoleArgs(source: string): string[] {
  return extractConsoleCallArgs(source)
    .map((args) => args.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, '""'))
    .filter((args) => /\b(?:err|groundedErr|compErr)\b/.test(args));
}

const phaseTestFiles = [
  'src/db/repositories/__tests__/chatTabRepo.test.ts',
  'tests/ai/AIChatDrawerTabs.test.tsx',
  'tests/ai/AIChatDrawerAbortCommit.test.tsx',
  'tests/ai/AIChatDrawerRetry.test.tsx',
  'tests/ai/AIChatDrawerCheckpoint.test.tsx',
  'tests/ai/sdlcPromptIsolation.test.ts',
  'src/components/ai/__tests__/ChatTabBar.test.tsx',
  'src/components/ai/wizard/__tests__/sdlcWorkflowHub.test.tsx',
  'src/components/ai/wizard/__tests__/stepInputDocsModal.test.tsx',
  'src/services/wizard/__tests__/workflowCoordinator.test.ts',
  'src/services/wizard/__tests__/stalenessDetector.test.ts',
  'tests/ai/wizardService.test.ts',
  'tests/backup/wizardBackup.test.ts',
  'tests/backup/tabCheckpointBackup.test.ts',
  'tests/services/backup/exportBackup.test.ts',
  'tests/services/backup/validateBackup.test.ts',
  'tests/services/backup/restoreBackup.test.ts',
  'tests/services/localSqlitePersistence.test.ts',
] as const;

const sourceFixture = (overrides: Partial<SdlcSourceRef>): SdlcSourceRef => ({
  id: '25000000-0000-4000-8000-000000000001',
  title: 'Nguồn mặc định',
  body: 'Kênh: Web',
  version: 1,
  hash: 'ab'.repeat(32),
  updatedAt: '2026-10-30T00:00:00.000Z',
  ...overrides,
});

describe('Phase 25.1 D-09 structural gate', () => {
  it('extracts every useEffect call by brace matching', () => {
    const drawer = stripComments(read('src/components/ai/AIChatDrawer.tsx'));
    const markerCount = drawer.split(USE_EFFECT_MARKER).length - 1;

    expect(markerCount).toBeGreaterThan(10);
    expect(extractUseEffectBodies(drawer)).toHaveLength(markerCount);
  });

  it('reports no [open]-dependent effect that aborts a request', () => {
    const drawer = stripComments(read('src/components/ai/AIChatDrawer.tsx'));

    expect(findOpenEffectAborts(drawer)).toEqual([]);
  });

  it('detects both drawer-close abort shapes, including one the superseded regex misses', () => {
    expect(findOpenEffectAborts(REMOVED_SHAPE_FIXTURE)).toHaveLength(1);
    expect(findOpenEffectAborts(NESTED_ABORT_FIXTURE)).toHaveLength(1);

    // Proof the fixture is stronger than the regex it replaced: the old pattern cannot
    // cross the inner `if` block that closes before the abort call.
    expect(OLD_D09_REGEX.test(REMOVED_SHAPE_FIXTURE)).toBe(false);
  });

  it('leaves unrelated effects alone', () => {
    const unmountOnly = `
useEffect(() => {
  return () => {
    abortControllerRef.current?.abort();
  };
}, []);
`;
    expect(findOpenEffectAborts(unmountOnly)).toEqual([]);
  });
});

describe('Phase 25.1 D-13 console gate', () => {
  it('never passes a raw error identifier to console.error/console.warn', () => {
    const drawer = stripComments(read('src/components/ai/AIChatDrawer.tsx'));

    expect(rawErrorConsoleArgs(drawer)).toEqual([]);
  });

  it('flags a raw error argument when one is present', () => {
    const fixture = "console.warn('[AIChatDrawer] boom:', err);";

    expect(rawErrorConsoleArgs(fixture)).toHaveLength(1);
  });
});

describe('Phase 25.1 static safety gates', () => {
  it('rejects abort commits, drawer-close aborts, and canonical tab/config localStorage state', () => {
    const drawer = stripComments(read('src/components/ai/AIChatDrawer.tsx'));

    expect(drawer).not.toContain('[Đã dừng]');
    expect(findOpenEffectAborts(drawer)).toEqual([]);
    expect(drawer).not.toMatch(/localStorage\.(?:getItem|setItem)\([^\n]*(?:chat_tabs|tab_analysis|analysis_modes)/i);

    const localStorageKeys = [...drawer.matchAll(/localStorage\.(?:getItem|setItem)\(\s*([A-Z0-9_]+)/g)].map(
      (match) => match[1]
    );
    expect(new Set(localStorageKeys)).toEqual(
      new Set(['AI_CHAT_WIDTH_KEY', 'AI_AUTO_APPROVE_MUTATIONS_KEY'])
    );
  });

  it('contains no hidden skip, todo, or fixme markers in targeted phase suites', () => {
    for (const file of phaseTestFiles) {
      const source = stripComments(read(file));
      expect(source, file).not.toMatch(/\b(?:it|test)\.todo\s*\(/);
      expect(source, file).not.toMatch(/\b(?:it|test|describe)\.skip\s*\(/);
      expect(source, file).not.toMatch(/\btest\.fixme\s*\(/);
    }
  });

  it('keeps source merge and backup boundaries closed to unsafe identifiers and fields', () => {
    const exportSource = stripComments(read('src/services/backup/exportBackup.ts'));
    const backupSchemas = stripComments(read('src/validation/backupSchemas.ts'));
    const sourceMerge = stripComments(read('src/services/wizard/sourceMerge.ts'));

    expect(exportSource).toContain('isSafeBackupSetting');
    expect(exportSource).toContain('projectSafeChatTab');
    expect(exportSource).toContain('chatTabs: chatTabs.map(projectSafeChatTab)');
    expect(exportSource).not.toMatch(/chatTabs\s*:\s*chatTabs\s*[,}]/);
    expect(sourceMerge).toContain('allowedSourceIds.has(citation.sourceId)');
    expect(sourceMerge).toContain('UNKNOWN_CITATION_SOURCE_ID');
    expect(sourceMerge).not.toMatch(/citationIds\s*:\s*\[[^\]]*unknown/i);

    expect(backupSchemas).toContain('partialBuffer');
    expect(backupSchemas).toContain('FORBIDDEN_BACKUP_KEYS');
    expect(backupSchemas).toMatch(/partialBuffer.*partial|partial.*partialBuffer/s);
    expect(exportSource).not.toMatch(/(?:partialResponse|errorResponse|rawDiagnostics)/);
    expect(backupSchemas).not.toMatch(/(?:partialResponse|errorResponse|rawDiagnostics)/);
    expect(backupSchemas).toMatch(/(?:api[_-]?key|passphrase|secret|token)/i);
    for (const unsafeKey of [
      'ninerouter_api_key',
      'github_token',
      'backup_passphrase',
      'knowledge_server_token',
      'custom_secret',
      'access_token',
    ]) {
      expect(isSafeBackupSetting(unsafeKey), unsafeKey).toBe(false);
    }
  });

  it('keeps normal and SDLC prompt isolation explicit without changing AI core modules', () => {
    const promptTest = stripComments(read('tests/ai/sdlcPromptIsolation.test.ts'));
    const drawer = stripComments(read('src/components/ai/AIChatDrawer.tsx'));

    expect(promptTest).toContain('buildSdlcWrapperPrompt');
    expect(promptTest).toContain('guarantees normal chat prompts contain no SDLC markers');
    expect(drawer).toContain('runGroundedTurn(');
    expect(drawer).toContain('runAiOrchestratorLoop({');
  });
});

describe('Phase 25.1 source merge invariant fixture (D-19)', () => {
  it('closes citations, reports conflicts, and leaves source Notes unchanged', async () => {
    const pl01 = sourceFixture({
      title: 'PL01 nghiệp vụ',
      body: 'Hạn mức: 500 triệu\nKênh: Web',
    });
    const pl02 = sourceFixture({
      id: '25000000-0000-4000-8000-000000000002',
      title: 'PL02 chức năng',
      body: 'Hạn mức: 300 triệu\nKênh: Mobile',
      hash: 'cd'.repeat(32),
    });
    const originals = structuredClone([pl01, pl02]);

    const merged = await buildMergedSdlcInput({
      pl01Text: '',
      pl02Text: '',
      pl01Sources: [pl01],
      pl02Sources: [pl02],
    });

    expect(new Set(merged.citations.map((citation) => citation.sourceId))).toEqual(
      new Set([pl01.id, pl02.id])
    );
    expect(merged.conflicts.map((conflict) => conflict.topic)).toEqual(
      expect.arrayContaining(['Hạn mức', 'Kênh'])
    );
    expect([pl01, pl02]).toEqual(originals);
  });
});
