import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EMPLOYEE_READ_ONLY_ALLOWLIST,
  LEAD_TOOL_ALLOWLIST,
  getGatedAddenda,
  getToolsForTurn,
  getToolsForTurnWithRemote,
  payloadHasMutationTool,
} from '../../src/services/ai/chatTurnTools';
import {
  AI_DATABASE_TOOLS,
  SSH_READ_TOOLS,
  ORACLE_READ_TOOLS,
  isMutationTool,
  normalizeToolName,
  type AiToolDefinition,
} from '../../src/services/ai/aiTools';
import { dispatchAiToolCall } from '../../src/services/ai/aiOrchestratorLoop';
import { executeTeamTool, type TeamToolContext } from '../../src/services/ai/office/teamTools';
import * as sshService from '../../src/services/sshService';
import type { RemoteToolTarget } from '../../src/types/sshFsTool';

// Wrap the real team-tools module so `executeTeamTool` stays observable (its call args are the
// D-13 contract) while every other export remains real. This mirrors the remoteExploreService
// seam in teamToolsGitRead.test.ts.
vi.mock('../../src/services/ai/office/teamTools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ai/office/teamTools')>();
  return { ...actual, executeTeamTool: vi.fn(actual.executeTeamTool) };
});

const REMOTE_TARGET: RemoteToolTarget = {
  sshConfigId: 'ssh-scope-target',
  repoPath: '/srv/scope-repo',
  branch: 'feature/scope',
};

describe('quick cz2 enablement gating (getGatedAddenda)', () => {
  const sshNames = SSH_READ_TOOLS.map((t) => normalizeToolName(t.function.name));
  const oracleNames = ORACLE_READ_TOOLS.map((t) => normalizeToolName(t.function.name));
  const namesOf = (tools: { function: { name: string } }[]) => tools.map((t) => normalizeToolName(t.function.name));

  it('advertises nothing when the team flags are off even if config is ready', () => {
    const addenda = getGatedAddenda({
      team: { sshFsToolsEnabled: false, oracleToolsEnabled: false },
      sshConfigReady: true,
      oracleConfigReady: true,
    });
    expect(addenda).toHaveLength(0);
  });

  it('gives both SSH and Oracle tools when the team flags are on and config is ready', () => {
    const addenda = getGatedAddenda({
      team: { sshFsToolsEnabled: true, oracleToolsEnabled: true },
      sshConfigReady: true,
      oracleConfigReady: true,
    });
    expect(namesOf(addenda).sort()).toEqual([...sshNames, ...oracleNames].sort());
  });

  it('withholds a tool when config is missing even if the team flag is on', () => {
    const addenda = getGatedAddenda({
      team: { sshFsToolsEnabled: true, oracleToolsEnabled: true },
      sshConfigReady: false,
      oracleConfigReady: false,
    });
    expect(addenda).toHaveLength(0);
  });

  it('chat/Telegram (no team) advertise from config readiness alone', () => {
    const addenda = getGatedAddenda({ sshConfigReady: true, oracleConfigReady: false });
    expect(namesOf(addenda).sort()).toEqual([...sshNames].sort());
  });

  it('disabledToolNames removes SSH/Oracle tools from getToolsForTurn payloads', () => {
    const disabled = new Set([...sshNames, ...oracleNames]);
    const payload = getToolsForTurn(false, [], undefined, disabled);
    const payloadNames = namesOf(payload);
    for (const name of [...sshNames, ...oracleNames]) {
      expect(payloadNames).not.toContain(name);
    }
    expect(payloadNames).toContain('query_tasks');
  });
});

