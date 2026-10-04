import React, { useMemo } from 'react';
import { Typography } from 'antd';
import { OrderedListOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
}

export interface DocOutlineToCProps {
  markdown: string;
  onHeadingClick?: (heading: HeadingItem) => void;
}

export const DocOutlineToC: React.FC<DocOutlineToCProps> = ({
  markdown,
  onHeadingClick,
}) => {
  const headings = useMemo<HeadingItem[]>(() => {
    if (!markdown) return [];

    const items: HeadingItem[] = [];
    const lines = markdown.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match && match[1] && match[2]) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = `heading-${i}-${text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}`;
        items.push({ id, level, text });
      }
    }

    return items;
  }, [markdown]);

  if (headings.length === 0) {
    return (
      <div style={{ padding: 12, color: '#8c8c8c', fontSize: 12, textAlign: 'center' }}>
        Chưa có mục lục (thêm các thẻ #, ##, ###)
      </div>
    );
  }

  const handleClick = (item: HeadingItem) => {
    if (onHeadingClick) {
      onHeadingClick(item);
      return;
    }

    // Default smooth scroll to heading text
    const elements = document.querySelectorAll('h1, h2, h3');
    for (const el of Array.from(elements)) {
      if (el.textContent?.trim().includes(item.text)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  };

  return (
    <div className="doc-outline-toc" style={{ padding: '8px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
        <OrderedListOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
        <Text strong style={{ fontSize: 12, color: '#595959' }}>
          Mục lục
        </Text>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {headings.map((item, idx) => {
          const indent = (item.level - 1) * 12 + 4;
          return (
            <div
              key={`${item.id}-${idx}`}
              role="button"
              tabIndex={0}
              onClick={() => handleClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(item);
                }
              }}
              style={{
                paddingLeft: indent,
                paddingRight: 4,
                paddingTop: 3,
                paddingBottom: 3,
                fontSize: item.level === 1 ? 13 : 12,
                fontWeight: item.level === 1 ? 600 : 400,
                color: item.level === 1 ? '#262626' : '#595959',
                cursor: 'pointer',
                borderRadius: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.color = '#4f46e5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = item.level === 1 ? '#262626' : '#595959';
              }}
            >
              {item.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
