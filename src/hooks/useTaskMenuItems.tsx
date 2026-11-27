import { useState } from 'react';
import type { MenuProps } from 'antd';
import { useAntdToken, useMessage, useTaskMateModal } from '../components/ui';
import {
  BellOutlined,
  DeleteOutlined,
  EditOutlined,
  RobotOutlined,
} from '../components/ui/icon';
import { QuickReminderModal } from '../components/common/QuickReminderModal';
import { useAIChat } from '../context/AIChatContext';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { deleteTaskWithAllocations } from '../db/repositories/cascadeRepo';
import type { Task } from '../types/models';

/**
 * Single owner of the task context/action menu (QRN-01): TaskTable, CR detail
 * and CR Explorer all render the same items, confirm and cascade delete.
 */
export function useTaskMenuItems({
  db,
  onOpenDrawer,
  onDeleted,
}: {
  db?: TaskPlannerDatabase | undefined;
  onOpenDrawer: (taskId: string) => void;
  onDeleted?: (taskId: string) => void;
}) {
  const { token } = useAntdToken();
  const message = useMessage();
  const { modal, contextHolder } = useTaskMateModal();
  const { openChat } = useAIChat();
  const [reminderTargetTask, setReminderTargetTask] = useState<Task | null>(null);

  const getTaskMenuItems = (record: Task): NonNullable<MenuProps['items']> => [
    {
      key: 'ai-chat',
      icon: <RobotOutlined style={{ color: token.colorPrimary }} />,
      label: 'Hỏi Trợ lý AI',
      onClick: () => {
        openChat({ type: 'task', id: record.id, title: record.name });
      },
    },
    {
      key: 'add-reminder',
      icon: <BellOutlined style={{ color: '#faad14' }} />,
      label: 'Thêm nhắc nhở',
      onClick: () => setReminderTargetTask(record),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa tác vụ',
      onClick: () => onOpenDrawer(record.id),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      danger: true,
      label: 'Xóa',
      onClick: () => {
        modal.confirm({
          title: 'Xóa tác vụ',
          content: `Bạn có chắc muốn xóa "${record.name}"?`,
          okText: 'Xóa',
          cancelText: 'Hủy',
          okButtonProps: { danger: true },
          onOk: async () => {
            const effectiveDb = db ?? defaultDb;
            if (!effectiveDb) return;
            try {
              await deleteTaskWithAllocations(record.id, effectiveDb);
              onDeleted?.(record.id);
              message.success({ content: 'Đã xóa tác vụ', duration: 1.5 });
            } catch {
              message.error({ content: 'Không thể xóa tác vụ', duration: 2 });
            }
          },
        });
      },
    },
  ];

  const reminderModal = reminderTargetTask ? (
    <QuickReminderModal
      open
      onClose={() => setReminderTargetTask(null)}
      target={{ type: 'task', entity: reminderTargetTask }}
      db={db}
    />
  ) : null;

  return { getTaskMenuItems, reminderTargetTask, setReminderTargetTask, reminderModal, modal, contextHolder };
}
