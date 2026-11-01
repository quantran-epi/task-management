import React, { useRef, useState } from 'react';
import { InboxOutlined } from '@ant-design/icons';
import { theme } from 'antd';

export interface ChangePackDropzoneProps {
  onSelect: (file: File) => void;
  /** Blocks pointer, keyboard, and drag/drop intake at the input layer (D-20). */
  disabled?: boolean;
}

export const ChangePackDropzone: React.FC<ChangePackDropzoneProps> = ({ onSelect, disabled = false }) => {
  const { token } = theme.useToken();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };
  const block = (event: React.SyntheticEvent) => {
    if (!disabled) return false;
    event.preventDefault();
    return true;
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file && !disabled) onSelect(file);
          event.currentTarget.value = '';
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Khu vực nạp change-pack"
        aria-pressed={dragging}
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          if (!block(event)) openPicker();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (block(event)) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled) return;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (disabled) return;
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (disabled) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onSelect(file);
        }}
        style={{
          alignItems: 'center',
          background: disabled
            ? token.colorBgContainerDisabled
            : dragging
              ? token.colorPrimaryBg
              : token.colorBgContainer,
          border: `1px dashed ${dragging ? token.colorPrimary : token.colorBorder}`,
          borderRadius: token.borderRadius,
          color: disabled ? token.colorTextDisabled : token.colorText,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          justifyContent: 'center',
          minHeight: 112,
          padding: 16,
          textAlign: 'center',
          outline: focused && !disabled ? `2px solid ${token.colorPrimary}` : 'none',
          outlineOffset: 2,
        }}
      >
        <InboxOutlined aria-hidden style={{ color: dragging ? token.colorPrimary : token.colorTextSecondary, fontSize: 24 }} />
        <span style={{ fontSize: 14, lineHeight: 1.5 }}>
          {dragging ? 'Thả change-pack.zip để nạp.' : 'Kéo thả change-pack.zip vào đây hoặc bấm để chọn tệp.'}
        </span>
      </div>
    </>
  );
};
