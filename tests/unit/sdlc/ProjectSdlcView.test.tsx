import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { ProjectsView } from '../../../src/views/ProjectsView';
import { ProjectSdlcView } from '../../../src/views/ProjectSdlcView';
import { SdlcSidebar } from '../../../src/components/sdlc/SdlcSidebar';
import { StepChatPanel } from '../../../src/components/sdlc/chat/StepChatPanel';
import { createNewCr } from '../../../src/services/wizard/sdlcCrManager';
import type { SdlcWorkflowMetadata } from '../../../src/services/wizard/workflowSchemas';
import { act, cleanup } from '@testing-library/react';
import { createSdlcWorkflowCoordinator, workflowStorageKey } from '../../../src/services/wizard/workflowCoordinator';
import { prepareArtifactPatch, readArtifactSnapshot, type ArtifactPatchProposal, type ArtifactToolKind } from '../../../src/services/ai/sdlcArtifactTools';
import type { SdlcWorkspaceProps } from '../../../src/components/sdlc/SdlcWorkspace';

const patchHost = vi.hoisted(() => ({ workspace: undefined as SdlcWorkspaceProps | undefined }));
vi.mock('../../../src/components/sdlc/SdlcWorkspace', async (original) => {
  const module = await original<typeof import('../../../src/components/sdlc/SdlcWorkspace')>();
  return { ...module, SdlcWorkspace: (props: SdlcWorkspaceProps) => {
    patchHost.workspace = props;
    return <module.SdlcWorkspace {...props} />;
  } };
});

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
        stepGroundingContext={{ text: 'Grounding for INTAKE', present: new Set() }}
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
        stepGroundingContext={{ text: 'Grounding for INTAKE', present: new Set() }}
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
    // Sidebar renders before CR restore; wait for the owning workflow before editing.
    await screen.findByRole('button', { name: /Đặt lại quy trình/i }, { timeout: 5000 });

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
      expect(textarea.isConnected).toBe(true);
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
        stepGroundingContext={{ text: 'Grounding context', present: new Set() }}
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

