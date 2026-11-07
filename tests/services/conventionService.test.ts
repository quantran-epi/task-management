import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  GLOBAL_CONVENTIONS_SETTING_KEY,
  CONVENTION_CANDIDATE_PATHS,
  type RepoConventionResult,
  getGlobalConventions,
  saveGlobalConventions,
  clearGlobalConventions,
  loadRepoConventions,
} from '../../src/services/conventionService';
import { isSafeBackupSetting } from '../../src/services/backup/exportBackup';
import * as sshService from '../../src/services/sshService';
import * as gitRemoteService from '../../src/services/gitRemoteService';
import * as timerPopout from '../../src/utils/timerPopout';
import type { SshConfig } from '../../src/types/ssh';
import type { ProjectRepoSshBinding } from '../../src/types/gitRemote';

describe('conventionService', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestConventionDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await testDb.delete();
    vi.restoreAllMocks();
  });

  it('exports GLOBAL_CONVENTIONS_SETTING_KEY as global_conventions', () => {
    expect(GLOBAL_CONVENTIONS_SETTING_KEY).toBe('global_conventions');
  });

  it('exports CONVENTION_CANDIDATE_PATHS with root, .github, and docs candidates in order', () => {
    expect(CONVENTION_CANDIDATE_PATHS).toEqual([
      'CONVENTIONS.md',
      '.github/CONVENTIONS.md',
      'docs/CONVENTIONS.md',
    ]);
  });

  it('returns empty string when setting does not exist in db.settings (empty state preserved)', async () => {
    const content = await getGlobalConventions(testDb);
    expect(content).toBe('');
  });

  it('saves and retrieves global conventions in db.settings', async () => {
    const sampleConventions = '# Tiêu chuẩn kỹ thuật\n\n- Tuân thủ RESTful API\n- Viết test Vitest';
    await saveGlobalConventions(sampleConventions, testDb);

    const storedRow = await testDb.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
    expect(storedRow).toBeDefined();
    expect(storedRow?.value).toBe(sampleConventions);

    const retrieved = await getGlobalConventions(testDb);
    expect(retrieved).toBe(sampleConventions);
  });

  it('clears global conventions from db.settings', async () => {
    await saveGlobalConventions('Nội dung tạm thời', testDb);
    expect(await getGlobalConventions(testDb)).toBe('Nội dung tạm thời');

    await clearGlobalConventions(testDb);
    expect(await getGlobalConventions(testDb)).toBe('');
    const row = await testDb.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
    expect(row).toBeUndefined();
  });

  it('isSafeBackupSetting returns true for global_conventions to ensure backup inclusion', () => {
    expect(isSafeBackupSetting(GLOBAL_CONVENTIONS_SETTING_KEY)).toBe(true);
  });

  describe('loadRepoConventions', () => {
    const sampleSshConfig: SshConfig = {
      id: 'ssh-cfg-1',
      name: 'Test Server',
      host: '192.168.1.10',
      port: 22,
      username: 'developer',
      authMethod: 'password',
    };

    const sampleBinding: ProjectRepoSshBinding = {
      sshConfigId: 'ssh-cfg-1',
      remoteRepoPath: '/var/repos/task-management',
      updatedAt: '2026-11-07T00:00:00.000Z',
    };

    it('returns null immediately when not running in Tauri desktop runtime', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(false);

      const result = await loadRepoConventions('project-1', testDb);
      expect(result).toBeNull();
    });

    it('returns null when project has no repository SSH binding', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(null);

      const result = await loadRepoConventions('project-1', testDb);
      expect(result).toBeNull();
    });

    it('returns null when binding is missing sshConfigId or remoteRepoPath', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
        sshConfigId: '',
        remoteRepoPath: '',
        updatedAt: '2026-11-07T00:00:00.000Z',
      });

      const result = await loadRepoConventions('project-1', testDb);
      expect(result).toBeNull();
    });

    it('returns null when SSH configuration is not found in database', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(sampleBinding);
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(null);

      const result = await loadRepoConventions('project-1', testDb);
      expect(result).toBeNull();
    });

    it('Case 1: discovers CONVENTIONS.md at root and loads full content', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(sampleBinding);
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(sampleSshConfig);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('keyring-secret-pass');

      const execRemoteCommandSpy = vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: 'CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });

      const readRemoteFileSpy = vi.spyOn(sshService, 'readRemoteFile').mockResolvedValue(
        '# Root Repository Conventions\n\n- All responses must use ResponseEnvelope<T>'
      );

      const result = await loadRepoConventions('project-1', testDb);

      expect(execRemoteCommandSpy).toHaveBeenCalledTimes(1);
      expect(readRemoteFileSpy).toHaveBeenCalledWith(
        sampleSshConfig,
        '/var/repos/task-management/CONVENTIONS.md',
        'keyring-secret-pass'
      );
      expect(result).toEqual<RepoConventionResult>({
        content: '# Root Repository Conventions\n\n- All responses must use ResponseEnvelope<T>',
        foundPath: 'CONVENTIONS.md',
        loadedAt: expect.any(String),
      });
    });

    it('Case 2: discovers fallback candidate .github/CONVENTIONS.md', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(sampleBinding);
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(sampleSshConfig);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue(null);

      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: '.github/CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });

      const readRemoteFileSpy = vi.spyOn(sshService, 'readRemoteFile').mockResolvedValue(
        '# GitHub Standards\n\n- PR required'
      );

      const result = await loadRepoConventions('project-1', testDb);

      expect(readRemoteFileSpy).toHaveBeenCalledWith(
        sampleSshConfig,
        '/var/repos/task-management/.github/CONVENTIONS.md',
        undefined
      );
      expect(result?.foundPath).toBe('.github/CONVENTIONS.md');
      expect(result?.content).toBe('# GitHub Standards\n\n- PR required');
    });

    it('Case 3: discovers fallback candidate docs/CONVENTIONS.md', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(sampleBinding);
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(sampleSshConfig);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue(null);

      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: 'docs/CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });

      const readRemoteFileSpy = vi.spyOn(sshService, 'readRemoteFile').mockResolvedValue(
        '# Docs Standards\n\n- OpenAPI schema required'
      );

      const result = await loadRepoConventions('project-1', testDb);

      expect(readRemoteFileSpy).toHaveBeenCalledWith(
        sampleSshConfig,
        '/var/repos/task-management/docs/CONVENTIONS.md',
        undefined
      );
      expect(result?.foundPath).toBe('docs/CONVENTIONS.md');
    });

    it('Case 4: returns null gracefully when none of the candidates exist (exitStatus !== 0)', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(sampleBinding);
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(sampleSshConfig);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue(null);

      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: '',
        stderr: '',
        exitStatus: 1,
      });

      const readRemoteFileSpy = vi.spyOn(sshService, 'readRemoteFile');

      const result = await loadRepoConventions('project-1', testDb);

      expect(result).toBeNull();
      expect(readRemoteFileSpy).not.toHaveBeenCalled();
    });

    it('Case 5: catches SSH network/timeout errors gracefully and returns null without throwing', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue(sampleBinding);
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(sampleSshConfig);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue(null);

      vi.spyOn(sshService, 'execRemoteCommand').mockRejectedValue(
        new Error('SSH connection timed out after 10000ms')
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await loadRepoConventions('project-1', testDb);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('handles trailing slashes on remoteRepoPath cleanly', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(gitRemoteService, 'getProjectRepoSshBinding').mockResolvedValue({
        ...sampleBinding,
        remoteRepoPath: '/var/repos/trailing-slash///',
      });
      vi.spyOn(sshService, 'getSshConfigById').mockResolvedValue(sampleSshConfig);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue(null);

      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: 'CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });

      const readRemoteFileSpy = vi.spyOn(sshService, 'readRemoteFile').mockResolvedValue(
        '# Trailing Slash Test'
      );

      const result = await loadRepoConventions('project-1', testDb);

      expect(readRemoteFileSpy).toHaveBeenCalledWith(
        sampleSshConfig,
        '/var/repos/trailing-slash/CONVENTIONS.md',
        undefined
      );
      expect(result?.foundPath).toBe('CONVENTIONS.md');
    });
  });
});

