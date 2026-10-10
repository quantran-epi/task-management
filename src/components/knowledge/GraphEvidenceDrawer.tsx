import {
  CheckCircleOutlined,
  CopyOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import type {
  FactEvidenceDetailResponse,
  FactSummary,
  QuarantineItem,
} from '../../services/knowledge/knowledgeClient';
import type { KnowledgeClient } from '../../services/knowledge/knowledgeClient';

const { Text, Title, Paragraph } = Typography;

export interface GraphEvidenceDrawerProps {
  open: boolean;
  setId: string;
  setName?: string | undefined;
  client?: KnowledgeClient | undefined;
  onClose: () => void;
  // For unit testing / deterministic injection
  facts?: readonly FactSummary[] | undefined;
  evidenceDetailsByFactKey?: Readonly<Record<string, FactEvidenceDetailResponse>> | undefined;
  quarantines?: readonly QuarantineItem[] | undefined;
}

export function classificationTag(classification: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED') {
  switch (classification) {
    case 'OBSERVED':
      return (
        <Tag color="processing" icon={<InfoCircleOutlined />}>
          Quan sát trực tiếp
        </Tag>
      );
    case 'INFERRED':
      return (
        <Tag color="warning" icon={<WarningOutlined />}>
          Suy luận
        </Tag>
      );
    case 'BUSINESS_APPROVED':
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          Đã phê duyệt nghiệp vụ
        </Tag>
      );
  }
}

export function extractionMethodLabel(method: string) {
  switch (method) {
    case 'DETERMINISTIC_TABLE':
    case 'DETERMINISTIC_SQL':
    case 'DETERMINISTIC_CODE':
      return 'Quy tắc có cấu trúc';
    case 'LLM_PROSE':
      return 'LLM văn xuôi';
    case 'MANUAL_ASSERTION':
      return 'Khẳng định thủ công';
    default:
      return method;
  }
}

