import React, { useState } from 'react';
import { Input, Button, Select, Space, message, type InputRef } from 'antd';
import { parseQuickAddInput } from '../../utils/time';
import { createTask } from '../../db/repositories/taskRepo';
import type { Task } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';

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
          projectId: selectedProjectId || undefined,
        },
        db
      );

      setText('');
      message.success({ content: 'Task created', duration: 1.5 });
      onTaskCreated?.(created);
    } catch {
      message.error({ content: 'Failed to create task', duration: 2 });
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
    { value: '', label: 'Standalone' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Space.Compact style={{ width: '100%' }}>
      {projects.length > 0 && (
        <Select
          value={selectedProjectId || ''}
          onChange={(val) => setSelectedProjectId(val || undefined)}
          options={projectOptions}
          style={{ width: 140 }}
          aria-label="Assign to project"
        />
      )}
      <Input
        ref={inputRef}
        id="quick-add-input"
        data-shortcut-id="quick-add-input"
        placeholder="Add a task (e.g. 'Review pull request ~1h 30m'). Press Enter to save..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={submitting}
        maxLength={120}
        aria-label="Quick add task name and estimate"
      />
      <Button
        type="primary"
        onClick={() => void handleSubmit()}
        loading={submitting}
        disabled={!text.trim()}
      >
        Add Task
      </Button>
    </Space.Compact>
  );
};
