import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import {
  ApiOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getAllAvailableToolDefinitions,
  type ToolCatalogEntry,
  type ToolCatalogSource,
} from '../../services/ai/chatTurnTools';

const { Text } = Typography;

const SOURCE_META: Record<ToolCatalogSource, { color: string; label: string; icon: React.ReactNode }> = {
  builtin: { color: 'blue', label: 'Cơ sở dữ liệu', icon: <DatabaseOutlined /> },
  team: { color: 'purple', label: 'Agent nhóm', icon: <TeamOutlined /> },
  mcp: { color: 'cyan', label: 'MCP động', icon: <ApiOutlined /> },
  graphiti: { color: 'green', label: 'Graphiti (Tauri)', icon: <ToolOutlined /> },
};

export interface AiToolCatalogCardProps {
  db?: TaskPlannerDatabase;
}

/** Read-only inventory of every AI tool, including where each one is dispatched. */
export const AiToolCatalogCard: React.FC<AiToolCatalogCardProps> = ({ db = defaultDb }) => {
  const { token } = theme.useToken();
  const [entries, setEntries] = useState<ToolCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ToolCatalogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAllAvailableToolDefinitions(db);
      setEntries(result);
    } catch (err) {
      console.error('[AiToolCatalogCard] failed to load tool catalog:', err);
      setError('Một số nguồn công cụ (MCP/Graphiti) không truy cập được — đang hiển thị công cụ có sẵn.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAllAvailableToolDefinitions(db)
      .then((result) => {
        if (active) setEntries(result);
      })
      .catch((err) => {
        console.error('[AiToolCatalogCard] failed to load tool catalog:', err);
        if (active) {
          setError('Một số nguồn công cụ (MCP/Graphiti) không truy cập được — đang hiển thị công cụ có sẵn.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => {
      const name = entry.tool.function.name.toLowerCase();
      const description = entry.tool.function.description.toLowerCase();
      return name.includes(needle) || description.includes(needle);
    });
  }, [entries, search]);

  const handleCopy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selected.tool, null, 2));
      message.success('Đã sao chép definition JSON');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      message.error('Không thể sao chép definition JSON');
    }
  };

  return (
    <Card
      title={
        <Space>
          <ToolOutlined />
          <span>Danh mục công cụ AI</span>
        </Space>
      }
      extra={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={load}
          loading={loading}
          aria-label="Làm mới danh mục công cụ"
        >
          Làm mới
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Tất cả công cụ AI có sẵn: cơ sở dữ liệu, nhóm, MCP, Graphiti — kèm nơi sử dụng.
      </Typography.Paragraph>

      {error && (
        <Alert
          type="warning"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={load}>
              Thử lại
            </Button>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Input
        allowClear
        prefix={<SearchOutlined />}
        aria-label="Tìm theo tên hoặc mô tả công cụ"
        placeholder="Tìm theo tên hoặc mô tả"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{ marginBottom: 12 }}
      />

      <Spin spinning={loading}>
        <List
          dataSource={filtered}
          locale={{ emptyText: <Empty description="Không tìm thấy công cụ phù hợp" /> }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          renderItem={(entry) => {
            const meta = SOURCE_META[entry.source];
            return (
              <List.Item
                actions={[
                  <Button key="detail" type="link" size="small" onClick={() => { setSelected(entry); setCopied(false); }}>
                    Chi tiết
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap size={[4, 6]}>
                      <Text code>{entry.tool.function.name}</Text>
                      <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
                      {entry.isMutationTool && <Tag color="red">mutation</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text type="secondary" ellipsis style={{ maxWidth: 720, display: 'block' }}>
                        {entry.tool.function.description}
                      </Text>
                      <Space wrap size={[4, 4]}>
                        <Text type="secondary">Nơi dùng:</Text>
                        {entry.usage.labels.map((label) => (
                          <Tag key={label} style={{ marginInlineEnd: 0 }}>{label}</Tag>
                        ))}
                        {entry.usage.references.map((reference) => (
                          <Text key={reference} type="secondary" style={{ fontSize: 11 }} code>
                            {reference}
                          </Text>
                        ))}
                      </Space>
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Spin>

      <Modal
        open={selected !== null}
        title={selected ? `Chi tiết công cụ: ${selected.tool.function.name}` : ''}
        width={720}
        onCancel={() => setSelected(null)}
        footer={[
          <Button key="close" onClick={() => setSelected(null)}>Đóng</Button>,
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
            {copied ? 'Đã sao chép' : 'Sao chép JSON'}
          </Button>,
        ]}
      >
        {selected && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>Mô tả</Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                {selected.tool.function.description}
              </Typography.Paragraph>
            </div>
            <div>
              <Text strong>Nơi sử dụng</Text>
              <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
                {selected.usage.labels.map((label, index) => (
                  <div key={label}>
                    <Tag>{label}</Tag>
                    {selected.usage.references[index] && (
                      <Text type="secondary" code style={{ fontSize: 11 }}>
                        {selected.usage.references[index]}
                      </Text>
                    )}
                  </div>
                ))}
              </Space>
            </div>
            <div>
              <Space>
                <CodeOutlined />
                <Text strong>Definition (JSON schema)</Text>
              </Space>
              <pre
                style={{
                  background: token.colorFillTertiary,
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 11,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 400,
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(selected.tool.function.parameters ?? selected.tool.function, null, 2)}
              </pre>
            </div>
          </Space>
        )}
      </Modal>
    </Card>
  );
};
