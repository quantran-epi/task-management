import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Space, Typography, Tag, Modal, Popconfirm, message } from 'antd';
import { BookOutlined, SaveOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getGlobalConventions,
  saveGlobalConventions,
  clearGlobalConventions,
} from '../../services/conventionService';
import { renderSafeMarkdown } from '../../utils/markdown';

const { Paragraph, Text } = Typography;
const { TextArea } = Input;

export interface GlobalConventionsCardProps {
  db?: TaskPlannerDatabase;
}

const PLACEHOLDER_GUIDE = `# Tiêu chuẩn Kỹ thuật Tổ chức

## 1. Kiến trúc & Thiết kế API
- Tuân thủ RESTful API conventions và JSON response contract.
- Mọi API endpoint phải có validation ở trust boundary.

## 2. Quy ước Logging & Error Handling
- Ghi log có cấu trúc (structured logging) kèm requestId.
- Không log các thông tin nhạy cảm (token, mật khẩu, PII).

## 3. Tiêu chuẩn Kiểm thử
- Unit test tối thiểu cho toàn bộ business logic.
- Không bỏ qua kiểm thử biên (edge cases).`;

export const GlobalConventionsCard: React.FC<GlobalConventionsCardProps> = ({ db = defaultDb }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    void getGlobalConventions(db)
      .then((val) => {
        if (active) {
          setContent(val);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          message.error(err?.message || 'Không thể tải quy ước tổ chức');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [db]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = content.trim();
      await saveGlobalConventions(trimmed, db);
      setContent(trimmed);
      message.success('Đã lưu quy ước tổ chức thành công');
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu quy ước tổ chức');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearGlobalConventions(db);
      setContent('');
      message.success('Đã xóa trắng quy ước tổ chức');
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa quy ước tổ chức');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void handleSave();
    }
  };

  const lineCount = content.trim() ? content.split('\n').length : 0;
  const charCount = content.length;
  const isConfigured = content.trim().length > 0;

  return (
    <Card
      title={
        <Space size={8}>
          <BookOutlined style={{ color: '#3871e1' }} />
          <span>Quy ước tổ chức (Global Conventions)</span>
          {isConfigured ? (
            <Tag color="success">Đã cấu hình</Tag>
          ) : (
            <Tag color="default">Chưa thiết lập</Tag>
          )}
        </Space>
      }
      loading={loading}
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Tài liệu chuẩn kỹ thuật chung cho toàn bộ dự án. Được lưu an toàn trong IndexedDB và tự động đồng bộ qua backup mã hóa.
      </Paragraph>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={8}>
          <Button
            icon={<EyeOutlined />}
            size="small"
            onClick={() => setPreviewOpen(true)}
            aria-label="Xem trước Markdown"
          >
            Xem trước Markdown
          </Button>
        </Space>

        <Text type="secondary" style={{ fontSize: 12 }}>
          {charCount} ký tự · {lineCount} dòng (Nhấn Ctrl+S / ⌘S để lưu)
        </Text>
      </div>

      <TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER_GUIDE}
        autoSize={{ minRows: 10, maxRows: 24 }}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 14,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
        aria-label="Nội dung quy ước tổ chức Markdown"
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Popconfirm
          title="Xác nhận xóa trắng quy ước?"
          description="Bạn có chắc chắn muốn xóa toàn bộ nội dung Quy ước tổ chức không? Thao tác này sẽ xóa dữ liệu khỏi IndexedDB và file backup."
          onConfirm={handleClear}
          okText="Xác nhận xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={!isConfigured}
            aria-label="Xóa trắng quy ước"
          >
            Xóa trắng quy ước
          </Button>
        </Popconfirm>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          style={{ backgroundColor: '#3871e1' }}
          onClick={handleSave}
          loading={saving}
          aria-label="Lưu quy ước tổ chức"
        >
          Lưu quy ước tổ chức
        </Button>
      </div>

      <Modal
        title="Xem trước Quy ước tổ chức (Markdown)"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={<Button onClick={() => setPreviewOpen(false)}>Đóng</Button>}
        width={760}
      >
        <div
          style={{ maxHeight: '60vh', overflowY: 'auto', padding: '8px 0' }}
          dangerouslySetInnerHTML={{
            __html: renderSafeMarkdown(content || '_Chưa có nội dung quy ước nào được lưu._'),
          }}
        />
      </Modal>
    </Card>
  );
};
