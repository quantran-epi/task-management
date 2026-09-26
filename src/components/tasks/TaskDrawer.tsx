import React, { useState, useEffect, useRef } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Space,
  DatePicker,
  Slider,
  message,
  Divider,
} from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { Task, Project, Milestone, TaskStatus, TaskPriority } from '../../types/models';
import { getTask, updateTask, reparentTask } from '../../db/repositories/taskRepo';
import { getAllProjects } from '../../db/repositories/projectRepo';
import { getAllMilestones } from '../../db/repositories/milestoneRepo';
import { createFocusRestorer } from '../../utils/focus';
import type { TaskPlannerDatabase } from '../../db';

export interface TaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onSave?: (task: Task) => void;
  triggerRef?: HTMLElement | null;
  db?: TaskPlannerDatabase;
}

interface TaskDrawerFormValues {
  name: string;
  projectId?: string;
  milestoneId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  hours: number;
  minutes: number;
  deadline?: Dayjs | null;
  actualStartDate?: Dayjs | null;
  actualEndDate?: Dayjs | null;
  progress: number;
  documentLinks?: string[];
  notes?: string;
}

const ALL_STATUSES: TaskStatus[] = [
  'Open',
  'In Progress',
  'Resolved',
  'In Review',
  'Done',
  'Cancelled',
];

const ALL_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

