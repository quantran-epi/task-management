import React from 'react';
import { CalendarOutlined, ClockCircleOutlined, CodeOutlined, DiffOutlined, ExperimentOutlined, FieldTimeOutlined, FileTextOutlined, FormatPainterOutlined, KeyOutlined, LinkOutlined, SafetyCertificateOutlined } from '../../components/ui/icon';
import type { EditorViewType } from '../store/layoutStore';

export interface UtilityTool {
  id: string;
  title: string;
  description: string;
  viewType: EditorViewType;
  icon: (size?: number) => React.ReactNode;
  category?: string;
}

/** Registry — thêm tool tiện ích mới chỉ cần khai báo ở đây + view trong UtilityToolPanel. */
export const UTILITY_TOOLS: UtilityTool[] = [
  {
    id: 'json_formatter',
    title: 'JSON Formatter',
    description: 'Format, minify và kiểm tra JSON',
    viewType: 'json_formatter',
    icon: (size = 16) => <span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{'{}'}</span>,
    category: 'Format & Transform',
  },
  {
    id: 'xml_formatter',
    title: 'XML Formatter',
    description: 'Format, minify và kiểm tra XML',
    viewType: 'xml_formatter',
    icon: (size = 16) => <CodeOutlined style={{ fontSize: size }} />,
    category: 'Format & Transform',
  },
  {
    id: 'text_compare',
    title: 'Text Compare',
    description: 'So sánh text theo dòng hoặc từ',
    viewType: 'text_compare',
    icon: (size = 16) => <DiffOutlined style={{ fontSize: size }} />,
    category: 'Format & Transform',
  },
  {
    id: 'markdown_viewer',
    title: 'Markdown Viewer',
    description: 'Soạn Markdown và xem trước',
    viewType: 'markdown_viewer',
    icon: (size = 16) => <FileTextOutlined style={{ fontSize: size }} />,
    category: 'Format & Transform',
  },
  {
    id: 'text_utilities',
    title: 'Text Utilities',
    description: 'Đổi case, sắp xếp và đếm text',
    viewType: 'text_utilities',
    icon: (size = 16) => <FormatPainterOutlined style={{ fontSize: size }} />,
    category: 'Format & Transform',
  },
  {
    id: 'encoder_decoder',
    title: 'Encoder/Decoder',
    description: 'Mã hóa và giải mã Base64, URL, HTML',
    viewType: 'encoder_decoder',
    icon: (size = 16) => <LinkOutlined style={{ fontSize: size }} />,
    category: 'Encode & Decode',
  },
  {
    id: 'jwt_decoder',
    title: 'JWT Decoder',
    description: 'Xem header/payload JWT — không verify chữ ký',
    viewType: 'jwt_decoder',
    icon: (size = 16) => <SafetyCertificateOutlined style={{ fontSize: size }} />,
    category: 'Encode & Decode',
  },
  {
    id: 'regex_tester',
    title: 'Regex Tester',
    description: 'Thử regex và xem nhóm bắt được',
    viewType: 'regex_tester',
    icon: (size = 16) => <ExperimentOutlined style={{ fontSize: size }} />,
    category: 'Developer Utilities',
  },
  {
    id: 'cron_expression',
    title: 'Cron Expression',
    description: 'Giải thích cron và xem các lần chạy',
    viewType: 'cron_expression',
    icon: (size = 16) => <FieldTimeOutlined style={{ fontSize: size }} />,
    category: 'Developer Utilities',
  },
  {
    id: 'timestamp_converter',
    title: 'Timestamp Converter',
    description: 'Đổi timestamp sang ngày và ngược lại',
    viewType: 'timestamp_converter',
    icon: (size = 16) => <ClockCircleOutlined style={{ fontSize: size }} />,
    category: 'Date & Time',
  },
  {
    id: 'date_calculation',
    title: 'Date Calculation',
    description: 'Cộng trừ ngày và tính hiệu ngày',
    viewType: 'date_calculation',
    icon: (size = 16) => <CalendarOutlined style={{ fontSize: size }} />,
    category: 'Date & Time',
  },
  {
    id: 'hash_uuid',
    title: 'Hash & UUID',
    description: 'Hash SHA local và tạo UUID',
    viewType: 'hash_uuid',
    icon: (size = 16) => <KeyOutlined style={{ fontSize: size }} />,
    category: 'Crypto & Tokens',
  },
];
