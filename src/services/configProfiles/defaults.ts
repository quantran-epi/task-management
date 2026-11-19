import { DEFAULT_NOTIFICATION_SETTINGS } from '../../types/notifications';
import { DEFAULT_SYSTEM_TYPE_OPTIONS } from '../system/systemTypeSettings';
import {
  DEFAULT_GHOST_DEV_CONFIG,
  type GhostDevConfig,
} from '../agents/ghostDevConfig';
import { DEFAULT_GRAPHITI_MCP_ENDPOINT } from '../ai/graphitiMcpClient';
import {
  DEFAULT_NINEROUTER_ENDPOINT,
  DEFAULT_NINEROUTER_MODEL,
  DEFAULT_NINEROUTER_CHAR_LIMIT,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_IMAGE_ENDPOINT,
  DEFAULT_IMAGE_MODEL,
} from '../ai/nineRouterTokenService';
import { DEFAULT_BUDGET_WARN_THRESHOLD_PCT } from '../../types/aiOffice';
import type { ProfileConfig, AiTeamDefaultsTemplate } from './types';
import { getSecretFields } from './catalog';

/**
 * Assemble a fresh authoring template purely from existing DEFAULT_* constants.
 * No db, localStorage, keyring or live-settings reads — the authoring screen's
 * independence from current settings (D-01) depends on this purity.
 */
export function buildDefaultProfileConfig(): ProfileConfig {
  const secretFields: Record<string, ''> = {};
  for (const key of getSecretFields()) secretFields[key] = '';

  const settings: Record<string, unknown> = {
    notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
    system_type_options: DEFAULT_SYSTEM_TYPE_OPTIONS,
    global_conventions: '',
    ai_budget_warn_threshold_pct: DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
    mcp_servers: '',
    graphiti_mcp_enabled: true,
    graphiti_mcp_endpoint: DEFAULT_GRAPHITI_MCP_ENDPOINT,
    ninerouter_endpoint: DEFAULT_NINEROUTER_ENDPOINT,
    ninerouter_default_model: DEFAULT_NINEROUTER_MODEL,
    ninerouter_char_limit: DEFAULT_NINEROUTER_CHAR_LIMIT,
    ninerouter_context_window_tokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
    image_endpoint: DEFAULT_IMAGE_ENDPOINT,
    image_model: DEFAULT_IMAGE_MODEL,
    github_owner: '',
    github_repo: '',
    knowledge_server_enabled: false,
    knowledge_server_base_url: '',
  };

  // Weekday defaults from src/db/seeds.ts: Mon–Fri 480, Sat/Sun 0.
  const capacityRules = [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
    dayOfWeek,
    workMinutes: dayOfWeek >= 1 && dayOfWeek <= 5 ? 480 : 0,
  }));

  const ghostDevConfig: GhostDevConfig = { ...DEFAULT_GHOST_DEV_CONFIG };
  const teamDefaults: AiTeamDefaultsTemplate = { budgetTokens: 0 };

  return {
    settings,
    capacityRules,
    capacityOverrides: [],
    ghostDevConfig,
    teamDefaults,
    secretFields,
  };
}
