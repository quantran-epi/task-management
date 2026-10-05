import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Button, Space, Typography, message, Alert } from 'antd';
import { RobotOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  getGhostDevConfig,
  setGhostDevConfig,
  DEFAULT_GHOST_DEV_CONFIG,
  MODEL_ID_REGEX,
  type GhostDevConfig,
} from '../../services/agents/ghostDevConfig';

const { Paragraph } = Typography;

export const GhostDevConfigCard: React.FC = () => {
  const [form] = Form.useForm<GhostDevConfig>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const config = getGhostDevConfig();
    form.setFieldsValue(config);
  }, [form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setGhostDevConfig(values);
      setSaved(true);
      message.success('Đã lưu cấu hình Ghost Dev Agent');
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // validation error
    }
  };

  const handleReset = () => {
    form.setFieldsValue(DEFAULT_GHOST_DEV_CONFIG);
    setGhostDevConfig(DEFAULT_GHOST_DEV_CONFIG);
    message.info('Đã đặt lại cấu hình Ghost Dev về mặc định');
  };

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#4f46e5' }} />
          <span>Ghost Dev Agent Configuration</span>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleReset} size="small">
            Mặc định
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            style={{ backgroundColor: '#4f46e5' }}
            onClick={handleSave}
            size="small"
          >
            Lưu cấu hình
          </Button>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Cấu hình các tham số mặc định cho tiến trình Claude Code headless orchestration (Master &
        Worker agents). Các thiết lập này được lưu trữ cục bộ trên máy của bạn.
      </Paragraph>

      {saved && (
        <Alert
          message="Cấu hình đã được lưu thành công!"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item
            name="masterModel"
            label="Default Master Model (Lead Agent)"
            tooltip="Mô hình Claude chịu trách nhiệm lập kế hoạch, phân rã công việc và điều phối"
            rules={[
              { required: true, message: 'Vui lòng nhập model ID cho Master' },
              {
                pattern: MODEL_ID_REGEX,
                message: 'Model ID chỉ chứa ký tự chữ, số, dấu chấm và gạch ngang',
              },
            ]}
          >
            <Input placeholder="claude-3-5-sonnet-20241022" />
          </Form.Item>

          <Form.Item
            name="workerModel"
            label="Default Worker Model (Subtask Agent)"
            tooltip="Mô hình Claude thực thi các nhiệm vụ cụ thể được Master phân rã"
            rules={[
              { required: true, message: 'Vui lòng nhập model ID cho Worker' },
              {
                pattern: MODEL_ID_REGEX,
                message: 'Model ID chỉ chứa ký tự chữ, số, dấu chấm và gạch ngang',
              },
            ]}
          >
            <Input placeholder="claude-3-5-haiku-20241022" />
          </Form.Item>
        </div>

        <Form.Item
          name="concurrencyCap"
          label="Giới hạn tiến trình đồng thời (Concurrency Cap)"
          tooltip="Số lượng tiến trình Claude Code (Master + Workers) tối đa được phép chạy cùng lúc"
          rules={[
            { required: true, message: 'Vui lòng nhập giới hạn tiến trình' },
            { type: 'number', min: 1, max: 12, message: 'Giới hạn từ 1 đến 12 tiến trình' },
          ]}
        >
          <InputNumber min={1} max={12} style={{ width: 200 }} />
        </Form.Item>
      </Form>
    </Card>
  );
};
