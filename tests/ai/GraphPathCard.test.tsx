import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GraphPathCard } from '../../src/components/ai/grounded/GraphPathCard';
import type {
  PersistedCitation,
  PersistedConflictGroup,
  PersistedPath,
} from '../../src/services/ai/groundedAnswerSchemas';

const baseCitation: PersistedCitation = {
  citationId: 'S1',
  documentId: '00000000-0000-0000-0000-000000000001',
  documentTitle: 'Báo cáo kỹ thuật',
  sectionAnchor: 'KienTruc',
  lineStart: 10,
  lineEnd: 20,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_11111111',
  publishedContentHash: 'a'.repeat(64),
  citedExcerpt: 'Hệ thống hỗ trợ 1000 TPS.',
};

function createMockPath(overrides: Partial<PersistedPath> = {}): PersistedPath {
  return {
    pathId: 'P1',
    snapshotId: 'gsnap_11111111',
    nodeUrns: ['urn:taskmate:sys:CORE', 'urn:taskmate:sys:DB'],
    edgeFactKeys: ['fk_core_db_connect'],
    hopClassifications: ['OBSERVED'],
    hopCitationIds: [['S1']],
    hasConflict: false,
    classification: 'OBSERVED',
    ...overrides,
  };
}

describe('GraphPathCard', () => {
  it('(a) paths from 2 snapshots render 2 cards', () => {
    const path1 = createMockPath({ pathId: 'P1', snapshotId: 'gsnap_11111111' });
    const path2 = createMockPath({ pathId: 'P2', snapshotId: 'gsnap_22222222' });

    render(
      <GraphPathCard
        paths={[path1, path2]}
        citations={[baseCitation]}
        conflictGroups={[]}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByText(/Bản chụp đồ thị: gsnap_1…/)).toBeInTheDocument();
    expect(screen.getByText(/Bản chụp đồ thị: gsnap_2…/)).toBeInTheDocument();
  });

  it('(b) conflict within snapshot (no backing scopeProof) -> no primary, all shown in destructive container with role="alert"', () => {
    const path1 = createMockPath({
      pathId: 'P1',
      snapshotId: 'gsnap_11111111',
      hopCitationIds: [['S1']],
    });
    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'conf_1',
      dimension: 'Unknown',
      branches: [
        { factKey: 'fk_1', claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: 'fk_2', claimIds: ['C2'], citationIds: ['S1'] },
      ],
      scopeProof: null,
    };

    render(
      <GraphPathCard
        paths={[path1]}
        citations={[baseCitation]}
        conflictGroups={[conflictGroup]}
        onCitationActivate={vi.fn()}
      />
    );

    const alertContainer = screen.getByTestId('graph-path-conflict-container');
    expect(alertContainer).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Không có đường chính — cần xác minh')).toBeInTheDocument();
    expect(screen.queryByText('Đường chính')).not.toBeInTheDocument();
  });

  it('(c) 3 non-conflict paths (no backing conflict group) -> shortest is primary, 2 collapsed', () => {
    const shortPath = createMockPath({
      pathId: 'P1',
      edgeFactKeys: ['fk_1'],
      nodeUrns: ['urn:taskmate:a', 'urn:taskmate:b'],
      hopClassifications: ['OBSERVED'],
      hopCitationIds: [['S1']],
    });
    const longPath1 = createMockPath({
      pathId: 'P2',
      edgeFactKeys: ['fk_1', 'fk_2'],
      nodeUrns: ['urn:taskmate:a', 'urn:taskmate:b', 'urn:taskmate:c'],
      hopClassifications: ['OBSERVED', 'OBSERVED'],
      hopCitationIds: [['S1'], ['S1']],
    });
    const longPath2 = createMockPath({
      pathId: 'P3',
      edgeFactKeys: ['fk_1', 'fk_2', 'fk_3'],
      nodeUrns: ['urn:taskmate:a', 'urn:taskmate:b', 'urn:taskmate:c', 'urn:taskmate:d'],
      hopClassifications: ['OBSERVED', 'OBSERVED', 'OBSERVED'],
      hopCitationIds: [['S1'], ['S1'], ['S1']],
    });

    render(
      <GraphPathCard
        paths={[shortPath, longPath1, longPath2]}
        citations={[baseCitation]}
        conflictGroups={[]}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByText('Đường chính')).toBeInTheDocument();
    const toggleLink = screen.getByText('Xem 2 đường thay thế');
    expect(toggleLink).toBeInTheDocument();

    fireEvent.click(toggleLink);
    expect(screen.queryByText('Xem 2 đường thay thế')).not.toBeInTheDocument();
  });

  it('(d) hop citation click calls onCitationActivate with correct citation', () => {
    const handleCitation = vi.fn();
    const path = createMockPath({ pathId: 'P1' });

    render(
      <GraphPathCard
        paths={[path]}
        citations={[baseCitation]}
        conflictGroups={[]}
        onCitationActivate={handleCitation}
      />
    );

    const chip = screen.getByRole('button', { name: /\[1\]/ });
    fireEvent.click(chip);
    expect(handleCitation).toHaveBeenCalledWith(baseCitation);
  });

  it('(e) aria-label includes hop URNs', () => {
    const path = createMockPath({
      nodeUrns: ['urn:taskmate:sys:CORE', 'urn:taskmate:sys:DB'],
      edgeFactKeys: ['fk_core_db_connect'],
    });

    render(
      <GraphPathCard
        paths={[path]}
        citations={[baseCitation]}
        conflictGroups={[]}
        onCitationActivate={vi.fn()}
      />
    );

    const group = screen.getByRole('group', {
      name: 'urn:taskmate:sys:CORE -> [fk_core_db_connect] -> urn:taskmate:sys:DB',
    });
    expect(group).toBeInTheDocument();
  });

  it('(f) D-25/D-27 variation grouping — EXTENDS: 2 paths backed by Environment + EXTENDS conflict group', () => {
    const path1 = createMockPath({ pathId: 'P1', hopCitationIds: [['S1']] });
    const path2 = createMockPath({ pathId: 'P2', hopCitationIds: [['S1']] });

    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'conf_env',
      dimension: 'Environment',
      branches: [
        { factKey: 'fk_1', claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: 'fk_2', claimIds: ['C2'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Environment',
        environment: 'UAT',
        version: null,
        overrideRelation: 'EXTENDS',
      },
    };

    render(
      <GraphPathCard
        paths={[path1, path2]}
        citations={[baseCitation]}
        conflictGroups={[conflictGroup]}
        onCitationActivate={vi.fn()}
      />
    );

    const varContainer = screen.getByTestId('graph-path-variation-container');
    expect(varContainer).toHaveAttribute('data-dimension', 'Environment');
    expect(varContainer).not.toHaveAttribute('role', 'alert');
    expect(screen.getByText('Khác biệt theo môi trường')).toBeInTheDocument();
  });

  it('(g) D-25/D-27 variation grouping — SUPPLEMENTS: paths backed by Version + SUPPLEMENTS render title Khác biệt theo phiên bản', () => {
    const path = createMockPath({ pathId: 'P1', hopCitationIds: [['S1']] });
    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'conf_ver',
      dimension: 'Version',
      branches: [
        { factKey: 'fk_1', claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: 'fk_2', claimIds: ['C2'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Version',
        environment: null,
        version: 'v2.1',
        overrideRelation: 'SUPPLEMENTS',
      },
    };

    render(
      <GraphPathCard
        paths={[path]}
        citations={[baseCitation]}
        conflictGroups={[conflictGroup]}
        onCitationActivate={vi.fn()}
      />
    );

    const varContainer = screen.getByTestId('graph-path-variation-container');
    expect(varContainer).toHaveAttribute('data-dimension', 'Version');
    expect(screen.getByText('Khác biệt theo phiên bản')).toBeInTheDocument();
  });

  it('(h) D-29 conflict grouping — null overrideRelation -> renders inside destructive container with role="alert"', () => {
    const path = createMockPath({ pathId: 'P1', hopCitationIds: [['S1']] });
    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'conf_null',
      dimension: 'Environment',
      branches: [
        { factKey: 'fk_1', claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: 'fk_2', claimIds: ['C2'], citationIds: ['S1'] },
      ],
      scopeProof: null,
    };

    render(
      <GraphPathCard
        paths={[path]}
        citations={[baseCitation]}
        conflictGroups={[conflictGroup]}
        onCitationActivate={vi.fn()}
      />
    );

    const conflictContainer = screen.getByTestId('graph-path-conflict-container');
    expect(conflictContainer).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Không có đường chính — cần xác minh')).toBeInTheDocument();
    expect(screen.queryByTestId('graph-path-variation-container')).not.toBeInTheDocument();
  });

  it('(i) D-29 conflict grouping — Unknown dimension with EXTENDS still routes to conflict container', () => {
    const path = createMockPath({ pathId: 'P1', hopCitationIds: [['S1']] });
    const conflictGroup: PersistedConflictGroup = {
      conflictId: 'conf_unk',
      dimension: 'Unknown',
      branches: [
        { factKey: 'fk_1', claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: 'fk_2', claimIds: ['C2'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Unknown',
        environment: null,
        version: null,
        overrideRelation: 'EXTENDS',
      },
    };

    render(
      <GraphPathCard
        paths={[path]}
        citations={[baseCitation]}
        conflictGroups={[conflictGroup]}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByTestId('graph-path-conflict-container')).toBeInTheDocument();
    expect(screen.queryByTestId('graph-path-variation-container')).not.toBeInTheDocument();
  });

  it('(j) Mixed buckets: variation + conflict + normal path in same snapshot render all three containers', () => {
    const pathVar = createMockPath({ pathId: 'P1', hopCitationIds: [['S1']] });
    const pathConf = createMockPath({ pathId: 'P2', hopCitationIds: [['S2']] });
    const pathNorm = createMockPath({ pathId: 'P3', hopCitationIds: [['S3']] });

    const citation2: PersistedCitation = { ...baseCitation, citationId: 'S2' };
    const citation3: PersistedCitation = { ...baseCitation, citationId: 'S3' };

    const varGroup: PersistedConflictGroup = {
      conflictId: 'conf_var',
      dimension: 'Environment',
      branches: [
        { factKey: 'fk_1', claimIds: ['C1'], citationIds: ['S1'] },
        { factKey: 'fk_2', claimIds: ['C2'], citationIds: ['S1'] },
      ],
      scopeProof: {
        dimension: 'Environment',
        environment: 'SIT',
        version: null,
        overrideRelation: 'EXTENDS',
      },
    };

    const confGroup: PersistedConflictGroup = {
      conflictId: 'conf_raw',
      dimension: 'Unknown',
      branches: [
        { factKey: 'fk_a', claimIds: ['C1'], citationIds: ['S2'] },
        { factKey: 'fk_b', claimIds: ['C2'], citationIds: ['S2'] },
      ],
      scopeProof: null,
    };

    render(
      <GraphPathCard
        paths={[pathVar, pathConf, pathNorm]}
        citations={[baseCitation, citation2, citation3]}
        conflictGroups={[varGroup, confGroup]}
        onCitationActivate={vi.fn()}
      />
    );

    expect(screen.getByTestId('graph-path-variation-container')).toBeInTheDocument();
    expect(screen.getByTestId('graph-path-conflict-container')).toBeInTheDocument();
    expect(screen.getByText('Đường chính')).toBeInTheDocument();
  });
});
