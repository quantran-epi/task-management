import { Alert, Button, Result, Space, Spin, Typography } from 'antd';
import type { PublishPrimaryState } from '../../types/models';

const { Text } = Typography;

export interface AtomicBlockErrorDetails {
  code?: string;
  blockType?: string;
  line?: number;
  column?: number;
  limit?: number;
}

export function formatOversizedAtomicBlockError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const details = error as AtomicBlockErrorDetails;
  const hasMetadata =
    typeof details.blockType === 'string' &&
    typeof details.line === 'number' &&
    typeof details.column === 'number';
  if (details.code !== 'OVERSIZED_ATOMIC_BLOCK' && !hasMetadata) return undefined;

  const blockType = ['code', 'table', 'blockquote'].includes(details.blockType ?? '')
    ? details.blockType
    : 'Markdown';
  const line = typeof details.line === 'number' && Number.isSafeInteger(details.line) && details.line > 0 ? details.line : 1;
  const column = typeof details.column === 'number' && Number.isSafeInteger(details.column) && details.column > 0 ? details.column : 1;
  const limit = typeof details.limit === 'number' && Number.isSafeInteger(details.limit) && details.limit > 0 ? details.limit : 50_000;
  return `Khối ${blockType} vượt quá giới hạn an toàn ${limit.toLocaleString('en-US')} ký tự tại dòng ${line}, cột ${column}. Vui lòng chia nhỏ khối trước khi xuất bản.`;
}

export interface PublishProgressPanelProps {
  status: PublishPrimaryState;
  stage?: string;
  uncertain?: boolean;
  conflict?: boolean;
  error?: string | AtomicBlockErrorDetails;
  onOpenStatus?: () => void;
  onClose: () => void;
}

export function PublishProgressPanel({ status, stage, uncertain, conflict, error, onOpenStatus, onClose }: PublishProgressPanelProps) {
  if (status === 'Failed') {
    const errorDescription = formatOversizedAtomicBlockError(error) ?? (typeof error === 'string' ? error : undefined);
    return (
      <Result
        status="error"
        title="Xuất bản thất bại. Ảnh chụp trước vẫn đang hoạt động."
        subTitle={errorDescription}
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
        subTitle={typeof error === 'string' ? error : 'Kiểm tra cảnh báo hoặc vấn đề vận hành trên Knowledge Server.'}
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
