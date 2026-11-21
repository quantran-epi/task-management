import React from 'react';
import { CodeOutlined, DiffOutlined, FileTextOutlined } from '../../components/ui/icon';
import type { EditorViewType } from '../store/layoutStore';

export interface UtilityTool {
  id: string;
  title: string;
  description: string;
  viewType: EditorViewType;
  icon: (size?: number) => React.ReactNode;
}

/** Registry — thêm tool tiện ích mới chỉ cần khai báo ở đây + view trong UtilityToolPanel. */
export const UTILITY_TOOLS: UtilityTool[] = [
  {
    id: 'json_formatter',
    title: 'JSON Formatter',
    description: 'Format, minify và kiểm tra JSON',
    viewType: 'json_formatter',
    icon: (size = 16) => <span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{'{}'}</span>,
  },
  {
    id: 'xml_formatter',
    title: 'XML Formatter',
    description: 'Format, minify và kiểm tra XML',
    viewType: 'xml_formatter',
    icon: (size = 16) => <CodeOutlined style={{ fontSize: size }} />,
  },
  {
    id: 'text_compare',
    title: 'Text Compare',
    description: 'So sánh text theo dòng hoặc từ',
    viewType: 'text_compare',
    icon: (size = 16) => <DiffOutlined style={{ fontSize: size }} />,
  },
  {
    id: 'markdown_viewer',
    title: 'Markdown Viewer',
    description: 'Soạn Markdown và xem trước',
    viewType: 'markdown_viewer',
    icon: (size = 16) => <FileTextOutlined style={{ fontSize: size }} />,
  },
];
