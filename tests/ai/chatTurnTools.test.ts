import { describe, it, expect } from 'vitest';
import {
  EMPLOYEE_READ_ONLY_ALLOWLIST,
  LEAD_TOOL_ALLOWLIST,
  getToolsForTurn,
  payloadHasMutationTool,
} from '../../src/services/ai/chatTurnTools';
import { AI_DATABASE_TOOLS, ORACLE_READ_TOOLS, isMutationTool, normalizeToolName } from '../../src/services/ai/aiTools';

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

  // The Oracle pair is a read path: the team payloads may carry it, so it must never be
  // classified as a mutation or the employee gate would drop it.
  it('ORACLE_READ_TOOLS is exactly the two read tools and neither is a mutation', () => {
    const names = ORACLE_READ_TOOLS.map((t) => normalizeToolName(t.function.name));
    expect(names.sort()).toEqual(['oracle_describe', 'oracle_query']);
    for (const name of names) {
      expect(isMutationTool(name)).toBe(false);
    }
  });
});
