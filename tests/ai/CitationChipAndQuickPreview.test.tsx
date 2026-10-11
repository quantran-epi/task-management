import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CitationChip } from '../../src/components/ai/CitationChip';
import { QuickPreviewDrawer } from '../../src/components/notes/QuickPreviewDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import type { Note, Task } from '../../src/types/models';

describe('CitationChip', () => {
  it('renders citation title and heading in legacy mode', () => {
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

  it('renders without heading when heading is omitted in legacy mode', () => {
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

  it('renders local chip [L2] with Local tag visible', () => {
    render(
      <CitationChip
        index={2}
        source="local"
        documentTitle="Local Note"
        evidenceClass="LOCAL"
        range={{ startLine: 10, endLine: 20 }}
      />
    );

    expect(screen.getByText('[L2]')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('renders server chip [2] without Local tag', () => {
    render(
      <CitationChip
        index={2}
        source="server"
        documentTitle="Server Spec"
        evidenceClass="OBSERVED"
        range={{ startLine: 5, endLine: 15 }}
        snapshotId="gsnap_12345678"
      />
    );

    expect(screen.getByText('[2]')).toBeInTheDocument();
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
  });

  it('activates onActivate on Enter key for server and local variants', () => {
    const handleActivateServer = vi.fn();
    const handleActivateLocal = vi.fn();

    const { rerender } = render(
      <CitationChip
        index={1}
        source="server"
        documentTitle="Doc 1"
        onActivate={handleActivateServer}
      />
    );

    const serverChip = screen.getByRole('button', { name: /\[1\]/ });
    fireEvent.keyDown(serverChip, { key: 'Enter' });
    expect(handleActivateServer).toHaveBeenCalledTimes(1);

    rerender(
      <CitationChip
        index={1}
        source="local"
        documentTitle="Doc 2"
        onActivate={handleActivateLocal}
      />
    );

    const localChip = screen.getByRole('button', { name: /\[L1\]/ });
    fireEvent.keyDown(localChip, { key: 'Enter' });
    expect(handleActivateLocal).toHaveBeenCalledTimes(1);
  });

  it('activates onActivate on Space key', () => {
    const handleActivate = vi.fn();
    render(
      <CitationChip
        index={3}
        source="server"
        documentTitle="Doc 3"
        onActivate={handleActivate}
      />
    );

    const chip = screen.getByRole('button', { name: /\[3\]/ });
    fireEvent.keyDown(chip, { key: ' ' });
    expect(handleActivate).toHaveBeenCalledTimes(1);
  });

  it('tooltip shows truncated 7-char snapshot id for server chip', async () => {
    render(
      <CitationChip
        index={1}
        source="server"
        documentTitle="Architecture Guide"
        snapshotId="gsnap_abcdef1234"
        range={{ startLine: 1, endLine: 5 }}
      />
    );

    const chip = screen.getByRole('button', { name: /\[1\]/ });
    fireEvent.mouseEnter(chip);

    await waitFor(() => {
      expect(screen.getByText(/Bản chụp: gsnap_a…/)).toBeInTheDocument();
    });
  });

  it('tooltip omits snapshot id for local chip and shows "Local · chưa xuất bản" when publishedContentHash is null', async () => {
    render(
      <CitationChip
        index={1}
        source="local"
        documentTitle="Draft Guide"
        publishedContentHash={null}
        range={{ startLine: 1, endLine: 5 }}
      />
    );

    const chip = screen.getByRole('button', { name: /\[L1\]/ });
    fireEvent.mouseEnter(chip);

    await waitFor(() => {
      expect(screen.getByText('Local · chưa xuất bản')).toBeInTheDocument();
      expect(screen.queryByText(/Bản chụp:/)).not.toBeInTheDocument();
    });
  });

  it('aria-label includes documentTitle + range + classification', () => {
    render(
      <CitationChip
        index={4}
        source="server"
        documentTitle="Process Spec"
        evidenceClass="OBSERVED"
        range={{ startLine: 12, endLine: 24 }}
        snapshotId="gsnap_99887766"
      />
    );

    const chip = screen.getByRole('button', {
      name: /\[4\] Process Spec, L12-24, OBSERVED, Snapshot gsnap_9/,
    });
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
