import { describe, it, expect } from 'vitest';
import * as composer from '../../../src/services/ai/sdlcPromptComposer';

/**
 * Wave 0 contract for plan 31.2-16 Task 1 (ENT-NORM-05, D-39).
 *
 * Step 2 must ask for and render exactly one `### [CODE] subsystem-name` section per CR
 * target, in `cr.targets` order, with an explicit unaffected marker instead of an empty
 * section. RED until plan 16 lands: `buildSubsystemSectionContract` does not exist yet, so
 * every lookup goes through the module namespace and fails as an assertion, not a
 * collection error.
 */
const mod = composer as unknown as Record<string, any>;

const TARGETS = [
  { systemId: '11111111-1111-4111-8111-111111111111', code: 'SC-AUTH-API', name: 'Card Authorization API' },
  { systemId: '22222222-2222-4222-8222-222222222222', code: 'SC-LEDGER', name: 'Card Ledger Service' },
];

const UNAFFECTED_MARKER = 'Không có thay đổi ở subsystem này';

describe('buildSubsystemSectionContract — per-subsystem Step 2 contract (D-39)', () => {
  it('is exported as a function', () => {
    expect(typeof mod.buildSubsystemSectionContract).toBe('function');
  });

  it('emits one ### [CODE] name template line per target', () => {
    const segment: string = mod.buildSubsystemSectionContract(TARGETS);
    expect(segment).toContain('### [');
    expect(segment).toContain('### [SC-AUTH-API] Card Authorization API');
    expect(segment).toContain('### [SC-LEDGER] Card Ledger Service');
    expect(segment.match(/### \[/g)).toHaveLength(2);
  });

  it('lists target codes in cr.targets order', () => {
    const segment: string = mod.buildSubsystemSectionContract(TARGETS);
    expect(segment.indexOf('SC-AUTH-API')).toBeLessThan(segment.indexOf('SC-LEDGER'));
  });

  it('requires the explicit unaffected marker instead of an empty section', () => {
    const segment: string = mod.buildSubsystemSectionContract(TARGETS);
    expect(segment).toContain(UNAFFECTED_MARKER);
  });

  it('emits nothing when the CR has no targets', () => {
    expect(mod.buildSubsystemSectionContract([])).toBe('');
  });
});

describe('composeSdlcTurn — subsystem section placement', () => {
  it('includes the per-subsystem section for SOLUTION', () => {
    const composed = mod.composeSdlcTurn({
      step: 'SOLUTION',
      intent: 'qa',
      targets: TARGETS,
      userTurn: 'Soạn giải pháp',
    });
    expect(composed.segments.subsystemSections).toContain('### [SC-AUTH-API]');
  });

  it('does not include the per-subsystem section for other steps', () => {
    const composed = mod.composeSdlcTurn({
      step: 'INTAKE',
      intent: 'qa',
      targets: TARGETS,
      userTurn: 'Rà hồ sơ',
    });
    expect(composed.segments.subsystemSections ?? '').toBe('');
  });

  it('keeps the policy layer first in the system message', () => {
    const composed = mod.composeSdlcTurn({
      step: 'SOLUTION',
      intent: 'qa',
      targets: TARGETS,
      userTurn: 'Soạn giải pháp',
    });
    expect(composed.messages[0]?.content.startsWith(composer.SHARED_EVIDENCE_POLICY)).toBe(true);
  });
});

describe('buildToolPolicy — machine-parsed name lines equal the payload', () => {
  it('names exactly the available local read tools', () => {
    const available = ['query_notes', 'read_file', 'get_artifact', 'patch_artifact_section'];
    const policy = composer.buildToolPolicy('SOLUTION', [], available);
    expect(policy).toContain('Công cụ đọc cục bộ: query_notes, read_file, get_artifact');
    expect(policy).toContain('MCP đọc-only động: không có trong payload của turn này');
  });

  it('names exactly the dynamic MCP tools supplied', () => {
    const policy = composer.buildToolPolicy('SOLUTION', ['mcp_search', 'mcp_fetch'], []);
    expect(policy).toContain('MCP đọc-only động: mcp_search, mcp_fetch');
  });

  it('never advertises a tool outside the step allow-list', () => {
    const policy = composer.buildToolPolicy('INTAKE', ['patch_artifact_section'], ['patch_artifact_section']);
    expect(policy).not.toContain('patch_artifact_section,');
    expect(policy).not.toContain('Công cụ đọc cục bộ: patch_artifact_section');
  });
});
