import React from 'react';
import { Modal, Button, Typography } from 'antd';
import { ShareAltOutlined, PlusSquareOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface IosInstallModalProps {
  open: boolean;
  onClose: () => void;
}

export const IosInstallModal: React.FC<IosInstallModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      title="Cài đặt trên iOS Safari"
      open={open}
      onCancel={onClose}
      centered
      width={440}
      destroyOnClose
      footer={[
        <Button key="confirm" type="primary" onClick={onClose} block>
          Đã hiểu
        </Button>,
      ]}
    >
      <div style={{ paddingTop: 12, paddingBottom: 12 }}>
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Để cài đặt ứng dụng vào màn hình chính trên iPhone hoặc iPad, vui lòng làm theo các bước sau trong trình duyệt Safari:
        </Paragraph>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#e6f4ff',
                color: '#1677ff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              1
            </span>
            <Text>
              Nhấn vào nút <Text strong>Chia sẻ</Text> (biểu tượng <ShareAltOutlined style={{ color: '#1677ff' }} /> hộp có mũi tên hướng lên) ở thanh điều hướng dưới cùng của Safari.
            </Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#e6f4ff',
                color: '#1677ff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              2
            </span>
            <Text>
              Cuộn danh sách xuống và chọn <Text strong>'Thêm vào MH chính'</Text> (<PlusSquareOutlined style={{ color: '#1677ff' }} /> Add to Home Screen).
            </Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#e6f4ff',
                color: '#1677ff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              3
            </span>
            <Text>
              Nhấn <Text strong>'Thêm'</Text> (Add) ở góc trên bên phải để hoàn tất.
            </Text>
          </div>
        </div>
      </div>
    </Modal>
  );
};
