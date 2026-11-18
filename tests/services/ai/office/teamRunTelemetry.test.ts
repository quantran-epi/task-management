// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Capture the existing structuredLog substrate without changing production code. */
const structuredLogMock = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => ({ ok: true }))
);
vi.mock('../../../../src/services/ai/log', () => ({
  structuredLog: structuredLogMock,
  createCorrelationId: () => 'cid-generated',
}));

import {
  buildToolTelemetryEvent,
  emitToolTelemetry,
  parseToolTelemetry,
  type ToolCallTelemetryEvent,
} from '../../../../src/services/ai/office/teamRunTelemetry';

function event(overrides: Partial<ToolCallTelemetryEvent> = {}): ToolCallTelemetryEvent {
  return {
    ts: '2026-11-17T10:00:00.000Z',
    teamId: 'team-1',
    agentId: 'agent-1',
    agentKind: 'employee',
    toolCallId: 'call-1',
    toolName: 'explore_repo',
    phase: 'call',
    outcome: 'running',
    ...overrides,
  };
}

describe('teamRunTelemetry — additive structured tool-call observation', () => {
  beforeEach(() => structuredLogMock.mockClear());

  it('parses plain text and unparseable output as done with no error fields', () => {
    expect(parseToolTelemetry(undefined)).toEqual({ outcome: 'done' });
    expect(parseToolTelemetry('plain success')).toEqual({ outcome: 'done' });
    expect(parseToolTelemetry('{ not json')).toEqual({ outcome: 'done' });
    expect(parseToolTelemetry(JSON.stringify({ outcome: 'success', report: 'x' }))).toEqual({
      outcome: 'done',
    });
    expect(parseToolTelemetry(JSON.stringify([1, 2, 3]))).toEqual({ outcome: 'done' });
  });

  it('parses refusal, error and outcome-error payloads with code and detail', () => {
    expect(parseToolTelemetry(JSON.stringify({ refused: true }))).toEqual({ outcome: 'error' });
    expect(
      parseToolTelemetry(JSON.stringify({ refused: true, code: 'INVALID_ARGUMENT' }))
    ).toEqual({ outcome: 'error', errorCode: 'INVALID_ARGUMENT' });
    expect(parseToolTelemetry(JSON.stringify({ error: 'boom' }))).toEqual({ outcome: 'error' });
    expect(
      parseToolTelemetry(JSON.stringify({ outcome: 'error', detail: 'aborted' }))
    ).toEqual({ outcome: 'error', errorDetail: 'aborted' });
    expect(
      parseToolTelemetry(JSON.stringify({ outcome: 'error', detail: 'timeout', code: 'T' }))
    ).toEqual({ outcome: 'error', errorCode: 'T', errorDetail: 'timeout' });
  });

  it('caps error code/detail at 300 chars and ignores non-string values', () => {
    const parsed = parseToolTelemetry(
      JSON.stringify({ outcome: 'error', code: 'C'.repeat(500), detail: 'D'.repeat(500) })
    );
    expect(parsed.errorCode).toHaveLength(300);
    expect(parsed.errorDetail).toHaveLength(300);
    expect(
      parseToolTelemetry(JSON.stringify({ outcome: 'error', code: 123, detail: { x: 1 } }))
    ).toEqual({ outcome: 'error' });
  });

  it('builds an event with an injectable timestamp and only defined optional fields', () => {
    const built = buildToolTelemetryEvent({
      teamId: 'team-1',
      agentId: 'lead-1',
      agentKind: 'lead',
      toolCallId: 'call-2',
      toolName: 'delegate_batch',
      phase: 'result',
      outcome: 'done',
      timestamp: '2026-11-17T09:00:00.000Z',
      durationMs: 12,
    });
    expect(built).toEqual({
      ts: '2026-11-17T09:00:00.000Z',
      teamId: 'team-1',
      agentId: 'lead-1',
      agentKind: 'lead',
      toolCallId: 'call-2',
      toolName: 'delegate_batch',
      phase: 'result',
      outcome: 'done',
      durationMs: 12,
    });
    expect('errorCode' in built).toBe(false);
    expect('abortSource' in built).toBe(false);

    const defaultTs = buildToolTelemetryEvent({
      teamId: 't',
      agentId: 'a',
      agentKind: 'employee',
      toolCallId: 'c',
      toolName: 'git_read',
      phase: 'abort',
      outcome: 'aborted',
      abortSource: 'tool-limit',
    });
    expect(defaultTs.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(defaultTs.abortSource).toBe('tool-limit');
  });

  it('emits via the existing structuredLog with tag TOOL and the right level', () => {
    const entry = event({ phase: 'result', outcome: 'error', errorDetail: 'aborted' });
    emitToolTelemetry(entry);
    expect(structuredLogMock).toHaveBeenCalledTimes(1);
    const [tag, level, correlationId, eventName, fields] = structuredLogMock.mock.calls[0]!;
    expect(tag).toBe('TOOL');
    expect(level).toBe('error');
    expect(correlationId).toBe('cid-generated');
    expect(eventName).toBe('agent_tool_call');
    expect(fields).toMatchObject({
      teamId: 'team-1',
      agentId: 'agent-1',
      agentKind: 'employee',
      toolCallId: 'call-1',
      toolName: 'explore_repo',
      phase: 'result',
      outcome: 'error',
      errorDetail: 'aborted',
      correlationId: 'cid-generated',
    });
    // No raw provider string or token field leaked by this module; redaction is delegated.
    expect(JSON.stringify(fields)).not.toContain('sk-');
  });

  it('uses info level for running/done and error level for aborted', () => {
    emitToolTelemetry(event());
    emitToolTelemetry(event({ phase: 'result', outcome: 'done' }));
    emitToolTelemetry(event({ phase: 'abort', outcome: 'aborted', abortSource: 'user-abort' }));
    expect(structuredLogMock.mock.calls.map((call) => call[1])).toEqual([
      'info',
      'info',
      'error',
    ]);
  });

  it('honors an explicit correlation id so a call/result pair groups together', () => {
    emitToolTelemetry(event({ correlationId: 'pair-1' }));
    expect(structuredLogMock.mock.calls[0]![2]).toBe('pair-1');
    expect((structuredLogMock.mock.calls[0]![4] as Record<string, unknown>).correlationId).toBe(
      'pair-1'
    );
  });
});
