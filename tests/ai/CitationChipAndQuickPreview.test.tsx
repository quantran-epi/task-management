import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CitationChip } from '../../src/components/ai/CitationChip';
import { QuickPreviewDrawer } from '../../src/components/notes/QuickPreviewDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import type { Note, Task } from '../../src/types/models';

describe('CitationChip', () => {
  it('renders citation title and heading', () => {
    const handleOpen = vi.fn();
    render(
      <CitationChip
        docId="doc-123"
        title="Architecture Guide"
        heading="Security Model"
        snippet="OAuth token validation flow"
        onOpenDoc={handleOpen}
      />
    );

    const chip = screen.getByText('Architecture Guide §Security Model');
    expect(chip).toBeInTheDocument();

    fireEvent.click(chip);
    expect(handleOpen).toHaveBeenCalledWith('doc-123');
  });

  it('renders without heading when heading is omitted', () => {
    const handleOpen = vi.fn();
    render(
      <CitationChip
        docId="doc-999"
        title="Release Notes"
        onOpenDoc={handleOpen}
      />
    );

    const chip = screen.getByText('Release Notes');
    expect(chip).toBeInTheDocument();
  });
});

describe('QuickPreviewDrawer', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-preview-drawer-${Date.now()}-${Math.random()}`);

    const doc: Note = {
      id: 'doc-preview-1',
      type: 'document',
      title: 'DevOps Kubernetes Runbook',
      tags: ['devops', 'k8s'],
      body: '# Kubernetes Setup\nDeploy pods with `kubectl apply -f app.yaml`.\n\n- Scale to 3 replicas\n- Monitor with Prometheus',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
    };
    await db.notes.add(doc);

    const task: Task = {
      id: 'task-ref-1',
      name: 'Verify k8s deployment',
      status: 'Open',
      priority: 'High',
      progress: 0,
      estimateMinutes: 60,
      notes: 'Refer to [[doc:doc-preview-1|DevOps Kubernetes Runbook]]',
      documentLinks: ['doc-preview-1'],
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    await db.tasks.add(task);
  });

  it('renders document title, tags, markdown content, and backlinks', async () => {
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('DevOps Kubernetes Runbook').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('devops')).toBeInTheDocument();
    expect(screen.getByText('Mở trong Docs')).toBeInTheDocument();
    expect(screen.getByText('Verify k8s deployment')).toBeInTheDocument();
  });

  it('invokes onNavigateToDocs callback when clicking "Mở trong Docs"', async () => {
    const handleNav = vi.fn();
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        onNavigateToDocs={handleNav}
        db={db}
      />
    );

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Mở trong Docs/i });
      expect(btn).not.toBeDisabled();
    });

    const btn = screen.getByRole('button', { name: /Mở trong Docs/i });
    fireEvent.click(btn);
    expect(handleNav).toHaveBeenCalledWith('doc-preview-1');
  });
});
