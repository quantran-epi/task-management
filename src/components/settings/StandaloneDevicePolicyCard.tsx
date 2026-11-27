import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge, Button, Card, Input, Space, Tag, useMessage } from '../ui';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { loadDevicePolicy } from '../../services/telegram/telegramDevicePolicy';
import {
  clearStandaloneAccess,
  readAccessState,
  requestStandaloneAccess,
  type StandaloneAccessState,
} from '../../services/telegram/standaloneAccessService';

export interface StandaloneDevicePolicyCardProps {
  db?: TaskPlannerDatabase | undefined;
}

const ID_PATTERN = /^\d{6,12}$/;
const BLOCKED_MESSAGE: Record<'denied' | 'revoked' | 'expired', string> = {
  denied: 'Yêu cầu bị từ chối. Gửi lại để admin cấp quyền.',
  revoked: 'Yêu cầu đã bị thu hồi. Gửi lại để admin cấp quyền.',
  expired: 'Yêu cầu đã hết hạn. Gửi lại để admin cấp quyền.',
};
const blockedKind = (state: StandaloneAccessState | undefined): 'denied' | 'revoked' | 'expired' => {
  if (state?.status === 'denied') return 'denied';
  if (state?.status === 'revoked') return 'revoked';
  return 'expired';
};

/** Standalone xin quyền nội bộ bằng Telegram User ID; không dán /policy, không lưu bot token. */
export const StandaloneDevicePolicyCard: React.FC<StandaloneDevicePolicyCardProps> = ({ db = defaultDb }) => {
  const message = useMessage();
  const [telegramUserId, setTelegramUserId] = useState('');

  const stored = useLiveQuery(
    () => Promise.all([loadDevicePolicy(db), readAccessState(db)]),
    [db]
  );
  useEffect(() => {
    const [storedPolicy, storedState] = stored ?? [];
    if (!storedPolicy && !storedState) return;
    if (!telegramUserId) setTelegramUserId(storedState?.telegramUserId ?? storedPolicy?.telegramUserId ?? '');
  }, [stored, telegramUserId]);

  const policy = stored?.[0];
  const accessState = stored?.[1];

  const expired = policy ? Date.parse(policy.expiresAt) <= Date.now() : false;
  const status = expired || accessState?.status === 'expired'
    ? 'Hết hạn'
    : accessState?.status === 'denied'
      ? 'Bị từ chối'
      : accessState?.status === 'revoked'
        ? 'Đã thu hồi'
        : accessState?.status === 'pending'
          ? 'Đang chờ duyệt'
          : policy && accessState?.status === 'approved' ? 'Đang áp dụng' : 'Chưa có quyền';

  const requestAccess = async () => {
    const id = telegramUserId.trim();
    if (!ID_PATTERN.test(id)) {
      message.error('Telegram User ID không hợp lệ (cần 6-12 chữ số).');
      return;
    }
    try {
      const requestedAt = new Date().toISOString();
      await requestStandaloneAccess(db, id, requestedAt);
      message.success('Đã gửi yêu cầu. Giữ app mở để nhận cấu hình.');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không gửi được yêu cầu.');
    }
  };

  const unlink = async () => {
    try {
      await clearStandaloneAccess(db, telegramUserId.trim());
      message.success('Đã gỡ liên kết thiết bị.');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không gỡ được liên kết.');
    }
  };

  const requestedAt = accessState?.requestedAt
    ? new Date(accessState.requestedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <Card size="small" title="Telegram Device" extra={<Badge status={expired || accessState?.status === 'denied' || accessState?.status === 'revoked' ? 'danger' : accessState?.status === 'pending' ? 'warning' : accessState?.status === 'approved' && policy ? 'success' : 'info'} text={status} />}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <div style={{ marginBottom: 4 }}>Telegram User ID</div>
          <Input
            value={telegramUserId}
            onChange={(event) => setTelegramUserId(event.target.value)}
            placeholder="Ví dụ: 123456789"
            aria-label="Telegram User ID"
          />
        </div>
        {accessState?.status === 'pending' ? (
          <>
            <div>{`Đã gửi yêu cầu lúc ${requestedAt}. Giữ app mở để nhận cấu hình.`}</div>
            <Button onClick={() => void requestAccess()}>Gửi lại</Button>
          </>
        ) : accessState?.status === 'denied' || accessState?.status === 'revoked' || accessState?.status === 'expired' || expired ? (
          <>
            <div>{BLOCKED_MESSAGE[blockedKind(accessState)]}</div>
            <Button type="primary" onClick={() => void requestAccess()}>Gửi lại yêu cầu</Button>
          </>
        ) : policy && accessState?.status === 'approved' ? (
          <>
            <div>
              <div style={{ marginBottom: 4 }}>Model được phép</div>
              <Space wrap size={4}>
                {policy.allowedModels.map((model) => (
                  <Tag key={model}>{model}</Tag>
                ))}
              </Space>
              <div style={{ marginTop: 8 }}>Model mặc định: {policy.remoteSettings.defaultModel ?? '—'}</div>
              <div style={{ marginTop: 8 }}>Hạn policy: {policy.expiresAt}</div>
            </div>
            <Button danger size="small" onClick={() => void unlink()}>Gỡ liên kết</Button>
          </>
        ) : (
          <>
            <div>Chưa có quyền dùng Chat. Gửi yêu cầu để admin cấp model.</div>
            <Button type="primary" disabled={!ID_PATTERN.test(telegramUserId.trim())} onClick={() => void requestAccess()}>
              Request access
            </Button>
          </>
        )}
      </Space>
    </Card>
  );
};
