import type { DividerProps as AntDividerProps } from 'antd';
import type { CSSProperties } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type DividerProps = AntDividerProps;

/** Token-derived metric for the divider rail; caller style still wins. */
function dividerStyle(): CSSProperties {
  const { fontSize, paddingInline } = getSharedControlTokens();
  return {
    '--ui-divider-font-size': `${fontSize}px`,
    '--ui-divider-gap': paddingInline,
  } as CSSProperties;
}

/** Single swap point for AntD Divider. */
export function Divider({ style, children, orientation, type, dashed, className, ...rest }: DividerProps) {
  const vertical = orientation === 'vertical';
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={className}
      style={{
        ...dividerStyle(),
        display: vertical ? 'inline-flex' : 'flex',
        alignItems: 'center',
        margin: vertical ? '0 8px' : '8px 0',
        font: 'var(--ui-divider-font-size) / 1.4 inherit',
        color: 'var(--fg-secondary)',
        ...(vertical
          ? { width: 1, alignSelf: 'stretch', background: dashed ? 'none' : 'var(--border)', borderLeft: dashed ? '1px dashed var(--border)' : undefined }
          : { width: '100%', borderTop: dashed ? '1px dashed var(--border)' : '1px solid var(--border)' }),
        ...style,
      }}
      data-oi-control="divider"
      data-state={type ?? 'horizontal'}
      {...(rest as object)}
    >
      {children !== undefined && <span style={{ whiteSpace: 'nowrap' }}>{children}</span>}
    </div>
  );
}
