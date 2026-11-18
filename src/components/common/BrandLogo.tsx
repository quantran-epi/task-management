import React from 'react';
import { TaskMateLogo } from '../TaskMateLogo';

export interface BrandLogoProps {
  size?: number | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 28, className, style }) => {
  return (
    <TaskMateLogo
      size={size}
      className={className}
      style={{
        borderRadius: Math.round(size * 0.25),
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.18)',
        ...style,
      }}
    />
  );
};

