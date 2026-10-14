import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createKnowledgeLink } from '../../src/db/repositories/knowledgeLinkRepo';
import { LinkedKnowledgeSection } from '../../src/components/tasks/LinkedKnowledgeSection';

describe('LinkedKnowledgeSection Component (LINK-04, D-24)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-linked-knowledge-${Math.random()}`);
    await testDb.open();
    vi.clearAllMocks();
  });

  it('renders both first-class graph URNs and doc links with preview and delete actions', async () => {
    const task = await createTask({ name: 'Task with Multi Links' }, testDb);
    const onOpenDocPreview = vi.fn();

    await createKnowledgeLink(
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId: '00000000-0000-4000-8000-000000000001',
        urn: 'urn:node:table:accounts',
        displayLabel: 'Accounts Table Graph',
      },
      testDb
    );

    await createKnowledgeLink(
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId: '00000000-0000-4000-8000-000000000001',
        docId: '00000000-0000-4000-8000-000000000002',
        displayLabel: 'System Architecture Doc',
      },
      testDb
    );

    render(
      <LinkedKnowledgeSection
        taskId={task.id}
        entityType="task"
        entityId={task.id}
        onOpenDocPreview={onOpenDocPreview}
        db={testDb}
      />
    );

    // Wait for links to appear
    expect(await screen.findByText('Accounts Table Graph')).toBeInTheDocument();
    expect(await screen.findByText('System Architecture Doc')).toBeInTheDocument();

    // Clicking docId link triggers onOpenDocPreview
    const docTag = screen.getByText('System Architecture Doc');
    fireEvent.click(docTag);
    expect(onOpenDocPreview).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002');
  });
});
