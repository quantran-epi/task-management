import React from 'react';
import { PanelResizeHandle } from 'react-resizable-panels';

export interface WorkbenchResizeHandleProps {
  direction?: 'horizontal' | 'vertical';
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const WorkbenchResizeHandle: React.FC<WorkbenchResizeHandleProps> = ({
  direction = 'horizontal',
  id,
  className = '',
  style,
}) => {
  return (
    <PanelResizeHandle
      {...(id ? { id } : {})}
      {...(style ? { style } : {})}
      data-direction={direction}
      className={`workbench-resize-handle ${className}`}
    />
  );
};
