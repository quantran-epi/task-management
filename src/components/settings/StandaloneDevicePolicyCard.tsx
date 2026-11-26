import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, Space, Tag, TextArea, useMessage } from '../ui';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  clearDevicePolicy,
  loadDevicePolicy,
  parsePolicyPayload,
  saveDevicePolicy,
  type TelegramDevicePolicy,
} from '../../services/telegram/telegramDevicePolicy';

export interface StandaloneDevicePolicyCardProps {
  db?: TaskPlannerDatabase | undefined;
}

/** Standalone chỉ dán payload do bot phát; không gọi Bot API, không lưu token. */
export const StandaloneDevicePolicyCard: React.FC<StandaloneDevicePolicyCardProps> = ({ db = defaultDb }) => {
  const message = useMessage();
  const [telegramUserId, setTelegramUserId] = useState('');
  const [policyText, setPolicyText] = useState('');
  const [policy, setPolicy] = useState<TelegramDevicePolicy | undefined>();

  useEffect(() => {
    let mounted = true;
    loadDevicePolicy(db).then((stored) => {
      if (mounted && stored) {
        setPolicy(stored);
        setTelegramUserId(stored.telegramUserId);
      }
    });
    return () => {
      mounted = false;
    };
  }, [db]);

  const expired = policy ? Date.parse(policy.expiresAt) <= Date.now() : false;
  const status = !policy ? 'Chưa liên kết' : expired ? 'Hết hạn' : 'Đang áp dụng';

  const applyPolicy = async () => {
    const expectedId = telegramUserId.trim();
    if (!expectedId) {
      message.error('Vui lòng nhập Telegram User ID.');
      return;
    }
    try {
      const parsed = parsePolicyPayload(policyText);
      if (parsed.telegramUserId !== expectedId) {
        message.error('Telegram User ID trong policy không khớp với ID đã nhập.');
        return;
      }
      await saveDevicePolicy(db, parsed);
      setPolicy(parsed);
      setPolicyText('');
      message.success('Đã áp dụng chính sách thiết bị.');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không đọc được nội dung /policy.');
    }
  };

  const unlink = async () => {
    await clearDevicePolicy(db);
    setPolicy(undefined);
    setPolicyText('');
    setTelegramUserId('');
    message.success('Đã gỡ liên kết thiết bị.');
  };

  return (
    <Card size="small" title="Telegram Device" extra={<Badge status={expired ? 'danger' : policy ? 'success' : 'info'} text={status} />}>
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
        <div>
          <div style={{ marginBottom: 4 }}>Dán nội dung /policy</div>
          <TextArea
            rows={4}
            value={policyText}
            onChange={(event) => setPolicyText(event.target.value)}
            placeholder="Dán toàn bộ nội dung bot trả cho /policy"
            aria-label="Dán nội dung /policy"
          />
        </div>
        <Button type="primary" onClick={() => void applyPolicy()}>
          Áp dụng chính sách
        </Button>
        {policy && (
          <div>
            <div style={{ marginBottom: 4 }}>Model được phép</div>
            <Space wrap size={4}>
              {policy.allowedModels.map((model) => (
                <Tag key={model}>{model}</Tag>
              ))}
            </Space>
            <div style={{ marginTop: 8 }}>Hết hạn: {policy.expiresAt}</div>
            <Button danger size="small" style={{ marginTop: 8 }} onClick={() => void unlink()}>
              Gỡ liên kết
            </Button>
          </div>
        )}
      </Space>
    </Card>
  );
};
