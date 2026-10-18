import React from 'react';
import { Table, Tag, Tooltip, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { PersistedCitation } from '../../../services/ai/groundedAnswerSchemas';

export interface SourcesPanelProps {
  citations: readonly PersistedCitation[];
  onOpenCitation: (c: PersistedCitation) => void;
}

function parseCitationNumber(citationId: string): number {
  const match = citationId.match(/[0-9]+/);
  return match ? parseInt(match[0], 10) : 1;
}

export const SourcesPanel: React.FC<SourcesPanelProps> = ({
  citations,
  onOpenCitation,
}) => {
  const { token } = theme.useToken();

  // Deduplicate by (documentId, lineStart, lineEnd, publishedContentHash ?? 'local')
  const dedupedMap = new Map<string, PersistedCitation>();
  for (const c of citations) {
    const key = `${c.documentId}:${c.lineStart}:${c.lineEnd}:${c.publishedContentHash ?? 'local'}`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, c);
    }
  }
  const dedupedCitations = Array.from(dedupedMap.values());

  const columns: ColumnsType<PersistedCitation> = [
    {
      title: '#',
      dataIndex: 'citationId',
      key: 'index',
      width: 50,
      render: (citationId: string, record) => {
        const num = parseCitationNumber(citationId);
        return record.authority === 'local' ? `L${num}` : `${num}`;
      },
    },
    {
      title: 'Tài liệu',
      dataIndex: 'documentTitle',
      key: 'documentTitle',
      ellipsis: true,
      render: (title: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <span
            style={{
              fontWeight: 500,
              color: token.colorText,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
            title={title}
          >
            {title}
          </span>
          {record.authority === 'local' && (
            <Tag
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                background: token.colorFillSecondary,
                borderColor: token.colorBorder,
                color: token.colorTextSecondary,
                flexShrink: 0,
              }}
            >
              Local
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Mục',
      dataIndex: 'sectionAnchor',
      key: 'sectionAnchor',
      width: 120,
      ellipsis: true,
      render: (anchor: string | null) => anchor || '—',
    },
    {
      title: 'Dòng',
      key: 'range',
      width: 90,
      render: (_: unknown, record) => `L${record.lineStart}-${record.lineEnd}`,
    },
    {
      title: 'Loại',
      dataIndex: 'evidenceClass',
      key: 'evidenceClass',
      width: 110,
      render: (cls: string) => {
        if (cls === 'OBSERVED') {
          return <Tag color="success" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>OBSERVED</Tag>;
        }
        if (cls === 'BUSINESS_APPROVED') {
          return (
            <Tag
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 600,
                borderColor: token.colorPrimary,
                color: token.colorPrimary,
              }}
            >
              APPROVED
            </Tag>
          );
        }
        if (cls === 'LOCAL') {
          return (
            <Tag
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 600,
                background: token.colorFillSecondary,
              }}
            >
              LOCAL
            </Tag>
          );
        }
        return <Tag color="warning" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>INFERRED</Tag>;
      },
    },
    {
      title: 'Bản chụp',
      dataIndex: 'snapshotId',
      key: 'snapshotId',
      width: 90,
      render: (snap: string | null, record) => {
        if (record.authority === 'local' || !snap) {
          return (
            <Tag
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 600,
                background: token.colorFillSecondary,
                color: token.colorTextSecondary,
              }}
            >
              Local
            </Tag>
          );
        }
        return (
          <Tooltip title={snap}>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{snap.slice(0, 7)}…</span>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div className="sources-panel" style={{ marginTop: 8 }}>
      <Table<PersistedCitation>
        dataSource={dedupedCitations}
        columns={columns}
        rowKey={(r) => `${r.citationId}-${r.documentId}-${r.lineStart}`}
        size="small"
        pagination={false}
        onRow={(record) => ({
          onClick: () => onOpenCitation(record),
          onKeyDown: (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onOpenCitation(record);
            }
          },
          tabIndex: 0,
          role: 'button',
          'aria-label': `${record.documentTitle} L${record.lineStart}-${record.lineEnd} ${record.evidenceClass}`,
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
};
