import React, { useState } from 'react';
import { Table, Tag, Tooltip, Typography, Modal, Button, theme } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
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
  const [selectedMcp, setSelectedMcp] = useState<PersistedCitation | null>(null);

  // Deduplicate by unique key
  const dedupedMap = new Map<string, PersistedCitation>();
  for (const c of citations) {
    const key = `${c.citationId}:${c.documentId}:${c.lineStart}:${c.lineEnd}:${c.publishedContentHash ?? 'local'}`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, c);
    }
  }
  const allCitations = Array.from(dedupedMap.values());

  const docCitations = allCitations.filter(
    (c) => !c.citationId.startsWith('M') && c.evidenceKind !== 'mcp_tool'
  );
  const mcpCitations = allCitations.filter(
    (c) => c.citationId.startsWith('M') || c.evidenceKind === 'mcp_tool'
  );

  const docColumns: ColumnsType<PersistedCitation> = [
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

  const mcpColumns: ColumnsType<PersistedCitation> = [
    {
      title: '#',
      dataIndex: 'citationId',
      key: 'citationId',
      width: 60,
      render: (citationId: string) => (
        <Tag color="purple" style={{ margin: 0, fontWeight: 600 }}>
          {citationId}
        </Tag>
      ),
    },
    {
      title: 'Máy chủ & Công cụ MCP',
      key: 'mcpServerTool',
      render: (_: unknown, record) => {
        const server = record.mcpMetadata?.serverName ?? record.documentTitle.replace(/^\[MCP\]\s*/, '').split(' - ')[0] ?? 'MCP Server';
        const tool = record.mcpMetadata?.toolName ?? record.documentTitle.replace(/^\[MCP\]\s*/, '').split(' - ')[1] ?? 'Tool';
        return (
          <div>
            <div style={{ fontWeight: 600, color: token.colorText }}>{server}</div>
            <Typography.Text type="secondary" code style={{ fontSize: 11 }}>
              {tool}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: 'Tham số gọi',
      dataIndex: 'sectionAnchor',
      key: 'sectionAnchor',
      ellipsis: true,
      render: (args: string | null) => (
        <Typography.Text code ellipsis style={{ maxWidth: 220, fontSize: 11 }}>
          {args || '{}'}
        </Typography.Text>
      ),
    },
    {
      title: 'Trích xuất kết quả',
      dataIndex: 'citedExcerpt',
      key: 'citedExcerpt',
      ellipsis: true,
      render: (excerpt: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Text ellipsis style={{ flex: 1, fontSize: 12, marginRight: 8 }}>
            {excerpt}
          </Typography.Text>
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMcp(record);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="sources-panel" style={{ marginTop: 8 }}>
      {docCitations.length > 0 && (
        <div style={{ marginBottom: mcpCitations.length > 0 ? 16 : 0 }}>
          {mcpCitations.length > 0 && (
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: token.colorTextSecondary }}>
              TÀI LIỆU NỘI BỘ ({docCitations.length})
            </div>
          )}
          <Table<PersistedCitation>
            dataSource={docCitations}
            columns={docColumns}
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
      )}

      {mcpCitations.length > 0 && (
        <div style={{ marginTop: docCitations.length > 0 ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Tag color="purple" style={{ fontWeight: 700, margin: 0 }}>
              LIVE MCP
            </Tag>
            <span style={{ fontWeight: 600, fontSize: 13, color: token.colorTextSecondary }}>
              BẰNG CHỨNG CÔNG CỤ NGOÀI ({mcpCitations.length})
            </span>
          </div>
          <Table<PersistedCitation>
            dataSource={mcpCitations}
            columns={mcpColumns}
            rowKey={(r) => r.citationId}
            size="small"
            pagination={false}
            onRow={(record) => ({
              onClick: () => {
                setSelectedMcp(record);
                onOpenCitation(record);
              },
              onKeyDown: (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setSelectedMcp(record);
                  onOpenCitation(record);
                }
              },
              tabIndex: 0,
              role: 'button',
              'aria-label': `${record.documentTitle} Live MCP Tool`,
              style: { cursor: 'pointer' },
            })}
          />
        </div>
      )}

      {/* Modal viewer for detailed MCP Tool raw outputs (T-22-06 Sanitized Text) */}
      <Modal
        open={!!selectedMcp}
        title={
          selectedMcp
            ? `Chi tiết bằng chứng [${selectedMcp.citationId}] ${selectedMcp.documentTitle}`
            : ''
        }
        footer={[
          <Button key="close" onClick={() => setSelectedMcp(null)}>
            Đóng
          </Button>,
        ]}
        onCancel={() => setSelectedMcp(null)}
        width={650}
      >
        {selectedMcp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Typography.Text strong>Máy chủ:</Typography.Text>{' '}
              <Typography.Text>{selectedMcp.mcpMetadata?.serverName ?? 'MCP Server'}</Typography.Text>
            </div>
            <div>
              <Typography.Text strong>Công cụ:</Typography.Text>{' '}
              <Typography.Text code>{selectedMcp.mcpMetadata?.toolName ?? 'tool'}</Typography.Text>
            </div>
            {selectedMcp.sectionAnchor && (
              <div>
                <Typography.Text strong>Tham số truyền:</Typography.Text>
                <pre
                  style={{
                    background: token.colorFillTertiary,
                    padding: 8,
                    borderRadius: 4,
                    fontSize: 11,
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                >
                  {selectedMcp.sectionAnchor}
                </pre>
              </div>
            )}
            <div>
              <Typography.Text strong>Nội dung quan sát thực tế (OBSERVED):</Typography.Text>
              <pre
                style={{
                  background: token.colorFillTertiary,
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflowY: 'auto',
                }}
              >
                {selectedMcp.citedExcerpt}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