export const TaskDrawer: React.FC<TaskDrawerProps> = ({
  taskId,
  open,
  onClose,
  onSave,
  triggerRef,
  db,
}) => {
  const [form] = Form.useForm<TaskDrawerFormValues>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const selectedProjectId = Form.useWatch('projectId', form);
  const restorerRef = useRef<(() => void) | null>(null);

  // Focus management
  useEffect(() => {
    if (open) {
      if (triggerRef && typeof triggerRef.focus === 'function') {
        restorerRef.current = () => {
          setTimeout(() => {
            try {
              triggerRef.focus();
            } catch {
              // Ignore if detached
            }
          }, 0);
        };
      } else {
        restorerRef.current = createFocusRestorer();
      }
    }
  }, [open, triggerRef]);

  // Load project hierarchy & task data
  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);

    async function loadData() {
      try {
        const [projList, msList, taskData] = await Promise.all([
          getAllProjects(db),
          getAllMilestones(db),
          taskId ? getTask(taskId, db) : Promise.resolve(undefined),
        ]);

        if (!mounted) return;
        setProjects(projList);
        setMilestones(msList);

        if (taskData) {
          form.setFieldsValue({
            name: taskData.name,
            projectId: taskData.projectId || '',
            milestoneId: taskData.milestoneId || '',
            status: taskData.status,
            priority: taskData.priority,
            hours: Math.floor(taskData.estimateMinutes / 60),
            minutes: taskData.estimateMinutes % 60,
            deadline: taskData.deadline ? dayjs(taskData.deadline, 'YYYY-MM-DD') : null,
            actualStartDate: taskData.actualStartDate
              ? dayjs(taskData.actualStartDate, 'YYYY-MM-DD')
              : null,
            actualEndDate: taskData.actualEndDate
              ? dayjs(taskData.actualEndDate, 'YYYY-MM-DD')
              : null,
            progress: taskData.progress,
            documentLinks: taskData.documentLinks ?? [],
            notes: taskData.notes ?? '',
          });
        }
      } catch {
        message.error({ content: 'Failed to load task details', duration: 2 });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, [open, taskId, form, db]);

  const handleClose = () => {
    onClose();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleProjectChange = (nextProjectId: string) => {
    form.setFieldValue('projectId', nextProjectId);
    // Clear milestone if moving to Standalone or if milestone does not belong to new project (D-10)
    const currentMilestoneId = form.getFieldValue('milestoneId');
    if (!nextProjectId || currentMilestoneId) {
      const ms = milestones.find((m) => m.id === currentMilestoneId);
      if (!ms || ms.projectId !== nextProjectId) {
        form.setFieldValue('milestoneId', '');
      }
    }
  };

  const setPresetHours = (hrs: number) => {
    form.setFieldsValue({
      hours: hrs,
      minutes: 0,
    });
  };

  const addPresetMinutes = (extraMinutes: number) => {
    const curHours = form.getFieldValue('hours') ?? 0;
    const curMinutes = form.getFieldValue('minutes') ?? 0;
    const totalMinutes = Math.min(6000, curHours * 60 + curMinutes + extraMinutes);

    form.setFieldsValue({
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!taskId) return;

      setSaving(true);

      const targetProjectId = values.projectId ? values.projectId : undefined;
      const targetMilestoneId = values.milestoneId ? values.milestoneId : undefined;

      // Handle reparenting if parent changed
      const originalTask = await getTask(taskId, db);
      if (
        originalTask &&
        (originalTask.projectId !== targetProjectId ||
          originalTask.milestoneId !== targetMilestoneId)
      ) {
        await reparentTask(taskId, targetProjectId, targetMilestoneId, db);
      }

      // Compute total minutes (clamped to 6000)
      const hours = values.hours ?? 0;
      const minutes = values.minutes ?? 0;
      const estimateMinutes = Math.min(6000, Math.max(0, hours * 60 + minutes));

      // Sanitize document links
      const cleanedLinks = (values.documentLinks ?? [])
        .map((link) => link?.trim())
        .filter((link): link is string => Boolean(link && link.length > 0));

      const updated = await updateTask(
        taskId,
        {
          name: values.name.trim(),
          status: values.status,
          priority: values.priority,
          estimateMinutes,
          progress: values.progress ?? 0,
          deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
          actualStartDate: values.actualStartDate
            ? values.actualStartDate.format('YYYY-MM-DD')
            : undefined,
          actualEndDate: values.actualEndDate
            ? values.actualEndDate.format('YYYY-MM-DD')
            : undefined,
          documentLinks: cleanedLinks.length > 0 ? cleanedLinks : undefined,
          notes: values.notes?.trim() ? values.notes : undefined,
          projectId: targetProjectId,
          milestoneId: targetMilestoneId,
        },
        db
      );

      message.success({ content: 'Task saved', duration: 1.5 });
      onSave?.(updated);
      handleClose();
    } catch {
      // Form validation error caught by Ant Design Form
    } finally {
      setSaving(false);
    }
  };

  const filteredMilestones = milestones.filter(
    (m) => Boolean(selectedProjectId) && m.projectId === selectedProjectId
  );

  return (
    <Drawer
      title="Edit Task"
      width={520}
      open={open}
      onClose={handleClose}
      destroyOnClose
      loading={loading}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" onClick={() => void handleSave()} loading={saving}>
            Save Task
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ progress: 0, hours: 0, minutes: 0 }}>
        {/* Name */}
        <Form.Item
          name="name"
          label="Task Name"
          rules={[
            { required: true, message: 'Please enter a valid task name (1-120 characters).' },
            { max: 120, message: 'Please enter a valid task name (1-120 characters).' },
          ]}
        >
          <Input placeholder="Task name..." maxLength={120} />
        </Form.Item>

        {/* Parent Assignment: Project and Milestone */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="projectId" label="Project">
            <Select
              aria-label="Project"
              onChange={handleProjectChange}
              options={[
                { value: '', label: 'None / Standalone' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </Form.Item>

          <Form.Item name="milestoneId" label="Milestone">
            <Select
              aria-label="Milestone"
              disabled={!selectedProjectId}
              options={[
                { value: '', label: 'None' },
                ...filteredMilestones.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </Form.Item>
        </div>

        {/* Status and Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select
              aria-label="Status"
              options={ALL_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>

          <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
            <Select
              aria-label="Priority"
              options={ALL_PRIORITIES.map((p) => ({ value: p, label: p }))}
            />
          </Form.Item>
        </div>

        {/* Estimate with hours, minutes, and preset buttons */}
        <Form.Item label="Estimate">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Form.Item
                name="hours"
                label="Hours"
                style={{ marginBottom: 0 }}
                rules={[{ type: 'number', min: 0, max: 100 }]}
              >
                <InputNumber min={0 as number} max={100 as number} style={{ width: 100 }} aria-label="Hours" />
              </Form.Item>
              <Form.Item
                name="minutes"
                label="Minutes"
                style={{ marginBottom: 0 }}
                rules={[{ type: 'number', min: 0, max: 59 }]}
              >
                <InputNumber min={0 as number} max={59 as number} style={{ width: 100 }} aria-label="Minutes" />
              </Form.Item>
            </div>
            <Space wrap size="small">
              <Button size="small" onClick={() => addPresetMinutes(30)}>
                +30m
              </Button>
              <Button size="small" onClick={() => setPresetHours(1)}>
                1h
              </Button>
              <Button size="small" onClick={() => setPresetHours(2)}>
                2h
              </Button>
              <Button size="small" onClick={() => setPresetHours(4)}>
                4h
              </Button>
              <Button size="small" onClick={() => setPresetHours(8)}>
                8h
              </Button>
            </Space>
          </Space>
        </Form.Item>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="deadline" label="Deadline">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Deadline" />
          </Form.Item>

          <Form.Item name="actualStartDate" label="Actual Start">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Actual start" />
          </Form.Item>
        </div>

        <Form.Item name="actualEndDate" label="Actual End">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Actual end" />
        </Form.Item>

        {/* Progress Slider + Input */}
        <Form.Item label="Progress" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Form.Item name="progress" noStyle>
              <Slider min={0} max={100} style={{ flex: 1 }} />
            </Form.Item>
            <Form.Item name="progress" noStyle>
              <InputNumber
                min={0 as number}
                max={100 as number}
                formatter={(v) => `${v}%`}
                parser={(v) => (Number((v || '').replace('%', '')) || 0) as number}
                style={{ width: 80 }}
              />
            </Form.Item>
          </div>
        </Form.Item>

        <Divider style={{ margin: '16px 0' }} />

        {/* Document Links */}
        <Form.Item label="Document Links">
          <Form.List name="documentLinks">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <div key={field.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Form.Item
                      {...field}
                      noStyle
                      rules={[
                        {
                          pattern: /^https?:\/\//i,
                          message: 'Document link must be a valid HTTP or HTTPS URL.',
                        },
                      ]}
                    >
                      <Input
                        placeholder="https://example.com/spec"
                        prefix={<LinkOutlined style={{ color: '#8c8c8c' }} />}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      aria-label="Remove link"
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add('')}
                  icon={<PlusOutlined />}
                  style={{ width: '100%' }}
                >
                  Add Link
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>

        {/* Notes */}
        <Form.Item name="notes" label="Notes">
          <Input.TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder="Detailed task notes (markdown / plain text)..."
            style={{ whiteSpace: 'pre-wrap' }}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
};
