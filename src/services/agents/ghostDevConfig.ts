export interface GhostDevConfig {
  masterModel: string;
  workerModel: string;
  concurrencyCap: number;
}

export const GHOST_DEV_CONFIG_KEY = 'planner:ghost_dev_config';

export const DEFAULT_GHOST_DEV_CONFIG: GhostDevConfig = {
  masterModel: 'claude-3-5-sonnet-20241022',
  workerModel: 'claude-3-5-haiku-20241022',
  concurrencyCap: 6,
};

export const MODEL_ID_REGEX = /^[a-zA-Z0-9.-]+$/;

export function sanitizeModelId(model: string, fallback: string): string {
  const trimmed = model.trim();
  if (MODEL_ID_REGEX.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function getGhostDevConfig(): GhostDevConfig {
  if (typeof window === 'undefined') return DEFAULT_GHOST_DEV_CONFIG;
  try {
    const raw = localStorage.getItem(GHOST_DEV_CONFIG_KEY);
    if (!raw) return DEFAULT_GHOST_DEV_CONFIG;
    const parsed = JSON.parse(raw) as Partial<GhostDevConfig>;
    return {
      masterModel: sanitizeModelId(parsed.masterModel || '', DEFAULT_GHOST_DEV_CONFIG.masterModel),
      workerModel: sanitizeModelId(parsed.workerModel || '', DEFAULT_GHOST_DEV_CONFIG.workerModel),
      concurrencyCap:
        typeof parsed.concurrencyCap === 'number' && parsed.concurrencyCap > 0 && parsed.concurrencyCap <= 12
          ? parsed.concurrencyCap
          : DEFAULT_GHOST_DEV_CONFIG.concurrencyCap,
    };
  } catch {
    return DEFAULT_GHOST_DEV_CONFIG;
  }
}

export function setGhostDevConfig(config: GhostDevConfig): void {
  if (typeof window === 'undefined') return;
  const safeConfig: GhostDevConfig = {
    masterModel: sanitizeModelId(config.masterModel, DEFAULT_GHOST_DEV_CONFIG.masterModel),
    workerModel: sanitizeModelId(config.workerModel, DEFAULT_GHOST_DEV_CONFIG.workerModel),
    concurrencyCap: Math.max(1, Math.min(12, config.concurrencyCap || 6)),
  };
  localStorage.setItem(GHOST_DEV_CONFIG_KEY, JSON.stringify(safeConfig));
}
