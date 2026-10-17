import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { CitationChip } from '../../src/components/ai/CitationChip';
import { CitationGroup } from '../../src/components/ai/grounded/CitationGroup';
import { QuickPreviewDrawer } from '../../src/components/notes/QuickPreviewDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import type { Note, Task } from '../../src/types/models';
import type { PersistedCitation } from '../../src/services/ai/groundedAnswerSchemas';
import { computeSha256, normalizeMarkdownForHash } from '../../src/db/repositories/documentSetRepo';

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
  const docBody = '# Kubernetes Setup\nDeploy pods with `kubectl apply -f app.yaml`.\n\n- Scale to 3 replicas\n- Monitor with Prometheus';

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-preview-drawer-${Date.now()}-${Math.random()}`);

    const doc: Note = {
      id: 'doc-preview-1',
      type: 'document',
      title: 'DevOps Kubernetes Runbook',
      tags: ['devops', 'k8s'],
      body: docBody,
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

  // Task 1 additional cases (cases 8-15)

  it('8. citedExcerpt provided -> raw panel renders with left gutter line numbers starting at lineRange.start', async () => {
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        lineRange={{ start: 10, end: 12 }}
        citedExcerpt={'line 10 content\nline 11 content\nline 12 content'}
        citedSnapshotId="gsnap_1234567"
        citationAuthority="server"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('cited-excerpt-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('excerpt-line-num-10')).toHaveTextContent('10');
    expect(screen.getByTestId('excerpt-line-num-11')).toHaveTextContent('11');
    expect(screen.getByTestId('excerpt-line-num-12')).toHaveTextContent('12');
    expect(screen.getByText('line 10 content')).toBeInTheDocument();
    expect(screen.getByText('Trích dẫn từ bản chụp')).toBeInTheDocument();
  });

  it('9. citedContentHash !== currentHash -> snapshot-mismatch banner with role="alert" rendered', async () => {
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        citedContentHash="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        citationAuthority="server"
      />
    );

    await waitFor(() => {
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(
        screen.getByText(/Nội dung cục bộ khác với bản chụp đã trích dẫn/i)
      ).toBeInTheDocument();
    });
  });

  it('10. citedContentHash === currentHash -> no mismatch banner', async () => {
    const validHash = await computeSha256(normalizeMarkdownForHash(docBody));

    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        citedContentHash={validHash}
        citationAuthority="server"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('DevOps Kubernetes Runbook').length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Nội dung cục bộ khác với bản chụp đã trích dẫn/i)
    ).not.toBeInTheDocument();
  });

  it('11. Local authority -> no mismatch comparison regardless of hashes (banner not rendered)', async () => {
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        citedContentHash="wrong_hash_should_not_matter_for_local_authority"
        citationAuthority="local"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('DevOps Kubernetes Runbook').length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Nội dung cục bộ khác với bản chụp đã trích dẫn/i)
    ).not.toBeInTheDocument();
  });

  it('12. snapshotAvailable === false -> excerpt still rendered + "Bản chụp không còn khả dụng" banner', async () => {
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        citedExcerpt="Historical text that must remain visible"
        lineRange={{ start: 5, end: 5 }}
        snapshotAvailable={false}
        citationAuthority="server"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('cited-excerpt-panel')).toBeInTheDocument();
    });

    expect(screen.getByText('Historical text that must remain visible')).toBeInTheDocument();
    expect(screen.getByText('Bản chụp không còn khả dụng')).toBeInTheDocument();
  });

  it('13. prefers-reduced-motion: reduce -> highlight class applied statically; no CSS transition class', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        lineRange={{ start: 1, end: 3 }}
      />
    );

    await waitFor(() => {
      const anchor = screen.getByTestId('line-range-anchor');
      expect(anchor).toBeInTheDocument();
      expect(anchor.className).toContain('gsd-static-highlight');
      expect(anchor.className).not.toContain('gsd-fade-highlight');
    });
  });

  it('14. Keyboard focus lands on target element after open (assert document.activeElement)', async () => {
    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={vi.fn()}
        db={db}
        lineRange={{ start: 2, end: 4 }}
      />
    );

    await waitFor(() => {
      const anchor = screen.getByTestId('line-range-anchor');
      expect(anchor).toBeInTheDocument();
      expect(document.activeElement).toBe(anchor);
    });
  });

  it('15. Click server citation chip (from CitationGroup) -> QuickPreviewDrawer opens with correct lineRange/citedExcerpt/citedSnapshotId passed through', async () => {
    const citation: PersistedCitation = {
      citationId: 'C1',
      documentId: 'doc-preview-1',
      documentTitle: 'DevOps Kubernetes Runbook',
      sectionAnchor: 'Kubernetes Setup',
      lineStart: 4,
      lineEnd: 6,
      authority: 'server',
      evidenceClass: 'OBSERVED',
      snapshotId: 'gsnap_abcdef123',
      publishedContentHash: '0000000000000000000000000000000000000000000000000000000000000000',
      citedExcerpt: 'Excerpt for lines 4 to 6',
    };

    const Harness: React.FC = () => {
      const [activeCitation, setActiveCitation] = useState<PersistedCitation | null>(null);

      return (
        <div>
          <CitationGroup
            citations={[citation]}
            onActivate={(c) => setActiveCitation(c)}
          />
          <QuickPreviewDrawer
            open={Boolean(activeCitation)}
            docId={activeCitation?.documentId ?? null}
            lineRange={
              activeCitation
                ? { start: activeCitation.lineStart, end: activeCitation.lineEnd }
                : undefined
            }
            citedExcerpt={activeCitation?.citedExcerpt}
            citedSnapshotId={activeCitation?.snapshotId ?? undefined}
            citedContentHash={activeCitation?.publishedContentHash ?? undefined}
            citationAuthority={activeCitation?.authority}
            onClose={() => setActiveCitation(null)}
            db={db}
          />
        </div>
      );
    };

    render(<Harness />);

    const chip = screen.getByRole('button', { name: /\[1\]/ });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.getByTestId('cited-excerpt-panel')).toBeInTheDocument();
      expect(screen.getByText('Excerpt for lines 4 to 6')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('16. "Mở trong Docs" button navigates to hash and calls onClose', async () => {
    const handleClose = vi.fn();
    const handleNav = vi.fn();

    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-preview-1"
        onClose={handleClose}
        onNavigateToDocs={handleNav}
        db={db}
      />
    );

    await waitFor(() => {
      const openBtn = screen.getByRole('button', { name: /Mở trong Docs/i });
      expect(openBtn).not.toBeDisabled();
    });

    const openBtn = screen.getByRole('button', { name: /Mở trong Docs/i });
    fireEvent.click(openBtn);

    expect(handleNav).toHaveBeenCalledWith('doc-preview-1');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders linked parent task badge and opens task details', async () => {
    const parentTask: Task = {
      id: 'task-parent-99',
      name: 'Implement OAuth Token Refresh',
      status: 'In Progress',
      priority: 'High',
      progress: 50,
      estimateMinutes: 120,
      jiraKey: 'PROJ-1234',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    await db.tasks.add(parentTask);

    const childDoc: Note = {
      id: 'doc-with-parent-task',
      type: 'document',
      title: 'OAuth Refresh Token Spec',
      entityType: 'task',
      entityId: 'task-parent-99',
      body: '# OAuth Spec\nToken lifecycle details...',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };
    await db.notes.add(childDoc);

    render(
      <QuickPreviewDrawer
        open={true}
        docId="doc-with-parent-task"
        onClose={vi.fn()}
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Tác vụ: Implement OAuth Token Refresh/)).toBeInTheDocument();
    });
  });
});

describe('ScopeChipsBar meaningful scope check', () => {
  it('returns null when routed scope has only default/empty scope', async () => {
    const { ScopeChipsBar, hasMeaningfulRoutedScope } = await import(
      '../../src/components/ai/grounded/ScopeChipsBar'
    );

    expect(hasMeaningfulRoutedScope(undefined)).toBe(false);
    expect(hasMeaningfulRoutedScope(null)).toBe(false);
    expect(hasMeaningfulRoutedScope({})).toBe(false);
    expect(hasMeaningfulRoutedScope({ domain: 'Mặc định' })).toBe(false);
    expect(hasMeaningfulRoutedScope({ domain: 'default' })).toBe(false);

    expect(hasMeaningfulRoutedScope({ domain: 'Fintech' })).toBe(true);
    expect(hasMeaningfulRoutedScope({ environment: 'STAGING' })).toBe(true);
    expect(hasMeaningfulRoutedScope({ version: 'v1.0' })).toBe(true);
    expect(hasMeaningfulRoutedScope({ comparisonMode: 'baseline_vs_scope' })).toBe(true);

    const { container } = render(
      <ScopeChipsBar
        routedScope={{ domain: 'Mặc định' }}
        onEditScope={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
