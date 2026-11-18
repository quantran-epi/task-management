import React from 'react';
import logoUrl from '../assets/logo.svg';

export interface TaskMateLogoProps {
  size?: number | string | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
}

export const TaskMateLogo: React.FC<TaskMateLogoProps> = ({
  size = 24,
  className,
  style,
}) => {
  return (
    <img
      src={logoUrl}
      alt="TaskMate"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        objectFit: 'contain',
        ...style,
      }}
    />
  );
};

export default TaskMateLogo;
