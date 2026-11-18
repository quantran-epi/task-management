import React, { useEffect, useMemo, useState } from 'react';
import { Input, Button, Select, Space, message, type InputRef } from 'antd';
import { parseQuickAddInput } from '../../utils/time';
import { createTask } from '../../db/repositories/taskRepo';
import type { ChangeRequest, System, Task, WorkType } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';
import { WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { WORK_TYPES } from '../../types/models';

export interface QuickAddBarProps {
  changeRequests?: ChangeRequest[];
  systems?: System[];
  /** CR currently selected in the task filter — pre-fills the CR select. */
  activeCrId?: string | null | undefined;
  onTaskCreated?: (task: Task) => void;
  db?: TaskPlannerDatabase;
  inputRef?: React.Ref<InputRef>;
}

export const QuickAddBar: React.FC<QuickAddBarProps> = ({
  changeRequests = [],
  systems = [],
  activeCrId,
  onTaskCreated,
  db,
  inputRef,
}) => {
  const [text, setText] = useState('');
  const [workType, setWorkType] = useState<WorkType>('code');
  const [crId, setCrId] = useState<string | undefined>(activeCrId ?? undefined);
  const [systemId, setSystemId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Follow the active filter when it changes (D-46)
  useEffect(() => {
    setCrId(activeCrId ?? undefined);
    setSystemId(undefined);
  }, [activeCrId]);

  const selectedCr = useMemo(
    () => changeRequests.find((cr) => cr.id === crId),
    [changeRequests, crId]
  );

  const subsystemOptions = useMemo(() => {
    if (!selectedCr) return [];
    return selectedCr.targets
      .map((target) => systems.find((s) => s.id === target.systemId))
      .filter((s): s is System => Boolean(s))
      .map((s) => ({ value: s.id, label: s.name }));
  }, [selectedCr, systems]);

  const handleSubmit = async () => {
    const raw = text.trim();
    if (!raw || submitting || !crId) return;

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
          crId,
          ...(systemId ? { systemId } : {}),
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
      <Select
        showSearch
        optionFilterProp="label"
        value={crId}
        onChange={(val) => {
          setCrId(val || undefined);
          setSystemId(undefined);
        }}
        placeholder="Chọn CR"
        options={changeRequests.map((cr) => ({ value: cr.id, label: `${cr.code} · ${cr.name}` }))}
        style={{ width: 220 }}
        aria-label="Change Request (CR)"
      />
      <Select
        allowClear
        value={systemId}
        onChange={(val) => setSystemId(val || undefined)}
        placeholder="Chung (không gắn)"
        options={subsystemOptions}
        disabled={!crId || subsystemOptions.length === 0}
        style={{ width: 170 }}
        aria-label="Subsystem"
      />
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
        placeholder={
          crId
            ? "Thêm tác vụ nhanh (vd: 'Xem xét PR ~1h 30m'). Nhấn Enter để lưu..."
            : 'Chọn CR trước khi thêm tác vụ'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={submitting || !crId}
        maxLength={120}
        aria-label="Thêm nhanh tên tác vụ và ước tính"
      />
      <Button
        type="primary"
        onClick={() => void handleSubmit()}
        loading={submitting}
        disabled={!crId || !text.trim()}
      >
        Thêm
      </Button>
    </Space.Compact>
  );
};
