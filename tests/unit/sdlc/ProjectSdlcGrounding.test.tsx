import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { createNewCr } from '../../../src/services/wizard/sdlcCrManager';
import type { SdlcWorkflowMetadata } from '../../../src/services/wizard/workflowSchemas';

const captured = vi.hoisted(() => ({ grounding: '' }));

vi.mock('../../../src/components/sdlc/SdlcWorkspace', () => ({
  SdlcWorkspace: (props: { selectedStep: string; stepGroundingContext?: string }) => {
    captured.grounding = props.stepGroundingContext ?? '';
    return <pre data-testid="grounding-capture" data-step={props.selectedStep}>{props.stepGroundingContext}</pre>;
  },
}));

import { ProjectSdlcView } from '../../../src/views/ProjectSdlcView';

describe('ProjectSdlcView grounding supply', () => {
  it('forwards labeled non-empty grounding for workflow artifacts and missing derived sources', async () => {
    const db = new TaskPlannerDatabase(`grounding-${Math.random()}`);
    const projectId = crypto.randomUUID();
    await db.projects.add({
      id: projectId,
      name: 'Grounding project',
      status: 'In Progress',
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
    const cr = await createNewCr(projectId, metadata, true, db);
    await db.settings.put({
      key: `sdlc_workflow:${projectId}:${cr.id}`,
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

    render(<ProjectSdlcView projectId={projectId} onBack={vi.fn()} db={db} />);
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

    expect(screen.getByTestId('grounding-capture')).toHaveAttribute('data-step', 'SOLUTION');
  });
});

