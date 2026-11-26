import {
  AI_DATABASE_TOOLS,
  SSH_READ_TOOLS,
  ORACLE_READ_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  normalizeToolName,
} from './aiTools';
import type { AiTeam } from '../../types/aiOffice';
import { invalidateMcpDiscovery, isReadOnlyMcpTool } from './mcpClient';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { TEAM_TOOL_DEFINITIONS } from './office/teamTools';
import { CHAT_HISTORY_TOOL_DEFINITIONS } from './chatHistoryTools';
import { discoverAllMcpTools } from './mcpClient';
import { getGraphitiMcpToolDefinitions } from './graphitiMcpClient';

/**
 * D-12: the DB read tools an employee may call. Team-scoped tools
 * (`search_team_history`, `read_team_turn`, `read_skill`) are appended by the
 * coordinator from `TEAM_TOOL_DEFINITIONS` — they are not `AI_DATABASE_TOOLS`
 * members. `delegate_batch` is lead-only (Pitfall 10: no nested batches).
 *
 * `retrieve_knowledge` (hybrid fulltext + vector + graph) and `get_document_details`
 * (full local document read) mirror the AI Chat panel's knowledge research. Both are safe
 * to advertise unconditionally: `retrieve_knowledge` returns a structured error string when
 * the knowledge server is off rather than throwing, and `get_document_details` wraps
 * `title` / `body` / `tags` through `wrapField`, so the untrusted-data boundary holds.
 */
export const EMPLOYEE_READ_ONLY_ALLOWLIST: readonly string[] = [
  'query_tasks',
  'query_change_requests',
  'query_systems',
  'query_notes',
  'query_worklogs',
  'get_item_details',
  'get_active_timer',
  'get_daily_schedule',
  'check_capacity_feasibility',
  'get_day_insight',
  'get_analytics_summary',
  'query_attention_items',
  'query_recurring_tasks',
  'get_system_status',
  'search_knowledge_base',
  'retrieve_knowledge',
  'get_document_details',
];

/**
 * D-27: the lead's DB read set plus the linked-item tools and `delegate_batch`.
 *
 * WR-03: `get_item_details` is deliberately excluded. It returns raw task `description` /
 * `notes` / `checklist[].text` and raw sticky-note bodies, so advertising it to the lead let
 * the one agent holding mutation tools reach unwrapped user text directly and made the two
 * read paths disagree. `get_linked_context` is the lead's item read — it applies the
 * untrusted-data boundary once.
 */
export const LEAD_TOOL_ALLOWLIST: readonly string[] = [
  ...EMPLOYEE_READ_ONLY_ALLOWLIST.filter((name) => name !== 'get_item_details'),
  'list_linked_items',
  'get_linked_context',
  'delegate_batch',
];

/** Single guard so a payload assertion lives in one place. */
export function payloadHasMutationTool(tools: readonly AiToolDefinition[]): boolean {
  return tools.some((tool) => isMutationTool(tool.function.name));
}

export interface GatedAddendaOptions {
  /** Team chat context: enablement is a per-team row flag. Absent for chat/Telegram. */
  team?: Pick<AiTeam, 'sshFsToolsEnabled' | 'oracleToolsEnabled'> | undefined;
  /** Connection readiness = configured connection exists (no global enable flag). */
  sshConfigReady: boolean;
  oracleConfigReady: boolean;
}

/**
 * Quick cz2 (decisions 5/7): SSH FS / Oracle tools are advertised only when enabled.
 *
 * - Team chat: enabled iff the team row flag is true AND the shared connection is ready.
 * - Ordinary chat / Telegram (no team): enabled iff the shared connection is ready.
 *
 * Pure by design — no DB reads here; callers resolve config readiness per turn. Both lead and
 * employee payloads consume the result, so a disabled tool never reaches the model at all.
 */
export function getGatedAddenda(options: GatedAddendaOptions): AiToolDefinition[] {
  const { team, sshConfigReady, oracleConfigReady } = options;
  const sshEnabled = team ? team.sshFsToolsEnabled === true && sshConfigReady : sshConfigReady;
  const oracleEnabled = team ? team.oracleToolsEnabled === true && oracleConfigReady : oracleConfigReady;
  return [
    ...(sshEnabled ? SSH_READ_TOOLS : []),
    ...(oracleEnabled ? ORACLE_READ_TOOLS : []),
  ];
}

/**
 * Tool set for a single chat turn. In ordinary chat Analysis Mode no longer strips
 * mutation DB tools: the runtime parks every mutation for explicit user approval, so
 * read-only is a prompt preference rather than a hard block. Dynamic MCP tools stay
 * read-only in Analysis Mode (their approval path is not wired). An explicit allowlist
 * (an explicit allowlist) keeps its read-only payload. Studio artifact tools require an explicit
 * allowlist; other omitted-list behavior stays unchanged.
 */