describe('production artifact patch adapter (27-03)', () => {
  let db: TaskPlannerDatabase;
  let projectId: string;
  let crId: string;

  beforeEach(async () => {
    patchHost.workspace = undefined;
    db = new TaskPlannerDatabase(`production-patch-${crypto.randomUUID()}`);
    projectId = crypto.randomUUID();
    const metadata = { cr: 'CR-PATCH', featureName: 'Patch', author: 'T', requestingUnit: 'IT', date: '2026-11-05' };
    const at = new Date().toISOString();
    await db.projects.add({ id: projectId, name: 'Patch host', status: 'In Progress', createdAt: at, updatedAt: at });
    crId = (await createNewCr(projectId, metadata, false, db)).id;
    const coordinator = createSdlcWorkflowCoordinator({ projectId, threadId: crypto.randomUUID() });
    await coordinator.startOrUpdateIntake(metadata, 'PL01', 'PL02');
    await coordinator.commitSolution('# SOLUTION\n## Mục tiêu\nNội dung gốc.');
    const state = coordinator.getState()!;
    for (const kind of ['PL03B', 'PL07', 'CAB'] as const) {
      const key = kind === 'PL03B' ? 'pl03b' : kind === 'PL07' ? 'pl07' : 'cab';
      const content = `# ${kind}\n## Mục tiêu\nNội dung ${kind}.`;
      const { defaultSha256 } = await import('../../../src/services/wizard/workflowCoordinator');
      state.artifacts[key] = { kind, version: 2, hash: await defaultSha256(content.trim()), title: kind, content,
        sourceHashes: [state.artifacts.solution!.hash], updatedAt: at, approvedAt: at };
    }
    state.artifacts.changePack = { kind: 'CHANGE_PACK', version: 1, hash: 'c'.repeat(64), title: 'PACK',
      sourceHashes: [state.artifacts.solution!.hash], updatedAt: at };
    await db.settings.put({ key: workflowStorageKey(projectId, crId), value: JSON.stringify(state) });
  });

  afterEach(async () => { cleanup(); vi.restoreAllMocks(); await db.delete(); });

  async function openStep(step: 'SOLUTION' | 'TECH_DOCS' | 'CAB' = 'SOLUTION') {
    const view = render(<ProjectSdlcView projectId={projectId} onBack={vi.fn()} db={db} />);
    await screen.findByRole('button', { name: /Đặt lại quy trình/i });
    fireEvent.click(screen.getByTestId(`sidebar-step-${step}`));
    await waitFor(() => expect(patchHost.workspace?.selectedStep).toBe(step));
    await waitFor(() => expect(patchHost.workspace?.workflowState?.artifacts.solution).toBeDefined());
    return view;
  }

  async function proposalFor(kind: ArtifactToolKind = 'SOLUTION') {
    const context = patchHost.workspace?.artifactToolContext;
    expect(context, 'production workspace must forward trusted live artifact context').toBeDefined();
    const snapshot = await readArtifactSnapshot(db, context!, kind);
    expect('markdown' in snapshot).toBe(true);
    const result = await prepareArtifactPatch(db, context!, { kind, sectionId: '1.1', expectedHeading: 'Mục tiêu',
      baseHash: 'baseHash' in snapshot ? snapshot.baseHash : '', operation: 'append', newContent: `Dòng thêm ${kind}.` });
    expect('proposalId' in result).toBe(true);
    return result as ArtifactPatchProposal;
  }

  function decisionFor(proposal: ArtifactPatchProposal) {
    return { id: crypto.randomUUID(), threadId: patchHost.workspace!.artifactToolContext!.getWorkflowState!()!.threadId,
      role: 'system' as const, createdAt: new Date().toISOString(),
      content: `ARTIFACT_PATCH_DECISION ${JSON.stringify({ proposalId: proposal.proposalId, kind: proposal.kind, sectionId: proposal.sectionId, decision: 'approved' })}\nĐã chấp thuận — bản nháp bước này đã được cập nhật.` };
  }

  it('applies a real prepared SOLUTION only through approval, atomically with decision and without workflow mutation', async () => {
    await openStep();
    const proposal = await proposalFor();
    const before = await db.settings.get(workflowStorageKey(projectId, crId));
    const decision = decisionFor(proposal);
    expect(await db.settings.get(`sdlc_draft_solution:${projectId}:${crId}`)).toBeUndefined();
    await act(async () => { await patchHost.workspace!.onApplyArtifactPatch!(proposal, decision); });
    expect((await db.settings.get(`sdlc_draft_solution:${projectId}:${crId}`))?.value).toBe(proposal.patchedMarkdown);
    expect(await db.chatMessages.get(decision.id)).toEqual(decision);
    await waitFor(() => expect(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i)).toHaveValue(proposal.patchedMarkdown));
    expect(await db.settings.get(workflowStorageKey(projectId, crId))).toEqual(before);
    expect((await db.chatMessages.toArray()).filter((row) => row.artifactEvent)).toEqual([]);
  });

  it('rolls back SOLUTION draft and approved decision when the second transaction write fails', async () => {
    await openStep();
    const proposal = await proposalFor();
    const before = await db.settings.get(workflowStorageKey(projectId, crId));
    const decision = decisionFor(proposal);
    const spy = vi.spyOn(db.chatMessages, 'put').mockRejectedValueOnce(new Error('disk failure'));
    await expect(patchHost.workspace!.onApplyArtifactPatch!(proposal, decision)).rejects.toThrow();
    spy.mockRestore();
    expect(await db.settings.get(`sdlc_draft_solution:${projectId}:${crId}`)).toBeUndefined();
    expect(await db.chatMessages.get(decision.id)).toBeUndefined();
    expect(await db.settings.get(workflowStorageKey(projectId, crId))).toEqual(before);
    expect(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i)).toHaveValue(proposal.baseMarkdown);
  });

  it('rejects a whitespace-only manual edit before approval instead of overwriting it', async () => {
    await openStep();
    const proposal = await proposalFor();
    fireEvent.change(screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION.md/i), {
      target: { value: proposal.baseMarkdown + '\n' },
    });
    await expect(patchHost.workspace!.onApplyArtifactPatch!(proposal, decisionFor(proposal))).rejects.toThrow();
    await waitFor(async () => expect((await db.settings.get(`sdlc_draft_solution:${projectId}:${crId}`))?.value)
      .toBe(proposal.baseMarkdown + '\n'));
    expect((await db.chatMessages.toArray()).filter((row) => row.content.startsWith('ARTIFACT_PATCH_DECISION '))).toEqual([]);
  });

  it.each(['PL03B', 'PL07', 'CAB'] as const)('updates only the live %s draft and keeps committed metadata unchanged', async (kind) => {
    await openStep(kind === 'CAB' ? 'CAB' : 'TECH_DOCS');
    const proposal = await proposalFor(kind);
    const before = await db.settings.get(workflowStorageKey(projectId, crId));
    const sibling = kind === 'PL03B' ? 'PL07' : 'PL03B';
    const siblingBefore = patchHost.workspace!.artifactToolContext!.getDraft(sibling);
    await act(async () => { await patchHost.workspace!.onApplyArtifactPatch!(proposal, decisionFor(proposal)); });
    expect(patchHost.workspace!.artifactToolContext!.getDraft(kind)).toBe(proposal.patchedMarkdown);
    expect(patchHost.workspace!.artifactToolContext!.getDraft(sibling)).toBe(siblingBefore);
    expect(await db.settings.get(workflowStorageKey(projectId, crId))).toEqual(before);
    expect(await db.settings.get(`sdlc_draft_solution:${projectId}:${crId}`)).toBeUndefined();
  });

  it('refuses a captured approval adapter after leaving its step', async () => {
    await openStep();
    const proposal = await proposalFor();
    const apply = patchHost.workspace!.onApplyArtifactPatch!;
    fireEvent.click(screen.getByTestId('sidebar-step-INTAKE'));
    await expect(apply(proposal, decisionFor(proposal))).rejects.toThrow();
    expect(await db.settings.get(`sdlc_draft_solution:${projectId}:${crId}`)).toBeUndefined();
  });
});

