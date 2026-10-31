import React, { useId } from 'react';
import { Alert, Table, Tag, theme } from 'antd';
import type { DriftTuple, ReconciliationResult } from '../../../services/wizard/reconciliation';

export type DriftMatrixLayout = 'table' | 'stacked';

export interface DriftMatrixViewProps {
  result: ReconciliationResult;
  layout?: DriftMatrixLayout;
}

type Group = {
  category: DriftTuple['category'];
  title: 'Ngoài solution' | 'Chưa làm' | 'Làm khác';
  color: 'error' | 'warning' | 'processing';
};

const GROUPS: readonly Group[] = [
  { category: 'outside_solution', title: 'Ngoài solution', color: 'error' },
  { category: 'missing', title: 'Chưa làm', color: 'warning' },
  { category: 'different', title: 'Làm khác', color: 'processing' },
];

function solutionText(tuple: DriftTuple): string {
  return tuple.baselineRequirement ?? (tuple.category === 'outside_solution' ? '(ngoài phạm vi)' : tuple.requirementId);
}

function actualText(tuple: DriftTuple): string {
  return tuple.evidence
    ? `${tuple.evidence.path}:${tuple.evidence.startLine}-${tuple.evidence.endLine}`
    : '(chưa cung cấp)';
}

function toRow(tuple: DriftTuple, group: Group) {
  return {
    key: `${tuple.category}:${tuple.requirementId}`,
    item: tuple.requirementId,
    solution: solutionText(tuple),
    actual: actualText(tuple),
    note: <Tag color={group.color} style={{ fontWeight: 600 }}>{group.title}</Tag>,
  };
}

export const DriftMatrixView: React.FC<DriftMatrixViewProps> = ({ result, layout = 'table' }) => {
  const { token } = theme.useToken();
  const headingId = useId();
  const completeCoverage = result.coverage.length > 0 && result.coverage.every((entry) => entry.state === 'included');
  const clean = completeCoverage && result.drift.length === 0 && result.status === 'NO_DRIFT_COMPLETE';
  const columns = [
    { title: 'Mục', dataIndex: 'item', key: 'item' },
    { title: 'SOLUTION.md', dataIndex: 'solution', key: 'solution' },
    { title: 'Thực tế', dataIndex: 'actual', key: 'actual' },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
  ];

  return (
    <section aria-labelledby={headingId} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id={headingId} style={{ margin: 0, color: token.colorText, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
        Bảng drift so với SOLUTION.md
      </h2>
      {!completeCoverage && (
        <Alert type="warning" showIcon message="Phạm vi đối chiếu chưa đầy đủ; chưa thể kết luận không có drift." />
      )}
      {GROUPS.map((group) => {
        const tuples = result.drift.filter((tuple) => tuple.category === group.category);
        const groupHeadingId = `${headingId}-${group.category}`;
        return (
          <section key={group.category} aria-labelledby={groupHeadingId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 id={groupHeadingId} style={{ margin: 0, color: token.colorText, fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
              {group.title}
            </h3>
            {tuples.length > 0 ? (
              layout === 'stacked' ? (
                <StackedTuples tuples={tuples} group={group} />
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  columns={columns}
                  dataSource={tuples.map((tuple) => toRow(tuple, group))}
                  rowKey="key"
                />
              )
            ) : clean ? (
              <div style={{ color: token.colorTextSecondary, fontSize: 14, lineHeight: 1.5 }}>
                Không phát hiện drift: triển khai khớp với solution đã duyệt.
              </div>
            ) : (
              <div style={{ color: token.colorTextSecondary, fontSize: 14, lineHeight: 1.5 }}>
                Không có mục trong nhóm này.
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
};

const StackedTuples: React.FC<{ tuples: DriftTuple[]; group: Group }> = ({ tuples, group }) => {
  const { token } = theme.useToken();
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    color: token.colorTextSecondary,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: token.colorText,
    wordBreak: 'break-word',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tuples.map((tuple, index) => (
        <div
          key={`${tuple.category}:${tuple.requirementId}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingTop: index === 0 ? 0 : 8,
            borderTop: index === 0 ? undefined : `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Tag color={group.color} style={{ margin: 0, fontWeight: 600, fontSize: 12, alignSelf: 'flex-start' }}>
            {group.title}
          </Tag>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={labelStyle}>Mục</span>
            <span style={valueStyle}>{tuple.requirementId}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={labelStyle}>SOLUTION.md</span>
            <span style={valueStyle}>{solutionText(tuple)}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={labelStyle}>Thực tế</span>
            <span style={valueStyle}>{actualText(tuple)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
