import React, { useEffect, useState } from 'react';
import { Card, Typography, Space, Button, Input, useMessage } from '../ui';
import { DatabaseOutlined, SaveOutlined } from '../ui/icon';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  GRAPHITI_SQL_SERVER_IDS,
  getGraphitiSqlServers,
  saveGraphitiSqlServers,
  type GraphitiSqlServers,
} from '../../services/ai/graphitiRules';

const { Text, Paragraph } = Typography;

export interface GraphitiSqlConfigCardProps {
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const GraphitiSqlConfigCard: React.FC<GraphitiSqlConfigCardProps> = ({
  db = defaultDb,
  onConfigChange,
}) => {
  const message = useMessage();
  const [config, setConfig] = useState<GraphitiSqlServers>({
    memory: { url: '', enabled: true },
    source: { url: '', enabled: true },
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void getGraphitiSqlServers(db)
      .then((loaded) => {
        if (active) {
          setConfig(loaded);
          setLoadError(false);
        }
      })
      .catch(() => {
        // Fail closed: never save an empty form over settings we could not read.
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [db]);

  const handleSave = async () => {
    if (loadError) return;
    setLoading(true);
    try {
      const saved = await saveGraphitiSqlServers(config, db);
      const savedMemory = saved.find((s) => s.id === GRAPHITI_SQL_SERVER_IDS.memory);
      const savedSource = saved.find((s) => s.id === GRAPHITI_SQL_SERVER_IDS.source);
      setConfig({
        memory: { url: savedMemory?.url ?? config.memory.url, enabled: true },
        source: { url: savedSource?.url ?? config.source.url, enabled: true },
      });
      message.success('Đã lưu cấu hình Graphiti/SQL.');
      onConfigChange?.();
    } catch (err: any) {
      message.error(`Không thể lưu cấu hình Graphiti/SQL: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <DatabaseOutlined />
          <Text strong>Graphiti/SQL</Text>
        </Space>
      }
    >
      <Paragraph type="secondary">
        URL do bạn khai báo; luật lấy từ tệp đi kèm đã kiểm tra SHA-256. Hai máy chủ này luôn bật,
        chỉ cho phép đổi URL.
      </Paragraph>
      {loadError && (
        <Paragraph type="danger">Không đọc được cấu hình hiện tại. Vui lòng thử lại trước khi lưu.</Paragraph>
      )}

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text strong>graphiti-memory</Text>
          <Space wrap>
            <Input
              aria-label="URL Graphiti Memory"
              value={config.memory.url}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  memory: { ...prev.memory, url: e.target.value },
                }))
              }
              placeholder="Địa chỉ MCP do bạn khai báo"
              style={{ width: 360, maxWidth: '100%' }}
            />
          </Space>
        </Space>

        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text strong>svng-source</Text>
          <Space wrap>
            <Input
              aria-label="URL SVNG Source"
              value={config.source.url}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  source: { ...prev.source, url: e.target.value },
                }))
              }
              placeholder="Địa chỉ MCP do bạn khai báo"
              style={{ width: 360, maxWidth: '100%' }}
            />
          </Space>
        </Space>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={loading}
          disabled={loadError}
          onClick={handleSave}
        >
          Lưu cấu hình Graphiti/SQL
        </Button>
      </Space>
    </Card>
  );
};
