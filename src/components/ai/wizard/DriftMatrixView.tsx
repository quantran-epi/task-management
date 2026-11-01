import React, { useId } from 'react';
import { Alert, Table, Tag, theme } from 'antd';
import {
  canClaimNoDrift,
  type CoverageLedger,
  type DriftTuple,
  type ReconciliationResult,
} from '../../../services/wizard/reconciliation';

export type DriftMatrixLayout = 'table' | 'stacked';

export interface DriftMatrixViewProps {
  result: ReconciliationResult;
  layout?: DriftMatrixLayout;
  /** Focus target after a hub confirm removes the confirm strip from the DOM. */
  headingRef?: React.Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
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

const INCOMPLETE_COVERAGE_TITLE = 'Thiếu bằng chứng bao phủ';
const INCOMPLETE_COVERAGE_ACTION = 'Bổ sung tệp hoặc hunk còn thiếu vào Change Pack rồi nạp lại';

function solutionText(tuple: DriftTuple): string {
  return tuple.baselineRequirement ?? (tuple.category === 'outside_solution' ? '(ngoài phạm vi)' : tuple.requirementId);
}

function actualText(tuple: DriftTuple): string {
  return tuple.evidence
    ? `${tuple.evidence.path}:${tuple.evidence.startLine}-${tuple.evidence.endLine}`
    : '(chưa cung cấp)';
}

/** D-13 impact/risk rating per finding category. */
function impactText(tuple: DriftTuple): string {
  switch (tuple.category) {
    case 'outside_solution':
      return 'Ảnh hưởng: Cao — thay đổi ngoài phạm vi đã duyệt';
    case 'missing':
      return 'Ảnh hưởng: Cao — phạm vi đã duyệt chưa được triển khai';
    case 'different': {
      const span = tuple.evidence ? `${tuple.evidence.startLine}-${tuple.evidence.endLine}` : 'chưa rõ phạm vi';
      return `Ảnh hưởng: Trung bình — hành vi khác thiết kế (${span})`;
    }
  }
}

/** D-13 next action per finding category. */
function nextAction(tuple: DriftTuple): string {
  switch (tuple.category) {
    case 'outside_solution':
      return 'Loại bỏ thay đổi ngoài phạm vi hoặc cập nhật SOLUTION.md có kiểm soát';
    case 'missing':
      return 'Triển khai hoặc giải trình mục còn thiếu trong Change Pack';
    case 'different':
      return 'Đối chiếu lại với SOLUTION.md và ghi nhận sai lệch';
  }
}

function FindingNotes({ tuple }: { tuple: DriftTuple }) {
  const { token } = theme.useToken();
  const style: React.CSSProperties = { fontSize: 12, lineHeight: 1.4, color: token.colorTextSecondary };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={style}>{impactText(tuple)}</span>
      <span style={style}>{nextAction(tuple)}</span>
      {tuple.category === 'missing' && <span style={style}>Chưa có bằng chứng triển khai</span>}
    </div>
  );
}

function toRow(tuple: DriftTuple, group: Group) {
  return {
    key: `${tuple.category}:${tuple.requirementId}`,
    item: tuple.requirementId,
    solution: solutionText(tuple),
    actual: actualText(tuple),
    note: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Tag color={group.color} style={{ fontWeight: 600, alignSelf: 'flex-start', margin: 0 }}>{group.title}</Tag>
        <FindingNotes tuple={tuple} />
      </div>
    ),
  };
}

function coverageImpact(entry: CoverageLedger): string {
  switch (entry.state) {
    case 'deferred':
      return 'Ảnh hưởng: Trung bình — tệp bị hoãn nên chưa được đối chiếu';
    case 'unreadable':
      return 'Ảnh hưởng: Cao — tệp không đọc được';
    case 'binary':
      return 'Ảnh hưởng: Trung bình — tệp nhị phân không đối chiếu được';
    default:
      return 'Ảnh hưởng: Cao — chưa đủ bằng chứng để kết luận';
  }
}

export const DriftMatrixView: React.FC<DriftMatrixViewProps> = ({ result, layout = 'table', headingRef, headingTabIndex }) => {
  const { token } = theme.useToken();
  const headingId = useId();
  const completeCoverage = result.coverage.length > 0 && result.coverage.every((entry) => entry.state === 'included');
  // `canClaimNoDrift` alone has no status check; both are required to claim a clean run.
  const clean = canClaimNoDrift(result) && result.status === 'NO_DRIFT_COMPLETE';
  const incompleteCoverage = result.coverage.filter((entry) => entry.state !== 'included');
  const columns = [
    { title: 'Mục', dataIndex: 'item', key: 'item' },
    { title: 'SOLUTION.md', dataIndex: 'solution', key: 'solution' },
    { title: 'Thực tế', dataIndex: 'actual', key: 'actual' },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
  ];

  return (
    <section aria-labelledby={headingId} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={headingTabIndex}
        style={{ margin: 0, color: token.colorText, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}
      >
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
      {incompleteCoverage.length > 0 && (
        <section
          aria-labelledby={`${headingId}-incomplete_coverage`}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <h3
            id={`${headingId}-incomplete_coverage`}
            style={{ margin: 0, color: token.colorText, fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}
          >
            {INCOMPLETE_COVERAGE_TITLE}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incompleteCoverage.map((entry) => (
              <div
                key={`${entry.path}:${entry.hunkId ?? ''}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, lineHeight: 1.5 }}
              >
                <span>
                  <Tag color="warning" style={{ fontWeight: 600 }}>
                    {entry.state}
                  </Tag>
                  <code>{entry.path}</code>
                  {entry.hunkId ? <span>: {entry.hunkId}</span> : null}
                </span>
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{coverageImpact(entry)}</span>
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{INCOMPLETE_COVERAGE_ACTION}</span>
              </div>
            ))}
          </div>
        </section>
      )}
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
          <FindingNotes tuple={tuple} />
        </div>
      ))}
    </div>
  );
};
