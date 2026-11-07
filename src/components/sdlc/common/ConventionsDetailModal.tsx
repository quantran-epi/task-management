import React from 'react';
import { Modal, Tabs, Button, Tag, Space, Typography, Empty, theme } from 'antd';
import { BookOutlined, BranchesOutlined } from '@ant-design/icons';
import { renderSafeMarkdown } from '../../../utils/markdown';

export interface ConventionsDetailModalProps {
  open: boolean;
  onClose: () => void;
  globalText?: string | undefined;
  repoText?: string | undefined;
  repoPath?: string | undefined;
}

export const ConventionsDetailModal: React.FC<ConventionsDetailModalProps> = ({
  open,
  onClose,
  globalText,
  repoText,
  repoPath = 'CONVENTIONS.md',
}) => {
  const { token } = theme.useToken();
  const trimmedGlobal = globalText?.trim() || '';
  const trimmedRepo = repoText?.trim() || '';

  const items = [
    {
      key: 'global',
      label: (
        <Space size={6}>
          <BookOutlined style={{ color: token.colorPrimary }} />
          <span>Quy ước tổ chức (Global)</span>
          {trimmedGlobal ? (
            <Tag color="success" style={{ margin: 0 }}>Đã nạp</Tag>
          ) : (
            <Tag color="default" style={{ margin: 0 }}>Trống</Tag>
          )}
        </Space>
      ),
      children: (
        <div style={{ minHeight: 320, maxHeight: '60vh', overflowY: 'auto', padding: '12px 0' }}>
          {trimmedGlobal ? (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                padding: '12px 16px',
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusSM,
              }}
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(trimmedGlobal) }}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Chưa có quy ước tổ chức. Hãy cấu hình trong Cài đặt > Trợ lý AI & Ghost Dev."
            />
          )}
        </div>
      ),
    },
    {
      key: 'repo',
      label: (
        <Space size={6}>
          <BranchesOutlined style={{ color: token.colorSuccess }} />
          <span>Quy ước Repository</span>
          {trimmedRepo ? (
            <Tag color="success" style={{ margin: 0 }}>repo:{repoPath}</Tag>
          ) : (
            <Tag color="warning" style={{ margin: 0 }}>Không có file</Tag>
          )}
        </Space>
      ),
      children: (
        <div style={{ minHeight: 320, maxHeight: '60vh', overflowY: 'auto', padding: '12px 0' }}>
          {trimmedRepo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                Nguồn: <Typography.Text code>{repoPath}</Typography.Text>
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: '12px 16px',
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadiusSM,
                }}
                dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(trimmedRepo) }}
              />
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không tìm thấy CONVENTIONS.md tại thư mục gốc, .github/ hoặc docs/ của repository. Hệ thống sẽ chỉ áp dụng Quy ước tổ chức (Global)."
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal
      title="Chi tiết quy ước phát triển áp dụng"
      open={open}
      onCancel={onClose}
      width={760}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      destroyOnClose
    >
      <Tabs defaultActiveKey="global" items={items} />
    </Modal>
  );
};