export function getToolsForTurn(
  effectiveAnalysisMode: boolean,
  dynamicMcpTools: AiToolDefinition[] = [],
  allowedToolNames?: readonly string[],
  disabledToolNames: ReadonlySet<string> = new Set()
): AiToolDefinition[] {
  // Advertise what the server says it has. `SOURCE_TOOL_NAMES` is prompt text only; the
  // read-only gate below is the sole execution policy for dynamic tools.
  const allowed = allowedToolNames === undefined
    ? undefined
    : new Set(allowedToolNames.map(normalizeToolName));
  const isDisabled = (name: string) => disabledToolNames.has(normalizeToolName(name));
  return [
    ...AI_DATABASE_TOOLS.filter((tool) =>
      !isDisabled(tool.function.name) &&
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      (allowed !== undefined || !['get_artifact', 'patch_artifact_section'].includes(normalizeToolName(tool.function.name))) &&
      // ponytail: mutation tools stay in the ordinary-chat payload (approval card guards them);
      // an explicit allowlist keeps its read-only-by-default contract.
      (!effectiveAnalysisMode || allowed === undefined || !isMutationTool(normalizeToolName(tool.function.name)))),
    ...dynamicMcpTools.filter((tool) =>
      !isDisabled(tool.function.name) &&
      (!allowed || allowed.has(normalizeToolName(tool.function.name))) &&
      (!(effectiveAnalysisMode || allowed) || isReadOnlyMcpTool(normalizeToolName(tool.function.name)))),
  ];
}

/**
 * Phase 47 D-13: build the advertised tool list for a turn, including the remote-scope-specific
 * gates. Pure so the drawer's real gating can be unit-tested deterministically:
 *  - an active remote target makes SSH tools ready even with no global SSH FS config (Pitfall 6);
 *  - a remote turn advertises exactly one team tool, `git_read` — never explore_repo/write_doc.
 */
export interface RemoteTurnToolOptions {
  effectiveAnalysisMode: boolean;
  dynamicMcpTools?: AiToolDefinition[];
  /** Whether a global SSH FS config exists (the ordinary-scope gate). */
  globalSshConfigReady: boolean;
  /** Whether the active remote scope carries an explicit target for this turn. */
  hasRemoteTarget: boolean;
  oracleConfigReady: boolean;
  allowedToolNames?: readonly string[];
  /**
   * Quick 261126-1od: standalone chat advertises only these builtin knowledge/artifact
   * tools. Pure payload option — never use `allowedToolNames` here: that filter also
   * removes dynamic MCP/Graphiti tools, which standalone chat must keep.
   */
  standaloneCapability?: boolean;
}

const STANDALONE_BUILTIN_TOOL_NAMES: readonly string[] = [
  'retrieve_knowledge',
  'search_knowledge_base',
  'get_document_details',
  'generate_file',
  'generate_pptx',
  'generate_image',
];

export function getToolsForTurnWithRemote(options: RemoteTurnToolOptions): AiToolDefinition[] {
  const sshReady = options.hasRemoteTarget || options.globalSshConfigReady;
  const disabled = new Set<string>([
    ...(sshReady ? [] : SSH_READ_TOOLS.map((t) => normalizeToolName(t.function.name))),
    ...(options.oracleConfigReady ? [] : ORACLE_READ_TOOLS.map((t) => normalizeToolName(t.function.name))),
  ]);
  const dynamicMcpTools = options.dynamicMcpTools ?? [];
  const tools: AiToolDefinition[] = options.standaloneCapability
    ? [
        ...AI_DATABASE_TOOLS.filter((tool) =>
          STANDALONE_BUILTIN_TOOL_NAMES.includes(normalizeToolName(tool.function.name))
        ),
        ...dynamicMcpTools,
        ...getGatedAddenda({ sshConfigReady: sshReady, oracleConfigReady: options.oracleConfigReady }),
      ]
    : getToolsForTurn(
        options.effectiveAnalysisMode,
        dynamicMcpTools,
        options.allowedToolNames,
        disabled
      );
  if (options.hasRemoteTarget) {
    const gitReadDef = TEAM_TOOL_DEFINITIONS.find(
      (t) => normalizeToolName(t.function.name) === 'git_read'
    );
    if (gitReadDef) tools.push(gitReadDef);
  }
  // 261126-q7j: the chat panel's own transcript tools are available on every turn, including
  // the standalone capability set. Nothing else is added or removed.
  tools.push(...CHAT_HISTORY_TOOL_DEFINITIONS);
  return tools;
}

// ---------------------------------------------------------------------------
// Read-only tool catalog (Settings > AI tab). Additive: nothing above this line
// is modified. The catalog never feeds a dispatch path — it is inventory only.
// ---------------------------------------------------------------------------

