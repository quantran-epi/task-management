import React, { useState, useEffect } from 'react';
import { Card, InputNumber, Button, Space, Typography, message } from 'antd';
import { WarningOutlined, SaveOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getGlobalBudgetWarnThresholdPct,
  setGlobalBudgetWarnThresholdPct,
} from '../../services/ai/budgetWarnSettings';
import {
  DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
  MAX_BUDGET_WARN_THRESHOLD_PCT,
  MIN_BUDGET_WARN_THRESHOLD_PCT,
} from '../../types/aiOffice';

const { Paragraph, Text } = Typography;

export interface BudgetWarnThresholdCardProps {
  db?: TaskPlannerDatabase;
}

/**
 * Phase 38 (D-01, D-02, D-04): the global budget-warning threshold.
 *
 * Crossing this percentage raises an in-app badge and one OS notification per level;
 * it never stops the run.
 */
export const BudgetWarnThresholdCard: React.FC<BudgetWarnThresholdCardProps> = ({
  db = defaultDb,
}) => {
  const [value, setValue] = useState<number>(DEFAULT_BUDGET_WARN_THRESHOLD_PCT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getGlobalBudgetWarnThresholdPct(db).then((stored) => {
      if (active) setValue(stored);
    });
    return () => {
      active = false;
    };
  }, [db]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setGlobalBudgetWarnThresholdPct(value, db);
      setValue(await getGlobalBudgetWarnThresholdPct(db));
      message.success('Đã lưu ngưỡng cảnh báo ngân sách');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>Ngưỡng cảnh báo ngân sách token</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Paragraph type="secondary">
        Khi một thành viên vượt quá phần trăm này của ngân sách được giao, ứng dụng hiện huy hiệu
        cảnh báo và gửi một thông báo hệ điều hành cho mỗi mức. Việc chạy <Text strong>không</Text>{' '}
        bị dừng lại.
      </Paragraph>
      <Space align="center" wrap>
        <InputNumber
          min={MIN_BUDGET_WARN_THRESHOLD_PCT}
          max={MAX_BUDGET_WARN_THRESHOLD_PCT}
          step={1}
          precision={0}
          value={value}
          onChange={(next) => setValue(typeof next === 'number' ? next : DEFAULT_BUDGET_WARN_THRESHOLD_PCT)}
          addonAfter="%"
          data-testid="budget-warn-threshold-input"
          aria-label="Ngưỡng cảnh báo ngân sách (%)"
        />
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
          data-testid="budget-warn-threshold-save"
        >
          Lưu
        </Button>
        <Text type="secondary">
          Giá trị hiện tại: {value}% (giới hạn {MIN_BUDGET_WARN_THRESHOLD_PCT}–
          {MAX_BUDGET_WARN_THRESHOLD_PCT})
        </Text>
      </Space>
    </Card>
  );
};
