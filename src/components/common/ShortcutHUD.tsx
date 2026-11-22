import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Input, Typography, Tag, Space, useAntdToken } from '../ui';
import { SearchOutlined, CompassOutlined, AppstoreOutlined, CheckSquareOutlined, FileTextOutlined } from '../ui/icon';
import type { ShortcutItem, ShortcutCategory } from '../../types/shortcuts';
import { formatShortcutKeys } from '../../utils/keyboard';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

const { Text } = Typography;

export interface ShortcutHUDProps {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutItem[];
  currentRoute?: string;
}

const CATEGORY_ICONS: Record<ShortcutCategory, React.ReactNode> = {
  navigation: <CompassOutlined />,
  global: <AppstoreOutlined />,
  tasks: <CheckSquareOutlined />,
  notes: <FileTextOutlined />,
};

export const ShortcutHUD: React.FC<ShortcutHUDProps> = ({
  open,
  onClose,
  shortcuts,
  currentRoute,
}) => {
  const { token } = useAntdToken();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<any>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter shortcuts: match query and relevant scope
  const filteredShortcuts = useMemo(() => {
    const q = foldForSearch(query);
    return shortcuts.filter((item) => {
      // If item has a specific scope and doesn't match currentRoute, skip unless searching
      if (item.scope && currentRoute && item.scope !== currentRoute && !q) {
        return false;
      }
      if (!q) return true;
      const titleMatch = searchIncludes(item.title, q);
      const descMatch = searchIncludes(item.description, q);
      const catMatch = searchIncludes(item.categoryLabel, q);
      const keyMatch = item.keys.some((k) => searchIncludes(k, q));
      const keywordMatch = item.keywords?.some((kw) => searchIncludes(kw, q));
      return titleMatch || descMatch || catMatch || keyMatch || keywordMatch;
    });
  }, [shortcuts, query, currentRoute]);

  // Reset index when query changes or opened
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  // Autofocus search on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Auto scroll to selected item
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>(`[data-shortcut-index="${selectedIndex}"]`);
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Key navigation inside HUD modal
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredShortcuts.length > 0 ? (prev + 1) % filteredShortcuts.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredShortcuts.length > 0 ? (prev - 1 + filteredShortcuts.length) % filteredShortcuts.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredShortcuts[selectedIndex];
      if (target) {
        onClose();
        target.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleExecute = (item: ShortcutItem) => {
    onClose();
    item.action();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={580}
      destroyOnHidden
      styles={{
        body: {
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
        },
      }}
    >
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Input
          ref={inputRef}
          prefix={<SearchOutlined style={{ color: token.colorTextSecondary, marginRight: 6 }} />}
          placeholder="Tìm phím tắt hoặc hành động... (Dùng ↑ ↓ để chọn, Enter để chạy)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="borderless"
          style={{
            fontSize: 15,
            padding: 0,
          }}
        />
      </div>

      <div
        ref={listRef}
        style={{
          maxHeight: 400,
          overflowY: 'auto',
          padding: '8px 8px 12px',
        }}
      >
        {filteredShortcuts.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: token.colorTextSecondary }}>
            Không tìm thấy phím tắt phù hợp
          </div>
        ) : (
          filteredShortcuts.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const displayKeys = formatShortcutKeys(item.keys);

            return (
              <div
                key={item.id}
                data-shortcut-index={idx}
                onClick={() => handleExecute(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: token.borderRadiusSM,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? token.controlItemBgActive : 'transparent',
                  transition: 'background-color 0.1s ease',
                  marginBottom: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-10)', minWidth: 0, flex: 1, paddingRight: 12 }}>
                  <span style={{ color: token.colorTextSecondary, fontSize: 14 }}>
                    {CATEGORY_ICONS[item.category] || <AppstoreOutlined />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
                      <Text strong style={{ fontSize: 'var(--font-size-ui)' }}>
                        {item.title}
                      </Text>
                      <Tag
                        bordered={false}
                        style={{
                          fontSize: 10.5,
                          lineHeight: '16px',
                          padding: '0 5px',
                          margin: 0,
                          backgroundColor: token.colorFillAlter,
                          color: token.colorTextTertiary,
                        }}
                      >
                        {item.categoryLabel}
                      </Tag>
                    </div>
                    {item.description && (
                      <div
                        style={{
                          fontSize: 'var(--font-size-small)',
                          color: token.colorTextSecondary,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 2,
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>

                <Space size={4} orientation="horizontal" style={{ flexShrink: 0 }}>
                  {displayKeys.map((k, keyIdx) => (
                    <kbd
                      key={keyIdx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 22,
                        height: 22,
                        padding: '0 6px',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        color: token.colorText,
                        backgroundColor: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                        borderRadius: 4,
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </Space>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: token.colorFillAlter,
          fontSize: 'var(--font-size-xs)',
          color: token.colorTextTertiary,
        }}
      >
        <Space size={14}>
          <span>
            <kbd style={{ padding: '0 4px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 3, background: token.colorBgContainer }}>↑</kbd>{' '}
            <kbd style={{ padding: '0 4px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 3, background: token.colorBgContainer }}>↓</kbd> Di chuyển
          </span>
          <span>
            <kbd style={{ padding: '0 4px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 3, background: token.colorBgContainer }}>↵</kbd> Thực hiện
          </span>
          <span>
            <kbd style={{ padding: '0 4px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 3, background: token.colorBgContainer }}>Esc</kbd> Đóng
          </span>
        </Space>
        <span>Giữ <b>Alt</b> hoặc bấm <b>Shift + ?</b> để mở</span>
      </div>
    </Modal>
  );
};