export type ToolCatalogSource = 'builtin' | 'team' | 'chat' | 'mcp' | 'graphiti';

export interface ToolCatalogUsage {
  /** Human-readable flow labels (Vietnamese), e.g. "Chat thường". */
  labels: string[];
  /** Verified file:line dispatch sites for the flow. */
  references: string[];
}

export interface ToolCatalogEntry {
  tool: AiToolDefinition;
  source: ToolCatalogSource;
  isMutationTool: boolean;
  usage: ToolCatalogUsage;
}

/**
 * Curated "where it is used" map. Every reference below was verified against a
 * real dispatch site; this is deliberately static (no repo-wide call-site scan).
 *
 * Verified sites:
 *  - AIChatDrawer.tsx:1802            -> getToolsForTurn (ordinary chat)
 *  - teamRunCoordinator.ts:1311       -> leadTools reads via LEAD_TOOL_ALLOWLIST
 *  - teamRunCoordinator.ts:1323       -> leadTools team definitions
 *  - teamRunCoordinator.ts:1333       -> employeeTools reads via EMPLOYEE_READ_ONLY_ALLOWLIST
 *  - teamRunCoordinator.ts:1334       -> employeeTools EMPLOYEE_TEAM_TOOLS
 *  - teamRunCoordinator.ts:1356       -> mcpReadOnlyTools filter
 *  - telegramHeadlessWorker.ts:1468   -> read-only AI_DATABASE_TOOLS for Telegram
 *  - telegramHeadlessWorker.ts:1485   -> discoverAllMcpTools for Telegram
 *  - telegramMutationSession.ts:263   -> Telegram mutation tools
 *  - mcpClient.ts:402                 -> discoverAllMcpTools
 *  - mcpClient.ts:356                 -> fetchServerTools
 *  - graphitiMcpClient.ts:240         -> getGraphitiMcpToolDefinitions (Tauri only)
 */
const CURATED_BUILTIN_USAGE: ToolCatalogUsage = {
  labels: ['Chat thường', 'Agent nhóm', 'Telegram headless'],
  references: [
    'AIChatDrawer.tsx:1802',
    'teamRunCoordinator.ts:1311',
    'teamRunCoordinator.ts:1333',
    'telegramHeadlessWorker.ts:1468',
  ],
};

const MUTATION_EXTRA_USAGE: ToolCatalogUsage = {
  labels: ['Telegram mutation session'],
  references: ['telegramMutationSession.ts:263'],
};

const CURATED_TEAM_USAGE: ToolCatalogUsage = {
  labels: ['Agent nhóm (lead/employee)'],
  references: ['teamRunCoordinator.ts:1323', 'teamRunCoordinator.ts:1334'],
};

const CURATED_CHAT_USAGE: ToolCatalogUsage = {
  labels: ['AI Chat panel (dock + standalone)'],
  references: [
    'chatHistoryTools.ts (executeChatHistoryTool)',
    'chatTurnRuntime.ts (dispatchAiToolCall with request.threadId)',
  ],
};

const CURATED_MCP_USAGE: ToolCatalogUsage = {
  labels: ['Chat thường (MCP động)', 'Agent nhóm (MCP read-only)', 'Telegram headless'],
  references: [
    'discoverAllMcpTools -> mcpClient.ts:402',
    'chatTurnTools.ts:86',
    'teamRunCoordinator.ts:1356',
    'telegramHeadlessWorker.ts:1485',
  ],
};

const CURATED_GRAPHITI_USAGE: ToolCatalogUsage = {
  labels: ['Chat thường / Graphiti (Tauri local)'],
  references: ['graphitiMcpClient.ts:240', 'mcpClient.ts:356'],
};

/**
 * Quick cz2: where the enablement-gated SSH FS / Oracle tools are actually dispatched.
 * Both team roles receive the same addenda; chat and Telegram pass a disabled-name set.
 */
const SSH_ORACLE_USAGE: ToolCatalogUsage = {
  labels: ['Chat thường (gated)', 'Agent nhóm lead/employee (gated)', 'Telegram (gated)'],
  references: [
    'teamRunCoordinator.ts (leadTools + employeeTools getGatedAddenda)',
    'AIChatDrawer.tsx (gated getToolsForTurn)',
    'telegramHeadlessWorker.ts (gated getGatedAddenda)',
    'telegramMutationSession.ts (gated getGatedAddenda)',
  ],
};

