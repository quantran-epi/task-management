import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Button,
  Segmented,
  Alert,
  Spin,
  Space,
  Typography,
  Input,
} from 'antd';
import {
  RobotOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  SplitCellsOutlined,
  EyeOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getNineRouterConfig,
  getNineRouterApiKey,
} from '../../services/ai/nineRouterTokenService';
import { streamChatCompletion } from '../../services/ai/nineRouterClient';
import { AI_KNOWLEDGE_DOC_PROMPT } from '../../views/NotesView';
import { renderSafeMarkdown } from '../../utils/markdown';

const { Text } = Typography;
const { TextArea } = Input;

export interface NormalizeDocModalProps {
  open: boolean;
  originalContent: string;
  docTitle?: string;
  onClose: () => void;
  onApply: (normalizedMarkdown: string) => void;
  db?: TaskPlannerDatabase;
}

export type NormalizeViewMode = 'split' | 'preview' | 'edit';

export const NormalizeDocModal: React.FC<NormalizeDocModalProps> = ({
  open,
  originalContent,
  docTitle,
  onClose,
  onApply,
  db = defaultDb,
}) => {
  const [proposedContent, setProposedContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<NormalizeViewMode>('split');

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    onClose();
  };

  const startNormalization = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setProposedContent('');
    setIsStreaming(true);

    try {
      const apiKey = await getNineRouterApiKey(db);
      if (!apiKey || !apiKey.trim()) {
        setError('Chưa cấu hình API Key. Vui lòng mở Cài đặt AI để thiết lập API Key.');
        setIsStreaming(false);
        return;
      }

      const config = await getNineRouterConfig(db);
      const userPrompt = `Hãy chuẩn hóa nội dung ghi chú/tài liệu sau đây vào đúng cấu trúc khung chuẩn Markdown đã hướng dẫn. Giữ lại toàn bộ thông tin quan trọng, từ khóa và dữ liệu thực tế, bổ sung các mục còn thiếu (hoặc để placeholder hợp lý) theo đúng định dạng. Chỉ trả về nội dung Markdown kết quả, không viết thêm lời dẫn chào hay giải thích ngoài lề.\n\nNội dung hiện tại:\n"""\n${originalContent}\n"""`;

      const stream = streamChatCompletion({
        endpoint: config.endpoint,
        apiKey,
        signal: controller.signal,
        payload: {
          model: config.defaultModel,
          messages: [
            { role: 'system', content: AI_KNOWLEDGE_DOC_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        },
      });

      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk;
        setProposedContent(accumulated);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        // Normal abort
        return;
      }
      setError(err?.message || 'Lỗi trong quá trình chuẩn hóa tài liệu qua AI');
    } finally {
      setIsStreaming(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (open) {
      startNormalization();
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
      setProposedContent('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, originalContent]);

  const handleAccept = () => {
    if (!proposedContent.trim()) return;
    onApply(proposedContent);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <RobotOutlined style={{ color: '#0284c7' }} />
          <span>AI Chuẩn hóa tài liệu {docTitle ? `("${docTitle}")` : ''}</span>
        </Space>
      }
      width={980}
      onCancel={handleCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isStreaming && (
              <Space>
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  AI đang chuẩn hóa cấu trúc...
                </Text>
              </Space>
            )}
          </div>
          <Space>
            <Button icon={<CloseOutlined />} onClick={handleCancel}>
              Hủy
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={startNormalization}
              disabled={isStreaming}
            >
              Tạo lại
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleAccept}
              disabled={isStreaming || !proposedContent.trim()}
              style={{ backgroundColor: '#0284c7' }}
            >
              Chấp nhận
            </Button>
          </Space>
        </div>
      }
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 480 }}>
        {error && (
          <Alert
            type="warning"
            showIcon
            message="Không thể chuẩn hóa qua AI"
            description={error}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chuyển đổi tài liệu hiện tại theo cấu trúc BM25/AI Knowledge chuẩn.
          </Text>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(val) => setViewMode(val as NormalizeViewMode)}
            options={[
              { value: 'split', icon: <SplitCellsOutlined />, label: 'So sánh 2 cột' },
              { value: 'preview', icon: <EyeOutlined />, label: 'Xem trước kết quả' },
              { value: 'edit', icon: <EditOutlined />, label: 'Chỉnh sửa kết quả' },
            ]}
          />
        </div>

        {/* Content Views */}
        {viewMode === 'split' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              height: 480,
            }}
          >
            {/* Column 1: Original */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: 600,
                  fontSize: 12,
                  color: '#4b5563',
                }}
              >
                Nội dung gốc
              </div>
              <div
                style={{
                  flex: 1,
                  padding: 12,
                  overflowY: 'auto',
                  fontSize: 13,
                  lineHeight: 1.6,
                  backgroundColor: '#fafafa',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                }}
              >
                {originalContent || <Text type="secondary">(Không có nội dung)</Text>}
              </div>
            </div>

            {/* Column 2: Proposed */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #bae6fd',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f0f9ff',
                  borderBottom: '1px solid #bae6fd',
                  fontWeight: 600,
                  fontSize: 12,
                  color: '#0369a1',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Đề xuất chuẩn hóa từ AI</span>
                {isStreaming && <Spin size="small" />}
              </div>
              <div
                style={{
                  flex: 1,
                  padding: 12,
                  overflowY: 'auto',
                  fontSize: 13,
                  lineHeight: 1.6,
                  backgroundColor: '#ffffff',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                }}
              >
                {proposedContent || (
                  <Text type="secondary">
                    {isStreaming ? 'Đang tạo nội dung...' : '(Chưa có đề xuất)'}
                  </Text>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'preview' && (
          <div
            style={{
              height: 480,
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: 16,
              backgroundColor: '#ffffff',
            }}
          >
            {proposedContent ? (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html: renderSafeMarkdown(proposedContent),
                }}
              />
            ) : (
              <Text type="secondary">
                {isStreaming ? 'Đang xử lý nội dung chuẩn hóa...' : '(Chưa có nội dung để xem trước)'}
              </Text>
            )}
          </div>
        )}

        {viewMode === 'edit' && (
          <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
            <TextArea
              value={proposedContent}
              onChange={(e) => setProposedContent(e.target.value)}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                resize: 'none',
              }}
              placeholder="Bạn có thể chỉnh sửa nội dung đề xuất tại đây trước khi áp dụng..."
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