export function GraphEvidenceDrawer(props: GraphEvidenceDrawerProps) {
  const { token } = theme.useToken();
  const [activeTab, setActiveTab] = useState<'facts' | 'quarantine'>('facts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [facts, setFacts] = useState<FactSummary[]>(props.facts ? [...props.facts] : []);
  const [quarantines, setQuarantines] = useState<QuarantineItem[]>(
    props.quarantines ? [...props.quarantines] : []
  );
  const [evidenceCache, setEvidenceCache] = useState<Record<string, FactEvidenceDetailResponse>>(
    props.evidenceDetailsByFactKey ? { ...props.evidenceDetailsByFactKey } : {}
  );
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loadingEvidenceKeys, setLoadingEvidenceKeys] = useState<Set<string>>(new Set());

  // Fetch facts and quarantines on open
  useEffect(() => {
    if (!props.open || !props.client || props.facts) return;
    let active = true;
    setLoading(true);
    setError(undefined);

    Promise.all([
      props.client.getGraphFacts(props.setId).catch((err) => {
        if (err?.serverCode === 'GRAPH_NOT_FOUND' || err?.status === 404) {
          return { facts: [] };
        }
        throw err;
      }),
      props.client.getGraphQuarantines(props.setId).catch(() => ({ quarantines: [] })),
    ])
      .then(([factsRes, qRes]) => {
        if (!active) return;
        setFacts(factsRes.facts || []);
        setQuarantines(qRes.quarantines || []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu bằng chứng đồ thị.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [props.open, props.setId, props.client, props.facts]);

  const handleExpand = async (expanded: boolean, record: FactSummary) => {
    if (!expanded) {
      setExpandedKeys((keys) => keys.filter((k) => k !== record.factKey));
      return;
    }

    setExpandedKeys((keys) => [...keys, record.factKey]);

    if (evidenceCache[record.factKey] || !props.client) return;

    setLoadingEvidenceKeys((prev) => new Set(prev).add(record.factKey));
    try {
      const detail = await props.client.getFactEvidence(props.setId, record.factKey);
      setEvidenceCache((prev) => ({ ...prev, [record.factKey]: detail }));
    } catch (err) {
      message.error('Không thể tải chi tiết bằng chứng.');
    } finally {
      setLoadingEvidenceKeys((prev) => {
        const next = new Set(prev);
        next.delete(record.factKey);
        return next;
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    message.success(`Đã sao chép ${label}`);
  };

  const columns: ColumnsType<FactSummary> = [
    {
      title: 'Chủ thể',
      dataIndex: 'subjectName',
      key: 'subjectName',
      width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Text strong>{r.subjectName}</Text>
          <Space orientation="horizontal" size={4}>
            <Tag style={{ fontSize: 11 }}>{r.subjectKind}</Tag>
            <Tooltip title={r.subjectUrn}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined style={{ fontSize: 12 }} />}
                onClick={() => copyToClipboard(r.subjectUrn, 'URN Chủ thể')}
              />
            </Tooltip>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Quan hệ',
      dataIndex: 'relation',
      key: 'relation',
      width: 130,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Text code style={{ fontSize: 12 }}>
            {r.relation}
          </Text>
          {r.qualifiers && Object.keys(r.qualifiers).length > 0 && (
            <Space wrap size={2}>
              {Object.entries(r.qualifiers).map(([k, v]) => (
                <Tag key={k} style={{ fontSize: 10 }}>
                  {k}:{v}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: 'Đối tượng',
      dataIndex: 'objectName',
      key: 'objectName',
      width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Text strong>{r.objectName}</Text>
          <Space orientation="horizontal" size={4}>
            <Tag style={{ fontSize: 11 }}>{r.objectKind}</Tag>
            <Tooltip title={r.objectUrn}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined style={{ fontSize: 12 }} />}
                onClick={() => copyToClipboard(r.objectUrn, 'URN Đối tượng')}
              />
            </Tooltip>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Phân loại',
      dataIndex: 'effectiveClassification',
      key: 'effectiveClassification',
      width: 140,
      render: (val) => classificationTag(val),
    },
    {
      title: 'Bằng chứng',
      dataIndex: 'evidenceCount',
      key: 'evidenceCount',
      width: 90,
      render: (count) => <Text>{count} dẫn chứng</Text>,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 100,
      render: (_, r) => {
        if (r.hasConflict) {
          return (
            <Tag color="error" icon={<ExclamationCircleOutlined />}>
              Mâu thuẫn
            </Tag>
          );
        }
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Bình thường
          </Tag>
        );
      },
    },
  ];

  const renderExpandedRow = (record: FactSummary) => {
    const detail = evidenceCache[record.factKey] ?? props.evidenceDetailsByFactKey?.[record.factKey];
    const isLoading = loadingEvidenceKeys.has(record.factKey);

    if (isLoading) {
      return <Skeleton active paragraph={{ rows: 2 }} />;
    }

    if (!detail || detail.occurrences.length === 0) {
      return (
        <Alert
          type="info"
          showIcon
          message="Không có trích dẫn nguồn chi tiết nào cho sự kiện này (có thể là khẳng định được kế thừa hoặc phê duyệt)."
        />
      );
    }

    return (
      <Space direction="vertical" size="middle" style={{ width: '100%', padding: '8px 0' }}>
        {record.hasConflict && (
          <Alert
            type="error"
            showIcon
            message="Phát hiện mâu thuẫn trực tiếp (Direct Contradiction)"
            description="Tồn tại hai khẳng định trái ngược nhau trong cùng một quan hệ hàm (functional slot). Cả hai nhánh bằng chứng được hiển thị đầy đủ bên dưới để đối chiếu."
          />
        )}
        <Title level={5} style={{ margin: 0 }}>
          Danh sách trích dẫn nguồn ({detail.occurrences.length})
        </Title>
        <Space direction="vertical" size="small" orientation="vertical" style={{ width: '100%' }}>
          {detail.occurrences.map((occ, idx) => (
            <Card
              key={occ.evidenceId || idx}
              size="small"
              bordered
              style={{
                background: occ.conflictBranch === 'A' ? '#fff1f0' : occ.conflictBranch === 'B' ? '#fffbe6' : token.colorBgContainer,
              }}
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Space wrap>
                    <FileTextOutlined />
                    <Text strong>{occ.documentTitle}</Text>
                    {occ.headingPath.length > 0 && (
                      <Text type="secondary">› {occ.headingPath.join(' › ')}</Text>
                    )}
                  </Space>
                  <Space>
                    {occ.conflictBranch && (
                      <Tag color={occ.conflictBranch === 'A' ? 'red' : 'gold'}>
                        Nhánh mâu thuẫn {occ.conflictBranch}
                      </Tag>
                    )}
                    {classificationTag(occ.classification)}
                  </Space>
                </Space>

                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                  <Descriptions.Item label="Vị trí">
                    <Text code>
                      Dòng {occ.startLine}–{occ.endLine}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Phương pháp">
                    <Text>{extractionMethodLabel(occ.method)}</Text>
                  </Descriptions.Item>
                  {occ.environment && (
                    <Descriptions.Item label="Môi trường">
                      <Tag>{occ.environment}</Tag>
                    </Descriptions.Item>
                  )}
                  {occ.classification === 'INFERRED' && (
                    <Descriptions.Item label="Độ tin cậy">
                      <Text>{Math.round(occ.confidence * 100)}%</Text>
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {occ.quote && (
                  <Paragraph
                    style={{
                      background: token.colorFillAlter,
                      padding: 8,
                      borderRadius: 4,
                      marginBottom: 0,
                      fontFamily: 'monospace',
                      fontSize: 12,
                    }}
                  >
                    "{occ.quote}"
                  </Paragraph>
                )}
              </Space>
            </Card>
          ))}
        </Space>
      </Space>
    );
  };

  const quarantineColumns: ColumnsType<QuarantineItem> = [
    {
      title: 'Định danh thô',
      dataIndex: 'rawIdentifier',
      key: 'rawIdentifier',
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: 'Lý do cách ly',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason) => <Text type="danger">{reason}</Text>,
    },
    {
      title: 'Vị trí',
      key: 'location',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          {r.headingPath.length > 0 && <Text type="secondary">{r.headingPath.join(' › ')}</Text>}
          <Text code>Dòng {r.startLine}–{r.endLine}</Text>
        </Space>
      ),
    },
    {
      title: 'Phương pháp',
      dataIndex: 'method',
      key: 'method',
      render: (m) => extractionMethodLabel(m),
    },
    {
      title: 'Gợi ý phù hợp',
      dataIndex: 'candidateMatches',
      key: 'candidateMatches',
      render: (matches: string[]) =>
        matches && matches.length > 0 ? (
          <Space wrap size={2}>
            {matches.map((m) => (
              <Tag key={m}>{m}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">Chưa đủ thông tin để định danh duy nhất</Text>
        ),
    },
  ];

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      width={680}
      title="Kiểm tra bằng chứng đồ thị tri thức"
      styles={{ body: { padding: token.padding } }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          Kiểm tra các sự kiện đã chiếu vào đồ thị tri thức, phân biệt nguồn gốc{' '}
          <Text strong>Quan sát trực tiếp</Text>, <Text strong>Suy luận</Text>, và{' '}
          <Text strong>Đã phê duyệt</Text>.
        </Text>

        {error && <Alert type="error" showIcon message={error} />}

        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as 'facts' | 'quarantine')}
          items={[
            {
              key: 'facts',
              label: `Sự kiện tri thức (${facts.length})`,
              children: (
                <div style={{ marginTop: token.marginXS }}>
                  {loading ? (
                    <Skeleton active />
                  ) : facts.length === 0 ? (
                    <Empty description="Không có sự kiện tri thức nào trong đồ thị hiện tại." />
                  ) : (
                    <Table
                      dataSource={facts}
                      columns={columns}
                      rowKey="factKey"
                      scroll={{ x: 760 }}
                      pagination={{ pageSize: 10, showSizeChanger: false }}
                      expandable={{
                        expandedRowRender: renderExpandedRow,
                        expandedRowKeys: expandedKeys,
                        onExpand: handleExpand,
                        expandRowByClick: true,
                      }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'quarantine',
              label: `Định danh cách ly (${quarantines.length})`,
              children: (
                <div style={{ marginTop: token.marginXS }}>
                  {loading ? (
                    <Skeleton active />
                  ) : quarantines.length === 0 ? (
                    <Empty description="Không có định danh nào bị cách ly." />
                  ) : (
                    <>
                      <Alert
                        type="warning"
                        showIcon
                        message="Danh sách đối tượng chưa đủ thông tin định danh"
                        description="Các định danh kỹ thuật không rõ ràng hoặc thiếu schema context được giữ trong khu vực cách ly, không tham gia tạo quan hệ trong đồ thị."
                        style={{ marginBottom: token.marginSM }}
                      />
                      <Table
                        dataSource={quarantines}
                        columns={quarantineColumns}
                        rowKey={(r) => `${r.rawIdentifier}:${r.startLine}`}
                        scroll={{ x: 600 }}
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Space>
    </Drawer>
  );
}
