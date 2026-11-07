import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { SdlcSidebar } from '../../src/components/sdlc/SdlcSidebar';
import { Step3CodeGuideView } from '../../src/components/sdlc/steps/Step3CodeGuideView';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { loadMultiRepoConventions } from '../../src/services/conventionService';
import { buildConventionsSegment } from '../../src/services/ai/sdlcPromptComposer';
import type { System } from '../../src/types/models';

describe('ProjectSdlcViewMultiSystem Integration', () => {
  let db: TaskPlannerDatabase;
  let parentSys: System;
  let subSys1: System;
  let subSys2: System;

  const validSshId1 = '00000000-0000-4000-8000-000000000001';
  const validSshId2 = '00000000-0000-4000-8000-000000000002';

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-multi-sdlc-' + Math.random().toString(36).slice(2));
    await db.open();

    parentSys = await createSystem(
      {
        name: 'Enterprise Core System',
        code: 'CORE-SYS',
        type: 'LOGICAL_GROUP',
      },
      db
    );

    subSys1 = await createSystem(
      {
        name: 'Payment Service',
        code: 'PAY-SVC',
        parentId: parentSys.id,
        type: 'SERVICE',
        sshConfigId: validSshId1,
        remoteRepoPath: '/var/repos/payment-service',
        defaultBaseBranch: 'origin/main',
      },
      db
    );

    subSys2 = await createSystem(
      {
        name: 'Billing DB Schema',
        code: 'BILL-DB',
        parentId: parentSys.id,
        type: 'SCHEMA',
        sshConfigId: validSshId2,
        remoteRepoPath: '/var/repos/billing-db',
        defaultBaseBranch: 'origin/master',
      },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
  });

  it('SdlcSidebar renders active CR with type tag and target subsystem pills', async () => {
    const cr = await createChangeRequest(
      {
        name: 'Instant Payment Settlement',
        code: 'CR-PAY-01',
        type: 'NEW_FEATURE',
        status: 'Open',
        targetSystemIds: [subSys1.id, subSys2.id],
      },
      db
    );

    render(
      <SdlcSidebar
        projectId={cr.id}
        activeCrId={cr.id}
        selectedStep="INTAKE"
        onSelectStep={vi.fn()}
        db={db}
      />
    );

    // Subsystems pills render with cyan tags
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-target-systems')).toBeInTheDocument();
      expect(screen.getByText('PAY-SVC')).toBeInTheDocument();
      expect(screen.getByText('BILL-DB')).toBeInTheDocument();
      expect(screen.getAllByText('Tạo mới').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Step3CodeGuideView provides Subsystem Switcher when CR targets multiple subsystems', async () => {
    render(
      <Step3CodeGuideView
        projectId="test-cr-id"
        crCode="CR-PAY-01"
        targetSystems={[subSys1, subSys2]}
        approvedSolutionMarkdown="# Solution"
        onProceedToStep4={vi.fn()}
        db={db}
      />
    );

    // Renders segmented switcher
    const switcher = await screen.findByTestId('step3-subsystem-switcher');
    expect(switcher).toBeInTheDocument();
    expect(screen.getByText('PAY-SVC (Payment Service)')).toBeInTheDocument();
    expect(screen.getByText('BILL-DB (Billing DB Schema)')).toBeInTheDocument();

    // Default repo remote path input reflects first subsystem
    const input = screen.getByPlaceholderText('/home/user/workspace/repo') as HTMLInputElement;
    expect(input.value).toBe('/var/repos/payment-service');

    // Switching to second subsystem updates remote path
    fireEvent.click(screen.getByText('BILL-DB (Billing DB Schema)'));
    await waitFor(() => {
      expect(input.value).toBe('/var/repos/billing-db');
    });
  });

  it('Resolves and aggregates multi-system conventions for AI Assistant prompt formatting', async () => {
    const cr = await createChangeRequest(
      {
        name: 'Multi-Repo Migration',
        code: 'CR-MIGRATE-01',
        type: 'ENHANCEMENT',
        targetSystemIds: [subSys1.id, subSys2.id],
      },
      db
    );

    expect(cr.targetSystemIds).toEqual([subSys1.id, subSys2.id]);

    // Format conventions block using prompt composer helper
    const promptSegment = buildConventionsSegment({
      global: '# Corporate Standards',
      repos: [
        {
          systemCode: subSys1.code,
          systemName: subSys1.name,
          repoPath: subSys1.remoteRepoPath,
          content: '# Rules for Payment Service',
        },
        {
          systemCode: subSys2.code,
          systemName: subSys2.name,
          repoPath: subSys2.remoteRepoPath,
          content: '# Rules for Billing DB',
        },
      ],
    });

    expect(promptSegment).toContain('[GLOBAL CONVENTIONS - QUY ƯỚC CHUNG TỔ CHỨC]');
    expect(promptSegment).toContain('[REPOSITORY CONVENTIONS - PAY-SVC (/var/repos/payment-service)]');
    expect(promptSegment).toContain('# Rules for Payment Service');
    expect(promptSegment).toContain('[REPOSITORY CONVENTIONS - BILL-DB (/var/repos/billing-db)]');
    expect(promptSegment).toContain('# Rules for Billing DB');
  });
});
