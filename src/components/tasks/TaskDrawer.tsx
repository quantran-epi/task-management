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
  Tabs,
  Typography,
  Badge,
  Switch,
  Tooltip,
} from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined, SyncOutlined, FolderOpenOutlined, ExportOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { openDocumentLink, browseLocalFolder } from '../../utils/documentLinks';
import type {
  Task,
  ChangeRequest,
  System,
  TaskStatus,
  TaskPriority,
  WorkType,
  RecurrenceFrequency,
  TaskChecklistItem,
} from '../../types/models';
import { WORK_TYPES } from '../../types/models';
import { getTask, updateTask, reparentTask } from '../../db/repositories/taskRepo';
import { getAllChangeRequests } from '../../db/repositories/changeRequestRepo';
import { getAllSystems } from '../../db/repositories/systemRepo';
import { createFocusRestorer } from '../../utils/focus';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { useAIChat } from '../../context/AIChatContext';
import { TaskDrawerPlanning } from './TaskDrawerPlanning';
import { TaskJiraSection } from './TaskJiraSection';
import { WorkSessionsTab } from './WorkSessionsTab';
import { EntityNotesSection } from '../notes/EntityNotesSection';
import { EntityDiagramsSection } from '../diagrams/EntityDiagramsSection';
import { TagSelect } from '../common/TagSelect';
import { RemindersFormList, formatRemindersForForm, formatRemindersForSave } from '../common/RemindersFormList';
import { TaskChecklistSection } from './TaskChecklistSection';
import { WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { resolveInheritedTags } from '../../domain/inheritance';
import { LinkedKnowledgeSection } from './LinkedKnowledgeSection';
import { QuickPreviewDrawer } from '../notes/QuickPreviewDrawer';
import { RunGhostDevModal } from '../agents/RunGhostDevModal';
import type { TaskPlannerDatabase } from '../../db';
import type { AppRoute } from '../../types/navigation';

export interface TaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onSave?: (task: Task) => void;
  triggerRef?: HTMLElement | null;
  db?: TaskPlannerDatabase;
  onNavigate?: ((route: AppRoute) => void) | undefined;
}

interface TaskDrawerFormValues {
  name: string;
  crId?: string;
  systemId?: string;
  status: TaskStatus;
  priority: TaskPriority;
  workType?: WorkType;
  opsOwners?: string[];
  businessAnalysts?: string[];
  hours: number;
  minutes: number;
  deadline?: Dayjs | null;
  actualStartDate?: Dayjs | null;
  actualEndDate?: Dayjs | null;
  progress: number;
  documentLinks?: string[];
  reminderDate?: Dayjs | null;
  reminderNote?: string;
  reminders?: unknown[];
  checklist?: TaskChecklistItem[];
  notes?: string;
  isRecurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceInterval?: number;
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: Dayjs | null;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Resolved: 'Đã giải quyết',
  'In Review': 'Đang duyệt',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  Low: 'Thấp',
  Medium: 'Trung bình',
  High: 'Cao',
  Urgent: 'Khẩn cấp',
};

const ALL_STATUSES: TaskStatus[] = [
  'Open',
  'Pending',
  'In Progress',
  'Resolved',
  'In Review',
  'Done',
  'Cancelled',
];

const ALL_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

const { Title } = Typography;

