import React from 'react';

export interface BrandLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 28, className, style }) => {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px -1px rgba(79, 70, 229, 0.35)',
        ...style,
      }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.65)}
        height={Math.round(size * 0.65)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="3"
          fill="#ffffff"
          fillOpacity="0.2"
        />
        <rect
          x="4"
          y="5"
          width="16"
          height="14"
          rx="2.5"
          fill="#ffffff"
        />
        <path
          d="M4 9H20"
          stroke="#eef2ff"
          strokeWidth="1.5"
        />
        <path
          d="M8 2.5V5.5M16 2.5V5.5"
          stroke="#4338ca"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8.5 13.5L10.5 15.5L15.5 10.5"
          stroke="#4f46e5"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
