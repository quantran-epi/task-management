// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ORACLE_CONFIG,
  detectRemoteFailure,
} from '../../../src/services/ai/oracleSqlclService';

const config = { ...DEFAULT_ORACLE_CONFIG, connectionString: 'user/secret@host:1521/sid' };

describe('detectRemoteFailure — unreliable -1 exit (261123-et1)', () => {
  it('lets stdout parse when -1 is the only negative signal', () => {
    const stdout = 'COL\n---\n42\n';
    expect(detectRemoteFailure({ stdout, stderr: '', exitStatus: -1 }, config)).toBeNull();
    // A definite reader/cancel finish is independent evidence and must not be suppressed.
    expect(
      detectRemoteFailure({ stdout, stderr: '', exitStatus: -1, finishReason: 'error' }, config)
    ).toBeTruthy();
  });

  it('fails on a real reader error even when stdout carried data', () => {
    const readerError = 'Lỗi đọc stdout: connection reset';
    for (const exitStatus of [-1, 0]) {
      expect(
        detectRemoteFailure(
          { stdout: 'COL\n---\n42\n', stderr: readerError, exitStatus, finishReason: 'error' },
          config
        )
      ).toContain('Lỗi đọc stdout');
    }
  });

  it('still fails on a real nonzero exit even with stdout data', () => {
    const result = detectRemoteFailure(
      { stdout: 'partial', stderr: '', exitStatus: 127 },
      config
    );
    expect(result).toContain('Lệnh SQLcl thoát với mã 127');
  });

  it('keeps stderr and cancellation as definite failures', () => {
    expect(
      detectRemoteFailure({ stdout: 'data', stderr: 'sql: not found', exitStatus: -1 }, config)
    ).toContain('sql: not found');
    expect(
      detectRemoteFailure({ stdout: 'data', stderr: '', exitStatus: -1, finishReason: 'cancelled' }, config)
    ).toContain('đã bị hủy');
  });

  it('does not leak the connection password in a failure reason', () => {
    const result = detectRemoteFailure(
      { stdout: '', stderr: 'user/secret@host:1521/sid failed', exitStatus: 1 },
      config
    );
    expect(result).not.toContain('secret');
  });
});
