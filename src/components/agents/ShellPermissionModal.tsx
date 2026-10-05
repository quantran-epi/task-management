import React, { useState, useEffect } from 'react';
import { Modal, Typography, Space, Button, Alert } from 'antd';
import type { ShellPermissionRequest } from '../../types/agent';
import { isTauriApp } from '../../utils/timerPopout';

const { Text, Paragraph } = Typography;

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export interface ShellPermissionModalProps {
  onPermissionAnswered?: (requestId: string, approved: boolean) => void;
}

export const ShellPermissionModal: React.FC<ShellPermissionModalProps> = ({
  onPermissionAnswered,
}) => {
  const [requests, setRequests] = useState<ShellPermissionRequest[]>([]);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<ShellPermissionRequest>(
          'ghost-dev:permission-request',
          (event) => {
            if (event.payload) {
              setRequests((prev) => [...prev, event.payload]);
            }
          }
        );
      } catch (err) {
        console.error('[GhostDev] Failed to listen to shell permission requests:', err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const currentRequest = requests[0] ?? null;

  const handleResponse = async (approved: boolean) => {
    if (!currentRequest) return;
    setResponding(true);
    try {
      if (isTauriApp()) {
        await tauriInvoke('respond_shell_permission', {
          requestId: currentRequest.requestId,
          approved,
        });
      }
      onPermissionAnswered?.(currentRequest.requestId, approved);
      setRequests((prev) => prev.slice(1));
    } catch (err) {
      console.error('[GhostDev] Failed to respond to shell permission:', err);
    } finally {
      setResponding(false);
    }
  };

  if (!currentRequest) return null;

  return (
    <Modal
      title="Cấp quyền chạy lệnh Shell"
      open={true}
      closable={false}
      maskClosable={false}
      footer={[
        <Button
          key="deny"
          danger
          onClick={() => handleResponse(false)}
          loading={responding}
          aria-label="Từ chối chạy lệnh"
        >
          Từ chối
        </Button>,
        <Button
          key="approve"
          type="primary"
          style={{ backgroundColor: '#4f46e5' }}
          onClick={() => handleResponse(true)}
          loading={responding}
          aria-label="Cho phép chạy lệnh"
        >
          Cho phép
        </Button>,
      ]}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={16}>
        <Alert
          message="Cảnh báo an toàn hệ thống"
          description={`Agent yêu cầu thực thi lệnh "${currentRequest.command}" trong thư mục worktree. Bạn có muốn cho phép không?`}
          type="warning"
          showIcon
        />

        <div>
          <Paragraph style={{ marginBottom: 4 }}>
            <Text strong>Lệnh cần thực thi:</Text>
          </Paragraph>
          <pre
            style={{
              backgroundColor: '#1e1e1e',
              color: '#f87171',
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              margin: 0,
              overflowX: 'auto',
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
            }}
          >
            {currentRequest.command}
          </pre>
        </div>

        <div>
          <Text strong>Thư mục thực thi:</Text>
          <br />
          <Text code style={{ wordBreak: 'break-all' }}>
            {currentRequest.workingDir}
          </Text>
        </div>

        <Text type="secondary" style={{ fontSize: 12 }}>
          Lệnh này không nằm trong danh sách lệnh an toàn mặc định (SAFE_COMMAND_PREFIXES).
          Chỉ cho phép nếu bạn tin tưởng hành động này.
        </Text>
      </Space>
    </Modal>
  );
};
