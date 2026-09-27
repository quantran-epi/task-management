import React, { useState, useEffect } from 'react';
import { Modal, Input, Typography, Alert, Button, Space } from 'antd';
import { LockOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadRawEncryptedBackup } from '../../services/github/githubSyncService';

const { Paragraph } = Typography;

export interface GitHubPassphraseModalProps {
  open: boolean;
  error?: string | undefined;
  rawEncryptedJson?: string | undefined;
  loading?: boolean | undefined;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
  onDownloadRaw?: (() => void) | undefined;
}

export const GitHubPassphraseModal: React.FC<GitHubPassphraseModalProps> = ({
  open,
  error,
  rawEncryptedJson,
  loading = false,
  onSubmit,
  onCancel,
  onDownloadRaw,
}) => {
  const [passphrase, setPassphrase] = useState('');

  // Reset input when modal opens or closes
  useEffect(() => {
    if (!open) {
      setPassphrase('');
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = passphrase.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
  };

  const handleDownload = () => {
    if (onDownloadRaw) {
      onDownloadRaw();
    } else if (rawEncryptedJson) {
      downloadRawEncryptedBackup(rawEncryptedJson);
    }
  };

  const footerButtons = [
    ...(rawEncryptedJson
      ? [
          <Button
            key="download-raw"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
          >
            Tải tệp thô về máy
          </Button>,
        ]
      : []),
    <Button
      key="cancel"
      onClick={() => {
        setPassphrase('');
        onCancel();
      }}
      disabled={loading}
    >
      Hủy bỏ
    </Button>,
    <Button
      key="submit"
      type="primary"
      onClick={handleSubmit}
      loading={loading}
      disabled={!passphrase.trim()}
    >
      Giải mã và xem trước
    </Button>,
  ];

  return (
    <Modal
      open={open}
      title={
        <Space>
          <LockOutlined style={{ color: '#1677ff' }} />
          <span>Nhập mật khẩu giải mã GitHub</span>
        </Space>
      }
      onCancel={() => {
        setPassphrase('');
        onCancel();
      }}
      footer={footerButtons}
      destroyOnClose
      maskClosable={!loading}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Tệp sao lưu trên GitHub được mã hóa bằng thuật toán AES-GCM-256. Vui lòng nhập mật khẩu
          bảo vệ cá nhân của bạn để giải mã và xem trước nội dung.
        </Paragraph>

        {error && (
          <Alert
            type="error"
            showIcon
            message="Lỗi giải mã"
            description={error}
          />
        )}

        <div>
          <Paragraph strong style={{ marginBottom: 8 }}>
            Mật khẩu giải mã:
          </Paragraph>
          <Input.Password
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onPressEnter={handleSubmit}
            placeholder="Nhập mật khẩu giải mã..."
            aria-label="Mật khẩu giải mã"
            autoFocus
          />
        </div>
      </Space>
    </Modal>
  );
};