export const TaskDrawer: React.FC<TaskDrawerProps> = ({
  taskId,
  open,
  onClose,
  onSave,
  triggerRef,
  db,
  onNavigate,
}) => {
  useRegisterActiveForm('task-drawer', open);

  const [form] = Form.useForm<TaskDrawerFormValues>();
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [ghostDevModalOpen, setGhostDevModalOpen] = useState(false);
  const selectedCrId = Form.useWatch('crId', form);
  const watchHours = Form.useWatch('hours', form);
  const watchMinutes = Form.useWatch('minutes', form);
  const liveEstimateMinutes =
    watchHours !== undefined && watchMinutes !== undefined ? watchHours * 60 + watchMinutes : undefined;
  const restorerRef = useRef<(() => void) | null>(null);

  // Live count of notes attached to this task (D-15, UI-SPEC)
  const taskNotesCount = useLiveQuery(
    async () => {
      if (!taskId) return 0;
      const targetDb = db || (await import('../../db')).db;
      if (!targetDb?.notes) return 0;
      return await targetDb.notes
        .where('entityId')
        .equals(taskId)
        .filter((n) => n.entityType === 'task' && n.type !== 'diagram' && !n.deletedAt)
        .count();
    },
    [taskId, db]
  );

  // Live count of diagrams attached to this task
  const taskDiagramsCount = useLiveQuery(
    async () => {
      if (!taskId) return 0;
      const targetDb = db || (await import('../../db')).db;
      if (!targetDb?.notes) return 0;
      return await targetDb.notes
        .where('entityId')
        .equals(taskId)
        .filter((n) => n.entityType === 'task' && n.type === 'diagram' && !n.deletedAt)
        .count();
    },
    [taskId, db]
  );

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
        const [crList, sysList, taskData] = await Promise.all([
          getAllChangeRequests(db),
          getAllSystems(db),
          taskId ? getTask(taskId, db) : Promise.resolve(undefined),
        ]);

        if (!mounted) return;
        setChangeRequests(crList);
        setSystems(sysList);
        setCurrentTask(taskData ?? null);

        if (taskData) {
          form.setFieldsValue({
            name: taskData.name,
            crId: taskData.crId || '',
            systemId: taskData.systemId || '',
            status: taskData.status,
            priority: taskData.priority,
            workType: taskData.workType || 'code',
            opsOwners: taskData.opsOwners ?? [],
            businessAnalysts: taskData.businessAnalysts ?? [],
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
            checklist: taskData.checklist ?? [],
            documentLinks: taskData.documentLinks ?? [],
            reminders: formatRemindersForForm(taskData),
            notes: taskData.notes ?? '',
            isRecurring: taskData.isRecurring ?? false,
            recurrenceFrequency: taskData.recurrenceFrequency ?? 'daily',
            recurrenceInterval: taskData.recurrenceInterval ?? 1,
            recurrenceDaysOfWeek: taskData.recurrenceDaysOfWeek ?? [],
            recurrenceEndDate: taskData.recurrenceEndDate
              ? dayjs(taskData.recurrenceEndDate, 'YYYY-MM-DD')
              : null,
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

  const { registerActiveItem, openChat } = useAIChat();

  // Register active task while open for auto-follow grounding
  useEffect(() => {
    if (open && currentTask) {
      return registerActiveItem({
        type: 'task',
        id: currentTask.id,
        title: currentTask.name,
      });
    }
    return undefined;
  }, [open, currentTask, registerActiveItem]);

  const handleAskAI = () => {
    if (currentTask) {
      openChat({
        type: 'task',
        id: currentTask.id,
        title: currentTask.name,
      });
    } else {
      openChat();
    }
    handleClose();
  };

  const handleClose = () => {
    onClose();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleCrChange = (nextCrId: string) => {
    form.setFieldValue('crId', nextCrId);
    // Clear the subsystem when it is not a target of the new CR (D-46)
    const currentSystemId = form.getFieldValue('systemId');
    if (currentSystemId) {
      const nextCr = changeRequests.find((cr) => cr.id === nextCrId);
      const stillValid = nextCr?.targets.some((t) => t.systemId === currentSystemId);
      if (!stillValid) {
        form.setFieldValue('systemId', '');
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

      const targetCrId = values.crId ? values.crId : undefined;
      const targetSystemId = values.systemId ? values.systemId : undefined;
      if (!targetCrId) return;

      // Handle reparenting if the CR or subsystem changed
      const originalTask = await getTask(taskId, db);
      if (
        originalTask &&
        (originalTask.crId !== targetCrId || originalTask.systemId !== targetSystemId)
      ) {
        await reparentTask(taskId, targetCrId, targetSystemId, db);
      }

      // Compute total minutes (clamped to 6000)
      const hours = values.hours ?? 0;
      const minutes = values.minutes ?? 0;
      const estimateMinutes = Math.min(6000, Math.max(0, hours * 60 + minutes));

      // Sanitize document links
      const cleanedLinks = (values.documentLinks ?? [])
        .map((link) => link?.trim())
        .filter((link): link is string => Boolean(link && link.length > 0));

      const savedReminders = formatRemindersForSave(values.reminders);

      const updated = await updateTask(
        taskId,
        {
          name: values.name.trim(),
          status: values.status,
          priority: values.priority,
          workType: values.workType || 'code',
          opsOwners: (values.opsOwners ?? []).length > 0 ? values.opsOwners : undefined,
          businessAnalysts:
            (values.businessAnalysts ?? []).length > 0 ? values.businessAnalysts : undefined,
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
          reminders: savedReminders ?? [],
          reminderDate: savedReminders?.[0]?.date,
          reminderNote: savedReminders?.[0]?.note,
          checklist: values.checklist ?? [],
          notes: values.notes?.trim() ? values.notes : undefined,
          crId: targetCrId,
          systemId: targetSystemId,
          isRecurring: values.isRecurring ?? false,
          recurrenceFrequency: values.isRecurring ? values.recurrenceFrequency || 'daily' : undefined,
          recurrenceInterval: values.isRecurring ? values.recurrenceInterval || 1 : undefined,
          recurrenceDaysOfWeek: values.isRecurring && values.recurrenceFrequency === 'weekly'
            ? values.recurrenceDaysOfWeek
            : undefined,
          recurrenceEndDate: values.isRecurring && values.recurrenceEndDate
            ? values.recurrenceEndDate.format('YYYY-MM-DD')
            : undefined,
        },
        db
      );

      message.success({ content: 'Đã lưu tác vụ', duration: 1.5 });
      onSave?.(updated);
      handleClose();
    } catch (err) {
      // Ant Design validation errors carry `errorFields` and are already rendered inline;
      // repository invariant errors (D-26) must surface or the drawer just sits there.
      if (err instanceof Error && !('errorFields' in err)) {
        message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTaskJira = async (patch: Partial<Task>) => {
    if (!taskId) return;
    const updated = await updateTask(taskId, patch, db);
    setCurrentTask(updated);
    if (patch.status) {
      form.setFieldValue('status', patch.status);
    }
    onSave?.(updated);
  };

  const filteredSystems = systems.filter((s) => {
    if (!selectedCrId) return false;
    const cr = changeRequests.find((c) => c.id === selectedCrId);
    return Boolean(cr?.targets.some((t) => t.systemId === s.id));
  });

  const selectedCr = changeRequests.find((cr) => cr.id === selectedCrId);

  const inheritedOps = resolveInheritedTags('opsOwners', {}, {
    cr: selectedCr ? { name: selectedCr.name, opsOwners: selectedCr.opsOwners } : undefined,
  });

  const inheritedBA = resolveInheritedTags('businessAnalysts', {}, {
    cr: selectedCr ? { name: selectedCr.name, businessAnalysts: selectedCr.businessAnalysts } : undefined,
  });

  const opsInheritedText =
    inheritedOps.source !== 'none' && inheritedOps.tags.length > 0
      ? `Kế thừa: [${inheritedOps.tags.join(', ')}] (từ CR)`
      : undefined;

  const baInheritedText =
    inheritedBA.source !== 'none' && inheritedBA.tags.length > 0
      ? `Kế thừa: [${inheritedBA.tags.join(', ')}] (từ CR)`
      : undefined;

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

  const renderSection = (title: string, children: React.ReactNode) => (
    <section style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
        {title}
      </Title>
      {children}
    </section>
  );

  const renderDetailsTab = () => (
    <Form form={form} layout="vertical" initialValues={{ progress: 0, hours: 0, minutes: 0 }}>
      {renderSection(
        'Thông tin chính',
        <>
          <Form.Item
            name="name"
            label="Tên tác vụ"
            rules={[
              { required: true, message: 'Vui lòng nhập tên tác vụ hợp lệ (1-120 ký tự).' },
              { max: 120, message: 'Vui lòng nhập tên tác vụ hợp lệ (1-120 ký tự).' },
            ]}
          >
            <Input placeholder="Tên tác vụ..." maxLength={120} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item
              name="crId"
              label="Change Request (CR)"
              rules={[{ required: true, message: 'Vui lòng chọn Change Request.' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                aria-label="Change Request (CR)"
                onChange={handleCrChange}
                placeholder="Chọn CR"
                options={changeRequests.map((cr) => ({
                  value: cr.id,
                  label: `${cr.code} · ${cr.name}`,
                }))}
              />
            </Form.Item>

            <Tooltip title={selectedCrId ? '' : 'Chọn CR trước'} placement="top">
              <span style={{ display: 'block' }}>
                <Form.Item name="systemId" label="Subsystem">
                  <Select
                    aria-label="Subsystem"
                    disabled={!selectedCrId}
                    placeholder="Chung (không gắn)"
                    options={[
                      { value: '', label: 'Chung (không gắn)' },
                      ...filteredSystems.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                </Form.Item>
              </span>
            </Tooltip>
          </div>
        </>
      )}

      {renderSection(
        'Trạng thái & phân loại',
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}>
              <Select
                aria-label="Trạng thái"
                options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s }))}
              />
            </Form.Item>

            <Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}>
              <Select
                aria-label="Độ ưu tiên"
                options={ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] || p }))}
              />
            </Form.Item>

            <Form.Item name="workType" label="Loại công việc" rules={[{ required: true }]}>
              <Select aria-label="Loại công việc" options={workTypeOptions} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="opsOwners" label="Ops Owner">
              <TagSelect field="opsOwners" inheritedText={opsInheritedText} />
            </Form.Item>

            <Form.Item name="businessAnalysts" label="Business Analyst">
              <TagSelect field="businessAnalysts" inheritedText={baInheritedText} />
            </Form.Item>
          </div>
        </>
      )}

      {renderSection(
        'Thời gian & tiến độ',
        <>
          <Form.Item label="Thời gian ước tính">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Form.Item
                  name="hours"
                  label="Giờ"
                  style={{ marginBottom: 0 }}
                  rules={[{ type: 'number', min: 0, max: 100 }]}
                >
                  <InputNumber min={0 as number} max={100 as number} style={{ width: 100 }} aria-label="Giờ" />
                </Form.Item>
                <Form.Item
                  name="minutes"
                  label="Phút"
                  style={{ marginBottom: 0 }}
                  rules={[{ type: 'number', min: 0, max: 59 }]}
                >
                  <InputNumber min={0 as number} max={59 as number} style={{ width: 100 }} aria-label="Phút" />
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="deadline" label="Hạn chót">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Hạn chót" />
            </Form.Item>

            <Form.Item name="actualStartDate" label="Bắt đầu thực tế">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Bắt đầu thực tế" />
            </Form.Item>
          </div>

          <Form.Item name="actualEndDate" label="Kết thúc thực tế">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Kết thúc thực tế" />
          </Form.Item>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#fafafa',
              borderRadius: '8px',
              marginBottom: '16px',
              border: '1px solid #f0f0f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Space>
                <SyncOutlined style={{ color: '#1677ff' }} />
                <span style={{ fontWeight: 500 }}>Lặp lại định kỳ</span>
              </Space>
              <Form.Item name="isRecurring" valuePropName="checked" noStyle>
                <Switch aria-label="Bật lặp lại định kỳ" />
              </Form.Item>
            </div>

            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) =>
                prev.isRecurring !== cur.isRecurring ||
                prev.recurrenceFrequency !== cur.recurrenceFrequency
              }
            >
              {({ getFieldValue }) => {
                const isRecurring = getFieldValue('isRecurring');
                if (!isRecurring) return null;
                const freq = getFieldValue('recurrenceFrequency') || 'daily';

                return (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Form.Item
                        name="recurrenceFrequency"
                        label="Tần suất"
                        initialValue="daily"
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          options={[
                            { value: 'daily', label: 'Hàng ngày' },
                            { value: 'weekly', label: 'Hàng tuần' },
                            { value: 'monthly', label: 'Hàng tháng' },
                          ]}
                        />
                      </Form.Item>

                      <Form.Item
                        name="recurrenceInterval"
                        label="Chu kỳ"
                        initialValue={1}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          min={1}
                          max={365}
                          style={{ width: '100%' }}
                          addonAfter={
                            freq === 'daily'
                              ? 'ngày'
                              : freq === 'weekly'
                                ? 'tuần'
                                : 'tháng'
                          }
                        />
                      </Form.Item>
                    </div>

                    {freq === 'weekly' && (
                      <Form.Item
                        name="recurrenceDaysOfWeek"
                        label="Các ngày trong tuần"
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          mode="multiple"
                          placeholder="Chọn ngày lặp lại"
                          options={[
                            { value: 1, label: 'Thứ 2' },
                            { value: 2, label: 'Thứ 3' },
                            { value: 3, label: 'Thứ 4' },
                            { value: 4, label: 'Thứ 5' },
                            { value: 5, label: 'Thứ 6' },
                            { value: 6, label: 'Thứ 7' },
                            { value: 7, label: 'Chủ nhật' },
                          ]}
                        />
                      </Form.Item>
                    )}

                    <Form.Item
                      name="recurrenceEndDate"
                      label="Ngày kết thúc (tùy chọn)"
                      style={{ marginBottom: 0 }}
                    >
                      <DatePicker
                        style={{ width: '100%' }}
                        format="YYYY-MM-DD"
                        placeholder="Không giới hạn"
                      />
                    </Form.Item>
                  </div>
                );
              }}
            </Form.Item>
          </div>

          <RemindersFormList />

          <Form.Item label="Tiến độ" style={{ marginBottom: 12 }}>
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

          <Form.Item label="Danh sách việc cần làm (Checklist)">
            <Form.Item name="checklist" noStyle>
              <TaskChecklistSection
                onSyncProgress={(pct) => {
                  form.setFieldValue('progress', pct);
                }}
              />
            </Form.Item>
          </Form.Item>
        </>
      )}

      {renderSection(
        'Kế hoạch phân bổ',
        currentTask ? (
          <TaskDrawerPlanning task={currentTask} liveEstimateMinutes={liveEstimateMinutes} db={db} />
        ) : null
      )}

      {renderSection(
        'Jira',
        currentTask ? <TaskJiraSection task={currentTask} onUpdateTask={handleUpdateTaskJira} db={db} /> : null
      )}

      {renderSection(
        'Tài liệu & ghi chú',
        <>
          <LinkedKnowledgeSection
            taskId={currentTask?.id || ''}
            entityType="task"
            entityId={currentTask?.id || ''}
            notes={currentTask?.notes}
            documentLinks={currentTask?.documentLinks}
            onOpenDocPreview={(docId) => setPreviewDocId(docId)}
            db={db}
          />

          <Form.Item label="Tài liệu liên kết">
            <Form.List name="documentLinks">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {fields.map((field) => (
                    <div key={field.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Form.Item
                        {...field}
                        noStyle
                        rules={[
                          {
                            validator: (_: unknown, value: string) => {
                              if (!value || /^https?:\/\//i.test(value) || /^file:\/\//i.test(value) || /^[A-Za-z]:\\/.test(value) || /^\//.test(value) || /^\\\\/.test(value)) {
                                return Promise.resolve();
                              }
                              return Promise.reject('Liên kết phải là URL (http/https), đường dẫn thư mục, hoặc file URI.');
                            },
                          },
                        ]}
                      >
                        <Input
                          placeholder="https://... hoặc C:\folder hoặc /path/to/folder"
                          prefix={<LinkOutlined style={{ color: '#8c8c8c' }} />}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      </Form.Item>
                      <Button
                        type="text"
                        icon={<FolderOpenOutlined />}
                        title="Duyệt thư mục trên máy"
                        aria-label="Duyệt thư mục"
                        onClick={async () => {
                          const picked = await browseLocalFolder();
                          if (picked) {
                            form.setFieldValue(['documentLinks', field.name], picked);
                          }
                        }}
                      />
                      <Button
                        type="text"
                        icon={<ExportOutlined />}
                        title="Mở liên kết"
                        aria-label="Mở liên kết"
                        onClick={() => {
                          const val = form.getFieldValue(['documentLinks', field.name]);
                          if (val) {
                            void openDocumentLink(val);
                          }
                        }}
                      />
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                        aria-label="Xóa liên kết"
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      type="dashed"
                      onClick={() => add('')}
                      icon={<PlusOutlined />}
                      style={{ flex: 1 }}
                    >
                      Thêm liên kết
                    </Button>
                    <Button
                      type="default"
                      icon={<FolderOpenOutlined />}
                      onClick={async () => {
                        const picked = await browseLocalFolder();
                        if (picked) {
                          add(picked);
                        }
                      }}
                    >
                      Chọn thư mục từ máy
                    </Button>
                  </div>
                </Space>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea
              autoSize={{ minRows: 4, maxRows: 10 }}
              placeholder="Ghi chú chi tiết tác vụ (văn bản thuần / markdown)..."
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </Form.Item>
        </>
      )}
    </Form>
  );

  const tabItems = [
    {
      key: 'details',
      label: 'Chi tiết tác vụ',
      children: renderDetailsTab(),
    },
    {
      key: 'sessions',
      label: 'Lịch sử làm việc',
      children: currentTask ? <WorkSessionsTab task={currentTask} db={db} /> : null,
    },
    {
      key: 'notes',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>Ghi chú</span>
          <Badge
            count={taskNotesCount || 0}
            overflowCount={99}
            size="small"
            style={{ backgroundColor: taskNotesCount ? '#1677ff' : '#d9d9d9' }}
          />
        </span>
      ),
      children: currentTask ? (
        <EntityNotesSection entityType="task" entityId={currentTask.id} db={db} />
      ) : null,
    },
    {
      key: 'diagrams',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>Biểu đồ</span>
          <Badge
            count={taskDiagramsCount || 0}
            overflowCount={99}
            size="small"
            style={{ backgroundColor: taskDiagramsCount ? '#10b981' : '#d9d9d9' }}
          />
        </span>
      ),
      children: currentTask ? (
        <EntityDiagramsSection entityType="task" entityId={currentTask.id} db={db} />
      ) : null,
    },
  ];

  return (
    <Drawer
      zIndex={1050}
      title="Chỉnh sửa tác vụ"
      width={560}
      open={open}
      onClose={handleClose}
      destroyOnClose
      loading={loading}
      extra={
        <Space>
          <Button
            type="text"
            icon={<RobotOutlined style={{ color: '#4f46e5' }} />}
            onClick={() => setGhostDevModalOpen(true)}
            aria-label="Khởi chạy Ghost Dev"
          >
            Ghost Dev
          </Button>
          <Button
            type="text"
            icon={<RobotOutlined style={{ color: '#1677ff' }} />}
            onClick={handleAskAI}
            aria-label="Hỏi AI về tác vụ này"
          >
            Hỏi AI
          </Button>
        </Space>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose}>Hủy</Button>
          <Button type="primary" onClick={() => void handleSave()} loading={saving}>
            Lưu tác vụ
          </Button>
        </div>
      }
    >
      <div
        data-ai-context-type="task"
        data-ai-context-id={currentTask?.id || taskId || ''}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <Tabs defaultActiveKey="details" items={tabItems} />
      </div>

      <QuickPreviewDrawer
        docId={previewDocId}
        open={Boolean(previewDocId)}
        onClose={() => setPreviewDocId(null)}
        db={db}
      />

      <RunGhostDevModal
        task={currentTask}
        visible={ghostDevModalOpen}
        onCancel={() => setGhostDevModalOpen(false)}
        onNavigate={onNavigate}
      />
    </Drawer>
  );
};
