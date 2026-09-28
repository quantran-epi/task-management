import React, { useState } from 'react';
import { Input, Button, Select, Space, message, type InputRef } from 'antd';
import { parseQuickAddInput } from '../../utils/time';
import { createTask } from '../../db/repositories/taskRepo';
import type { Task, WorkType } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';
import { WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { WORK_TYPES } from '../../types/models';

export interface QuickAddBarProps {
  projects?: { id: string; name: string }[];
  defaultProjectId?: string;
  onTaskCreated?: (task: Task) => void;
  db?: TaskPlannerDatabase;
  inputRef?: React.Ref<InputRef>;
}

export const QuickAddBar: React.FC<QuickAddBarProps> = ({
  projects = [],
  defaultProjectId,
  onTaskCreated,
  db,
  inputRef,
}) => {
  const [text, setText] = useState('');
  const [workType, setWorkType] = useState<WorkType>('code');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(defaultProjectId);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const raw = text.trim();
    if (!raw || submitting) return;

    const { name, estimateMinutes } = parseQuickAddInput(raw);
    if (!name) return;

    try {
      setSubmitting(true);
      const created = await createTask(
        {
          name,
          status: 'Open',
          priority: 'Medium',
          estimateMinutes,
          workType,
          projectId: selectedProjectId || undefined,
        },
        db
      );

      setText('');
      setWorkType('code');
      message.success({ content: 'Task created', duration: 1.5 });
      onTaskCreated?.(created);
    } catch {
      message.error({ content: 'Không thể tạo tác vụ', duration: 2 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const projectOptions = [
    { value: '', label: 'Độc lập' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

  const workTypeOptions = WORK_TYPES.map((wt) => {
    const cfg = WORK_TYPE_CONFIG[wt];
    return {
      value: wt,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {cfg.icon}
          <span>{cfg.label}</span>
        </span>
      ),
    };
  });

  return (
    <Space.Compact style={{ width: '100%' }}>
      {projects.length > 0 && (
        <Select
          value={selectedProjectId || ''}
          onChange={(val) => setSelectedProjectId(val || undefined)}
          options={projectOptions}
          style={{ width: 140 }}
          aria-label="Gán vào dự án"
        />
      )}
      <Select
        value={workType}
        onChange={(val) => setWorkType(val)}
        options={workTypeOptions}
        style={{ width: 155 }}
        aria-label="Loại công việc"
      />
      <Input
        ref={inputRef}
        id="quick-add-input"
        data-shortcut-id="quick-add-input"
        placeholder="Thêm tác vụ nhanh (vd: 'Xem xét PR ~1h 30m'). Nhấn Enter để lưu..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={submitting}
        maxLength={120}
        aria-label="Thêm nhanh tên tác vụ và ước tính"
      />
      <Button
        type="primary"
        onClick={() => void handleSubmit()}
        loading={submitting}
        disabled={!text.trim()}
      >
        Thêm
      </Button>
    </Space.Compact>
  );
};
