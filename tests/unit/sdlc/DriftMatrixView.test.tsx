import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriftMatrixView } from '../../../src/components/ai/wizard/DriftMatrixView';
import {
  ReconciliationResultSchema,
  type CoverageLedger,
  type ReconciliationResult,
} from '../../../src/services/wizard/reconciliation';

const INCOMPLETE_TITLE = 'Thiếu bằng chứng bao phủ';
const CLEAN_COPY = 'Không phát hiện drift: triển khai khớp với solution đã duyệt.';

function coverage(state: CoverageLedger['state'], path: string): CoverageLedger {
  return { path, state, evidenceIds: [] };
}

/** Fixtures go through the schema so an invalid case fails loudly, not silently. */
function result(overrides: {
  status: ReconciliationResult['status'];
  drift?: ReconciliationResult['drift'];
  coverage?: CoverageLedger[];
}): ReconciliationResult {
  return ReconciliationResultSchema.parse({
    schemaVersion: 1,
    identity: {
      projectId: 'project',
      threadId: 'thread',
      solutionNoteId: 'solution',
      solutionVersion: 1,
      solutionHash: 'a'.repeat(64),
      packHash: 'b'.repeat(64),
      cr: 'CR-2501',
      base: 'base-sha',
      head: 'head-sha',
    },
    status: overrides.status,
    approvedDesign: { currentSystem: 'Core', affectedScreens: [], affectedApis: [], affectedTables: [] },
    actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
    drift: overrides.drift ?? [],
    dbChangesRollback: { affectedTables: [], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
    regressionMatrix: [],
    coverage: overrides.coverage ?? [coverage('included', 'diff.patch')],
  });
}

const ALL_CATEGORIES = result({
  status: 'DRIFT_DETECTED',
  drift: [
    {
      requirementId: 'REQ-OUT',
      category: 'outside_solution',
      evidence: { evidenceId: 'e1', path: 'src/out.ts', startLine: 10, endLine: 12, text: 'new behavior' },
      baselineRequirement: null,
    },
    { requirementId: 'REQ-MISS', category: 'missing', evidence: null, baselineRequirement: 'Must validate limit' },
    {
      requirementId: 'REQ-DIFF',
      category: 'different',
      evidence: { evidenceId: 'e2', path: 'src/diff.ts', startLine: 3, endLine: 4, text: 'different behavior' },
      baselineRequirement: null,
    },
  ],
});

describe('DriftMatrixView D-13 findings', () => {
  it('lists every incomplete-coverage entry when coverage is deferred, unreadable, or binary', () => {
    render(
      <DriftMatrixView
        result={result({
          status: 'PARTIAL_COVERAGE',
          coverage: [
            coverage('included', 'src/kept.ts'),
            coverage('deferred', 'src/deferred.ts'),
            coverage('unreadable', 'src/unreadable.ts'),
            coverage('binary', 'assets/logo.png'),
          ],
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: INCOMPLETE_TITLE })).toBeInTheDocument();
    for (const path of ['src/deferred.ts', 'src/unreadable.ts', 'assets/logo.png']) {
      expect(screen.getByText(path)).toBeInTheDocument();
    }
    expect(screen.queryByText('src/kept.ts')).not.toBeInTheDocument();
  });

  it('renders no incomplete-coverage group when every entry is included', () => {
    render(<DriftMatrixView result={ALL_CATEGORIES} />);
    expect(screen.queryByRole('heading', { name: INCOMPLETE_TITLE })).not.toBeInTheDocument();
  });

  it('gives each finding an impact/risk rating and a next action, with evidence span for actual drifts', () => {
    render(<DriftMatrixView result={ALL_CATEGORIES} />);

    expect(screen.getByText('Ảnh hưởng: Cao — thay đổi ngoài phạm vi đã duyệt')).toBeInTheDocument();
    expect(screen.getByText('Ảnh hưởng: Cao — phạm vi đã duyệt chưa được triển khai')).toBeInTheDocument();
    expect(screen.getByText('Ảnh hưởng: Trung bình — hành vi khác thiết kế (3-4)')).toBeInTheDocument();

    expect(
      screen.getByText('Loại bỏ thay đổi ngoài phạm vi hoặc cập nhật SOLUTION.md có kiểm soát'),
    ).toBeInTheDocument();
    expect(screen.getByText('Triển khai hoặc giải trình mục còn thiếu trong Change Pack')).toBeInTheDocument();
    expect(screen.getByText('Đối chiếu lại với SOLUTION.md và ghi nhận sai lệch')).toBeInTheDocument();

    expect(screen.getByText('src/out.ts:10-12')).toBeInTheDocument();
    expect(screen.getByText('src/diff.ts:3-4')).toBeInTheDocument();
  });

  it('shows the baseline requirement and an explicit missing-evidence note for a missing finding', () => {
    render(<DriftMatrixView result={ALL_CATEGORIES} />);
    expect(screen.getByText('Must validate limit')).toBeInTheDocument();
    expect(screen.getByText('Chưa có bằng chứng triển khai')).toBeInTheDocument();
    expect(screen.getAllByText('Chưa có bằng chứng triển khai')).toHaveLength(1);
  });

  it('renders the clean copy only for a no-drift, fully-covered, NO_DRIFT_COMPLETE result', () => {
    const { unmount } = render(<DriftMatrixView result={result({ status: 'PARTIAL_COVERAGE' })} />);
    expect(screen.queryByText(CLEAN_COPY)).not.toBeInTheDocument();
    unmount();

    render(<DriftMatrixView result={result({ status: 'NO_DRIFT_COMPLETE', coverage: [coverage('deferred', 'a.ts')] })} />);
    expect(screen.queryByText(CLEAN_COPY)).not.toBeInTheDocument();
  });

  it('keeps the four fixed columns on all three drift tables and puts impact plus next action in Ghi chú', () => {
    render(<DriftMatrixView result={ALL_CATEGORIES} />);

    for (const column of ['Mục', 'SOLUTION.md', 'Thực tế', 'Ghi chú']) {
      expect(screen.getAllByRole('columnheader', { name: column })).toHaveLength(3);
    }

    const row = screen.getByText('REQ-OUT').closest('tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');
    expect(cells).toHaveLength(4);
    expect(cells[3]!.textContent).toContain('Ảnh hưởng: Cao — thay đổi ngoài phạm vi đã duyệt');
    expect(cells[3]!.textContent).toContain('Loại bỏ thay đổi ngoài phạm vi hoặc cập nhật SOLUTION.md có kiểm soát');
  });
});
