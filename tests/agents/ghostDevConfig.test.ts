import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGhostDevConfig,
  setGhostDevConfig,
  DEFAULT_GHOST_DEV_CONFIG,
} from '../../src/services/agents/ghostDevConfig';

describe('ghostDevConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default config when storage is empty', () => {
    const config = getGhostDevConfig();
    expect(config.masterModel).toBe(DEFAULT_GHOST_DEV_CONFIG.masterModel);
    expect(config.workerModel).toBe(DEFAULT_GHOST_DEV_CONFIG.workerModel);
    expect(config.concurrencyCap).toBe(6);
    expect(config.claudePath).toBe('');
  });

  it('persists and retrieves custom claudePath', () => {
    setGhostDevConfig({
      masterModel: 'claude-3-7-sonnet-20250219',
      workerModel: 'claude-3-5-haiku-20241022',
      concurrencyCap: 4,
      claudePath: '  C:\\tools\\claude.cmd  ',
    });

    const retrieved = getGhostDevConfig();
    expect(retrieved.claudePath).toBe('C:\\tools\\claude.cmd');
    expect(retrieved.concurrencyCap).toBe(4);
    expect(retrieved.masterModel).toBe('claude-3-7-sonnet-20250219');
  });

  it('handles invalid or empty claudePath gracefully', () => {
    localStorage.setItem(
      'planner:ghost_dev_config',
      JSON.stringify({
        masterModel: 'claude-3-5-sonnet-20241022',
        workerModel: 'claude-3-5-haiku-20241022',
        concurrencyCap: 6,
        claudePath: 123,
      })
    );

    const retrieved = getGhostDevConfig();
    expect(retrieved.claudePath).toBe('');
  });
});
