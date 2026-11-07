import React, { useState } from 'react';
import { Card, Tag, Space, Button, Tooltip, theme } from 'antd';
import {
  SyncOutlined,
  BookOutlined,
  BranchesOutlined,
  CheckCircleFilled,
  ExclamationCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ConventionsDetailModal } from './ConventionsDetailModal';

export interface ConventionsSummaryProps {
  globalText?: string;
  repoText?: string;
  repoPath?: string;
  loadedAt?: string;
  sshStatus?: 'connected' | 'not_linked' | 'error' | 'file_not_found';
  loading?: boolean;
  onRefresh?: () => void;
}

export const ConventionsSummaryCard: React.FC<ConventionsSummaryProps> = ({
  globalText,
  repoText,
  repoPath = 'CONVENTIONS.md',
  loadedAt,
  sshStatus = 'not_linked',
  loading = false,
  onRefresh,
}) => {
  const { token } = theme.useToken();
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const trimmedGlobal = globalText?.trim() || '';
  const globalLineCount = trimmedGlobal ? trimmedGlobal.split('\n').length : 0;
  const hasGlobal = globalLineCount > 0;

  const renderRepoTag = () => {
    if (loading) {
      return (
        <Tag icon={<SyncOutlined spin />} color="processing" style={{ margin: 0 }}>
          Đang kiểm tra...
        </Tag>
      );
    }
    if (sshStatus === 'connected' && repoText) {
      const timeStr = loadedAt ? dayjs(loadedAt).format('HH:mm:ss') : '';
      return (
        <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0 }}>
          repo:{repoPath} {timeStr ? `(${timeStr})` : ''}
        </Tag>
      );
    }
    if (sshStatus === 'file_not_found') {
      return (
        <Tag color="warning" style={{ margin: 0 }}>
          Không có file CONVENTIONS.md
        </Tag>
      );
    }
    if (sshStatus === 'error') {
      return (
        <Tooltip title="Không thể kết nối tới máy chủ SSH để đọc file quy ước. Pipeline vẫn tiếp tục với Quy ước tổ chức.">
          <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ margin: 0 }}>
            Mất kết nối SSH
          </Tag>
        </Tooltip>
      );
    }
    return (
      <Tag color="default" style={{ margin: 0 }}>
        Chưa liên kết SSH
      </Tag>
    );
  };

  return (
    <>
      <Card
        size="small"
        style={{
          background: '#fafbfc',
          borderColor: '#e9eaee',
          borderRadius: token.borderRadiusSM,
        }}
        styles={{ body: { padding: '8px 14px' } }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Left: Status Badges */}
          <Space size={16} wrap style={{ alignItems: 'center' }}>
            {/* Global Convention Status */}
            <Space size={6} style={{ alignItems: 'center' }}>
              <BookOutlined style={{ color: token.colorPrimary }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>Global:</span>
              {hasGlobal ? (
                <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0 }}>
                  Đã nạp ({globalLineCount} dòng)
                </Tag>
              ) : (
                <Tag color="default" style={{ margin: 0 }}>
                  Chưa thiết lập
                </Tag>
              )}
            </Space>

            {/* Repo Convention Status */}
            <Space size={6} style={{ alignItems: 'center' }}>
              <BranchesOutlined style={{ color: token.colorSuccess }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>Repository:</span>
              {renderRepoTag()}
            </Space>
          </Space>

          {/* Right: Actions */}
          <Space size={8}>
            {onRefresh && (
              <Button
                size="small"
                icon={<SyncOutlined spin={loading} />}
                onClick={onRefresh}
                loading={loading}
                aria-label="Tải lại từ Repo"
              >
                Tải lại
              </Button>
            )}
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setDetailModalOpen(true)}
              aria-label="Xem chi tiết quy ước"
            >
              Xem chi tiết quy ước
            </Button>
          </Space>
        </div>
      </Card>

      <ConventionsDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        globalText={globalText}
        repoText={repoText}
        repoPath={repoPath}
      />
    </>
  );
};