/** Specific overrides layered on top of the builtin defaults. */
const BUILTIN_USAGE_OVERRIDES: Record<string, ToolCatalogUsage> = {
  query_tasks: {
    labels: ['Chat thường', 'Agent nhóm', 'Telegram headless'],
    references: [
      'AIChatDrawer.tsx:1802',
      'teamRunCoordinator.ts:1311',
      'teamRunCoordinator.ts:1333',
      'telegramHeadlessWorker.ts:1468',
    ],
  },
  ssh_read_file_page: SSH_ORACLE_USAGE,
  ssh_read_document: SSH_ORACLE_USAGE,
  ssh_list_dir: SSH_ORACLE_USAGE,
  ssh_grep_files: SSH_ORACLE_USAGE,
  oracle_query: SSH_ORACLE_USAGE,
  oracle_describe: SSH_ORACLE_USAGE,
  oracle_list_connections: SSH_ORACLE_USAGE,
};

function mergeUsage(...parts: (ToolCatalogUsage | undefined)[]): ToolCatalogUsage {
  const labels: string[] = [];
  const references: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const label of part.labels) if (!labels.includes(label)) labels.push(label);
    for (const reference of part.references) {
      if (!references.includes(reference)) references.push(reference);
    }
  }
  return { labels, references };
}

/**
 * Pure/additive inventory of every AI tool TaskMate can advertise. Builtin, team
 * and chat-history tools are always present; MCP and Graphiti discovery are independent and
 * degrade to [] on failure. Nothing here touches getToolsForTurn, any allowlist
 * or any dispatch path.
 */
export async function getAllAvailableToolDefinitions(
  db: TaskPlannerDatabase = defaultDb
): Promise<ToolCatalogEntry[]> {
  const builtinEntries: ToolCatalogEntry[] = AI_DATABASE_TOOLS.map((tool) => {
    const name = normalizeToolName(tool.function.name);
    const mutation = isMutationTool(name);
    const override = BUILTIN_USAGE_OVERRIDES[name];
    // Entries with a specific override own their usage map: merging the generic curated
    // defaults would reintroduce the stale dispatch refs the override exists to replace.
    return {
      tool,
      source: 'builtin',
      isMutationTool: mutation,
      usage: override
        ? mergeUsage(override, mutation ? MUTATION_EXTRA_USAGE : undefined)
        : mergeUsage(CURATED_BUILTIN_USAGE, mutation ? MUTATION_EXTRA_USAGE : undefined),
    };
  });

  const teamEntries: ToolCatalogEntry[] = TEAM_TOOL_DEFINITIONS.map((tool) => {
    const name = normalizeToolName(tool.function.name);
    return {
      tool,
      source: 'team',
      isMutationTool: isMutationTool(name),
      usage: mergeUsage(CURATED_TEAM_USAGE, isMutationTool(name) ? MUTATION_EXTRA_USAGE : undefined),
    };
  });

  const chatEntries: ToolCatalogEntry[] = CHAT_HISTORY_TOOL_DEFINITIONS.map((tool) => ({
    tool,
    source: 'chat',
    isMutationTool: isMutationTool(normalizeToolName(tool.function.name)),
    usage: CURATED_CHAT_USAGE,
  }));

  let mcpTools: AiToolDefinition[] = [];
  try {
    invalidateMcpDiscovery();
    mcpTools = await discoverAllMcpTools(db);
  } catch (error) {
    console.warn('[chatTurnTools] MCP discovery failed for tool catalog:', error);
  }

  let graphitiTools: AiToolDefinition[] = [];
  try {
    graphitiTools = await getGraphitiMcpToolDefinitions(db);
  } catch (error) {
    console.warn('[chatTurnTools] Graphiti discovery failed for tool catalog:', error);
  }

  const dynamicEntries: ToolCatalogEntry[] = [
    ...mcpTools.map(
      (tool): ToolCatalogEntry => ({
        tool,
        source: 'mcp',
        isMutationTool: isMutationTool(normalizeToolName(tool.function.name)),
        usage: mergeUsage(undefined, CURATED_MCP_USAGE),
      })
    ),
    ...graphitiTools.map(
      (tool): ToolCatalogEntry => ({
        tool,
        source: 'graphiti',
        isMutationTool: isMutationTool(normalizeToolName(tool.function.name)),
        usage: mergeUsage(undefined, CURATED_GRAPHITI_USAGE),
      })
    ),
  ];

  // First source wins (builtin -> team -> chat -> mcp -> graphiti); later duplicates only
  // contribute their usage references so the "where used" column stays complete.
  const result: ToolCatalogEntry[] = [];
  const byName = new Map<string, ToolCatalogEntry>();
  for (const entry of [...builtinEntries, ...teamEntries, ...chatEntries, ...dynamicEntries]) {
    const key = normalizeToolName(entry.tool.function.name);
    const existing = byName.get(key);
    if (existing) {
      existing.usage = mergeUsage(existing.usage, entry.usage);
      continue;
    }
    byName.set(key, entry);
    result.push(entry);
  }
  return result;
}
