import React, { useMemo } from 'react';
import { Typography } from '../ui';
import { OrderedListOutlined } from '../ui/icon';

const { Text } = Typography;

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  lineIndex?: number | undefined;
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
        items.push({ id, level, text, lineIndex: i });
      }
    }

    return items;
  }, [markdown]);

  if (headings.length === 0) {
    return (
      <div style={{ padding: 12, color: 'var(--fg-secondary)', fontSize: 'var(--font-size-small)', textAlign: 'center' }}>
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
      <div className="doc-outline-toc__title">
        <OrderedListOutlined style={{ fontSize: 'var(--font-size-small)' }} />
        <Text strong>Mục lục</Text>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)' }}>
        {headings.map((item, idx) => {
          const indent = (item.level - 1) * 12 + 4;
          return (
            <div
              key={`${item.id}-${idx}`}
              className={`doc-outline-toc__item${item.level === 1 ? '' : ' doc-outline-toc__item--sub'}`}
              role="button"
              tabIndex={0}
              onClick={() => handleClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(item);
                }
              }}
              style={{ paddingLeft: indent }}
            >
              {item.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
