import { Alert, Button, Result, Space, Spin, Typography } from 'antd';
import type { PublishPrimaryState } from '../../types/models';

const { Text } = Typography;

export interface PublishProgressPanelProps {
  status: PublishPrimaryState;
  stage?: string;
  uncertain?: boolean;
  conflict?: boolean;
  error?: string;
  onOpenStatus?: () => void;
  onClose: () => void;
}

export function PublishProgressPanel({ status, stage, uncertain, conflict, error, onOpenStatus, onClose }: PublishProgressPanelProps) {
  if (status === 'Failed') {
    return (
      <Result
        status="error"
        title="Xuất bản thất bại. Ảnh chụp trước vẫn đang hoạt động."
        subTitle={error}
        extra={<Button onClick={onClose}>Đóng</Button>}
      />
    );
  }
  if (status === 'In sync') {
    return (
      <Result
        status="success"
        title="Đã xuất bản bộ tài liệu."
        subTitle="Bộ tài liệu đã được đồng bộ với Knowledge Server."
        extra={<Button onClick={onClose}>Đóng</Button>}
      />
    );
  }
  if (status === 'Local changes') {
    return (
      <Result
        status="success"
        title="Đã xuất bản bộ tài liệu."
        subTitle="Lần xuất bản vừa hoàn tất dùng ảnh chụp trước chỉnh sửa mới nhất."
        extra={<Button onClick={onClose}>Đóng</Button>}
      />
    );
  }
  if (status === 'Warning') {
    return (
      <Result
        status="warning"
        title="Xuất bản có cảnh báo."
        subTitle={error ?? 'Kiểm tra cảnh báo hoặc vấn đề vận hành trên Knowledge Server.'}
        extra={<Button onClick={onClose}>Đóng</Button>}
      />
    );
  }
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space><Spin /><Text strong>Đang xuất bản</Text></Space>
      <Text>Đang xuất bản ảnh chụp đã xác nhận. Bạn có thể tiếp tục chỉnh sửa tài liệu.</Text>
      <Text>{stage ?? 'Đang xử lý trên máy chủ'}</Text>
      {uncertain && <Alert type="warning" showIcon message="Mất kết nối — chưa xác định kết quả." description="PlannerMate sẽ đối chiếu lại khi có mạng." />}
      {conflict && <Alert type="warning" showIcon message="Bộ tài liệu này đang được xuất bản. Mở trạng thái hiện tại để theo dõi." action={<Button onClick={onOpenStatus}>Mở trạng thái</Button>} />}
      <Text type="secondary">Đóng bảng không hủy tiến trình trên máy chủ.</Text>
      <Button onClick={onClose}>Đóng</Button>
    </Space>
  );
}
