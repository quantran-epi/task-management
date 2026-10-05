import React, { useEffect, useState } from 'react';
import { Modal, List, Switch, Tag, Typography, Space, message, theme } from 'antd';
import { ApiOutlined, DatabaseOutlined } from '@ant-design/icons';
import { type TaskPlannerDatabase } from '../../db';
import {
  getGraphitiMcpEndpoint,
  isGraphitiMcpEnabled,
  setGraphitiMcpEnabled,
} from '../../services/ai/graphitiMcpClient';
import { isTauriApp } from '../../utils/timerPopout';

const { Text, Paragraph } = Typography;

export interface McpSettingsModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
  onSettingsChange?: () => void;
}

interface McpServerItem {
  id: string;
  name: string;
  tag: string;
  description: string;
  endpoint: string;
  enabled: boolean;
  desktopOnly?: boolean;
}

export const McpSettingsModal: React.FC<McpSettingsModalProps> = ({
  open,
  onClose,
  db,
  onSettingsChange,
}) => {
  const { token } = theme.useToken();
  const [graphitiEnabled, setGraphitiEnabled] = useState(true);
  const [graphitiEndpoint, setGraphitiEndpoint] = useState('');
  const [loading, setLoading] = useState(false);
  const isTauri = isTauriApp();

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function loadSettings() {
      try {
        const [enabled, endpoint] = await Promise.all([
          isGraphitiMcpEnabled(db),
          getGraphitiMcpEndpoint(db),
        ]);
        if (active) {
          setGraphitiEnabled(enabled);
          setGraphitiEndpoint(endpoint);
        }
      } catch (err) {
        console.error('Failed to load MCP settings:', err);
      }
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, [open, db]);

  const handleToggleGraphiti = async (checked: boolean) => {
    setLoading(true);
    try {
      await setGraphitiMcpEnabled(checked, db);
      setGraphitiEnabled(checked);
      message.success(
        checked
          ? 'Đã bật máy chủ Graphiti MCP.'
          : 'Đã tắt máy chủ Graphiti MCP. Công cụ sẽ không được nạp vào cuộc trò chuyện.'
      );
      onSettingsChange?.();
    } catch (err: any) {
      message.error(`Không thể thay đổi cài đặt MCP: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  const servers: McpServerItem[] = [
    {
      id: 'graphiti',
      name: 'Graphiti Banking MCP',
      tag: 'Knowledge Graph',
      description:
        'Tri thức dữ liệu thẻ SmartVista (SVFE_SHB & MAIN1), tra cứu cấu trúc bảng, quan hệ khóa ngoại và nghiệp vụ chuyển mạch thanh toán.',
      endpoint: graphitiEndpoint,
      enabled: graphitiEnabled,
      desktopOnly: true,
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <Space>
          <ApiOutlined style={{ color: token.colorPrimary }} />
          <span>Quản lý máy chủ MCP</span>
        </Space>
      }
      width={560}
      destroyOnClose
    >
      <Paragraph style={{ color: token.colorTextSecondary, marginTop: 8 }}>
        Bật hoặc tắt các máy chủ giao thức bối cảnh mô hình (MCP) kết nối với Trợ lý AI. Khi tắt,
        các công cụ và chỉ dẫn tương ứng sẽ không được gửi tới mô hình.
      </Paragraph>

      <List
        dataSource={servers}
        renderItem={(server) => (
          <List.Item
            key={server.id}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
              marginBottom: 12,
            }}
            actions={[
              <Switch
                key="toggle"
                checked={server.enabled}
                loading={loading}
                onChange={handleToggleGraphiti}
                aria-label={`Bật/tắt ${server.name}`}
              />,
            ]}
          >
            <List.Item.Meta
              avatar={<DatabaseOutlined style={{ fontSize: 20, color: token.colorPrimary, marginTop: 4 }} />}
              title={
                <Space wrap align="center">
                  <Text strong>{server.name}</Text>
                  <Tag color="blue">{server.tag}</Tag>
                  {server.desktopOnly && (
                    <Tag color={isTauri ? 'green' : 'orange'}>
                      {isTauri ? 'Tauri Desktop' : 'Yêu cầu Desktop'}
                    </Tag>
                  )}
                </Space>
              }
              description={
                <div style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {server.description}
                  </Text>
                  {server.endpoint && (
                    <div style={{ marginTop: 6 }}>
                      <Text
                        code
                        style={{
                          fontSize: 11,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-block',
                        }}
                      >
                        {server.endpoint}
                      </Text>
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Modal>
  );
};
