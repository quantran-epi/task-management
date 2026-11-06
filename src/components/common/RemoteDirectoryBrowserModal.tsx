import React, { useState, useEffect, useCallback } from 'react';
import { Modal, List, Typography, Button, Spin, Breadcrumb, Empty, message } from 'antd';
import { FolderOutlined, FolderOpenOutlined, ArrowUpOutlined, CheckOutlined } from '@ant-design/icons';
import { listRemoteDir } from '../../services/sshService';
import type { SshConfig, RemoteFileInfo } from '../../types/ssh';

export interface RemoteDirectoryBrowserModalProps {
  open: boolean;
  sshConfig: SshConfig | undefined;
  initialPath?: string;
  onSelect: (selectedPath: string) => void;
  onCancel: () => void;
}

export const RemoteDirectoryBrowserModal: React.FC<RemoteDirectoryBrowserModalProps> = ({
  open,
  sshConfig,
  initialPath = '',
  onSelect,
  onCancel,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '/');
  const [items, setItems] = useState<RemoteFileInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchDirectory = useCallback(
    async (dirPath: string) => {
      if (!sshConfig) return;
      setLoading(true);
      try {
        const rawList = await listRemoteDir(sshConfig, dirPath);
        // Only show directories, sorted alphabetically
        const dirs = rawList
          .filter((item) => item.isDir && item.name !== '.' && item.name !== '..')
          .sort((a, b) => a.name.localeCompare(b.name));
        setItems(dirs);
        setCurrentPath(dirPath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Không thể duyệt thư mục: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [sshConfig]
  );

  useEffect(() => {
    if (open && sshConfig) {
      const startingPath = initialPath.trim() || sshConfig.defaultRemotePath || '/';
      void fetchDirectory(startingPath);
    }
  }, [open, sshConfig, initialPath, fetchDirectory]);

  const handleNavigateUp = () => {
    if (currentPath === '/' || !currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    void fetchDirectory(parentPath || '/');
  };

  const handleNavigateInto = (item: RemoteFileInfo) => {
    const nextPath = currentPath.endsWith('/')
      ? `${currentPath}${item.name}`
      : `${currentPath}/${item.name}`;
    void fetchDirectory(nextPath);
  };

  const handleConfirm = () => {
    onSelect(currentPath);
  };

  // Breadcrumb path parts
  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpenOutlined style={{ color: '#1677ff' }} />
          <span>Chọn thư mục Git Repository từ xa ({sshConfig?.name})</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={640}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Hủy
        </Button>,
        <Button
          key="select"
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleConfirm}
        >
          Chọn thư mục này
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Navigation Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
            borderRadius: 6,
            border: '1px solid #d9d9d9',
          }}
        >
          <Breadcrumb
            items={[
              {
                title: (
                  <span
                    style={{ cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => void fetchDirectory('/')}
                  >
                    /
                  </span>
                ),
              },
              ...pathParts.map((part, index) => {
                const subPath = '/' + pathParts.slice(0, index + 1).join('/');
                return {
                  title: (
                    <span
                      style={{ cursor: 'pointer' }}
                      onClick={() => void fetchDirectory(subPath)}
                    >
                      {part}
                    </span>
                  ),
                };
              }),
            ]}
          />
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            onClick={handleNavigateUp}
            disabled={currentPath === '/' || loading}
          >
            Lên thư mục cha
          </Button>
        </div>

        {/* Current Path Indicator */}
        <div style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.65)', fontFamily: 'monospace' }}>
          Đang duyệt: <strong>{currentPath}</strong>
        </div>

        {/* Directory Item List */}
        <div
          style={{
            height: 320,
            overflowY: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          {loading ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Spin tip="Đang tải danh sách thư mục..." />
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Empty description="Không có thư mục con nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <List
              dataSource={items}
              renderItem={(item) => (
                <List.Item
                  key={item.name}
                  onClick={() => handleNavigateInto(item)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FolderOutlined style={{ color: '#faad14', fontSize: 16 }} />
                    <Typography.Text style={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {item.name}
                    </Typography.Text>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
