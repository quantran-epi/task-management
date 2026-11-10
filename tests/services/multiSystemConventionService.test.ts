import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  loadRepoConventionsForSystem,
  loadMultiRepoConventions,
} from '../../src/services/conventionService';
import {
  buildConventionsSegment,
  CONVENTIONS_CONFLICT_POLICY,
} from '../../src/services/ai/conventionsSegment';
import * as sshService from '../../src/services/sshService';
import * as timerPopout from '../../src/utils/timerPopout';
import type { SshConfig } from '../../src/types/ssh';
import type { System } from '../../src/types/models';

describe('multiSystemConventionService and prompt composer', () => {
  let testDb: TaskPlannerDatabase;

  const sampleSshConfig1: SshConfig = {
    id: 'ssh-cfg-1',
    name: 'Server Alpha',
    host: '10.0.0.1',
    port: 22,
    username: 'dev',
    authType: 'password',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  const sampleSshConfig2: SshConfig = {
    id: 'ssh-cfg-2',
    name: 'Server Beta',
    host: '10.0.0.2',
    port: 22,
    username: 'dev',
    authType: 'password',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  const system1: System = {
    id: 'sys-1',
    name: 'Payment Gateway',
    code: 'PAY-GW',
    type: 'SERVICE',
    parentId: 'sys-parent',
    sshConfigId: 'ssh-cfg-1',
    remoteRepoPath: '/var/repos/payment-gateway',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  const system2: System = {
    id: 'sys-2',
    name: 'Order Service',
    code: 'ORDER-SVC',
    type: 'SERVICE',
    parentId: 'sys-parent',
    sshConfigId: 'ssh-cfg-2',
    remoteRepoPath: '/var/repos/order-service',
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestMultiConventionDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await sshService.saveSshConfig(sampleSshConfig1, undefined, testDb);
    await sshService.saveSshConfig(sampleSshConfig2, undefined, testDb);
    await testDb.systems.bulkAdd([system1, system2]);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await testDb.delete();
    vi.restoreAllMocks();
  });

  describe('loadRepoConventionsForSystem', () => {
    it('returns null if not in Tauri app', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(false);
      const res = await loadRepoConventionsForSystem(system1.id, testDb);
      expect(res).toBeNull();
    });

    it('returns null if system has no sshConfigId or remoteRepoPath', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      await testDb.systems.where('id').equals(system1.id).modify((s) => {
        delete s.sshConfigId;
        delete s.remoteRepoPath;
      });
      const res = await loadRepoConventionsForSystem(system1.id, testDb);
      expect(res).toBeNull();
    });

    it('probes and retrieves CONVENTIONS.md successfully', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-1');
      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: 'CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });
      vi.spyOn(sshService, 'readRemoteFile').mockResolvedValue('# PAY-GW Conventions\n- Must use idempotent keys');

      const res = await loadRepoConventionsForSystem(system1.id, testDb);
      expect(res).toBeDefined();
      expect(res?.content).toBe('# PAY-GW Conventions\n- Must use idempotent keys');
      expect(res?.foundPath).toBe('CONVENTIONS.md');
      expect(res?.systemCode).toBe('PAY-GW');
    });

    it('returns null gracefully on SSH timeout or error', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret-1');
      vi.spyOn(sshService, 'execRemoteCommand').mockRejectedValue(new Error('Connection timed out'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await loadRepoConventionsForSystem(system1.id, testDb);
      expect(res).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('loadMultiRepoConventions', () => {
    it('aggregates conventions across multiple system IDs, ignoring failing ones', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret');

      vi.spyOn(sshService, 'execRemoteCommand').mockImplementation(async (cfg) => {
        if (cfg.id === 'ssh-cfg-1') {
          return { stdout: 'CONVENTIONS.md\n', stderr: '', exitStatus: 0 };
        }
        // System 2 fails probe
        return { stdout: '', stderr: 'Not found', exitStatus: 1 };
      });

      vi.spyOn(sshService, 'readRemoteFile').mockImplementation(async (cfg) => {
        if (cfg.id === 'ssh-cfg-1') {
          return '# Conventions 1';
        }
        return '';
      });

      const results = await loadMultiRepoConventions([system1.id, system2.id], testDb);
      expect(results).toHaveLength(1);
      expect(results[0]?.systemCode).toBe('PAY-GW');
      expect(results[0]?.systemName).toBe('Payment Gateway');
      expect(results[0]?.content).toBe('# Conventions 1');
    });

    it('aggregates all systems when both succeed', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret');

      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: 'CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });

      vi.spyOn(sshService, 'readRemoteFile').mockImplementation(async (cfg) => {
        if (cfg.id === 'ssh-cfg-1') return '# Conventions Sys 1';
        return '# Conventions Sys 2';
      });

      const results = await loadMultiRepoConventions([system1.id, system2.id], testDb);
      expect(results).toHaveLength(2);
      expect(results[0]?.systemCode).toBe('PAY-GW');
      expect(results[1]?.systemCode).toBe('ORDER-SVC');
    });
  });

  describe('CR target aggregation', () => {
    it('loads conventions for the systems targeted by a CR', async () => {
      vi.spyOn(timerPopout, 'isTauriApp').mockReturnValue(true);
      vi.spyOn(sshService, 'getSshSecret').mockResolvedValue('secret');
      vi.spyOn(sshService, 'execRemoteCommand').mockResolvedValue({
        stdout: 'CONVENTIONS.md\n',
        stderr: '',
        exitStatus: 0,
      });
      vi.spyOn(sshService, 'readRemoteFile').mockResolvedValue('# CR conventions from system 1');

      const cr = {
        id: 'cr-100',
        name: 'Multi System CR',
        code: 'CR-100',
        status: 'Open' as const,
        type: 'NEW_FEATURE' as const,
        targets: [{ systemId: system1.id }],
        createdAt: '2026-11-07T00:00:00.000Z',
        updatedAt: '2026-11-07T00:00:00.000Z',
      };
      await testDb.changeRequests.add(cr);

      const stored = await testDb.changeRequests.get(cr.id);
      const res = await loadMultiRepoConventions(
        (stored?.targets ?? []).map((t) => t.systemId),
        testDb
      );
      expect(res).toHaveLength(1);
      expect(res[0]?.content).toBe('# CR conventions from system 1');
      expect(res[0]?.foundPath).toBe('CONVENTIONS.md');
    });
  });

  describe('buildConventionsSegment multi-repo support', () => {
    it('formats multiple repository convention blocks with system code and path', () => {
      const segment = buildConventionsSegment({
        global: '# Global standards',
        repos: [
          {
            systemCode: 'PAY-GW',
            systemName: 'Payment Gateway',
            repoPath: '/var/repos/payment-gateway',
            content: '# Payment rules',
          },
          {
            systemCode: 'ORDER-SVC',
            systemName: 'Order Service',
            repoPath: '/var/repos/order-service',
            content: '# Order rules',
          },
        ],
      });

      expect(segment).toContain('[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]');
      expect(segment).toContain(CONVENTIONS_CONFLICT_POLICY);
      expect(segment).toContain('[GLOBAL CONVENTIONS - QUY ƯỚC CHUNG TỔ CHỨC]');
      expect(segment).toContain('# Global standards');
      expect(segment).toContain('[REPOSITORY CONVENTIONS - PAY-GW (/var/repos/payment-gateway)]');
      expect(segment).toContain('# Payment rules');
      expect(segment).toContain('[REPOSITORY CONVENTIONS - ORDER-SVC (/var/repos/order-service)]');
      expect(segment).toContain('# Order rules');
      expect(segment).toContain('[HẾT QUY ƯỚC TỔ CHỨC]');
    });

    it('remains backward compatible with single repo convention', () => {
      const segment = buildConventionsSegment({
        global: '# Global standards',
        repo: '# Single repo conventions',
        repoPath: '/var/repos/single',
      });

      expect(segment).toContain('[REPOSITORY CONVENTIONS - /var/repos/single]');
      expect(segment).toContain('# Single repo conventions');
    });
  });
});