describe('quick 261126-1od standalone chat tool capability', () => {
  const MCP_TOOL: AiToolDefinition = {
    type: 'function',
    function: {
      name: 'mcp_sample_read',
      description: 'Sample dynamic MCP read tool',
      parameters: { type: 'object', properties: {} },
    },
  };
  const namesOf = (tools: readonly AiToolDefinition[]) =>
    tools.map((t) => normalizeToolName(t.function.name));
  const baseOptions = {
    effectiveAnalysisMode: false,
    globalSshConfigReady: true,
    hasRemoteTarget: false,
    oracleConfigReady: true,
  };
  const standaloneAllowed = [
    'retrieve_knowledge',
    'search_knowledge_base',
    'get_document_details',
    'generate_file',
    'generate_pptx',
    'generate_image',
  ];
  const forbiddenMutations = [
    'create_task',
    'update_task',
    'delete_task',
    'plan_allocation',
    'log_work_session',
    'delete_note',
  ];

  it('Test 1: standalone capability keeps knowledge/artifact, SSH/Oracle and dynamic MCP, drops TaskMate DB mutations', () => {
    const payload = getToolsForTurnWithRemote({
      ...baseOptions,
      standaloneCapability: true,
      dynamicMcpTools: [MCP_TOOL],
    });
    const names = namesOf(payload);
    for (const name of standaloneAllowed) expect(names).toContain(name);
    for (const name of [...SSH_READ_TOOLS, ...ORACLE_READ_TOOLS].map((t) =>
      normalizeToolName(t.function.name)
    )) {
      expect(names).toContain(name);
    }
    expect(names).toContain('mcp_sample_read');
    for (const name of forbiddenMutations) expect(names).not.toContain(name);
    // generate_file is an artifact execution tool: helper stays true, so assert explicit names.
    expect(payloadHasMutationTool(payload)).toBe(true);
  });

  it('Test 2: omitting the option leaves the legacy payload byte-for-byte in tool identity and count', () => {
    const legacy = getToolsForTurnWithRemote({ ...baseOptions, dynamicMcpTools: [MCP_TOOL] });
    const explicitFalse = getToolsForTurnWithRemote({
      ...baseOptions,
      standaloneCapability: false,
      dynamicMcpTools: [MCP_TOOL],
    });
    expect(namesOf(explicitFalse)).toEqual(namesOf(legacy));
    expect(namesOf(legacy)).toContain('query_tasks');
    // 261126-q7j adds exactly two new definitions on every path; legacy identity/count is the
    // remainder after removing them, not the raw total.
    const historyNames = ['search_chat_history', 'read_chat_turn'];
    expect(namesOf(legacy).filter((name) => !historyNames.includes(name))).toHaveLength(
      namesOf(getToolsForTurn(false, [MCP_TOOL])).length
    );
  });

  it('261126-q7j: always advertises the two chat history tools in standalone and ordinary payloads', () => {
    const historyNames = ['search_chat_history', 'read_chat_turn'];
    const standalone = getToolsForTurnWithRemote({ ...baseOptions, standaloneCapability: true });
    const ordinary = getToolsForTurnWithRemote({ ...baseOptions, dynamicMcpTools: [MCP_TOOL] });
    for (const payload of [standalone, ordinary]) {
      const names = namesOf(payload);
      for (const name of historyNames) expect(names).toContain(name);
      expect(names.filter((name) => historyNames.includes(name))).toHaveLength(2);
    }
    // Legacy tool identity/count stays unchanged: only the two new definitions are added.
    const legacyNames = namesOf(getToolsForTurn(false, [MCP_TOOL], undefined, new Set()));
    expect(namesOf(ordinary).filter((name) => !historyNames.includes(name))).toEqual(legacyNames);
  });

  it('Test 3: option does not change analysis-mode, disabled-name or allowed-name behavior', () => {
    const allowed = getToolsForTurnWithRemote({
      ...baseOptions,
      effectiveAnalysisMode: true,
      allowedToolNames: EMPLOYEE_READ_ONLY_ALLOWLIST,
      standaloneCapability: false,
    });
    expect(namesOf(allowed)).toContain('query_tasks');
    expect(payloadHasMutationTool(allowed)).toBe(false);

    const unconfigured = getToolsForTurnWithRemote({
      ...baseOptions,
      globalSshConfigReady: false,
      oracleConfigReady: false,
      standaloneCapability: true,
      dynamicMcpTools: [MCP_TOOL],
    });
    const names = namesOf(unconfigured);
    expect(names).toContain('retrieve_knowledge');
    expect(names).toContain('mcp_sample_read');
    for (const name of [...SSH_READ_TOOLS, ...ORACLE_READ_TOOLS].map((t) =>
      normalizeToolName(t.function.name)
    )) {
      expect(names).not.toContain(name);
    }
  });
});

