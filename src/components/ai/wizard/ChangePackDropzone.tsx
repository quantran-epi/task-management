import React, { useRef, useState } from 'react';
import { InboxOutlined } from '@ant-design/icons';
import { theme } from 'antd';

export interface ChangePackDropzoneProps {
  onSelect: (file: File) => void;
}

export const ChangePackDropzone: React.FC<ChangePackDropzoneProps> = ({ onSelect }) => {
  const { token } = theme.useToken();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const openPicker = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onSelect(file);
          event.currentTarget.value = '';
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Khu vực nạp change-pack"
        aria-pressed={dragging}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onSelect(file);
        }}
        style={{
          alignItems: 'center',
          background: dragging ? token.colorPrimaryBg : token.colorBgContainer,
          border: `1px dashed ${dragging ? token.colorPrimary : token.colorBorder}`,
          borderRadius: token.borderRadius,
          color: token.colorText,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          justifyContent: 'center',
          minHeight: 112,
          padding: 16,
          textAlign: 'center',
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
