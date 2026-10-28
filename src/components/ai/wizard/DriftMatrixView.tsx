import React from 'react';
import { Alert, Table, Tag, theme } from 'antd';
import type { DriftTuple, ReconciliationResult } from '../../../services/wizard/reconciliation';

export interface DriftMatrixViewProps {
  result: ReconciliationResult;
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

function toRow(tuple: DriftTuple, group: Group) {
  const actual = tuple.evidence
    ? `${tuple.evidence.path}:${tuple.evidence.startLine}-${tuple.evidence.endLine}`
    : '(chưa cung cấp)';
  return {
    key: `${tuple.category}:${tuple.requirementId}`,
    item: tuple.requirementId,
    solution: tuple.baselineRequirement ?? (tuple.category === 'outside_solution' ? '(ngoài phạm vi)' : tuple.requirementId),
    actual,
    note: <Tag color={group.color} style={{ fontWeight: 600 }}>{group.title}</Tag>,
  };
}

export const DriftMatrixView: React.FC<DriftMatrixViewProps> = ({ result }) => {
  const { token } = theme.useToken();
  const completeCoverage = result.coverage.length > 0 && result.coverage.every((entry) => entry.state === 'included');
  const clean = completeCoverage && result.drift.length === 0 && result.status === 'NO_DRIFT_COMPLETE';
  const columns = [
    { title: 'Mục', dataIndex: 'item', key: 'item' },
    { title: 'SOLUTION.md', dataIndex: 'solution', key: 'solution' },
    { title: 'Thực tế', dataIndex: 'actual', key: 'actual' },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
  ];

  return (
    <section aria-labelledby="drift-matrix-heading" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="drift-matrix-heading" style={{ margin: 0, color: token.colorText, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
        Bảng drift so với SOLUTION.md
      </h2>
      {!completeCoverage && (
        <Alert type="warning" showIcon message="Phạm vi đối chiếu chưa đầy đủ; chưa thể kết luận không có drift." />
      )}
      {GROUPS.map((group) => {
        const rows = result.drift.filter((tuple) => tuple.category === group.category).map((tuple) => toRow(tuple, group));
        return (
          <section key={group.category} aria-labelledby={`drift-${group.category}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 id={`drift-${group.category}`} style={{ margin: 0, color: token.colorText, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
              {group.title}
            </h3>
            {rows.length > 0 ? (
              <Table
                size="small"
                pagination={false}
                columns={columns}
                dataSource={rows}
                rowKey="key"
                scroll={{ x: 640 }}
              />
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
