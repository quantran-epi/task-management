import { describe, expect, it } from 'vitest';
import { getToolsForTurn } from '../../src/services/ai/chatTurnTools';
import type { AiToolDefinition } from '../../src/services/ai/aiTools';

const STUDIO_TOOLS = ['get_artifact', 'patch_artifact_section'] as const;
const names = (tools: AiToolDefinition[]) => tools.map((tool) => tool.function.name);

const mcpTool = (name: string): AiToolDefinition => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
});

describe('getToolsForTurn artifact-tool allowlist (T-35-37)', () => {
  it('omits studio tools without an explicit allowlist', () => {
    for (const analysisMode of [false, true]) {
      const tools = names(getToolsForTurn(analysisMode));
      expect(tools).not.toContain('get_artifact');
      expect(tools).not.toContain('patch_artifact_section');
    }
  });

  it('returns exactly the studio tools when explicitly allowlisted', () => {
    expect(names(getToolsForTurn(false, [], [...STUDIO_TOOLS]))).toEqual([...STUDIO_TOOLS]);
  });

  it('returns an empty payload for an empty allowlist', () => {
    expect(getToolsForTurn(false, [], [])).toEqual([]);
  });

  it('strips the mutation tool under Analysis Mode with an explicit allowlist', () => {
    expect(names(getToolsForTurn(true, [], [...STUDIO_TOOLS]))).toEqual(['get_artifact']);
  });

  it('never emits the retired proposal tools in any payload shape', () => {
    const shapes = [
      getToolsForTurn(false),
      getToolsForTurn(true),
      getToolsForTurn(false, [mcpTool('read_mcp')]),
      getToolsForTurn(true, [mcpTool('read_mcp')]),
      getToolsForTurn(false, [], []),
      getToolsForTurn(true, [], [...STUDIO_TOOLS]),
      getToolsForTurn(false, [mcpTool('anything')], ['get_artifact']),
    ];
    for (const shape of shapes) {
      const toolNames = names(shape);
      expect(toolNames).not.toContain('propose_subsystems');
      expect(toolNames).not.toContain('propose_research');
    }
  });
});