describe('chatTurnTools allowlists (D-12, D-27)', () => {
  it('employee payload contains no mutation tool', () => {
    const payload = getToolsForTurn(true, [], EMPLOYEE_READ_ONLY_ALLOWLIST);
    expect(payload.length).toBeGreaterThan(0);
    expect(payloadHasMutationTool(payload)).toBe(false);
  });

  it('no employee allowlist name is a mutation tool', () => {
    for (const name of EMPLOYEE_READ_ONLY_ALLOWLIST) {
      expect(isMutationTool(name)).toBe(false);
    }
  });

  it('lead allowlist adds the team tools and the employee list does not have them', () => {
    for (const name of ['list_linked_items', 'get_linked_context', 'delegate_batch']) {
      expect(LEAD_TOOL_ALLOWLIST).toContain(name);
      expect(EMPLOYEE_READ_ONLY_ALLOWLIST).not.toContain(name);
    }
  });

  // WR-03: `get_item_details` returns raw task description/notes/checklist text and raw
  // sticky-note bodies. Advertising it to the lead let the one agent holding mutation tools
  // bypass the untrusted-data boundary `get_linked_context` applies, and made the two read
  // paths disagree. `get_linked_context` is the lead's item read.
  it('the lead cannot reach raw item text through get_item_details (WR-03)', () => {
    expect(LEAD_TOOL_ALLOWLIST).not.toContain('get_item_details');
    expect(EMPLOYEE_READ_ONLY_ALLOWLIST).toContain('get_item_details');

    const names = getToolsForTurn(true, [], LEAD_TOOL_ALLOWLIST).map((t) =>
      normalizeToolName(t.function.name)
    );
    expect(names).not.toContain('get_item_details');
    // `get_linked_context` is a team tool the coordinator appends, not an `AI_DATABASE_TOOLS`
    // member — the allowlist entry is what lets it through.
    expect(LEAD_TOOL_ALLOWLIST).toContain('get_linked_context');
  });

  // Knowledge research parity with the AI Chat panel: the AI Office leader and employees
  // reach the hybrid knowledge server and the full local document read, not just BM25.
  it('both knowledge research tools reach the employee and lead payloads', () => {
    for (const allowlist of [EMPLOYEE_READ_ONLY_ALLOWLIST, LEAD_TOOL_ALLOWLIST]) {
      expect(allowlist).toContain('retrieve_knowledge');
      expect(allowlist).toContain('get_document_details');

      const names = getToolsForTurn(true, [], allowlist).map((t) =>
        normalizeToolName(t.function.name)
      );
      expect(names).toContain('retrieve_knowledge');
      expect(names).toContain('get_document_details');
    }
  });

  it('lead payload contains no mutation tool', () => {
    expect(payloadHasMutationTool(getToolsForTurn(true, [], LEAD_TOOL_ALLOWLIST))).toBe(false);
  });

  it('delegate_batch is absent from AI_DATABASE_TOOLS', () => {
    expect(AI_DATABASE_TOOLS.some((t) => normalizeToolName(t.function.name) === 'delegate_batch')).toBe(false);
  });

  it('keeps the no-allowlist behavior unchanged', () => {
    const names = getToolsForTurn(false).map((t) => normalizeToolName(t.function.name));
    expect(names).toContain('query_tasks');
    expect(names).toContain('update_task');
    expect(names).not.toContain('delegate_batch');
  });

  // The Oracle read set is a read path: the team payloads may carry it, so it must never be
  // classified as a mutation or the employee gate would drop it. Phase 45 added
  // oracle_list_connections as a third read tool; keep the assertion aligned with the source.
  it('ORACLE_READ_TOOLS is exactly the read tools and neither is a mutation', () => {
    const names = ORACLE_READ_TOOLS.map((t) => normalizeToolName(t.function.name));
    expect(names.sort()).toEqual(['oracle_describe', 'oracle_list_connections', 'oracle_query']);
    for (const name of names) {
      expect(isMutationTool(name)).toBe(false);
    }
  });
});

/**
 * Phase 47 D-13 / T-47-06: an explicit remote target from the chat scope must win at the
 * DISPATCH layer. The drawer never calls `executeAiTool` directly — it goes through
 * `dispatchAiToolCall` — so that is the seam these tests pin.
 */