describe('D-06: opening a historical artifact card', () => {
  it.each(['active', 'archived'] as const)('keeps history read-only and opens a draft for an %s CR', async (status) => {
    const pid = crypto.randomUUID();
    const dbX = new TaskPlannerDatabase(`test-d06-${Math.random()}`);
    await dbX.projects.add({
      id: pid,
      name: 'Dự án lịch sử phiên bản',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const metadata = {
      cr: 'CR-D06',
      featureName: 'Lịch sử',
      author: 'Tester',
      requestingUnit: 'Khối CNTT',
      date: '2026-11-01',
    };
    const cr = await createNewCr(pid, metadata, true, dbX);
    await dbX.settings.put({ key: `sdlc_crs:${pid}`, value: JSON.stringify([{ ...cr, status }]) });
    await dbX.settings.put({ key: `sdlc_draft_solution:${pid}:${cr.id}`, value: '# SOLUTION v3 bản nháp' });

    const ref = (version: number, content: string) => ({
      kind: 'SOLUTION' as const,
      version,
      hash: String(version).repeat(64),
      title: `SOLUTION.md — v${version}`,
      content,
      sourceHashes: [],
      updatedAt: new Date().toISOString(),
    });

    await dbX.settings.put({
      key: `sdlc_workflow:${pid}:${cr.id}`,
      value: JSON.stringify({
        schemaVersion: 1,
        sessionId: crypto.randomUUID(),
        projectId: pid,
        threadId: crypto.randomUUID(),
        currentStep: 'SOLUTION',
        metadata,
        artifacts: {
          pl01: { ...ref(1, 'PL01'), kind: 'PL01' },
          pl02: { ...ref(1, 'PL02'), kind: 'PL02' },
          solution: ref(2, '# SOLUTION v2 hiện hành'),
        },
        activeVersions: { SOLUTION: 2 },
        versions: { SOLUTION: [ref(1, '# SOLUTION v1 lịch sử'), ref(2, '# SOLUTION v2 hiện hành')] },
        staleSteps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    // One persisted card for the superseded v1.
    const threadId = crypto.randomUUID();
    await dbX.chatThreads.add({
      id: threadId,
      title: '[SDLC] SOLUTION',
      scopeKey: `sdlc:${pid}:${cr.id}:SOLUTION`,
      scopeType: 'project',
      entityId: pid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await dbX.chatMessages.add({
      id: crypto.randomUUID(),
      threadId,
      role: 'assistant',
      content: 'Đã phê duyệt SOLUTION v1',
      createdAt: new Date().toISOString(),
      artifactEvent: {
        eventId: crypto.randomUUID(),
        kind: 'SOLUTION',
        title: 'SOLUTION.md — v1',
        version: 1,
        hash: '1'.repeat(64),
        status: 'approved',
      },
    });

    await dbX.chatMessages.add({
      id: crypto.randomUUID(),
      threadId,
      role: 'assistant',
      content: 'Bản nháp SOLUTION v3',
      createdAt: new Date().toISOString(),
      artifactEvent: {
        eventId: crypto.randomUUID(),
        kind: 'SOLUTION',
        title: 'SOLUTION.md — v3 draft',
        version: 3,
        hash: '3'.repeat(64),
        status: 'draft',
        ctaLabel: 'Mở trình soạn thảo',
      },
    });

    render(<ProjectSdlcView projectId={pid} onBack={vi.fn()} db={dbX} />);

    await waitFor(() => {
      expect(screen.getByText(/Bước 2: Thiết kế giải pháp/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText(/Bước 2: Thiết kế giải pháp/i)[0]!);

    // Open the v1 card from the transcript ("Xem chi tiết" on the persisted card).
    await waitFor(() => expect(screen.getAllByTestId('ai-artifact-event-card')).toHaveLength(2));
    const card = screen.getAllByTestId('ai-artifact-event-card').find((card) => card.textContent?.includes('SOLUTION.md — v1'))!;
    expect(within(card).getByRole('button', { name: 'Mở tài liệu' })).toBeDisabled();
    fireEvent.click(within(card).getByRole('button', { name: /Xem chi tiết/i }));

    // The editor shows the historical body, not the active v2.
    const textarea = await screen.findByPlaceholderText(
      /Nội dung kiến trúc giải pháp SOLUTION\.md/i
    ) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toContain('v1 lịch sử');
      expect(textarea.value).not.toContain('v2 hiện hành');
    });

    // Read-only: approval is blocked and the editor is not editable.
    expect(textarea).toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })
    ).toBeDisabled();

    const draftCard = screen.getAllByTestId('ai-artifact-event-card').find((card) => card.textContent?.includes('v3 draft'))!;
    const openEditor = within(draftCard).getByRole('button', { name: 'Mở trình soạn thảo' });
    if (status === 'archived') {
      expect(openEditor).toBeDisabled();
      fireEvent.click(within(draftCard).getByRole('button', { name: 'Xem chi tiết' }));
    } else {
      expect(openEditor).toBeEnabled();
      fireEvent.click(openEditor);
    }
    const draftEditor = screen.getByPlaceholderText(/Nội dung kiến trúc giải pháp SOLUTION\.md/i);
    await waitFor(() => expect(draftEditor).toHaveValue('# SOLUTION v3 bản nháp'));
    if (status === 'archived') {
      expect(draftEditor).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })).toBeDisabled();
    } else {
      expect(draftEditor).not.toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })).toBeEnabled();
      fireEvent.change(draftEditor, { target: { value: '# SOLUTION v3 đã sửa' } });
      await waitFor(async () => {
        expect((await dbX.settings.get(`sdlc_draft_solution:${pid}:${cr.id}`))?.value).toBe('# SOLUTION v3 đã sửa');
      });
    }
  });
});
