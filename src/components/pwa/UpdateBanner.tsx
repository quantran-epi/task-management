import React, { useState } from 'react';
import { Button, Typography, Space, theme, Grid } from 'antd';
import { CloudSyncOutlined, CloseOutlined } from '@ant-design/icons';
import { useFormGuard } from '../../context/FormGuardContext';
import { ActiveFormGuardModal } from './ActiveFormGuardModal';

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

export interface UpdateBannerProps {
  needRefresh: boolean;
  onUpdate: (force?: boolean) => void;
  onDismiss: () => void;
}

/**
 * Non-blocking floating notification banner offering immediate update or deferral (D-01, D-04, UI-SPEC § 1).
 */
export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  needRefresh,
  onUpdate,
  onDismiss,
}) => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const { hasActiveForm } = useFormGuard();
  const [guardModalOpen, setGuardModalOpen] = useState(false);

  if (!needRefresh) {
    return null;
  }

  const isMobile = screens.md === false;

  const handleUpdateClick = () => {
    if (hasActiveForm) {
      setGuardModalOpen(true);
    } else {
      onUpdate(true);
    }
  };

  const handleForceUpdate = () => {
    setGuardModalOpen(false);
    onUpdate(true);
  };

  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1050,
        padding: '16px',
        background: token.colorBgElevated,
        boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
        borderTop: `1px solid ${token.colorBorderSecondary}`,
      }
    : {
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1050,
        maxWidth: 420,
        width: '100%',
        padding: '16px',
        borderRadius: token.borderRadiusLG,
        background: token.colorBgElevated,
        boxShadow: token.boxShadowSecondary,
        border: `1px solid ${token.colorBorderSecondary}`,
      };

  return (
    <>
      <div
        role="alert"
        aria-live="polite"
        style={containerStyle}
        data-testid="pwa-update-banner"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Space align="center" size={8}>
            <CloudSyncOutlined style={{ color: token.colorPrimary, fontSize: 20 }} />
            <Title level={5} style={{ margin: 0, fontSize: 16 }}>
              Đã có bản cập nhật mới
            </Title>
          </Space>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onDismiss}
            aria-label="Đóng thông báo"
            style={{
              color: token.colorTextSecondary,
              minWidth: isMobile ? 44 : 24,
              minHeight: isMobile ? 44 : 24,
            }}
          />
        </div>

        <Text
          type="secondary"
          style={{ display: 'block', marginBottom: 16, fontSize: 14 }}
        >
          Phiên bản mới đã sẵn sàng. Tải lại để áp dụng cải tiến mới nhất.
        </Text>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onDismiss} style={{ color: token.colorTextSecondary }}>
            Để sau
          </Button>
          <Button type="primary" onClick={handleUpdateClick}>
            Cập nhật ngay
          </Button>
        </div>
      </div>

      <ActiveFormGuardModal
        open={guardModalOpen}
        onCancel={() => setGuardModalOpen(false)}
        onConfirm={handleForceUpdate}
      />
    </>
  );
};
