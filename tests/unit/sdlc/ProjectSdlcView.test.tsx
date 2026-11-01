import { describe, it, expect, vi } from 'vitest';
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

  it('Test 5: Explicit solution analysis and editor draft persistence across step switches', async () => {
    render(<ProjectSdlcView projectId={projectId} onBack={vi.fn()} db={db} />);

    await waitFor(() => {
      expect(screen.getByText(/SDLC Studio — Ngân hàng số Mobile App/i)).toBeInTheDocument();
    });

    // Advance to Step 2
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i) as HTMLTextAreaElement;

    // Type a draft
    fireEvent.change(textarea, { target: { value: '# Draft Architecture v1\nPersisted across navigation.' } });

    // Navigate to Step 3 — the handoff is gated because no SOLUTION is approved yet (D-20).
    fireEvent.click(screen.getByText(/Bước 3: Coding ngoài/i));

    await waitFor(() => {
      expect(screen.getByText(/Lệnh đóng gói Change Pack/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('step3-prerequisite-guard')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Đã code xong — Chuyển sang Nạp Change Pack/i })
    ).toBeDisabled();

    // Navigate back to Step 2 -> draft must still be there without auto-running AI.
    // The sidebar and the Step 3 guard CTA both name Step 2; click the sidebar entry.
    const step2Labels = screen.getAllByText(/Bước 2: Thiết kế giải pháp/i);
    fireEvent.click(step2Labels[0]!);

    await waitFor(() => {
      const reloadedTextarea = screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i) as HTMLTextAreaElement;
      expect(reloadedTextarea.value).toContain('Persisted across navigation.');
    });
  });

  it('Test 6: StepChatPanel renders compact toolbox with Model selector and unified MCP button without header overflow', async () => {
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
      expect(screen.getByTestId('chat-tab-toolbox')).toBeInTheDocument();
    });

    // Model selector is present
    expect(screen.getByLabelText(/Chọn mô hình AI cho tab này/i)).toBeInTheDocument();

    // Unified MCP button is present and clicking it does not toggle or throw
    const mcpBtn = screen.getByTestId('tab-mcp-manage-btn');
    expect(mcpBtn).toBeInTheDocument();
    fireEvent.click(mcpBtn);

    // Compact options menu button is present
    const compactMoreBtn = screen.getByTestId('tab-compact-more-btn');
    expect(compactMoreBtn).toBeInTheDocument();
  });

  it('Test 7: Regression UAT-2: Auto-extracted SOLUTION.md does not crash DAG staleness detector with TypeError', async () => {
    const dbTest7 = new TaskPlannerDatabase(`test-sdlc-7-${Math.random()}`);
    const proj7Id = 'proj-sdlc-test-07';
    await dbTest7.projects.add({
      id: proj7Id,
      name: 'Ngân hàng số Mobile App',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Setup initial CR and Intake state with PL01 and PL02
    const metadata: SdlcWorkflowMetadata = {
      cr: 'CR-2026-REGRESSION',
      featureName: 'Xác thực sinh trắc học',
      author: 'Nguyen Van A',
      requestingUnit: 'Trung tâm CNTT',
      date: '2026-11-01',
    };
    const cr = await createNewCr(proj7Id, metadata, true, dbTest7);

    // Seed workflow state with PL01 and PL02
    const initialState = {
      schemaVersion: 1,
      sessionId: 'sess-01',
      projectId: proj7Id,
      threadId: 'thread-01',
      currentStep: 'SOLUTION',
      metadata,
      artifacts: {
        pl01: {
          kind: 'PL01',
          version: 1,
          hash: 'a'.repeat(64),
          title: 'PL01 Title',
          content: 'Yêu cầu nghiệp vụ PL01',
          sourceHashes: [],
          updatedAt: new Date().toISOString(),
        },
        pl02: {
          kind: 'PL02',
          version: 1,
          hash: 'b'.repeat(64),
          title: 'PL02 Title',
          content: 'Đặc tả chức năng PL02',
          sourceHashes: ['a'.repeat(64)],
          updatedAt: new Date().toISOString(),
        },
      },
      staleSteps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dbTest7.settings.put({
      key: `sdlc_workflow:${proj7Id}:${cr.id}`,
      value: JSON.stringify(initialState),
    });

    render(<ProjectSdlcView projectId={proj7Id} onBack={vi.fn()} db={dbTest7} />);

    // Go to Step 2
    await waitFor(() => {
      expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i)).toBeInTheDocument();
    });

    // Simulate StepChatPanel emitting onSolutionExtracted (or editor keystrokes)
    const textarea = screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '# SOLUTION — Xác thực sinh trắc học\n## 1. Kiến trúc hệ thống\nAPI FaceID.' } });

    // Ensure no crash occurs and SdlcStaleBanner renders without throwing TypeError
    await waitFor(async () => {
      const draftRow = await dbTest7.settings.get(`sdlc_draft_solution:${proj7Id}:${cr.id}`);
      expect(draftRow?.value).toContain('Kiến trúc hệ thống');
    });

    // Textarea still has the updated content and UI did not crash into white screen
    expect(textarea.value).toContain('API FaceID');
    expect(screen.getByTestId('sdlc-workspace')).toBeInTheDocument();
  });

  it('Test 9: approving SOLUTION persists a durable artifact card for that version', async () => {
    const proj9Id = crypto.randomUUID();
    const db9 = new TaskPlannerDatabase(`test-sdlc-9-${Math.random()}`);
    await db9.projects.add({
      id: proj9Id,
      name: 'Dự án thẻ tài liệu',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const metadata: SdlcWorkflowMetadata = {
      cr: 'CR-09',
      featureName: 'Thẻ tài liệu',
      author: 'Tester',
      requestingUnit: 'Khối CNTT',
      date: '2026-11-01',
    };
    const cr = await createNewCr(proj9Id, metadata, true, db9);
    await db9.settings.put({
      key: `sdlc_workflow:${proj9Id}:${cr.id}`,
      value: JSON.stringify({
        schemaVersion: 1,
        sessionId: crypto.randomUUID(),
        projectId: proj9Id,
        threadId: crypto.randomUUID(),
        currentStep: 'SOLUTION',
        metadata,
        artifacts: {
          pl01: {
            kind: 'PL01',
            version: 1,
            hash: 'a'.repeat(64),
            title: 'PL01',
            content: 'Yêu cầu nghiệp vụ',
            sourceHashes: [],
            updatedAt: new Date().toISOString(),
          },
          pl02: {
            kind: 'PL02',
            version: 1,
            hash: 'b'.repeat(64),
            title: 'PL02',
            content: 'Đặc tả chức năng',
            sourceHashes: [],
            updatedAt: new Date().toISOString(),
          },
        },
        staleSteps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    render(<ProjectSdlcView projectId={proj9Id} onBack={() => {}} db={db9} />);

    await waitFor(() => {
      expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(
      /Nội dung kiến trúc giải pháp SOLUTION.md/i
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '# SOLUTION\nKiến trúc xác thực.' } });

    await waitFor(() => {
      expect((screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }));

    await waitFor(async () => {
      const cards = (await db9.chatMessages.toArray()).filter((m) => m.artifactEvent);
      expect(cards.length).toBe(1);
      expect(cards[0]!.artifactEvent).toMatchObject({
        kind: 'SOLUTION',
        status: 'approved',
        version: 1,
      });
      expect(cards[0]!.artifactEvent!.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    // The card lives in the SOLUTION step thread, not in whichever step is on screen.
    const solutionThread = await db9.chatThreads
      .where('scopeKey')
      .equals(`sdlc:${proj9Id}:${cr.id}:SOLUTION`)
      .first();
    expect(solutionThread).toBeTruthy();
    const inThread = (await db9.chatMessages.toArray()).filter(
      (m) => m.threadId === solutionThread!.id && m.artifactEvent
    );
    expect(inThread.length).toBe(1);
  });

  it('Test 10: re-approving a superseded SOLUTION does not rewrite the earlier card', async () => {
    const proj10Id = crypto.randomUUID();
    const db10 = new TaskPlannerDatabase(`test-sdlc-10-${Math.random()}`);
    await db10.projects.add({
      id: proj10Id,
      name: 'Dự án nhiều phiên bản',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const metadata: SdlcWorkflowMetadata = {
      cr: 'CR-10',
      featureName: 'Nhiều phiên bản',
      author: 'Tester',
      requestingUnit: 'Khối CNTT',
      date: '2026-11-01',
    };
    const cr10 = await createNewCr(proj10Id, metadata, true, db10);
    await db10.settings.put({
      key: `sdlc_workflow:${proj10Id}:${cr10.id}`,
      value: JSON.stringify({
        schemaVersion: 1,
        sessionId: crypto.randomUUID(),
        projectId: proj10Id,
        threadId: crypto.randomUUID(),
        currentStep: 'SOLUTION',
        metadata,
        artifacts: {
          pl01: {
            kind: 'PL01',
            version: 1,
            hash: 'a'.repeat(64),
            title: 'PL01',
            content: 'Yêu cầu nghiệp vụ',
            sourceHashes: [],
            updatedAt: new Date().toISOString(),
          },
          pl02: {
            kind: 'PL02',
            version: 1,
            hash: 'b'.repeat(64),
            title: 'PL02',
            content: 'Đặc tả chức năng',
            sourceHashes: [],
            updatedAt: new Date().toISOString(),
          },
        },
        staleSteps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    render(<ProjectSdlcView projectId={proj10Id} onBack={() => {}} db={db10} />);

    await waitFor(() => {
      expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Bước 2: Thiết kế giải pháp/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(
      /Nội dung kiến trúc giải pháp SOLUTION.md/i
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '# SOLUTION v1' } });
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }));

    await waitFor(async () => {
      expect((await db10.chatMessages.toArray()).filter((m) => m.artifactEvent).length).toBe(1);
    });
    const firstCard = (await db10.chatMessages.toArray()).find((m) => m.artifactEvent)!;
    const firstSnapshot = JSON.stringify(firstCard.artifactEvent);

    fireEvent.change(textarea, { target: { value: '# SOLUTION v2' } });
    await waitFor(() => {
      expect(textarea.value).toContain('v2');
      expect((screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION.md/i }));

    await waitFor(async () => {
      const cards = (await db10.chatMessages.toArray()).filter((m) => m.artifactEvent);
      expect(cards.length).toBe(2);
      expect(cards.map((c) => c.artifactEvent!.version).sort()).toEqual([1, 2]);
    });

    const cards = (await db10.chatMessages.toArray()).filter((m) => m.artifactEvent);
    expect(JSON.stringify(cards.find((c) => c.id === firstCard.id)!.artifactEvent)).toBe(firstSnapshot);
  });

  it('Test 8: StepChatPanel renders thread history through the shared AiChatWidget', async () => {
    // Seed a thread with a long user message and a long assistant message
    const thread = await db.chatThreads.add({
      id: 'thread-test-collapse',
      title: 'Step Thread',
      scopeKey: `sdlc:${projectId}:cr-test-01:SOLUTION`,
      scopeType: 'project',
      entityId: projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const longUserMessage = 'Dòng yêu cầu phân tích kiến trúc:\n'.repeat(10);
    const longAssistantMessage = 'Chi tiết phân tích kỹ thuật của AI:\n' + 'Nội dung rất dài về các module hệ thống.\n'.repeat(10);

    await db.chatMessages.bulkAdd([
      {
        id: 'msg-user-1',
        threadId: thread,
        role: 'user',
        content: longUserMessage,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg-assistant-1',
        threadId: thread,
        role: 'assistant',
        content: longAssistantMessage,
        createdAt: new Date(Date.now() + 2).toISOString(),
      },
    ]);

    render(
      <StepChatPanel
        projectId={projectId}
        crId="cr-test-01"
        stepId="SOLUTION"
        stepGroundingContext="Grounding context"
        db={db}
      />
    );

    // D-25: the step chat is the shared widget, slotted into the step scope.
    await waitFor(() => {
      const widget = screen.getByTestId('ai-chat-widget');
      expect(widget).toHaveAttribute('data-scope-key', `sdlc:${projectId}:cr-test-01:SOLUTION`);
    });

    // Both persisted messages render, and the widget does not re-implement a collapse control.
    await waitFor(() => {
      expect(screen.getByText(/Dòng yêu cầu phân tích kiến trúc/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Chi tiết phân tích kỹ thuật của AI/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xem thêm/i })).not.toBeInTheDocument();
  });
});
