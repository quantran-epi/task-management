import React, { useState, useEffect } from 'react';
import { Popover, Progress, Slider, InputNumber, Space, message } from 'antd';
import { updateTaskProgress } from '../../db/repositories/taskRepo';
import type { TaskPlannerDatabase } from '../../db';

export interface InlineProgressProps {
  taskId: string;
  progress: number;
  onProgressChange?: ((newProgress: number) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const InlineProgress: React.FC<InlineProgressProps> = ({
  taskId,
  progress,
  onProgressChange,
  db,
}) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<number>(progress);

  // Sync with prop changes when popover is closed
  useEffect(() => {
    if (!open) {
      setVal(progress);
    }
  }, [progress, open]);

  const persistChange = async (targetValue: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(targetValue)));
    if (clamped === progress) return;

    try {
      await updateTaskProgress(taskId, clamped, db);
      message.success({ content: 'Đã cập nhật tiến độ', duration: 1.5 });
      onProgressChange?.(clamped);
    } catch {
      message.error({ content: 'Không thể cập nhật tiến độ', duration: 2 });
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      void persistChange(val);
    }
  };

  const handleInputChange = (n: number | null) => {
    setVal(n ?? 0);
  };

  const handleInputBlur = () => {
    void persistChange(val);
  };

  const popoverContent = (
    <div style={{ width: 200, padding: 4 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Tiến độ:</span>
          <InputNumber
            min={0}
            max={100}
            value={val}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            formatter={(v) => `${v}%`}
            parser={(v) => Number((v || '').replace('%', '')) || 0}
            size="small"
            style={{ width: 75 }}
            aria-label="Nhập phần trăm tiến độ"
          />
        </div>
        <Slider
          min={0}
          max={100}
          value={val}
          onChange={(newVal) => setVal(newVal)}
          tooltip={{ formatter: (v) => `${v}%` }}
        />
      </Space>
    </div>
  );

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      content={popoverContent}
      destroyOnHidden
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Tiến độ ${progress}%`}
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          outline: 'none',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <Progress
          percent={progress}
          size="small"
          style={{ width: 80, margin: 0 }}
          strokeColor="#1677ff"
        />
      </div>
    </Popover>
  );
};
