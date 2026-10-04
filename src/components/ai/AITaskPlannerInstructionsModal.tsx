import React from 'react';
import { Modal, Typography, Tabs, Tag, Alert, theme, Space } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  BranchesOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface AITaskPlannerInstructionsModalProps {
  open: boolean;
  onClose: () => void;
}

export const AITaskPlannerInstructionsModal: React.FC<AITaskPlannerInstructionsModalProps> = ({
  open,
  onClose,
}) => {
  const { token } = theme.useToken();

  const tabItems = [
    {
      key: 'shortcuts',
      label: 'Cú pháp nhanh (@, #, /)',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 8 }}>
          <Paragraph>
            Trợ lý AI PlannerMate hỗ trợ các ký tự gợi ý trực tiếp ngay trong thanh nhập tin nhắn:
          </Paragraph>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
            }}
          >
            <Space align="start" style={{ marginBottom: 12 }}>
              <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>@ Task</Tag>
              <div>
                <Text strong>Đính kèm tác vụ vào ngữ cảnh</Text>
                <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                  Gõ <code>@</code> và tên task để gắn thẻ tác vụ cụ thể vào tin nhắn. AI sẽ tự động đọc chi tiết task (tiến độ, hạn chót, checklist, dự án) để trả lời hoặc thao tác.
                </div>
              </div>
            </Space>

            <Space align="start" style={{ marginBottom: 12 }}>
              <Tag color="purple" style={{ fontSize: 13, padding: '2px 8px' }}># Project</Tag>
              <div>
                <Text strong>Đính kèm dự án vào ngữ cảnh</Text>
                <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                  Gõ <code>#</code> và tên dự án để cung cấp ngữ cảnh toàn dự án cùng các mốc (milestone) liên quan cho AI.
                </div>
              </div>
            </Space>

            <Space align="start">
              <Tag color="green" style={{ fontSize: 13, padding: '2px 8px' }}>/ Lệnh</Tag>
              <div>
                <Text strong>Các lệnh thực thi nhanh</Text>
                <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                  Gõ <code>/</code> để chọn các lệnh thao tác tức thì mà không cần gõ câu hỏi dài.
                </div>
              </div>
            </Space>
          </div>

          <Alert
            type="info"
            showIcon
            message="Phím tắt gửi tin nhắn"
            description="Nhấn Cmd + Enter (macOS) hoặc Ctrl + Enter (Windows) để gửi tin nhắn nhanh chóng."
          />
        </Space>
      ),
    },
    {
      key: 'commands',
      label: 'Lệnh Slash Commands',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 8 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 10,
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <CalendarOutlined style={{ color: '#1677ff' }} />
                <Text code strong style={{ fontSize: 14 }}>/plan</Text>
                <Text strong>Lập kế hoạch trong ngày</Text>
              </div>
              <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                AI phân tích công việc cần làm, deadline và sức chứa (capacity) để gợi ý phân bổ thời gian hợp lý nhất cho hôm nay.
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text code strong style={{ fontSize: 14 }}>/status</Text>
                <Text strong>Báo cáo tiến độ hiện tại</Text>
              </div>
              <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                Tổng hợp nhanh tình trạng các dự án, tác vụ đang mở, thời gian đã log trong ngày hoặc tuần này.
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <ClockCircleOutlined style={{ color: '#faad14' }} />
                <Text code strong style={{ fontSize: 14 }}>/overdue</Text>
                <Text strong>Cảnh báo tác vụ quá hạn & sắp đến hạn</Text>
              </div>
              <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                Quét toàn bộ tác vụ để cảnh báo những việc trễ deadline hoặc cần ưu tiên giải quyết ngay.
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text code strong style={{ fontSize: 14 }}>/clear</Text>
                <Text strong>Làm mới ngữ cảnh</Text>
              </div>
              <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                Xóa lịch sử hội thoại hiện tại để bắt đầu phiên làm việc mới với ngữ cảnh hoàn toàn sạch.
              </div>
            </div>
          </div>
        </Space>
      ),
    },
    {
      key: 'mutations',
      label: 'Thao tác dữ liệu & Tự động duyệt',
      children: (
        <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 8 }}>
          <Paragraph>
            Trợ lý AI sở hữu đầy đủ công cụ quản lý cơ sở dữ liệu PlannerMate: tạo mới task, cập nhật trạng thái, phân bổ giờ, ghi chú, tạo checklist, và ghi nhật ký công việc (worklog).
          </Paragraph>

          <Alert
            type="warning"
            showIcon
            icon={<ThunderboltOutlined />}
            message="Chế độ Tự động duyệt (Auto-Approve Mutations)"
            description={
              <div>
                <p style={{ margin: '4px 0' }}>
                  Có thể bật/tắt chế độ này trong menu tùy chọn của thanh tiêu đề:
                </p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li>
                    <Text strong>Đang TẮT (Mặc định):</Text> AI hiển thị bản xem trước thay đổi và yêu cầu bạn nhấn duyệt trước khi ghi vào dữ liệu.
                  </li>
                  <li>
                    <Text strong>Đang BẬT (Biểu tượng sét vàng):</Text> AI tự động thực thi ngay các thay đổi theo yêu cầu của bạn và gửi báo cáo chi tiết kết quả.
                  </li>
                </ul>
              </div>
            }
          />

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <BranchesOutlined style={{ color: token.colorPrimary }} />
              <Text strong>Nguyên tắc chống ảo giác (Anti-Hallucination)</Text>
            </div>
            <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
              AI PlannerMate tuân thủ nguyên tắc grounded data nghiêm ngặt: mọi phản hồi đều truy vấn trực tiếp từ cơ sở dữ liệu IndexedDB của bạn. Nếu một dữ liệu không tồn tại, AI sẽ báo rõ ràng thay vì tự ý bịa đặt.
            </div>
          </div>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RobotOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
          <span>Hướng dẫn sử dụng AI Task Planner</span>
        </div>
      }
      styles={{
        body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 },
      }}
    >
      <Tabs defaultActiveKey="shortcuts" items={tabItems} />
    </Modal>
  );
};
