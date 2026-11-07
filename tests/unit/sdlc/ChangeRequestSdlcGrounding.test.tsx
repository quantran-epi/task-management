import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import type { SdlcWorkflowMetadata } from '../../../src/services/wizard/workflowSchemas';

const captured = vi.hoisted(() => ({ grounding: '', present: new Set<string>() as ReadonlySet<string> }));

vi.mock('../../../src/components/sdlc/SdlcWorkspace', () => ({
  SdlcWorkspace: (props: { selectedStep: string; stepGroundingContext?: { text: string; present: ReadonlySet<string> } }) => {
    captured.grounding = props.stepGroundingContext?.text ?? '';
    captured.present = props.stepGroundingContext?.present ?? new Set<string>();
    return <pre data-testid="grounding-capture" data-step={props.selectedStep}>{captured.grounding}</pre>;
  },
}));

import { ChangeRequestSdlcView } from '../../../src/views/ChangeRequestSdlcView';

describe('ChangeRequestSdlcView grounding supply', () => {
  it('forwards labeled non-empty grounding for workflow artifacts and missing derived sources', async () => {
    const db = new TaskPlannerDatabase(`grounding-${Math.random()}`);
    const projectId = crypto.randomUUID();
    await db.changeRequests.add({
      id: projectId,
      name: 'Grounding CR',
      code: 'CR-GROUNDING',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const metadata: SdlcWorkflowMetadata = {
      cr: 'CR-GROUNDING',
      featureName: 'Grounded feature',
      author: 'Tester',
      requestingUnit: 'CNTT',
      date: '2026-11-03',
    };
    await db.settings.put({
      key: `sdlc_workflow:${projectId}:${projectId}`,
      value: JSON.stringify({
        schemaVersion: 1,
        sessionId: crypto.randomUUID(),
        projectId,
        threadId: crypto.randomUUID(),
        currentStep: 'SOLUTION',
        metadata,
        artifacts: {
          pl01: { kind: 'PL01', version: 1, hash: 'a'.repeat(64), title: 'PL01.md', content: 'PL01 requirement', sourceHashes: [], updatedAt: new Date().toISOString() },
          pl02: { kind: 'PL02', version: 1, hash: 'b'.repeat(64), title: 'PL02.md', content: 'PL02 acceptance', sourceHashes: [], updatedAt: new Date().toISOString() },
        },
        staleSteps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    render(<ChangeRequestSdlcView changeRequestId={projectId} onBack={vi.fn()} db={db} />);
    await waitFor(() => expect(captured.grounding).toContain('CR-GROUNDING'));
    expect(captured.grounding).toContain('[CR_METADATA]');
    expect(captured.grounding).toContain('CR-GROUNDING');
    expect(captured.grounding).toContain('PL01 requirement');
    expect(captured.grounding).toContain('PL02 acceptance');
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));
    await waitFor(() => expect(captured.grounding).toContain('[MISSING: SOLUTION'));
    expect(captured.grounding).toContain('[CR_METADATA]');
    expect(captured.grounding).toContain('CR-GROUNDING');
    expect(captured.grounding).toContain('[EVIDENCE_STATUS]');
    expect(captured.grounding).not.toContain('[DỮ LIỆU NGỮ CẢNH');
    expect(captured.grounding).not.toContain('[HẾT DỮ LIỆU NGỮ CẢNH]');
    // CR-01: the gate consumes the real marker set, not the rendered text.
    expect(captured.present.has('PL01')).toBe(true);
    expect(captured.present.has('PL02')).toBe(true);
    expect(captured.present.has('SOLUTION')).toBe(false);

    expect(screen.getByTestId('grounding-capture')).toHaveAttribute('data-step', 'SOLUTION');
  });
});

