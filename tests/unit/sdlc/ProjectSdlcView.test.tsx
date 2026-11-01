import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ProjectsView } from '../../../src/views/ProjectsView';
import { ProjectSdlcView } from '../../../src/views/ProjectSdlcView';
import { SdlcSidebar } from '../../../src/components/sdlc/SdlcSidebar';
import { StepChatPanel } from '../../../src/components/sdlc/chat/StepChatPanel';
import { createNewCr } from '../../../src/services/wizard/sdlcCrManager';
import type { SdlcWorkflowMetadata } from '../../../src/services/wizard/workflowSchemas';

describe('ProjectSdlcView and IDE Layout', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'proj-sdlc-test-01';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-sdlc-${Math.random()}`);
    await db.projects.add({
      id: projectId,
      name: 'Ngân hàng số Mobile App',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('Test 1: ProjectsView mounts ProjectSdlcView when onOpenSdlcStudio is triggered and returns on back click', async () => {
    render(<ProjectsView db={db} />);

    // Wait for project row to load
    await waitFor(() => {
      expect(screen.getByText('Ngân hàng số Mobile App')).toBeInTheDocument();
    });

    // Find SDLC Studio button
    const sdlcButton = screen.getByRole('button', { name: /SDLC Studio/i });
    expect(sdlcButton).toBeInTheDocument();

    // Click SDLC Studio -> Should mount ProjectSdlcView
    fireEvent.click(sdlcButton);

    await waitFor(() => {
      expect(screen.getByText(/SDLC Studio — Ngân hàng số Mobile App/i)).toBeInTheDocument();
    });

    // Click Back -> Should return to ProjectTable
    const backBtn = screen.getByRole('button', { name: /Quay lại Dự án/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Dự án & Cột mốc')).toBeInTheDocument();
    });
  });

  it('Test 2: ProjectSdlcView renders 2-column IDE layout with header, sidebar, and workspace', async () => {
    const handleBack = vi.fn();
    render(<ProjectSdlcView projectId={projectId} onBack={handleBack} db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/SDLC Studio — Ngân hàng số Mobile App/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('sdlc-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('sdlc-workspace')).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: /Quay lại/i });
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('Test 3: SdlcSidebar displays CR select dropdown, New CR button, 6 vertical steps and switches steps', async () => {
    const metadata: SdlcWorkflowMetadata = {
      cr: 'CR-2026-999',
      featureName: 'Xác thực khuôn mặt FaceID',
      author: 'Nguyen Van A',
      requestingUnit: 'Trung tâm CNTT',
      date: '2026-11-01',
    };
    await createNewCr(projectId, metadata, false, db);

    const handleSelectStep = vi.fn();
    render(
      <SdlcSidebar
        projectId={projectId}
        selectedStep="INTAKE"
        onSelectStep={handleSelectStep}
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/CR-2026-999/i)).toBeInTheDocument();
    });

    // Check 6 steps presence
    expect(screen.getByText(/Bước 1: Nạp PL01 & PL02/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 3: Coding ngoài/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 4: Nạp Change Pack/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 5: Tài liệu kỹ thuật/i)).toBeInTheDocument();
    expect(screen.getByText(/Bước 6: Tờ trình CAB/i)).toBeInTheDocument();

    // Switch step
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));
    expect(handleSelectStep).toHaveBeenCalledWith('SOLUTION');
  });

  it('Test 4: StepChatPanel loads step-specific thread and isolates chat messages', async () => {
    render(
      <StepChatPanel
        projectId={projectId}
        crId="cr-test-01"
        stepId="INTAKE"
        stepGroundingContext="Grounding for INTAKE"
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Hỏi AI trợ giúp bước này/i)).toBeInTheDocument();
    });

    const thread = await db.chatThreads
      .where('scopeKey')
      .equals(`sdlc:${projectId}:cr-test-01:INTAKE`)
      .first();
    expect(thread).toBeDefined();
    expect(thread?.scopeKey).toBe(`sdlc:${projectId}:cr-test-01:INTAKE`);
  });
});
