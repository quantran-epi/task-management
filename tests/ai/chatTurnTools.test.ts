import { describe, it, expect } from 'vitest';
import {
  EMPLOYEE_READ_ONLY_ALLOWLIST,
  LEAD_TOOL_ALLOWLIST,
  getToolsForTurn,
  payloadHasMutationTool,
} from '../../src/services/ai/chatTurnTools';
import { AI_DATABASE_TOOLS, isMutationTool, normalizeToolName } from '../../src/services/ai/aiTools';

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
});
