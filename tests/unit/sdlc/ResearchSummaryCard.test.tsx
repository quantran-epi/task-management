import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ResearchDetailModal,
  ResearchSummaryCard,
  ResearchTriggerModal,
} from '../../../src/components/sdlc/common/ResearchSummaryCard';
import type { ResearchPayload } from '../../../src/services/ai/researchService';
import type { ResearchArtifactVersion } from '../../../src/services/wizard/artifactRepo';

const payload: ResearchPayload = {
  summary: 'Spring Cloud Gateway MVC hỗ trợ virtual threads.',
  findings: [
    {
      claim: 'Spring Cloud Gateway MVC hỗ trợ virtual threads từ Boot 3.2',
      scope: 'web',
      source: 'https://docs.spring.io/spring-cloud-gateway/',
      confidence: 0.95,
    },
    {
      claim: 'SC-API cấu hình timeout 30s tại application.yml',
      scope: 'repo',
      systemCode: 'SC-API',
      source: 'src/main/resources/application.yml:42',
      confidence: 1,
    },
  ],
};

const versionEntry = (version: number, body: ResearchPayload): ResearchArtifactVersion => ({
  version,
  noteId: `note-${version}`,
  payload: body,
  approvedAt: '2026-11-08T00:00:00.000Z',
});

describe('ResearchSummaryCard', () => {
  it('renders the empty state with a disabled detail button', () => {
    render(<ResearchSummaryCard research={null} />);

    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xem chi tiết/ })).toBeDisabled();
  });

  it('renders version and per-scope finding counts', () => {
    render(<ResearchSummaryCard research={payload} version={2} />);

    expect(screen.getByText('RESEARCH v2')).toBeInTheDocument();
    expect(screen.getByText('Web: 1')).toBeInTheDocument();
    expect(screen.getByText('Repo: 1')).toBeInTheDocument();
  });

  it('opens the detail modal with claims and external tags', async () => {
    render(<ResearchSummaryCard research={payload} version={2} />);

    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Spring Cloud Gateway MVC hỗ trợ virtual threads từ Boot 3.2/)).toBeInTheDocument();
    expect(within(dialog).getByText('[EXTERNAL:REPO:SC-API]')).toBeInTheDocument();
    expect(within(dialog).getByText('[EXTERNAL:WEB]')).toBeInTheDocument();
  });

  it('renders a version selector over every historical version', async () => {
    render(
      <ResearchSummaryCard
        research={payload}
        version={2}
        versions={[
          versionEntry(1, { ...payload, summary: 'Bản v1' }),
          versionEntry(2, payload),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết/ }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('RESEARCH v1')).toBeInTheDocument();
    expect(within(dialog).getByText('RESEARCH v2 (Mới nhất)')).toBeInTheDocument();
  });

  it('fires onTriggerResearch from the trigger button', () => {
    const onTriggerResearch = vi.fn();
    render(<ResearchSummaryCard research={null} onTriggerResearch={onTriggerResearch} />);

    fireEvent.click(screen.getByRole('button', { name: /Nghiên cứu \(Claude Code\)/ }));
    expect(onTriggerResearch).toHaveBeenCalledOnce();
  });

  it('warns about skipped systems in the detail modal', async () => {
    render(
      <ResearchSummaryCard
        research={{ ...payload, skippedSystems: [{ systemId: 'sys-2', code: 'SC-LEDGER', reason: 'NO_SSH_CONFIG' }] }}
        version={1}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/SC-LEDGER: NO_SSH_CONFIG/)).toBeInTheDocument();
  });

  it('renders the CR code in the modal title', async () => {
    render(
      <ResearchDetailModal open research={payload} version={1} onCancel={vi.fn()} crCode="CR-2026-001" />
    );

    expect(await screen.findByText('Chi tiết nghiên cứu bên ngoài — CR CR-2026-001')).toBeInTheDocument();
  });
});

describe('ResearchTriggerModal', () => {
  const targetSystems = [
    { systemId: 'sys-1', code: 'SC-API', name: 'Card API' },
    { systemId: 'sys-2', code: 'SC-LEDGER', name: 'Ledger' },
  ];

  it('disables submit until a question and a system are chosen', async () => {
    render(
      <ResearchTriggerModal open targetSystems={targetSystems} onCancel={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(await screen.findByRole('button', { name: 'Bắt đầu nghiên cứu' })).toBeDisabled();
  });

  it('submits questions, systems, and the web switch', async () => {
    const onSubmit = vi.fn();
    render(
      <ResearchTriggerModal open targetSystems={targetSystems} onCancel={vi.fn()} onSubmit={onSubmit} />
    );

    fireEvent.change(screen.getByPlaceholderText('Nội dung câu hỏi cần nghiên cứu...'), {
      target: { value: 'Gateway có hỗ trợ virtual threads?\nTimeout hiện tại là bao nhiêu?' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /SC-API/ }));

    const submit = screen.getByRole('button', { name: 'Bắt đầu nghiên cứu' });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith({
      questions: ['Gateway có hỗ trợ virtual threads?', 'Timeout hiện tại là bao nhiêu?'],
      targetSystemIds: ['sys-1'],
      includeWeb: true,
    });
  });
});
