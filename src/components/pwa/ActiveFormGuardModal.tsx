import React from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface ActiveFormGuardModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog preventing uncommitted data loss when reloading during active form edits (D-02, UI-SPEC § 2).
 */
export const ActiveFormGuardModal: React.FC<ActiveFormGuardModalProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  return (
    <Modal
      title={
        <Space align="center">
          <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <span>Cảnh báo: Dữ liệu chưa lưu</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width={480}
      footer={[
        <Button key="cancel" type="default" onClick={onCancel} autoFocus>
          Quay lại lưu dữ liệu
        </Button>,
        <Button key="confirm" type="primary" danger onClick={onConfirm}>
          Bỏ qua và Tải lại
        </Button>,
      ]}
      destroyOnClose
    >
      <Text style={{ fontSize: 14 }}>
        Bạn đang mở một biểu mẫu chỉnh sửa. Nếu tải lại trang để cập nhật ngay bây giờ, các thay
        đổi chưa lưu sẽ bị mất.
      </Text>
    </Modal>
  );
};