describe('dispatchAiToolCall explicit remote target (Phase 47 D-13)', () => {
  const GLOBAL_ID = 'ssh-global-config';
  const SCOPE_ID = REMOTE_TARGET.sshConfigId;
  let mockDb: any;
  let getSshConfigByIdSpy: any;
  let listRemoteDirSpy: any;
  let executeTeamToolSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    const settingsMap = new Map<string, any>();
    settingsMap.set('ssh_fs_ai_tool_config', {
      key: 'ssh_fs_ai_tool_config',
      value: {
        sshConfigId: GLOBAL_ID,
        defaultBasePath: '/srv/global',
        maxLinesPerRead: 100,
        maxListEntries: 100,
        maxGrepMatches: 50,
      },
    });
    mockDb = {
      settings: { get: vi.fn(async (key: string) => settingsMap.get(key) ?? null) },
    };
    const configFor = (id: string) => ({
      id,
      name: id,
      host: '10.0.0.1',
      port: 22,
      username: 'dev',
      authType: 'password' as const,
      createdAt: '',
      updatedAt: '',
    });
    getSshConfigByIdSpy = vi
      .spyOn(sshService, 'getSshConfigById')
      .mockImplementation(async (id: string) => configFor(id));
    listRemoteDirSpy = vi
      .spyOn(sshService, 'listRemoteDir')
      .mockResolvedValue([] as any);
    vi.spyOn(sshService, 'execRemoteCommand')
      .mockResolvedValue({ stdout: '', stderr: '', exitStatus: 1 } as any);
    executeTeamToolSpy = vi.mocked(executeTeamTool);
    executeTeamToolSpy.mockReset();
    executeTeamToolSpy.mockResolvedValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the scope target sshConfigId to the SSH tool instead of the global config', async () => {
    await dispatchAiToolCall('ssh_list_dir', { path: '.' }, mockDb, undefined, {
      remoteTarget: REMOTE_TARGET,
      callId: 'call-ssh-scope',
    });

    expect(getSshConfigByIdSpy).toHaveBeenCalledWith(SCOPE_ID, mockDb);
    expect(getSshConfigByIdSpy).not.toHaveBeenCalledWith(GLOBAL_ID, mockDb);
    expect(listRemoteDirSpy).toHaveBeenCalledTimes(1);
    expect(listRemoteDirSpy.mock.calls[0]![0].id).toBe(SCOPE_ID);
  });

  it('keeps the global config for an ordinary dispatch with no remote target', async () => {
    await dispatchAiToolCall('ssh_list_dir', { path: '.' }, mockDb, undefined, {
      callId: 'call-global',
    });

    expect(getSshConfigByIdSpy).toHaveBeenCalledWith(GLOBAL_ID, mockDb);
    expect(getSshConfigByIdSpy).not.toHaveBeenCalledWith(SCOPE_ID, mockDb);
  });

  it('remote turn advertises git_read and keeps SSH tools with no global config', () => {
    const names = getToolsForTurnWithRemote({
      effectiveAnalysisMode: false,
      globalSshConfigReady: false,
      hasRemoteTarget: true,
      oracleConfigReady: false,
    }).map((t) => normalizeToolName(t.function.name));
    expect(names).toContain('git_read');
    expect(names).toContain('ssh_list_dir');
    expect(names).toContain('ssh_read_file_page');
    expect(names).toContain('ssh_grep_files');
    // Exactly one team tool is added — never explore_repo or any write tool.
    expect(names.filter((n) => ['git_read', 'explore_repo', 'write_doc'].includes(n))).toEqual(['git_read']);
  });

  it('non-remote turn with no global config keeps SSH tools disabled and advertises no git_read', () => {
    const names = getToolsForTurnWithRemote({
      effectiveAnalysisMode: false,
      globalSshConfigReady: false,
      hasRemoteTarget: false,
      oracleConfigReady: false,
    }).map((t) => normalizeToolName(t.function.name));
    expect(names).not.toContain('git_read');
    expect(names).not.toContain('ssh_list_dir');
    expect(names).not.toContain('ssh_grep_files');
  });

  it('dispatches git_read on a remote turn through the team adapter with the explicit target', async () => {
    await dispatchAiToolCall(
      'git_read',
      { action: 'grep', pattern: 'launch', sshConfigId: 'model-chosen-host', branch: 'model-branch' },
      mockDb,
      undefined,
      { remoteTarget: REMOTE_TARGET, callId: 'call-git-scope' }
    );

    expect(executeTeamToolSpy).toHaveBeenCalledTimes(1);
    const [name, args, ctx] = executeTeamToolSpy.mock.calls[0]!;
    expect(name).toBe('git_read');
    // Model-supplied host/branch selectors must not survive — the scope target wins (ASVS V4).
    expect(args.sshConfigId).toBe(SCOPE_ID);
    expect(args.repoPath).toBe(REMOTE_TARGET.repoPath);
    expect(args.branch).toBe(REMOTE_TARGET.branch);
    expect((ctx as TeamToolContext).remoteTarget).toEqual(REMOTE_TARGET);
    expect((ctx as TeamToolContext).loopCallId).toBe('call-git-scope');
    // A remote-turn dispatch has no team identity; it must not require one.
    expect((ctx as TeamToolContext).db).toBe(mockDb);
  });
});
