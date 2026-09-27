import React, { useState } from 'react';
import { Card, Space, Tag, Button, Typography, Descriptions, message } from 'antd';
import { CloudServerOutlined, SyncOutlined } from '@ant-design/icons';
import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { InstallButton } from '../pwa/InstallButton';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph } = Typography;

export const PwaStatusCard: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const { checkUpdate, needRefresh } = useServiceWorkerUpdate();
  const { isStandalone, isInstalled } = usePWAInstall();

  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const installed = isStandalone || isInstalled;

  const handleCheckUpdate = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      message.error(
        'Không thể kiểm tra bản cập nhật lúc này. Vui lòng kiểm tra lại kết nối mạng và thử lại sau.'
      );
      return;
    }

    setChecking(true);
    try {
      const hasUpdate = await checkUpdate();
      if (!hasUpdate && !needRefresh) {
        message.success('Ứng dụng đang ở phiên bản mới nhất.');
        announceToScreenReader('Ứng dụng đang ở phiên bản mới nhất.');
      }
    } catch (err) {
      console.warn('Update check failed:', err);
      message.error(
        'Không thể kiểm tra bản cập nhật lúc này. Vui lòng kiểm tra lại kết nối mạng và thử lại sau.'
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card
      title={
        <span>
          <CloudServerOutlined style={{ marginRight: 8 }} />
          Trạng thái PWA & Ngoại tuyến
        </span>
      }
    >
      <Paragraph type="secondary">
        Kiểm tra khả năng hoạt động ngoại tuyến, tình trạng Service Worker và cập nhật phiên bản ứng dụng.
      </Paragraph>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Descriptions
          column={{ xs: 1, sm: 3 }}
          size="small"
          items={[
            {
              key: 'sw',
              label: 'Trạng thái Service Worker',
              children: hasServiceWorker ? (
                <Tag color="success">Hoạt động</Tag>
              ) : (
                <Tag>Chưa hỗ trợ</Tag>
              ),
            },
            {
              key: 'offline',
              label: 'Khả năng ngoại tuyến',
              children: <Tag color="success">Sẵn sàng</Tag>,
            },
            {
              key: 'install',
              label: 'Tình trạng cài đặt',
              children: installed ? (
                <Tag color="cyan">Đã cài đặt PWA</Tag>
              ) : (
                <Tag>Chưa cài đặt</Tag>
              ),
            },
          ]}
        />

        <Space wrap style={{ marginTop: 8 }}>
          <Button
            icon={<SyncOutlined spin={checking} />}
            onClick={handleCheckUpdate}
            loading={checking}
          >
            Kiểm tra bản cập nhật
          </Button>

          <InstallButton mode="settings" />
        </Space>
      </Space>
    </Card>
  );
};
