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

describe('Phase 25.1 static safety gates', () => {
  it('rejects abort commits, drawer-close aborts, and canonical tab/config localStorage state', () => {
    const drawer = stripComments(read('src/components/ai/AIChatDrawer.tsx'));

    expect(drawer).not.toContain('[Đã dừng]');
    expect(drawer).not.toMatch(/if\s*\(\s*!open\s*\)\s*\{[^}]*abortControllerRef\.current\?\.abort\s*\(/);
    expect(drawer).not.toMatch(/if\s*\(\s*!open\s*\)\s*\{[^}]*currentTurnAbortRef\.current\?\.abort\s*\(/);
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
