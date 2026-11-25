// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeAiToolMock = vi.hoisted(() => vi.fn());

vi.mock('../../aiTools', () => ({ executeAiTool: executeAiToolMock, normalizeToolName: (name: string) => name }));

import {
  AGENT_DEVELOPER_ONLY_TEAM_TOOLS,
  TEAM_TOOL_DEFINITIONS,
  agentDeveloperFileToolName,
  executeTeamTool,
  type TeamToolContext,
} from '../teamTools';
import type { TaskPlannerDatabase } from '../../../../db';

const db = {} as TaskPlannerDatabase;
const signal = new AbortController().signal;

function ctx(overrides: Partial<TeamToolContext> = {}): TeamToolContext {
  return {
    db,
    teamId: 't1',
    threadId: 'th1',
    agentId: 'a1',
    agentName: 'Agent Developer',
    role: 'employee',
    fileGenerationAllowed: true,
    signal,
    ...overrides,
  };
}

const ARGS = { filename: 'report.ts', format: 'txt', content: 'export const x = 1;\n' };
const SUCCESS = JSON.stringify({
  success: true,
  filename: 'report.ts',
  format: 'txt',
  sizeBytes: 19,
  content: ARGS.content,
});

describe('generate_code_file team tool definition', () => {
  it('advertises exactly one content-only file tool and no worktree edit tool', () => {
    const names = TEAM_TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names.filter((name) => name === agentDeveloperFileToolName)).toHaveLength(1);
    expect(names).not.toContain('code_edit');
    expect(AGENT_DEVELOPER_ONLY_TEAM_TOOLS).toEqual(new Set([agentDeveloperFileToolName]));

    const def = TEAM_TOOL_DEFINITIONS.find(
      (tool) => tool.function.name === agentDeveloperFileToolName
    )!;
    const params = def.function.parameters as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { enum?: string[] }>;
    };
    expect(params.required).toEqual(expect.arrayContaining(['filename', 'content']));
    expect(params.additionalProperties).toBe(false);
    expect(params.properties).not.toHaveProperty('script');
    expect(params.properties.format?.enum).toEqual(['md', 'txt', 'docx', 'xlsx', 'csv', 'pptx']);
  });
});

describe('generate_code_file dispatch', () => {
  beforeEach(() => {
    executeAiToolMock.mockReset();
    executeAiToolMock.mockResolvedValue(SUCCESS);
  });

  it('refuses callers without the developer capability before any file work', async () => {
    const plain = await executeTeamTool(
      agentDeveloperFileToolName,
      ARGS,
      ctx({ fileGenerationAllowed: undefined })
    );
    const lead = await executeTeamTool(
      agentDeveloperFileToolName,
      ARGS,
      ctx({ role: 'lead' })
    );
    const spoofedName = await executeTeamTool(
      agentDeveloperFileToolName,
      ARGS,
      ctx({ agentName: 'Agent Developer', fileGenerationAllowed: undefined })
    );

    for (const result of [plain, lead, spoofedName]) {
      expect(JSON.parse(result)).toMatchObject({ code: 'FILE_GENERATION_NOT_ALLOWED' });
    }
    expect(executeAiToolMock).not.toHaveBeenCalled();
  });

  it('refuses empty filename or content', async () => {
    expect(JSON.parse(await executeTeamTool(agentDeveloperFileToolName, { ...ARGS, filename: '' }, ctx())))
      .toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(JSON.parse(await executeTeamTool(agentDeveloperFileToolName, { ...ARGS, content: '  ' }, ctx())))
      .toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(executeAiToolMock).not.toHaveBeenCalled();
  });

  it('returns the executeAiTool result verbatim', async () => {
    const result = await executeTeamTool(agentDeveloperFileToolName, ARGS, ctx());
    expect(result).toBe(SUCCESS);
    expect(executeAiToolMock).toHaveBeenCalledWith(
      'generate_file',
      { filename: 'report.ts', format: 'txt', content: ARGS.content },
      db,
      signal
    );
  });

  it('drops script, host and repo arguments supplied by the model', async () => {
    await executeTeamTool(
      agentDeveloperFileToolName,
      {
        ...ARGS,
        script: 'fetch("https://evil.invalid")',
        sshConfigId: 'ssh-1',
        repoPath: '/main-checkout',
        worktreeDescriptor: { remoteWorktreePath: '/repo' },
      },
      ctx()
    );

    expect(executeAiToolMock).toHaveBeenCalledWith(
      'generate_file',
      { filename: 'report.ts', format: 'txt', content: ARGS.content },
      db,
      signal
    );
    const forwarded = JSON.stringify(executeAiToolMock.mock.calls);
    expect(forwarded).not.toContain('evil.invalid');
    expect(forwarded).not.toContain('main-checkout');
  });
});
